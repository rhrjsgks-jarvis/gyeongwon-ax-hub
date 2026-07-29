// 크로스파일 모델코드 일관성 회귀 테스트
// 실행: node scripts/test-consistency.mjs
//
// 배경: 2026-07-29 세션에서 같은 제품(예: 김치냉장고 최상위 라인)의 모델코드가
// test-app.html/finder-app.html/package-planner.html/compare-app.html 4개 파일에
// 각각 독립적으로 박혀 있어, 한 파일만 고치고 나머지를 놓치는 사고가 실제로 여러 번
// 발생했다(냉장고 RF→RM, 세탁기 WD25→WD90, 김치냉장고 RQ→RK 등). 이 스크립트는 그
// 재발을 막기 위한 안전망이다.
//
// 주의(중요): compare-app.html의 "P등급(최상위)"과 package-planner.html의
// FLAGSHIP은 목적이 달라 항상 동일 SKU를 가리키지 않는다 — 예를 들어 세탁기/건조기는
// planner가 "패키지 구성"을 위해 일부러 별도 세탁기+건조기(Top-Fit/히트펌프 건조기)를
// 쓰고, TV는 compare가 비교표용 Micro RGB를, planner가 OLED SH95를 쓰며, 식기세척기도
// 서로 다른 F세대 티어를 쓴다 — 모두 실제 조사로 확인된 "의도된 다른 선택"이지 버그가
// 아니다. 따라서 정확히 동일해야 하는 카테고리(EXACT_MATCH)와, 세대/제품군 접두사만
// 같으면 되는 카테고리(FAMILY_MATCH)를 구분해서 검사하고, 나머지는 검사 대상에서
// 명시적으로 제외한다(제외 이유를 주석에 남겨 향후 세션이 "테스트가 허술하다"고
// 오해하지 않도록 함).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pub = (f) => path.join(__dirname, '..', 'public', f);
const read = (f) => fs.readFileSync(pub(f), 'utf8');

let ok = true;
const fail = (msg) => { console.log('ERROR:', msg); ok = false; };

// ── PART A. 골든 모델코드: 이번 세션에 실제로 최신화한 핵심 모델코드는
// 4개 파일 모두에 반드시 등장해야 한다(문자열 존재 여부만 확인하는 가벼운 가드) ──
const FILES = ['test-app.html', 'finder-app.html', 'package-planner.html', 'compare-app.html'];
const fileContents = Object.fromEntries(FILES.map((f) => [f, read(f)]));

const GOLDEN = [
  { label: '냉장고 패밀리허브 최상위(2026)', code: 'RM90H91B1W', files: FILES },
  { label: '세탁기 AI콤보 최상위(2026)', code: 'WD90H25AHS', files: FILES },
  { label: '김치냉장고 최상위 프리미엄 라인(2026)', code: 'RK70F49F1DD', files: FILES },
];
for (const g of GOLDEN) {
  const missing = g.files.filter((f) => !fileContents[f].includes(g.code));
  if (missing.length > 0) fail(`골든 모델코드 누락: "${g.code}"(${g.label})가 ${missing.join(', ')}에 없음`);
  else console.log(`OK: 골든 모델코드 "${g.code}"(${g.label}) — ${g.files.length}개 대상 파일 전체에 존재 확인`);
}
// TV 플래그십(Micro RGB)은 국내 채번(R95H)이 test-app.html·compare-app.html에는 그대로,
// finder-app.html·package-planner.html에는 풀 코드(KMR85RH95AFXKR)로만 등장하므로 별도 처리.
{
  const variants = ['R95H', 'KMR85RH95AFXKR'];
  const missing = FILES.filter((f) => !variants.some((v) => fileContents[f].includes(v)));
  if (missing.length > 0) fail(`골든 모델코드 누락: TV Micro RGB 플래그십(R95H/KMR85RH95AFXKR)이 ${missing.join(', ')}에 없음`);
  else console.log('OK: 골든 모델코드 "R95H/KMR85RH95AFXKR"(TV Micro RGB 플래그십) — 4개 파일 전체에 존재 확인');
}

// ── PART B/C. compare-app.html(P등급) ↔ package-planner.html(FLAGSHIP) 구조적 대조 ──
const compareDom = new JSDOM(fileContents['compare-app.html'], { runScripts: 'dangerously', url: 'https://example.com/' });
const DB = compareDom.window.eval('DB');
const plannerDom = new JSDOM(fileContents['package-planner.html'], { runScripts: 'dangerously', url: 'https://example.com/' });
const FLAGSHIP = plannerDom.window.eval('FLAGSHIP');

function extractCode(name) {
  // "... (864L) RM90H91B1W" / "... (KMR85RH95AFXKR)" 같은 이름 끝의 모델코드 토큰 추출
  const m = name.match(/([A-Z]{1,4}-?[0-9]{2,4}[A-Z0-9]{2,10})\s*\)?\s*$/);
  return m ? m[1] : null;
}

// 정확히 같은 SKU를 가리켜야 하는 카테고리(비교표 최상위 = 패키지 플래너 최고급)
const EXACT_MATCH = [
  ['냉장고', 'fridge'],
  ['청소기', 'vacuum'],
  ['노트북', 'laptop'],
  ['김치냉장고', 'kimchi'],
];
for (const [krCat, enCat] of EXACT_MATCH) {
  const cName = (DB[krCat].samsung.find((s) => s.grade === 'P') || DB[krCat].samsung[0]).name;
  const cCode = extractCode(cName);
  const pCode = FLAGSHIP[enCat].model;
  if (!cCode) fail(`compare-app.html "${krCat}" 최상위 항목명에서 모델코드 추출 실패: "${cName}"`);
  else if (cCode !== pCode) {
    fail(`불일치: "${krCat}"(compare-app: ${cCode}) vs "${enCat}"(planner: ${pCode}) — 같은 SKU를 가리켜야 하는 카테고리인데 다름`);
  } else {
    console.log(`OK: "${krCat}"/"${enCat}" 최상위 모델코드 일치 (${cCode})`);
  }
}

// 세대/제품군 접두사만 같으면 되는 카테고리(용량·색상 등 하위 변형은 서로 달라도 무방)
const FAMILY_MATCH = [
  ['에어컨', 'aircon', /^AF90H/],
  ['로봇청소기', 'robot', /^VR90F/],
];
for (const [krCat, enCat, prefixRe] of FAMILY_MATCH) {
  const cName = (DB[krCat].samsung.find((s) => s.grade === 'P') || DB[krCat].samsung[0]).name;
  const cCode = extractCode(cName);
  const pCode = FLAGSHIP[enCat].model;
  if (!cCode) fail(`compare-app.html "${krCat}" 최상위 항목명에서 모델코드 추출 실패: "${cName}"`);
  else if (!prefixRe.test(cCode) || !prefixRe.test(pCode)) {
    fail(`세대 불일치: "${krCat}"(compare-app: ${cCode}) vs "${enCat}"(planner: ${pCode}) — 둘 다 ${prefixRe} 접두사를 가져야 함`);
  } else {
    console.log(`OK: "${krCat}"/"${enCat}" 동일 세대 확인 (compare-app: ${cCode}, planner: ${pCode})`);
  }
}

// 의도적으로 제외한 카테고리(다른 SKU를 쓰는 것이 정상): 세탁기·콤보/건조기(콤보 vs 별도
// 세탁기+건조기), TV(Micro RGB vs OLED SH95), 식기세척기(서로 다른 F세대 티어),
// 스마트폰(비교표는 바 형태폰만 다룸 vs 플래너는 Z트리폴드) — 위 README 주석 참고.

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
