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
import { execSync } from 'child_process';

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
// 2026-08-10 해소: 식기세척기 DW90F79P1U01S ↔ DW90F79P1USWS 는 **오류가 아니라 색상 변형**이었다.
// samsung.com/sec 에 두 제품페이지가 모두 살아 있고 접미가 색상을 가리킨다 — U01=코타 화이트,
// USW=새틴 화이트(같은 "Bespoke AI 식기세척기 빌트인 14인용(컵 맞춤 세척)"). 한쪽으로 통일하면
// 실존하는 제품을 지우게 되므로, 모델파인더 엔트리가 **두 코드를 함께** 싣도록 고쳤다
// (`fx` 의 모델번호 행 + 검색어). 상담사가 어느 색상 코드로 물어도 파인더에서 걸린다.
const UNRESOLVED = new Map([]);

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

/*
 * ── PART C: 최상위만이 아니라 **삼성 전 모델**의 코드가 실재하는가 ──
 *
 * 위 PART B 는 카테고리마다 **최상위(P) 한 종만** 본다. 그래서 식기세척기
 * `DW80F71Y1UEWS` 가 그대로 남아 있었다 — **samsung.com 현행 목록(11종)에도
 * dp 카탈로그에도 없는 코드**다. 상담사가 그 코드로 파인더를 찾으면 0건이고,
 * 고객에게 불러 주면 존재하지 않는 모델을 안내하는 셈이다(2026-08-15 발견).
 *
 * **하드 실패로 만들지 않는다.** 재 보니 59건 중 16건(27%)이 파인더에 없는데,
 * 대부분은 오류가 아니라 **카탈로그보다 새 제품**이다(2026 Neo QLED QNH80,
 * Infinite AI 공기청정기 등 — 모델파인더는 카탈로그가 기준이라 늦게 들어온다).
 * 전부 실패시키면 이 검사가 방해물이 되고 결국 아무도 안 본다.
 *
 * 그래서 **이유를 적어 등재하고, 새로 늘어난 것만 실패시킨다.** 목록은 줄어드는
 * 방향이 맞다 — 카탈로그가 갱신되면 여기서 빼면 된다.
 */
{
  const KNOWN = new Map([
    /* 카탈로그보다 새 제품 — 다음 카탈로그 반영 때 저절로 해소된다 */
    ['RF85DB90F1AP', '카탈로그 미수록 (BESPOKE 4도어 에센셜 874L)'],
    ['RS84DB5002CW', '카탈로그 미수록 (BESPOKE 양문형 852L)'],
    ['AR60F15D12WS', '카탈로그 미수록 (무풍 벽걸이 15평)'],
    ['AR60F11D11WT', '카탈로그 미수록 (무풍콤보 벽걸이 11평)'],
    ['AR60F09D11WT', '카탈로그 미수록 (무풍콤보 벽걸이 9평)'],
    ['AR60F07D12WT', '카탈로그 미수록 (무풍콤보 벽걸이 7평)'],
    ['KQ85QNH80', '카탈로그 미수록 (2026 Neo QLED QNH80 85")'],
    ['KQ75QNH80', '카탈로그 미수록 (2026 Neo QLED QNH80 75")'],
    ['VS28D950AIW', '카탈로그 미수록 (제트 Lite 280W)'],
    ['NP960XGK', '카탈로그 미수록 (Book5 Pro 360 16")'],
    ['NT760VJG', '카탈로그 미수록 (Book6 16")'],
    ['NP750XGK', '카탈로그 미수록 (Book5 15")'],
    ['AP90H10198UDD', '카탈로그 미수록 (Infinite AI 100㎡)'],
    ['AP90F08163UDD', '카탈로그 미수록 (Infinite AI 80㎡)'],
    /* 여기부터는 **코드 자체가 확정되지 않았다** — 위와 성격이 다르다 */
    ['DW80F71Y1UEWS', '⚠ 코드 미확정 — samsung.com 현행 11종·dp 카탈로그 어디에도 없다'],
    ['DW80F73Y1UEWS', '⚠ 코드 미확정 — 카탈로그는 DW80F73Y1UWW, 현행 목록은 DW80F73X1UEWS'],
  ]);
  /* 이름 끝뿐 아니라 이름 안쪽에 코드가 오는 항목도 있다(괄호 안 표기) */
  const codeOf = (name) => {
    const m = String(name).match(/\b[A-Z]{2}[A-Z0-9]{5,}(?:[-/][A-Z0-9]+)?\b/g);
    return m ? m[m.length - 1] : null;
  };
  const fresh = [];
  let seen = 0, known = 0;
  for (const [cat, d] of Object.entries(DB)) {
    for (const m of d.samsung || []) {
      const code = codeOf(m.name);
      if (!code) continue;
      seen++;
      if (finderHtml.includes(code)) continue;
      if (KNOWN.has(code)) { known++; continue; }
      fresh.push(`"${cat}" ${code} (${String(m.name).slice(0, 34)})`);
    }
  }
  if (fresh.length) {
    fail(`타사비교 삼성 모델 ${fresh.length}건이 모델파인더 DB에 없고 등재도 안 돼 있다 — `
      + `상담사가 그 코드로 찾으면 0건이다: ${fresh.join(' / ')}`);
  } else {
    console.log(`OK: 타사비교 삼성 모델코드 ${seen}건 — 파인더 미수록 ${known}건은 전부 이유와 함께 등재됨`);
    for (const [code, why] of KNOWN) if (why.startsWith('⚠')) console.log(`TODO: ${code} — ${why.slice(2)}`);
  }
}

/*
 * ── 서비스워커 캐시 버전 ──────────────────────────────────────
 *
 * **미니앱(public/*-app.html)을 고쳤으면 `sw.js` 의 CACHE_VERSION 도 올라가야 한다.**
 * 미니앱은 stale-while-revalidate 라, 안 올리면 **이미 쓰던 기기는 옛 파일을 계속 쓴다** —
 * 껍데기(Next 페이지)만 새것이 되어 "고쳤다는데 그대로다"가 된다.
 * 2026-08-12 실제로 그랬다: 공유 버튼 수정을 배포했는데 옛 finder-app.html 이 남아 있어
 * 화면에 없는 제품이 그대로 공유됐다(재현 확인).
 *
 * 마지막으로 CACHE_VERSION 이 바뀐 커밋 이후에 미니앱이 바뀌었으면 실패시킨다.
 */
{
  const ROOT = path.join(__dirname, '..');
  const ver = (read('sw.js').match(/CACHE_VERSION\s*=\s*'([^']+)'/) || [])[1];
  if (!ver) fail('sw.js 에서 CACHE_VERSION 을 찾지 못했다');
  else {
    const sh = (cmd) => { try { return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
                          catch (e) { return ''; } };
    /*
     * **`--diff-merges=first-parent` 와 `-s` 가 둘 다 있어야 한다.**
     *
     * ① `git log -G` 는 기본적으로 **병합 커밋을 건너뛴다**(diff 를 아예 만들지 않는다).
     *    그래서 갈래를 합치면서 버전을 올리면 이 검사에는 "안 올린 것"으로 보이고,
     *    방금 올린 그 버전을 두고 실패한다(2026-08-12 실제로 그랬다). 회피하려고 번호를
     *    한 칸 더 올리면 합칠 때마다 번호가 샌다. 첫 부모와 견주면 병합이 들여온 변경이
     *    보이므로 그때 올린 것도 잡힌다.
     * ② 그런데 `--diff-merges` 는 **diff 출력을 켠다.** `--format=%H` 만으로는 해시 뒤에
     *    diff 본문이 딸려 나오고, 그러면 아래 `git diff` 의 리비전 인자가 통째로 망가져
     *    엉뚱한 파일이 "바뀐 미니앱"으로 보고된다 — 실제로 `scripts/test-consistency.mjs`
     *    를 미니앱이라고 말했다. `-s`(--no-patch)로 눌러야 한다.
     */
    const verCommit = sh(`git log -1 --format=%H -s -G"CACHE_VERSION = '" --diff-merges=first-parent -- public/sw.js`);
    if (!verCommit) console.log(`SKIP: 캐시 버전 대조 — git 이력을 읽을 수 없다 (${ver})`);
    else {
      const changed = sh(`git diff --name-only ${verCommit}..HEAD -- public/*-app.html`).split('\n').filter(Boolean);
      if (changed.length) {
        fail(`미니앱 ${changed.length}개가 바뀌었는데 CACHE_VERSION(${ver})은 그대로다 — `
          + `이미 쓰던 기기가 옛 파일을 계속 쓴다: ${changed.map((f) => f.split('/').pop()).join(', ')}`);
      } else {
        console.log(`OK: 캐시 버전 ${ver} — 그 뒤로 바뀐 미니앱 없음`);
      }
    }
  }

  /*
   * **화면에 뜨는 버전(`lib/version.ts`)이 CACHE_VERSION 과 같아야 한다.**
   *
   * 그 숫자의 쓸모가 "내 폰이 최신인가"를 눈으로 확인하는 것인데(2026-08-15 사용자
   * 요청), 둘이 어긋나면 화면이 거짓말을 한다 — 옛 캐시를 쓰는 기기가 최신 번호를
   * 보여주거나 그 반대가 된다. `sw.js` 는 정적 파일로 그대로 서빙돼야 해서
   * `lib/version.ts` 를 import 할 수 없다. 그래서 한쪽에서 읽어 오는 대신 여기서 묶는다.
   */
  /* `read()` 는 public/ 기준이라 저장소 루트의 파일은 직접 읽는다 */
  const versionTs = fs.readFileSync(path.join(__dirname, '..', 'lib', 'version.ts'), 'utf8');
  const shown = (versionTs.match(/APP_VERSION\s*=\s*'([^']+)'/) || [])[1];
  if (!shown) fail('lib/version.ts 에서 APP_VERSION 을 찾지 못했다');
  /* 캐시 키는 `axhub-v59` 꼴이고 화면에는 `v59` 만 띄운다 — 접두를 뺀 뒤 견준다 */
  else if (shown !== ver.replace(/^axhub-/, '')) {
    fail(`화면 버전(${shown}) ≠ 캐시 버전(${ver}) — 버전을 올릴 때 두 곳을 함께 고칠 것. `
      + `어긋나면 "내 폰이 최신인가"를 이 숫자로 판단할 수 없다`);
  } else {
    console.log(`OK: 화면 버전 ${shown} = 캐시 버전 ${ver}`);
  }
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
