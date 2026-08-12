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
const knownGaps = [];
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
          const bxs = d.poly.map((q) => q[0] * k), bys = d.poly.map((q) => q[1] * k);
          return { widthMm: Math.max(...bxs) - Math.min(...bxs),
                   depthMm: Math.max(...bys) - Math.min(...bys),
                   areaM2: Math.abs(a2 / 2) / 1e6, corners: d.poly.length,
            opens: d.edges.filter((x) => x.open).length, closeR: d.closeR };
        }, { px0, py0, k: e.mmPerImgPx });

        const label = `[실측] ${e.file} ${pr.label || `@(${px0},${py0})`}`;
        if (r.error) { fail(`${label}: ${r.error}`); continue; }
        /*
         * 넓이 대신 **폭**만 검사할 수도 있다(`wMm`). 세로 치수 사슬이 없는 도면이 많은데
         * (실측 후보 9장 중 3장) 가로 사슬은 있다 — 인쇄된 폭은 그 자체로 확정값이므로
         * 넓이를 못 구한다고 도면을 통째로 버릴 이유가 없다.
         */
        if (pr.wMm) {
          const [wlo, whi] = pr.wMm;
          const wOff = r.widthMm < wlo || r.widthMm > whi;
          if (wOff && pr.known) knownGaps.push(`${label} 폭 → ${Math.round(r.widthMm)}mm (기대 ${wlo}~${whi}) — ${pr.known}`);
          else if (wOff) fail(`${label}: 폭 ${Math.round(r.widthMm)}mm (도면 인쇄값 기준 기대 ${wlo}~${whi}mm)`);
          else if (pr.known) fail(`${label}: 이제 통과한다 — known 을 지울 것 (폭 ${Math.round(r.widthMm)}mm)`);
          else pass(`${label} → 폭 ${Math.round(r.widthMm)}mm · 넓이 ${r.areaM2.toFixed(1)}㎡ · 모서리 ${r.corners}`);
          continue;
        }
        const [lo, hi] = pr.areaM2 || [0, Infinity];
        const off = r.areaM2 < lo || r.areaM2 > hi;
        /*
         * `known` 은 **알려진 미해결**이다 — 도면 치수로는 이 넓이가 맞는데 인식이 아직
         * 못 따라가는 자리. 기대값을 앱 출력에 맞춰 초록으로 만들면 검사가 아무것도 못
         * 지키고(그러면 이 코퍼스를 만든 뜻이 없다), 그대로 두면 CI 가 영원히 빨개서
         * 다른 작업을 막는다. 그래서 **보고는 하되 실패로 세지 않는다.**
         * 고쳐지면 `known` 을 지울 것 — 지우지 않으면 아래 '이제 통과한다' 가 알려 준다.
         */
        if (off && pr.known) {
          knownGaps.push(`${label} → ${r.areaM2.toFixed(1)}㎡ (기대 ${lo}~${hi}㎡) — ${pr.known}`);
        } else if (off) {
          fail(`${label}: 넓이 ${r.areaM2.toFixed(1)}㎡ (도면 치수 기준 기대 ${lo}~${hi}㎡)`);
        } else if (pr.known) {
          fail(`${label}: 이제 통과한다 — index.json 에서 known 을 지울 것 (${r.areaM2.toFixed(1)}㎡)`);
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
    /*
     * **누르고 떼야 한 번의 탭이다.** 도면 위 조작은 이제 뗄 때 일어난다 —
     * 그래야 끌기를 "도면 이동"으로 쓸 수 있다(마우스는 포인터가 하나뿐이다).
     */
    const tap = (x, y) => {
      for (const t of ['pointerdown', 'pointerup']) {
        cv.dispatchEvent(new PointerEvent(t, {
          clientX: rect.left + x, clientY: rect.top + y, bubbles: true, pointerId: 1 }));
      }
    };
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
    // 누르고 떼야 한 번의 탭이다(끌기는 도면 이동으로 쓰인다)
    const tap = (mmx, mmy) => {
      const sx = mmx * P.state.zoom + P.state.panX, sy = mmy * P.state.zoom + P.state.panY;
      for (const t of ['pointerdown', 'pointerup']) {
        cv.dispatchEvent(new PointerEvent(t, {
          clientX: rect.left + sx, clientY: rect.top + sy, bubbles: true, pointerId: 1 }));
      }
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
    // 누르고 떼야 한 번의 탭이다(끌기는 도면 이동으로 쓰인다)
    const tap = (mmx, mmy) => {
      const sx = mmx * P.state.zoom + P.state.panX, sy = mmy * P.state.zoom + P.state.panY;
      for (const t of ['pointerdown', 'pointerup']) {
        cv.dispatchEvent(new PointerEvent(t, {
          clientX: rect.left + sx, clientY: rect.top + sy, bubbles: true, pointerId: 1 }));
      }
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
      out.setRows = fsel ? [...fsel.options].filter((o) => /1도어 키친핏 세트/.test(o.textContent)).length : 0;
      if (fsel) {
        const si = [...fsel.options].findIndex((o) => o.textContent.includes('1도어 키친핏 세트 (냉장+냉동+와인+김치)'));
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
    // 사이즈 이름은 자료가 바뀌면 같이 바뀐다(폭 → 용량 → 도어 구성). 여기서 보는 것은
    // 이름이 아니므로 아무 냉장고나 집는다.
    const rep = P.state.reps.find((x) => x.cat === '냉장고' && !x.hidden && x.options && x.options.length);
    if (!rep) return { placed: false, why: '냉장고 대표 치수가 없다' };
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
 * ── 목록 서랍을 닫을 수 있는가 ──
 * 좁은 화면에서 오른쪽 패널은 서랍으로 뜬다. 그런데 하단 요약의 '자세히' 가 **열기만 하고**
 * 서랍 안에 닫기도 없어서, 한 번 열면 다음 작업을 아예 못 했다(사용자 지적).
 * 닫는 길이 하나뿐이면 그 하나가 막혔을 때 갇힌다 — 여러 길을 모두 지킨다.
 */
{
  const r = await page.evaluate(async () => {
    const sd = document.querySelector('#side');
    const on = () => sd.classList.contains('on');
    const wait = () => new Promise((res) => setTimeout(res, 120));
    const out = {};
    const openIt = async () => { document.querySelector('#btn-side').click(); await wait(); };

    await openIt(); out.opens = on();
    document.querySelector('#side-x').click(); await wait(); out.byX = !on();
    await openIt();
    document.querySelector('#btn-side').click(); await wait(); out.byToggle = !on();
    await openIt();
    const cv = document.querySelector('#cv'), bx = cv.getBoundingClientRect();
    /*
     * 캔버스를 누르면 모드에 따라 방 인식이 돌아 **뒤 검사의 상태를 망친다.**
     * 여기서 보려는 것은 "서랍이 닫히는가" 하나뿐이므로 idle 로 두고 누른 뒤 되돌린다.
     */
    const P = window.__place;
    const keepMode = P.state.mode;
    P.state.mode = 'idle';
    cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 91, clientX: bx.left + 20, clientY: bx.top + 20, bubbles: true, pointerType: 'touch' }));
    cv.dispatchEvent(new PointerEvent('pointerup', { pointerId: 91, clientX: bx.left + 20, clientY: bx.top + 20, bubbles: true, pointerType: 'touch' }));
    await wait(); out.byCanvas = !on();
    P.state.mode = keepMode; P.state.drag = null; P.state.sel = null;
    await openIt();
    document.querySelector('#btn-back').click(); await wait(); out.byBack = !on();
    return out;
  });

  if (!r.opens) fail('☰ 를 눌러도 목록 서랍이 안 열린다');
  else if (!r.byX) fail('서랍 안 ✕ 로 안 닫힌다');
  else if (!r.byToggle) fail('☰ 를 다시 눌러도 안 닫힌다');
  else if (!r.byCanvas) fail('도면을 눌러도 서랍이 안 닫힌다 — 좁은 화면에서 갇힌다');
  else if (!r.byBack) fail('← 뒤로가기로 서랍이 안 닫힌다');
  else pass('목록 서랍 — 닫는 길 4가지(✕ · ☰ 재클릭 · 도면 터치 · 뒤로가기) 모두 동작');
}

/*
 * ── 가전은 모드와 상관없이 만지고 돌릴 수 있어야 한다 ──
 * 방을 확정하면 "다른 방도 잡을 수 있게" `detect` 모드가 유지된다. 그 상태에서 가전을 누르면
 * **가전이 아니라 그 자리를 방으로 인식**하려 들어 **이동도 회전도 안 됐다**(사용자 지적).
 * 화면 맨 위에 그려진 것이 가전인데 손은 그 아래 도면을 만지는 셈이었다.
 * 회전은 더블탭 말고 **눈에 보이는 버튼**으로도 돼야 한다 — 더블탭은 알기 어렵다.
 */
{
  const r = await page.evaluate(async () => {
    const P = window.__place;
    P.state.reps = await (await fetch('size-reps.json')).json();
    P.state.img = null; P.state.mmPerPx = 1; P.state.scaled = true;
    P.state.rooms = []; P.state.items = []; P.state.sel = null;
    const W = 6000, H = 4000;
    P.state.walls = [{ x1:0,y1:0,x2:W,y2:0 },{ x1:W,y1:0,x2:W,y2:H },{ x1:W,y1:H,x2:0,y2:H },{ x1:0,y1:H,x2:0,y2:0 }];
    P.addRoom('거실', P.state.walls.map((w) => ({ ...w })));
    // 사이즈 이름은 자료가 바뀌면 같이 바뀐다(폭 → 용량 → 도어 구성). 여기서 보는 것은
    // 이름이 아니므로 아무 냉장고나 집는다.
    const rep = P.state.reps.find((x) => x.cat === '냉장고' && !x.hidden && x.options && x.options.length);
    if (!rep) return { placed: false, why: '냉장고 대표 치수가 없다' };
    const o = rep.options[0];
    const made = P.stageOutside([{ cat: '냉장고', size: rep.size, model: o.model, group: o.group, part: o.parts[0] }]);
    const it = made[0];
    it.bx = 2000; it.by = 500; it.staged = false;
    P.state.zoom = 0.1; P.state.panX = 20; P.state.panY = 20;
    P.evaluate(); P.draw();

    const cv = document.querySelector('#cv'), bx = cv.getBoundingClientRect();
    const scr = (wx, wy) => [wx * P.state.zoom + P.state.panX, wy * P.state.zoom + P.state.panY];
    // 캔버스 위치는 **쏘기 직전에** 다시 잰다 — 앞 검사가 화면 배치를 바꿔 놓았을 수 있다
    const ev = (t, id, x, y) => { const rr = cv.getBoundingClientRect();
      cv.dispatchEvent(new PointerEvent(t, {
        pointerId: id, clientX: rr.left + x, clientY: rr.top + y, bubbles: true, pointerType: 'touch' })); };
    /*
     * 앞 검사가 남긴 포인터가 있으면 이번 pointerdown 이 **두 번째 손가락**으로 취급돼
     * 확대 제스처로 빠진다 — 가전이 안 잡힌다. 시작 전에 모두 취소해 둔다.
     */
    for (let q = 0; q < 100; q++) cv.dispatchEvent(new PointerEvent('pointercancel', { pointerId: q, bubbles: true }));

    const out = {};
    let id = 40;
    for (const mode of ['detect', 'idle', 'wall']) {
      P.state.mode = mode;
      /*
       * 앞 모드에서 이미 골라 둔 상태로 연달아 누르면 **더블탭 회전**으로 먹힌다
       * (앱 동작은 맞고 검사가 너무 빠른 것이다). 매번 선택을 비우고 시작한다.
       */
      P.state.sel = null;
      it.bx = 2000; it.by = 500; it.a = 0; it.staged = false;   // 매번 같은 자리에서 본다
      P.evaluate(); P.draw();
      const c = P.bodyCenter(it); const [ix, iy] = scr(c[0], c[1]);
      // 보려는 것은 **그 가전이 손에 잡히는가**다. 이동량은 벽 스냅 때문에 흔들린다.
      ev('pointerdown', ++id, ix, iy);
      out[mode] = !!(P.state.drag && P.state.drag.id === it.id);
      ev('pointerup', id, ix, iy);
    }
    // 회전 버튼
    P.state.mode = 'idle'; P.state.sel = it.id; P.draw();
    await new Promise((res) => setTimeout(res, 150));
    out.hasRotBtn = !!document.querySelector('#mini-rot');
    const a0 = it.a;
    document.querySelector('#mini-rot')?.click();
    out.deg = Math.round((it.a - a0) * 180 / Math.PI);
    return out;
  });

  const stuck = ['detect', 'idle', 'wall'].filter((m) => !r[m]);
  if (stuck.length) fail(`${stuck.join('·')} 모드에서 가전을 끌 수 없다 — 모드와 상관없이 만져져야 한다`);
  else if (!r.hasRotBtn) fail('고른 가전에 회전 버튼이 없다 — 더블탭만으로는 아무도 모른다');
  else if (r.deg !== 90) fail(`회전 버튼이 ${r.deg}° 돌린다 (기대 90)`);
  else pass('가전 — detect·idle·wall 어디서나 끌리고, 회전 버튼으로 90° 돌아간다');
}

/*
 * ── 한 포인터(마우스·손가락 하나)로도 도면을 옮길 수 있는가 ──
 * 한 포인터는 원래 모드가 정한 일에 묶여 있었다(detect=방 인식, scale=점 찍기, wall=꼭짓점).
 * 그래서 **PC 마우스는 포인터가 하나뿐이라 도면을 옮길 방법이 아예 없었다**(사용자 지적).
 * 지도 앱처럼 **누르기와 끌기를 가른다** — 끌면 이동, 눌렀다 떼면 모드 동작.
 */
{
  const r = await page.evaluate(async () => {
    const P = window.__place;
    const c = document.createElement('canvas'); c.width = 900; c.height = 640;
    const g = c.getContext('2d');
    g.fillStyle = '#FFF'; g.fillRect(0, 0, 900, 640);
    g.fillStyle = '#EFE6D6'; g.fillRect(60, 60, 780, 520);
    g.strokeStyle = '#222'; g.lineWidth = 9; g.strokeRect(60, 60, 780, 520);
    g.beginPath(); g.moveTo(400, 60); g.lineTo(400, 580); g.stroke();
    const url = c.toDataURL();
    await new Promise((res) => { const im = new Image(); im.onload = () => { P.useImage(url); setTimeout(res, 900); }; im.src = url; });
    await new Promise((res) => setTimeout(res, 1800));
    /*
     * 앞 검사에서 꺼내 둔 가전이 남아 있으면 빈 곳인 줄 알고 누른 자리가 가전 위일 수 있다
     * (가전은 모드와 무관하게 먼저 반응한다). 이 검사는 도면 이동만 보므로 비우고 시작한다.
     */
    P.state.items = []; P.state.sel = null;

    const cv = document.querySelector('#cv'), bx = cv.getBoundingClientRect();
    const ev = (t, id, x, y) => cv.dispatchEvent(new PointerEvent(t, {
      pointerId: id, clientX: bx.left + x, clientY: bx.top + y, bubbles: true, pointerType: 'mouse' }));
    const cx = bx.width / 2, cy = bx.height / 2;
    const out = { mode: P.state.mode, at0: JSON.stringify(P.state.draftAt) };

    const px = P.state.panX, py = P.state.panY;
    ev('pointerdown', 1, cx, cy);
    ev('pointermove', 1, cx + 120, cy + 70);
    ev('pointerup', 1, cx + 120, cy + 70);
    out.panned = Math.abs(P.state.panX - px) > 50 && Math.abs(P.state.panY - py) > 30;
    out.atAfterDrag = JSON.stringify(P.state.draftAt);

    // 화면을 되돌린 뒤 도면 왼쪽 방 한가운데를 톡 누른다
    P.state.panX = px; P.state.panY = py; P.draw();
    const at1 = JSON.stringify(P.state.draftAt);
    const k = (P.state.mmPerPx || 1) * P.state.zoom;
    const ax = P.state.imgW * 0.25 * k + P.state.panX;
    const ay = P.state.imgH * 0.5 * k + P.state.panY;
    ev('pointerdown', 2, ax, ay);
    ev('pointerup', 2, ax, ay);
    await new Promise((res) => setTimeout(res, 200));
    out.tapped = JSON.stringify(P.state.draftAt) !== at1;
    return out;
  });

  if (r.mode !== 'detect') fail(`도면을 올린 뒤 모드가 ${r.mode} — 이 검사는 detect 를 전제로 한다`);
  else if (!r.panned) fail('한 포인터로 끌었는데 도면이 안 움직인다 — PC 마우스로는 옮길 방법이 없다');
  else if (r.atAfterDrag !== r.at0) fail('끌기만 했는데 방이 인식됐다 — 끌기와 누르기가 안 갈린다');
  else if (!r.tapped) fail('톡 눌렀는데 방이 인식되지 않는다 — 끌기로만 취급하고 있다');
  else pass('한 포인터 — 끌면 도면 이동, 톡 누르면 모드 동작 (마우스·손가락 하나로 다 됨)');
}

/*
 * ── 휴대폰: 두 손가락으로 확대·이동 ──
 * 한 손가락은 모드가 정한 일(방 인식·축척 점 찍기·가전 끌기)을 하므로, 도면을 올린 직후처럼
 * `detect` 모드에서는 한 손가락으로 팬을 할 수가 없었다. **도면이 화면 밖으로 나가면 되돌릴
 * 방법이 없어 방 선택도 배치도 못 했다**(사용자 지적).
 * 두 손가락은 모드와 무관하게 언제나 확대·이동이어야 하고, 그때 **첫 손가락이 저지른 일은
 * 되돌려야** 한다 — 두 손가락을 정확히 동시에 대는 사람은 없기 때문이다.
 */
{
  const r = await page.evaluate(async () => {
    const P = window.__place;
    const c = document.createElement('canvas'); c.width = 900; c.height = 640;
    const g = c.getContext('2d');
    g.fillStyle = '#FFF'; g.fillRect(0, 0, 900, 640);
    g.fillStyle = '#EFE6D6'; g.fillRect(60, 60, 780, 520);
    g.strokeStyle = '#222'; g.lineWidth = 9; g.strokeRect(60, 60, 780, 520);
    g.beginPath(); g.moveTo(400, 60); g.lineTo(400, 580); g.stroke();
    const url = c.toDataURL();
    await new Promise((res) => { const im = new Image(); im.onload = () => { P.useImage(url); setTimeout(res, 900); }; im.src = url; });
    await new Promise((res) => setTimeout(res, 1800));

    const cv = document.querySelector('#cv');
    const bx = cv.getBoundingClientRect();
    const ev = (t, id, x, y) => cv.dispatchEvent(new PointerEvent(t, {
      pointerId: id, clientX: bx.left + x, clientY: bx.top + y, bubbles: true, pointerType: 'touch', isPrimary: id === 1 }));
    const cx = bx.width / 2, cy = bx.height / 2;
    const out = { mode: P.state.mode, z0: P.state.zoom, at0: JSON.stringify(P.state.draftAt), rooms0: P.state.rooms.length };

    ev('pointerdown', 1, cx - 40, cy); ev('pointerdown', 2, cx + 40, cy);
    ev('pointermove', 1, cx - 140, cy); ev('pointermove', 2, cx + 140, cy);
    ev('pointerup', 1, cx - 140, cy);   ev('pointerup', 2, cx + 140, cy);
    out.zPinch = P.state.zoom;
    out.atPinch = JSON.stringify(P.state.draftAt);
    out.roomsPinch = P.state.rooms.length;

    const px = P.state.panX, py = P.state.panY;
    ev('pointerdown', 3, cx - 60, cy); ev('pointerdown', 4, cx + 60, cy);
    ev('pointermove', 3, cx + 60, cy + 70); ev('pointermove', 4, cx + 180, cy + 70);
    ev('pointerup', 3, cx + 60, cy + 70);   ev('pointerup', 4, cx + 180, cy + 70);
    out.moved = Math.abs(P.state.panX - px) > 20 || Math.abs(P.state.panY - py) > 20;
    return out;
  });

  if (r.mode !== 'detect') fail(`도면을 올린 뒤 모드가 ${r.mode} — 이 검사는 detect 상태를 전제로 한다`);
  else if (!(r.zPinch > r.z0 * 1.5)) fail(`두 손가락을 벌렸는데 확대가 안 된다 (${r.z0.toFixed(3)} → ${r.zPinch.toFixed(3)})`);
  else if (r.atPinch !== r.at0 || r.roomsPinch !== r.rooms0) {
    fail('두 손가락 제스처인데 첫 손가락이 방을 인식해 버렸다 — 되돌려야 한다');
  } else if (!r.moved) fail('두 손가락으로 끌었는데 도면이 안 움직인다');
  else pass(`휴대폰 두 손가락 — 확대 ${r.z0.toFixed(2)}→${r.zPinch.toFixed(2)} · 이동 됨 · detect 모드에서도 방이 잘못 잡히지 않음`);
}

/*
 * ── 축척 기준: 안방의 가로 벽 ──
 * 사용자가 정한 기준이다 — *"거실 크기는 몰라도 안방 치수는 알고 있다"*,
 * *"대부분의 도면 기준으로 가로 길이 벽으로 지정한다"*.
 *
 * 두 가지가 지켜져야 한다:
 *  ① **가장 넓은 방(거실)이 아니라 안방**을 기본으로 잡을 것.
 *     닫힌 주방은 길쭉해서 넓이만 보면 안방보다 클 수 있으므로 **네모난 방**을 앞세운다.
 *  ② 기준 벽이 **가로**일 것. 안방 치수는 상담에서 가로로 이야기하므로,
 *     세로 벽을 재면 고객이 아는 숫자와 어긋나 축척이 통째로 틀어진다.
 */
{
  const r = await page.evaluate(async () => {
    const P = window.__place;
    // 좌측 거실(292×512, 길쭉) · 우측 위 안방(312×292, 네모) · 우측 아래 침실(312×212)
    const c = document.createElement('canvas'); c.width = 900; c.height = 640;
    const g = c.getContext('2d');
    g.fillStyle = '#FFF'; g.fillRect(0, 0, 900, 640);
    g.fillStyle = '#F1EAD9'; g.fillRect(60, 60, 780, 520);
    g.strokeStyle = '#222'; g.lineWidth = 9; g.strokeRect(60, 60, 780, 520);
    g.beginPath(); g.moveTo(360, 60); g.lineTo(360, 580); g.stroke();
    g.beginPath(); g.moveTo(520, 60); g.lineTo(520, 580); g.stroke();
    g.beginPath(); g.moveTo(520, 360); g.lineTo(840, 360); g.stroke();
    const url = c.toDataURL();
    await new Promise((res) => { const im = new Image(); im.onload = () => { P.useImage(url); setTimeout(res, 900); }; im.src = url; });
    await new Promise((res) => setTimeout(res, 2600));

    const area = (poly) => { let a = 0; for (let i = 0; i < poly.length; i++){ const [x1,y1]=poly[i],[x2,y2]=poly[(i+1)%poly.length]; a += x1*y2-x2*y1; } return Math.abs(a)/2; };
    const bb = (poly) => { const xs = poly.map((q)=>q[0]), ys = poly.map((q)=>q[1]);
      return { w: Math.max(...xs)-Math.min(...xs), h: Math.max(...ys)-Math.min(...ys), x1: Math.min(...xs) }; };
    const d = P.state.draft;
    const out = {
      cands: (P.state.roomCands || []).map((c) => Math.round(c.a)),
      candIdx: P.state.candIdx,
      draft: d ? { a: Math.round(area(d)), w: Math.round(bb(d).w), h: Math.round(bb(d).h), x1: Math.round(bb(d).x1) } : null,
      hasNext: !!document.querySelector('#d-next'),
    };
    // 확정 → 이름 → 길이 묻기까지 가서 실제 기준 벽을 본다
    const ok = [...document.querySelectorAll('#draftbar button')].find((x) => x.textContent.trim() === '이 공간 확정');
    if (ok) {
      ok.click();
      await new Promise((res) => setTimeout(res, 500));
      const nb = document.querySelector('#sheet .modal-actions button.primary');
      if (nb) nb.click();
      await new Promise((res) => setTimeout(res, 600));
      const m = P.state.measureSeg;
      if (m) out.seg = { dx: Math.round(Math.abs(m.x2 - m.x1)), dy: Math.round(Math.abs(m.y2 - m.y1)) };
    }
    return out;
  });

  if (!r.draft) fail('도면을 올렸는데 초안이 안 잡혔다');
  else if (r.cands.length < 2) fail(`후보 방이 ${r.cands.length}개 — 넘겨 고를 수 있어야 한다`);
  else if (r.cands.some((a, i) => i && a > r.cands[i - 1])) fail(`후보가 넓은 순이 아니다: ${r.cands}`);
  else if (r.candIdx === 0) {
    fail(`가장 넓은 방(거실 ${r.cands[0]}px²)을 기준으로 잡았다 — 안방이어야 한다`);
  } else if (r.draft.x1 < 400) {
    fail(`왼쪽 거실(x=${r.draft.x1})을 잡았다 — 오른쪽 안방이어야 한다`);
  } else if (Math.max(r.draft.w, r.draft.h) / Math.min(r.draft.w, r.draft.h) >= 2) {
    fail(`잡은 방이 길쭉하다 (${r.draft.w}×${r.draft.h}) — 네모난 안방을 골라야 한다`);
  } else if (!r.hasNext) fail("'다른 방 ▸' 버튼이 없다 — 자동이 틀렸을 때 바로잡을 수 없다");
  else if (!r.seg) fail('길이 묻기 단계에서 기준 벽이 표시되지 않았다');
  else if (r.seg.dx <= r.seg.dy) {
    fail(`기준 벽이 세로다 (Δx ${r.seg.dx} · Δy ${r.seg.dy}) — 가로 벽이어야 한다`);
  } else {
    pass(`축척 기준 = 안방의 가로 벽 — 후보 ${r.cands.length}곳 중 ${r.candIdx + 1}번(${r.draft.w}×${r.draft.h}, 네모)을 잡고 `
      + `가로 벽 ${r.seg.dx}px 를 잰다 (거실 ${r.cands[0]}px² 는 건너뜀)`);
  }
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
  else pass(`도시 → 단지 → 도면 3단계 (도시 ${r.lv1.length}곳 → "경기 수원"의 단지 ${r.lv2.length}곳 → 도면 ${r.lv3.length}장 · 경로 "${r.crumb.replace(/\s+/g, ' ').trim()}")`);

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

/*
 * three.js 는 **3D 를 처음 켤 때** 받는다(2026-08-11). 그 전에는 `window.Place3D` 가
 * 없으므로, 3D 검사에 들어가기 전에 여기서 한 번 불러 둔다 — 앱에서는 `open3D()` 가
 * 같은 일을 한다. 로더가 없으면(옛 방식) 그대로 지나간다.
 */
await page.evaluate(() => (window.load3D ? window.load3D() : null));

/*
 * ── 3D 보기 ────────────────────────────────────────────────────
 * 고객에게 "우리 집 느낌"을 보여주는 화면이다. 여기서 지킬 것은 셋이다:
 *  ① 모듈이 살아 있는가 — three.js 를 CDN 이 아니라 public/vendor/ 에서 부르므로
 *    경로가 깨지면 3D 가 통째로 안 뜬다. 그런데 2D 는 멀쩡해서 눈치채기 어렵다.
 *  ② **좌표계가 뒤집히지 않았는가** — 앱 월드는 y 가 화면 아래쪽이고 3D 는 Y 가 위다.
 *    "XY 에 만들고 X축 −90° 회전" 같은 흔한 방법을 쓰면 z 부호가 뒤집혀 평면도가
 *    좌우 반전된다. 방이 대칭이면 화면으로는 똑같아 보여 눈으로 못 잡는다.
 *  ③ 놓은 가전만 서 있는가 — 대기(staged) 중인 것은 아직 놓은 것이 아니다.
 */
{
  const r = await page.evaluate(() => {
    const P = window.__place;
    if (!window.Place3D) return { err: 'Place3D 없음 — 모듈이 로드되지 않았다(three.js 경로 확인)' };
    /* 3×4m 방 하나를 직접 그려 넣는다. 도면 인식과 무관하게 3D 만 본다. */
    const W = [[0, 0, 4000, 0], [4000, 0, 4000, 3000], [4000, 3000, 0, 3000], [0, 3000, 0, 0]]
      .map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2, open: false }));
    P.state.rooms = []; P.state.items = []; P.state.walls = W;
    P.state.mmPerPx = null; P.state.scaled = true; P.state.img = null;
    P.addRoom('거실', W);
    P.state.items.push({ id: 'a', cat: '냉장고', label: '냉장고', w: 912, h: 1853, d: 930,
      a: 0, bx: 2000, by: 200, warn: [], soft: [], clear: { back: 50, side: 0, front: 0 } });
    P.state.items.push({ id: 'b', cat: 'TV', label: 'TV', w: 1447, h: 830, d: 270,
      a: 0, bx: 9000, by: 9000, staged: true, warn: [], soft: [], clear: { back: 0, side: 0, front: 0 } });
    const info = window.Place3D.open();
    /* 바닥 정점을 꺼내 월드 좌표와 대조한다 */
    const pts = [];
    window.Place3D.root.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.getAttribute && o.geometry.getAttribute('uv') && !pts.length){
        const p = o.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) pts.push([p.getX(i), p.getY(i), p.getZ(i)]);
      }
    });
    window.Place3D.close();
    return { info, pts: pts.slice(0, 24), open: window.Place3D.isOpen };
  });

  if (r.err) fail(r.err);
  else {
    if (r.info.rooms !== 1) fail(`3D: 방이 1곳이어야 하는데 ${r.info.rooms}곳`);
    else if (r.info.items !== 1) fail(`3D: 놓은 가전 1대만 서야 하는데 ${r.info.items}대 (대기 중인 것이 섞였다)`);
    else pass(`3D 보기 — 방 1곳 · 가전 1대 (대기 중 1대는 제외)`);

    /* 바닥은 y=0 평면에 있고, XZ 가 월드 (x, y)/1000 과 부호까지 같아야 한다.
       z 가 음수로 나오면 좌우 반전된 것이다. */
    const ys = r.pts.map((p) => p[1]);
    const xs = r.pts.map((p) => p[0]), zs = r.pts.map((p) => p[2]);
    if (!r.pts.length) fail('3D: 바닥 정점을 찾지 못했다');
    else if (ys.some((v) => Math.abs(v) > 1e-6)) fail('3D: 바닥이 y=0 평면에 있지 않다');
    else if (Math.min(...zs) < -1e-6 || Math.min(...xs) < -1e-6)
      fail(`3D: 좌표계가 뒤집혔다 — 월드 (0..4000, 0..3000) 인데 x[${Math.min(...xs).toFixed(2)}..${Math.max(...xs).toFixed(2)}] z[${Math.min(...zs).toFixed(2)}..${Math.max(...zs).toFixed(2)}]`);
    else if (Math.abs(Math.max(...xs) - 4) > 0.01 || Math.abs(Math.max(...zs) - 3) > 0.01)
      fail(`3D: 바닥 크기가 4×3m 가 아니다 — x최대 ${Math.max(...xs).toFixed(2)} z최대 ${Math.max(...zs).toFixed(2)}`);
    else pass('3D 좌표계 — 월드 (x,y)mm → (x,0,y)m 그대로 (좌우 반전 없음)');

    if (r.open) fail('3D: close() 후에도 열린 상태로 남았다');
  }
}

/*
 * ── 도면 전체 인식 ──
 * *"고객은 어디에 놓을지 정해진 상태가 아니다"* — 그래서 한 번 누르면 온 집을 잡아야 한다.
 * 지키는 것 둘:
 *  ① 방을 여럿 잡는가 (하나만 잡으면 예전으로 돌아간 것이다)
 *  ② **여러 방이 합쳐진 덩어리를 걸러내는가.** 문이 열린 채 그려진 도면에서는 온 집이
 *    한 영역으로 잡혀 전용 85.5㎡ 세대에서 169.6㎡ 가 나온다. 그걸 등록하면 상담에서
 *    그대로 읽힌다.
 */
{
  const b64 = fs.readFileSync(path.join(root, 'public', 'plans', 'c129', '86A.jpg')).toString('base64');
  const r = await page.evaluate(async (b64) => {
    const P = window.__place;
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/jpeg;base64,' + b64; });
    P.state.img = img; P.state.imgW = img.naturalWidth; P.state.imgH = img.naturalHeight;
    P.state.mmPerPx = 16.9; P.state.scaled = true;
    P.state.rooms = []; P.state.items = []; P.state.walls = [];
    /* 도면을 새로 올릴 때 앱이 하는 것과 같이 인식 캐시를 비운다.
       앞선 검사들이 다른 도면으로 만들어 둔 마스크가 남아 있으면 엉뚱한 그림을 인식한다
       (실제로 그래서 5곳이 2곳으로 나왔다). */
    P.state.mask = null; P.state.baseMask = null; P.state.baseInfo = null;
    P.state.cleanCv = null; P.state.cleanInfo = null; P.state.sealCache = null;
    const n = P.detectAllRooms();
    const areas = P.state.rooms.map((rm) => +(P.roomArea(rm) / 1e6).toFixed(1));
    return { n, areas, loops: P.roomLoops().length };
  }, b64);

  /*
   * 합쳐진 덩어리는 **전체 대비 비율**로 잡는다 — 넓이 상한(예: 90㎡)은 세대 크기마다
   * 달라 못 쓴다. 실측으로 정상적인 거실+주방 트인 공간이 42%, 여러 방이 합쳐진
   * 덩어리가 49% 였다. 45% 가 둘을 가른다.
   */
  const sum = r.areas.reduce((s, a) => s + a, 0);
  const big = Math.max(...r.areas);
  if (!(r.n >= 3)) fail(`전체 인식: 공간을 ${r.n}곳만 잡았다 — 도면 전체를 잡아야 한다`);
  else if (r.loops !== r.n) fail(`전체 인식: 잡은 ${r.n}곳 중 3D 가 세울 고리가 ${r.loops}개다`);
  else if (big > sum * 0.45)
    fail(`전체 인식: 한 공간이 전체의 ${(big / sum * 100).toFixed(0)}% (${big}㎡/${sum.toFixed(1)}㎡) — 여러 방이 합쳐진 덩어리를 못 걸렀다`);
  else if (big > 90)
    fail(`전체 인식: ${big}㎡ 짜리 공간이 섞였다 (전용 85.5㎡ 세대)`);
  else pass(`도면 전체 인식 — 공간 ${r.n}곳 (${r.areas.join(' · ')}㎡), 최대가 전체의 ${(big / sum * 100).toFixed(0)}% — 합쳐진 덩어리 없음`);
}

/*
 * ── 도어 열기 — 열었을 때 부딪히는지 ──
 * 값은 설치가이드 원문 실측에서 온다(양문형 전체폭 1,726 / 4도어 1,498 / 콤보 깊이 1,430).
 * 지키는 것 셋:
 *  ① 돌출량이 원문에서 계산한 값과 같은가 — 여기가 틀리면 "들어갑니다"가 거짓이 된다
 *  ② **열리는 도중**을 보는가 — 다 열린 자세만 보면 놓친다. 4도어 문은 125°까지 젖혀지면
 *    제품 앞으로 가 있어 옆과 안 겹치지만, 돌아가는 동안 옆을 쓸고 지나간다
 *  ③ 자유로울 때는 조용한가 — 아무 데서나 "불가"가 뜨면 도구가 쓸모없어진다
 */
{
  const r = await page.evaluate(() => {
    const P = window.__place;
    const W = [[0, 0, 6000, 0], [6000, 0, 6000, 4000], [6000, 4000, 0, 4000], [0, 4000, 0, 0]]
      .map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2, open: false }));
    const mk = (o) => Object.assign({ a: 0, warn: [], soft: [], clear: { back: 0, side: 0, front: 0 } }, o);
    const setup = (fx, front) => {
      P.state.rooms = []; P.state.items = []; P.state.walls = W;
      P.state.mmPerPx = null; P.state.scaled = true; P.state.img = null;
      P.addRoom('주방', W);
      const f = mk({ id: 'f', cat: '냉장고', group: '4도어 프리스탠딩', label: '냉장고',
        w: 912, h: 1853, d: 930, bx: fx, by: 400 });
      P.state.items.push(f);
      if (front) P.state.items.push(mk({ id: 'x', cat: '식기세척기', label: '식기세척기',
        w: 600, h: 815, d: 575, bx: fx, by: 1330 + front }));
      return f;
    };
    const reach = (cat, group, w, d) => {
      const it = mk({ cat, group, w, d, h: 1000, bx: 0, by: 0 });
      return Math.round(P.doorReach(it, P.doorOpenFor(it)));
    };
    const mid = setup(3000, 0);        const midHits = P.doorHits(mid, P.state.items, P.state.walls).length;
    const cor = setup(6000 - 456, 0);  const corHits = P.doorHits(cor, P.state.items, P.state.walls).length;
    const fr  = setup(3000, 150);      const frHits  = P.doorHits(fr, P.state.items, P.state.walls).length;

    /*
     * **스윕이 없으면 못 잡는 자리.** 125° 문은 90° 를 지날 때 앞으로 가장 많이 나오고
     * (511mm) 다 열리면 오히려 덜 나온다(419mm). 그 사이(450mm)에 물건을 두면
     * 최종 자세만 보는 코드는 "안 부딪힌다"고 한다. 힌지 바로 앞에 놓아야 걸린다.
     */
    P.state.rooms = []; P.state.items = []; P.state.walls = W;
    P.state.mmPerPx = null; P.state.scaled = true; P.state.img = null;
    P.addRoom('주방', W);
    const sw = mk({ id: 'f', cat: '냉장고', group: '4도어 프리스탠딩', label: '냉장고',
      w: 912, h: 1853, d: 930, bx: 3000, by: 400 });
    P.state.items.push(sw, mk({ id: 'y', cat: '식기세척기', label: '식기세척기',
      w: 600, h: 815, d: 575, bx: 3000 + 456, by: 1330 + 450 }));
    const sweepHits = P.doorHits(sw, P.state.items, P.state.walls).length;
    /* 같은 배치를 '다 열린 자세'로만 재 본다 — 스윕이 없던 시절의 동작 */
    const finalOnly = P.doorLeaves(sw, 1).some((lf) =>
      P.state.items.filter((o) => o !== sw).some((o) => P.overlaps(lf.poly, P.corners(o))));
    return {
      reachSide: reach('냉장고', '양문형', 912, 930),
      reach4:    reach('냉장고', '4도어 프리스탠딩', 916, 930),
      reachCombo:reach('세탁기·콤보', 'AI 콤보', 686, 875),
      topKimchi: P.doorReach(mk({ cat: '김치냉장고', group: '뚜껑형', w: 925, d: 800 }),
                             P.doorOpenFor(mk({ cat: '김치냉장고', group: '뚜껑형', w: 925, d: 800 }))),
      midHits, corHits, frHits, sweepHits, finalOnly,
    };
  });

  /* ① 원문에서 계산한 돌출량 */
  const want = { reachSide: 407, reach4: 291, reachCombo: 555 };
  const bad = Object.keys(want).filter((k) => Math.abs(r[k] - want[k]) > 1);
  if (bad.length) fail(`도어 돌출량이 설치가이드 값과 다르다 — ${bad.map((k) => `${k} ${r[k]}(기대 ${want[k]})`).join(' · ')}`);
  else pass(`도어 돌출 — 양문형 407mm · 4도어 291mm · 콤보 앞 555mm (설치가이드 실측에서 계산)`);

  if (r.topKimchi !== 0) fail(`뚜껑형 김치냉장고는 위로 열려 평면 돌출이 0이어야 하는데 ${r.topKimchi}`);
  else pass('도어 — 뚜껑형(상부 개폐)은 평면에 영향 없음');

  /* ②③ 판정 */
  if (r.midHits !== 0) fail(`도어: 방 가운데인데 ${r.midHits}건 부딪힌다고 한다 (아무 데서나 불가가 뜨면 못 쓴다)`);
  else if (!r.corHits) fail('도어: 벽에 딱 붙였는데 문이 벽에 막히는 것을 못 잡는다');
  else if (!r.frHits) fail('도어: 앞 150mm 에 제품이 있는데 문이 막히는 것을 못 잡는다 (열리는 도중을 보지 않는다)');
  else pass(`도어 충돌 — 가운데 0건 · 벽 붙임 ${r.corHits}건 · 앞막힘 ${r.frHits}건`);

  /* 스윕이 실제로 일을 하는지 — 다 열린 자세만 보면 놓치는 자리에서 잡아야 한다 */
  if (!r.sweepHits)
    fail('도어: 열리는 도중에만 닿는 자리를 놓친다 (다 열린 자세만 보고 있다)');
  else if (r.finalOnly)
    fail('도어 테스트가 무의미하다 — 다 열린 자세로도 걸리는 자리라 스윕을 검증하지 못한다');
  else pass('도어 — 열리는 도중에만 닿는 자리도 잡는다 (다 열린 자세로는 안 걸리는 배치로 확인)');
}

/*
 * ── 3D 에서 가전 집기 · 시점 유지 ──
 * 지키는 것 둘:
 *  ① 가전 위를 누르면 그 가전이 집힌다(빈 곳은 안 집힌다) — 그래야 끌어 옮길 수 있고,
 *    빈 곳을 끌면 카메라가 돈다.
 *  ② **문 열기·이름표를 켜도 보던 각도를 잃지 않는다.** build() 가 끝에서 늘 화면을
 *    다시 맞추던 시절에는, 가전을 끄는 동안 매 프레임 카메라가 제자리로 튕겨 나갔다.
 */
{
  const r = await page.evaluate(() => {
    const P = window.__place;
    if (!window.Place3D) return { err: 'Place3D 없음' };
    const W = [[0, 0, 8000, 0], [8000, 0, 8000, 6000], [8000, 6000, 0, 6000], [0, 6000, 0, 0]]
      .map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2, open: false }));
    const mk = (o) => Object.assign({ a: 0, warn: [], soft: [], clear: { back: 0, side: 0, front: 0 } }, o);
    P.state.rooms = []; P.state.items = []; P.state.walls = W;
    P.state.mmPerPx = null; P.state.scaled = true; P.state.img = null;
    P.addRoom('거실', W);
    const it = mk({ id: 'f', cat: '냉장고', group: '4도어 프리스탠딩', label: '냉장고',
      w: 912, h: 1853, d: 930, bx: 4000, by: 2500 });
    P.state.items.push(it);
    window.Place3D.open();
    window.Place3D.view('top');
    window.Place3D.render();

    /* 가전 몸통 중심을 화면으로 투영해 그 자리를 눌러 본다 */
    const cam = window.Place3D.camera, cv = window.Place3D.canvas;
    const [cx, cy] = P.bodyCenter(it);
    const V = Object.getPrototypeOf(cam.position).constructor;
    const v = new V(cx / 1000, (it.h / 2) / 1000, cy / 1000);
    v.project(cam);
    const rect = cv.getBoundingClientRect();
    const sx = rect.left + (v.x + 1) / 2 * rect.width;
    const sy = rect.top + (-v.y + 1) / 2 * rect.height;

    const onItem = window.Place3D.pickAt(sx, sy);
    const onEmpty = window.Place3D.pickAt(rect.left + 6, rect.top + 6);
    const ground = window.Place3D.floorAt(sx, sy);

    const before = [cam.position.x, cam.position.y, cam.position.z].map((n) => n.toFixed(3)).join(',');
    window.Place3D.doors(true); window.Place3D.tags(true); window.Place3D.render();
    const after = [cam.position.x, cam.position.y, cam.position.z].map((n) => n.toFixed(3)).join(',');
    window.Place3D.doors(false); window.Place3D.tags(false); window.Place3D.close();
    return { picked: onItem && onItem.id, empty: onEmpty && onEmpty.id, ground, before, after };
  });

  if (r.err) fail(r.err);
  else {
    if (r.picked !== 'f') fail(`3D 집기: 가전 위를 눌렀는데 ${r.picked || '아무것도'} 집혔다`);
    else if (r.empty) fail(`3D 집기: 빈 곳을 눌렀는데 ${r.empty} 가 집혔다 — 그러면 카메라를 돌릴 수 없다`);
    else pass('3D 집기 — 가전 위는 그 가전이, 빈 곳은 아무것도 안 집힌다');

    /* 바닥 투영이 가전 자리 근처를 가리켜야 끌어 옮길 때 손과 물건이 따로 놀지 않는다 */
    if (!r.ground) fail('3D: 바닥면 투영이 실패한다 (끌어 옮길 수 없다)');
    else if (Math.hypot(r.ground[0] - 4000, r.ground[1] - 2500 - 465) > 900)
      fail(`3D: 바닥 투영이 엉뚱한 곳을 가리킨다 — (${r.ground.map(Math.round)})`);
    else pass(`3D 바닥 투영 — (${r.ground.map(Math.round).join(', ')})mm`);

    if (r.before !== r.after)
      fail(`3D: 문 열기·이름표를 켰더니 시점이 바뀐다 (${r.before} → ${r.after}) — 끄는 동안 카메라가 튕긴다`);
    else pass('3D 시점 유지 — 문 열기·이름표를 켜도 보던 각도 그대로');
  }

  /*
   * 고르기·회전 — 끌어 옮기기만 되고 못 돌리면 벽에 붙일 수가 없다.
   * 회전 각도는 **카테고리가 정한다**(에어컨 45° — 거실 모서리에 비스듬히 놓는 설치가 흔하다).
   * 2D 와 같은 `rotStep` 을 쓰는지 확인한다 — 한쪽만 고치면 "버튼은 45°인데 더블탭은 90°"가 된다.
   */
  const rot = await page.evaluate(() => {
    const P = window.__place;
    const W = [[0, 0, 8000, 0], [8000, 0, 8000, 6000], [8000, 6000, 0, 6000], [0, 6000, 0, 0]]
      .map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2, open: false }));
    const mk = (o) => Object.assign({ a: 0, warn: [], soft: [], clear: { back: 0, side: 0, front: 0 } }, o);
    P.state.rooms = []; P.state.items = []; P.state.walls = W;
    P.state.mmPerPx = null; P.state.scaled = true; P.state.img = null;
    P.addRoom('거실', W);
    P.state.items.push(
      mk({ id: 'f', cat: '냉장고', group: '4도어 프리스탠딩', label: '냉장고', w: 912, h: 1853, d: 930, bx: 3000, by: 2500 }),
      mk({ id: 'ac', cat: '에어컨', group: '무풍 클래식', label: '에어컨', w: 363, h: 1883, d: 363, bx: 6000, by: 2500 }));
    window.Place3D.open();
    const out = {};
    for (const id of ['f', 'ac']) {
      P.state.sel = id;
      window.Place3D.doors(false);                 // 안내띠를 다시 그려 버튼이 붙게 한다
      const btn = document.getElementById('d3-rot');
      if (!btn) { out[id] = { err: '회전 버튼이 안 뜬다' }; continue; }
      const it = P.state.items.find((x) => x.id === id);
      const a0 = it.a;
      btn.click();
      out[id] = { label: btn.textContent.replace(/\D/g, ''), deg: Math.round((it.a - a0) * 180 / Math.PI) };
    }
    const hasDel = !!document.getElementById('d3-del');
    P.state.sel = null; window.Place3D.doors(false);
    const gone = !document.getElementById('d3-rot');
    window.Place3D.close();
    return { ...out, hasDel, gone };
  });

  if (rot.f && rot.f.err) fail('3D 고르기: ' + rot.f.err);
  else if (rot.f.deg !== 90) fail(`3D 회전: 냉장고가 ${rot.f.deg}° 돌았다 (기대 90°)`);
  else if (rot.ac.deg !== 45) fail(`3D 회전: 에어컨이 ${rot.ac.deg}° 돌았다 (기대 45° — 대각선 설치가 흔하다)`);
  else if (rot.f.label !== '90' || rot.ac.label !== '45')
    fail(`3D 회전: 버튼에 적힌 각도가 실제와 다르다 (${rot.f.label}°/${rot.ac.label}°) — 화면이 거짓말을 한다`);
  else if (!rot.hasDel) fail('3D: 고른 가전에 삭제 버튼이 없다');
  else if (!rot.gone) fail('3D: 선택을 풀었는데 회전 버튼이 남아 있다');
  else pass('3D 고르기·회전 — 냉장고 90° · 에어컨 45° (버튼 글자와 실제가 같다)');

  /*
   * 3D 를 켠 채로 가전을 고르면 **바로 나타나야 한다.** 예전에는 2D 로 돌아가야 보였다 —
   * 고객 앞에서 화면이 왔다 갔다 한다. 대기 중인 것은 흐리게 세우고(2D 의 회색 점선과
   * 같은 뜻) 끌어서 방 안으로 넣으면 그때부터 배치로 센다.
   */
  const live = await page.evaluate(() => {
    const P = window.__place;
    const W = [[0, 0, 8000, 0], [8000, 0, 8000, 6000], [8000, 6000, 0, 6000], [0, 6000, 0, 0]]
      .map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2, open: false }));
    P.state.rooms = []; P.state.items = []; P.state.walls = W; P.state.sel = null;
    P.state.mmPerPx = null; P.state.scaled = true; P.state.img = null;
    P.addRoom('거실', W);
    const info0 = window.Place3D.open();
    const count = () => { let n = 0; window.Place3D.root.traverse((o) => { if (o.userData && o.userData.item) n++; }); return n; };
    const before = count();
    P.stageOutside([{ cat: '냉장고', size: '4도어', group: '4도어', model: 'X',
      part: { part: '본체', w: 912, h: 1853, d: 930 } }]);
    const afterAdd = count();
    const barTxt = document.getElementById('d3bar').textContent;
    /* 방 안으로 옮기면 배치로 넘어간다 */
    const it = P.state.items[0];
    it.bx = 4000; it.by = 3000; it.staged = false;
    P.evaluate(); P.draw();
    const now = window.Place3D.doors(false);
    window.Place3D.close();
    return { before, afterAdd, waiting: /대기 1대/.test(barTxt), items: now.items, left: now.waiting, rooms: info0.rooms };
  });

  if (live.afterAdd <= live.before)
    fail('3D: 가전을 골라도 3D 에 나타나지 않는다 — 2D 로 돌아가야만 보인다');
  else if (!live.waiting) fail('3D: 대기 중인 가전이 있는데 안내띠가 알리지 않는다');
  else if (live.items !== 1 || live.left !== 0)
    fail(`3D: 방 안으로 넣었는데 배치 ${live.items}대 · 대기 ${live.left}대 (기대 1·0)`);
  else pass('3D 즉시 반영 — 고르면 흐리게 서고, 방에 넣으면 배치로 넘어간다');
}

/*
 * ── 3D 결과 공유 — 화면에 보이는 것이 그대로 나가는가 ──
 * 상담이 끝나면 고객 손에 남는 것이 이 카드다. 두 가지를 지킨다:
 *  ① 3D 를 보고 있으면 3D 그림이 나간다(2D 가 아니라)
 *  ② **지금 상태**가 나간다. `preserveDrawingBuffer` 는 마지막으로 그린 프레임을 보관할
 *    뿐이라, 장면을 바꾼 직후 캔버스를 복사하면 바뀌기 전 그림이 나간다 — 실제로 문을
 *    연 직후 공유했더니 **문이 닫힌 냉장고**가 찍혔다. 내보내기 전에 한 장 다시 그린다.
 */
{
  const r = await page.evaluate(() => {
    const P = window.__place;
    const W = [[0, 0, 6000, 0], [6000, 0, 6000, 4000], [6000, 4000, 0, 4000], [0, 4000, 0, 0]]
      .map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2, open: false }));
    const mk = (o) => Object.assign({ a: 0, warn: [], soft: [], clear: { back: 0, side: 0, front: 0 } }, o);
    P.state.rooms = []; P.state.items = []; P.state.walls = W;
    P.state.mmPerPx = null; P.state.scaled = true; P.state.img = null;
    P.addRoom('주방', W);
    P.state.items.push(
      mk({ id: 'f', cat: '냉장고', group: '4도어 프리스탠딩', label: '냉장고', w: 912, h: 1853, d: 930, bx: 3000, by: 400 }),
      mk({ id: 'x', cat: '식기세척기', label: '식기세척기', w: 600, h: 815, d: 575, bx: 3456, by: 1780 }));
    window.Place3D.open();

    const grab = () => {
      const c = P.buildShareCanvas();
      /* 그림 부분만 비교한다 — 아래 목록은 문 상태와 무관하게 글자가 바뀐다 */
      const s = document.createElement('canvas'); s.width = 80; s.height = 60;
      s.getContext('2d').drawImage(c, 0, 0, c.width, Math.round(c.height * 0.6), 0, 0, 80, 60);
      return s.toDataURL();
    };
    window.Place3D.doors(false); const closed = grab();
    window.Place3D.doors(true);  const opened = grab();
    const c = P.buildShareCanvas();
    const cv3 = window.Place3D.canvas;
    window.Place3D.doors(false);
    return { same: closed === opened, w: c.width, cw: cv3.width, on: window.Place3D.isOpen };
  });

  if (r.same)
    fail('3D 공유: 문을 열기 전후의 카드가 똑같다 — 바뀌기 전 프레임이 나가고 있다(내보내기 전 다시 그려야 한다)');
  else pass('3D 공유 — 지금 상태가 그대로 카드에 나간다 (문 열기 전후 그림이 다르다)');

  if (!r.w) fail('3D 공유: 카드가 만들어지지 않았다');
}

/*
 * ── 3D 가전 디테일 — 2D 실루엣과 같은 품목에 붙어 있는가 ──
 * 같은 품목이 앱마다 다른 그림이면 상담사 눈이 헤맨다. 2D `drawGlyph` 가 실루엣을 그리는
 * 품목은 3D 도 흰 상자로 두면 안 된다. 반대로 **2D 에 없는 품목(리빙 4종)은 3D 에도
 * 만들지 않는다** — 근거 없이 지어낸 외형은 고객이 실물로 오해한다.
 * 상자 본체(1) + 모서리선(1) 뿐이면 디테일이 없는 것이다.
 */
{
  const r = await page.evaluate(() => {
    const P = window.__place;
    if (!window.Place3D) return { err: 'Place3D 없음' };
    const W = [[0, 0, 8000, 0], [8000, 0, 8000, 6000], [8000, 6000, 0, 6000], [0, 6000, 0, 0]]
      .map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2, open: false }));
    const cats = [...new Set((P.state.reps || []).filter((s) => !s.hidden).map((s) => s.cat))];
    const out = {};
    for (const cat of cats) {
      const rep = (P.state.reps || []).find((s) => s.cat === cat && s.parts && s.parts[0]);
      if (!rep) continue;
      const p = rep.parts[0];
      P.state.rooms = []; P.state.items = []; P.state.walls = W;
      P.state.mmPerPx = null; P.state.scaled = true; P.state.img = null;
      P.addRoom('거실', W);
      P.state.items.push({ id: 'x', cat, size: rep.size, group: rep.group, label: cat,
        w: p.w, h: p.h, d: p.d, a: 0, bx: 4000, by: 1000, warn: [], soft: [],
        clear: { back: 0, side: 0, front: 0 } });
      window.Place3D.open();
      let parts = 0;
      window.Place3D.root.traverse((o) => { if (o.isMesh || o.isLineSegments) parts++; });
      window.Place3D.close();
      // 방 바닥 1 + 벽 4 + 본체 1 + 모서리선 1 = 7 이 "디테일 없음"의 기준선
      out[cat] = parts - 7;
    }
    return { out };
  });

  if (r.err) fail(r.err);
  else {
    /* 2D drawGlyph 가 실루엣을 그리는 품목 = 3D 도 디테일이 있어야 하는 품목 */
    const NEEDS = /^냉장고|김치냉장고|냉동고|^업소용|세탁기|콤보|건조기|에어드레서|슈드레서|^TV|모니터|사운드바|인덕션|전기레인지|식기세척기|전자레인지|오븐|데이코|공기청정기|청소기|정수기|제습기|에어컨/;
    const cats = Object.keys(r.out);
    const missing = cats.filter((c) => NEEDS.test(c) && r.out[c] <= 0);
    const extra = cats.filter((c) => !NEEDS.test(c) && r.out[c] > 0);

    if (!cats.length) fail('3D 디테일: 카테고리를 하나도 못 읽었다 (size-reps 로드 실패?)');
    else if (missing.length)
      fail(`3D 디테일 없음 — 2D 는 실루엣을 그리는데 3D 는 흰 상자다: ${missing.join(', ')}`);
    else if (extra.length)
      fail(`3D 디테일이 2D 에 없는 품목에 붙었다 (지어낸 외형): ${extra.join(', ')}`);
    else {
      const withD = cats.filter((c) => r.out[c] > 0).length;
      pass(`3D 가전 디테일 — ${cats.length}개 카테고리 중 ${withD}개에 디테일 (2D 실루엣과 일치, 리빙 ${cats.length - withD}종은 양쪽 다 없음)`);
    }
  }
}

/*
 * ── 도면이 아닌 이미지를 화면이 알리는가 ────────────────────────────
 *
 * 색인 617장에는 2D 평면도만 있지 않다. 입체 렌더링·인테리어 사진·품목표·제목 띠가
 * "평면도"로 분류돼 함께 들어와 있다(실측: 기울기 0.35 미만 46장). 벽 인식 전체가
 * "벽은 가로·세로로 곧은 띠"라는 전제 위에 서 있어 그런 이미지에서는 글씨·범례가
 * 벽이 되고 **얇은 띠 같은 방**이 나오는데, 예전에는 화면이 한 마디도 안 했다.
 *
 * 이미지를 거부하지는 않는다 — 위가 입체, 아래가 평면인 도면이 실제로 있고 아래만
 * 보면 멀쩡히 인식된다. **경고를 붙일 뿐이고, 멀쩡한 도면에 붙으면 그게 실패다.**
 */
{
  const CASES = [
    ['입체 렌더링',   'plans/c09/85.jpg',     true],
    ['입체 렌더링',   'plans/c114/T2.jpg',    true],
    ['인테리어 사진', 'plans/c133/T2.jpg',    true],
    ['품목표 지면',   'plans/c26/T9.jpg',     true],
    ['제목 띠',       'plans/c123/100-2.jpg', true],
    ['2D 평면도',     'plans/c39/117B.jpg',   false],
    ['2D 평면도',     'plans/c86/85A.jpg',    false],
    ['2D 평면도',     'plans/c26/T1.jpg',     false],
    ['2D 평면도',     'plans/c85/23.jpg',     false],
    /* 위가 입체·아래가 평면인 한 장. 아래쪽만 보면 쓸 수 있으므로 **경고가 붙으면 안 된다** */
    ['입체+평면 한 장', 'plans/c72/59.jpg',   false],
  ];
  const got = [];
  for (const [kind, file, want] of CASES){
    const r = await page.evaluate(async (f) => {
      const P = window.__place;
      const img = new Image();
      await new Promise((ok2, no) => { img.onload = ok2; img.onerror = no; img.src = '/' + f; });
      P.state.img = img; P.state.imgW = img.naturalWidth; P.state.imgH = img.naturalHeight;
      P.state.mmPerPx = null; P.state.scaled = false;
      P.state.rooms = []; P.state.items = []; P.state.walls = [];
      P.state.mask = P.state.baseMask = P.state.baseInfo = null;
      P.state.cleanCv = P.state.cleanInfo = null; P.state.sealCache = null;
      P.ensureClean();
      const bi = P.state.baseInfo || {};
      return { tilted: !!bi.tilted, axis: bi.axis };
    }, file);
    got.push({ kind, file, want, ...r });
  }
  const wrong = got.filter((g) => g.tilted !== g.want);
  const falsePos = wrong.filter((g) => g.tilted);      // 멀쩡한 도면에 경고가 붙은 것 — 제일 나쁘다
  if (falsePos.length)
    fail(`도면 판별: 쓸 수 있는 도면에 경고가 붙었다 — ${falsePos.map((g) => `${g.file}(기울기 ${g.axis.toFixed(2)})`).join(', ')}`);
  else if (wrong.length)
    fail(`도면 판별: 도면이 아닌데 경고가 안 붙었다 — ${wrong.map((g) => `${g.file}(기울기 ${g.axis.toFixed(2)})`).join(', ')}`);
  else {
    const lo = Math.min(...got.filter((g) => !g.want).map((g) => g.axis));
    const hi = Math.max(...got.filter((g) => g.want).map((g) => g.axis));
    pass(`도면 아님 알림 — ${CASES.length}장 전부 기대대로 (도면 최저 기울기 ${lo.toFixed(2)} > 경고선 0.35, 비도면 최고 ${hi.toFixed(2)}는 띠 포기로 잡힘)`);
  }
}

/*
 * ── 도면에 인쇄된 방 이름을 붙이는가 ──────────────────────────────────
 *
 * 잡은 공간에 넓이 순서대로 이름을 붙이면 도면에는 '침실1' 이라고 적혀 있는데 화면은
 * '주방' 이라고 부르는 일이 생긴다(2026-08-12 사용자 지적). 파이프라인에서 미리 읽어 둔
 * `plan-names.json` 의 좌표로 그 방에 이름을 붙인다.
 * **런타임 OCR 이 아니다** — 한국어 학습 데이터가 15MB 라 매장 기기에서 받게 할 수 없다.
 */
{
  const r = await page.evaluate(async () => {
    const P = window.__place;
    const names = await P.loadPlanNames();
    if (!names || !names['plans/c139/84B.jpg']) return { skip: '이 도면의 이름 자료가 없다' };
    await new Promise((ok, no) => { const t = setTimeout(no, 15000);
      P.useImage('/plans/c139/84B.jpg', () => { clearTimeout(t); ok(); }); });
    await new Promise((res) => setTimeout(res, 2200));
    P.state.mmPerPx = 13.91; P.state.scaled = true;
    P.state.rooms = []; P.state.items = [];
    P.state.mask = P.state.baseMask = P.state.baseInfo = null;
    P.state.cleanCv = P.state.cleanInfo = null; P.state.sealCache = null;
    P.detectAllRooms();
    const applied = P.nameRoomsFromPlan();
    const rooms = P.state.rooms.map((x) => ({ n: x.name, a: +(P.roomArea(x) / 1e6).toFixed(1) }));
    return { applied, rooms, planFile: P.state.planFile };
  });

  if (r.skip) console.log(`SKIP: 방 이름 붙이기 — ${r.skip}`);
  else {
    const dup = r.rooms.map((x) => x.n).filter((n, i, a) => a.indexOf(n) !== i);
    const big = r.rooms.slice().sort((a, c) => c.a - a.a)[0];
    if (!r.applied) fail('도면에 이름이 있는데 한 곳도 못 붙였다');
    else if (dup.length) fail(`같은 이름이 둘 이상이다 — ${dup.join(', ')}`);
    /* 홍천 84B 는 가장 넓은 곳이 거실이다. 순서로 붙이면 '침실1' 이 되던 자리다. */
    else if (big.n !== '거실') fail(`가장 넓은 ${big.a}㎡ 가 '${big.n}' 이다 — 도면에는 거실로 적혀 있다`);
    else pass(`방 이름 — 도면에서 ${r.applied}개를 읽어 붙였다 (${r.rooms.slice(0, 4).map((x) => x.n + ' ' + x.a).join(' · ')} …)`);
  }
}

/*
 * ── 같은 자리를 다시 누르면 합쳐지는가 ────────────────────────────────
 *
 * `state.walls` 는 모든 방의 경계를 그냥 합친 것이라(syncWalls), 같은 자리를 두 번 잡으면
 * **그 경계가 벽으로 두 겹** 남는다(2026-08-12 사용자 지적: *"중복된 경계선이 벽으로
 * 인식이 됩니다"*). 화면이 두꺼워지는 데 그치지 않고 벽 스냅·방 밖 판정이 있지도 않은
 * 벽을 기준으로 돈다.
 */
{
  const r = await page.evaluate(async () => {
    const P = window.__place;
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = '/plans/c139/84B.jpg'; });
    P.state.img = img; P.state.imgW = img.naturalWidth; P.state.imgH = img.naturalHeight;
    P.state.mmPerPx = 13.91; P.state.scaled = true;
    P.state.rooms = []; P.state.items = [];
    P.state.mask = P.state.baseMask = P.state.baseInfo = null;
    P.state.cleanCv = P.state.cleanInfo = null; P.state.sealCache = null;
    P.detectAllRooms();
    const before = { rooms: P.state.rooms.length, walls: P.state.walls.length };
    const big = P.state.rooms.slice().sort((a, c) => P.roomArea(c) - P.roomArea(a))[0];
    if (!big) return { err: '방을 하나도 못 잡았다' };
    const L = P.loopOfWalls(big.parts[0].walls) || [];
    const cx = L.reduce((s, q) => s + q[0], 0) / L.length / P.state.mmPerPx;
    const cy = L.reduce((s, q) => s + q[1], 0) / L.length / P.state.mmPerPx;
    let res; try { res = P.detectRoomAt(cx, cy); } catch (_) { res = { error: '실패' }; }
    if (!res || res.error) return { err: '같은 자리를 다시 인식하지 못했다' };
    P.applyDetected(res.poly, res.edges, { name: '다시 누른 방' });
    return { before, after: { rooms: P.state.rooms.length, walls: P.state.walls.length } };
  });

  if (r.err) fail(`중복 합치기: ${r.err}`);
  else if (r.after.rooms > r.before.rooms)
    fail(`같은 자리를 다시 눌렀는데 방이 ${r.before.rooms} → ${r.after.rooms}곳으로 늘었다 — 경계가 두 겹이 된다`);
  else if (r.after.walls > r.before.walls)
    fail(`같은 자리를 다시 눌렀는데 경계가 ${r.before.walls} → ${r.after.walls}구간으로 늘었다`);
  else pass(`중복 합치기 — 같은 자리를 다시 눌러도 ${r.after.rooms}곳 · 경계 ${r.after.walls}구간 그대로`);
}

/*
 * ── 축척을 맞추면 도면 전체가 잡히는가 ────────────────────────────────
 *
 * 축척은 방 하나의 가로 벽만 있으면 나오지만 배치는 집 전체가 있어야 한다.
 * 예전에는 축척 단계에서 **그 한 방만 등록하고 끝나서**, `벽 자동 인식`을 따로 누르지
 * 않으면 3D 에도 그 방 하나만 섰다(2026-08-12 사용자 지적:
 * *"부분선택을 하고 자동으로 축척이 완료되면 전체벽을 3D화 해야합니다"*).
 */
{
  const r = await page.evaluate(async () => {
    const P = window.__place;
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('load')), 9000);
      P.useImage('/plans/c39/84.jpg', () => { clearTimeout(t); res(); }); });
    await new Promise((res) => setTimeout(res, 2200));
    if (!P.state.draft) return { err: '도면을 올렸는데 초안이 안 잡혔다' };
    /* 이 공간 확정 → 이름 확정 → 벽 길이 입력 → 확정 */
    const ok = [...document.querySelectorAll('#draftbar button')].find((x) => /이 공간 확정/.test(x.textContent));
    if (!ok) return { err: '초안 막대에 확정 버튼이 없다' };
    ok.click();
    await new Promise((res) => setTimeout(res, 400));
    const nb = document.querySelector('#sheet .modal-actions button.primary');
    if (nb) nb.click();
    await new Promise((res) => setTimeout(res, 600));
    const one = P.state.rooms.length;                 // 축척 단계에서 잡힌 방 수
    const wl = document.getElementById('wl');
    if (!wl) return { err: '벽 길이 입력칸이 안 떴다' };
    /* 화면 정리로 도구막대에서 뺀 두 손잡이가 이 막대 안에 살아 있는지 —
       '다음'(다른 벽·다른 방)과 '치수선 두 점으로'(치수가 인쇄된 8% 도면의 유일한 길) */
    const hasNext = !!document.getElementById('wl-next');
    const hasTwo = !!document.getElementById('wl-two');
    wl.value = '3600';
    document.getElementById('wl-ok').click();
    await new Promise((res) => setTimeout(res, 4000));
    const info = window.Place3D.open();
    window.Place3D.close();
    return { one, after: P.state.rooms.length, in3d: info.rooms, scaled: P.state.scaled, hasNext, hasTwo };
  });

  if (r.err) fail(`축척→전체: ${r.err}`);
  else if (!r.scaled) fail('축척→전체: 길이를 넣었는데 축척이 확정되지 않았다');
  else if (r.after < 4)
    fail(`축척→전체: 축척을 맞췄는데 공간이 ${r.after}곳뿐이다 — 도면 전체가 아니라 부분만 잡혔다`);
  else if (r.in3d !== r.after)
    fail(`축척→전체: 잡힌 공간 ${r.after}곳인데 3D 에는 ${r.in3d}곳만 섰다`);
  else if (!r.hasNext) fail("길이 입력 막대에 '다음'(다른 벽·다른 방)이 없다 — 아는 벽을 고를 길이 막혔다");
  else if (!r.hasTwo) fail("길이 입력 막대에 '치수선 두 점으로'가 없다 — 치수가 인쇄된 도면이 갈 곳이 없다");
  else pass(`축척→전체 — 축척 단계 ${r.one}곳 → 도면 전체 ${r.after}곳, 3D 도 ${r.in3d}곳 전부 · 막대에 다음·두점 손잡이 있음`);
}

/*
 * ── 단지 불러오기 목록에서 도면 아닌 이미지를 뺐는가 ──────────────────
 *
 * 색인의 관문("방 이름 3종류 이상")을 아이소메트릭 렌더링·인테리어 사진·품목표·단지
 * 배치도가 통과해 들어와 있다. 목록에서 빼되, **단지가 통째로 사라지면 안 된다** —
 * 도면 한 장을 빼는 것은 "이건 평면도가 아니다"이지만 단지가 사라지면 "그 단지 도면이
 * 없다"는 다른 말이 되고, 그건 사실이 아니다.
 */
{
  const r = await page.evaluate(async () => {
    const P = window.__place;
    const raw = await P.loadPlanIndex();
    await P.openLibrary();
    await new Promise((res) => setTimeout(res, 400));
    const rows = () => [...document.querySelectorAll('#libbody .libitem')];
    const clickText = async (re) => {
      const el = rows().find((b) => re.test(b.textContent));
      if (!el) return false;
      el.click();
      await new Promise((res) => setTimeout(res, 350));
      return true;
    };
    const chip = [...document.querySelectorAll('#libchips .chip')].find((c) => /강원/.test(c.textContent));
    if (chip) { chip.click(); await new Promise((res) => setTimeout(res, 300)); }
    if (!await clickText(/원주/)) return { err: '도시 목록에서 원주를 못 찾았다' };
    if (!await clickText(/원주무실/)) return { err: '단지 목록에서 원주무실을 못 찾았다' };
    const files = rows().map((b) => b.dataset.file);
    /* 원본 색인에서 이 단지가 원래 몇 장인지 */
    const c = raw.find((x) => /원주무실/.test(x.complex));
    return { files, rawFiles: (c.plans || []).map((p) => p.file),
             lowFiles: (c.plans || []).filter((p) => p.axis != null && p.axis < 0.35).map((p) => p.file) };
  });

  if (r.err) fail(`단지 목록: ${r.err}`);
  else if (!r.lowFiles.length) fail('단지 목록 검사용 단지(원주무실)에 0.35 미만 도면이 없다 — 색인에 axis 가 없는 듯');
  else {
    const leaked = r.files.filter((f) => r.lowFiles.includes(f));
    const lost = r.rawFiles.filter((f) => !r.lowFiles.includes(f) && !r.files.includes(f));
    if (leaked.length) fail(`단지 목록에 도면 아닌 이미지가 남았다 — ${leaked.join(', ')}`);
    else if (lost.length) fail(`단지 목록에서 멀쩡한 도면이 사라졌다 — ${lost.join(', ')}`);
    else pass(`단지 목록에서 비-평면도 제외 — 원주무실 ${r.rawFiles.length}장 중 ${r.files.length}장만 보인다`);
  }
}

/* 알려진 미해결은 **조용히 넘기지 않는다** — 몇 건인지 늘 보이게 적는다.
   실패로 세지 않을 뿐이고, 숨기는 것과는 다르다. */
if (knownGaps.length){
  console.log(`\n알려진 미해결 ${knownGaps.length}건 (인식이 아직 못 따라가는 자리 — 실패로 세지 않음):`);
  knownGaps.forEach((g) => console.log('  · ' + g));
  console.log('');
}

if (errs.length) fail(`도면 인식 중 스크립트 오류 ${errs.length}건: ${errs[0]}`);
else pass('전 도면에서 스크립트 오류 없음');

await browser.close();
server.close();
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
