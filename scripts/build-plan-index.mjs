/*
 * 단지 도면을 앱에서 쓸 수 있게 public/plans/ 로 옮기고 색인을 만든다.
 * 실행: npm run build:plans
 *
 * **치수가 적힌 도면만 싣는다.** 배치 상담에서 쓰려면 치수가 있어야 하는데, 브랜드마다
 * 공개 여부가 갈린다(자이·디에트르는 있고 롯데캐슬·래미안은 아예 없다). 그래서 수집 단계에서
 * OCR 로 치수 개수를 세어 걸러내고(.scratch/dimensioned.json), 여기서는 그 결과만 옮긴다.
 *
 * 타입·전용면적도 OCR 로 이미지에서 읽은 값을 쓴다. 파일명은 믿을 수 없다 —
 * 자이는 순번(01~05)이라 예전에 "전용 1㎡"로 잘못 실렸다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, '.scratch', 'plans');
const LIST = path.join(ROOT, '.scratch', 'dimensioned.json');
const OUT = path.join(ROOT, 'public', 'plans');
const INDEX = path.join(ROOT, 'public', 'plan-index.json');

if (!fs.existsSync(LIST)) {
  console.log('SKIP: .scratch/dimensioned.json 이 없습니다 (도면 수집·판별은 로컬에서만 합니다)');
  process.exit(0);
}

const groups = JSON.parse(fs.readFileSync(LIST, 'utf8'));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const index = [];
let n = 0, bytes = 0;

for (const g of groups) {
  if (!/^(경기|강원)/.test(g.region)) continue;          // 경원지역만
  const id = 'c' + String(index.length + 1).padStart(2, '0');
  const dir = path.join(OUT, id);
  const plans = [];
  const used = new Set();

  // 치수가 많이 읽힌 것부터 — 같은 타입이면 더 잘 읽힌 쪽을 대표로 쓴다
  for (const p of [...g.plans].sort((a, b) => b.dims - a.dims)) {
    const src = path.join(SRC, `${g.region}_${g.complex}`, p.file);
    if (!fs.existsSync(src)) continue;
    // 타입 문자(A·B·C)를 못 읽는 도면이 있다. 그렇다고 같은 키로 묶어 버리면 84A~84D 중
    // 하나만 남고 나머지가 사라진다 — 겹치면 버리지 말고 번호를 붙여 구분한다.
    // 어느 것이 A인지 B인지는 직원이 도면을 보면 알 수 있으므로, 잃는 것보다 낫다.
    let key = (p.type || '').toUpperCase() || (p.excl ? String(Math.round(p.excl)) : '');
    if (!key) key = 'T' + (plans.length + 1);
    if (used.has(key)) {
      let i = 2;
      while (used.has(`${key}-${i}`)) i++;
      key = `${key}-${i}`;
    }
    used.add(key);
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(p.file).toLowerCase() === '.png' ? '.png' : '.jpg';
    const file = `${key.replace(/[^\w가-힣]/g, '')}${ext}`;
    fs.copyFileSync(src, path.join(dir, file));
    const size = fs.statSync(src).size;
    bytes += size; n++;
    plans.push({ type: key, file: `plans/${id}/${file}`, w: p.w, h: p.h,
      exclusiveM2: p.excl ? +p.excl.toFixed(2) : null, dims: p.dims, kb: Math.round(size / 1024) });
  }
  if (!plans.length) continue;
  plans.sort((a, b) => (a.exclusiveM2 || 0) - (b.exclusiveM2 || 0) || a.type.localeCompare(b.type));
  index.push({ id, region: g.region, complex: g.complex, plans });
}

index.sort((a, b) => a.region.localeCompare(b.region, 'ko') || a.complex.localeCompare(b.complex, 'ko'));

fs.writeFileSync(INDEX, JSON.stringify({
  version: 2,
  note: '단지 도면 색인 — 치수가 적힌 도면만 싣는다. 지역 → 단지 → 도면 순으로 고른다. '
    + '수집·치수판별은 로컬(.scratch)에서 하고 npm run build:plans 로 이 색인과 이미지를 만든다.',
  generatedAt: new Date().toISOString().slice(0, 10),
  complexCount: index.length,
  planCount: n,
  complexes: index,
}, null, 1) + '\n', 'utf8');

console.log(`단지 ${index.length}곳 · 치수 도면 ${n}장 · ${(bytes / 1024 / 1024).toFixed(1)}MB`);
for (const c of index) {
  console.log(`  ${c.region.padEnd(7)} ${c.complex.slice(0, 26).padEnd(26)} ${String(c.plans.length).padStart(2)}장  ` +
    `[${c.plans.map((p) => p.type + (p.exclusiveM2 ? `(${Math.round(p.exclusiveM2)}㎡)` : '')).join(' ')}]`);
}
console.log('→ public/plans/ · public/plan-index.json');
