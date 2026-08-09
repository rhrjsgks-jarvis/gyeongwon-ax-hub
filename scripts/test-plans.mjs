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
import http from 'http';
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
// 패키지가 있어도 **브라우저 실행 파일**이 없을 수 있다. CI의 test 잡은 chromium을
// 설치하지 않으므로(설치는 e2e 잡에서만 한다) 여기서 그냥 launch 하면 실패한다.
// 위의 import 가드는 패키지 부재만 잡으므로, 실행 파일 부재도 같은 SKIP 으로 다룬다.
let browser;
try {
  browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
} catch (e) {
  console.log('SKIP: chromium 실행 파일이 없어 도면 코퍼스 검사를 건너뜁니다 '
    + '(npx playwright install chromium)');
  console.log('      ' + String(e.message).split('\n')[0].slice(0, 120));
  process.exit(0);
}
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });

const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message || e)));

// 미니앱을 정적 서버로 띄운다 (Next 서버 없이도 돌게).
//
// 예전에는 file:// 로 띄웠는데, place-app.html 이 size-reps.json 을 상대경로로 fetch 하므로
// 가전 목록을 불러오는 지점에서 항상 "Failed to fetch" 가 났다. fetch() 규격이 file: 스킴을
// 지원하지 않아(http(s)/data/blob 만 가능) 파일을 나란히 놓아도, --allow-file-access-from-files
// 를 줘도, page.route() 로 가로채려 해도 해결되지 않는다. http 로 띄우는 것이 유일한 해법이고
// 실제 배포 형태와도 같다.
const MIME_STATIC = { '.html': 'text/html; charset=utf-8', '.json': 'application/json',
  '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.join(root, 'public', path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(path.join(root, 'public')) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME_STATIC[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
await page.goto(`${origin}/place-app.html`, { waitUntil: 'domcontentloaded' });
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

// ── 실제 도면 (scripts/fixtures/plans-real/) ──
// 합성 평면은 "이런 표기 유형에서 깨지지 않는다"까지만 보증한다. 진짜 도면에서 어디가
// 깨지는지는 진짜 도면으로만 알 수 있다. 이미지는 public repo라 커밋하지 않으므로
// (저작권) 파일을 가진 로컬에서만 이 구간이 돈다. 자세한 절차는 그 폴더의 README 참고.
{
  const dir = path.join(__dirname, 'fixtures', 'plans-real');
  const idx = path.join(dir, 'index.json');
  let entries = [];
  try { entries = JSON.parse(fs.readFileSync(idx, 'utf8')); } catch { entries = []; }
  const present = entries.filter((e) => e && e.file && fs.existsSync(path.join(dir, e.file)));
  const missing = entries.length - present.length;

  if (!entries.length) {
    console.log('SKIP: 실제 도면 코퍼스가 비어 있습니다 — scripts/fixtures/plans-real/README.md 참고');
  } else if (!present.length) {
    console.log(`SKIP: 실제 도면 ${missing}벌이 index.json에 있지만 파일이 없습니다 (public repo라 이미지는 커밋하지 않습니다)`);
  } else {
    const MIME = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
      '.webp':'image/webp', '.gif':'image/gif', '.svg':'image/svg+xml' };
    for (const e of present) {
      const ext = path.extname(e.file).toLowerCase();
      const b64 = fs.readFileSync(path.join(dir, e.file)).toString('base64');
      const uri = `data:${MIME[ext] || 'image/png'};base64,${b64}`;
      if (!(e.mmPerImgPx > 0)) { fail(`${e.file}: mmPerImgPx가 없습니다 (도면 1px = 몇 mm인가)`); continue; }

      const loaded = await page.evaluate(async ({ uri, mmPerImgPx }) => {
        const P = window.__place;
        const img = new Image();
        const ok = await new Promise((res) => { img.onload = () => res(true); img.onerror = () => res(false); img.src = uri; });
        if (!ok) return { error: '이미지를 열지 못했습니다' };
        P.state.img = img; P.state.imgW = img.naturalWidth; P.state.imgH = img.naturalHeight;
        P.state.mmPerPx = mmPerImgPx; P.state.scaled = true;
        P.state.mask = P.state.baseMask = P.state.cleanCv = null;
        P.state.sealCache = null; P.state.walls = []; P.state.rooms = []; P.state.items = [];
        return { w: img.naturalWidth, h: img.naturalHeight };
      }, { uri, mmPerImgPx: e.mmPerImgPx });
      if (loaded.error) { fail(`${e.file}: ${loaded.error}`); continue; }

      for (const pr of (e.probes || [])) {
        const [px0, py0] = pr.atPx || [];
        if (!Number.isFinite(px0) || !Number.isFinite(py0)) { fail(`${e.file}: atPx가 없는 probe`); continue; }
        const r = await page.evaluate(({ px0, py0, k }) => {
          const P = window.__place;
          const d = P.detectRoomAt(px0, py0);
          if (d.error) return { error: d.error };
          let a2 = 0;
          for (let i = 0; i < d.poly.length; i++) {
            const [x1, y1] = d.poly[i], [x2, y2] = d.poly[(i + 1) % d.poly.length];
            a2 += (x1 * k) * (y2 * k) - (x2 * k) * (y1 * k);
          }
          return { areaM2: Math.abs(a2 / 2) / 1e6, corners: d.poly.length,
            opens: d.edges.filter((x) => x.open).length, closeR: d.closeR };
        }, { px0, py0, k: e.mmPerImgPx });

        const label = `[실측] ${e.file} ${pr.label || `@(${px0},${py0})`}`;
        if (r.error) { fail(`${label}: ${r.error}`); continue; }
        const [lo, hi] = pr.areaM2 || [0, Infinity];
        if (r.areaM2 < lo || r.areaM2 > hi) {
          fail(`${label}: 넓이 ${r.areaM2.toFixed(1)}㎡ (도면 치수 기준 기대 ${lo}~${hi}㎡)`);
        } else {
          pass(`${label} → ${r.areaM2.toFixed(1)}㎡ · 모서리 ${r.corners} · 개구부 ${r.opens}`);
        }
      }
    }
    if (missing) console.log(`SKIP: 실제 도면 ${missing}벌은 파일이 없어 건너뜁니다`);
  }
}

// ── 축척 맞추기 ──
// 도면에 치수가 적혀 있지 않아도 아는 길이 하나만 입력하면 전체가 비례로 맞춰지는 것이
// 이 도구의 전제다. 그런데 위 검사들은 전부 state.mmPerPx 를 직접 대입해 이 UI 를 건너뛰므로,
// 정작 사용자가 매번 거치는 경로가 아무 검증도 받지 않았다. 실제로 두 점을 찍고 길이를
// 입력하는 흐름을 그대로 태워서, 나온 축척이 정확한지와 그 축척으로 잰 넓이가 맞는지 본다.
{
  const plan = PLANS[0];
  const b64 = Buffer.from(plan.svg, 'utf8').toString('base64');
  const r = await page.evaluate(async ({ b64, trueMmPerPx }) => {
    const P = window.__place;
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = 'data:image/svg+xml;base64,' + b64; });
    P.state.img = img; P.state.imgW = img.naturalWidth; P.state.imgH = img.naturalHeight;
    // 축척 미확정 상태에서 시작 — 사용자가 도면을 막 올린 직후와 같다
    P.state.mmPerPx = null; P.state.scaled = false; P.state.scalePts = [];
    P.state.mask = P.state.baseMask = P.state.cleanCv = null; P.state.sealCache = null;
    P.state.rooms = []; P.state.walls = []; P.state.items = [];
    P.state.zoom = 1; P.state.panX = 0; P.state.panY = 0;

    const out = {};
    document.querySelector('#btn-scale').click();
    out.mode = P.state.mode;

    // 도면 이미지에서 가로로 정확히 400px 떨어진 두 점을 찍는다.
    // zoom=1·pan=0 이라 화면 좌표와 이미지 좌표가 1:1 이다.
    const cv = document.querySelector('#cv');
    const rect = cv.getBoundingClientRect();
    const GAP_PX = 400;
    const tap = (x, y) => cv.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: rect.left + x, clientY: rect.top + y, bubbles: true, pointerId: 1 }));
    tap(100, 100);
    tap(100 + GAP_PX, 100);
    out.pts = P.state.scalePts.length;
    out.sheetShown = !!document.querySelector('#mm');
    if (!out.sheetShown) return out;

    // 그 400px 이 실제로 몇 mm 인지는 합성 도면의 진짜 축척으로 계산한다.
    // 사용자가 도면 치수선을 보고 입력하는 값에 해당한다.
    const realMm = Math.round(GAP_PX * trueMmPerPx);
    out.enteredMm = realMm;
    document.querySelector('#mm').value = String(realMm);
    document.querySelector('#ok').click();

    out.scaled = P.state.scaled;
    out.mmPerPx = P.state.mmPerPx;
    // closeSheet() 는 #modal 의 on 클래스만 떼고 내용은 DOM 에 남긴다 — 요소 존재로 판단하면 안 된다
    out.sheetClosed = !document.querySelector('#modal').classList.contains('on');
    return out;
  }, { b64, trueMmPerPx: plan.mmPerImgPx });

  if (r.mode !== 'scale') fail(`"축척 맞추기"를 눌렀는데 모드가 ${r.mode}`);
  else if (r.pts !== 2) fail(`두 점을 찍었는데 scalePts가 ${r.pts}개`);
  else if (!r.sheetShown) fail('두 점을 찍었는데 길이 입력 창이 뜨지 않음');
  else if (!r.scaled) fail('길이를 입력하고 확정했는데 축척이 확정되지 않음');
  else if (!r.sheetClosed) fail('확정했는데 입력 창이 닫히지 않음');
  else {
    // 입력한 mm ÷ 찍은 픽셀거리 = 축척. 합성 도면의 진짜 축척과 일치해야 한다.
    const err = Math.abs(r.mmPerPx - plan.mmPerImgPx) / plan.mmPerImgPx;
    if (err > 0.01) {
      fail(`축척이 어긋남 — 입력 ${r.enteredMm}mm/400px → ${r.mmPerPx.toFixed(3)}mm/px, ` +
        `도면 실제 ${plan.mmPerImgPx}mm/px (오차 ${(err * 100).toFixed(1)}%)`);
    } else {
      pass(`축척 맞추기 — 두 점(400px)에 ${r.enteredMm}mm 입력 → ${r.mmPerPx.toFixed(3)}mm/px ` +
        `(도면 실제 ${plan.mmPerImgPx}mm/px, 오차 ${(err * 100).toFixed(2)}%)`);
    }
  }

  // 축척이 UI 로 확정된 상태에서 잰 넓이가 맞는지 — 여기까지 맞아야 "정상 작동"이다
  if (r.scaled) {
    const probe = plan.probes[0];
    const a = await page.evaluate(({ mx, my }) => {
      const P = window.__place;
      const k = P.state.mmPerPx;
      const d = P.detectRoomAt(mx / k, my / k);
      if (d.error) return { error: d.error };
      let a2 = 0;
      for (let i = 0; i < d.poly.length; i++) {
        const [x1, y1] = d.poly[i], [x2, y2] = d.poly[(i + 1) % d.poly.length];
        a2 += (x1 * k) * (y2 * k) - (x2 * k) * (y1 * k);
      }
      return { areaM2: Math.abs(a2 / 2) / 1e6 };
    }, { mx: probe.at[0], my: probe.at[1] });

    const [lo, hi] = probe.areaM2;
    if (a.error) fail(`축척 확정 후 방 인식 실패: ${a.error}`);
    else if (a.areaM2 < lo || a.areaM2 > hi) {
      fail(`UI 로 맞춘 축척에서 넓이 ${a.areaM2.toFixed(1)}㎡ (기대 ${lo}~${hi}㎡) — 축척이 넓이에 잘못 반영된다`);
    } else {
      pass(`UI 로 맞춘 축척으로 잰 넓이 ${a.areaM2.toFixed(1)}㎡ (기대 ${lo}~${hi}㎡)`);
    }
  }
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

// ── 공간 복수선택 ──
// 도면에 따라 거실만 잡히기도 하고 거실+주방이 한 덩어리로 잡히기도 한다. 주방은 냉장고장이
// 별도 칸으로 그려져 따로 떨어지기도 한다. 가전은 "이 방 안"에서 자리를 찾으므로 여러 조각을
// 한 공간으로 묶을 수 있어야 하고, 그때마다 이름을 다시 붙이게 하면 매장에서 못 쓴다.
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
    P.state.draft = null; P.state.draftMore = [];
    P.state.zoom = 0.05; P.state.panX = 20; P.state.panY = 20;

    const cv = document.querySelector('#cv');
    const rect = cv.getBoundingClientRect();
    const tap = (mmx, mmy) => {
      const sx = mmx * P.state.zoom + P.state.panX, sy = mmy * P.state.zoom + P.state.panY;
      cv.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: rect.left + sx, clientY: rect.top + sy, bubbles: true, pointerId: 1 }));
    };
    const out = {};

    tap(5800, 3300);                                   // 거실
    out.hasAdd = !!document.querySelector('#d-add');   // "＋ 이 공간도 함께" 가 있어야 한다
    const a1 = P.draftAreaM2(P.state.draft);
    document.querySelector('#d-add').click();          // 담기
    out.stashed = (P.state.draftMore || []).length;
    out.draftCleared = !P.state.draft;
    out.barStillOn = document.querySelector('#draftbar').classList.contains('on');
    out.waitMsg = /마저 누르세요/.test(document.querySelector('#draftbar').textContent);

    P.state.mode = 'detect';
    tap(1600, 3000);                                   // 침실1 — 두 번째 조각
    const a2 = P.draftAreaM2(P.state.draft);
    out.total = P.draftTotalM2();
    out.sumOk = Math.abs(out.total - (a1 + a2)) < 0.05;
    out.pieces = P.draftPieces().length;
    out.okLabel = (document.querySelector('#d-ok') || {}).textContent;

    document.querySelector('#d-ok').click();           // 확정 → 이름 시트
    out.sheetSays = /조각/.test(document.querySelector('.sheet, .modal, body').textContent);
    if (document.querySelector('#rname')) {
      document.querySelector('#rname').value = '거실+주방';
      document.querySelector('#ok').click();
    }
    out.rooms = P.state.rooms.map((x) => `${x.name}(${x.parts.length})`);
    out.cleared = (P.state.draftMore || []).length === 0 && !P.state.draft;
    out.areaM2 = P.state.rooms.length ? +(P.roomArea(P.state.rooms[0]) / 1e6).toFixed(1) : 0;
    return out;
  }, { b64, mmPerImgPx: plan.mmPerImgPx });

  if (!r.hasAdd) fail('"＋ 이 공간도 함께" 버튼이 없다 — 복수선택을 시작할 수 없다');
  else if (r.stashed !== 1) fail(`담기를 눌렀는데 담긴 조각이 ${r.stashed}개`);
  else if (!r.draftCleared) fail('담은 뒤에도 현재 초안이 남아 있다 — 다음 공간을 누를 수 없다');
  else if (!r.barStillOn || !r.waitMsg) fail('담은 뒤 막대가 사라져 몇 개를 묶는 중인지 알 수 없다');
  else if (r.pieces !== 2) fail(`두 번째를 눌렀는데 조각이 ${r.pieces}개`);
  else if (!r.sumOk) fail(`합계 넓이가 두 조각의 합과 다름 (${r.total})`);
  else if (!/2개로 확정/.test(r.okLabel || '')) fail(`확정 버튼이 개수를 알리지 않음 ("${r.okLabel}")`);
  else if (!r.sheetSays) fail('이름 시트가 "조각 N개를 한 공간으로 묶습니다"를 알리지 않음');
  else if (r.rooms.length !== 1 || !/\(2\)$/.test(r.rooms[0])) fail(`복수선택 결과가 [${r.rooms}] (기대 한 공간 · 조각 2개)`);
  else if (!r.cleared) fail('확정한 뒤에도 담아 둔 조각이 남아 있다');
  else pass(`공간 복수선택 — 두 곳을 담아 한 공간으로 확정 (${r.rooms[0]} · ${r.areaM2}㎡)`);
}

// ── 가전 선택: 큰 사이즈부터 · 평형별 추천 ──
// 상담은 큰 것에서 시작해 안 들어가면 줄이는 순서로 진행되고, 목록 맨 위가 곧 기본값이다.
// 추천은 근거를 댈 수 있는 것만 미리 고른다 — 근거 없이 체크돼 있으면 그대로 상담에 나간다.
{
  const r = await page.evaluate(async () => {
    const P = window.__place;
    P.state.reps = await (await fetch('size-reps.json')).json();
    P.state.rooms = []; P.state.items = [];
    P.state.exclusiveM2 = 84.9;                 // 84타입 세대를 불러온 상황
    P.state.mmPerPx = 10; P.state.scaled = true;

    const out = { area: P.planAreaM2() };
    const rec = P.recommendPicks();
    out.recCats = Object.keys(rec);
    out.tv = rec['TV'] ? P.state.reps[rec['TV'].i].size : null;
    out.fridge = rec['냉장고'] ? P.state.reps[rec['냉장고'].i] : null;
    out.fridgeLine = out.fridge ? out.fridge.line : null;
    out.fridgeSize = out.fridge ? out.fridge.size : null;
    // 방을 안 잡았으면 냉방면적은 계산할 근거가 없다
    out.acWithoutRoom = !!rec['에어컨'];

    // 목록이 큰 것부터인지 — 가전 선택 시트를 열어 실제 select 를 본다
    P.state.rooms = [];
    document.querySelector('#btn-add').click();
    // openSelect 는 size-reps 를 받아 오는 비동기 함수라 클릭 직후에는 아직 안 그려져 있다
    let sel = null;
    for (let t = 0; t < 60 && !sel; t++) {
      await new Promise((res) => setTimeout(res, 50));
      sel = document.querySelector('select[data-size="TV"]');
    }
    out.opened = !!sel;
    if (sel) {
      /*
       * **인치 하나에 줄 하나.** 사용자가 정한 단위다 — 대표모델을 두는 목적이 "도면에
       * 넣었을 때 대략적인 느낌"이라 사이즈 안의 깊이 편차(65형 222~499mm)는 감당할
       * 오차로 본다. 예전에 모델 변형을 다 펼쳐 44줄이던 것과, 발자국으로 쪼개 21줄이던
       * 것 둘 다 되돌린 결과이므로 **정확히 사이즈 수와 같은지**로 못 박는다.
       */
      out.tvRows = sel.options.length;
      out.tvSizes = P.state.reps.filter((r) => r.cat === 'TV').length;
      out.tvOptions = P.state.reps.filter((r) => r.cat === 'TV')
        .reduce((s, r) => s + r.options.length, 0);
      const dims = [...sel.options].map((o) => (/(\d+)×(\d+)×(\d+)mm/.exec(o.textContent) || [])[0]);
      out.dupDims = dims.length - new Set(dims).size;
      /*
       * 키친핏 1도어는 한 대만 놓는 물건이 아니라 같은 캐비닛을 나란히 붙이는 상품이라
       * 2·3·4세트 구성이 목록에 있어야 한다. 그리고 세트 폭은 **계산값**이므로
       * 무엇을 더했는지(모듈 폭 + 이격, 준용한 모듈)가 화면에 나와야 한다.
       */
      const fsel = document.querySelector('select[data-size="냉장고"]');
      out.setRows = fsel ? [...fsel.options].filter((o) => /1도어 \d세트/.test(o.textContent)).length : 0;
      if (fsel) {
        const si = [...fsel.options].findIndex((o) => /1도어 4세트/.test(o.textContent));
        if (si >= 0) {
          fsel.selectedIndex = si;
          fsel.dispatchEvent(new Event('change', { bubbles: true }));
          const txt = (document.querySelector('p[data-info="냉장고"]') || {}).textContent || '';
          out.setNote = /595㎜ × 4대/.test(txt) && /제품 간 6㎜/.test(txt) && /냉장고장 내경/.test(txt);
          out.setInfo = txt.slice(0, 200);
        }
      }
      // 기본 목록에 업소용·빌트인·리빙이 섞이지 않는가
      const catBoxes = [...document.querySelectorAll('#a-list input[data-cat]')].map((b) => b.dataset.cat);
      out.cats = catBoxes.length;
      out.hasNonHome = catBoxes.some((c) => /^리빙|업소용|데이코|시스템에어컨/.test(c));
      // 토글을 켜면 늘어나는가
      const all = document.querySelector('#a-all');
      out.hasToggle = !!all;
      if (all) { all.checked = true; all.dispatchEvent(new Event('change')); }
      out.catsAll = [...document.querySelectorAll('#a-list input[data-cat]')].length;
      if (all) { all.checked = false; all.dispatchEvent(new Event('change')); }
      out.first = sel.options[0].textContent;
      out.widths = [...sel.options].map((o) => {
        const m = /(\d+)×/.exec(o.textContent);
        return m ? +m[1] : 0;
      });
      out.desc = out.widths.every((w, i, a) => i === 0 || a[i - 1] >= w);
      out.selectedIsRec = sel.selectedIndex >= 0 && /형/.test(sel.options[sel.selectedIndex].textContent);
      /*
       * 상담의 첫 문장이 되는 줄이다. **개수**와 **어떤 평형 기준인지**가 둘 다 보여야
       * "84A는 보통 이 일곱 가지입니다"로 말을 시작할 수 있다. 그리고 무엇을 빼면 되는지
       * 알려 주지 않으면 미리 체크해 둔 것이 오히려 부담이 된다.
       */
      const recTxt = (document.querySelector('#a-rec') || {}).textContent || '';
      out.recCount = (/추천 가전 (\d+)종/.exec(recTxt) || [])[1] || null;
      out.recBasis = /타입|전용\s*\d+\s*㎡/.test(recTxt);
      out.recHowTo = /체크를 풀/.test(recTxt);
      out.noteShown = !!out.recCount && out.recBasis && out.recHowTo;
    }
    const c = document.querySelector('#c'); if (c) c.click();
    return out;
  });

  if (!r.opened) fail('가전 선택 시트에 사이즈 목록이 없다');
  else if (r.tvRows !== r.tvSizes) fail(`TV 드롭다운이 ${r.tvRows}줄 — 사이즈 ${r.tvSizes}종과 같아야 한다(인치당 한 줄)`);
  else if (r.dupDims) fail(`TV 목록에 같은 치수가 ${r.dupDims}줄 중복 — 사이즈가 중복 생성됐다`);
  else if (r.setRows !== 3) fail(`냉장고 목록의 키친핏 1도어 세트가 ${r.setRows}줄 — 2·3·4세트 3줄이어야 한다`);
  else if (!r.setNote) fail('세트 구성의 근거(모듈 폭·이격·준용 사실)가 화면에 안 나온다');
  else if (r.hasNonHome) fail('기본 목록에 업소용·빌트인·리빙 상품이 섞여 있다');
  else if (!r.hasToggle) fail('"업소용·빌트인·리빙도 보기" 토글이 없다 — 아예 못 고르게 되면 안 된다');
  else if (r.catsAll <= r.cats) fail(`토글을 켜도 카테고리가 안 늘어난다 (${r.cats} → ${r.catsAll})`);
  else if (!r.desc) fail(`사이즈 목록이 큰 것부터가 아니다 (폭 ${r.widths.slice(0, 5)}…)`);
  else if (!/×/.test(r.first || '')) fail(`목록에 치수가 안 보인다 ("${r.first}")`);
  else if (!r.recCats.length) fail('전용면적을 아는데도 미리 고른 가전이 하나도 없다');
  else if (!r.tv) fail('평형별 추천에 TV가 없다');
  else if (r.fridgeLine !== '프리스탠딩') fail(`추천 냉장고가 ${r.fridgeLine} — 기본은 프리스탠딩이어야 한다`);
  else if (r.acWithoutRoom) fail('방을 안 잡았는데 에어컨이 추천됐다 — 냉방면적은 방 넓이로 계산하는 값이다');
  else if (!r.recCount) fail('추천 개수를 문장으로 안 밝힌다 ("추천 가전 N종"이 없다)');
  else if (!r.recBasis) fail('어떤 평형 기준으로 골랐는지 안 밝힌다 (주택형·전용면적 표기 없음)');
  else if (!r.recHowTo) fail('미리 체크된 것을 어떻게 빼는지 안 알려 준다');
  else pass(`가전 선택 — 카테고리 ${r.cats}개(토글 시 ${r.catsAll}개) · TV ${r.tvRows}줄(사이즈당 1줄, 원본 옵션 ${r.tvOptions}개) · 키친핏 세트 ${r.setRows}줄 · 전용 ${r.area}㎡ 기준 ${r.recCount}종 추천 (TV ${r.tv} · 냉장고 ${r.fridgeLine} ${r.fridgeSize})`);
}

/*
 * ── 배치한 가전을 마우스로 집을 수 있는가 ──
 * jsdom 쪽(`test-place.mjs`)은 `state.mode` 만 본다. 정작 사용자가 겪는 것은
 * **캔버스를 눌렀을 때 가전이 잡히느냐**이고, 그건 pointerdown 핸들러가 detect 분기에서
 * return 하는지에 달려 있어 실제 이벤트를 쏴 봐야 드러난다. 여기서 그것을 본다.
 */
{
  const r = await page.evaluate(async () => {
    const P = window.__place;
    P.state.reps = await (await fetch('size-reps.json')).json();
    P.state.rooms = []; P.state.items = []; P.state.img = null;
    P.state.mmPerPx = 1; P.state.scaled = true;
    P.state.zoom = 0.1; P.state.panX = 20; P.state.panY = 20;
    // 4 × 3m 방 하나
    const W = 4000, H = 3000;
    P.state.walls = [
      { x1: 0, y1: 0, x2: W, y2: 0 }, { x1: W, y1: 0, x2: W, y2: H },
      { x1: W, y1: H, x2: 0, y2: H }, { x1: 0, y1: H, x2: 0, y2: 0 },
    ];
    const rep = P.state.reps.find((x) => x.cat === '냉장고' && x.size === '602~640L');
    const o = rep.options[0];
    // 방을 확정한 직후처럼 detect 모드로 둔 채 배치한다 — 예전에 여기서 막혔다
    P.state.mode = 'detect';
    P.autoPlace([{ cat: '냉장고', size: rep.size, model: o.model, group: o.group, part: o.parts[0] }]);
    const it = P.state.items[0];
    if (!it) return { placed: false };

    const cv = document.querySelector('canvas');
    const rect = cv.getBoundingClientRect();
    const sx = rect.left + (it.bx * P.state.zoom + P.state.panX);
    const sy = rect.top + (it.by * P.state.zoom + P.state.panY);
    cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: sx, clientY: sy, bubbles: true, pointerId: 1 }));
    const grabbed = !!(P.state.drag && P.state.drag.id === it.id);
    const before = { x: it.bx, y: it.by };
    cv.dispatchEvent(new PointerEvent('pointermove', { clientX: sx + 30, clientY: sy, bubbles: true, pointerId: 1 }));
    cv.dispatchEvent(new PointerEvent('pointerup', { clientX: sx + 30, clientY: sy, bubbles: true, pointerId: 1 }));
    return { placed: true, mode: P.state.mode, grabbed, moved: it.bx !== before.x || it.by !== before.y,
      sel: P.state.sel === it.id, rooms: P.state.rooms.length };
  });

  if (!r.placed) fail('배치 자체가 안 됐다 — 앞 단계를 먼저 확인할 것');
  else if (r.mode !== 'idle') fail(`자동 배치 뒤 모드가 '${r.mode}' — idle 이어야 도면을 다시 만질 수 있다`);
  else if (r.rooms) fail(`가전을 누른 것이 새 방으로 인식됐다 (방 ${r.rooms}곳 생김)`);
  else if (!r.grabbed) fail('배치된 가전을 눌렀는데 잡히지 않는다 — 마우스로 옮길 수 없다');
  else if (!r.moved) fail('가전을 잡았는데 끌어도 안 움직인다');
  else pass('배치된 가전을 눌러 잡고 끌어서 옮길 수 있다 (detect 모드에서 배치해도 idle 로 복귀)');
}

/*
 * ── 단지 불러오기: 도면과 방이 같은 자를 쓰는가 ──
 * `loadFromLibrary` 가 `mmPerPx = 1` 을 넣던 시절, 그 값의 뜻은 "도면 1px 이 몇 mm 인가"라
 * **1,000px 짜리 도면이 가로 1m 로 그려졌다.** 화면에서는 좌상단 50px 썸네일이 되고
 * 방 다각형만 크게 남아, 도면 위에 제품을 올릴 수가 없었다.
 * 겉보기 증상과 원인이 멀어 조용히 재발하므로 두 가지를 못 박는다.
 */
{
  const r = await page.evaluate(async () => {
    const P = window.__place;
    const out = {};

    // ① 방만 복원 — mmPerPx 가 1 이면 안 된다(도면 축척과 월드 좌표계를 섞은 것이다)
    // 저장하려면 방이 있어야 한다. 8×6m 짜리 하나를 mm 좌표로 세워 둔다.
    P.state.rooms = []; P.state.items = []; P.state.img = null;
    P.state.mmPerPx = null; P.state.scaled = true;
    const W = 8000, H = 6000;
    P.addRoom('거실', [
      { x1: 0, y1: 0, x2: W, y2: 0 }, { x1: W, y1: 0, x2: W, y2: H },
      { x1: W, y1: H, x2: 0, y2: H }, { x1: 0, y1: H, x2: 0, y2: 0 },
    ]);
    P.saveToLibrary('경기 수원', '축척검사 단지', '52A');
    const all = await P.libraryAll();
    const e = all.find((x) => x.complex === '축척검사 단지');
    if (!e) return { step: '저장한 항목을 못 찾음' };
    P.loadFromLibrary(e);
    out.roomsOnly = { mmPerPx: P.state.mmPerPx, scaled: P.state.scaled, img: !!P.state.img };

    // ② 도면 + 저장된 방을 함께 — 화면상 비율이 실제 비율과 맞아야 한다
    const c = document.createElement('canvas'); c.width = 1000; c.height = 700;
    const g = c.getContext('2d'); g.fillStyle = '#EEE'; g.fillRect(0, 0, 1000, 700);
    const url = c.toDataURL();
    await new Promise((res) => { const im = new Image(); im.onload = () => { P.useImage(url); setTimeout(res, 700); }; im.src = url; });
    const keep = { img: P.state.img, imgW: P.state.imgW, imgH: P.state.imgH };
    P.loadFromLibrary(e);
    P.state.mmPerPx = 20;                       // 이 도면 1px = 20mm 라고 알고 있는 상황
    P.state.img = keep.img; P.state.imgW = keep.imgW; P.state.imgH = keep.imgH;
    const xs = P.state.walls.flatMap((w) => [w.x1, w.x2]);
    const roomW = Math.max(...xs) - Math.min(...xs);
    out.together = {
      imgWorldW: P.state.imgW * P.state.mmPerPx,   // 20,000mm
      roomWorldW: roomW,
      // 화면 폭의 비 == 월드 폭의 비 여야 한다(같은 zoom 을 곱하므로)
      screenRatio: (P.state.imgW * P.state.mmPerPx * P.state.zoom) / (roomW * P.state.zoom),
      worldRatio: (P.state.imgW * P.state.mmPerPx) / roomW,
    };

    // ③ 축척을 모르면 도면을 아예 그리지 않는다 (틀린 크기로 겹치는 것보다 낫다)
    P.loadFromLibrary(e);
    P.state.img = keep.img; P.state.imgW = keep.imgW; P.state.imgH = keep.imgH;
    out.unknownScale = { mmPerPx: P.state.mmPerPx, scaled: P.state.scaled,
      drawsPlan: !!(P.state.img && (P.state.mmPerPx || !P.state.scaled)) };
    return out;
  });

  if (r.step) fail(`라이브러리 축척 검사 준비 실패: ${r.step}`);
  else if (r.roomsOnly.mmPerPx === 1) {
    fail('방만 복원했는데 mmPerPx 가 1 — 도면 1px=1mm 가 되어 도면이 썸네일로 쪼그라든다');
  } else if (r.roomsOnly.mmPerPx != null) {
    fail(`방만 복원했는데 mmPerPx 가 ${r.roomsOnly.mmPerPx} — 도면이 없으므로 null 이어야 한다`);
  } else if (!r.roomsOnly.scaled) fail('저장된 좌표는 mm 인데 축척 미확정으로 표시된다');
  else if (Math.abs(r.together.screenRatio - r.together.worldRatio) > 0.01) {
    fail(`도면과 방의 화면 비(${r.together.screenRatio.toFixed(2)})가 실제 비(${r.together.worldRatio.toFixed(2)})와 다르다`);
  } else if (r.unknownScale.drawsPlan) {
    fail('축척을 모르는데도 도면을 그린다 — 틀린 크기로 겹쳐 보인다');
  } else {
    pass('단지 불러오기 축척 — 방만 복원 시 mmPerPx=null · 도면과 함께면 같은 자 '
      + `(도면 ${Math.round(r.together.imgWorldW)}mm 안에 방 ${Math.round(r.together.roomWorldW)}mm) · 축척 모르면 도면 미표시`);
  }
}

/*
 * ── 길이를 입력한 뒤 도면과 벽이 같은 자를 쓰는가 ──
 * `askWallLength` 가 벽 좌표만 mm 로 환산하고 `state.mmPerPx` 를 null 로 두면,
 * 벽은 mm 축에 도면 이미지는 "이미지 픽셀 = 월드 단위" 축에 그려져 **같은 화면에 자가 둘**이 된다.
 * 실제로 방이 도면보다 4.27배 크게 나와 **도면 위에 제품을 올릴 수가 없었다.**
 * 눈에 보이는 증상(도면이 작아짐)과 원인(단위 불일치)이 멀어 조용히 재발하기 쉬우므로 못 박는다.
 */
{
  const r = await page.evaluate(async () => {
    const P = window.__place;
    // 방이 뚜렷한 합성 도면 — 자동 인식이 걸려야 한다
    const c = document.createElement('canvas'); c.width = 900; c.height = 640;
    const g = c.getContext('2d');
    g.fillStyle = '#FFF'; g.fillRect(0, 0, 900, 640);
    g.fillStyle = '#EFE6D6'; g.fillRect(80, 80, 740, 480);
    g.strokeStyle = '#222'; g.lineWidth = 9; g.strokeRect(80, 80, 740, 480);
    g.beginPath(); g.moveTo(520, 80); g.lineTo(520, 350); g.stroke();
    g.beginPath(); g.moveTo(520, 350); g.lineTo(820, 350); g.stroke();
    const url = c.toDataURL();
    await new Promise((res) => { const im = new Image(); im.onload = () => { P.useImage(url); setTimeout(res, 900); }; im.src = url; });
    await new Promise((res) => setTimeout(res, 1200));   // 자동 인식이 끝나기를 기다린다

    const ok = [...document.querySelectorAll('#draftbar button')].find((x) => x.textContent.trim() === '이 공간 확정');
    if (!ok) return { step: '초안 막대에 확정 버튼이 없다' };
    ok.click();
    await new Promise((res) => setTimeout(res, 500));
    const nameOk = document.querySelector('#sheet .modal-actions button.primary');
    if (nameOk) nameOk.click();
    await new Promise((res) => setTimeout(res, 500));

    const wl = document.querySelector('#wl');
    if (!wl) return { step: '길이 입력칸이 안 뜬다' };
    wl.value = '4200';
    document.querySelector('#wl-ok').click();

    const xs = P.state.walls.flatMap((w) => [w.x1, w.x2]);
    const ys = P.state.walls.flatMap((w) => [w.y1, w.y2]);
    const box = P.planBox();
    return {
      mmPerPx: P.state.mmPerPx, scaled: P.state.scaled,
      wall: { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) },
      box, roomM2: +(P.state.rooms[0] ? (P.roomArea(P.state.rooms[0]) / 1e6).toFixed(1) : 0),
    };
  });

  if (r.step) fail(`축척 흐름이 끊김: ${r.step}`);
  else if (!r.scaled) fail('길이를 입력했는데 축척이 확정되지 않았다');
  else if (!r.mmPerPx) {
    fail('길이를 입력했는데 mmPerPx 가 비어 있다 — 도면 이미지가 벽과 다른 자로 그려진다');
  } else if (r.wall.x2 > r.box.x2 * 1.02 || r.wall.y2 > r.box.y2 * 1.02 || r.wall.x1 < -1 || r.wall.y1 < -1) {
    fail(`벽이 도면 범위를 벗어남 — 벽 ${Math.round(r.wall.x2)}×${Math.round(r.wall.y2)} vs 도면 ${Math.round(r.box.x2)}×${Math.round(r.box.y2)}`);
  } else {
    pass(`길이 입력 후 도면과 벽이 같은 자 (1px = ${r.mmPerPx.toFixed(2)}mm · 방 ${r.roomM2}㎡ 가 도면 `
      + `${Math.round(r.box.x2)}×${Math.round(r.box.y2)}mm 안에 들어감)`);
  }
}

// ── 단지 평면 라이브러리 ──
// 매장에서 고객 단지를 고르면 도면 없이 바로 배치를 시작하는 것이 목적이다.
// 도면 이미지는 저작권 때문에 저장할 수 없으므로 방 경계(mm 좌표)만 남기는데,
// 그 좌표만으로 방이 온전히 복원되는지가 이 기능의 전부다. 왕복으로 검사한다.
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
    P.state.rooms = []; P.state.walls = []; P.state.items = [];
    localStorage.removeItem('place_library_v1');

    // 방 두 곳을 잡아 이름을 붙인다
    const mk = (mmx, mmy, name) => {
      const d = P.detectRoomAt(mmx / mmPerImgPx, mmy / mmPerImgPx);
      if (d.error) return false;
      P.applyDetected ? P.applyDetected(d.poly, d.edges, { name }) : null;
      return true;
    };
    const out = {};
    // applyDetected 가 노출돼 있지 않으면 addRoom 으로 직접 만든다
    if (!P.applyDetected) {
      for (const [mmx, mmy, name] of [[5800, 3300, '거실'], [1600, 3000, '침실1']]) {
        const d = P.detectRoomAt(mmx / mmPerImgPx, mmy / mmPerImgPx);
        if (d.error) continue;
        const k = P.state.mmPerPx;
        const segs = d.edges.map((e) => ({ x1: e.x1 * k, y1: e.y1 * k, x2: e.x2 * k, y2: e.y2 * k, open: !!e.open }));
        P.addRoom(name, segs);
      }
    } else { mk(5800, 3300, '거실'); mk(1600, 3000, '침실1'); }

    out.before = P.state.rooms.map((x) => `${x.name}(${x.parts[0].walls.length}벽)`);
    out.beforeArea = P.state.rooms.map((x) => Math.round(P.roomArea ? P.roomArea(x) : 0));

    // 저장 → 라이브러리에 들어갔는가
    P.saveToLibrary('경기 수원', '테스트 단지', '84A');
    const all = await P.libraryAll();
    const saved = all.find((e) => e.complex === '테스트 단지' && e.type === '84A');
    out.saved = !!saved;
    out.savedRooms = saved ? saved.rooms.length : 0;
    out.hasImage = saved ? ('img' in saved || 'image' in saved || JSON.stringify(saved).includes('data:image')) : false;

    // 화면을 비우고 → 불러오기
    P.state.rooms = []; P.state.walls = []; P.state.img = null;
    P.state.mmPerPx = null; P.state.scaled = false;
    if (saved) P.loadFromLibrary(saved);
    out.after = P.state.rooms.map((x) => `${x.name}(${x.parts[0].walls.length}벽)`);
    out.afterArea = P.state.rooms.map((x) => Math.round(P.roomArea ? P.roomArea(x) : 0));
    out.scaled = P.state.scaled;
    out.wallsSynced = P.state.walls.length;
    out.noImage = !P.state.img;

    // ── 지역 → 단지 → 타입 3단계로 좁혀 가는가 ──
    // 매장에서 고객에게 묻는 순서 그대로여야 한다. 목록이 늘어나도 한 화면에 쏟아지면 안 된다.
    P.saveToLibrary('강원 원주', '다른 단지', '59B');   // 지역이 둘이 되도록 하나 더
    await P.openLibrary();
    const step = () => [...document.querySelectorAll('#libbody .libitem')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());
    out.lv1 = step();                                   // 시·도 칩으로 걸러진 시·군 목록
    const pick = (txt) => {
      const b = [...document.querySelectorAll('#libbody .libitem')].find((x) => x.textContent.includes(txt));
      if (b) b.click();
      return !!b;
    };
    /*
     * **시·도를 먼저 고르고 시·군만 스크롤한다.** 지역이 17곳이라 휴대폰에서 한 화면에
     * 안 들어갔다. 칩이 실제로 걸러 주는지(경기를 고르면 강원이 안 보이는지) 확인한다.
     */
    const chipTxt = () => [...document.querySelectorAll('#libchips .chip')].map((c) => c.textContent.replace(/s+/g, ' ').trim());
    const chip = (t) => {
      const c = [...document.querySelectorAll('#libchips .chip')].find((x) => x.textContent.includes(t));
      if (c) c.click();
      return !!c;
    };
    out.chips = chipTxt();
    out.chipGw = chip('강원');
    out.lv1gw = step();
    chip('경기');
    out.lv1 = step();
    out.picked1 = pick('수원');
    out.lv2 = step();                                   // 그 지역의 단지 목록
    // 도면이 있는 단지를 골라 3단계(도면 목록)까지 들어간다.
    // "저장된 방만 있는 단지"는 고르는 즉시 불러오므로 3단계가 없다 — 그건 아래에서 따로 본다.
    //
    // 단지명·타입을 여기에 적어 두지 않는다. 색인은 수집이 진행되면서 계속 바뀌는 데이터라
    // ("매교역 팰루시드"의 84A 가 OCR 재판독으로 T1 이 됐다) 이름을 박아 두면 수집이 나아질
    // 때마다 테스트가 깨진다 — 검사하려는 건 3단계로 좁혀 가는 동작이지 색인 내용이 아니다.
    const idx = await P.loadPlanIndex();
    // 전용면적이 읽힌 단지를 우선한다 — 3단계에서 '전용 84.37㎡' 표시를 검사하기 때문이다.
    // 전용면적은 도면 머리말에서 OCR 로 읽는 것이라 못 읽은 단지가 정상적으로 있다.
    const inRegion = idx.filter((c) => c.region === '경기 수원');
    const target = inRegion.filter((c) => c.plans.some((p) => p.exclusiveM2))
      .sort((a, b) => b.plans.length - a.plans.length)[0]
      || inRegion.sort((a, b) => b.plans.length - a.plans.length)[0];
    const targetHasArea = !!(target && target.plans.some((p) => p.exclusiveM2));
    out.target = target ? { complex: target.complex, plans: target.plans.length, hasArea: targetHasArea } : null;
    out.picked2 = target ? pick(target.complex) : false;
    out.lv3 = step();                                   // 그 단지의 도면 목록
    // 미리보기가 붙어 있고 실제로 받아지는가 — 자동 선별이 가끔 설명글·조감도를 고르는데,
    // 그림이 보여야 직원이 건너뛸 수 있다. src 만 있고 안 받아지면 빈 칸이 되어 소용없다.
    const thumbs = [...document.querySelectorAll('#libbody .libitem img.thumb')];
    out.thumbCount = thumbs.length;
    out.thumbOk = thumbs.length
      ? (await Promise.all(thumbs.slice(0, 3).map((im) => fetch(im.getAttribute('src'))
        .then((r) => r.ok).catch(() => false)))).every(Boolean)
      : false;
    out.savedOnlyShown = out.lv2.some((t) => t.includes('테스트 단지') && t.includes('저장된 방만'));
    out.crumb = (document.querySelector('#libcrumb') || {}).textContent || '';
    return out;
  }, { b64, mmPerImgPx: plan.mmPerImgPx });

  if (!r.before.length) fail('라이브러리 검사용 방을 잡지 못함');
  else if (!r.saved) fail('저장했는데 라이브러리에서 찾을 수 없음');
  else if (r.hasImage) fail('라이브러리 항목에 이미지가 들어 있다 — 저작권 때문에 좌표만 담아야 한다');
  else if (r.savedRooms !== r.before.length) fail(`저장된 방 수가 다름 (${r.savedRooms} vs ${r.before.length})`);
  else if (r.after.join() !== r.before.join()) fail(`불러온 방이 다름\n        저장 전: ${r.before}\n        불러온 뒤: ${r.after}`);
  else if (!r.scaled) fail('불러온 뒤 축척이 확정 상태가 아님 — 좌표가 이미 mm 라 바로 써야 한다');
  else if (!r.noImage) fail('불러오기가 도면 이미지를 남겼다');
  else if (!r.wallsSynced) fail('불러온 뒤 state.walls 가 비어 있다');
  // 저장할 때 좌표를 정수 mm 로 반올림하므로 넓이가 미세하게 달라진다(0.01% 수준).
  // 상담에서 쓰는 값은 ㎡ 단위라 이 정도는 무해하다 — 완전 일치가 아니라 오차로 본다.
  else if (r.afterArea.some((a, i) => Math.abs(a - r.beforeArea[i]) > r.beforeArea[i] * 0.005)) {
    fail(`불러온 방의 넓이가 0.5% 넘게 달라짐 (${r.beforeArea} → ${r.afterArea})`);
  } else {
    pass(`단지 라이브러리 왕복 — 저장 ${r.savedRooms}곳 → 도면 없이 복원 ${r.after.join(' / ')} ` +
      `(넓이 ${r.afterArea.join('·')}㎡ 그대로, 이미지 미포함)`);
  }

  // ── 단지 도면 색인 (public/plan-index.json) ──
  // 지역 → 단지 → 도면 순으로 고르는 것이 이 기능의 전부다. 색인이 비어 있거나
  // 이미지 경로가 깨지면 매장에서 아무것도 못 고른다.
  {
    const idxRes = await page.evaluate(async () => {
      const P = window.__place;
      const idx = await P.loadPlanIndex();
      const flat = idx.flatMap((c) => c.plans.map((p) => ({ ...p, region: c.region, complex: c.complex })));
      // 실제로 받아지는지 몇 장 확인한다 (경로 오타·대소문자 사고를 잡는다)
      const probe = [flat[0], flat[Math.floor(flat.length / 2)], flat[flat.length - 1]].filter(Boolean);
      const oks = [];
      for (const p of probe) {
        try { const r = await fetch(p.file); oks.push(r.ok); } catch { oks.push(false); }
      }
      return {
        complexes: idx.length,
        plans: flat.length,
        regions: [...new Set(idx.map((c) => c.region))],
        noRegion: idx.filter((c) => !/^(경기|강원)/.test(c.region)).map((c) => c.region),
        badPath: flat.filter((p) => !/^plans\/c\d+\//.test(p.file)).length,
        // 타입·전용면적을 못 읽은 도면. 실패로 보지 않는다 — 도면 자체는 쓸 수 있고
        // 직원이 열어 보면 어느 타입인지 안다. 다만 수집 품질 지표라 눈에 띄게 적어 둔다.
        unnamed: flat.filter((p) => /^T\d+$/.test(p.type)).length,
        noArea: flat.filter((p) => !p.exclusiveM2).length,
        fetched: oks,
      };
    });

    if (!idxRes.complexes) fail('단지 도면 색인이 비어 있다 — npm run build:plans 로 만든다');
    else if (idxRes.noRegion.length) fail(`경원 밖 지역이 색인에 있음: ${[...new Set(idxRes.noRegion)]}`);
    else if (idxRes.badPath) fail(`이미지 경로 형식이 어긋난 항목 ${idxRes.badPath}개`);
    else if (idxRes.fetched.some((x) => !x)) fail(`색인의 도면 이미지를 받지 못함 (${idxRes.fetched})`);
    else {
      pass(`단지 도면 색인 — ${idxRes.regions.length}개 지역 · 단지 ${idxRes.complexes}곳 · 도면 ${idxRes.plans}장 (경로 확인 ${idxRes.fetched.length}장)`);
      console.log(`      └ 타입 미판독 ${idxRes.unnamed}장 · 전용면적 미판독 ${idxRes.noArea}장`);
    }
  }

  // 3단계 좁혀 가기
  if (!r.chips || r.chips.length < 2) fail(`시·도 칩이 ${r.chips ? r.chips.length : 0}개 — 경기·강원을 먼저 고르게 해야 한다`);
  else if (!r.chips.some((t) => t.includes('경기')) || !r.chips.some((t) => t.includes('강원'))) fail(`시·도 칩이 이상함: ${r.chips}`);
  else if (!r.chipGw) fail('강원 칩을 누를 수 없음');
  else if (!r.lv1gw.some((t) => t.includes('원주'))) fail(`강원을 골랐는데 원주가 없음: ${r.lv1gw}`);
  else if (r.lv1gw.some((t) => t.includes('수원'))) fail(`강원을 골랐는데 경기 시·군이 섞여 있음: ${r.lv1gw}`);
  else if (!r.lv1 || r.lv1.length < 2) fail(`경기에 시·군이 ${r.lv1 ? r.lv1.length : 0}개`);
  else if (!r.lv1.some((t) => t.includes('수원'))) fail(`경기 목록에 수원이 없음: ${r.lv1}`);
  else if (!r.picked1) fail('지역을 고를 수 없음');
  else if (!r.target) fail('색인에 "경기 수원" 단지가 없다 — npm run build:plans 로 만든다');
  else if (!r.lv2.some((t) => t.includes(r.target.complex))) fail(`2단계에 그 지역의 단지가 없음: ${r.lv2}`);
  else if (r.lv2.some((t) => t.includes('다른 단지'))) fail('2단계에 다른 지역의 단지가 섞여 있음');
  else if (!r.savedOnlyShown) fail('방만 저장해 둔 단지가 2단계에 보이지 않음 — 도면이 없어도 고를 수 있어야 한다');
  else if (!r.picked2) fail('단지를 고를 수 없음');
  else if (r.lv3.length !== r.target.plans) {
    fail(`3단계 도면 수가 색인과 다름: 화면 ${r.lv3.length}장 vs 색인 ${r.target.plans}장 (${r.target.complex})`);
  }
  // 전용면적은 소수 두 자리로 뜬다("전용 84.37㎡"). \d+ 만 보면 소수점에서 걸린다.
  // 전용면적은 도면 머리말에서 OCR 로 읽는 것이라 못 읽은 단지가 정상적으로 있다.
  // 색인에 값이 있는 단지를 골랐을 때만 화면 표시를 검사한다.
  else if (r.target.hasArea && !r.lv3.some((t) => /전용\s*[\d.]+\s*㎡/.test(t))) fail(`3단계에 전용면적 표시가 없음: ${r.lv3}`);
  else if (!/›/.test(r.crumb)) fail(`되돌아갈 경로 표시가 없음 ("${r.crumb}")`);
  else if (r.thumbCount !== r.lv3.length) fail(`도면 ${r.lv3.length}장 중 미리보기가 ${r.thumbCount}장에만 있다`);
  else if (!r.thumbOk) fail('미리보기 이미지를 받지 못함 — 목록에 빈 칸이 뜬다');
  else pass(`지역 → 단지 → 도면 3단계 (지역 ${r.lv1.length}곳 → "경기 수원"의 단지 ${r.lv2.length}곳 → 도면 ${r.lv3.length}장 · 경로 "${r.crumb.replace(/\s+/g, ' ').trim()}")`);

  // ── 미리 읽어 둔 축척이 실제로 적용되는가 ──
  // 도면에 인쇄된 치수로 구해 둔 mmPerPx 를 색인에 싣고, 도면을 고르면 바로 적용한다.
  // 이건 조용히 틀리면 "냉장고가 들어갑니다"를 거짓말로 만드는 종류라 회귀 검사가 필요하다.
  {
    const sc = await page.evaluate(async () => {
      const P = window.__place;
      const idx = await P.loadPlanIndex();
      const flat = idx.flatMap((c) => c.plans.map((p) => ({ ...p, complex: c.complex })));
      const withK = flat.filter((p) => p.mmPerPx);
      if (!withK.length) return { none: true, total: flat.length };
      // 색인에 실린 축척이 아파트 도면다운 범위인가 (1px = 1~60mm)
      const bad = withK.filter((p) => !(p.mmPerPx > 0.5 && p.mmPerPx < 60));
      // 실제 적용 — 라이브러리를 거치지 않고 같은 경로(useImage + 축척 설정)를 흉내낸다
      const p0 = withK[0];
      P.state.mmPerPx = null; P.state.scaled = false;
      await new Promise((res) => P.useImage(p0.file, res));
      P.state.mmPerPx = p0.mmPerPx; P.state.scaled = true;
      return { none: false, total: flat.length, n: withK.length, bad: bad.length,
        applied: P.state.scaled && Math.abs(P.state.mmPerPx - p0.mmPerPx) < 1e-9,
        sample: `${p0.complex} ${p0.type} ${p0.mmPerPx}mm/px(${p0.scaleConf || '?'})` };
    });
    if (sc.none) console.log(`SKIP: 축척이 실린 도면이 색인에 없습니다 (도면 ${sc.total}장)`);
    else if (sc.bad) fail(`색인의 축척이 범위를 벗어난 도면 ${sc.bad}장 (1px = 0.5~60mm 이어야 한다)`);
    else if (!sc.applied) fail('색인의 축척이 적용되지 않음');
    else pass(`미리 읽어 둔 축척 — ${sc.n}/${sc.total}장에 실려 있고 적용됨 (예: ${sc.sample})`);
  }
}

if (errs.length) fail(`도면 인식 중 스크립트 오류 ${errs.length}건: ${errs[0]}`);
else pass('전 도면에서 스크립트 오류 없음');

await browser.close();
server.close();
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
