/**
 * 경원 관할 지도 SVG 생성 — `npm run build:regionmap`
 *
 * **왜 SVG 를 통째로 만들어 심는가.** 바이럴분석기는 Apps Script HTML 서비스라
 * 사내망에서 열린다. 지도 라이브러리(Leaflet·D3)를 CDN 으로 부르면 그 망이 막는
 * 순간 지도가 통째로 사라진다 — 이 저장소가 three.js·html2canvas 를 `public/vendor/`
 * 에 받아 둔 것과 같은 이유다. path 를 문자열로 심으면 **fetch 가 한 번도 없다.**
 *
 * **입력은 fixture 다**(`scripts/fixtures/gw-municipalities.json`).
 * 빌드가 네트워크에 기대면 CI 에서 깨진다. fixture 를 새로 뜨려면 KOSTAT 원본에서
 * 다시 추리면 되고, 출처와 라이선스는 그 파일 `_src` 에 적혀 있다.
 *
 * **관할 밖(경기 북부·서부)도 함께 그린다.** 관할 30곳만 그리면 여주·양평이 빠져
 * 지도 가운데가 뚫리고, 그러면 무슨 모양인지 알 수가 없다. 배경으로 옅게 깔면
 * 위치 감각이 살고 덤으로 "여기는 우리 구역이 아니다"가 한눈에 보인다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SRC = path.join(ROOT, 'scripts/fixtures/gw-municipalities.json');

/* ── 지도 칸 — 시·군을 우리 영업 편성으로 묶는다 ────────────────────────────
 *
 * **이 표가 여기 있는 이유.** 화면이 점코드로 다시 판정하려면 AREA 65줄을 화면에도
 * 둬야 하고 그러면 같은 표가 두 벌이 된다. 빌드가 `data-cell` 로 심어 두면 화면은
 * 그것만 읽으면 된다.
 *
 * **경기는 시·군을 묶고 강원은 시 그대로 둔다.** 근거는 `Reviews.gs` 의 `mapCell_` 과
 * 같다 — AREA 가 강원을 한 덩어리로 묶어 매장 9곳이 뭉개져 있어 지도가 그것을 푼다.
 *
 * **경기 묶음의 근거는 매장 이름이다**(지어낸 것이 아니다):
 *   성남 ← 광주(매장 「광주」) · 이천(「이천증포」) · 하남(「하남미사」·「신세계하남」)
 *   평택 ← 오산(「오산」) · 안성(「안성」)
 *   용인 ← 화성(「동탄」·「롯데동탄」·「남양모바일」·「화성캠퍼스모바일」)
 *   안양 ← 광명(「광명소하」·「광명기아자동차모바일」)
 */
const CELL = {
  수원: '수원', 성남: '성남', 광주: '성남', 이천: '성남', 하남: '성남',
  평택: '평택', 오산: '평택', 안성: '평택',
  용인: '용인', 화성: '용인',
  안양: '안양', 광명: '안양'
};
const OUT = path.join(ROOT, 'docs/apps-script/ReviewsIndex.html');

/* 화면 폭 기준. 세로는 실제 종횡비대로 따라간다 — 억지로 맞추면 지도가 찌그러진다. */
const W = 400;
/* 소수 1자리면 400px 폭에서 0.1px 이라 눈으로 구분되지 않는다. 자리를 늘리면
   파일만 커진다(2자리로 하면 +40%). */
const P = 1;

const BEGIN = '<!-- REGION-MAP:BEGIN — build-region-map.mjs 가 만든다. 손으로 고치지 말 것 -->';
const END = '<!-- REGION-MAP:END -->';

const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));

/* ── 투영 ────────────────────────────────────────────────────────────────
 * 경기·강원은 위도 36.9~38.6 · 경도 126.7~129.4 로 좁아, **등장방형에 cos 보정만**
 * 해도 왜곡이 눈에 안 보인다(메르카토르까지 갈 이유가 없다). 보정을 빼면 가로가
 * 1.26배 늘어나 지도가 옆으로 퍼진다 — 그건 눈에 보인다.
 */
let minLon = 1e9, maxLon = -1e9, minLat = 1e9, maxLat = -1e9;
const eachPt = (coords, fn) => {
  if (typeof coords[0] === 'number') { fn(coords[0], coords[1]); return; }
  for (const c of coords) eachPt(c, fn);
};
for (const f of src.features) eachPt(f.coords, (lon, lat) => {
  if (lon < minLon) minLon = lon;
  if (lon > maxLon) maxLon = lon;
  if (lat < minLat) minLat = lat;
  if (lat > maxLat) maxLat = lat;
});
const lat0 = (minLat + maxLat) / 2;
const kx = Math.cos(lat0 * Math.PI / 180);
const px = (lon) => (lon - minLon) * kx;
const py = (lat) => (maxLat - lat);
const spanX = px(maxLon), spanY = py(minLat);
const scale = W / spanX;
const H = Math.round(spanY * scale * 10) / 10;
const X = (lon) => +(px(lon) * scale).toFixed(P);
const Y = (lat) => +(py(lat) * scale).toFixed(P);

/* ── path ────────────────────────────────────────────────────────────── */
function ringToPath(ring) {
  let d = '';
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i];
    d += (i === 0 ? 'M' : 'L') + X(lon) + ' ' + Y(lat);
  }
  return d + 'Z';
}
function polyToPath(coords) {
  /* fixture 는 전부 단일 Polygon 이지만, 나중에 MultiPolygon 이 섞여도
     조용히 반쪽만 그리지 않게 깊이를 따라 내려간다. */
  if (typeof coords[0][0] === 'number') return ringToPath(coords);
  return coords.map(polyToPath).join('');
}

/* ── 라벨 자리 — 면적 가중 중심 ─────────────────────────────────────────
 * 점 평균으로 내면 **해안선처럼 점이 촘촘한 쪽으로 이름이 끌려간다**. 수원처럼
 * 여러 구가 한 시로 묶이는 곳은 특히 그렇다(구마다 점 수가 다르다).
 */
function ringArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}
function ringCentroid(ring) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f; cy += (y1 + y2) * f; a += f;
  }
  a /= 2;
  if (!a) return null;
  return { x: cx / (6 * a), y: cy / (6 * a), a: Math.abs(a) };
}
function biggestRing(coords) {
  if (typeof coords[0][0] === 'number') return coords;
  let best = null, bestA = -1;
  const walk = (c) => {
    if (typeof c[0][0] === 'number') {
      const a = Math.abs(ringArea(c));
      if (a > bestA) { bestA = a; best = c; }
    } else c.forEach(walk);
  };
  walk(coords);
  return best;
}

const paths = [];
const acc = {};                       /* 지도 칸 -> {x,y,a} 면적 가중 누적 */
for (const f of src.features) {
  const d = polyToPath(f.coords);
  if (!f.mine) {
    /* 관할 밖 — 이름도 클릭도 없다. 모양만 있으면 된다. */
    paths.push('<path class="out" d="' + d + '"/>');
    continue;
  }
  /* 경기는 CELL 이 묶고, 강원은 표에 없으니 시 이름이 그대로 칸이 된다 */
  const cell = CELL[f.region] || f.region;
  paths.push('<path data-cell="' + cell + '" data-sigun="' + f.region
    + '" data-code="' + f.code + '" d="' + d + '"/>');
  /* ── 이름표 자리 — **대표 시의 중심**이다 ─────────────────────────────────
   * 칸 전체의 면적가중 중심으로 뒀다가 두 곳에서 깨졌다(실측):
   *   ①「용인」칸은 용인(592㎢)+화성(844㎢)인데 **화성이 더 커서** 중심이 서쪽으로
   *     끌려가 「수원」이름표와 겹쳤다.
   *   ②「안양」칸은 안양+광명이 떨어져 있어 중심이 **그 사이 관할 밖 땅**에 떨어졌다.
   * 칸 이름은 곧 대표 시 이름이므로(용인 칸 → 용인시) 그 시 위에 찍으면 **이름과
   * 자리가 맞고 칸 밖으로 나갈 수도 없다.** 강원은 1:1 이라 그대로다.
   */
  if (f.region === cell) {
    const ring = biggestRing(f.coords);
    const c = ring && ringCentroid(ring.map(([lon, lat]) => [X(lon), Y(lat)]));
    if (c) {
      const t = acc[cell] || (acc[cell] = { x: 0, y: 0, a: 0 });
      t.x += c.x * c.a; t.y += c.y * c.a; t.a += c.a;
    }
  }
}
const labels = {};
for (const r of Object.keys(acc)) {
  const t = acc[r];
  labels[r] = { x: +(t.x / t.a).toFixed(P), y: +(t.y / t.a).toFixed(P) };
}
/* 한 칸이 여러 시·군을 덮으면 화면이 그 사실을 밝혀야 한다 — 「성남」을 눌렀는데
   광주·이천·하남 건수가 함께 세어지는 이유가 화면 어디에도 없으면 안 된다. */
const members = {};
for (const f of src.features) {
  if (!f.mine) continue;
  const cell = CELL[f.region] || f.region;
  if (!members[cell]) members[cell] = [];
  if (members[cell].indexOf(f.region) < 0) members[cell].push(f.region);
}

const svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="geo-svg" xmlns="http://www.w3.org/2000/svg"'
  + ' role="img" aria-label="경원 관할 지도 — 경기 12개 시 · 강원 18개 시·군">'
  + paths.join('') + '</svg>';

/* JS 문자열 리터럴로 심는다 — HTML 안이라 `<`/`</script>` 는 나오지 않지만
   따옴표만 막으면 된다(SVG 에 역슬래시는 없다). */
const jsStr = (s) => "'" + s.split("'").join("\\'") + "'";

const block = [
  BEGIN,
  '<script>',
  '/* 경원 관할 지도 — 시·군 ' + Object.keys(labels).length + '곳 · 배경 '
    + src.features.filter((f) => !f.mine).length + '곳.',
  '   출처 KOSTAT 2013 센서스용 행정구역경계(Free to share or remix).',
  '   **fetch 가 없다** — 사내망에서 CDN 이 막혀도 지도가 뜬다. */',
  'var GW_MAP = { svg: ' + jsStr(svg) + ', labels: ' + JSON.stringify(labels)
    + ', members: ' + JSON.stringify(members) + ' };',
  '</script>',
  END
].join('\n');

let html = fs.readFileSync(OUT, 'utf8');
const i = html.indexOf(BEGIN), j = html.indexOf(END);
if (i < 0 || j < 0) {
  console.error('[build:regionmap] ReviewsIndex.html 에 REGION-MAP 표식이 없다.');
  console.error('  아래 두 줄을 넣을 자리에 두고 다시 돌릴 것:');
  console.error('  ' + BEGIN);
  console.error('  ' + END);
  process.exit(1);
}
const next = html.slice(0, i) + block + html.slice(j + END.length);
const changed = next !== html;
fs.writeFileSync(OUT, next);

console.log('[build:regionmap] viewBox 0 0 ' + W + ' ' + H
  + ' · path ' + paths.length + ' · 지역 ' + Object.keys(labels).length
  + ' · SVG ' + (svg.length / 1024).toFixed(1) + 'KB'
  + (changed ? '' : ' (변화 없음)'));
