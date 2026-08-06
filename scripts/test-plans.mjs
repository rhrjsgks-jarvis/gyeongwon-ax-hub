/*
 * 도면 코퍼스 회귀 테스트 — 실행: node scripts/test-plans.mjs  (npm run test:plans)
 *
 * 사용자가 어떤 도면을 올릴지 알 수 없다. 그래서 실제 분양·인테리어 도면의 표기 관례를
 * 그대로 재현한 평면(scripts/fixtures/plans.mjs)을 여러 벌 두고, 전부 브라우저에서
 * 실제로 인식시켜 "누른 자리에 맞는 방이 나오는가"를 넓이(㎡)로 검사한다.
 *
 * 넓이로 검사하는 이유: 벽을 한 칸 틀리게 잡거나 파인 부분을 가로지르거나 옆방까지
 * 삼키면 전부 넓이에 그대로 드러난다. 상담에서 쓰는 값이 결국 치수라 기준으로도 맞다.
 *
 * playwright가 없으면 실패가 아니라 SKIP (데이터 테스트만 돌리는 환경 배려 — test-e2e와 같다).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { PLANS } from './fixtures/plans.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.log('SKIP: playwright가 설치돼 있지 않아 도면 코퍼스 검사를 건너뜁니다 (npm i -D playwright)');
  process.exit(0);
}

let ok = true;
const fail = (m) => { console.log('ERROR:', m); ok = false; };
const pass = (m) => console.log('OK:', m);

const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';
const browser = await chromium.launch(
  fs.existsSync(exe) ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });

const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message || e)));

// 미니앱을 파일에서 직접 띄운다 (Next 서버 없이도 돌게)
const appHtml = fs.readFileSync(path.join(root, 'public', 'place-app.html'), 'utf8');
const tmp = path.join(os.tmpdir(), 'place-corpus.html');
fs.writeFileSync(tmp, appHtml);
const reps = fs.readFileSync(path.join(root, 'public', 'size-reps.json'), 'utf8');
await page.route('**/size-reps.json', (r) => r.fulfill({ contentType: 'application/json', body: reps }));
await page.goto('file://' + tmp, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);

for (const plan of PLANS) {
  const b64 = Buffer.from(plan.svg, 'utf8').toString('base64');
  const loaded = await page.evaluate(async ({ b64, mmPerImgPx }) => {
    const P = window.__place;
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;base64,' + b64; });
    P.state.img = img; P.state.imgW = img.naturalWidth; P.state.imgH = img.naturalHeight;
    P.state.mmPerPx = mmPerImgPx; P.state.scaled = true;
    P.state.mask = P.state.baseMask = P.state.cleanCv = null;
    P.state.sealCache = null; P.state.walls = []; P.state.items = [];
    return { w: img.naturalWidth, h: img.naturalHeight };
  }, { b64, mmPerImgPx: plan.mmPerImgPx });

  for (const pr of plan.probes) {
    const [mx, my] = pr.at;
    const r = await page.evaluate(({ mx, my, mmPerImgPx }) => {
      const P = window.__place;
      const d = P.detectRoomAt(mx / mmPerImgPx, my / mmPerImgPx);
      if (d.error) return { error: d.error };
      // 다각형 넓이 (신발끈 공식) → ㎡
      const k = mmPerImgPx;
      let a2 = 0;
      for (let i = 0; i < d.poly.length; i++) {
        const [x1, y1] = d.poly[i], [x2, y2] = d.poly[(i + 1) % d.poly.length];
        a2 += (x1 * k) * (y2 * k) - (x2 * k) * (y1 * k);
      }
      return {
        areaM2: Math.abs(a2 / 2) / 1e6,
        corners: d.poly.length,
        opens: d.edges.filter((e) => e.open).length,
        closeR: d.closeR,
      };
    }, { mx, my, mmPerImgPx: plan.mmPerImgPx });

    const label = `${plan.name} @(${mx},${my})`;
    if (r.error) { fail(`${label}: ${r.error}\n    └ ${pr.note}`); continue; }
    const [lo, hi] = pr.areaM2;
    if (r.areaM2 < lo || r.areaM2 > hi) {
      fail(`${label}: 넓이 ${r.areaM2.toFixed(1)}㎡ (기대 ${lo}~${hi}㎡)\n    └ ${pr.note}`);
      continue;
    }
    if (pr.opens && (r.opens < pr.opens[0] || r.opens > pr.opens[1])) {
      fail(`${label}: 개구부 ${r.opens}곳 (기대 ${pr.opens[0]}~${pr.opens[1]}곳)\n    └ ${pr.note}`);
      continue;
    }
    pass(`${label} → ${r.areaM2.toFixed(1)}㎡ · 모서리 ${r.corners} · 개구부 ${r.opens} · 닫기 ${r.closeR}px`);
  }
  void loaded;
}

// ── 방 범위 조절 ──
// 자동 판정은 도면 관례를 전제로 한 추정이다. 전제를 벗어나는 도면이 반드시 나오므로
// 사용자가 넓히고 좁힐 수 있어야 한다. 그 손잡이가 실제로 동작하는지 검사한다.
{
  const plan = PLANS[0];
  const b64 = Buffer.from(plan.svg, 'utf8').toString('base64');
  const r = await page.evaluate(async ({ b64, mmPerImgPx }) => {
    const P = window.__place;
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = 'data:image/svg+xml;base64,' + b64; });
    P.state.img = img; P.state.imgW = img.naturalWidth; P.state.imgH = img.naturalHeight;
    P.state.mmPerPx = mmPerImgPx; P.state.scaled = true;
    P.state.mask = P.state.baseMask = P.state.cleanCv = null; P.state.sealCache = null;
    const area = (d) => {
      let a2 = 0;
      for (let i = 0; i < d.poly.length; i++) {
        const [x1, y1] = d.poly[i], [x2, y2] = d.poly[(i + 1) % d.poly.length];
        a2 += (x1 * mmPerImgPx) * (y2 * mmPerImgPx) - (x2 * mmPerImgPx) * (y1 * mmPerImgPx);
      }
      return Math.abs(a2 / 2) / 1e6;
    };
    const at = [5800 / mmPerImgPx, 3300 / mmPerImgPx];
    const base = P.detectRoomAt(at[0], at[1]);
    if (base.error) return { error: base.error };
    const wide = base.wider  != null ? P.detectRoomAt(at[0], at[1], base.wider)  : null;
    const narr = base.narrow != null ? P.detectRoomAt(at[0], at[1], base.narrow) : null;
    return {
      base: area(base), hasWider: base.wider != null, hasNarrow: base.narrow != null,
      wide: wide && !wide.error ? area(wide) : null,
      narr: narr && !narr.error ? area(narr) : null,
    };
  }, { b64, mmPerImgPx: plan.mmPerImgPx });

  if (r.error) fail(`범위 조절: 기준 인식이 실패 (${r.error})`);
  else if (!r.hasWider || !r.hasNarrow) fail('범위 조절 후보(더 넓게/더 좁게)가 제시되지 않음');
  else if (!(r.wide > r.base)) fail(`"더 넓게"가 넓어지지 않음 (${r.base?.toFixed(1)} → ${r.wide?.toFixed(1)}㎡)`);
  else if (!(r.narr < r.base)) fail(`"더 좁게"가 좁아지지 않음 (${r.base?.toFixed(1)} → ${r.narr?.toFixed(1)}㎡)`);
  else pass(`범위 조절 동작 (더 넓게 ${r.wide.toFixed(1)}㎡ ◂ ${r.base.toFixed(1)}㎡ ▸ 더 좁게 ${r.narr.toFixed(1)}㎡)`);
}

// ── 공간 지정 UI ──
// 방을 누르면 이름을 붙여 등록하고, 두 번째부터는 "이미 잡은 방에 이어 붙이기"를 고를 수 있어야 한다.
// 자동 인식이 방을 절반만 잡는 경우의 유일한 해법이라 UI가 실제로 붙어 있는지 확인한다.
{
  const plan = PLANS[0];
  const b64 = Buffer.from(plan.svg, 'utf8').toString('base64');
  const r = await page.evaluate(async ({ b64, mmPerImgPx }) => {
    const P = window.__place;
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = 'data:image/svg+xml;base64,' + b64; });
    P.state.img = img; P.state.imgW = img.naturalWidth; P.state.imgH = img.naturalHeight;
    P.state.mmPerPx = mmPerImgPx; P.state.scaled = true;
    P.state.mask = P.state.baseMask = P.state.cleanCv = null; P.state.sealCache = null;
    P.state.rooms = []; P.state.walls = []; P.state.items = []; P.state.mode = 'detect';
    P.state.zoom = 0.05; P.state.panX = 20; P.state.panY = 20;

    const cv = document.querySelector('#cv');
    const rect = cv.getBoundingClientRect();
    const tap = (mmx, mmy) => {
      const sx = mmx * P.state.zoom + P.state.panX, sy = mmy * P.state.zoom + P.state.panY;
      cv.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: rect.left + sx, clientY: rect.top + sy, bubbles: true, pointerId: 1 }));
    };
    const out = {};

    // 방을 누르면 **도면 위 막대**가 뜬다(모달이 아니다 — 모달은 도면을 가려서
    // 더 넓게/더 좁게가 무엇을 바꾸는지 볼 수 없었다)
    tap(5800, 3300);                                   // 거실
    const bar = document.querySelector('#draftbar');
    out.barShown = !!bar && bar.classList.contains('on');
    out.hasAdjust = !!document.querySelector('#d-wide') && !!document.querySelector('#d-narrow');
    out.areaShown = bar ? (bar.querySelector('.area') || {}).textContent : '';
    // 넓게 → 도면 위 넓이가 실제로 커져야 한다
    const a0 = P.draftAreaM2(P.state.draft);
    if (!document.querySelector('#d-wide').disabled) document.querySelector('#d-wide').click();
    out.wideArea = P.draftAreaM2(P.state.draft);
    out.wideGrew = out.wideArea > a0 + 0.05;
    out.deltaShown = /→/.test(document.querySelector('#draftbar').textContent);
    if (!document.querySelector('#d-narrow').disabled) document.querySelector('#d-narrow').click();
    out.backArea = P.draftAreaM2(P.state.draft);

    document.querySelector('#d-ok').click();           // 확정 → 이름 시트
    out.sheet1 = !!document.querySelector('#rname');
    out.hasJoin1 = !!document.querySelector('#join');  // 첫 방에는 이어 붙일 대상이 없다
    if (out.sheet1) {
      document.querySelector('#rname').value = '거실';
      document.querySelector('#ok').click();
    }
    out.rooms1 = P.state.rooms.map((x) => x.name);
    out.barHidden = !document.querySelector('#draftbar').classList.contains('on');

    P.state.mode = 'detect';
    tap(1600, 3000);                                   // 침실1
    document.querySelector('#d-ok').click();
    out.hasJoin2 = !!document.querySelector('#join');  // 두 번째부터는 이어 붙이기가 있어야 한다
    if (document.querySelector('#rname')) {
      document.querySelector('#rname').value = '침실1';
      document.querySelector('#ok').click();
    }
    out.rooms2 = P.state.rooms.map((x) => x.name);
    out.parts = P.state.rooms.map((x) => x.parts.length);

    // 이어 붙이기 — 안방을 거실 조각으로 붙여 본다
    P.state.mode = 'detect';
    tap(10000, 3000);
    document.querySelector('#d-ok').click();
    const jn = document.querySelector('#join');
    if (jn) {
      const opt = [...jn.options].find((o) => /거실/.test(o.textContent));
      if (opt) jn.value = opt.value;
      document.querySelector('#ok').click();
    }
    out.roomsAfterJoin = P.state.rooms.map((x) => `${x.name}(${x.parts.length})`);
    out.sideRows = document.querySelectorAll('#rooms .room').length;
    return out;
  }, { b64, mmPerImgPx: plan.mmPerImgPx });

  if (!r.barShown) fail('방을 눌렀는데 도면 위 범위 막대가 뜨지 않음');
  else if (!r.hasAdjust) fail('범위 조절(더 넓게/더 좁게) 버튼이 없다');
  else if (!/㎡/.test(r.areaShown || '')) fail(`막대에 넓이가 안 보인다 ("${r.areaShown}")`);
  else if (!r.wideGrew) fail(`"더 넓게"를 눌러도 넓이가 안 커진다 (→ ${r.wideArea?.toFixed(1)}㎡)`);
  else if (!r.deltaShown) fail('넓이가 바뀌었는데 "얼마에서 얼마로"가 표시되지 않는다');
  else if (!r.sheet1) fail('확정을 눌렀는데 이름 입력이 뜨지 않음');
  else if (r.hasJoin1) fail('첫 방인데 "이어 붙이기" 선택이 뜬다 — 붙일 대상이 없다');
  else if (r.rooms1.join() !== '거실') fail(`첫 방 등록 결과가 [${r.rooms1}] (기대 거실)`);
  else if (!r.barHidden) fail('확정한 뒤에도 범위 막대가 남아 있다');
  else if (!r.hasJoin2) fail('두 번째 방인데 "이어 붙이기" 선택이 없다');
  else if (r.rooms2.join() !== '거실,침실1') fail(`두 방 등록 결과가 [${r.rooms2}]`);
  else if (r.roomsAfterJoin.join() !== '거실(2),침실1(1)') fail(`이어 붙이기 결과가 [${r.roomsAfterJoin}] (기대 거실(2),침실1(1))`);
  else if (r.sideRows !== 2) fail(`사이드 공간 목록이 ${r.sideRows}행 (기대 2행)`);
  else pass(`공간 지정 UI (도면 위에서 ${r.wideArea.toFixed(1)}㎡로 넓혔다가 되돌리고 · 이름 붙여 2곳 등록 · 세 번째는 거실에 이어 붙임 → ${r.roomsAfterJoin.join(' / ')})`);
}

if (errs.length) fail(`도면 인식 중 스크립트 오류 ${errs.length}건: ${errs[0]}`);
else pass('전 도면에서 스크립트 오류 없음');

await browser.close();
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
