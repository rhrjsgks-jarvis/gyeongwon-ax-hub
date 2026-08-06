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

if (errs.length) fail(`도면 인식 중 스크립트 오류 ${errs.length}건: ${errs[0]}`);
else pass('전 도면에서 스크립트 오류 없음');

await browser.close();
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
