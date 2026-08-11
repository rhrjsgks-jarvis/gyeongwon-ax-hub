/*
 * 이미 만들어진 `public/plan-index.json` 에 도면별 **기울기 집중도(axis)** 만 채워 넣는다.
 *
 * 왜 별도 스크립트인가: `build:plans` 는 `.scratch/` 의 수집 결과물이 있어야 돌고, 돌리면
 * 이미지 617장을 전부 다시 쓴다. 값 하나를 더하려고 그럴 이유가 없다.
 * 앞으로의 수집에서는 `build-plan-index.mjs` 가 같은 값을 함께 넣으므로, 이 스크립트는
 * **기존 색인을 따라잡는 용도**다(이미 axis 가 있는 항목은 건드리지 않는다).
 *
 * 재는 대상은 `public/plans/` 의 **배포본**이다 — 앱이 실행 중에 보는 그 이미지여야
 * 목록에서 숨긴 기준과 열었을 때 뜨는 경고가 어긋나지 않는다.
 *
 * 실행: node scripts/patch-plan-axis.mjs   (--force 면 기존 값도 다시 잰다)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(__dirname, '..', 'public');
const INDEX = path.join(PUB, 'plan-index.json');
const force = process.argv.includes('--force');

const idx = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const todo = [];
for (const c of idx.complexes || [])
  for (const p of c.plans || [])
    if (force || p.axis == null) todo.push(p);

if (!todo.length) { console.log('모든 도면에 axis 가 이미 있습니다.'); process.exit(0); }
console.log(`${todo.length}장을 잽니다…`);

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', () => {});
await page.setContent('<!doctype html><html><body></body></html>');

/* place-app.html 의 axisConcentration() 과 같은 계산 — 바꿀 때 셋을 함께 볼 것
   (여기 · build-plan-index.mjs · place-app.html) */
const measure = async (file) => {
  const abs = path.join(PUB, file);
  if (!fs.existsSync(abs)) return null;
  const uri = 'data:image/jpeg;base64,' + fs.readFileSync(abs).toString('base64');
  return page.evaluate(async (u) => {
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.onerror = res; img.src = u; });
    if (!img.naturalWidth) return null;
    const A = 420, k = Math.min(1, A / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(8, Math.round(img.naturalWidth * k)), h = Math.max(8, Math.round(img.naturalHeight * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
    cx.drawImage(img, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0, p = 0; p < g.length; i += 4, p++) g[p] = (0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2]) / 255;
    const bins = new Float64Array(36);
    let total = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++){
      const o = y*w + x;
      const gx = (g[o-w+1] + 2*g[o+1] + g[o+w+1]) - (g[o-w-1] + 2*g[o-1] + g[o+w-1]);
      const gy = (g[o+w-1] + 2*g[o+w] + g[o+w+1]) - (g[o-w-1] + 2*g[o-w] + g[o-w+1]);
      const m = Math.hypot(gx, gy);
      if (m < 0.35) continue;
      const a = ((Math.atan2(gy, gx) * 180 / Math.PI % 180) + 180) % 180;
      bins[Math.min(35, Math.floor(a / 5))] += m;
      total += m;
    }
    if (!total) return null;
    return [35, 0, 1, 16, 17, 18].reduce((s, i) => s + bins[i], 0) / total;
  }, uri);
};

let done = 0, miss = 0;
for (const p of todo){
  const a = await measure(p.file);
  if (a == null) { miss++; continue; }
  p.axis = +a.toFixed(3);
  if (++done % 100 === 0) process.stderr.write(`  ${done}/${todo.length}\n`);
}
await browser.close();

fs.writeFileSync(INDEX, JSON.stringify(idx, null, 1) + '\n');
const all = (idx.complexes || []).flatMap((c) => c.plans || []).filter((p) => p.axis != null);
const low = all.filter((p) => p.axis < 0.35).length;
console.log(`${done}장 기록${miss ? ` · ${miss}장은 파일이 없어 건너뜀` : ''}`);
console.log(`0.35 미만(도면 아님 의심) ${low}장 / ${all.length}장`);
