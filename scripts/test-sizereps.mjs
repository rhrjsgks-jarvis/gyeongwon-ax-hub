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
if (!Array.isArray(reps) || reps.length < 80) fail(`대표 사이즈가 ${reps.length}개 — 너무 적다`);
else pass(`사이즈 대표 ${reps.length}개`);

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
const GOLDEN = [
  ['TV', '85형', 'KMR85RH95AFXKR', '스탠드 설치', [1880.6, 1148.2, 393.5]],
  ['냉장고', '폭 910mm', 'RM80H64S2A', '본체', [912, 1853, 683]],
  ['세탁기·콤보', '폭 685mm', 'WD90H25AHS', '본체', [686, 1110, 875]],
];
let goldBad = 0;
for (const [cat, size, model, part, [w, h, d]] of GOLDEN) {
  const r = reps.find((x) => x.cat === cat && x.size === size);
  if (!r) { fail(`골든: ${cat} ${size} 사이즈가 없음`); goldBad++; continue; }
  if (r.model !== model) { fail(`골든: ${cat} ${size} 대표가 ${r.model} (기대 ${model})`); goldBad++; continue; }
  const p = r.parts.find((x) => x.part === part);
  if (!p) { fail(`골든: ${cat} ${size} ${model}에 '${part}' 파트가 없음`); goldBad++; continue; }
  if (p.w !== w || p.h !== h || p.d !== d) {
    fail(`골든: ${model} ${part} = ${p.w}×${p.h}×${p.d} (기대 ${w}×${h}×${d})`);
    goldBad++;
  }
}
if (!goldBad) pass(`골든 치수 ${GOLDEN.length}건 일치`);

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
