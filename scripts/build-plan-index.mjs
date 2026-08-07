/*
 * 단지 도면을 앱에서 쓸 수 있게 public/plans/ 로 옮기고 색인을 만든다.
 * 실행: npm run build:plans
 *
 * 원본은 .scratch/plans/<지역>_<단지>/ 에 수집돼 있고(로컬), 그중 **경원지역의 2D 평면도만**
 * 골라 넣는다. 경로에 한글·공백이 섞이면 URL 인코딩 문제가 생기므로 파일은 c01/84A.jpg 처럼
 * 단순한 이름으로 두고, 보여 줄 이름은 색인에 담는다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, '.scratch', 'plans');
const OUT = path.join(ROOT, 'public', 'plans');
const INDEX = path.join(ROOT, 'public', 'plan-index.json');

if (!fs.existsSync(path.join(SRC, 'MANIFEST.json'))) {
  console.log('SKIP: .scratch/plans/MANIFEST.json 이 없습니다 (도면 수집은 로컬에서만 합니다)');
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'MANIFEST.json'), 'utf8'));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const index = [];
let n = 0, bytes = 0;

for (const m of manifest) {
  // 경원지역만 — 매장이 실제로 상담하는 지역이다
  if (!/^(경기|강원)/.test(m.단지)) continue;
  const [region, complex] = m.단지.split('_');
  const id = 'c' + String(index.length + 1).padStart(2, '0');
  const dir = path.join(OUT, id);

  const plans = [];
  const seen = new Set();
  for (const p of m.평면도) {
    // 파일명 앞부분이 타입이다 (84A_2024... → 84A). 숫자 부분이 곧 전용면적.
    const mt = p.file.match(/^(T-)?(\d{2,3})([A-Z]?)[_.]/);
    const type = mt ? `${mt[1] || ''}${mt[2]}${mt[3] || ''}` : path.basename(p.file, path.extname(p.file)).slice(0, 12);
    if (seen.has(type)) continue;                 // 같은 타입은 대표 한 장만
    const src = path.join(SRC, m.단지, p.file);
    if (!fs.existsSync(src)) continue;
    seen.add(type);
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(p.file).toLowerCase() === '.png' ? '.png' : '.jpg';
    const file = `${type}${ext}`;
    fs.copyFileSync(src, path.join(dir, file));
    const size = fs.statSync(src).size;
    bytes += size; n++;
    plans.push({ type, file: `plans/${id}/${file}`, w: p.w, h: p.h,
      exclusiveM2: mt ? +mt[2] : null, kb: Math.round(size / 1024) });
  }
  if (!plans.length) continue;
  plans.sort((a, b) => (a.exclusiveM2 || 0) - (b.exclusiveM2 || 0) || a.type.localeCompare(b.type));
  index.push({ id, region, complex, plans });
}

index.sort((a, b) => a.region.localeCompare(b.region, 'ko') || a.complex.localeCompare(b.complex, 'ko'));

fs.writeFileSync(INDEX, JSON.stringify({
  version: 1,
  note: '단지 도면 색인. 지역 → 단지 → 도면 순으로 고른다. 원본 수집은 로컬(.scratch/plans)에서 하고 이 색인과 이미지는 npm run build:plans 로 만든다.',
  generatedAt: new Date().toISOString().slice(0, 10),
  complexCount: index.length,
  planCount: n,
  complexes: index,
}, null, 1) + '\n', 'utf8');

console.log(`단지 ${index.length}곳 · 도면 ${n}장 · ${(bytes / 1024 / 1024).toFixed(1)}MB`);
for (const c of index) console.log(`  ${c.region.padEnd(6)} ${c.complex.slice(0, 24).padEnd(24)} ${c.plans.length}장  [${c.plans.map((p) => p.type).join(' ')}]`);
console.log(`→ public/plans/ · public/plan-index.json`);
