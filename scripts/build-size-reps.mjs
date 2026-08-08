// 사이즈별 대표모델 추출기 → public/size-reps.json
// 실행: node scripts/build-size-reps.mjs  (npm run build:sizereps)
//
// 목적
//   배치 시뮬레이터(도면 위에 가전을 놓고 들어가는지 보는 도구)가 쓸 "실측 치수를 가진
//   대표모델" 목록을 만든다. 렌더링 이미지는 삼성닷컴에서 받아야 하지만, 배치 검토에
//   필요한 것은 정확한 축척의 외곽 치수라서 카탈로그 검증값만으로 충분하다.
//   모델파인더 DB(finder-app.html의 PRODUCTS)가 이미 dp/IT 카탈로그 대조를 거친
//   값이므로 그것만 출처로 쓴다 — 추정값은 만들지 않는다.
//
// 주의 1) 치수 라벨의 축 순서가 두 가지다.
//   'W×H×D...' → (가로, 높이, 깊이) / 'H×W×D...' → (높이, 가로, 깊이)
//   라벨을 보지 않고 순서대로 읽으면 폭과 높이가 뒤바뀐 채 배치된다. 설치 상담에서
//   치수 오류는 바로 사고이므로 화이트리스트에 축 순서를 명시해 둔다.
//
// 주의 2) 한 제품이 여러 덩어리로 나뉘어 설치되는 경우가 있다(에어컨 실내기/실외기,
//   청소기 본체/청정스테이션, 사운드바 우퍼 등). 배치에서는 각각이 별도의 물체이므로
//   parts[] 로 나눠 담는다.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pub = (f) => path.join(__dirname, '..', 'public', f);

// ── 배치 대상 카테고리 ──
// 바닥/벽에 자리를 차지하는 것만 넣는다. 스마트폰·태블릿·워치·SSD 등 휴대기기는 제외.
const PLACEABLE = new Set([
  '냉장고', '김치냉장고', '냉동고', '업소용 냉장고',
  '세탁기·콤보', '건조기', '에어드레서', '슈드레서',
  '식기세척기', '인덕션/전기레인지', '전자레인지/오븐', '데이코 빌트인',
  'TV', '사운드바', '에어컨', '시스템에어컨',
  '공기청정기', '제습기', '정수기', '청소기',
  '리빙 안마의자', '리빙 안마기', '리빙 비데', '리빙 욕실케어', '리빙 선풍기',
]);

// ── 치수 라벨 화이트리스트 ──
// key: fx 라벨 그대로 / order: 축 순서 / part: 배치 단위 이름
// 여기 없는 라벨은 무시한다(추측해서 넣지 않는다).
const DIM_LABELS = {
  'W×H×D': { order: 'whd', part: '본체' },
  'W×H×D(mm)': { order: 'whd', part: '본체' },
  'W×H×D(mm) 본체': { order: 'whd', part: '본체' },
  '크기(mm)': { order: 'whd', part: '본체' },
  '본체크기(㎜) W×H×D': { order: 'whd', part: '본체' },
  '본체크기(㎜) W×H×D (상하 설치 시)': { order: 'whd', part: '본체(상하 설치)' },
  '크기 W×H×D(mm) 스탠드 포함': { order: 'whd', part: '스탠드 설치' },
  '크기 W×H×D(mm) 스탠드 제외': { order: 'whd', part: '벽걸이 설치' },
  'W×H×D(mm) 실내기': { order: 'whd', part: '실내기' },
  '실내기 크기(㎜) W×H×D': { order: 'whd', part: '실내기' },
  '실외기 크기(㎜) W×H×D': { order: 'whd', part: '실외기' },
  '판넬 크기(㎜) W×H×D': { order: 'whd', part: '판넬' },
  '청정스테이션 크기(㎜) W×H×D': { order: 'whd', part: '청정스테이션' },
  '사운드바 크기(㎜) W×H×D': { order: 'whd', part: '사운드바' },
  '우퍼 크기(㎜)': { order: 'whd', part: '우퍼' },
  '서라운드 스피커 크기(㎜)': { order: 'whd', part: '서라운드 스피커' },
  'W×H×D(mm) (Door Panel 제외)': { order: 'whd', part: '본체(도어패널 제외)' },
  'W×H×D(mm) (Door Panel/설치자재 포함)': { order: 'whd', part: '설치 개구부' },
};
// 'W×H×D(실외기포함)'은 본체와 실외기를 합친 값이라 배치 단위로 쓸 수 없어 의도적으로 제외.

// ── 사이즈 축 (카테고리 → fx 라벨 후보, 앞에서부터 먼저 찾는 것 채택) ──
const SIZE_AXIS = {
  'TV': ['화면크기'],
  '에어컨': ['냉방면적(㎡)'],
  '시스템에어컨': ['냉방면적(㎡)', '정격 냉방 능력'],
  '공기청정기': ['청정면적 (㎡)', '적용면적'],
  '세탁기·콤보': ['용량 (세탁 / 건조)', '용량'],
  '업소용 냉장고': ['총 용량', '총내용적'],
  '제습기': ['물통 용량'],
  '냉장고': ['용량'], '김치냉장고': ['용량'], '냉동고': ['용량'],
  '건조기': ['용량'], '에어드레서': ['용량'], '슈드레서': ['용량'],
  '식기세척기': ['용량'], '전자레인지/오븐': ['용량'],
};

const TRIPLE = /^\s*([\d,.]+)\s*[×xX]\s*([\d,.]+)\s*[×xX]\s*([\d,.]+)/;
const num = (s) => parseFloat(String(s).replace(/,/g, ''));

function readProducts() {
  const html = fs.readFileSync(pub('finder-app.html'), 'utf8');
  const grab = (re) => {
    const m = html.match(re);
    return m ? JSON.parse(m[1]) : [];
  };
  return [
    ...grab(/let PRODUCTS = (\[[\s\S]*?\]);/),
    ...grab(/const HARMAN_PRODUCTS = (\[[\s\S]*?\]);/),
  ];
}

/** fx에서 화이트리스트에 있는 치수 라벨을 전부 뽑아 배치 단위(parts)로 만든다 */
function extractParts(fx) {
  const parts = [];
  const seen = new Set();
  for (const [label, value] of fx || []) {
    const spec = DIM_LABELS[label];
    if (!spec || typeof value !== 'string') continue;
    const m = TRIPLE.exec(value);
    if (!m) continue;
    const a = num(m[1]), b = num(m[2]), c = num(m[3]);
    if (![a, b, c].every((n) => Number.isFinite(n) && n > 0)) continue;
    const [w, h, d] = spec.order === 'hwd' ? [b, a, c] : [a, b, c];
    if (seen.has(spec.part)) continue;   // 같은 배치 단위가 두 번 나오면 먼저 읽은 값 채택
    seen.add(spec.part);
    parts.push({ part: spec.part, w, h, d, label, raw: value.trim() });
  }
  return parts;
}

function sizeOf(p) {
  const fx = Object.fromEntries((p.fx || []).map(([k, v]) => [k, v]));
  for (const label of SIZE_AXIS[p.cat] || []) {
    if (fx[label]) return { sizeLabel: label, size: String(fx[label]).trim() };
  }
  return null;
}

// ── 실행 ──
const products = readProducts();
const rows = [];

for (const p of products) {
  if (!PLACEABLE.has(p.cat)) continue;
  const parts = extractParts(p.fx);
  if (!parts.length) continue;
  const s = sizeOf(p);
  rows.push({
    cat: p.cat,
    group: p.group || '',
    model: p.model,
    sizeLabel: s ? s.sizeLabel : null,
    size: s ? s.size : null,
    parts,
    note: p.note || '',
  });
}

// ── 2단 구조로 묶는다 ──
//   1단(size)  : 사람이 고르는 사이즈. "TV 65형", "냉장고 폭 912mm" 처럼 영업 현장에서
//                실제로 쓰는 단위다.
//   2단(옵션)  : 그 사이즈 안에서 발자국(W×H×D)이 다른 실제 모델들. 같은 65형이라도
//                패널 시리즈마다 스탠드 깊이가 257~302mm로 달라, 배치 판정에는
//                고른 모델의 실측값을 써야 한다.
// 이렇게 나누는 이유: 1단만 두면 "65형" 하나에 깊이가 뭉개져 벽에서 뜨는 거리가 틀리고,
// 2단만 두면 TV가 44줄로 나와 고르기 어렵다.
const round5 = (n) => Math.round(n / 5) * 5;

const baseOf = (r) =>
  r.parts.find((x) => x.part.startsWith('본체'))
  || r.parts.find((x) => x.part === '스탠드 설치')
  || r.parts.find((x) => x.part === '실내기')
  || r.parts[0];

// '24 ㎏' / '25 kg' / '25kg' 처럼 흔들리는 표기를 하나로 맞춘다
const normSize = (s) =>
  String(s).replace(/㎏/g, 'kg').replace(/\s+/g, ' ').replace(/\s*(kg|L|인용|형)/gi, '$1').trim();

// 카테고리별 1단 기준. 여기 없는 카테고리는 폭(W)으로 묶는다 —
// 설치 상담이 "폭 912 들어가요?" 로 진행되기 때문이다.
const SIZE_KEY = {
  'TV': (r) => {
    const m = /(\d+)\s*형/.exec(r.size || '');
    return m ? { key: `${m[1]}형`, label: '화면크기' } : null;
  },
  '에어컨': (r) => (r.size ? { key: `냉방 ${normSize(r.size)}㎡`, label: '냉방면적' } : null),
  '시스템에어컨': (r) => (r.size ? { key: `냉방 ${normSize(r.size)}㎡`, label: '냉방면적' } : null),
  '공기청정기': (r) => (r.size ? { key: `${normSize(r.size)}`, label: '청정면적' } : null),
  // 냉장고·김치냉장고는 **용량**으로 고른다. 상담이 "몇 리터짜리"로 진행되고,
  // 폭으로 묶으면 602~905L 가 한 줄이 되어 용량 표시가 무의미해진다(사용자 지적).
  '냉장고': (r) => (r.size ? { key: `${normSize(r.size)}`, label: '용량' } : null),
  '김치냉장고': (r) => (r.size ? { key: `${normSize(r.size)}`, label: '용량' } : null),
};

/*
 * 무엇을 기준으로 비슷한 것끼리 묶을 것인가.
 * 기본은 발자국 폭이지만, 용량으로 고르는 카테고리는 **용량**으로 묶어야 한다 —
 * 폭으로 묶으면 "용량별 대표 1개"라는 목적과 어긋난다.
 */
const MERGE_AXIS = { '냉장고': 'cap', '김치냉장고': 'cap' };

/*
 * 냉장고·김치냉장고는 **설치 방식이 배치 판정을 가른다.**
 * 프리스탠딩은 벽에서 후면 50mm 를 띄워야 하고, 키친핏(빌트인)은 벽이 아니라 냉장고장
 * 내측 이격이라 4~12mm 다. 폭이 같아도 같은 물건이 아니다 —
 * 실제로 키친핏 Max(912×1853×697)가 프리스탠딩 4도어(912×1853×683)에 통합돼 버렸다.
 * 그래서 라인업을 사이즈 키에 넣어 애초에 섞이지 않게 한다.
 */
/*
 * 매장에서 **가정 배치 상담에 실제로 올리는 카테고리**만 기본으로 보여준다.
 * 아래 것들은 목록만 채우고 상담에는 거의 안 쓴다:
 *   업소용 냉장고 — 상업용이다
 *   데이코 빌트인 — 주방 가구와 함께 설계하는 것이라 배치 시뮬레이션 대상이 아니다
 *   시스템에어컨   — 천장 매립이라 바닥·벽 자리를 차지하지 않는다
 *   리빙(제휴상품) — 비데·욕실케어·안마기·선풍기. 배치 상담 품목이 아니다
 * 데이터에서 지우지는 않고 home:false 로 표시만 한다 — 나중에 필요하면 화면에서 켜면 된다.
 */
const HOME_OFF = new Set(['업소용 냉장고', '데이코 빌트인', '시스템에어컨', '냉동고']);
const isHome = (cat) => !HOME_OFF.has(cat) && !/^리빙/.test(cat);

const LINEUP_CATS = new Set(['냉장고', '김치냉장고']);
const lineupOf = (r) => (LINEUP_CATS.has(r.cat)
  ? (/키친핏|빌트인/.test(r.group || '') ? '키친핏' : '프리스탠딩') : '');

const groups = new Map();
for (const r of rows) {
  const base = baseOf(r);
  const fn = SIZE_KEY[r.cat];
  const k = (fn && fn(r)) || { key: `폭 ${round5(base.w)}mm`, label: '본체 폭(W)' };
  const line = lineupOf(r);
  const gk = `${r.cat}|${line}|${k.key}`;
  if (!groups.has(gk)) {
    groups.set(gk, { cat: r.cat, line, size: k.key, sizeLabel: k.label, specs: [], options: new Map() });
  }
  const g = groups.get(gk);
  if (r.size) {
    const v = normSize(r.size);
    if (!g.specs.includes(v)) g.specs.push(v);
  }
  // 발자국이 같으면 한 옵션으로 합친다(색상 변형 등)
  const ok = `${round5(base.w)}×${round5(base.h)}×${round5(base.d)}`;
  if (!g.options.has(ok)) {
    // 용량은 **옵션마다** 담는다. 사이즈 단위로만 모으면 화면에서 "뚜껑형 126L" 줄에
    // 126~347L 이 뜬다 — 그 줄은 126L 짜리인데 사이즈 전체의 범위를 보여주는 것이다.
    g.options.set(ok, {
      model: r.model, group: r.group, parts: r.parts, note: r.note, also: [], specs: [],
    });
  } else {
    g.options.get(ok).also.push(r.model);
  }
  if (r.size) {
    const v = normSize(r.size);
    const os = g.options.get(ok).specs;
    if (!os.includes(v)) os.push(v);
  }
}

const sized = [...groups.values()].map((g) => {
  const options = [...g.options.values()];
  return {
    cat: g.cat,
    line: g.line,
    size: g.size,
    sizeLabel: g.sizeLabel,
    specs: g.specs,          // 용량·화면크기 등 카탈로그 표기 (여러 개일 수 있음)
    // 대표 = 첫 옵션. PRODUCTS가 카테고리마다 플래그십 우선으로 정렬돼 있다
    // (CLAUDE.md "플래그십 우선 정렬")
    model: options[0].model,
    parts: options[0].parts,
    group: options[0].group,
    note: options[0].note,
    options,                 // 같은 사이즈 안의 발자국이 다른 실제 모델들
    count: options.reduce((n, o) => n + 1 + o.also.length, 0),
  };
});

/* ── 비슷한 사이즈 통합 ──────────────────────────────────────────
 * 이 도구는 **배치 판정**만 한다. 그러면 통합 기준은 용량이나 모델이 아니라 **발자국**이다.
 * 실제로 에어컨 냉방 34.1·42.3·48.8㎡는 실내기가 1055×299×215 로 완전히 같다 —
 * 배치상 구분할 이유가 없는데 목록만 세 줄 차지한다.
 *
 * 게다가 한 카테고리에 기준이 두 가지로 섞여 있었다. 에어컨은 냉방면적으로 묶기로 해 놓고,
 * DB 에 냉방면적이 없는 벽걸이는 폭으로 떨어져 나가 **같은 물건이 "냉방 24.4㎡"와
 * "폭 820mm"로 두 번** 실렸다. 발자국으로 묶으면 이것도 자연히 합쳐진다.
 *
 * 묶는 폭은 10% — 가장 작은 것의 1.1배까지 한 무리로 본다. 이러면 TV 42·43형은 묶이고
 * 48형(10.8% 차이)은 따로 남는다. 폭을 더 키우면 55형과 65형까지 붙어 상담에서 못 쓴다.
 *
 * **대표 치수는 무리 중 가장 큰 것을 쓴다.** 이 도구에서 가장 위험한 실패는 "들어갑니다"를
 * 거짓으로 말하는 것이므로, 애매하면 크게 재는 쪽이 안전하다.
 */
const MERGE_SPAN = 1.10;

/** 배치에 쓰는 발자국 — 바닥에 놓이는 덩어리의 폭·깊이 */
function footprintOf(rec) {
  const ps = rec.parts || [];
  const p = ps.find((x) => /본체|실내기|스탠드 설치/.test(x.part || '')) || ps[0];
  return p ? { w: +p.w || 0, d: +p.d || 0 } : { w: 0, d: 0 };
}
/** "폭 650mm" → 650 · "냉방 34.1㎡" → 34.1 · "65형" → 65 */
const numOf = (s) => parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;

const merged = [];
// 통합은 **카테고리 + 라인업** 안에서만 한다. 프리스탠딩과 키친핏은 폭이 같아도 섞으면 안 된다.
for (const part of [...new Set(sized.map((r) => r.cat + '|' + (r.line || '')))]) {
  const [cat, line] = part.split('|');
  /*
   * 묶는 축은 카테고리가 정한다. 냉장고·김치냉장고는 **용량**, 나머지는 발자국 폭.
   * 용량이 DB 에 없는 항목은 폭 키로 떨어지므로(`폭 700mm`) 두 종류가 한 목록에 섞인다 —
   * 640(L)과 700(mm)을 같은 수직선에 놓으면 아무 의미 없는 통합이 되니 종류가 다르면 안 묶는다.
   */
  const axis = MERGE_AXIS[cat] || 'w';
  const kindOf = (r) => (axis === 'cap' && /L$/.test(r.size) ? 'cap' : 'w');
  const keyOf = (r) => (kindOf(r) === 'cap' ? numOf(r.size) : r._fp.w);
  const list = sized.filter((r) => r.cat === cat && (r.line || '') === line)
    .map((r) => ({ ...r, _fp: footprintOf(r) }))
    .sort((a, b) => (kindOf(a) === kindOf(b) ? keyOf(a) - keyOf(b) : kindOf(a) === 'cap' ? -1 : 1));
  let bucket = [];
  const flush = () => {
    if (!bucket.length) return;
    // 발자국이 가장 큰 것을 대표로 — 그 치수로 배치를 판정한다
    const rep = bucket.reduce((a, b) => (a._fp.w * a._fp.d >= b._fp.w * b._fp.d ? a : b));
    const values = [...new Set(bucket.map((r) => r.size))].sort((a, b) => numOf(a) - numOf(b));
    /*
     * 라벨은 **한 단위로만** 만든다. 한 무리에 "냉방 34.1㎡"와 "폭 1055mm"가 섞여 들어오기
     * 때문이다(같은 벽걸이가 DB 에 냉방면적이 있는 것과 없는 것으로 나뉘어 있다).
     * 섞은 채 범위를 만들었더니 "폭 34.1~1100mm" 같은 말이 안 되는 라벨이 나왔다.
     * 카테고리가 정한 기준(에어컨=냉방면적, TV=인치)을 가진 항목만으로 범위를 잡고,
     * 그런 항목이 없을 때만 폭으로 적는다.
     */
    const pickUnit = (test) => values.filter((v) => test.test(v));
    const family = pickUnit(/㎡/).length ? pickUnit(/㎡/)
      : pickUnit(/형/).length ? pickUnit(/형/)
      : values;
    const lo = family[0], hi = family[family.length - 1];
    const unit = /㎡/.test(hi) ? '㎡' : /형/.test(hi) ? '형' : /L$/.test(hi) ? 'L' : /mm/.test(hi) ? 'mm' : '';
    const head = /^냉방/.test(hi) ? '냉방 ' : /^폭/.test(hi) ? '폭 ' : '';
    const size = family.length > 1
      ? `${head}${numOf(lo)}~${numOf(hi)}${unit}`      // 여러 개면 범위 — "내 평형이 없다"가 안 되게
      : hi;
    const options = [];
    const seen = new Set();
    for (const r of bucket) for (const o of r.options) {
      const key = `${o.model}|${(o.parts || []).map((p) => `${p.w}x${p.h}x${p.d}`).join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key); options.push(o);
    }
    /*
     * **옵션을 발자국이 큰 것부터 정렬한다.**
     * 화면에서는 사이즈당 한 줄만 보여주고 그 줄이 options[0] 을 쓰는데, 같은 사이즈 안에서
     * 깊이가 크게 다르다 — 냉장고 폭 910mm 는 683~930mm(247mm 차이), TV 55형은 218~483mm.
     * 카탈로그 순서(플래그십 우선)의 첫 항목을 쓰면 실제로 더 깊은 모델이 24.7cm 더
     * 튀어나오는데 "들어갑니다"가 된다. 애매하면 크게 재는 쪽이 안전하므로 큰 것을 대표로 둔다.
     */
    const foot = (o) => {
      const p = (o.parts || []).find((q) => /본체|실내기|스탠드 설치/.test(q.part || '')) || (o.parts || [])[0];
      return p ? { w: +p.w || 0, d: +p.d || 0 } : { w: 0, d: 0 };
    };
    options.sort((a, b) => foot(b).w * foot(b).d - foot(a).w * foot(a).d);
    // 사이즈 안에서 발자국이 얼마나 벌어지는지 — 화면이 "모델을 골라야 하는가"를 이걸로 판단한다
    const fs2 = options.map(foot);
    const spreadW = Math.round(Math.max(...fs2.map((f) => f.w)) - Math.min(...fs2.map((f) => f.w)));
    const spreadD = Math.round(Math.max(...fs2.map((f) => f.d)) - Math.min(...fs2.map((f) => f.d)));
    merged.push({
      cat, home: isHome(cat) || undefined, line: line || undefined, size, sizeLabel: rep.sizeLabel,
      specs: [...new Set(bucket.flatMap((r) => r.specs))],
      // 대표는 **옵션 중 발자국이 가장 큰 것**이다 (위에서 정렬해 뒀다)
      model: options[0].model, parts: options[0].parts, group: options[0].group, note: options[0].note,
      options, spreadW, spreadD,
      count: bucket.reduce((n, r) => n + r.count, 0),
      // 무엇을 묶었는지 남긴다 — 화면에서 "650·670mm 통합"으로 밝힐 수 있어야 한다
      mergedFrom: values.length > 1 ? values : undefined,
    });
    bucket = [];
  };
  for (const r of list) {
    const brk = bucket.length && (
      kindOf(r) !== kindOf(bucket[0])
      || keyOf(r) > keyOf(bucket[0]) * MERGE_SPAN
      || !keyOf(r)
    );
    if (brk) flush();
    bucket.push(r);
  }
  flush();
}

/*
 * ── 키친핏 1도어 **세트 구성** ──────────────────────────────────────────────
 * 1도어 키친핏은 한 대만 놓는 물건이 아니라 **같은 규격의 캐비닛을 나란히 붙여** 냉장고장
 * 한 벌을 만드는 상품이다. 상담에서 자리를 재는 단위도 한 대가 아니라 그 한 벌이므로,
 * 모듈 하나짜리 줄만 두면 "냉장+냉동+김치 넣을 자리 있습니까"에 답할 수 없다.
 *
 * **치수는 지어내지 않는다.** 폭·높이·깊이를 전부 DB 에 실제로 있는 모듈에서 가져와
 * 구성대로 더한다. 다만 DB(2026 카탈로그)에 **냉장·김치 모듈만** 실려 있어 냉동·와인은
 * 냉장 모듈 규격을 대신 쓴다 — 1도어 키친핏은 같은 캐비닛으로 열을 맞추는 상품이라
 * 규격이 같다는 전제이며, 그 사실을 `note` 로 화면에 밝히고 `weak` 로 실측 확인을 붙인다.
 *
 * 모듈 사이 간격은 **설치 이격**이다(CLAUDE.md: 1도어 Infinite 5mm / Bespoke 12mm).
 * 바깥 이격은 `place-app.html` 의 `CLEAR_BY_LINE` 이 따로 붙이므로 여기서는 사이만 더한다.
 */
const modRec = (model) => {
  const r = rows.find((x) => x.model === model);
  if (!r) throw new Error(`세트 구성 모듈 ${model} 이 모델파인더 DB에 없다 — 카탈로그 갱신 후 확인할 것`);
  const p = (r.parts || []).find((q) => /본체/.test(q.part || '')) || (r.parts || [])[0];
  if (!p) throw new Error(`세트 구성 모듈 ${model} 에 본체 치수가 없다`);
  return { w: +p.w, h: +p.h, d: +p.d, group: r.group, label: p.label, raw: p.raw };
};
// 어느 모듈의 치수를 쓰는가. `self:false` = DB 에 그 모듈이 없어 냉장 모듈 규격을 준용한 것
const MODULES = {
  냉장: { from: 'RR40C8995APG', self: true },
  냉동: { from: 'RR40C8995APG', self: false },
  김치: { from: 'RQ33DB7441AP', self: true },
  와인: { from: 'RR40C8995APG', self: false },
};
const SETS = [
  { names: ['냉장', '냉동'], gap: 12, lineup: 'Bespoke' },
  { names: ['냉장', '냉동', '김치'], gap: 12, lineup: 'Bespoke' },
  { names: ['냉장', '냉동', '와인', '김치'], gap: 5, lineup: 'Infinite' },
];
for (const s of SETS) {
  const mods = s.names.map((n) => ({ n, ...MODULES[n], ...modRec(MODULES[n].from) }));
  const w = mods.reduce((t, m) => t + m.w, 0) + s.gap * (mods.length - 1);
  const h = Math.max(...mods.map((m) => m.h));
  const d = Math.max(...mods.map((m) => m.d));
  const borrowed = mods.filter((m) => !m.self).map((m) => m.n);
  const base = modRec(MODULES['냉장'].from);
  merged.push({
    cat: '냉장고', home: true, line: '키친핏', set: true,
    size: `1도어 ${mods.length}세트 (${s.names.join('+')})`,
    sizeLabel: '세트 구성',
    specs: [`${mods.length}대 1세트`],
    model: MODULES['냉장'].from,
    parts: [{
      part: '본체(세트 전체)', w, h, d,
      label: '세트 폭 합계',
      raw: `${mods.map((m) => m.w).join(' + ')} + 모듈 사이 ${s.gap}㎜ × ${mods.length - 1}`,
    }],
    group: `${s.lineup} 1도어 키친핏 ${mods.length}세트`,
    note: mods.map((m) => `${m.n} ${m.w}㎜`).join(' + ')
      + ` · 모듈 사이 이격 ${s.gap}㎜(${s.lineup})`
      + (borrowed.length ? ` · ${borrowed.join('·')} 모듈은 카탈로그에 치수가 없어 냉장 모듈(${base.w}×${base.h}×${base.d}㎜) 규격을 준용 — 실측 확인` : ''),
    options: [], spreadW: 0, spreadD: 0, count: mods.length,
  });
  // 옵션은 자기 자신 하나 — 화면이 `options[0]` 을 쓰므로 비워 두면 안 된다
  const self = merged[merged.length - 1];
  self.options = [{ model: self.model, group: self.group, parts: self.parts, note: self.note, also: [], specs: self.specs }];
}

/*
 * 정렬은 **맨 앞 숫자**로 한다. 숫자를 전부 이어 붙여 쓰던 방식은 범위 라벨이 생기면서
 * 깨졌다 — "42~43형"이 4243 이 되어 115형보다 뒤로 갔다.
 * 같은 카테고리에 단위가 섞이면(TV 인치 ↔ 프로젝터 폭) 인치·면적을 앞에 둔다.
 */
const lead = (s) => parseFloat((String(s).match(/[\d.]+/) || [0])[0]) || 0;
const unitRank = (s) => (/형|㎡/.test(s) ? 0 : 1);
const out = merged
  .sort((a, b) =>
    a.cat.localeCompare(b.cat, 'ko')
    // 세트 구성은 카테고리 **맨 뒤**로. 이름의 첫 숫자가 '1도어'의 1 이라 그냥 두면
    // 333L 보다 앞에 서서, 인덱스로 고르는 쪽(테스트·외부 사용)이 조용히 어긋난다.
    || (a.set ? 1 : 0) - (b.set ? 1 : 0)
    || unitRank(a.size) - unitRank(b.size)
    || lead(a.size) - lead(b.size));

fs.writeFileSync(pub('size-reps.json'), JSON.stringify(out, null, 0) + '\n');

// ── 요약 출력 ──
const byCat = new Map();
for (const o of out) byCat.set(o.cat, (byCat.get(o.cat) || 0) + 1);
console.log(`size-reps.json 생성 — ${out.length}개 사이즈 대표 (원본 제품 ${rows.length}종)`);
for (const [c, n] of [...byCat].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c.padEnd(16)} ${String(n).padStart(3)}개 사이즈`);
}
const missing = [...PLACEABLE].filter((c) => !byCat.has(c));
if (missing.length) console.log(`\n치수 없어 제외된 카테고리: ${missing.join(', ')}`);
