/*
 * 사이즈별 대표모델 데이터 회귀 테스트
 * 실행: node scripts/test-sizereps.mjs   (npm run test:sizereps)
 *
 * public/size-reps.json은 배치 시뮬레이터가 "이 자리에 들어가는가"를 판정하는 근거다.
 * 치수 한 자리가 틀리면 그대로 잘못된 설치 안내가 되므로, 다음을 검사한다:
 *   [1] 커밋된 파일 == 지금 재생성한 결과 (모델파인더 DB를 고치고 재생성을 빠뜨리는 사고 방지)
 *   [2] 모든 치수가 양수이고 사람이 만들 수 있는 범위 안인지
 *   [3] 폭/높이 축이 뒤바뀌지 않았는지 — 바닥에 세우는 가전은 높이 > 폭 인 것이 정상
 *   [4] 대표 모델코드가 모델파인더 DB에 실제로 존재하는지
 *   [5] 골든값 — 원문에서 눈으로 확인한 치수 몇 개가 그대로인지
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const REPS = path.join(root, 'public', 'size-reps.json');

let ok = true;
const fail = (m) => { console.log('ERROR:', m); ok = false; };
const pass = (m) => console.log('OK:', m);

// ── [1] 최신성 ──
const committed = fs.readFileSync(REPS, 'utf8');
execFileSync('node', [path.join(__dirname, 'build-size-reps.mjs')], { cwd: root, stdio: 'pipe' });
const rebuilt = fs.readFileSync(REPS, 'utf8');
if (committed !== rebuilt) {
  fs.writeFileSync(REPS, committed);   // 테스트가 파일을 바꿔놓지 않도록 되돌린다
  fail('size-reps.json이 최신이 아님 — `node scripts/build-size-reps.mjs` 후 커밋할 것');
} else {
  pass('size-reps.json 최신 (재생성 결과와 일치)');
}

const reps = JSON.parse(committed);
// 발자국이 비슷한 사이즈를 통합하면서 103 → 63개가 됐다(에어컨 18 → 6, TV 15 → 10).
// 하한은 "통합이 폭주해 카테고리가 뭉개지는 것"을 잡는 값으로 둔다 — 카테고리가 24개이므로
// 그보다 한참 적어지면 통합 기준이 잘못된 것이다.
if (!Array.isArray(reps) || reps.length < 45) fail(`대표 사이즈가 ${reps.length}개 — 너무 적다 (통합이 과했는지 확인)`);
else pass(`사이즈 대표 ${reps.length}개 (통합으로 묶인 것 ${reps.filter((r) => r.mergedFrom).length}개)`);

// ── [2] 치수 범위 ──
// 상한은 가장 큰 항목(115형 TV 2,570mm)을 담을 수 있게 잡되, 자릿수 실수(㎝→㎜ 등)는 걸리게.
let dimBad = 0;
for (const r of reps) {
  for (const p of r.parts) {
    for (const [ax, v] of [['w', p.w], ['h', p.h], ['d', p.d]]) {
      if (!Number.isFinite(v) || v <= 0 || v > 3000) {
        fail(`${r.cat} ${r.size} ${r.model} ${p.part}: ${ax}=${v} 범위 밖`);
        dimBad++;
      }
    }
  }
}
if (!dimBad) pass('모든 치수가 0 초과 3,000mm 이하');

// ── [3] 축 뒤바뀜 ──
// 'W×H×D'와 'H×W×D' 두 표기가 섞여 있어 파서가 축을 잘못 잡으면 폭과 높이가 바뀐다.
// 바닥에 세워 쓰는 카테고리는 높이가 폭보다 큰 것이 정상이므로 그것으로 잡아낸다.
// 업소용 냉장고는 제외한다 — 가정용과 달리 옆으로 넓은 형태가 정상이다.
// (CRFF-1762 = 폭 1,900 × 높이 1,830mm. CLAUDE.md에 적힌 "모델명 1762 → 1,900㎜" 규칙과 일치)
const TALL = ['냉장고', '김치냉장고', '냉동고', '세탁기·콤보', '건조기',
  '에어드레서', '슈드레서', '정수기'];
let axisBad = 0;
for (const r of reps) {
  if (!TALL.includes(r.cat)) continue;
  // 키친핏 1도어 **세트 구성**은 같은 캐비닛을 옆으로 이어 붙인 것이라 폭 > 높이가 정상이다
  // (4세트 = 2,495 × 1,855mm). 업소용 냉장고를 뺀 것과 같은 이유.
  if (r.set) continue;
  const b = r.parts.find((p) => p.part.startsWith('본체')) || r.parts[0];
  if (b.h <= b.w) {
    fail(`${r.cat} ${r.size} ${r.model}: 높이(${b.h}) <= 폭(${b.w}) — 축이 뒤바뀐 것으로 의심 (${b.label} = ${b.raw})`);
    axisBad++;
  }
}
if (!axisBad) pass('세워 쓰는 가전의 높이 > 폭 (축 뒤바뀜 없음)');

// ── [4] 모델코드 실존 ──
const finder = fs.readFileSync(path.join(root, 'public', 'finder-app.html'), 'utf8');
let missing = 0;
for (const r of reps) {
  /*
   * `guideOnly` = 카탈로그에 없고 **설치가이드 규격도에만** 있는 항목
   * (김치냉장고 4도어 키친핏). 가이드가 모델을 와일드카드 `RK**F42*` 로만 적어
   * 실모델코드를 댈 수 없으므로 빈칸이 정상이다 — 대신 근거를 note 에 남긴다.
   * 빈칸을 그냥 통과시키면 안 된다: `finder.includes('""')` 는 아무 파일에서나 참이라
   * 모델코드 검사가 통째로 무력해진다(실제로 그렇게 통과했다).
   */
  if (r.guideOnly) {
    if (r.model) fail(`${r.cat} ${r.size}: guideOnly 인데 모델코드(${r.model})가 있다 — 카탈로그에 실렸으면 guideOnly 를 떼야 한다`);
    else if (!/설치가이드|규격도/.test(r.note || '')) fail(`${r.cat} ${r.size}: 모델코드가 없는데 근거(note)에 출처가 없다`);
    continue;
  }
  if (!r.model) { fail(`${r.cat} ${r.size}: 모델코드가 비어 있음`); missing++; }
  else if (!finder.includes(`"${r.model}"`)) { fail(`${r.cat} ${r.size}: ${r.model}이 모델파인더 DB에 없음`); missing++; }
}
if (!missing) pass(`대표 모델코드 전부 모델파인더 DB에 존재 (설치가이드 전용 ${reps.filter((r) => r.guideOnly).length}건 제외)`);

// ── [5] 골든값 ──
// dp 카탈로그 원문에서 눈으로 확인한 값. 파서를 손볼 때 이 값이 흔들리면 회귀다.
// 사이즈 이름은 통합하며 범위로 바뀌었다(85형 → 83~85형, 폭 685mm → 폭 635~685mm).
// 냉장고는 1단 기준이 폭 → 용량 → **도어 구성**으로 두 번 바뀌었다('폭 910mm' → '602~640L'
// → '4도어 프리스탠딩'). 김치냉장고는 아직 용량이다.
// 검사하려는 것은 이름이 아니라 **치수**이므로, 통합 뒤 이름으로 맞춘다.
// 통합은 무리 중 발자국이 가장 큰 것을 대표로 쓰므로 골든 치수는 그대로여야 한다.
const GOLDEN = [
  ['TV', '83~85형', 'KMR85RH95AFXKR', '스탠드 설치', [1880.6, 1148.2, 393.5]],
  // 4도어가 한 줄로 합쳐지며 대표가 깊이 930 짜리로 바뀌었다. 얕은 683 은 그 줄의 옵션으로
  // 남아 "같은 4도어 중 이 규격이면 들어갑니다"의 근거가 되므로 둘 다 고정한다.
  ['냉장고', '4도어 프리스탠딩', 'RM70F90R2W', '본체', [912, 1853, 930]],
  ['냉장고', '4도어 프리스탠딩', 'RM80H64S2A', '본체', [912, 1853, 683]],
  // 세탁기와 콤보를 라인업으로 나누면서 콤보는 자기 줄로 떨어졌고,
  // 이후 콤보의 1단이 폭에서 **세탁/건조 용량**으로 바뀌었다(폭 685mm → 25/18~20kg).
  ['세탁기·콤보', '25/18~20kg', 'WD90H25AHS', '본체', [686, 1110, 875]],
  // 키친핏 1도어 세트는 **계산값**이라 산수가 틀어지면 아무도 모른다. 여기서 고정한다:
  // 1도어 키친핏 595 × 4대 + 제품 간 6㎜ × 3 = 2,398mm (냉장고장 내경은 +4×2 = 2,406)
  // 두 번 틀렸다: 김치를 695㎜로 잡아 2,495 → 사이를 구형 10㎜로 잡아 2,410 → 신형 6㎜로 2,398.
  ['냉장고', '1도어 키친핏 세트 (냉장+냉동+와인+김치)', 'RR40C8995APG', '본체(세트 전체)', [2398, 1855, 688]],
];
let goldBad = 0;
/*
 * 검사하려는 것은 **카탈로그 원문 치수가 그대로 실렸는가**이지 "그 모델이 대표 슬롯에
 * 있는가"가 아니다. 대표는 정렬 규칙(발자국이 큰 것 우선)에 따라 바뀔 수 있으므로
 * 모델을 옵션 안에서 찾는다 — 그렇게 해야 치수 파싱이 깨졌을 때만 실패한다.
 */
for (const [cat, size, model, part, [w, h, d]] of GOLDEN) {
  const r = reps.find((x) => x.cat === cat && x.size === size);
  if (!r) { fail(`골든: ${cat} ${size} 사이즈가 없음`); goldBad++; continue; }
  const o = [r, ...(r.options || [])].find((x) => x.model === model);
  if (!o) { fail(`골든: ${cat} ${size} 에 ${model} 이 없음`); goldBad++; continue; }
  const p = o.parts.find((x) => x.part === part);
  if (!p) { fail(`골든: ${cat} ${size} ${model}에 '${part}' 파트가 없음`); goldBad++; continue; }
  if (p.w !== w || p.h !== h || p.d !== d) {
    fail(`골든: ${model} ${part} = ${p.w}×${p.h}×${p.d} (기대 ${w}×${h}×${d})`);
    goldBad++;
  }
}
if (!goldBad) pass(`골든 치수 ${GOLDEN.length}건 일치`);

/*
 * ── 제품 컬러 (2026-08-14 신설) ────────────────────────────────────
 *
 * 도면 위 가전에 색을 입히는 근거는 **카탈로그에 적힌 컬러명**뿐이다. 지켜야 할 것 둘:
 *
 *  ① **원문을 그대로 보존한다.** 화면용 hex 만 남기고 원문을 버리면 나중에 "이 색이
 *     맞나"를 되짚을 수 없다(모델코드를 데이터에는 남기고 화면에만 안 적는 것과 같은 규칙).
 *  ② **색 단어가 없는 이름에는 hex 를 만들지 않는다.** `트러플 메탈` 처럼 이름만으로는
 *     색을 알 수 없는 것이 있는데, 비슷한 색을 임의로 넣으면 고객이 그 색으로 오해한다.
 *     그런 줄은 hex 가 비어 있어야 하고 화면이 "색 미상"이라고 적는다.
 */
{
  const withColor = [];
  for (const r of reps) for (const o of (r.options || [])) if (o.color) withColor.push({ r, o });
  const badHex = withColor.filter((x) => x.o.hex && !/^#[0-9A-Fa-f]{6}$/.test(x.o.hex));
  /* 이름에 색 단어가 없는데 hex 가 붙어 있으면 지어낸 것이다 */
  const WORDS = /(화이트|WHITE|블랙|BLACK|그레이|실버|SILVER|베이지|차콜|챠콜|브라운|골드|플럼|카퍼|미러|이녹스|INOX|스틸|메탈|그린|그리너리)/i;
  const invented = withColor.filter((x) => x.o.hex && !WORDS.test(x.o.color));
  const empty = withColor.filter((x) => !String(x.o.color).trim());
  if (!withColor.length) fail('컬러가 실린 옵션이 하나도 없다 — 카탈로그에서 끌어오지 못했다');
  else if (empty.length) fail(`컬러가 빈 문자열인 옵션 ${empty.length}건 — 원문을 그대로 보존해야 한다`);
  else if (badHex.length) fail(`hex 형식이 아닌 값 ${badHex.length}건: ${badHex.slice(0,3).map((x)=>x.o.hex).join(', ')}`);
  else if (invented.length) {
    fail(`이름에 색 단어가 없는데 hex 가 붙었다 ${invented.length}건 — 색을 지어내면 안 된다:`
      + ` ${invented.slice(0, 3).map((x) => `${x.o.color}→${x.o.hex}`).join(', ')}`);
  } else {
    const unknown = withColor.filter((x) => !x.o.hex);
    pass(`제품 컬러 ${withColor.length}건 — 원문 보존 · hex ${withColor.length - unknown.length}건`
      + (unknown.length ? ` · 색 미상 ${unknown.length}건(${unknown.map((x) => x.o.color).join(' · ')})` : ''));
  }
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
