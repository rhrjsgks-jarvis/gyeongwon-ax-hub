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
/* ── 칸을 무엇으로 삼는가 (2026-09-01 개정) ───────────────────────────────
 *
 * 예전에는 이 표가 시·군을 **영업지역 이름으로 합쳤다** — 광주·이천·하남을 성남으로,
 * 화성을 용인으로, 광명을 안양으로. 그래서 광주 매장 후기가 성남 색으로 칠해졌다.
 * 편성은 그렇지만 **후기가 난 자리는 아니다.**
 *
 * 지금은 **시·군이 곧 칸**이고, 자치구가 있는 네 시(수원·성남·안양·용인)는 **구**까지
 * 내려간다. 사장님 지시 — *"같은 수원이라고 해도 상권이 다르고 후기가 다를 수
 * 있습니다."* 경계 데이터에 12구가 이미 별도 폴리곤으로 있어 새 자료가 필요 없다.
 *
 * **합계는 그대로 맞는다** — 화면의 지역 막대는 `AREA` 6곳이고, `areaCells` 가
 * 「그 지역이 덮는 칸들」을 넘겨 한 줄에 손을 얹으면 그 칸 전부가 밝아진다.
 * 강원을 네 시로 푼 선례와 같은 구조다. */
const GU_CITY = { 수원: 1, 성남: 1, 안양: 1, 용인: 1 };
/** `수원시영통구` → `영통구`. 자치구가 있는 시에서만 쓴다. */
function guOf(name) {
  /* **탐욕 매칭을 조심할 것** — `[가-힣]+구$` 는 `수원시영통구` 를 통째로 문다.
     자치구 이름은 전부 두 글자 + 구 다(영통·팔달·권선·장안·분당·중원·수정·
     동안·만안·수지·기흥·처인). 이 저장소가 부분일치로 되풀이해 데인 병이다. */
  const m = String(name || '').match(/([가-힣]{2}구)$/);
  return m ? m[1] : '';
}
/** 폴리곤 하나가 어느 칸인가 */
/** 칸 경계상자 — 이름표 글꼴을 고르는 데 쓴다. **쓰는 곳보다 앞에 둔다**(const 는 TDZ 다) */
const cellBox = {};
function cellOf(f) {
  if (GU_CITY[f.region]) return guOf(f.name) || f.region;
  return f.region;
}
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
const metroPaths = [];
const acc = {};                       /* 지도 칸 -> {x,y,a} 면적 가중 누적 */
for (const f of src.features) {
  const d = polyToPath(f.coords);
  if (!f.mine) {
    /* 관할 밖 — 이름도 클릭도 없다. 모양만 있으면 된다. */
    paths.push('<path class="out" d="' + d + '"/>');
    continue;
  }
  /* 경기는 CELL 이 묶고, 강원은 표에 없으니 시 이름이 그대로 칸이 된다 */
  const cell = cellOf(f);
  /* 칸 경계상자 — 여러 폴리곤이 한 칸이면 합친다 */
  eachPt(f.coords, (lon, lat) => {
    const x = X(lon), y = Y(lat);
    const t = cellBox[cell] || (cellBox[cell] = { x1: 1e9, y1: 1e9, x2: -1e9, y2: -1e9 });
    if (x < t.x1) t.x1 = x; if (x > t.x2) t.x2 = x;
    if (y < t.y1) t.y1 = y; if (y > t.y2) t.y2 = y;
  });
  /* **자치구 조각은 따로도 모은다** — 보조 지도(돋보기)가 같은 `d` 를 다시 쓴다.
     좌표를 새로 계산하지 않으므로 두 지도가 어긋날 수 없다. */
  if (GU_CITY[f.region]) metroPaths.push({ cell: cell, sigun: f.region, code: f.code, d: d });
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
  /* **구 칸은 자기 폴리곤이 곧 그 칸이다** — `region`(시)과 `cell`(구)이 다르지만
     이름표를 찍어야 한다. 예전 조건(`region === cell`)만 두면 12개 구가 통째로
     이름 없이 남는다(실제로 그랬다). */
  if (f.region === cell || guOf(f.name) === cell) {
    const ring = biggestRing(f.coords);
    const c = ring && ringCentroid(ring.map(([lon, lat]) => [X(lon), Y(lat)]));
    if (c) {
      const t = acc[cell] || (acc[cell] = { x: 0, y: 0, a: 0 });
      t.x += c.x * c.a; t.y += c.y * c.a; t.a += c.a;
    }
  }
}
/* **자치구 칸은 「구」를 떼고 적는다.** viewBox 400 기준으로 동안구 7.8 · 영통구
   7.9 라 세 글자가 안 들어간다(실측). 두 글자면 12곳 중 10곳이 들어간다.
   칸 id 는 `영통구` 그대로 두고 **화면에 적는 말만** 줄인다 — id 를 줄이면
   강원 `양구`(군)와 부딪힌다. */
const GU_SET = new Set(Object.keys(GU_CITY));
function labelText(cell) {
  if (!/[가-힣]{2}구$/.test(cell)) return cell;
  /* 그 구가 자치구가 있는 네 시의 것인지 확인한다 — 강원 `양구`(군)는 그대로 둔다 */
  const owner = src.features.find((f) => guOf(f.name) === cell);
  return owner && GU_SET.has(owner.region) ? cell.slice(0, -1) : cell;
}
const labels = {};
for (const r of Object.keys(acc)) {
  const t = acc[r];
  labels[r] = { x: +(t.x / t.a).toFixed(P), y: +(t.y / t.a).toFixed(P) };
  const lt = labelText(r);
  if (lt !== r) labels[r].t = lt;          /* 다를 때만 실어 파일을 안 키운다 */
  /* **칸이 얼마나 넓은가** — 화면이 이 값으로 글꼴을 고르고, 그래도 안 들어가면
     이름표를 생략한다. 자치구로 쪼개면 경기 남부가 빽빽해져(x 50~130 에 12구)
     글자가 서로 먹는다 — 크기를 재서 스스로 물러서게 하는 편이 낫다. */
  const bb = cellBox[r];
  if (bb) { labels[r].w = +(bb.x2 - bb.x1).toFixed(P); labels[r].h = +(bb.y2 - bb.y1).toFixed(P); }
}

/* ── 시·군 이름표 — **관할 밖까지 전부** ────────────────────────────────────
 * 2026-08-31 사장님: *"지도 안에 지역명 표시가 안 된 곳이 있는데 작은 글씨도 좋으니
 * 표시되면 좋겠습니다. **지명을 알아야 공략하기가 좋습니다.**"*
 *
 * 칸 이름표(위)는 23개뿐이라 ①관할 밖 경기 24곳과 ②한 칸이 여러 시를 덮는 곳
 * (성남 칸 안의 광주·이천·하남)이 **이름 없이 남아 있었다.**
 *
 * **칸 이름과 같은 자리에는 찍지 않는다** — 수원 칸은 수원시 하나라 두 번 찍히면
 * 글자가 겹쳐 뭉갠다. 화면이 칸 이름을 먼저 그리고 그것과 같은 이름은 건너뛴다.
 */
const sigun = {};
for (const f of src.features) {
  const ring = biggestRing(f.coords);
  const c = ring && ringCentroid(ring.map(([lon, lat]) => [X(lon), Y(lat)]));
  if (!c) continue;
  /* 시·군 하나가 여러 조각이면(구 단위) 가장 큰 조각에 찍는다 — 조각마다 찍으면
     「수원시장안구」처럼 한 시에 이름이 넷 붙는다. */
  /* **뒤에서 깎지 말고 앞에서 자른다.** `[가-힣]*구$` 로 깎았더니 「고양시일산서구」가
     통째로 먹혀 **빈 이름**이 나왔다(실측). 첫 「시/군」 앞까지가 곧 시·군 이름이다 —
     「고양시덕양구」→고양 · 「여주시」→여주 · 「시흥시」→시흥(비탐욕이라 안 깎인다). */
  const nm = f.region || ((f.name.match(/^(.+?)(시|군)/) || [])[1] || f.name);
  const prev = sigun[nm];
  if (!prev || c.a > prev.a) sigun[nm] = { x: +c.x.toFixed(P), y: +c.y.toFixed(P), a: c.a };
}
for (const k of Object.keys(sigun)) delete sigun[k].a;
/* 한 칸이 여러 시·군을 덮으면 화면이 그 사실을 밝혀야 한다 — 「성남」을 눌렀는데
   광주·이천·하남 건수가 함께 세어지는 이유가 화면 어디에도 없으면 안 된다. */
const members = {};
for (const f of src.features) {
  if (!f.mine) continue;
  const cell = cellOf(f);
  if (!members[cell]) members[cell] = [];
  if (members[cell].indexOf(f.region) < 0) members[cell].push(f.region);
}

const svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="geo-svg" xmlns="http://www.w3.org/2000/svg"'
  + ' role="img" aria-label="경원 관할 지도 — 경기 12개 시 · 강원 18개 시·군">'
  + paths.join('') + '</svg>';

/* JS 문자열 리터럴로 심는다 — HTML 안이라 `<`/`</script>` 는 나오지 않지만
   따옴표만 막으면 된다(SVG 에 역슬래시는 없다). */
const jsStr = (s) => "'" + s.split("'").join("\\'") + "'";


/* ── 보조 지도(돋보기) — 자치구가 있는 네 시만 크게 (2026-09-02) ───────────
 *
 * **쪼갠 뜻이 살려면 보여야 한다.** 실측으로 팔달구는 viewBox 400 기준 **9.1 × 6.6**
 * 이라 지도의 0.05% 다 — 이름표가 안 들어가고 눌러 짚기도 어렵다. 정작 후기의
 * 대부분이 그 넷에서 나오는데(수원·성남·안양·용인) 화면에서는 왼쪽 아래 구석에
 * 뭉쳐 있다.
 *
 * **`d` 를 다시 만들지 않는다** — 같은 문자열을 `transform` 으로 옮겨 쓴다.
 * 좌표를 새로 계산하면 두 지도가 조용히 어긋난다(표를 두 벌 적지 말라는 그 이유다).
 */
const mb = { x1: 1e9, y1: 1e9, x2: -1e9, y2: -1e9 };
for (const c of Object.keys(cellBox)) {
  if (!metroPaths.some((p) => p.cell === c)) continue;
  const t = cellBox[c];
  if (t.x1 < mb.x1) mb.x1 = t.x1; if (t.x2 > mb.x2) mb.x2 = t.x2;
  if (t.y1 < mb.y1) mb.y1 = t.y1; if (t.y2 > mb.y2) mb.y2 = t.y2;
}
const MPAD = 2;
const mW = +(mb.x2 - mb.x1 + MPAD * 2).toFixed(P);
const mH = +(mb.y2 - mb.y1 + MPAD * 2).toFixed(P);
const metro = metroPaths.length
  ? [
      '<svg viewBox="0 0 ' + mW + ' ' + mH
        + '" class="geo-svg geo-metro" xmlns="http://www.w3.org/2000/svg"',
      ' role="img" aria-label="수원·성남·안양·용인 자치구 확대">',
      '<g transform="translate(' + (MPAD - mb.x1).toFixed(P)
        + ' ' + (MPAD - mb.y1).toFixed(P) + ')">',
      metroPaths.map((p) => '<path data-cell="' + p.cell
        + '" data-sigun="' + p.sigun + '" data-code="' + p.code
        + '" d="' + p.d + '"/>').join(''),
      '</g></svg>'
    ].join('')
  : '';

/* 보조 지도의 이름표 — **본 지도의 자리를 그대로 옮긴다**(같은 좌표계다).
   확대되어 자리가 넉넉하므로 「구」를 떼지 않고 온전히 적는다. */
const metroLabels = {};
for (const c of Object.keys(labels)) {
  if (!metroPaths.some((p) => p.cell === c)) continue;
  const l = labels[c];
  metroLabels[c] = { x: +(l.x - mb.x1 + MPAD).toFixed(P), y: +(l.y - mb.y1 + MPAD).toFixed(P) };
}
const block = [
  BEGIN,
  '<script>',
  '/* 경원 관할 지도 — 시·군 ' + Object.keys(labels).length + '곳 · 배경 '
    + src.features.filter((f) => !f.mine).length + '곳.',
  '   출처 KOSTAT 2013 센서스용 행정구역경계(Free to share or remix).',
  '   **fetch 가 없다** — 사내망에서 CDN 이 막혀도 지도가 뜬다. */',
  'var GW_MAP = { svg: ' + jsStr(svg) + ', labels: ' + JSON.stringify(labels)
    + ', metro: ' + jsStr(metro) + ', metroLabels: ' + JSON.stringify(metroLabels)
    + ', members: ' + JSON.stringify(members)
    + ', sigun: ' + JSON.stringify(sigun) + ' };',
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
  + ' · 돋보기 ' + Object.keys(metroLabels).length + '구 ' + mW + 'x' + mH
  + ' (' + (metro.length / 1024).toFixed(1) + 'KB)'
  + (changed ? '' : ' (변화 없음)'));
