/*
 * 단지 도면을 앱에서 쓸 수 있게 public/plans/ 로 옮기고 색인을 만든다.
 * 실행: npm run build:plans
 *
 * ── 무엇을 싣는가 ──────────────────────────────────────────────
 * **평면도면 싣는다. 치수가 인쇄돼 있을 필요는 없다.**
 *
 * 예전에는 "치수가 있는 도면만" 실었는데, 실측해 보니 그런 도면은 4%뿐이었다
 * (수집 1,185장 중 치수 사슬이 잡힌 것 39장, 모집공고 PDF 12건에는 평면도 자체가 0건).
 * 분양 마케팅 사이트는 예쁘게 보이려고 치수를 지운다. 그런데 이 앱은 축척을 **사용자가
 * 확정하게** 돼 있어(CLAUDE.md — "축척은 반드시 사용자가 확정한 값에서 온다") 치수가
 * 없어도 쓸 수 있다. 치수로 거르면 쓸 수 있는 도면 900장을 버리는 셈이다.
 *
 * 그래서 관문은 "**평면도인가**"다 — 방 이름(거실·침실·주방·욕실…)이 3종류 이상 읽히면
 * 평면도로 본다(.scratch/classify-plans.json). 조감도·인테리어컷·배너에는 안 나온다.
 *
 * 치수가 읽힌 도면에는 축척(mmPerPx)을 미리 넣어 둔다 — 그 도면은 매장에서 축척 단계를
 * 건너뛸 수 있다. 등급(scaleConf)도 함께 실어 화면에서 확신도를 밝힐 수 있게 한다.
 *
 * ── 이미지 크기 ────────────────────────────────────────────────
 * 인식 해상도 상한이 DETECT_MAX(1,200px)이라 그보다 크게 저장할 이유가 없다.
 * 긴 변 1,400px 로 줄여 담는다(약간의 여유는 축척 맞추기 화면에서 치수 글씨를 읽기 위함).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, '.scratch', 'plans');
const CLASSIFY = path.join(ROOT, '.scratch', 'classify-plans.json');
const SCAN = path.join(ROOT, '.scratch', 'scan-plans.json');
const GRAB = path.join(ROOT, '.scratch', 'grab-state.json');
const OUT = path.join(ROOT, 'public', 'plans');
const INDEX = path.join(ROOT, 'public', 'plan-index.json');
const MAX_LONG = 1400;

if (!fs.existsSync(CLASSIFY)) {
  console.log('SKIP: .scratch/classify-plans.json 이 없습니다 (도면 수집·판별은 로컬에서만 합니다)');
  process.exit(0);
}

const classify = JSON.parse(fs.readFileSync(CLASSIFY, 'utf8'));
const scan = fs.existsSync(SCAN) ? JSON.parse(fs.readFileSync(SCAN, 'utf8')) : [];
const grab = fs.existsSync(GRAB) ? JSON.parse(fs.readFileSync(GRAB, 'utf8')) : {};
const scanBy = new Map(scan.map((r) => [`${r.dir}/${r.file}`, r]));
const addrBy = new Map(Object.values(grab).map((g) => [`${g.city}_${g.name}`, g.addr]));

/**
 * 파일명에서 주택형을 읽는다 — "plane_84a_02.jpg" → 84A, "07_84B_ex.png" → 84B.
 * OCR 로 머리말을 읽는 것이 정확하지만 안 읽히는 도면이 많고, 분양 사이트는 파일명에
 * 주택형을 넣는 관례가 있어 보조 수단으로 쓸 만하다. (자이처럼 순번만 쓰는 곳은 안 걸린다.)
 */
function typeFromName(file) {
  const m = file.match(/(?:^|[^\d])(\d{2,3})\s*([a-zA-Z])?(?:타입|type)?(?:[_\-.]|$)/i);
  if (!m) return '';
  const n = +m[1];
  if (n < 15 || n > 300) return '';        // 주택형은 전용 15~300㎡ 범위다
  return String(n) + (m[2] ? m[2].toUpperCase() : '');
}

// 지역_단지 별로 묶는다
const groups = new Map();
for (const c of classify) {
  if (!c.plan) continue;
  const [region, ...rest] = c.dir.split('_');
  const complex = rest.join('_');
  if (!/^(경기|강원)/.test(region)) continue;          // 경원지역만
  const key = c.dir;
  if (!groups.has(key)) groups.set(key, { region, complex, addr: addrBy.get(c.dir) || '', items: [] });
  groups.get(key).items.push(c);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// 이미지를 줄여 담는다. 브라우저 캔버스를 쓰는 이유는 추가 의존성 없이 되기 때문이다.
const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', () => {});
await page.setContent('<!doctype html><html><body><canvas id="c"></canvas></body></html>');

async function shrink(srcPath) {
  const ext = path.extname(srcPath).toLowerCase();
  const uri = `data:${ext === '.png' ? 'image/png' : 'image/jpeg'};base64,${fs.readFileSync(srcPath).toString('base64')}`;
  const r = await page.evaluate(async ({ uri, max }) => {
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.onerror = res; img.src = uri; });
    if (!img.naturalWidth) return null;
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.getElementById('c');
    cv.width = Math.round(img.naturalWidth * s);
    cv.height = Math.round(img.naturalHeight * s);
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    return { data: cv.toDataURL('image/jpeg', 0.72).slice(23), w: cv.width, h: cv.height, scale: s };
  }, { uri, max: MAX_LONG });
  return r && { buf: Buffer.from(r.data, 'base64'), w: r.w, h: r.h, scale: r.scale };
}

const index = [];
let n = 0, bytes = 0, withScale = 0;

for (const [dir, g] of [...groups.entries()].sort()) {
  const id = 'c' + String(index.length + 1).padStart(2, '0');
  const outDir = path.join(OUT, id);
  const plans = [];
  const used = new Set();

  // 치수가 읽힌 것 → 방 이름이 많이 읽힌 것 순으로. 같은 주택형이면 잘 읽힌 쪽이 대표가 된다.
  const items = [...g.items].sort((a, b) => {
    const sa = scanBy.get(`${a.dir}/${a.file}`), sb = scanBy.get(`${b.dir}/${b.file}`);
    return (sb && sb.k ? 1 : 0) - (sa && sa.k ? 1 : 0) || (b.rooms || []).length - (a.rooms || []).length;
  });

  for (const it of items) {
    const src = path.join(SRC, dir, it.file);
    if (!fs.existsSync(src)) continue;
    const s = scanBy.get(`${dir}/${it.file}`) || {};

    // 주택형 이름 — OCR 로 읽은 것이 가장 믿을 만하고, 없으면 파일명, 그것도 없으면 순번.
    // 겹치면 버리지 말고 -2, -3 을 붙인다. 84A~84D 중 하나만 남고 나머지가 사라지는 것보다,
    // 직원이 도면을 보고 구분하는 편이 낫다.
    let key = (s.type || '').toUpperCase() || typeFromName(it.file) || '';
    if (!key) key = 'T' + (plans.length + 1);
    if (used.has(key)) {
      let i = 2;
      while (used.has(`${key}-${i}`)) i++;
      key = `${key}-${i}`;
    }
    used.add(key);

    const small = await shrink(src);
    if (!small) continue;
    fs.mkdirSync(outDir, { recursive: true });
    const file = `${key.replace(/[^\w가-힣-]/g, '')}.jpg`;
    fs.writeFileSync(path.join(outDir, file), small.buf);
    bytes += small.buf.length; n++;

    const rec = { type: key, file: `plans/${id}/${file}`, w: small.w, h: small.h,
      exclusiveM2: s.excl ? +s.excl.toFixed(2) : null, rooms: (it.rooms || []).length,
      kb: Math.round(small.buf.length / 1024) };
    // 축척은 원본 픽셀 기준으로 잰 값이다. 이미지를 줄였으니 같은 비율로 키워 준다.
    if (s.k) { rec.mmPerPx = +(s.k / small.scale).toFixed(3); rec.scaleConf = s.conf; withScale++; }
    plans.push(rec);
  }
  if (!plans.length) continue;
  plans.sort((a, b) => (a.exclusiveM2 || 999) - (b.exclusiveM2 || 999) || a.type.localeCompare(b.type));
  index.push({ id, region: g.region, complex: g.complex, addr: g.addr, plans });
}

await browser.close();
index.sort((a, b) => a.region.localeCompare(b.region, 'ko') || a.complex.localeCompare(b.complex, 'ko'));

fs.writeFileSync(INDEX, JSON.stringify({
  version: 3,
  note: '단지 도면 색인 — 지역 → 단지 → 도면 순으로 고른다. 평면도면 싣고, 치수가 읽힌 도면에는 '
    + 'mmPerPx(축척)와 scaleConf(확신도)를 미리 넣어 둔다. 축척이 없는 도면은 매장에서 사용자가 맞춘다. '
    + '수집·판별은 로컬(.scratch)에서 하고 npm run build:plans 로 이 색인과 이미지를 만든다.',
  generatedAt: new Date().toISOString().slice(0, 10),
  complexCount: index.length,
  planCount: n,
  scaledCount: withScale,
  complexes: index,
}, null, 1) + '\n', 'utf8');

const byRegion = {};
for (const c of index) byRegion[c.region] = (byRegion[c.region] || 0) + c.plans.length;
console.log(`단지 ${index.length}곳 · 도면 ${n}장 (축척 있음 ${withScale}장) · ${(bytes / 1024 / 1024).toFixed(1)}MB`);
console.log('지역별: ' + Object.entries(byRegion).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('→ public/plans/ · public/plan-index.json');
