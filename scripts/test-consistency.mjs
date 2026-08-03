// 크로스파일 모델코드 일관성 회귀 테스트
// 실행: node scripts/test-consistency.mjs
//
// 배경: 2026-07-29 세션에서 같은 제품(예: 김치냉장고 최상위 라인)의 모델코드가
// test-app.html/finder-app.html/compare-app.html에 각각 독립적으로 박혀 있어, 한 파일만
// 고치고 나머지를 놓치는 사고가 실제로 여러 번 발생했다(냉장고 RF→RM, 세탁기 WD25→WD90,
// 김치냉장고 RQ→RK 등). 이 스크립트는 그 재발을 막기 위한 안전망이다.
//
// 2026-08-03: 패키지 플래너(package-planner.html) 운영 종료로 대상 파일이 4개 → 3개가 됐다.
// 이전에 있던 "compare P등급 ↔ planner FLAGSHIP" 구조적 대조는 planner가 사라져 제거하고,
// 대신 "compare-app.html의 P등급 모델코드가 finder-app.html에도 존재하는가"를 검사한다.
// 타사비교에서 최상위로 내세우는 모델이 모델파인더 DB에 없으면, 상담 중에 고객이 물어봤을 때
// 파인더에서 찾을 수 없는 상태가 되므로 실제로 위험하다.

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
const FILES = ['test-app.html', 'finder-app.html', 'compare-app.html'];
const fileContents = Object.fromEntries(FILES.map((f) => [f, read(f)]));

const GOLDEN = [
  { label: '냉장고 패밀리허브 최상위(2026)', code: 'RM90H91B1W', files: FILES },
  { label: '세탁기 AI콤보 최상위(2026)', code: 'WD90H25AHS', files: FILES },
  { label: '김치냉장고 최상위 프리미엄 라인(2026)', code: 'RK70F49F1DD', files: FILES },
  // 노트북: finder만 구형 NP 접두 코드로 남아 Book6 Ultra/Pro16이 같은 "NP960X"로 중복돼 있었다
  // (2026-08-02 IT 카탈로그 대조로 발견). compare/planner/finder 3파일에 NT 코드 존재를 강제한다.
  { label: '노트북 북6 울트라', code: 'NT960UJH',
    files: ['finder-app.html', 'compare-app.html'] },
  { label: '노트북 북6 프로 16', code: 'NT960XJG',
    files: ['finder-app.html', 'compare-app.html'] },
];
for (const g of GOLDEN) {
  const missing = g.files.filter((f) => !fileContents[f].includes(g.code));
  if (missing.length > 0) fail(`골든 모델코드 누락: "${g.code}"(${g.label})가 ${missing.join(', ')}에 없음`);
  else console.log(`OK: 골든 모델코드 "${g.code}"(${g.label}) — ${g.files.length}개 대상 파일 전체에 존재 확인`);
}
// TV 플래그십(Micro RGB)은 국내 채번(R95H)이 test-app.html·compare-app.html에는 그대로,
// finder-app.html에는 풀 코드(KMR85RH95AFXKR)로만 등장하므로 별도 처리.
{
  const variants = ['R95H', 'KMR85RH95AFXKR'];
  const missing = FILES.filter((f) => !variants.some((v) => fileContents[f].includes(v)));
  if (missing.length > 0) fail(`골든 모델코드 누락: TV Micro RGB 플래그십(R95H/KMR85RH95AFXKR)이 ${missing.join(', ')}에 없음`);
  else console.log('OK: 골든 모델코드 "R95H/KMR85RH95AFXKR"(TV Micro RGB 플래그십) — 3개 파일 전체에 존재 확인');
}

// ── PART B. compare-app.html의 P등급 모델이 모델파인더 DB에도 있는가 ──
// 타사비교에서 "우리 최상위"로 내세우는 모델을 파인더에서 찾을 수 없으면, 상담 중 고객이
// 되물었을 때 스펙·가격을 확인할 방법이 없어진다. 이름 끝의 모델코드를 뽑아 대조한다.
const compareDom = new JSDOM(fileContents['compare-app.html'], { runScripts: 'dangerously', url: 'https://example.com/' });
const DB = compareDom.window.eval('DB');
const finderHtml = fileContents['finder-app.html'];

function extractCode(name) {
  // "... (864L) RM90H91B1W" / "... (KMR85RH95AFXKR)" 같은 이름 끝의 모델코드 토큰 추출
  const m = name.match(/([A-Z]{1,4}-?[0-9]{2,4}[A-Z0-9]{2,10})\s*\)?\s*$/);
  return m ? m[1] : null;
}

// 파인더가 다루지 않는 카테고리(경쟁사 전용 비교 축)나 국내 채번이 달라 별도 처리가 필요한 것은 제외.
// TV는 compare가 국내 채번(R95H), finder가 풀 코드(KMR85RH95AFXKR)라 PART A에서 이미 검사했다.
const SKIP_CATS = new Set(['TV']);

// 아직 어느 쪽이 맞는지 확정하지 못한 코드는 이유를 적어 여기 둔다. 추정으로 한쪽에 맞추면
// 틀린 모델코드를 고객에게 안내하게 되므로, 실물 확인 전까지는 불일치 상태를 드러내 둔다.
const UNRESOLVED = new Map([
  ['DW90F79P1U01S',
   '타사비교는 DW90F79P1U01S, 모델파인더는 DW90F79P1USWS로 뒷자리가 다르다. 둘 다 dp 카탈로그 ' +
   '스펙표에 없는 코드(카탈로그 확인분은 DW90F79F1UAP·F1U01)라 어느 쪽이 실제 채번인지 확정하지 ' +
   '못했다. samsung.com 제품페이지로 실물 확인 후 한쪽으로 통일할 것.'],
]);

let checked = 0;
let unresolved = 0;
for (const [cat, d] of Object.entries(DB)) {
  if (SKIP_CATS.has(cat)) continue;
  const top = d.samsung.find((m) => m.grade === 'P') || d.samsung[0];
  if (!top) continue;
  const code = extractCode(top.name);
  if (!code) continue;              // 모델코드가 이름에 없는 항목은 대조 대상이 아니다
  checked++;
  if (!finderHtml.includes(code)) {
    if (UNRESOLVED.has(code)) {
      unresolved++;
      console.log(`TODO: "${cat}" ${code} — ${UNRESOLVED.get(code)}`);
    } else {
      fail(`"${cat}" 타사비교 최상위 모델 ${code}가 모델파인더 DB에 없음 — 상담 중 파인더에서 찾을 수 없다`);
    }
  }
}
if (ok) {
  console.log(`OK: 타사비교 최상위 모델 ${checked}건 중 ${checked - unresolved}건이 모델파인더 DB에 존재` +
    (unresolved ? ` (미확정 ${unresolved}건은 위 TODO 참고)` : ''));
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
