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

if (errs.length) fail(`도면 인식 중 스크립트 오류 ${errs.length}건: ${errs[0]}`);
else pass('전 도면에서 스크립트 오류 없음');

await browser.close();
server.close();
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
