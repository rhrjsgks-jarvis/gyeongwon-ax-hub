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
};

const groups = new Map();
for (const r of rows) {
  const base = baseOf(r);
  const fn = SIZE_KEY[r.cat];
  const k = (fn && fn(r)) || { key: `폭 ${round5(base.w)}mm`, label: '본체 폭(W)' };
  const gk = `${r.cat}|${k.key}`;
  if (!groups.has(gk)) {
    groups.set(gk, { cat: r.cat, size: k.key, sizeLabel: k.label, specs: [], options: new Map() });
  }
  const g = groups.get(gk);
  if (r.size) {
    const v = normSize(r.size);
    if (!g.specs.includes(v)) g.specs.push(v);
  }
  // 발자국이 같으면 한 옵션으로 합친다(색상 변형 등)
  const ok = `${round5(base.w)}×${round5(base.h)}×${round5(base.d)}`;
  if (!g.options.has(ok)) {
    g.options.set(ok, {
      model: r.model, group: r.group, parts: r.parts, note: r.note, also: [],
    });
  } else {
    g.options.get(ok).also.push(r.model);
  }
}

const out = [...groups.values()]
  .map((g) => {
    const options = [...g.options.values()];
    return {
      cat: g.cat,
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
  })
  .sort((a, b) =>
    a.cat.localeCompare(b.cat, 'ko')
    || (parseFloat(a.size.replace(/[^\d.]/g, '')) || 0) - (parseFloat(b.size.replace(/[^\d.]/g, '')) || 0));

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
