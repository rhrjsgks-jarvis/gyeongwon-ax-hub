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

// ── 프로덕션 빌드 ──
if (!fs.existsSync(path.join(root, '.next', 'BUILD_ID'))) {
  console.log('· .next 빌드 없음 → npm run build');
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
}

// ── 서버 기동 ──
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  cwd: root, stdio: 'ignore', detached: true,
});
const stopServer = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
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
    if (!title || !title.includes('경원 AX 허브')) fail('허브 메인 헤더가 렌더되지 않음');
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
  ]) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    const src = await page.getAttribute('iframe', 'src');
    if (!src || !src.includes(marker)) { fail(`${route}: iframe src가 ${marker}가 아님 (${src})`); continue; }
    // iframe 내부가 실제로 그려졌는지 — body에 내용이 있어야 한다
    const inner = await page.frameLocator('iframe').locator('body').innerText().catch(() => '');
    if (!inner || inner.trim().length < 20) fail(`${route}: iframe 내용이 비어 있음`);
  }
  pass('6개 모듈 페이지 iframe 로드');

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
