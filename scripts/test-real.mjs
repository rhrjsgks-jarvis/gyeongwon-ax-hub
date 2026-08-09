/*
 * 실제 분양 도면 회귀 검사 — `npm run test:real`
 *
 * 합성 코퍼스(`test-plans.mjs`)는 "이런 표기 유형에서 안 깨진다"까지만 보증한다.
 * 실제로 상담에서 터진 문제는 전부 진짜 도면에서 나왔다:
 *   · 축척 기준으로 창틀 조각(32×21px)이 뽑힘
 *   · 기준 벽이 벽면이 아니라 창 구간만 잡힘
 *   · 세대 전체가 방 하나로 잡혀 "거실 51.9㎡"
 * 전부 사용자가 매장에서 손으로 찾아 준 것들이라, 그 확인을 여기가 대신한다.
 *
 * **한 장 한 장의 정답을 적지 않는다.** 도면에 치수가 인쇄된 것이 8%뿐이라 손으로 잰
 * 기대값을 채울 수 없고, 앱이 내놓은 값을 적으면 검사가 아무것도 지키지 못한다.
 * 대신 **여러 장을 훑어 품질 지표가 나빠지지 않았는지**를 본다. 지표와 기준선은
 * 2026-08-09 실측값이며, 고칠 때마다 이 숫자가 좋아지는지로 확인하면 된다.
 *
 * 도면 이미지는 `public/plans/` 에 이미 있다(색인과 함께 배포되는 것들).
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'public');

let ok = true;
const fail = (m) => { console.log('ERROR:', m); ok = false; };
const pass = (m) => console.log('OK:', m);

const idxPath = path.join(root, 'plan-index.json');
if (!fs.existsSync(idxPath)) {
  console.log('SKIP: plan-index.json 이 없습니다 — npm run build:plans 로 만듭니다');
  process.exit(0);
}
const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
const all = (idx.complexes || []).flatMap((c) => c.plans.map((p) => ({ ...p, c: c.complex })));
const have = all.filter((p) => fs.existsSync(path.join(root, p.file)));
if (have.length < 10) {
  console.log(`SKIP: 도면 이미지가 ${have.length}장뿐입니다 — 이 검사는 이미지를 가진 로컬에서만 돕니다`);
  process.exit(0);
}

let browser;
try {
  ({ chromium });
  browser = await chromium.launch();
} catch (e) {
  console.log('SKIP: playwright 를 쓸 수 없습니다 —', String(e).slice(0, 80));
  process.exit(0);
}

const srv = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(f).toLowerCase();
    res.writeHead(200, { 'Content-Type': ext === '.html' ? 'text/html' : ext === '.json' ? 'application/json' : 'image/jpeg' });
    res.end(d);
  });
});
await new Promise((r) => srv.listen(4630, r));

// 단지가 골고루 섞이도록 일정 간격으로 뽑는다(무작위로 하면 실행할 때마다 결과가 흔들린다)
const N = +process.env.REAL_N || 30;
const step = Math.max(1, Math.floor(have.length / N));
const sample = [];
for (let i = 0; i < have.length && sample.length < N; i += step) sample.push(have[i]);

const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto('http://localhost:4630/place-app.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

const rows = [];
for (const s of sample) {
  const r = await page.evaluate(async (p0) => {
    const P = window.__place;
    const area = (poly) => { let a = 0; for (let i = 0; i < poly.length; i++){ const [x1,y1]=poly[i],[x2,y2]=poly[(i+1)%poly.length]; a += x1*y2-x2*y1; } return Math.abs(a)/2; };
    try {
      await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('load')), 9000);
        P.useImage('/' + p0.file, () => { clearTimeout(t); res(); }); });
      await new Promise((res) => setTimeout(res, 1800));
    } catch { return { err: 'load' }; }
    const d = P.state.draft;
    const cands = P.state.roomCands || [];
    const planA = P.state.imgW * P.state.imgH;
    if (!d) return { auto: false, cands: cands.length };
    const xs = d.map((q) => q[0]), ys = d.map((q) => q[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const out = {
      auto: true, cands: cands.length,
      pct: area(d) / planA * 100,
      short: Math.min(w, h) / Math.min(P.state.imgW, P.state.imgH) * 100,
      roomW: w,
    };
    // 기준 벽까지 밀어 본다 — 벽면 전체를 덮는지가 축척 정확도를 좌우한다
    const okBtn = [...document.querySelectorAll('#draftbar button')].find((x) => x.textContent.trim() === '이 공간 확정');
    if (okBtn) {
      okBtn.click();
      await new Promise((res) => setTimeout(res, 350));
      const nb = document.querySelector('#sheet .modal-actions button.primary');
      if (nb) nb.click();
      await new Promise((res) => setTimeout(res, 450));
      const m = P.state.measureSeg;
      if (m) {
        out.segH = Math.abs(m.x2 - m.x1) > Math.abs(m.y2 - m.y1);
        out.cover = Math.abs(m.x2 - m.x1) / Math.max(1, w);
      }
    }
    return out;
  }, s);
  rows.push({ ...s, ...r });
}
await browser.close();
srv.close();

const auto = rows.filter((r) => r.auto);
const rate = auto.length / rows.length;
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

console.log(`실제 도면 ${rows.length}장 (보유 ${have.length}장 중 고르게 추출)\n`);

/*
 * 기준선은 2026-08-09 실측값에서 여유를 둔 것이다. 목표가 아니라 **하한**이므로,
 * 인식을 개선하면 여기 숫자를 함께 올려 다시 못 내려가게 할 것.
 */
if (rate < 0.80) fail(`자동 인식 성공률 ${Math.round(rate*100)}% — 실측 기준 90%, 하한 80%`);
else pass(`자동 인식 ${auto.length}/${rows.length}장 (${Math.round(rate*100)}%)`);

// 축척 기준 방이 조각이면 안 된다 — 창틀(32×21px)이 뽑히던 사고
const slivers = auto.filter((r) => r.pct < 3 || r.short < 8);
if (slivers.length) {
  fail(`축척 기준으로 조각을 골랐다 ${slivers.length}장 — ${slivers.slice(0,3).map((r)=>`${r.c} ${r.type}(${r.pct.toFixed(1)}%)`).join(', ')}`);
} else pass(`축척 기준 방이 전부 방다움 (넓이 ${med(auto.map((r)=>r.pct)).toFixed(1)}% · 짧은변 ${med(auto.map((r)=>r.short)).toFixed(1)}%)`);

// 기준 벽은 가로여야 하고, 벽면 전체를 덮어야 한다(창 조각만 잡히던 사고)
const withSeg = auto.filter((r) => r.cover != null);
const vertical = withSeg.filter((r) => !r.segH);
if (vertical.length) fail(`기준 벽이 세로인 도면 ${vertical.length}장 — 가로여야 한다`);
else if (withSeg.length) {
  const mc = med(withSeg.map((r) => r.cover));
  const short = withSeg.filter((r) => r.cover < 0.5);
  if (mc < 0.9) fail(`기준 벽이 방 가로를 덮는 비율 중앙값 ${mc.toFixed(2)} — 실측 1.00, 하한 0.90`);
  else if (short.length > withSeg.length * 0.15) {
    fail(`벽면의 절반도 못 덮는 도면이 ${short.length}/${withSeg.length}장 — 조각만 잡고 있다`);
  } else pass(`기준 벽 전부 가로 · 방 가로를 덮는 비율 중앙값 ${mc.toFixed(2)}`);
}

// 세대 전체가 방 하나로 잡히는 비율 — 지금은 못 고치지만 나빠지는 것은 막는다
const huge = auto.filter((r) => r.pct > 35);
const hr = huge.length / Math.max(1, auto.length);
if (hr > 0.40) fail(`세대 전체가 방 하나로 잡힌 것 ${Math.round(hr*100)}% — 실측 24%, 상한 40%`);
else console.log(`NOTE: 세대 전체로 잡힌 것 ${huge.length}/${auto.length}장 (${Math.round(hr*100)}%) — 알려진 한계, 화면이 경고로 알린다`);

console.log(`NOTE: 후보 방 개수 중앙값 ${med(auto.map((r)=>r.cands))}`);
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
