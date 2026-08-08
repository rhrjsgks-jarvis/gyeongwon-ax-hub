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
  if (!finder.includes(`"${r.model}"`)) { fail(`${r.cat} ${r.size}: ${r.model}이 모델파인더 DB에 없음`); missing++; }
}
if (!missing) pass('대표 모델코드 전부 모델파인더 DB에 존재');

// ── [5] 골든값 ──
// dp 카탈로그 원문에서 눈으로 확인한 값. 파서를 손볼 때 이 값이 흔들리면 회귀다.
// 사이즈 이름은 통합하며 범위로 바뀌었다(85형 → 83~85형, 폭 685mm → 폭 635~685mm).
// 냉장고·김치냉장고는 1단 기준이 폭에서 **용량**으로 바뀌어 '폭 910mm' → '602~640L' 이 됐다.
// 검사하려는 것은 이름이 아니라 **치수**이므로, 통합 뒤 이름으로 맞춘다.
// 통합은 무리 중 발자국이 가장 큰 것을 대표로 쓰므로 골든 치수는 그대로여야 한다.
const GOLDEN = [
  ['TV', '83~85형', 'KMR85RH95AFXKR', '스탠드 설치', [1880.6, 1148.2, 393.5]],
  ['냉장고', '602~640L', 'RM80H64S2A', '본체', [912, 1853, 683]],
  ['세탁기·콤보', '폭 635~685mm', 'WD90H25AHS', '본체', [686, 1110, 875]],
  // 키친핏 1도어 세트는 **계산값**이라 산수가 틀어지면 아무도 모른다. 여기서 고정한다:
  // 1도어 키친핏 595 × 4대 + 제품 간 10㎜ × 3 = 2,410mm
  // (첫 판은 김치를 695㎜로 잡고 사이를 5㎜로 둬서 2,495㎜였다 — 둘 다 틀렸다.)
  ['냉장고', '1도어 4세트 (냉장+냉동+와인+김치)', 'RR40C8995APG', '본체(세트 전체)', [2410, 1855, 688]],
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

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
