/*
 * 단지 목록(`public/apt/`)을 만든다 — **경기 12개 시 + 강원 전역 18개 시·군**
 *   node scripts/build-apt-index.mjs
 *
 * ── 왜 이 파일이 필요한가 ──────────────────────────────────────
 * 도면이 있는 단지는 144곳뿐이다. 그것만 띄우면 상담사가 대부분의 고객에게
 * *"그 단지는 없습니다"* 로 시작해야 한다. 이름·동·입주년월만 있어도 고객 집을
 * 특정하고 평형 상담을 시작할 수 있고, 도면은 받아서 올리면 된다.
 *
 * 원본은 K-apt(공동주택관리정보시스템)에서 받아 `.scratch/` 에 둔 것이다
 * (`kapt-names.json`+`kapt-gy.full.json` = 경기 · `kapt-gw.json` = 강원).
 * **수집은 로컬 전용**이라(브라우저·공공 시스템) 여기서는 이미 받아 둔 것만 가공한다.
 * 원본이 없으면 그 도는 건너뛰고 **기존 파일을 그대로 둔다** — 반쪽짜리로 덮으면
 * 배포본에서 단지가 통째로 사라진다.
 *
 * ── 지키는 것 ────────────────────────────────────────────────
 * · **파일명은 영문**이다. 한글 경로는 URL 인코딩·서비스워커 캐시에서 조용히 깨진다.
 * · **select 안내 문구를 단지로 넣지 않는다.** `검색 결과가 없습니다` 가 실제로
 *   섞여 들어왔다(강릉 강동면). 사람이 보면 우스운 값이지만 목록에서는 단지처럼 보인다.
 * · 시·도를 함께 싣는다(`sido`). 앱이 `경기 수원`·`강원 춘천` 으로 지역명을 만든다 —
 *   예전에는 `'경기 ' + 시` 로 박혀 있어 강원을 넣는 순간 전부 경기가 됐다.
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'public/apt';
const SCRATCH = '.scratch';

/*
 * 시 이름 → 영문 파일명. **여기 없는 시는 내보내지 않는다** — 앱의 `APT_KEY` 와 짝이다.
 * 시·도를 함께 적는 이유가 둘이다: ①`경기 수원`·`강원 춘천` 지역명을 만들고
 * ②**같은 이름이 두 도에 있을 때**(경기 광주 ↔ 광주광역시, 강원 고성 ↔ 경남 고성)
 * 엉뚱한 도로 붙지 않게 막는다.
 */
const KEY = {
  경기: {
    수원: 'suwon', 성남: 'seongnam', 용인: 'yongin', 화성: 'hwaseong', 평택: 'pyeongtaek',
    오산: 'osan', 안성: 'anseong', 이천: 'icheon', 광주: 'gwangju', 안양: 'anyang',
    광명: 'gwangmyeong', 하남: 'hanam',
  },
  강원: {   // 전역이 관할이다 — 매장 소재지(강릉·원주·춘천·속초)가 아니라 영업 담당 구역
    춘천: 'chuncheon', 원주: 'wonju', 강릉: 'gangneung', 동해: 'donghae', 태백: 'taebaek',
    속초: 'sokcho', 삼척: 'samcheok', 홍천: 'hongcheon', 횡성: 'hoengseong', 영월: 'yeongwol',
    평창: 'pyeongchang', 정선: 'jeongseon', 철원: 'cheorwon', 화천: 'hwacheon', 양구: 'yanggu',
    인제: 'inje', 고성: 'goseong', 양양: 'yangyang',
  },
};

/* select 안내 문구가 단지로 섞여 들어온다 — 실제로 들어왔다(강릉 강동면) */
const BOGUS = /검색\s*결과|없습니다|^\s*(선택|전체)\s*$/;

const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(SCRATCH, f), 'utf8')); } catch { return null; } };

/*
 * K-apt 는 **자치구까지 내려가 적는다** — `수원권선구`·`성남분당구`·`용인기흥구`·
 * `화성동탄구`·`안양동안구`. 꼬리의 시/군/구만 떼면 `수원권선` 이 되어 표에 없는 말이
 * 되고, 그 시가 통째로 빠진다(실제로 경기 2,969 → 986 이 됐다).
 * 그래서 **표의 시 이름이 접두로 붙는지**를 본다. 긴 것부터 봐야 안전하다.
 */
const cityOf = (sido, raw) => {
  const table = KEY[sido] || {};
  const s = String(raw);
  return Object.keys(table).sort((a, b) => b.length - a.length).find((c) => s.startsWith(c)) || null;
};

/** 한 단지 원본 → 앱이 쓰는 최소 항목 */
const entry = (name, emd, occu) => {
  const o = { n: name };
  if (emd) o.d = emd;
  if (occu) o.y = occu;
  return o;
};

/*
 * **두 도에 같은 시 이름이 있으면 조용히 한 파일로 합쳐진다.** 지금은 겹치지 않지만
 * (경기 광주 ↔ 광주광역시, 강원 고성 ↔ 경남 고성은 관할 밖이라 표에 없다) 관할이
 * 늘면 바로 생길 수 있는 사고라, 합치기 전에 던진다 — 합쳐지면 화면에서는
 * "단지가 왜 이렇게 많지" 로만 보이고 원인을 못 찾는다.
 */
const byCity = {};                      // 시 → { sido, key, list[] }
const add = (sido, raw, e) => {
  const c = cityOf(sido, raw);
  if (!c) return false;                 // 관할 밖은 담지 않는다
  const cur = byCity[c];
  if (cur && cur.sido !== sido) throw new Error(`시 이름이 겹친다: ${cur.sido} ${c} ↔ ${sido} ${c} — 파일명을 갈라야 한다`);
  (byCity[c] = cur || { sido, key: KEY[sido][c], list: [] }).list.push(e);
  return true;
};

/* ── 경기 ── 이름은 화면 select(`kapt-names`), 입주년월은 API(`kapt-gy.full`) ── */
const gyNames = read('kapt-names.json');
const gyOccu = read('kapt-gy.full.json');
let gy = 0, gySkip = 0;
if (gyNames && gyOccu) {
  const occuOf = {};
  for (const a of (Array.isArray(gyOccu) ? gyOccu : Object.values(gyOccu))) if (a && a.code) occuOf[a.code] = a.occu || '';
  for (const v of Object.values(gyNames)) {
    if (!v || !v.name) continue;
    if (BOGUS.test(v.name)) { gySkip++; continue; }
    if (add('경기', v.city, entry(v.name, v.emd, occuOf[v.code]))) gy++;
  }
  console.log(`경기 ${gy}곳` + (gySkip ? ` (안내 문구 ${gySkip}건 제외)` : ''));
} else {
  console.log('경기 원본이 없다 — 건너뛴다(기존 파일 유지)');
}

/* ── 강원 ── 한 바퀴에 이름·입주년월을 함께 받아 둔 것 ── */
const gwRaw = read('kapt-gw.json');
let gw = 0, gwSkip = 0;
if (gwRaw) {
  for (const v of Object.values(gwRaw)) {
    if (!v || !v.name) continue;
    if (BOGUS.test(v.name)) { gwSkip++; continue; }
    if (add('강원', v.city, entry(v.name, v.emd, v.occu))) gw++;
  }
  console.log(`강원 ${gw}곳` + (gwSkip ? ` (안내 문구 ${gwSkip}건 제외)` : ''));
} else {
  console.log('강원 원본이 없다 — 건너뛴다(기존 파일 유지)');
}

if (!gy && !gw) { console.log('\n원본이 하나도 없다 — 아무것도 쓰지 않는다'); process.exit(0); }

/* ── 파일로 낸다 ── */
fs.mkdirSync(OUT, { recursive: true });
const cities = [];
for (const [city, { sido, key, list }] of Object.entries(byCity)) {
  list.sort((a, b) => a.n.localeCompare(b.n, 'ko'));
  const body = JSON.stringify(list);
  fs.writeFileSync(path.join(OUT, key + '.json'), body);
  cities.push({ city, sido, n: list.length, kb: +(Buffer.byteLength(body) / 1024).toFixed(1), key });
}
cities.sort((a, b) => (a.sido === b.sido ? b.n - a.n : (a.sido === '경기' ? -1 : 1)));
const total = cities.reduce((s, c) => s + c.n, 0);
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ total, cities }));

console.log(`\n합계 ${total.toLocaleString()}곳 / ${cities.length}개 시·군 → ${OUT}/`);
for (const sd of ['경기', '강원']) {
  const g = cities.filter((c) => c.sido === sd);
  if (!g.length) continue;
  console.log(`  ${sd} ${g.reduce((s, c) => s + c.n, 0).toLocaleString()}곳 — ` + g.map((c) => `${c.city} ${c.n}`).join(' · '));
}
