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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
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
     * 치수선이 인쇄된 도면을 위한 두 점 보정은 도구막대 '축척 맞추기'로 들어간다.
     * 그 버튼은 휴대폰 화면을 비우려고 '⋯' 안에 접어 뒀으므로 먼저 펼쳐야 한다 —
     * 접힌 버튼이 실제로 눌리는지까지 여기서 함께 확인하는 셈이다.
     */
    await f.locator('#btn-more').click();
    await page.waitForTimeout(200);
    if (!(await f.locator('#btn-scale').isVisible())) fail("'⋯'를 눌렀는데 접어 둔 버튼이 안 나온다");
    await f.locator('#btn-scale').click();
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
      return { mmPerPx: w.__place.state.mmPerPx, scaled: w.__place.state.scaled, mode: w.__place.state.mode };
    });
    if (!after.scaled) fail('축척 확정 후에도 scaled 플래그가 false');
    else if (Math.abs(after.mmPerPx - 5) > 0.05) fail(`축척이 1px = ${after.mmPerPx?.toFixed(3)}mm (기대 5.000)`);
    else pass(`축척 보정 정확 (1,200px = 6,000mm → 1px = ${after.mmPerPx.toFixed(2)}mm)`);
    // 축척을 확정하면 바로 벽 자동 인식을 시도한다. 이 픽스처는 선 하나뿐인 빈 도면이라
    // 자동 인식이 실패하고 "방 안쪽을 눌러주세요" 상태(detect)로 남는 것이 정상이다.
    // 어느 쪽이든 사용자가 바로 다음 동작을 할 수 있는 모드여야 한다 — idle로 남으면
    // 단계 표시와 어긋나 도면을 눌러도 아무 일이 없다.
    if (!['detect', 'wall'].includes(after.mode)) {
      fail(`축척 확정 후 모드가 ${after.mode} — detect(자동 인식) 또는 wall(직접 그리기)이어야 한다`);
    } else pass(`축척 확정 후 ${after.mode} 모드로 자동 전환`);
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

  const badReal = badResponses.filter((u) => !/favicon|manifest/.test(u));
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
