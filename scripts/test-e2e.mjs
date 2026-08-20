/*
 * 브라우저 E2E 회귀 테스트 (Playwright)
 * 실행: node scripts/test-e2e.mjs      (npm run test:e2e)
 *
 * 왜 필요한가
 *   나머지 test-*.mjs는 전부 "데이터와 순수 함수"를 본다. jsdom으로 정적 HTML을 로드하거나
 *   lib/*.ts를 직접 임포트하는 방식이라, React 페이지(/, /admin, /search)의 실제 렌더링·
 *   인증 게이트·네트워크 요청은 아무도 검사하지 않았다. 실제로 이 구멍 때문에
 *     ① 관리자 인증이 localStorage에 영구 저장돼 비밀번호가 무력화된 상태로 배포됐고
 *     ② 건조기 셀링포인트에 사실이 아닌 문구가 남은 채 배포됐다(가드가 on만 봤다)
 *   둘 다 사람이 브라우저로 열어보고 나서야 발견했다. 그 확인을 CI가 대신하게 한다.
 *
 * 이 스크립트는 프로덕션 빌드를 띄워서 검사한다(개발 서버가 아니라 실제 배포 형태).
 * 빌드 산출물(.next)이 없으면 먼저 `npm run build`를 돌린다.
 */
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = process.env.E2E_PORT || 3210;
const BASE = `http://127.0.0.1:${PORT}`;

let ok = true;
const fail = (msg) => { console.log('ERROR:', msg); ok = false; };
const pass = (msg) => console.log('OK:', msg);

// ── Playwright 준비 ──
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('SKIP: playwright 미설치 — `npm i -D playwright` 후 다시 실행하세요.');
  process.exit(0);
}

/*
 * ── 프로덕션 빌드 ──
 * **소스가 빌드보다 새로우면 다시 빌드한다.** 예전에는 `.next` 가 있기만 하면 그대로 띄웠는데,
 * 그러면 화면을 고친 뒤 E2E 를 돌려도 **옛 화면을 검사하고 통과한다** — 검사가 통째로 거짓이
 * 된다(2026-08-11 실제로 그랬다. 새로 만든 화면이 안 나오는데 ALL PASS 가 떴다).
 * CI 는 매번 새 체크아웃이라 안 걸리고 **로컬에서만 조용히 낡는다.**
 */
function newestSource() {
  let t = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else t = Math.max(t, fs.statSync(f).mtimeMs);
    }
  };
  for (const d of ['app', 'components', 'lib', 'public']) {
    const p = path.join(root, d);
    if (fs.existsSync(p)) walk(p);
  }
  return t;
}
const buildId = path.join(root, '.next', 'BUILD_ID');
const stale = fs.existsSync(buildId) && fs.statSync(buildId).mtimeMs < newestSource();
if (!fs.existsSync(buildId) || stale) {
  console.log(stale ? '· 소스가 .next 보다 새로움 → npm run build' : '· .next 빌드 없음 → npm run build');
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
}

// ── 서버 기동 ──
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  cwd: root, stdio: 'ignore', detached: process.platform !== 'win32', shell: process.platform === 'win32',
});
const stopServer = () => {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(server.pid), '/t', '/f']);
    else process.kill(-server.pid, 'SIGKILL');
  } catch {}
};
process.on('exit', stopServer);

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
});

try {
/*
 * **개발중인 서비스는 비밀번호를 묻지 않는다**(2026-08-17 사용자 요청).
 *
 * 한때 `/place` 가 `DevGate` 뒤에 있어 검사가 세션 값을 미리 넣고 지나갔다. 지금은
 * 자물쇠가 없으므로 그 우회를 지운다 — **남겨 두면 잠금이 되살아나도 검사가 조용히
 * 통과해** 아무것도 못 지킨다(이 저장소가 "검사가 앱을 못 따라가 무력해진다"로 여러 번
 * 데인 종류다). 대신 아래에서 **비밀번호 칸 없이 도구가 뜨는지**를 직접 본다.
 */

  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  /*
   * **지점을 미리 고른 기기로 검사한다**(2026-08-20). 첫 접속 지점 모달이 화면을 덮어
   * 기존 검사가 전부 클릭을 못 하게 된다 — 매장 태블릿은 처음 한 번만 고르고 그 뒤로는
   * 고른 상태이므로, **평소 상태**로 보는 것이 맞다.
   * 첫 접속 자체는 아래에서 **새 컨텍스트**로 따로 확인한다.
   */
  await ctx.addInitScript(() => { try { sessionStorage.setItem('axhub_store', 'ZN01'); } catch (e) {} });
  const page = await ctx.newPage();

  // 서버가 뜰 때까지 대기
  let up = false;
  for (let i = 0; i < 60; i++) {
    try { await page.goto(BASE, { timeout: 2000 }); up = true; break; }
    catch { await page.waitForTimeout(1000); }
  }
  if (!up) { fail('next start 서버가 기동하지 않음'); throw new Error('server down'); }

  // 페이지별 콘솔 오류를 모은다 — 렌더는 됐는데 스크립트가 죽는 경우를 잡기 위함.
  // 일부러 404를 요청하는 구간에서는 수집을 잠시 끈다(콘솔 메시지에는 요청 URL이 남지 않아
  // 문자열 필터로는 구분할 수 없다).
  const errors = [];
  const badResponses = [];
  let collecting = true;
  page.on('pageerror', (e) => { if (collecting) errors.push(`${page.url()} :: ${e.message}`); });
  page.on('console', (m) => {
    if (!collecting || m.type() !== 'error') return;
    // "Failed to load resource"는 어떤 URL이 실패했는지 담고 있지 않다. 아래 response 리스너가
    // 실제 URL과 함께 따로 수집하므로 여기서는 버린다(같은 사건이 두 번 세지는 것도 방지).
    if (/Failed to load resource/.test(m.text())) return;
    errors.push(`${page.url()} :: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (collecting && r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
  });

  // ── 1. 허브 메인 ──
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  {
    const title = await page.textContent('header');
    // 이름은 '세일즈 코파일럿'이다(2026-08-10 변경). 저장소·Vercel 프로젝트명만 옛 이름을 쓴다.
    if (!title || !title.includes('세일즈 코파일럿')) fail('허브 메인 헤더가 렌더되지 않음');
    else pass('허브 메인 렌더');

    // 허브 메인 페이지뷰는 집계 왜곡을 막기 위해 기록하지 않아야 한다
    const hubViews = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('axhub_logs') || '[]')
        .filter((e) => e.module === 'hub' && e.action === 'page_view').length);
    if (hubViews !== 0) fail(`허브 진입만으로 hub page_view가 ${hubViews}건 기록됨 — 집계에서 제외 대상이다`);
    else pass('허브 메인이 페이지뷰 로그를 남기지 않음');
  }

  // ── 2. 모듈 페이지가 iframe까지 정상 로드되는지 ──
  for (const [route, marker] of [
    ['/finder', 'finder-app.html'],
    ['/compare', 'compare-app.html'],
    ['/install', 'install-app.html'],
    ['/care', 'care-app.html'],
    ['/test', 'test-app.html'],
    ['/quiz', 'quiz-app.html'],
    ['/place', 'place-app.html'],
    ['/as', 'as-app.html'],
    ['/poster', 'poster-app.html'],
  ]) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    const src = await page.getAttribute('iframe', 'src');
    if (!src || !src.includes(marker)) { fail(`${route}: iframe src가 ${marker}가 아님 (${src})`); continue; }
    // iframe 내부가 실제로 그려졌는지 — body에 내용이 있어야 한다
    const inner = await page.frameLocator('iframe').locator('body').innerText().catch(() => '');
    if (!inner || inner.trim().length < 20) fail(`${route}: iframe 내용이 비어 있음`);
  }
  pass('9개 모듈 페이지 iframe 로드');

  /* ── 2-0. 개발중 도구는 비밀번호 없이 열리되, 개발중이라고 말한다 (2026-08-17) ──
   *
   * 사용자 요청으로 `/place` 의 자물쇠를 풀었다. 자물쇠를 없애면 **그 화면이 지고 있던
   * 경고**("값이 바뀔 수 있으니 고객에게 그대로 읽지 마세요")까지 함께 사라져, 상담사가
   * 완성된 도구로 오해한다 — 잠갔던 이유가 접근 차단이 아니라 그것이었다. 그래서 둘을
   * 함께 본다: **비밀번호를 묻지 않는가** · **개발중이라고 적혀 있는가.**
   *
   * 세션이 깨끗한 새 창으로 본다 — 앞의 검사가 무언가를 풀어 놓았을 수 있다.
   */
  {
    const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const fp = await fresh.newPage();
    await fp.goto(BASE + '/place', { waitUntil: 'domcontentloaded' });
    await fp.waitForTimeout(1200);
    const pw = await fp.locator('input[type=password]').count();
    const hasFrame = await fp.locator('iframe').count();
    const body = (await fp.locator('body').innerText().catch(() => '')) || '';
    /*
     * **자물쇠 그림도 없어야 한다**(2026-08-17 사용자 요청). 비밀번호를 안 묻는데
     * 자물쇠가 그려져 있으면 상담사가 **열어 보지도 않는다** — 화면이 사실과 다른 말을
     * 하는 셈이다. 그 자리에는 반대로 **써 보고 아이디어를 달라는 부탁**이 온다.
     */
    const lockPlace = await fp.locator('[data-icon="lock"]').count();
    await fp.goto(BASE + '/dev', { waitUntil: 'domcontentloaded' });
    await fp.waitForTimeout(600);
    const lockDev = await fp.locator('[data-icon="lock"]').count();
    const devBody = (await fp.locator('body').innerText().catch(() => '')) || '';

    if (pw) fail('/place 가 아직 비밀번호를 묻는다 — 비밀번호 없이 확인할 수 있어야 한다');
    else if (!hasFrame) fail('/place 에 도구가 뜨지 않는다');
    else if (!/개발중/.test(body)) {
      fail('/place 에 개발중 표시가 없다 — 자물쇠를 풀면서 경고까지 사라지면 완성된 도구로 읽힌다');
    } else if (lockPlace || lockDev) {
      fail(`개발중 칸에 자물쇠가 남아 있다 (/place ${lockPlace}개 · /dev ${lockDev}개) — 안 묻는데 그려 두면 상담사가 열어 보지 않는다`);
    } else if (!/아이디어/.test(devBody) || !/아이디어/.test(body)) {
      fail('개발중 칸이 아이디어를 보내 달라고 말하지 않는다 — 자물쇠를 걷어낸 자리에 올 말이다');
    } else pass('개발중 도구 — 비밀번호·자물쇠 없이 열리고, 써 보고 아이디어를 달라고 말한다');
    await fresh.close();
  }

  /* ── 2-a. 폰에서 가로로 새지 않는가 — **미니앱 안쪽까지** ──
   *
   * 페이지 바깥만 재던 검사로는 못 잡는다. 배치 시뮬레이터의 목록 서랍이 닫힌 채
   * `position:absolute` + `translateX(100%)` 로 화면 밖에 서 있어서, 그 자리가 그대로
   * 스크롤 영역이 되어 **폰에서 늘 가로 300px 이 남았다**(360·390px 실측).
   * 도면을 손가락으로 미는 도구라 그 여백이 팬 조작과 섞여 화면이 흔들린다.
   *
   * 포스터는 **인쇄용 A4 고정 폭**이라 폰에서 넘치는 것이 설계대로다 — 뺀다.
   */
  {
    const nb = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const np = await nb.newPage();
    const over = [];
    for (const route of ['/finder', '/compare', '/install', '/care', '/as', '/place', '/quiz', '/test']) {
      await np.goto(BASE + route, { waitUntil: 'domcontentloaded' });
      await np.waitForTimeout(1800);
      const r = await np.evaluate(() => {
        const de = document.documentElement;
        const out = { outer: de.scrollWidth - de.clientWidth, inner: 0 };
        const f = document.querySelector('iframe');
        if (f && f.contentDocument) {
          const d2 = f.contentDocument.documentElement;
          out.inner = d2.scrollWidth - d2.clientWidth;
        }
        return out;
      });
      if (r.outer > 0 || r.inner > 0) over.push(`${route}(바깥 ${r.outer} · 안 ${r.inner})`);
    }
    if (over.length) fail(`폰 390px 에서 가로로 샌다: ${over.join(' · ')}`);
    else pass('폰 390px 가로 넘침 없음 — 미니앱 안쪽까지 8개 화면');
    await nb.close();
  }

  /* ── 2-b. 하단 바로가기 · 헤더 공유 · three.js 지연 (2026-08-11) ── */
  {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mp = await m.newPage();
    await mp.goto(BASE, { waitUntil: 'networkidle' });

    // 순서는 사용자가 정한 그대로여야 한다
    const labels = await mp.evaluate(() => {
      const nav = [...document.querySelectorAll('nav')].find((n) => n.className.includes('bottom-0'));
      return [...nav.querySelectorAll('a')].map((a) => a.textContent.trim());
    });
    /* 배치 시뮬레이터는 2026-08-17 에 '개발중인 서비스'(사이드바 최하단, 잠금)로 내려가
       하단 바로가기에서 빠졌다 — 잠긴 도구를 하단 탭에 두면 눌러도 비밀번호만 뜬다. */
    const want = ['허브', '통합검색', '제품 상담 도구', '교육', 'AS 관련 정보'];
    if (JSON.stringify(labels) !== JSON.stringify(want)) fail(`하단 바로가기 순서가 다르다 — ${labels.join(' · ')}`);
    else pass(`하단 바로가기 순서 (${labels.join(' · ')})`);

    /* 분류 탭은 **허브에 있는 상태에서 눌러도** 그 섹션이 펼쳐져야 한다.
       Next 의 <Link> 는 해시만 다른 이동에서 hashchange 를 일으키지 않아 접힌 채였다. */
    for (const [label, id] of [['제품 상담 도구', 'tools'], ['교육', 'edu']]) {
      await mp.goto(BASE, { waitUntil: 'networkidle' });
      const before = await mp.evaluate((id) => document.getElementById(id).innerText.replace(/\s+/g, '').length, id);
      await mp.evaluate((label) => {
        const nav = [...document.querySelectorAll('nav')].find((n) => n.className.includes('bottom-0'));
        [...nav.querySelectorAll('a')].find((a) => a.textContent.trim() === label).click();
      }, label);
      await mp.waitForTimeout(900);
      const after = await mp.evaluate((id) => document.getElementById(id).innerText.replace(/\s+/g, '').length, id);
      if (after <= before) fail(`'${label}' 탭을 눌러도 섹션이 안 펼쳐진다 (${before} → ${after}자)`);
      else pass(`'${label}' 탭 → 섹션 펼침 (${before} → ${after}자)`);
    }

    /*
     * 공유 아이콘 — **미니앱 화면에서는 언제나 뜬다**(2026-08-12).
     * 공유가 "지금 화면을 그대로 찍는 것"으로 바뀌었으므로 볼 화면이 곧 공유할 것이다.
     * (요약 카드를 만들던 시절에는 "만들 것이 있을 때만" 보였다.)
     */
    /*
     * **`/compare` 를 목록에 넣은 것이 2026-08-13 이다.** 그 앱만 share-kit.js 를 싣지 않아
     * 헤더와 주고받는 `share-state` 에 답하지 못했고, 아이콘이 끝내 안 떴다 — 검사 목록에
     * 없어서 아무도 몰랐다. 대신 있던 자체 PNG 저장은 CDN html2canvas 에 걸려 있어
     * 매장 전파가 약하면 그것도 안 됐다. 고객에게 비교 결과를 보여주는 것이 존재 이유인
     * 앱에서 결과를 남길 길이 하나도 없었던 셈이다.
     */
    const hdr = () => mp.evaluate(() => !!document.querySelector('header button[aria-label="이 화면 공유하기"]'));
    let miss = [];
    /*
     * **외부 도메인 자원도 같은 순회에서 함께 본다.** 매장 전파가 약해도 열려야 해서
     * three.js·html2canvas 를 vendor 로 받아 두는 앱이다. CDN 한 줄이 섞여 들어가면
     * 그 기능만 조용히 죽는다 — 타사비교가 실제로 그랬다.
     * **글꼴도 2026-08-14 부터 우리 도메인이라 예외가 없다** — 한 건이라도 나오면 실패다.
     */
    const scanExt = () => mp.evaluate(() => {
      const out = [];
      for (const f of document.querySelectorAll('iframe')) {
        let d; try { d = f.contentDocument; } catch (e) { continue; }
        if (!d) continue;
        for (const el of d.querySelectorAll('script[src],link[rel="stylesheet"]')) {
          const u = el.src || el.href || '';
          if (/^https?:\/\//.test(u) && !u.startsWith(location.origin)) out.push(u);
        }
      }
      return out;
    });
    /*
     * **글꼴은 "받았는가"가 아니라 "실제로 그려지는가"를 본다.**
     * 앱마다 부르는 이름이 갈린다 — as·care·poster 는 `Pretendard`, compare·install·finder 는
     * `Pretendard Variable`. 자체 호스팅 CSS 가 한 이름만 선언하면 **나머지가 조용히 시스템
     * 글꼴로 떨어지는데 화면에는 아무 표시도 안 난다.**
     *
     * **`document.fonts.check` 를 쓰면 안 된다** — 그 자리에 **설치된 시스템 글꼴**이 있어도
     * 참을 낸다. 개발 PC 에 Pretendard 가 깔려 있어서, 별칭을 통째로 지우고 돌려도 통과했다
     * (실제로 확인함). 매장 폰에는 그 글꼴이 없으므로 그 검사는 아무것도 지키지 못한다.
     * 그래서 **CSS 가 그 이름을 선언했는가**를 `document.fonts` 목록에서 직접 센다.
     */
    const fontOK = () => mp.evaluate(async () => {
      const f = document.querySelector('iframe');
      const d = f && f.contentDocument, w = f && f.contentWindow;
      if (!d || !w || !w.document.fonts) return { skip: true };
      try { await w.document.fonts.ready; } catch (e) { /* 준비 실패는 아래에서 거짓으로 잡힌다 */ }
      const fam = w.getComputedStyle(d.body).fontFamily || '';
      const want = /Pretendard Variable/i.test(fam) ? 'Pretendard Variable' : 'Pretendard';
      const declared = new Set();
      w.document.fonts.forEach((ff) => declared.add(String(ff.family).replace(/^['"]|['"]$/g, '')));
      return { want, fam: fam.slice(0, 60), ok: declared.has(want), declared: [...declared] };
    });

    const shareApps = ['/as', '/install', '/finder', '/care', '/compare'];
    const extBad = [], fontBad = [], fontSeen = [];
    for (const path of shareApps) {
      await mp.goto(BASE + path, { waitUntil: 'networkidle' });
      await mp.waitForTimeout(1500);
      if (!(await hdr())) miss.push(path);
      for (const u of await scanExt()) extBad.push(path + ' → ' + u);
      const fr = await fontOK();
      if (fr.skip) continue;
      fontSeen.push(`${path} ${fr.want}`);
      if (!fr.ok) fontBad.push(`${path} — 본문이 "${fr.fam}" 인데 "${fr.want}" 가 안 실렸다`);
    }
    if (miss.length) fail(`미니앱에서 공유 아이콘이 안 뜬다: ${miss.join(', ')}`);
    else pass(`헤더 공유 아이콘 — 미니앱 ${shareApps.length}곳에서 항상 표시`);
    if (extBad.length) fail(`미니앱이 외부 도메인 자원을 부른다(전파가 끊기면 죽는다): ${extBad.join(' / ')}`);
    else pass('외부 도메인 자원 0건 — 글꼴까지 전부 우리 도메인');
    if (fontBad.length) fail(`글꼴이 실리지 않는다: ${fontBad.join(' / ')}`);
    else pass(`글꼴이 실제로 실린다 — ${fontSeen.join(' · ')}`);

    /* 눌렀을 때 화면 전체가 한 장으로 담기는가 — 보이는 부분만 찍으면 안 된다 */
    await mp.goto(BASE + '/as', { waitUntil: 'networkidle' });
    await mp.waitForTimeout(1600);
    await mp.evaluate(() => {
      const w = document.querySelector('iframe').contentWindow;
      w.__blob = null;
      const orig = w.URL.createObjectURL.bind(w.URL);
      w.URL.createObjectURL = (b) => { w.__blob = b; return orig(b); };
      if (w.navigator.share) w.navigator.share = () => Promise.reject(new Error('no share'));
    });
    await mp.evaluate(() => document.querySelector('header button[aria-label="이 화면 공유하기"]').click());
    await mp.waitForFunction(() => !!document.querySelector('iframe').contentWindow.__blob, { timeout: 40000 })
      .catch(() => {});
    const shot = await mp.evaluate(async () => {
      const w = document.querySelector('iframe').contentWindow;
      if (!w.__blob) return null;
      const img = await w.createImageBitmap(w.__blob);
      const pageH = Math.max(w.document.body.scrollHeight, w.document.documentElement.scrollHeight);
      return { w: img.width, h: img.height, pageH, vh: w.innerHeight };
    });
    if (!shot) fail('공유를 눌러도 이미지가 만들어지지 않는다');
    else if (shot.h < shot.pageH * 0.95) fail(`화면 일부만 찍혔다 — ${shot.h}px (화면 길이 ${shot.pageH}px)`);
    else pass(`공유 → 화면 전체 한 장 (${shot.w}×${shot.h}px · 화면 길이 ${shot.pageH}px · 보이는 ${shot.vh}px)`);

    /*
     * **가장 긴 화면** — AS 연락처의 묶음을 전부 펼치면 폰 폭에서 15,000px 을 넘는다.
     * 브라우저 캔버스는 한 변이 **16,384px** 을 넘으면 그린 것이 통째로 사라지는데,
     * 넓이(1,200만 픽셀)만 보고 배율을 잡던 시절 실제로 **21,634px** 짜리를 만들어
     * 빈 그림이 나갈 뻔했다(2026-08-12). 배율이 1배 밑으로 내려가더라도 **전체가
     * 담기고 한 변이 한도 안**이어야 한다.
     */
    await mp.goto(BASE + '/as', { waitUntil: 'networkidle' });
    await mp.waitForTimeout(1600);
    await mp.evaluate(() => {
      const w = document.querySelector('iframe').contentWindow;
      w.setTab && w.setTab('contact');
      w.document.querySelectorAll('details.grp').forEach((d) => (d.open = true));
      w.__blob = null;
      const orig = w.URL.createObjectURL.bind(w.URL);
      w.URL.createObjectURL = (b) => { w.__blob = b; return orig(b); };
      if (w.navigator.share) w.navigator.share = () => Promise.reject(new Error('no share'));
    });
    await mp.waitForTimeout(900);
    await mp.evaluate(() => document.querySelector('header button[aria-label="이 화면 공유하기"]').click());
    await mp.waitForFunction(() => !!document.querySelector('iframe').contentWindow.__blob, { timeout: 90000 })
      .catch(() => {});
    const long = await mp.evaluate(async () => {
      const w = document.querySelector('iframe').contentWindow;
      if (!w.__blob) return null;
      const img = await w.createImageBitmap(w.__blob);
      const pageH = Math.max(w.document.body.scrollHeight, w.document.documentElement.scrollHeight);
      return { w: img.width, h: img.height, pageH };
    });
    const LIMIT = 16384;
    if (!long) fail('가장 긴 화면에서 이미지가 만들어지지 않는다');
    else if (long.h > LIMIT || long.w > LIMIT) fail(`캔버스 한 변이 한도를 넘었다 — ${long.w}×${long.h}px (빈 그림이 나간다)`);
    else if (long.h < long.pageH * 0.95 && long.h < LIMIT * 0.97) fail(`긴 화면이 잘렸다 — ${long.h}px (화면 길이 ${long.pageH}px)`);
    else pass(`공유 → 가장 긴 화면도 한 장 (${long.w}×${long.h}px · 화면 길이 ${long.pageH}px · 한 변 한도 ${LIMIT}px 이내)`);

    // three.js 는 3D 를 켤 때만 받는다
    const got = [];
    mp.on('response', (r) => { if (/three\.module/.test(r.url())) got.push(r.url()); });
    await mp.goto(BASE + '/place', { waitUntil: 'networkidle' });
    await mp.waitForTimeout(1500);
    if (got.length) fail(`/place 를 열기만 했는데 three.js 를 ${got.length}회 받았다`);
    else pass('three.js 는 /place 를 열 때 받지 않는다 (3D 를 켤 때 받는다)');
    await m.close();
  }

  // ── 3. 관리자 인증 게이트 ──
  // 예전 방식(localStorage 영구 저장)으로 열려 있던 기기를 흉내 내 접속해도 잠겨 있어야 한다.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('ax_admin_unlocked', '1'));
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  {
    const gate = await page.$('input[type=password]');
    if (!gate) fail('레거시 키가 있는 기기에서 /admin이 인증 없이 열림 — 비밀번호가 무력화된다');
    else pass('레거시 통과 기기에서도 인증 게이트 표시');

    const legacyCleared = await page.evaluate(() => localStorage.getItem('ax_admin_unlocked') === null);
    if (!legacyCleared) fail('레거시 인증 키(ax_admin_unlocked)가 정리되지 않음');
    else pass('레거시 인증 키 정리');

    if (gate) {
      await page.fill('input[type=password]', 'definitely-not-the-password');
      await page.click('button:has-text("입장하기")');
      await page.waitForTimeout(900);
      const stillLocked = await page.$('input[type=password]');
      if (!stillLocked) fail('틀린 비밀번호로 대시보드가 열림');
      else pass('오답 시 잠김 유지');
    }
    // 인증 상태가 localStorage에 영구 저장되면 안 된다
    const persisted = await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.startsWith('ax_admin_unlocked')));
    if (persisted) fail('인증 상태가 localStorage에 저장됨 — 브라우저를 닫아도 잠기지 않는다');
    else pass('인증 상태가 localStorage에 남지 않음');
  }

  // ── 4. 통합검색 — 경량 인덱스만 먼저, 상세는 펼칠 때 ──
  {
    const fetched = [];
    const onRes = (r) => {
      const p = new URL(r.url()).pathname;
      if (/^\/search-(index|detail)\.json$/.test(p)) fetched.push(p);
    };
    page.on('response', onRes);

    await page.goto(BASE + '/search?q=냉장고', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);

    if (!fetched.includes('/search-index.json')) fail('검색 진입 시 경량 인덱스를 받지 않음');
    else if (fetched.includes('/search-detail.json')) {
      fail('검색 진입만으로 상세 인덱스까지 받음 — 첫 로딩량을 줄인 의미가 없다');
    } else pass('검색 진입 시 경량 인덱스만 로드');

    const btn = await page.$('button:has-text("상세 ▼")');
    if (!btn) fail('검색 결과에 "상세 ▼" 버튼이 없음');
    else {
      await btn.click();
      await page.waitForTimeout(1500);
      if (!fetched.includes('/search-detail.json')) fail('"상세 ▼"를 눌러도 상세 인덱스를 받지 않음');
      else pass('상세 펼칠 때 상세 인덱스 지연 로드');

      const rows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
      if (rows < 3) fail(`상세 스펙 표가 ${rows}행 — 지연 로드한 데이터가 반영되지 않았다`);
      else pass(`상세 스펙 표 렌더 (${rows}행)`);
    }
    page.off('response', onRes);
  }

  // ── 4-b. 배치 시뮬레이터: 도면 업로드 → 축척 보정 ──
  // 이 경로는 파일 업로드와 canvas 좌표가 얽혀 있어 jsdom으로 검사할 수 없다.
  // 실제로 두 번 막혔던 지점이라 브라우저에서 지킨다:
  //   ① 도면이 화면보다 크게 그려져 치수선 한쪽 끝을 클릭할 수 없었다
  //   ② 축척 확정 후 단계 표시는 "벽 그리기"인데 모드가 idle이라 클릭이 먹지 않았다
  {
    const fixture = path.join(os.tmpdir(), 'e2e-plan.svg');
    fs.writeFileSync(fixture,
      '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100">' +
      '<rect width="1600" height="1100" fill="#fff"/>' +
      '<line x1="200" y1="100" x2="1400" y2="100" stroke="#c00" stroke-width="3"/></svg>');

    await page.goto(BASE + '/place', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const f = page.frameLocator('iframe');
    await f.locator('#file').setInputFiles(fixture);
    await page.waitForTimeout(900);

    const st = await page.evaluate(() => {
      const w = document.querySelector('iframe').contentWindow;
      const r = w.document.querySelector('#cv').getBoundingClientRect();
      return { ...w.__place.state, cw: r.width, ch: r.height, mode: w.__place.state.mode };
    });
    // 1,600×1,100 도면이 캔버스 안에 들어와야 한다
    if (st.imgW * st.zoom > st.cw + 1 || st.imgH * st.zoom > st.ch + 1) {
      fail(`업로드한 도면이 캔버스를 넘어감 (${(st.imgW * st.zoom).toFixed(0)}×${(st.imgH * st.zoom).toFixed(0)} > ${st.cw.toFixed(0)}×${st.ch.toFixed(0)}) — 치수선 끝을 클릭할 수 없다`);
    } else pass('도면 업로드 시 화면에 맞춰 표시');
    /*
     * **업로드 직후는 이제 `detect` 다.** 예전에는 곧장 치수선 두 점 클릭 모드(`scale`)로
     * 보냈는데, 두 점 보정은 벽과 벽을 정밀하게 눌러야 해서 손가락으로는 어긋나고
     * 분양 도면 중 치수가 인쇄된 것도 8%뿐이다. 지금은 방을 자동 인식해 "가장 긴 벽의
     * 실제 길이"만 묻는다. 이 픽스처는 선 하나뿐이라 인식이 실패하고 detect 로 남는다.
     */
    if (st.mode !== 'detect') fail(`업로드 후 모드가 ${st.mode} (기대 detect — 자동 인식을 시도한다)`);
    else pass('업로드 직후 자동 인식 시도 (치수선 클릭 모드로 보내지 않는다)');

    /*
     * 치수선이 인쇄된 도면을 위한 두 점 보정은 **길이 입력 막대 안**에서 들어간다
     * (2026-08-12 도구막대 정리 — 치수가 인쇄된 도면이 8%뿐이라 늘 띄워 둘 손잡이가
     * 아니고, 치수를 실제로 보고 있는 그 순간에만 필요하다).
     * 여기서 그 경로가 살아 있는지 함께 확인한다 — 끊기면 그 8%가 갈 곳이 없어진다.
     */
    /*
     * 화면에서 들어가는 길은 **길이 입력 막대의 '치수선 두 점으로'** 다. 그 손잡이가
     * 실제로 붙어 있는지는 진짜 도면으로 흐름을 밟는 `test-plans` 가 검사한다
     * (여기 합성 도면은 초안 단계가 이 스위트의 검사 대상이 아니라 흐름이 다르다).
     * 여기서는 **두 점 보정 자체가 살아 있는지**를 본다 — 치수가 인쇄된 8% 도면이
     * 갈 곳이라, 화면 정리로 이 기능이 통째로 죽는 일이 없어야 한다.
     */
    await f.locator('#btn-scale').dispatchEvent('click');
    await page.waitForTimeout(300);
    const md = await page.evaluate(() => document.querySelector('iframe').contentWindow.__place.state.mode);
    if (md !== 'scale') fail(`'축척 맞추기'를 눌렀는데 모드가 ${md} (기대 scale)`);

    // 치수선 두 끝(이미지 200,100 ~ 1400,100 = 1,200px)을 클릭해 6,000mm로 확정 → 1px = 5mm
    const cvbox = await f.locator('#cv').boundingBox();
    const sx = (ix) => ix * st.zoom + st.panX, sy = (iy) => iy * st.zoom + st.panY;
    await f.locator('#cv').click({ position: { x: sx(200), y: sy(100) } });
    await page.waitForTimeout(150);
    await f.locator('#cv').click({ position: { x: sx(1400), y: sy(100) } });
    await page.waitForTimeout(500);
    await f.locator('#mm').fill('6000');
    await f.locator('#sheet .primary').click();
    await page.waitForTimeout(500);

    const after = await page.evaluate(() => {
      const w = document.querySelector('iframe').contentWindow;
      return { mmPerPx: w.__place.state.mmPerPx, scaled: w.__place.state.scaled,
               mode: w.__place.state.mode, rooms: w.__place.state.rooms.length };
    });
    if (!after.scaled) fail('축척 확정 후에도 scaled 플래그가 false');
    else if (Math.abs(after.mmPerPx - 5) > 0.05) fail(`축척이 1px = ${after.mmPerPx?.toFixed(3)}mm (기대 5.000)`);
    else pass(`축척 보정 정확 (1,200px = 6,000mm → 1px = ${after.mmPerPx.toFixed(2)}mm)`);
    /*
     * 축척을 확정하면 곧바로 벽 자동 인식을 돌린다. **결과에 따라 갈 곳이 다르다**:
     *  · 공간을 잡았으면 `idle` — 바로 가전을 놓을 수 있는 상태다
     *  · 못 잡았으면 `detect` 나 `wall` — 사용자가 눌러서 잡을 수 있어야 한다
     * 어느 쪽이든 **다음 동작이 가능해야 한다.** 2026-08-15 개편 전에는 축척 전에
     * 방이 없어 늘 후자였는데, 지금은 집 전체를 먼저 잡으므로 전자도 정상이다.
     * (그때 `autoDetectCenter` 가 "이미 방이 있으면 반환"하는 바람에 모드가 `scale` 에
     *  붙박여 도면을 눌러도 아무 일이 없었다 — 이 검사가 그것을 잡았다.)
     */
    const okMode = after.rooms ? after.mode === 'idle' : ['detect', 'wall'].includes(after.mode);
    if (!okMode) {
      fail(`축척 확정 후 모드가 ${after.mode} (공간 ${after.rooms}곳) — `
        + `공간을 잡았으면 idle, 못 잡았으면 detect/wall 이어야 한다`);
    } else pass(`축척 확정 후 ${after.mode} 모드 (공간 ${after.rooms}곳)`);
    void cvbox;
  }

  // ── 4-c. 배치 시뮬레이터: 실제 도면 형태의 벽 자동 인식 ──
  // 실제 분양 도면은 ①거실·주방이 ㄱ자로 트여 있고 ②방 안으로 기둥·붙박이장이 튀어나오며
  // ③창과 문이 뚫려 있다. 예전 윤곽 추출은 줄마다 좌·우 끝점만 읽어 **파인 부분을 직선으로
  // 가로질렀고**, 개구부 판정은 닫기가 벽에 남긴 1px 테두리에 속아 멀쩡한 벽을 문으로 봤다.
  // 둘 다 상담 중에 "여기 들어갑니다"를 틀리게 만드는 사고라 브라우저에서 지킨다.
  {
    const fixture = path.join(os.tmpdir(), 'e2e-plan-L.svg');
    fs.writeFileSync(fixture,
      '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100">' +
      '<rect width="1600" height="1100" fill="#fff"/><g fill="#111">' +
      '<rect x="200" y="150" width="1100" height="14"/>' +      // 위
      '<rect x="200" y="150" width="14" height="700"/>' +       // 좌
      '<rect x="200" y="836" width="700" height="14"/>' +       // 아래(왼쪽)
      '<rect x="886" y="560" width="14" height="290"/>' +       // ㄱ자 세로
      '<rect x="886" y="560" width="414" height="14"/>' +       // ㄱ자 가로
      '<rect x="1286" y="150" width="14" height="424"/>' +      // 우
      '<rect x="600" y="150" width="120" height="90"/>' +       // 방 안으로 튀어나온 기둥
      '</g>' +
      '<rect x="700" y="150" width="240" height="14" fill="#fff"/>' +   // 창 1,200mm
      '<rect x="200" y="640" width="14" height="180" fill="#fff"/>' +   // 문 900mm
      '<g fill="none" stroke="#111" stroke-width="2">' +                // 가구(가는 선)
      '<rect x="320" y="300" width="220" height="120"/><circle cx="1050" cy="330" r="60"/></g></svg>');

    await page.goto(BASE + '/place', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const f = page.frameLocator('iframe');
    await f.locator('#file').setInputFiles(fixture);
    await page.waitForTimeout(900);

    const r = await page.evaluate(() => {
      const w = document.querySelector('iframe').contentWindow;
      const P = w.__place;
      P.state.mmPerPx = 5; P.state.scaled = true;              // 1px = 5mm로 확정한 셈
      P.state.mask = P.state.baseMask = P.state.cleanCv = null; P.state.sealCache = null;
      const d = P.detectRoomAt(450, 400);                       // 거실 한가운데
      if (d.error) return { error: d.error };
      const inPoly = (poly, x, y) => {
        let hit = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, yi] = poly[i], [xj, yj] = poly[j];
          if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
        }
        return hit;
      };
      const seg = (e) => ({
        open: !!e.open, mm: Math.round(Math.hypot(e.x2 - e.x1, e.y2 - e.y1) * 5),
        vert: Math.abs(e.x2 - e.x1) < 2, x: e.x1, y: Math.min(e.y1, e.y2),
      });
      return {
        corners: d.poly.length,
        pillar: inPoly(d.poly, 660, 200),      // 기둥 속
        cut:    inPoly(d.poly, 1100, 700),     // ㄱ자로 잘려 나간 부분
        seat:   inPoly(d.poly, 450, 400),      // 누른 자리
        edges:  d.edges.map(seg),
      };
    });

    if (r.error) fail(`ㄱ자 도면 자동 인식 실패: ${r.error}`);
    else {
      if (r.corners !== 10) fail(`ㄱ자+기둥 도면 모서리가 ${r.corners}개 (기대 10개) — 파인 부분을 가로질렀다`);
      else if (r.pillar) fail('방 안으로 튀어나온 기둥이 방 안쪽으로 잡혔다 — 그 자리에 가전을 놓게 된다');
      else if (r.cut) fail('ㄱ자로 잘려 나간 부분이 방 안쪽으로 잡혔다');
      else if (!r.seat) fail('누른 자리가 인식된 방 밖에 있다');
      else pass(`ㄱ자 도면 벽 인식 (모서리 10개 · 기둥/잘린 부분 제외)`);

      const opens = r.edges.filter((e) => e.open);
      // 창(1,100mm 노출)과 문(900mm) 딱 두 곳. 벽이 개구부로 뜨면 개수가 늘어난다.
      if (opens.length !== 2) {
        fail(`개구부가 ${opens.length}곳 (기대 2곳: 창·문) — ${opens.map((o) => o.mm + 'mm').join(', ')}`);
      } else {
        const win  = opens.find((o) => !o.vert), door = opens.find((o) => o.vert);
        if (!win || !door) fail('개구부 2곳이 창(가로)·문(세로) 조합이 아님');
        else if (Math.abs(win.mm - 1100) > 120) fail(`창 개구부가 ${win.mm}mm (기대 1,100 ±120)`);
        else if (Math.abs(door.mm - 900) > 120) fail(`문 개구부가 ${door.mm}mm (기대 900 ±120)`);
        else pass(`개구부 2곳 정확 (창 ${win.mm}mm · 문 ${door.mm}mm)`);
      }
      // ㄱ자 안쪽 세로벽(1,380mm)은 벽으로 남아야 한다 — 여기가 개구부로 뜨던 자리다
      const inner = r.edges.find((e) => e.vert && Math.abs(e.x - 885) < 8 && e.mm > 1000);
      if (!inner) fail('ㄱ자 안쪽 세로벽 구간을 찾지 못함');
      else if (inner.open) fail('ㄱ자 안쪽 세로벽이 개구부로 판정됨 — 멀쩡한 벽이 문·창이 된다');
      else pass(`ㄱ자 안쪽 세로벽 ${inner.mm}mm는 벽으로 유지`);
    }
  }

  /*
   * ── 4-b. 휴대폰 뒤로가기가 앱을 벗어나지 않는다 (back-kit.js) ──
   *
   * 시트·검색결과를 열어 둔 채 뒤로가기를 누르면 그것만 닫혀야 한다. 예전에는 허브를
   * 통째로 벗어났다. **이 계약은 브라우저에서만 확인된다** — jsdom 은 history.back() 이
   * popstate 를 동기로 쏘지 않아 단위 테스트가 이벤트를 흉내 낼 뿐이다.
   */
  {
    const bp = await ctx.newPage();
    await bp.goto(BASE + '/as', { waitUntil: 'networkidle' });
    await bp.waitForTimeout(1200);
    const fr = bp.frames().find((f) => f.url().includes('as-app.html'));
    if (!fr) fail('AS 미니앱 프레임을 찾지 못함');
    else {
      await fr.fill('#sq', '냉장고');
      await bp.waitForTimeout(400);
      const opened = await fr.evaluate(() => document.body.classList.contains('sres-open'));
      /*
       * **`page.goBack()` 을 쓰면 안 된다.** 쌓인 칸이 iframe 의 히스토리라 최상위 문서는
       * load 를 다시 쏘지 않고, Playwright 가 그것을 기다리다 30초 만에 시간초과한다
       * (실측). 그 사실 자체가 원하던 동작이다 — 뒤로가기가 미니앱 안에서 소비된다.
       */
      await bp.evaluate(() => history.back());
      await bp.waitForTimeout(700);
      const url = bp.url();
      const fr2 = bp.frames().find((f) => f.url().includes('as-app.html'));
      const stillOpen = fr2 ? await fr2.evaluate(() => document.body.classList.contains('sres-open')) : null;
      if (!opened) fail('AS 검색 결과가 열리지 않아 뒤로가기를 검사할 수 없다');
      else if (!url.includes('/as')) fail(`뒤로가기가 앱을 벗어났다 — ${url}`);
      else if (stillOpen !== false) fail('뒤로가기를 눌렀는데 검색 결과가 그대로다');
      else pass('뒤로가기 — 검색 결과만 닫히고 앱에 남는다 (/as)');
    }
    await bp.close();
  }

  /*
   * ── 4-c. 사이드바에서 지금 화면 하나만 켜지는가 ──
   *
   * `/install-cost` 를 열면 **설치환경 가이드까지 함께 켜져 보였다**(2026-08-20 사장님
   * 지적). 판정이 `pathname.startsWith(href)` 라 `/install-cost` 가 `/install` 로
   * 시작하는 탓이었다. 쓰는 데는 지장이 없지만 화면이 거짓말을 한다.
   *
   * **경로가 겹치는 짝을 실제로 열어 세어 본다** — 소스만 보면 다섯 군데 중 하나를
   * 놓쳐도 통과한다. 사이드바는 넓은 화면(lg=1024px)에서만 뜨므로 그 폭으로 연다.
   */
  {
    const wide = await ctx.newPage();
    await wide.setViewportSize({ width: 1280, height: 900 });
    for (const [path, want] of [['/install-cost', '설치비용'], ['/install', '설치환경']]) {
      await wide.goto(BASE + path, { waitUntil: 'domcontentloaded' });
      await wide.waitForTimeout(700);
      /* 켜진 항목은 글자가 굵고(700) 파랗다 — 그 표시로 센다 */
      const on = await wide.evaluate(() => [...document.querySelectorAll('nav a, aside a')]
        .filter((a) => {
          const s = getComputedStyle(a);
          return s.fontWeight === '700' && /rgb\(20, 40, 160\)/.test(s.color);
        })
        .map((a) => a.textContent.replace(/\s+/g, ' ').trim()));
      if (on.length !== 1) fail(`${path} — 사이드바에 ${on.length}곳이 켜져 있다: ${on.join(' / ')}`);
      else if (!on[0].includes(want)) fail(`${path} — 켜진 곳이 "${on[0]}" (기대 ${want})`);
      else pass(`${path} → 사이드바 "${on[0]}" 하나만 켜진다`);
    }
    await wide.close();
  }

  /*
   * ── 4-d. 지점 선택과 점별 로그 ──(2026-08-20 사장님 요청)
   *
   * 순수 함수 검사(test-admin)는 값이 맞는지까지다. **첫 접속에 정말 묻는가**와
   * **미니앱 클릭이 부모에 로그로 닿는가**는 브라우저로만 확인된다 — 미니앱은 iframe
   * 안이라 `logEvent` 를 직접 못 부르고 `postMessage` 로 건너오기 때문이다.
   *
   * 중복 방지도 여기서 본다: 같은 품목을 두 번 눌러도 한 건이어야 한다.
   */
  {
    /* **지점을 고르지 않은 새 기기**로 연다 — 공용 컨텍스트는 이미 고른 상태다 */
    const spCtx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const sp = await spCtx.newPage();
    await sp.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await sp.waitForTimeout(1200);
    const asked = await sp.locator('[aria-label="지점 선택"]').count();
    if (!asked) fail('첫 접속인데 지점을 묻지 않는다');
    else pass('첫 접속 — 지점을 묻는다');

    /*
     * **고르기 전에는 쓸 수 없다**(2026-08-20 사장님 재지시). 건너뛸 길이 남아 있으면
     * 그 세션의 사용이 통째로 '(미지정)'으로 빠진다 — 지점을 모르는 기록은 점별 집계에서
     * 쓸모가 없다. 바깥을 눌러도 닫히지 않아야 한다.
     */
    const skip = await sp.locator('[aria-label="지점 선택"] button:has-text("나중에")').count();
    if (skip) fail('지점을 건너뛸 수 있다 — 그 세션 사용이 통째로 미지정으로 빠진다');
    else pass('지점을 고르기 전에는 건너뛸 수 없다');
    await sp.mouse.click(5, 5);          // 바깥 누르기
    await sp.waitForTimeout(300);
    if (await sp.locator('[aria-label="지점 선택"]').count() === 0) fail('바깥을 누르니 지점 창이 닫힌다');
    else pass('바깥을 눌러도 닫히지 않는다');

    /*
     * **지점명을 미리 보여주지 않는다**(2026-08-20 사장님 지시). 목록을 펼쳐 두면
     * 상담사가 읽어 내려가다 눈에 걸린 것을 누른다 — 자기 매장이 아닌데도 고르면
     * 그 매장 통계가 통째로 엉뚱한 곳에 잡힌다. 쳐야 나온다.
     */
    const preList = await sp.locator('[aria-label="지점 선택"] button').count();
    if (preList > 1) fail(`입력 전에 지점이 ${preList - 1}곳 보인다 — 눈에 걸린 것을 누르게 된다`);
    else pass('입력 전에는 지점 목록을 보여주지 않는다');

    /* 점코드로 찾아 고른다 — 상담사는 이름을, 관리자는 코드를 안다 */
    await sp.locator('[aria-label="지점 선택"] input').first().fill('zn01');
    await sp.waitForTimeout(300);
    await sp.locator('button:has-text("스타필드 수원")').first().click();
    await sp.waitForTimeout(500);
    const chip = (await sp.locator('header button[title="지점 바꾸기"]').textContent()) || '';
    if (!chip.includes('스타필드')) fail(`헤더에 지점이 안 보인다 — "${chip}"`);
    else pass(`헤더에 지점 표시 — ${chip.trim()}`);

    /*
     * **접속하고 지점만 고른 상태에서는 로그가 없어야 한다**(2026-08-20 사장님 요청 —
     * *"접속한 것만으로 로그가 쌓이진 않게"*). 예전에는 지점을 고르는 순간
     * `hub/tab_switch` 가 하나 쌓여, **앱을 열었다 닫기만 해도 사용 기록이 생겼다.**
     * 허브 메인 페이지뷰를 집계에서 뺀 것과 같은 이유다 — 진입은 사용이 아니다.
     */
    const afterPick = await sp.evaluate(() => JSON.parse(localStorage.getItem('axhub_logs') || '[]'));
    if (afterPick.length !== 0) fail(`접속·지점 선택만 했는데 로그가 ${afterPick.length}건 쌓였다`);
    else pass('접속과 지점 선택만으로는 로그가 쌓이지 않는다');

    /* 설치환경 가이드: 품목당 1회 · 같은 품목 재클릭은 안 센다 */
    await sp.goto(BASE + '/install', { waitUntil: 'domcontentloaded' });
    await sp.waitForTimeout(3500);
    const fi = sp.frameLocator('iframe');
    await fi.locator('[data-cat]').nth(1).click();
    await sp.waitForTimeout(300);
    await fi.locator('[data-cat]').nth(1).click();
    await sp.waitForTimeout(300);
    await fi.locator('[data-cat]').nth(3).click();
    await sp.waitForTimeout(800);

    const logs = await sp.evaluate(() => JSON.parse(localStorage.getItem('axhub_logs') || '[]'));
    const opens = logs.filter((e) => e.module === 'install' && e.action === 'result_open');
    if (opens.length !== 2) fail(`설치환경 품목 로그가 ${opens.length}건 (같은 품목 2회 + 다른 품목 1회 → 기대 2)`);
    else pass('설치환경 — 품목당 1회, 같은 품목 재클릭은 안 센다');

    const noStore = logs.filter((e) => !e.store);
    if (noStore.length) fail(`지점이 안 실린 로그 ${noStore.length}건 — 점별 집계가 비게 된다`);
    else pass(`모든 로그(${logs.length}건)에 지점이 실린다`);
    await spCtx.close();
  }

  // ── 5. 운영 종료된 라우트 ──
  {
    collecting = false;   // 404는 의도한 결과라 콘솔 오류로 세지 않는다
    const res = await page.goto(BASE + '/planner', { waitUntil: 'domcontentloaded' });
    if (res && res.status() !== 404) fail(`/planner가 ${res.status()}로 응답 — 운영 종료된 모듈이다`);
    else pass('/planner 404 (운영 종료)');
    await page.waitForTimeout(300);
    collecting = true;
  }

  // ── 콘솔 오류 종합 ──
  // 실제 스크립트 오류만 본다. 아래는 테스트 진행 자체가 만드는 잡음이라 제외한다:
  //  - RSC payload prefetch 실패: 링크 프리페치가 끝나기 전에 다음 페이지로 이동해서 나는 것
  //  - /planner 404: 운영 종료 확인을 위해 일부러 요청한 것
  //  - favicon/manifest/네트워크 차단: 페이지 동작과 무관
  const IGNORE = [
    /Failed to fetch RSC payload/,   // 링크 프리페치가 끝나기 전에 다음 페이지로 이동해서 나는 것
    /favicon|manifest/,
    /ERR_TUNNEL|net::ERR_/,
  ];
  const real = errors.filter((e) => !IGNORE.some((re) => re.test(e)));
  if (real.length) fail(`콘솔/페이지 오류 ${real.length}건:\n    - ${real.slice(0, 5).join('\n    - ')}`);
  else pass('전 페이지 콘솔 오류 없음');

  /*
   * `/api/logs` 는 구글 Apps Script 로 나간다. 검사 환경(샌드박스·CI)에는 그 바깥으로
   * 나가는 길이 없어 502 가 돌아오는데, **앱 결함이 아니라 환경 제약**이다.
   * 로그는 실패해도 대기함에 남아 다음에 다시 가므로 화면 동작과 무관하다.
   */
  const badReal = badResponses.filter((u) => !/favicon|manifest|\/api\/logs/.test(u));
  if (badReal.length) fail(`4xx/5xx 응답 ${badReal.length}건:\n    - ${[...new Set(badReal)].slice(0, 8).join('\n    - ')}`);
  else pass('전 페이지 4xx/5xx 응답 없음');
} catch (e) {
  fail(`E2E 실행 중 예외: ${e.message}`);
} finally {
  await browser.close().catch(() => {});
  stopServer();
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
