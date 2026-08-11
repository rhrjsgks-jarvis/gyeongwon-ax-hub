/*
 * 단지 도면을 앱에서 쓸 수 있게 public/plans/ 로 옮기고 색인을 만든다.
 * 실행: npm run build:plans
 *
 * ── 수집 파이프라인 (도면을 더 모을 때도 이 순서 그대로) ──────────
 *   1. .scratch/applyhome-list.mjs    청약홈에서 공고 목록 (경기·강원 → 경원 담당분)
 *   2. .scratch/applyhome-detail.mjs  공고마다 주소·분양 홈페이지 주소
 *   3. .scratch/grab-batch.mjs        홈페이지에서 큰 이미지 수집
 *   4. .scratch/classify-plans.mjs    평면도인지 가림 (방 이름 3종류 이상)
 *   5. .scratch/crop-plans.mjs        **시트에서 필요한 도면 한 장만 잘라냄**  ← 반드시 거칠 것
 *   6. .scratch/scan-plans.mjs        잘라 낸 도면에서 축척(mm/px) 판독
 *   7. .scratch/read-types.mjs        주택형·전용면적 판독
 *   8. npm run build:plans            이 스크립트 — 색인과 배포용 이미지 생성
 *
 * 5번을 건너뛰면 안 된다. 분양 시트 한 장에는 치수 있는 도면·기본형·키맵·옵션 안내·범례가
 * 함께 실려서(오산세교 우미린: 한 파일에 도면 셋 + 설명 둘), 자르지 않으면 ①매장에서
 * 쓸 도면을 고를 수 없고 ②도면이 화면의 8%만 차지해 벽 인식이 무너지고 ③치수 글씨가 작아
 * 축척을 못 읽는다. 자른 뒤 6·7번을 돌려야 축척·주택형이 그 도면 기준으로 맞는다.
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
 * 인식 해상도 상한이 DETECT_MAX(1,200px)이라 그보다 크게 저장하면 인식에는 아무 이득이 없다.
 * 긴 변 1,200px 로 줄이되 JPEG 품질은 넉넉히 준다 — 줄이는 것보다 **선이 뭉개지는 것**이
 * 인식에 해롭기 때문이다(벽은 몇 px 짜리 가는 띠라 압축 아티팩트에 민감하다).
 * 공개 저장소에 담기는 용량이라 장당 60KB 안팎을 목표로 한다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
// 잘라 낸 도면이 있으면 그것을 싣는다. 원본 시트를 그대로 실으면 한 파일에 도면이 여럿이라
// 매장에서 쓸 수가 없다(사용자 지적: "3개가 필요없습니다. 수치가있는 1개만 필요할뿐입니다").
/*
 * 자르기는 두 판이 있다. **crops2(recrop.mjs)를 먼저 쓴다.**
 *   crops  — 치수 사슬·벽선으로 블록을 골랐다. 표본 40장 중 16장(40%)이 평면도가 아닌 것
 *            (사진 배너·제공품목 표·3D 조감도)으로 잘렸다.
 *   crops2 — **후보 블록마다 인식기를 돌려 방이 가장 많이 나오는 블록**을 고른다.
 *            같은 표본에서 8장(20%)으로 줄었고, 방 3곳 이상이 679장 중 636장이 됐다.
 * 고르는 기준을 "매장에서 방을 잡을 수 있는 그림인가"로 바꾼 것이 전부다 —
 * 판정과 목적이 어긋나지 않으니 대리 지표를 튜닝할 일이 없다.
 */
const CROPS2 = path.join(ROOT, '.scratch', 'crops2');
const RECROP = path.join(ROOT, '.scratch', 'recrop.json');
const CROPS = path.join(ROOT, '.scratch', 'crops');
const RAW = path.join(ROOT, '.scratch', 'plans');
const CROPLOG = path.join(ROOT, '.scratch', 'crop-plans.json');
const CLASSIFY = path.join(ROOT, '.scratch', 'classify-plans.json');
// 축척은 **잘라 낸 도면에서 잰 것**을 먼저 쓴다 — 배포되는 바로 그 이미지에서 읽은 값이라야
// 화면에 뜨는 치수와 어긋나지 않는다.
const SCAN_CROPS = path.join(ROOT, '.scratch', 'scan-crops.json');
const SCAN = path.join(ROOT, '.scratch', 'scan-plans.json');
const TYPES = path.join(ROOT, '.scratch', 'read-types.json');
const GRAB = path.join(ROOT, '.scratch', 'grab-state.json');
const OUT = path.join(ROOT, 'public', 'plans');
const INDEX = path.join(ROOT, 'public', 'plan-index.json');
const MAX_LONG = 1200;

if (!fs.existsSync(CLASSIFY)) {
  console.log('SKIP: .scratch/classify-plans.json 이 없습니다 (도면 수집·판별은 로컬에서만 합니다)');
  process.exit(0);
}

const classify = JSON.parse(fs.readFileSync(CLASSIFY, 'utf8'));
const scan = fs.existsSync(SCAN_CROPS) ? JSON.parse(fs.readFileSync(SCAN_CROPS, 'utf8'))
  : (fs.existsSync(SCAN) ? JSON.parse(fs.readFileSync(SCAN, 'utf8')) : []);
// 잘라 낸 도면의 원본 파일명 대응. 크롭은 확장자를 .jpg 로 통일하므로 이름이 달라진다.
const recrop = fs.existsSync(RECROP) ? JSON.parse(fs.readFileSync(RECROP, 'utf8')) : [];
const crops = fs.existsSync(CROPLOG) ? JSON.parse(fs.readFileSync(CROPLOG, 'utf8')) : [];
const cropBy = new Map();
for (const r of crops) if (r.out) cropBy.set(`${r.dir}/${r.file}`, { ...r, dirOf: CROPS });
// 뒤에 넣어 덮어쓴다 — crops2 가 우선이다
for (const r of recrop) if (r.out) cropBy.set(`${r.dir}/${r.file}`, { ...r, dirOf: CROPS2 });

/*
 * **방을 3곳도 못 잡는 그림은 싣지 않는다.** 매장에서 열어 봐야 쓸 수 없고, 그런 그림은
 * 대개 설명글·면적표·3D 렌더다. 인식기가 직접 센 값이라 판정과 목적이 같다.
 * 자르기 기록에 방 개수가 없는 옛 항목은 통과시킨다(예전 방식으로 자른 것).
 */
const ROOM_GATE = 3;
const grab = fs.existsSync(GRAB) ? JSON.parse(fs.readFileSync(GRAB, 'utf8')) : {};
// 주택형·전용면적은 별도 패스에서 전 평면도에 대해 읽는다(read-types.mjs). 축척 판독은
// 8% 만 통과하는데 이름은 전부에 필요해서다 — 화면에 "T1·T2·T3" 만 뜨면 고를 수가 없다.
const types = fs.existsSync(TYPES) ? JSON.parse(fs.readFileSync(TYPES, 'utf8')) : [];
const typeBy = new Map(types.map((r) => [`${r.dir}/${r.file}`, r]));
const scanBy = new Map(scan.map((r) => [`${r.dir}/${r.file}`, r]));
const addrBy = new Map(Object.values(grab).map((g) => [`${g.city}_${g.name}`, g.addr]));

/**
 * 파일명에서 주택형을 읽는다 — "plane_84a_02.jpg" → 84A, "07_84B_ex.png" → 84B.
 * OCR 로 머리말을 읽는 것이 정확하지만 안 읽히는 도면이 많고, 분양 사이트는 파일명에
 * 주택형을 넣는 관례가 있어 보조 수단으로 쓸 만하다. (자이처럼 순번만 쓰는 곳은 안 걸린다.)
 */
function typeFromName(file) {
  /*
   * **맨 앞 순번을 주택형으로 읽지 말 것.** 수집기가 "01_", "16_" 같은 순번을 붙여 저장하는데,
   * 예전 정규식은 맨 앞부터 잡아 "16_plane_84d_02.jpg" 를 84D 가 아니라 16 으로 읽었다
   * (강릉 오션시티가 통째로 16·19·22·25 로 실렸다).
   * 순번을 떼고, **숫자 뒤에 글자가 붙은 것(84a·59b)을 먼저** 찾는다 — 그게 주택형 표기다.
   */
  const body = file
    .replace(/^\d{1,3}[_-]/, '')            // 수집기가 붙인 순번
    .replace(/\.[a-z0-9]+$/i, '')           // 확장자
    .replace(/(jpe?g|png)$/i, '');          // "84bjpg" 처럼 확장자가 붙어 저장된 것
  /*
   * **해시 파일명에서 주택형을 만들어 내지 말 것.** 사이트가 "2bc26f1106124e569a86c357.jpg"
   * 처럼 이름을 주면 그 안의 "26f" 가 주택형 26F 로 둔갑한다. 16자 넘는 16진 문자열이
   * 있으면 이름이 아니라 해시다.
   */
  if (/[0-9a-f]{16,}/i.test(body)) return '';
  const ok = (n) => n >= 15 && n <= 300;    // 주택형은 전용 15~300㎡ 범위다
  const letter = [...body.matchAll(/(?:^|[^\d])(\d{2,3})\s*([a-hpts])(?![a-z])/gi)]
    .find((m) => ok(+m[1]));
  if (letter) return String(+letter[1]) + letter[2].toUpperCase();
  const plain = [...body.matchAll(/(?:^|[^\d])(\d{2,3})(?![\d])/g)].find((m) => ok(+m[1]));
  return plain ? String(+plain[1]) : '';
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
    const out = { data: cv.toDataURL('image/jpeg', 0.78).slice(23), w: cv.width, h: cv.height, scale: s };

    /*
     * **이 그림의 선이 가로·세로에 몰려 있는가**를 함께 잰다(0~1).
     *
     * 색인의 "평면도"가 다 평면도는 아니다 — 방 이름이 3종류 이상 읽히기만 하면 통과하므로
     * 아이소메트릭 렌더링 · 인테리어 사진 · 품목표 · 단지 배치도가 함께 들어온다.
     * 벽 인식은 "벽은 가로·세로로 곧은 띠"라는 전제 위에 서 있어서 그런 이미지에서는
     * 글씨·범례가 벽이 되고 **얇은 띠 같은 방**이 나온다.
     *
     * 재는 법과 크기(420px)는 place-app.html 의 `axisConcentration()` 과 **같아야 한다** —
     * 다르면 목록에서 숨긴 기준과 열었을 때 뜨는 경고가 어긋난다. 그래서 원본이 아니라
     * **배포되는 축소본(cv)** 을 잰다. 앱이 실행 중에 보는 것이 그 이미지다.
     */
    const A = 420, k2 = Math.min(1, A / Math.max(cv.width, cv.height));
    const aw = Math.max(8, Math.round(cv.width * k2)), ah = Math.max(8, Math.round(cv.height * k2));
    const c2 = document.createElement('canvas'); c2.width = aw; c2.height = ah;
    const x2 = c2.getContext('2d', { willReadFrequently: true });
    x2.fillStyle = '#fff'; x2.fillRect(0, 0, aw, ah);
    x2.drawImage(cv, 0, 0, aw, ah);
    const d2 = x2.getImageData(0, 0, aw, ah).data;
    const g = new Float32Array(aw * ah);
    for (let i = 0, p = 0; p < g.length; i += 4, p++) g[p] = (0.299*d2[i] + 0.587*d2[i+1] + 0.114*d2[i+2]) / 255;
    const bins = new Float64Array(36);
    let total = 0;
    for (let y = 1; y < ah - 1; y++) for (let x = 1; x < aw - 1; x++){
      const o = y*aw + x;
      const gx = (g[o-aw+1] + 2*g[o+1] + g[o+aw+1]) - (g[o-aw-1] + 2*g[o-1] + g[o+aw-1]);
      const gy = (g[o+aw-1] + 2*g[o+aw] + g[o+aw+1]) - (g[o-aw-1] + 2*g[o-aw] + g[o-aw+1]);
      const m = Math.hypot(gx, gy);
      if (m < 0.35) continue;
      const a2 = ((Math.atan2(gy, gx) * 180 / Math.PI % 180) + 180) % 180;
      bins[Math.min(35, Math.floor(a2 / 5))] += m;
      total += m;
    }
    if (total) out.axis = [35, 0, 1, 16, 17, 18].reduce((s2, i) => s2 + bins[i], 0) / total;
    return out;
  }, { uri, max: MAX_LONG });
  return r && { buf: Buffer.from(r.data, 'base64'), w: r.w, h: r.h, scale: r.scale, axis: r.axis };
}

const index = [];
let n = 0, bytes = 0, withScale = 0, dropped = 0;

/*
 * **단지 id 는 한 번 준 것을 그대로 쓴다.**
 *
 * 예전에는 처리 순서로 매겼다(`'c' + (index.length + 1)`). 그러면 단지가 하나 끼어드는 순간
 * 뒤가 전부 밀려 **도면 파일이 통째로 다른 폴더로 옮겨 간다** — 2026-08-12 에 홍천 도면
 * 2장을 넣었더니 914개 파일이 바뀌었다(신규 415 · 삭제 414 · 수정 85). public repo 라
 * 그 이미지가 전부 새 blob 으로 쌓인다.
 *
 * 그래서 기존 색인에서 단지 이름(`지역_단지`)으로 id 를 찾아 재사용하고, 처음 보는 단지에만
 * 남는 번호를 준다. 단지가 빠져도 그 번호는 비워 둔다 — 번호를 당기면 같은 일이 반복된다.
 */
const prevIndex = fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, 'utf8')) : null;
const idByKey = new Map();
let maxId = 0;
for (const c of (prevIndex && prevIndex.complexes) || []) {
  if (!c.id) continue;
  idByKey.set(`${c.region}_${c.complex}`, c.id);
  maxId = Math.max(maxId, +String(c.id).replace(/\D/g, '') || 0);
}

for (const [dir, g] of [...groups.entries()].sort()) {
  const id = idByKey.get(dir) || ('c' + String(++maxId).padStart(2, '0'));
  const outDir = path.join(OUT, id);
  const plans = [];
  const used = new Set();

  // 치수가 읽힌 것 → 방 이름이 많이 읽힌 것 순으로. 같은 주택형이면 잘 읽힌 쪽이 대표가 된다.
  const items = [...g.items].sort((a, b) => {
    const sa = scanBy.get(`${a.dir}/${a.file}`), sb = scanBy.get(`${b.dir}/${b.file}`);
    return (sb && sb.k ? 1 : 0) - (sa && sa.k ? 1 : 0) || (b.rooms || []).length - (a.rooms || []).length;
  });

  for (const it of items) {
    // 잘라 낸 도면이 있으면 그것을 싣는다 (없으면 원본 시트).
    // 축척·주택형 기록도 잘라 낸 파일명으로 남아 있으므로 조회 키를 맞춘다.
    const cp = cropBy.get(`${dir}/${it.file}`);
    if (cp && cp.rooms != null && cp.rooms < ROOM_GATE) continue;   // 방을 못 잡는 그림은 싣지 않는다
    const src = cp ? path.join(cp.dirOf, dir, cp.out) : path.join(RAW, dir, it.file);
    if (!fs.existsSync(src)) continue;
    const skey = cp ? `${dir}/${cp.out}` : `${dir}/${it.file}`;
    const s = scanBy.get(skey) || scanBy.get(`${dir}/${it.file}`) || {};
    const ty = typeBy.get(skey) || typeBy.get(`${dir}/${it.file}`) || {};
    /*
     * 전용면적·주택형은 **원본 시트에서 읽은 값(read-types)을 먼저** 쓴다.
     * 자르고 나면 머리말("84B · 351세대 · 전용면적 84.3693㎡")이 잘려 나가기 때문이다 —
     * 도면만 남기는 것이 자르기의 목적이라 그게 맞고, 대신 이름은 원본에서 가져온다.
     */
    const excl = ty.excl || s.excl || null;

    // 주택형 이름 — OCR 로 읽은 것이 가장 믿을 만하고, 없으면 파일명, 그것도 없으면 순번.
    // 겹치면 버리지 말고 -2, -3 을 붙인다. 84A~84D 중 하나만 남고 나머지가 사라지는 것보다,
    // 직원이 도면을 보고 구분하는 편이 낫다.
    let key = (ty.type || s.type || '').toUpperCase() || typeFromName(it.file) || '';
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
      exclusiveM2: excl ? +excl.toFixed(2) : null, rooms: (it.rooms || []).length,
      kb: Math.round(small.buf.length / 1024) };
    /* 선이 축(0°·90°)에 몰린 정도 — 앱이 이 값으로 도면 아닌 이미지를 목록에서 숨긴다 */
    if (small.axis != null) rec.axis = +small.axis.toFixed(3);
    /*
     * 축척은 확신도가 '확실'(가로·세로 사슬이 8% 안에서 일치) 또는 '보통'(한 축이지만 쌍이
     * 3개 이상)일 때만 싣는다. '낮음'은 가로와 세로가 어긋나 근거가 많은 쪽을 고른 것이라
     * 10~40% 틀릴 수 있다. 20% 틀리면 폭 700mm 냉장고를 840mm 로 재는 셈이라
     * "들어갑니다"가 거짓이 된다 — 축척은 없느니만 못한 값을 실으면 안 된다.
     * 축척이 없는 도면은 매장에서 사용자가 맞춘다(원래 그렇게 설계돼 있다).
     *
     * 잰 값은 원본 픽셀 기준이다. 이미지를 줄였으니 같은 비율로 키워 준다.
     */
    if (s.k && (s.conf === '확실' || s.conf === '보통')) {
      const mmPerPx = s.k / small.scale;
      /*
       * 축척이 맞더라도 **그려진 세대가 너무 작으면** 쓸 수 없다. 마케팅 시트는 세로로 길고
       * 도면은 그 일부만 차지해서, 축척이 119mm/px 로 나온 도면은 세대 폭이 100px 남짓이다.
       * 그 해상도에서는 벽이 1px 미만이라 인식기가 방을 잡지 못한다(DETECT_MAX 가 1,200px 인
       * 이유와 같은 이야기다). 세대 폭이 300px 는 돼야 한다 — 3m 방이 75px 쯤 된다.
       */
      const unitPx = s.wMm ? s.wMm / mmPerPx : 0;
      if (unitPx >= 300) {
        rec.mmPerPx = +mmPerPx.toFixed(3); rec.scaleConf = s.conf; withScale++;
      }
    }
    plans.push(rec);
  }
  if (!plans.length) continue;

  /*
   * 같은 단지의 도면은 같은 시트 서식으로 만들어져 축척이 비슷하게 나온다
   * (동탄 대방 엘리움 25.25·25.29·25.25 — 0.2% 안). 한 장만 크게 벗어나면 그 장의 판독이
   * 틀린 것이다 — 평택 자이에서 23.6·23.0·29.3 사이에 11.98 이 끼어 있었다.
   * 서로 검산해 주는 공짜 표본이라 쓰지 않을 이유가 없다. 애매하면 뺀다 —
   * 축척이 없으면 사람이 맞추면 되지만, 틀린 축척은 조용히 잘못된 답을 낸다.
   */
  const ks = plans.filter((p) => p.mmPerPx).map((p) => p.mmPerPx).sort((a, b) => a - b);
  if (ks.length >= 2) {
    const mid = ks[Math.floor(ks.length / 2)];
    for (const p of plans) {
      if (p.mmPerPx && Math.abs(p.mmPerPx - mid) > mid * 0.15) {
        delete p.mmPerPx; delete p.scaleConf; withScale--; dropped++;
      }
    }
  }

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
console.log(`단지 ${index.length}곳 · 도면 ${n}장 (축척 있음 ${withScale}장, 단지 안에서 어긋나 뺀 것 ${dropped}장) · ${(bytes / 1024 / 1024).toFixed(1)}MB`);
console.log('지역별: ' + Object.entries(byRegion).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('→ public/plans/ · public/plan-index.json');
