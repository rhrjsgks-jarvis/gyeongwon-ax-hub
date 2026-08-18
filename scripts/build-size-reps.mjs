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

/* 네 번째 그룹은 **세 번째 값에 붙은 괄호 범위** — 그 자리가 높이라는 표시다(extractParts 주석) */
const TRIPLE = /^\s*([\d,.]+)\s*[×xX]\s*([\d,.]+)\s*[×xX]\s*([\d,.]+)\s*(\([\d,]+\))?/;
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
    /*
     * **세 번째 값에 괄호 범위가 붙으면 그 자리가 높이다** — 표기 순서가 `W × D × H` 다.
     *
     * 오드앵글 선풍기가 `370 × 390 × 840(1090)` 이다. 괄호는 **높이 조절 범위**이지
     * 깊이가 늘어나는 것이 아니다. 그런데 라벨(`크기(mm)`)만 보고 W×H×D 로 읽으면
     * 높이 390 · **깊이 840** 이 되어, 도면 위 발자국이 370×390 대신 **370×840** 으로
     * 두 배 넘게 잡힌다 — "들어갑니다" 판정이 그대로 거짓이 된다.
     *
     * 규칙을 좁게 둔 근거: DB 전수에서 이 표기(세 번째 값 + 괄호)는 **딱 2건**이고
     * 둘 다 오드앵글 선풍기다. 반대로 "높이 < 깊이" 로 넓게 잡으면 슬림 정수기
     * (170×395×480)처럼 **실제로 깊은 제품**까지 뒤집어 놓는다(실측 4건).
     */
    const wdh = !!m[4];
    const [w, h, d] = spec.order === 'hwd' ? [b, a, c] : wdh ? [a, c, b] : [a, b, c];
    if (seen.has(spec.part)) continue;   // 같은 배치 단위가 두 번 나오면 먼저 읽은 값 채택
    seen.add(spec.part);
    parts.push({ part: spec.part, w, h, d, label, raw: value.trim() });
  }
  return parts;
}

/*
 * ── 제품 컬러 ────────────────────────────────────────────────────
 *
 * **색을 지어내지 않는다.** 도면 위 가전을 실물에 가깝게 보이려면 색이 있어야 하는데,
 * 그 색은 카탈로그에 이미 적혀 있다(`색상: 코타 화이트`). 없는 것을 그럴듯하게 칠하면
 * 고객이 실물로 오해한다 — 외형을 단순하게 두는 것과 같은 이유다.
 *
 * **어느 라벨이 제품 색인지 골라야 한다.** `컬러` 로 시작하는 라벨이 다 색은 아니다 —
 * 실측(586종): `컬러 부스터` 52 · `컬러지원` 20 은 TV 화질 기능이고, `조작부 색상` 은
 * 몸통이 아니라 조작부다. 아래 목록에 있는 라벨만 제품 색으로 본다(실측 152행).
 */
const COLOR_LABELS = new Set([
  '색상', '컬러', '색상(바디)', '색상(바디 / 바람문)', '색상(상부)',
  '색상 및 재질', '색상 / 재질', '선택 가능 컬러', '프레임 컬러', '패턴 / 컬러',
]);

/*
 * **hex 는 이름 안의 색 단어에서만 나온다.** 카탈로그 컬러명은 실측 80종이고 꼬리가 길다
 * (`솝스톤 챠콜` · `제주 그리너리` · `REFINED INOX` …). 이름마다 색을 정해 주려면 결국
 * 짐작이 섞이므로, **이름이 스스로 말하는 색만** 받는다. 긴 단어부터 본다
 * (`블루 그레이` 가 `그레이` 보다 먼저 걸려야 한다).
 *
 * 색 단어가 없으면 `hex` 를 비운다 — 화면이 회백색으로 그리고 **"색 미상"이라고 적는다.**
 * 비슷한 색을 임의로 넣지 않는다.
 */
const COLOR_WORDS = [
  ['블루 그레이', '#8A97A6'], ['블랙캐비어', '#26262A'], ['그레이지', '#B9B0A4'],
  ['다크그레이', '#5A5F66'], ['다크스틸', '#4A4F55'], ['다크메탈', '#4A4F55'],
  ['실버스틸', '#B9BEC4'], ['그리너리', '#7E9A6E'], ['베이지그린', '#B6BC9A'],
  ['카퍼', '#B06A3B'], ['브라운', '#7A5A44'], ['차콜', '#3E4247'], ['챠콜', '#3E4247'],
  ['플럼', '#6E4457'], ['골드', '#C8A96B'], ['미러', '#C6CBD1'], ['이녹스', '#AFB5BB'],
  ['INOX', '#AFB5BB'], ['SILVER', '#B9BEC4'], ['실버', '#B9BEC4'],
  ['화이트', '#F2F1EE'], ['WHITE', '#F2F1EE'], ['베이지', '#DCD2C0'],
  ['블랙', '#2B2B2E'], ['BLACK', '#2B2B2E'], ['그레이', '#9AA0A6'],
];

/*
 * **TV 는 색상 표기가 없어도 블랙으로 둔다** (2026-08-18 사용자 결정: *"TV는 블랙으로
 * 하면됩니다"*).
 *
 * 위 규칙("이름이 스스로 말하는 색만")의 **예외**이고, 그래서 여기 따로 적는다.
 * 근거는 데이터가 아니라 **영업 현장의 사실**이다 — 카탈로그에도 삼성닷컴에도 TV 색상
 * 항목이 없는데(실측: 삼성닷컴 TV 256종 중 색상 0종), 화면은 흰 상자를 세우고 있었다.
 * 거실 3D 에서 가장 큰 물건이 흰 판으로 서면 "우리 집 느낌"이 그 자리에서 깨진다.
 *
 * **프로젝터는 뺀다.** TV 카테고리에는 The Freestyle·The Premiere 가 함께 들어 있고
 * (제품군이 `프로젝터`, 파트가 `본체` 하나뿐) 그것들은 검지 않다. CLAUDE.md 가
 * "모든 TV 는 벽걸이로 검사하면 깨진다"고 적어 둔 것과 같은 함정이다.
 */
function tvColor(p) {
  if (!/^TV$/.test(String(p.cat || '').trim())) return null;
  if (/프로젝터/.test(String(p.group || ''))) return null;
  return { color: '블랙(제품 공통)', hex: '#1C1F24' };
}

/** 카탈로그에 적힌 제품 색 — 원문(color)과 화면용(hex). 없으면 null */
function colorOf(p) {
  for (const [label, value] of p.fx || []) {
    if (!COLOR_LABELS.has(String(label).trim())) continue;
    const raw = String(value).trim();
    if (!raw || /^-+$/.test(raw)) continue;
    /* 여러 색이 적힌 줄(`화이트 / 블랙`)은 **첫 색**을 대표로 쓴다. 접두 코드(`W - 화이트`)와
       괄호 주석은 뗀다 — 색 이름을 찾는 것이지 표기를 그대로 쓰는 것이 아니다 */
    const first = raw.split(/[\/,·]/)[0].replace(/^[A-Z]{1,3}\s*-\s*/, '').replace(/\(.*?\)?$/, '').trim();
    if (!first) continue;
    /* 띄어쓰기는 무시한다 — '다크 메탈' 과 '다크메탈' 은 같은 말이다(색을 지어내는 것이 아니다) */
    const flat = first.toUpperCase().replace(/\s+/g, '');
    const hit = COLOR_WORDS.find(([w]) => flat.includes(w.toUpperCase().replace(/\s+/g, '')));
    return { color: raw, hex: hit ? hit[1] : null };
  }
  return null;
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
  const col = tvColor(p) || colorOf(p);
  rows.push({
    cat: p.cat,
    group: p.group || '',
    model: p.model,
    color: col ? col.color : null,
    hex: col ? col.hex : null,
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
  /*
   * 에어컨은 **냉방면적이 아니라 설치 형태**로 고른다(2026-08-09 사용자 결정).
   * *"에어컨 실내기 크기는 거의 동일하니 슬림형인지 와이드형인지, 클래식인지, Q9000인지
   *  4가지로만 구분하면 될 것 같습니다."*
   * 실제로 무풍 클래식(AF70F)과 Q9000 클래식(AF60F)은 363×1,883 으로 발자국이 **완전히 같다** —
   * 냉방면적으로 묶으면 애초에 구분이 안 되고, 배치에서 달라지는 것도 없다.
   * 상담에서 스탠드를 부르는 말이 곧 이 넷이므로 그대로 1단으로 쓴다.
   *
   * 모델 접두가 설치 형태를 그대로 담고 있다 — AF=스탠드 · AR=벽걸이 · AW=창문형.
   * 제품군 문자열로 가르면 "갤러리 스탠드 구형 (2024) / 창문형"처럼 둘이 한 칸에 적힌
   * 항목에서 뒤집힌다.
   */
  '에어컨': (r) => {
    const m = r.model || '', g = r.group || '';
    if (/^AW/.test(m)) return { key: '창문형', label: '설치 형태' };
    if (/^AR/.test(m)) return { key: '벽걸이', label: '설치 형태' };
    if (!/^AF/.test(m)) return null;                      // 알 수 없으면 폭으로 떨어뜨린다
    if (/Q9000/.test(g)) return { key: 'Q9000 스탠드', label: '설치 형태' };
    if (/클래식/.test(g)) return { key: '클래식 스탠드', label: '설치 형태' };
    /*
     * 갤러리 계열은 이름으로 못 가른다 — AF80F(492㎜)와 AF90H(360㎜)가 둘 다 '무풍콤보 갤러리'다.
     * 슬림/와이드를 실제로 가르는 것은 **폭**이므로 폭으로 가른다.
     */
    return (baseOf(r).w >= 450)
      ? { key: '와이드형 스탠드', label: '설치 형태' }
      : { key: '슬림형 스탠드', label: '설치 형태' };
  },
  '시스템에어컨': (r) => (r.size ? { key: `냉방 ${normSize(r.size)}㎡`, label: '냉방면적' } : null),
  /*
   * 콤보는 **세탁/건조 용량**으로 부른다(2026-08-09 사용자 결정) —
   * *"콤보는 25/21kg 이런 식으로 대략적으로 맥락만 확인하는 걸로."*
   * 세탁기는 그대로 폭이다. 세탁기 위에 건조기를 적층하는 상담이 폭으로 진행되기 때문이다.
   */
  '세탁기·콤보': (r) => {
    if (lineupOf(r) !== '콤보') return null;
    const m = /(\d+)\s*kg\s*\/\s*(\d+)\s*kg/.exec(normSize(r.size || ''));
    return m ? { key: `${m[1]}/${m[2]}kg`, label: '용량 (세탁/건조)' } : null;
  },
  /*
   * 공기청정기는 청정면적으로 고르되 **벽걸이형은 갈라 놓는다**(2026-08-09 사용자 지적:
   * *"공기청정기는 치수가 잘못된 건지 길게 나옵니다. 상단에서 바라봤을 때는 작은 네모
   * 모양이 나오는 게 정상입니다."*).
   * 치수가 틀린 것이 아니라 `AX99N4020WWD`(블루스카이 4000 **벽걸이형**)가 1050×600×130
   * 이라 바닥에 1050×130 막대로 그려진 것이다. 청정면적이 85㎡ 로 가장 커서 대표로 뽑혔다.
   * 벽에 거는 물건은 바닥 발자국이 없으니 스탠드형과 한 줄에 두면 안 된다.
   */
  '공기청정기': (r) => (r.size
    ? { key: `${normSize(r.size)}${/벽걸이/.test(r.group || '') ? ' 벽걸이형' : ''}`, label: '청정면적' }
    : null),
  /*
   * 냉장고는 **도어 구성 + 설치 방식**으로 고른다(2026-08-09 사용자 결정) —
   * *"냉장고도 4도어 프리스탠딩, 4도어 키친핏, 양문형, 1도어세트(냉장+냉동),
   *  1도어세트(냉장+냉동+김치), 이런 식으로만 되도 됩니다."*
   * 용량으로 고르던 때는 한 줄에 4도어와 양문형이 섞였다(845~905L = 912×930 4도어 +
   * 912×892 양문형). 매장에서 "몇 리터"보다 먼저 정해지는 것은 어느 형태냐이고,
   * 형태가 곧 발자국이라 배치 판정과도 맞는다.
   *
   * 형태는 **제품군 문자열과 모델 접두 둘 다**로 가른다 — 12개 조합 전수 확인 결과
   * 둘이 완전히 일치하고(RR=1도어 · RS=양문형 · RB/RT=일반형 · RM=4도어),
   * 제품군이 '카탈로그 수록 모델 (2026)' 처럼 형태를 안 밝히는 항목도 접두로 갈린다.
   */
  '냉장고': (r) => {
    const g = r.group || '', m = r.model || '';
    let form = (/양문형/.test(g) || /^RS/.test(m)) ? '양문형'
      : (/일반형/.test(g) || /^R[BT]/.test(m)) ? '일반형'
      : (/1도어/.test(g) || /^RR/.test(m)) ? '1도어'
      : (/4도어/.test(g) || /^R[MF]/.test(m)) ? '4도어'
      : null;
    if (!form) return null;
    /*
     * **접두만으로는 4도어와 상냉장하냉동이 안 갈린다.** 같은 RM 시리즈에 둘 다 있다 —
     * `RM70F91R1AP`(700×1853×685, 615L)는 제품군이 'AI 하이브리드 F시리즈'라 형태를
     * 안 밝히는데 폭이 700㎜ 다. 이대로 두면 4도어 줄의 옵션이 되어, 자리가 모자랄 때
     * "같은 4도어 중 700×685 규격이면 들어갑니다"라는 **없는 제품을 안내하게 된다.**
     * DB 안에서 검증되는 기준: 4도어로 명시된 것은 전부 912㎜ 이고, '일반형'으로 명시된
     * 것은 700·595㎜ 다. 그래서 800㎜ 를 경계로 둔다.
     */
    if (form === '4도어' && baseOf(r).w < 800) form = '일반형';
    /*
     * 설치 방식은 **키친핏일 때, 그리고 짝이 있는 4도어일 때만** 이름에 넣는다.
     * 양문형·일반형은 키친핏 짝이 없어 '양문형 프리스탠딩' 이 군더더기다.
     */
    const kit = /키친핏|빌트인/.test(g);            // lineupOf 와 같은 기준
    const suffix = kit ? ' 키친핏' : form === '4도어' ? ' 프리스탠딩' : '';
    return { key: `${form}${suffix}`, label: '도어 구성' };
  },
  '김치냉장고': (r) => (r.size ? { key: `${normSize(r.size)}`, label: '용량' } : null),
};

/*
 * 무엇을 기준으로 비슷한 것끼리 묶을 것인가.
 * 기본은 발자국 폭이지만, 용량으로 고르는 카테고리는 **용량**으로 묶어야 한다 —
 * 폭으로 묶으면 "용량별 대표 1개"라는 목적과 어긋난다.
 */
/*
 * 냉장고가 'd'(깊이)인 이유: 1단이 도어 구성으로 바뀌면서 통합 축을 용량으로 둘 수 없게 됐고,
 * 폭으로 두면 4도어가 전부 912㎜ 라 **깊이 683 과 930 이 한 줄로 합쳐진다**. 247㎜ 차이는
 * 이 도구가 감당할 오차가 아니다 — "폭이 같고 깊이만 줄어 들어가는" 대안 제시가 통째로
 * 사라지고, 얕은 4도어가 들어갈 주방에 "안 들어갑니다"를 말하게 된다.
 */
const MERGE_AXIS = { '냉장고': 'd', '김치냉장고': 'cap' };

/*
 * 사이즈 키가 **이름**이라 숫자로 이웃을 판단할 수 없는 카테고리.
 * 이름이 다르면 발자국이 아무리 닮아도 묶지 않는다 — 4도어와 양문형은 912×916/915 로
 * 거의 같지만 매장에서 같은 물건이 아니다.
 */
const KEY_LOCKED = new Set(['냉장고']);

/*
 * 사이즈 기준이 **숫자가 아니라 이름**인 카테고리는 통합에서 뺀다.
 * 에어컨은 슬림(360㎜)·클래식(363㎜)·Q9000(363㎜)이 폭 10% 안에 들어와 한 무리로 묶이는데,
 * 그러면 라벨이 `슬림형 스탠드~Q9000 스탠드` 가 되고 사용자가 고르려던 구분이 통째로 사라진다.
 * 이름으로 부르는 카테고리는 그 이름이 곧 한 줄이다.
 */
const NAMED_SIZE = new Set(['에어컨']);

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

const LINEUP_CATS = new Set(['냉장고', '김치냉장고', '세탁기·콤보']);
/*
 * 세탁기와 콤보(세탁+건조 일체형)도 갈라야 한다. 겉보기 폭이 같아 한 줄로 묶이는데,
 * **설치가 다르다** — 세탁기 위에는 건조기를 적층하지만 콤보 위에는 얹지 않는다.
 * 묶어 두면 대표가 콤보(WD90H25AHS)로 뽑혀 **세탁기+건조기 적층 상담이 아예 불가능해진다.**
 * (배치 시뮬레이터의 겹침 예외가 콤보를 제외하기 때문이다.)
 */
const lineupOf = (r) => {
  if (!LINEUP_CATS.has(r.cat)) return '';
  if (r.cat === '세탁기·콤보') return (/콤보/.test(r.group || '') || /^WD/.test(r.model || '')) ? '콤보' : '세탁기';
  return /키친핏|빌트인/.test(r.group || '') ? '키친핏' : '프리스탠딩';
};

/*
 * 화면에 적히는 사양 값. **단위를 여기서 붙인다.**
 * 에어컨 냉방면적은 DB 에 단위 없는 숫자("62.6")로 들어 있다. 예전에는 사이즈 키가
 * `냉방 62.6㎡` 라 화면에 단위가 보였는데, 1단이 설치 형태로 바뀌면서 그 통로가 사라졌다.
 * 이제 `specs` 가 유일하게 냉방면적을 나르므로, 숫자만 뜨면 무엇의 값인지 알 수 없다
 * ("슬림형 스탠드 — 360×1930×330mm · 56.9~62.6").
 * 사이즈 단위와 옵션 단위 두 곳에서 쌓으므로 한 함수로 묶는다 — 한쪽만 고치면 어긋난다.
 */
function specText(r) {
  const v = normSize(r.size);
  return (/에어컨/.test(r.cat) && /^[\d.]+$/.test(v)) ? `${v}㎡` : v;
}

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
    /*
     * 에어컨 냉방면적은 DB 에 단위 없는 숫자("62.6")로 들어 있다. 예전에는 사이즈 키가
     * `냉방 62.6㎡` 라 화면에 단위가 보였는데, 1단이 설치 형태로 바뀌면서 그 통로가 사라졌다.
     * `specs` 가 유일하게 냉방면적을 나르므로 여기서 단위를 붙인다 — 숫자만 뜨면
     * "슬림형 스탠드 … · 56.9~62.6" 이 되어 무엇의 값인지 알 수 없다.
     */
    const v = specText(r);
    if (!g.specs.includes(v)) g.specs.push(v);
  }
  // 발자국이 같으면 한 옵션으로 합친다(색상 변형 등)
  const ok = `${round5(base.w)}×${round5(base.h)}×${round5(base.d)}`;
  if (!g.options.has(ok)) {
    // 용량은 **옵션마다** 담는다. 사이즈 단위로만 모으면 화면에서 "뚜껑형 126L" 줄에
    // 126~347L 이 뜬다 — 그 줄은 126L 짜리인데 사이즈 전체의 범위를 보여주는 것이다.
    g.options.set(ok, {
      model: r.model, group: r.group, parts: r.parts, note: r.note, also: [], specs: [],
      /* 카탈로그에 적힌 제품 색 — 원문과 화면용. 2D 실루엣과 3D 가 같은 값을 쓴다 */
      color: r.color || null, hex: r.hex || null,
    });
  } else {
    g.options.get(ok).also.push(r.model);
  }
  if (r.size) {
    const v = specText(r);
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
  const keyOf = (r) => (kindOf(r) === 'cap' ? numOf(r.size)
    : axis === 'd' ? r._fp.d : r._fp.w);
  const list = sized.filter((r) => r.cat === cat && (r.line || '') === line)
    .map((r) => ({ ...r, _fp: footprintOf(r) }))
    // 사이즈 키가 이름인 카테고리는 **같은 이름끼리 붙여 놓아야** 버킷이 제대로 잡힌다
    .sort((a, b) => (KEY_LOCKED.has(cat) && a.size !== b.size ? (a.size < b.size ? -1 : 1)
      : kindOf(a) === kindOf(b) ? keyOf(a) - keyOf(b) : kindOf(a) === 'cap' ? -1 : 1));
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
    /*
     * 콤보 용량(`25/20kg`)이 여기 먼저 오는 이유: 같은 무리에 **용량이 비어 폭 키로 떨어진 행**이
     * 섞인다(카탈로그에서 색상 변형이 한 열을 공유해 값을 못 채운 `WD90H25AHS`).
     * 그대로 두면 라벨이 `685~2520` 이 됐다 — 폭(685)과 용량(25/20 → 2520)을 한 줄에 놓은 것이다.
     */
    const family = pickUnit(/^\d+\/\d+kg$/).length ? pickUnit(/^\d+\/\d+kg$/)
      : pickUnit(/㎡/).length ? pickUnit(/㎡/)
      : pickUnit(/형/).length ? pickUnit(/형/)
      : values;
    const lo = family[0], hi = family[family.length - 1];
    const unit = /㎡/.test(hi) ? '㎡' : /형/.test(hi) ? '형' : /L$/.test(hi) ? 'L' : /mm/.test(hi) ? 'mm' : '';
    const head = /^냉방/.test(hi) ? '냉방 ' : /^폭/.test(hi) ? '폭 ' : '';
    /*
     * "25/20kg" 처럼 **한 값 안에 숫자가 둘**인 표기는 자리별로 범위를 잡는다.
     * 그냥 numOf 를 태우면 "2520~2518kg" 이 나온다(숫자를 이어 붙여 읽는다).
     */
    const pair = family.every((v) => /^\d+\/\d+kg$/.test(v))
      && family.map((v) => v.match(/\d+/g).map(Number));
    const span = (xs) => (Math.min(...xs) === Math.max(...xs)
      ? `${Math.min(...xs)}` : `${Math.min(...xs)}~${Math.max(...xs)}`);
    const size = pair
      ? `${span(pair.map((p) => p[0]))}/${span(pair.map((p) => p[1]))}kg`
      : family.length > 1
        ? `${head}${numOf(lo)}~${numOf(hi)}${unit}`    // 여러 개면 범위 — "내 평형이 없다"가 안 되게
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
      cat, home: isHome(cat) || undefined, line: line || undefined, size,
      // 사이즈가 이름이라 폭·용량으로 줄세울 수 없다는 표시 — 화면이 데이터 순서를 그대로 쓴다
      named: (NAMED_SIZE.has(cat) || KEY_LOCKED.has(cat)) || undefined,
      // 라벨도 라벨을 만든 단위를 따라간다 — 폭 키로 떨어진 행이 대표가 되면
      // `25/18~20kg` 에 "본체 폭(W)" 이 붙는다
      sizeLabel: (bucket.find((r) => family.includes(r.size)) || rep).sizeLabel,
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
      NAMED_SIZE.has(cat)
      || (KEY_LOCKED.has(cat) && r.size !== bucket[0].size)
      || kindOf(r) !== kindOf(bucket[0])
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
 * **치수는 지어내지 않는다.** 근거는 전부 설치환경 가이드(`install-app.html` '냉장고 1도어',
 * 출처: 삼성닷컴 구매가이드 설치가이드 팝업)와 모델파인더 DB 에 있다.
 *  - 1도어 키친핏은 **냉장·냉동·김치·와인이 같은 캐비닛**으로 나온다
 *    (가이드 소제목 "냉장·냉동·김치·와인 등 원하는 조합으로 구성",
 *     규격도 캡션 "폭 595mm·높이 1,855mm"). DB 가 두 모듈로 이를 뒷받침한다 —
 *    냉장 `RR40C8995APG` 595×1855×688 과 김치 `RQ34C8945APG` 595×1855×688 이 **완전히 같다.**
 *  - 조합 설치의 **제품 간 간격은 6㎜**다. 가이드 '냉장고 페어(2대 이상) 설치'가 라인업별로
 *    갈라 적고 있다 — "Infinite Line·구형 Bespoke: 10mm · **신형 Bespoke 키친핏 Max
 *    (냉장고+김치냉장고 조합): 6mm**". 10㎜는 **구형 산정 방식**이라 현행 라인업에 쓰면
 *    좁은 간격이라는 이 상품의 강점을 스스로 지우게 된다(사용자 지적).
 *  - 냉장고장 내측 **외곽 이격은 좌우 각 4㎜**(같은 표: "신형 Bespoke 키친핏 Max: 좌우 각 4mm").
 *    이 값은 `place-app.html` 의 `CLEAR_BY_LINE` 이 붙이므로 여기 폭에는 더하지 않고,
 *    합쳐서 필요한 **냉장고장 내경**만 note 로 함께 적는다.
 *
 * **처음 판은 두 군데가 틀렸고 사용자가 잡아냈다.** ①김치 모듈을 695㎜(키친핏 313L, RQ33)로
 * 잡았는데 그 제품은 1도어 조합 모듈이 아니다 ②모듈 사이를 5·12㎜로 뒀는데 그 값은 모듈
 * 사이가 아니라 **냉장고장 내측 좌우(외곽) 이격**이다. 외곽 이격은 `place-app.html` 의
 * `CLEAR_BY_LINE` 이 따로 붙이므로 여기서 더하면 이중 계산이기도 했다.
 *
 * 조합은 **같은 라인업끼리만** 가능하다(가이드 주의: "1도어와 4도어 간 페어 설치는 불가").
 */
const modRec = (model) => {
  const r = rows.find((x) => x.model === model);
  if (!r) throw new Error(`세트 구성 모듈 ${model} 이 모델파인더 DB에 없다 — 카탈로그 갱신 후 확인할 것`);
  const p = (r.parts || []).find((q) => /본체/.test(q.part || '')) || (r.parts || [])[0];
  if (!p) throw new Error(`세트 구성 모듈 ${model} 에 본체 치수가 없다`);
  return { w: +p.w, h: +p.h, d: +p.d, group: r.group, label: p.label, raw: p.raw };
};
const ONE_DOOR = 'RR40C8995APG';   // 1도어 냉장 키친핏 — 595×1855×688 · 408L
const ONE_DOOR_KIM = 'RQ34C8945APG'; // 1도어 김치 키친핏 — 595×1855×688 · 347L (냉장과 동일 규격)
const PAIR_GAP = 6;                // 제품 간 간격 — 신형 Bespoke 키친핏 Max 기준(구형 10㎜ 아님)
const CABINET_SIDE = 4;            // 냉장고장 내측 외곽 이격(좌·우 각) — 같은 기준
const SETS = [
  { names: ['냉장', '냉동'], lineup: 'Bespoke' },
  { names: ['냉장', '냉동', '김치'], lineup: 'Bespoke' },
  { names: ['냉장', '냉동', '와인', '김치'], lineup: 'Infinite' },
];
/*
 * 두 모듈이 정말 같은 규격인지 여기서 확인한다. 카탈로그가 갱신되며 어긋나면
 * "같은 캐비닛"이라는 전제가 깨진 것이니 조용히 넘어가면 안 된다.
 */
{
  const a = modRec(ONE_DOOR), b = modRec(ONE_DOOR_KIM);
  if (a.w !== b.w || a.h !== b.h || a.d !== b.d) {
    throw new Error(`1도어 키친핏 냉장(${a.w}×${a.h}×${a.d})과 김치(${b.w}×${b.h}×${b.d})의 규격이 달라졌다`
      + ' — 세트 폭을 모듈별로 다시 계산해야 한다');
  }
}
for (const s of SETS) {
  const m = modRec(ONE_DOOR);
  const n = s.names.length;
  const w = m.w * n + PAIR_GAP * (n - 1);
  merged.push({
    cat: '냉장고', home: true, line: '키친핏', set: true, named: true,
    // '2세트' 는 "세트 두 벌"로 읽힌다. 대수는 괄호 안 구성이 이미 말한다.
    size: `1도어 키친핏 세트 (${s.names.join('+')})`,
    sizeLabel: '세트 구성',
    specs: [`${n}대 1세트`],
    model: ONE_DOOR,
    parts: [{
      part: '본체(세트 전체)', w, h: m.h, d: m.d,
      label: '세트 폭 합계',
      raw: `${m.w}㎜ × ${n}대 + 제품 간 ${PAIR_GAP}㎜ × ${n - 1}`,
    }],
    group: `${s.lineup} 1도어 키친핏 ${n}세트`,
    note: `제품 ${m.w}㎜ × ${n}대 + 제품 간 ${PAIR_GAP}㎜ × ${n - 1} = ${w}㎜`
      + ` · 좌우 각 ${CABINET_SIDE}㎜를 더해 냉장고장 내경 가로 ${w + CABINET_SIDE * 2}㎜ 필요`
      + ` · 높이 1,873㎜ 이상 · 깊이 700㎜ 이상(콘센트 있을 시 720㎜)`
      + ` · 간격은 신형 Bespoke 키친핏 Max 기준(구형 10㎜ 아님)`
      + ` · 냉장(${ONE_DOOR})과 김치(${ONE_DOOR_KIM})가 같은 ${m.w}×${m.h}×${m.d}㎜ 캐비닛이라 냉동·와인도 같은 폭으로 본다`
      + ` · 같은 라인업(${s.lineup})끼리만 조합 가능(1도어-4도어 페어 불가) · 페어키트(별매) 필요`,
    options: [], spreadW: 0, spreadD: 0, count: n,
  });
  // 옵션은 자기 자신 하나 — 화면이 `options[0]` 을 쓰므로 비워 두면 안 된다
  const self = merged[merged.length - 1];
  self.options = [{ model: self.model, group: self.group, parts: self.parts, note: self.note, also: [], specs: self.specs }];
}

/*
 * ── 김치냉장고 4도어 키친핏 ──────────────────────────────────────────────
 * **카탈로그에 없고 설치가이드에만 있는 제품이다.** 모델파인더 DB 의 김치냉장고 중
 * 키친핏은 313L(RQ33*, 695㎜)뿐이고, 폭이 비슷한 RK80F49E1A·RK70F49F1DD 는 스펙표에
 * `설치 유형 = 프리스탠딩` 으로 명시돼 있다. 그래서 카탈로그만 보면 이 제품이 통째로 없다 —
 * 사용자가 "김치냉장고 4도어 키친핏이 확인이 안 된다"고 한 것이 이것이다.
 *
 * 치수는 설치환경 가이드(`install-app.html`)에 **세 곳**으로 남아 있고 서로 검산된다:
 *   ① '냉장고 4도어 키친핏 Max' 규격도 캡션 — 냉장고 908㎜ + **김치냉장고 795㎜**,
 *      제품간 6㎜, 제품 높이 1,853㎜, 냉장고장 높이 1,873㎜ · 깊이 700㎜
 *   ② '냉장고 페어(2대 이상) 설치' 규격도 캡션(Infinite) — 냉장고 912㎜ + **김치플러스 4도어 795㎜**
 *   ③ '김치냉장고' 엔트리 — 냉장고장 가로 **803㎜ 이상** · 좌우 이격 4㎜ (`RK**F42*` 기준)
 * ③의 803 = 795 + 4 + 4 로 ①②의 제품 폭과 정확히 맞아떨어진다.
 *
 * **깊이는 제품 값이 아니라 냉장고장 요건(700㎜)을 쓴다.** 가이드에 제품 깊이가 없고,
 * 도면에서 자리를 차지하는 것은 결국 냉장고장이기 때문이다. `depthIsCabinet` 로 표시해
 * 화면이 그 사실을 밝힌다 — 제품 깊이인 척하면 안 된다.
 *
 * 모델코드는 비워 둔다. 가이드가 `RK**F42*` 라는 **와일드카드**로만 적고 있고,
 * CLAUDE.md 가 "각주에만 나오는 와일드카드 코드는 제품이 아니다"라고 못 박아 뒀다.
 * 카탈로그에 실모델이 실리면 그때 채운다.
 */
{
  const w = 795, h = 1853, d = 700;
  merged.push({
    cat: '김치냉장고', home: true, line: '키친핏', guideOnly: true,
    size: '4도어 키친핏 (폭 795mm)',
    sizeLabel: '설치 형태', named: true,
    specs: [],
    model: '',
    parts: [{
      part: '본체', w, h, d,
      label: '설치가이드 규격도',
      raw: `폭 ${w}㎜ · 제품 높이 ${h}㎜ · 냉장고장 깊이 ${d}㎜ 이상`,
    }],
    group: '4도어 키친핏 Max (설치가이드 규격도)',
    note: `카탈로그에 없는 제품이라 치수 출처가 설치환경 가이드 규격도다`
      + ` — 폭 ${w}㎜ · 제품 높이 ${h}㎜(냉장고+김치냉장고 키친핏 Max 조합 규격도, 냉장고 908㎜ 옆)`
      + ` · 냉장고장 가로 ${w + CABINET_SIDE * 2}㎜ 이상(좌우 각 ${CABINET_SIDE}㎜) · 높이 1,873㎜ 이상`
      + ` · 깊이 ${d}㎜는 제품 깊이가 아니라 냉장고장 요건이다(가이드에 제품 깊이 없음) — 실측 확인`
      + ` · 가이드 표기 모델은 와일드카드 RK**F42* 이며 실모델코드는 카탈로그 미수록`,
    options: [], spreadW: 0, spreadD: 0, count: 1,
  });
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
/*
 * 이름으로 부르는 사이즈는 숫자 정렬이 통하지 않는다 — 전부 0 이거나(슬림형·벽걸이)
 * 엉뚱한 값이 잡힌다('Q9000 스탠드' → 9000 이라 맨 뒤로 간다).
 * 상담에서 부르는 순서를 그대로 적어 둔다: 스탠드 넷 → 벽걸이 → 창문형.
 */
const NAME_ORDER = ['슬림형 스탠드', '와이드형 스탠드', '클래식 스탠드', 'Q9000 스탠드', '벽걸이', '창문형',
  '4도어 프리스탠딩', '4도어 키친핏', '양문형', '일반형', '1도어 키친핏'];
const nameRank = (s) => (NAME_ORDER.indexOf(s) + 1) || 999;
const out = merged
  .sort((a, b) =>
    a.cat.localeCompare(b.cat, 'ko')
    // 세트 구성은 카테고리 **맨 뒤**로. 이름의 첫 숫자가 '1도어'의 1 이라 그냥 두면
    // 333L 보다 앞에 서서, 인덱스로 고르는 쪽(테스트·외부 사용)이 조용히 어긋난다.
    || (a.set ? 1 : 0) - (b.set ? 1 : 0)
    || nameRank(a.size) - nameRank(b.size)
    || unitRank(a.size) - unitRank(b.size)
    || lead(a.size) - lead(b.size));

/*
 * ── 같은 이름이 둘 이상이면 용량을 붙여 가른다 ──
 * 도어 구성으로 이름을 붙이면 4도어 프리스탠딩이 **깊이 683 과 930 두 줄**로 남는다
 * (247㎜ 차이라 합칠 수 없다). 그대로 두면 드롭다운에 같은 이름이 두 번 나온다.
 * 이름이 하나뿐인 형태에는 붙이지 않는다 — 사용자가 원한 것은 짧은 이름이다.
 * **정렬이 끝난 뒤에** 한다. 이름이 바뀌면 `NAME_ORDER` 가 못 찾는다.
 */
/*
 * ── 배치 목록에서 숨기는 줄 ──
 * **공기청정기는 스탠드형만 쓴다**(2026-08-09 사용자 결정: *"공기청정기는 벽걸이형을
 * 제외하고 스탠드형으로만 업데이트해주세요"*).
 * `AX99N4020WWD`(블루스카이 4000 벽걸이형)는 1050×600×130 이라 위에서 내려다보면
 * 사운드바 같은 긴 막대가 된다 — 치수가 틀린 것이 아니라 벽에 거는 물건이라서 그렇다.
 * 청정면적이 85㎡ 로 가장 커서 대표로 뽑히는 바람에 그것이 도면에 올라갔다.
 * 시스템에어컨(천장 매립)을 `HOME_OFF` 로 뺀 것과 같은 논리다.
 *
 * **데이터에서 지우지는 않는다** — 치수와 출처는 그대로 두고 배치 목록에서만 뺀다.
 * (에어컨 벽걸이는 사용자가 "한 줄로 합쳐 남긴다"고 따로 정했으므로 숨기지 않는다.)
 */
for (const r of out) {
  if (r.cat === '공기청정기' && /벽걸이/.test(r.size)) {
    r.hidden = true;
    /* 이유를 데이터에 함께 남긴다 — 왜 숨겼는지가 CLAUDE.md 에만 있으면 데이터만 보는
       사람(또는 다음 세션)이 "치수가 있는데 왜 안 보이지"에서 막힌다. */
    r.note = (r.note ? r.note + ' ' : '')
      + '벽에 거는 제품이라 위에서 보면 긴 막대로 잡힌다(1,050×600×130). 치수가 틀린 것이 아니라 '
      + '바닥에 놓는 물건이 아니어서 배치 목록·추천·대안에서 모두 뺐다(2026-08-09 사용자 결정). '
      + '치수와 출처는 그대로 둔다.';
  }
}

{
  const seen = new Map();
  for (const r of out) seen.set(`${r.cat}|${r.size}`, (seen.get(`${r.cat}|${r.size}`) || 0) + 1);
  for (const r of out) {
    if (!r.named || seen.get(`${r.cat}|${r.size}`) < 2) continue;
    const caps = (r.specs || []).filter((v) => /L$/.test(v)).map(numOf).filter(Boolean);
    if (!caps.length) continue;
    const lo = Math.min(...caps), hi = Math.max(...caps);
    r.size += ` ${lo === hi ? `${hi}L` : `${lo}~${hi}L`}`;
  }
}

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
