// 제품 상세검색(public/finder-app.html) 회귀 테스트
// 실행: node scripts/test-finder.mjs
// 패턴: jsdom으로 정적 HTML을 runScripts:'dangerously'로 로드하고, 인라인 스크립트가
// window에 노출하는 전역 함수(parseQuery/search/runSearch/setMode/toggleCat 등)를
// 직접 호출해 결과를 검증한다. (참고: scripts/test-install.mjs)
//
// 주의: PRODUCTS/lastResults 등은 최상위 `let`/`const`로 선언되어 있어 브라우저 전역
// 스코프 규칙상 window의 프로퍼티가 되지 않는다(함수 선언만 window에 노출됨).
// 따라서 DB 원본은 이 파일 자체에서 정규식/JSON.parse로 직접 추출하고, 검색 로직 검증은
// window.parseQuery()/window.search() 같은 노출된 함수 호출로 수행한다.
//
// DB(CE+MX+리빙+Harman)가 바뀌면 아래 CAT_QUERIES /
// expectedCatCounts 등을 함께 갱신할 것 — 안 하면 테스트가 실패한다.

import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readApp } from './lib/read-app.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '..', 'public', 'finder-app.html');
const html = readApp('finder-app.html');

const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'https://example.com/' });
const { window } = dom;
window.alert = () => {};
window.navigator.clipboard = { writeText: async () => {} };
window.Element.prototype.scrollIntoView = () => {};
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

/*
 * 인라인 스크립트가 다 돌 때까지 **조건으로** 기다린다.
 *
 * 예전에는 `wait(200)` 이라는 고정 시간이었는데, `npm test` 로 스위트를 연달아 돌리면
 * 그 200ms 안에 못 끝나 `window.parseQuery is not a function` 으로 죽었다(2026-08-11 두 번).
 * 단독 실행에서는 늘 통과해 원인을 찾기 어려운 종류다 — finder-app.html 은 제품 수백 종이
 * 든 큰 파일이라 부하가 걸리면 파싱·실행이 200ms 를 넘긴다.
 * 시간이 아니라 "준비됐는가"를 기다리면 느린 기계에서도, 빠른 기계에서도 맞는다.
 */
async function ready(check, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (check()) return true; } catch { /* 아직 없다 */ }
    await wait(25);
  }
  return false;
}

// ── DB 원본 직접 추출 (window.PRODUCTS는 top-level let이라 접근 불가) ──
function extractArray(varDeclPrefix) {
  const line = html.split('\n').find((l) => l.trim().startsWith(varDeclPrefix));
  if (!line) throw new Error(`소스에서 "${varDeclPrefix}" 선언을 찾지 못함`);
  const jsonStr = line.slice(line.indexOf('['), line.lastIndexOf(']') + 1);
  return JSON.parse(jsonStr);
}
const CE_MX = extractArray('let PRODUCTS');
const HARMAN = extractArray('const HARMAN_PRODUCTS');
const TOTAL_PRODUCTS = CE_MX.length + HARMAN.length;   // 삼성·리빙 + Harman (수치를 적어 두지 않는다 — 늘 때마다 낡는다)

// 카테고리별 매칭 대표 검색어. CE/MX는 CATSYN 단일 매핑 토큰을 사용해 정확히 그 카테고리만
// 걸리도록 했고, Harman 14종은 CATSYN과 충돌하지 않는(예: "사운드바"/"홈시어터"/"돌비애트모스"
// 등은 CE 카테고리로 강제 필터링되므로 회피) 브랜드+모델/스펙 단서로 구성했다.
const CAT_QUERIES = {
  // 리빙·제휴(삼성스토어 함께 판매 상품) — MD 카탈로그 기준 추가분
  '리빙 안마의자': '안마의자',
  '리빙 안마기': '안마기',
  '리빙 비데': '비데',
  '리빙 욕실케어': '욕실케어',
  '리빙 도어락': '도어락',
  '리빙 도어벨': '도어벨',
  '리빙 전동커튼': '전동커튼',
  '리빙 선풍기': '선풍기',
  '리빙 밥솥': '밥솥',
  '데이코 빌트인': '데이코',
  // 2026 dp 카탈로그 반영으로 추가된 카테고리
  '업소용 냉장고': '업소용',
  '냉동고': '냉동고',
  '정수기': '정수기',
  '슈드레서': '슈드레서',
  '시스템에어컨': '시스템에어컨',
  '제습기': '제습기',
  '냉장고': '냉장고',
  '세탁기·콤보': '세탁기',
  '건조기': '건조기',
  'TV': 'tv',
  '에어컨': '에어컨',
  '식기세척기': '식기세척기',
  '에어드레서': '에어드레서',
  '청소기': '청소기',
  '공기청정기': '공기청정기',
  '김치냉장고': '김치냉장고',
  '인덕션/전기레인지': '인덕션',
  '전자레인지/오븐': '전자레인지',
  '사운드바': '사운드바',
  '스마트폰': '갤럭시S',
  '스마트폰(폴더블)': '폴더블',
  '스마트폰(A시리즈)': 'A시리즈',
  '태블릿': '태블릿',
  'XR': 'xr',
  '워치': '워치',
  '버즈': '버즈',
  '링': '갤럭시링',
  '핏': '갤럭시핏',
  '노트북': '노트북',
  '모니터': '모니터',
  '데스크탑': '데스크탑',
  'SSD·메모리': 'ssd',
  '프린터': '프린터',
  'JBL 블루투스 스피커 (포터블)': '포터블 스피커',
  'JBL 파티스피커': '파티스피커',
  'JBL 사운드바': 'JBL Bar 1000',
  'JBL 무선 이어폰 (TWS)': 'JBL TWS',
  'JBL 헤드폰': 'JBL 헤드폰',
  'Harman Kardon 스피커': 'Harman Kardon 스피커',
  'Harman Kardon 사운드바 / 홈시어터': 'Citation MultiBeam',
  'AKG 헤드폰': 'AKG 헤드폰',
  'AKG 마이크': 'AKG 마이크',
  'JBL Hi-Fi 북쉘프 스피커': 'JBL 북쉘프',
  'JBL Hi-Fi 스튜디오 모니터': 'JBL 스튜디오',
  'JBL Hi-Fi 플로어스탠딩 스피커': 'JBL 플로어스탠딩',
  'JBL Synthesis 홈시어터 시스템': 'JBL Synthesis',
  'Harman Kardon 하이엔드 스피커': 'Harman Kardon 하이엔드',
};

(async () => {
  const loaded = await ready(() =>
    typeof window.parseQuery === 'function' && (window.document.getElementById('exRow').textContent || '').trim().length > 0);
  const doc = window.document;
  let ok = true;
  const fail = (msg) => { console.log('ERROR:', msg); ok = false; };
  if (!loaded) fail('인라인 스크립트가 15초 안에 준비되지 않음 (parseQuery / #exRow)');

  // ═══ 1. 초기 렌더 ═══
  console.log('── 1. 초기 렌더 ──');
  /*
   * **검색창 아래는 예시 키워드가 아니라 '검색 방법 안내'다**(2026-08-17 사용자 요청).
   * 예전에는 `무풍 에어컨 300만 이하` 같은 칩 20개를 깔았는데 라인업이 바뀌면 낡는다
   * (실제로 `2026 신형 TV`·`신혼가전 패키지` 가 남아 있었다). **낡은 예시는 없느니만
   * 못하다** — 눌러 보고 결과가 신통찮으면 검색기 자체를 못 믿게 된다.
   * 그래서 여기서는 ①안내가 떠 있는가 ②키워드 칩이 되살아나지 않았는가 를 함께 본다.
   */
  const help = (doc.getElementById('exRow').textContent || '').trim();
  console.log('검색 안내:', help.slice(0, 40) + '…');
  if (!help) fail('검색 방법 안내가 렌더되지 않음');
  if (doc.querySelectorAll('#exRow .ex').length) fail('예시 키워드 칩이 되살아났다 — 낡으면 상담에서 해가 된다');
  if (!/조건/.test(help)) fail('안내에 조건(AND) 설명이 없다 — 겹칠수록 좁혀진다는 것이 핵심이다');
  if (!doc.getElementById('mKw').classList.contains('on')) fail('초기 모드가 키워드 모드(mKw)가 아님');
  if (doc.getElementById('mAi').classList.contains('on')) fail('초기 상태에서 AI 모드가 켜져있음');
  /*
   * **AI 추천 버튼은 감춰 둔 상태다**(2026-08-14 사용자 결정, 사유는 finder-app.html 주석).
   * 완성 전에 실수로 열리는 것을 막는다 — 지금 열면 예산을 무시한 추천이 상담에 나간다.
   * 엔진 자체는 아래 8절에서 계속 검사한다(코드가 썩지 않게).
   * 열 때는 이 검사도 함께 뒤집을 것.
   */
  if (!doc.getElementById('mAi').hasAttribute('hidden')) {
    fail('AI 추천 버튼이 감춰져 있지 않다 — 완성 전에는 hidden 이어야 한다(예산 미적용 결함)');
  }
  if (doc.getElementById('kwBox').classList.contains('hidden')) fail('초기 상태에서 kwBox가 숨겨져 있음');
  if (!doc.getElementById('aiBox').classList.contains('hidden')) fail('초기 상태에서 aiBox가 보이고 있음');

  // ═══ 2. DB 총량 sanity check ═══
  console.log('── 2. DB 총량 ──');
  const emptyResults = window.search(window.parseQuery(''));
  console.log('전체 제품수(빈 쿼리):', emptyResults.length, '(기대값:', TOTAL_PRODUCTS + ')');
  if (emptyResults.length !== TOTAL_PRODUCTS) fail(`전체 제품수 불일치: got ${emptyResults.length}, expected ${TOTAL_PRODUCTS}`);

  // ═══ 3. 대표 키워드 검색 시나리오 (runSearch → DOM 렌더 검증) ═══
  console.log('── 3. 대표 키워드 검색 시나리오 ──');
  const scenarios = [
    { q: '냉장고', desc: '카테고리명', minResults: 1 },
    { q: '무풍 에어컨 300만 이하', desc: '스펙+예산', minResults: 1 },
    // 방수 사운드바는 DB 에 한 종도 없다(JBL 사운드바 5종 전부 방수 표기 없음).
    // 예전에는 이 질의가 **삼성 사운드바 9종**을 내밀어 통과하고 있었다 — 조건이 아무 일도
    // 안 하는 폴백 때문이었다. 브랜드+스펙 조합은 실제로 있는 조합으로 검사한다.
    { q: 'JBL 포터블 스피커 방수', desc: '브랜드+스펙 조합', minResults: 1 },
    { q: '폭 700 냉장고', desc: '치수 조건', minResults: 1 },
    { q: 'S펜 노트북 OLED', desc: '기능 조합', minResults: 1 },
    { q: '가성비 태블릿 학생', desc: '가성비+카테고리', minResults: 1 },
  ];
  for (const { q, desc, minResults } of scenarios) {
    try {
      doc.getElementById('q').value = q;
      window.runSearch();
      const cardCount = doc.querySelectorAll('#rHost .rcard').length;
      const resCountText = doc.getElementById('resCount') ? doc.getElementById('resCount').textContent : '';
      console.log(`[${desc}] "${q}" -> cards=${cardCount} (${resCountText})`);
      if (cardCount < minResults) fail(`[${desc}] "${q}" 카드 수 ${cardCount} < ${minResults}`);
    } catch (e) {
      fail(`[${desc}] "${q}" 검색 중 예외: ${e.message}`);
    }
  }

  // ═══ 4. 패키지 모드 (신혼가전 패키지) ═══
  console.log('── 4. 패키지 모드 ──');
  try {
    doc.getElementById('q').value = '신혼가전 패키지';
    window.runSearch();
    const cardCount = doc.querySelectorAll('#rHost .rcard').length;
    console.log('신혼가전 패키지 -> cards=', cardCount, '(기대: 8개 카테고리)');
    if (cardCount !== 8) fail(`패키지 모드 카드 수 = ${cardCount}, 기대값 8 (냉장고/세탁기·콤보/건조기/TV/에어컨/식기세척기/에어드레서/청소기)`);
    const cats = [...doc.querySelectorAll('#rHost .rcat')].map((el) => el.textContent);
    const expectedPkgCats = ['냉장고', '세탁기·콤보', '건조기', 'TV', '에어컨', '식기세척기', '에어드레서', '청소기'];
    for (const c of expectedPkgCats) {
      if (!cats.includes(c)) fail(`패키지 모드 결과에 "${c}" 카테고리 누락`);
    }
  } catch (e) {
    fail(`패키지 모드 검색 중 예외: ${e.message}`);
  }

  // ═══ 5. 존재하지 않는 키워드 → 결과 없음 처리 ═══
  console.log('── 5. 존재하지 않는 키워드 ──');
  try {
    doc.getElementById('q').value = '가나다라마바사 존재하지않는망망대해키워드123 zzzxxxqqq';
    window.runSearch();
    const cardCount = doc.querySelectorAll('#rHost .rcard').length;
    const emptyEl = doc.querySelector('#rHost .empty');
    console.log('무의미한 키워드 -> cards=', cardCount, 'empty 표시=', !!emptyEl);
    if (cardCount !== 0) fail(`무의미한 키워드인데 카드가 ${cardCount}개 렌더됨`);
    if (!emptyEl) fail('결과 없음 상태에서 .empty 안내 문구가 렌더되지 않음');
  } catch (e) {
    fail(`무의미한 키워드 검색 중 예외: ${e.message}`);
  }

  // 빈 입력 (toast만 뜨고 에러 없어야 함)
  try {
    doc.getElementById('q').value = '';
    window.runSearch();
    console.log('빈 입력 runSearch() 호출 — 예외 없이 통과');
  } catch (e) {
    fail(`빈 입력 검색 중 예외: ${e.message}`);
  }

  // ═══ 6. 카드 상세 토글 + 정렬 ═══
  console.log('── 6. 카드 상세 토글 / 정렬 ──');
  try {
    doc.getElementById('q').value = '냉장고';
    window.runSearch();
    const firstCard = doc.querySelector('#rHost .rcard .rmain');
    if (!firstCard) { fail('냉장고 검색 결과 카드가 없음'); }
    else {
      const idMatch = firstCard.getAttribute('onclick').match(/toggleDetail\((\d+)\)/);
      const id = idMatch ? +idMatch[1] : null;
      if (id === null) fail('rmain onclick에서 제품 id를 추출하지 못함');
      else {
        window.toggleDetail(id);
        const detail = doc.querySelector('#rHost .rdetail');
        if (!detail) fail('toggleDetail 후 .rdetail이 렌더되지 않음');
        else if (!detail.querySelector('table.spec')) fail('.rdetail에 스펙 테이블이 없음');
        window.toggleDetail(id); // 닫기
        if (doc.querySelector('#rHost .rdetail')) fail('toggleDetail 재호출 후에도 .rdetail이 닫히지 않음');
      }
    }
    window.setSort('asc');
    const sortBtns = [...doc.querySelectorAll('#sortRow .sbtn')];
    const onBtn = sortBtns.find((b) => b.classList.contains('on'));
    if (!onBtn || !onBtn.textContent.includes('낮은')) fail('setSort("asc") 후 정렬 버튼 상태가 갱신되지 않음');
    const prices = [...doc.querySelectorAll('#rHost .rmeta b')].map((el) => parseFloat(el.textContent));
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] < prices[i - 1]) { fail(`가격 오름차순 정렬 실패: ${prices[i - 1]} -> ${prices[i]}`); break; }
    }
  } catch (e) {
    fail(`카드 토글/정렬 검증 중 예외: ${e.message}`);
  }

  // ═══ 7. 모드 전환 (키워드 ↔ AI 추천) ═══
  console.log('── 7. 모드 전환 ──');
  try {
    window.setMode('ai');
    if (!doc.getElementById('mAi').classList.contains('on')) fail('setMode("ai") 후 mAi가 on 상태가 아님');
    if (doc.getElementById('mKw').classList.contains('on')) fail('setMode("ai") 후에도 mKw가 on 상태임');
    if (!doc.getElementById('kwBox').classList.contains('hidden')) fail('setMode("ai") 후 kwBox가 숨겨지지 않음');
    if (doc.getElementById('aiBox').classList.contains('hidden')) fail('setMode("ai") 후 aiBox가 보이지 않음');

    window.setMode('kw');
    if (!doc.getElementById('mKw').classList.contains('on')) fail('setMode("kw") 후 mKw가 on 상태가 아님');
    if (!doc.getElementById('aiBox').classList.contains('hidden')) fail('setMode("kw") 후 aiBox가 숨겨지지 않음');
    console.log('모드 전환 OK (kw <-> ai)');
  } catch (e) {
    fail(`모드 전환 중 예외: ${e.message}`);
  }

  // ═══ 8. AI 추천 플로우 (자연어 → 카테고리 감지 → Step2 → 최종 추천) ═══
  console.log('── 8. AI 추천 플로우 ──');
  try {
    window.setMode('ai');

    /*
     * ── 품목을 말했으면 그 품목만 (2026-08-16) ────────────────────────
     *
     * 이 문장은 "세탁기랑 건조기 둘 다 필요하고" 라고 **품목을 정확히 말한다.**
     * 예전에는 '신혼부부' 라는 말 때문에 8품목을 골랐고, 예산 350만원이 8로 나뉘어
     * 세탁기 몫이 56만원이 됐다 — 상담사가 말한 것과 다른 답이 나온다.
     * 이 검사는 그 옛 동작을 **기대값으로 굳혀 두고 있었다.**
     *
     * 지금은 두 경우를 따로 본다: ①품목을 말하면 그것만 ②말 안 하면 용도 규칙.
     * 한쪽만 보면 반대쪽이 죽어도 모른다.
     */
    doc.getElementById('aq').value = '신혼부부인데 집이 좁아요. 세탁기랑 건조기 둘 다 필요하고 예산은 350만원 정도예요.';
    await window.runAI();
    const chips = doc.querySelectorAll('#catGrid .cat-chip');
    const selectedChips = [...doc.querySelectorAll('#catGrid .cat-chip.on')].map((c) => c.dataset.cat);
    console.log('runAI() 후 카테고리 칩:', chips.length, '개, 자동선택:', selectedChips.join(', '));
    if (chips.length === 0) fail('runAI() 후 카테고리 선택 칩이 렌더되지 않음');
    for (const c of ['세탁기·콤보', '건조기']) {
      if (!selectedChips.includes(c)) fail(`문장에 적힌 "${c}" 가 자동 선택되지 않음`);
    }
    const strays = selectedChips.filter((c) => !['세탁기·콤보', '건조기'].includes(c));
    if (strays.length) fail(`품목을 말했는데 용도 규칙이 더 얹혔다: ${strays.join(', ')} (예산이 그만큼 쪼개진다)`);

    /* ② 품목을 말하지 않으면 용도 규칙이 살아 있어야 한다 */
    doc.getElementById('aq').value = '신혼부부 혼수 준비중입니다. 예산은 1000만원이에요.';
    await window.runAI();
    const useCase = [...doc.querySelectorAll('#catGrid .cat-chip.on')].map((c) => c.dataset.cat);
    for (const c of ['냉장고', '세탁기·콤보', '건조기', 'TV', '에어컨', '식기세척기', '에어드레서', '청소기']) {
      if (!useCase.includes(c)) fail(`품목을 안 말한 "신혼부부 혼수" 문장인데 "${c}" 가 빠졌다 — 용도 규칙이 죽었다`);
    }

    /* ③ 1인가구가 생활 이벤트(이사)를 이긴다 — 자취방에 식기세척기를 얹지 않는다 */
    doc.getElementById('aq').value = '자취방 원룸 이사 300만원';
    await window.runAI();
    const solo = [...doc.querySelectorAll('#catGrid .cat-chip.on')].map((c) => c.dataset.cat);
    if (solo.includes('식기세척기') || solo.includes('에어드레서'))
      fail(`자취방 원룸인데 신혼 규칙이 얹혔다: ${solo.join(', ')}`);
    if (!solo.includes('냉장고') || !solo.includes('청소기'))
      fail(`1인가구 규칙이 안 걸렸다: ${solo.join(', ')}`);

    /* 아래 Step2 검사는 원래 문장(품목 2개 + 예산 350만)으로 이어 간다 */
    doc.getElementById('aq').value = '신혼부부인데 집이 좁아요. 세탁기랑 건조기 둘 다 필요하고 예산은 350만원 정도예요.';
    await window.runAI();

    // toggleCat으로 카테고리 하나 추가
    window.toggleCat('노트북');
    const toggledOn = [...doc.querySelectorAll('#catGrid .cat-chip.on')].map((c) => c.dataset.cat);
    if (!toggledOn.includes('노트북')) fail('toggleCat("노트북") 후 노트북이 선택 상태로 표시되지 않음');
    const nextBtn = doc.getElementById('aiNextBtn');
    if (!nextBtn || !nextBtn.textContent.includes(String(toggledOn.length))) fail('toggleCat 후 aiNextBtn 텍스트가 갱신되지 않음');

    // 다시 꺼서 원상복구 (세탁기 패키지 8개만 유지)
    window.toggleCat('노트북');

    /*
     * Step2 카드 수는 **고른 품목 수에서 끌어낸다.** 8 로 박아 두면 감지 규칙을 고칠
     * 때마다 이 검사가 깨지는데, 정작 여기서 지켜야 할 것은 "고른 품목마다 카드 하나"다.
     */
    const wantCards = [...doc.querySelectorAll('#catGrid .cat-chip.on')].length;
    window.goStep2();
    const configCards = doc.querySelectorAll('#rHost .cat-config-card');
    console.log('goStep2() 후 카테고리별 설정 카드:', configCards.length, `개 (고른 품목 ${wantCards}개)`);
    if (configCards.length !== wantCards) fail(`goStep2() 후 설정 카드 수 = ${configCards.length}, 고른 품목은 ${wantCards}개`);
    const featChips = doc.querySelectorAll('#rHost .feat-chip');
    if (featChips.length === 0) fail('goStep2() 후 기능 선택 칩(.feat-chip)이 하나도 없음');

    // 기능 칩 하나 토글
    const someFeat = featChips[0];
    window.toggleFeat(someFeat);
    if (!someFeat.classList.contains('on')) fail('toggleFeat() 호출 후 칩에 on 클래스가 붙지 않음');

    // 예산 입력 후 합계 갱신
    const budgetInputs = doc.querySelectorAll('#rHost .cat-budget-input');
    if (budgetInputs.length !== wantCards) fail(`예산 입력 필드 수 = ${budgetInputs.length}, 고른 품목은 ${wantCards}개`);
    /*
     * **문장에서 예산을 읽었으면 goStep2 가 이미 칸을 채워 둔다**(2026-08-16).
     * 예전에는 버튼을 눌러야 채워졌는데, 문장에 예산을 쓴 상담사는 그 버튼을 누르지
     * 않아 예산 필터가 통째로 꺼졌다(400만원 고객에게 584만원을 프리미엄으로 내밀었다).
     */
    const preFilled = [...budgetInputs].filter((el) => +el.value > 0).length;
    if (!preFilled) fail('goStep2() 뒤 예산 칸이 비어 있다 — 문장에서 읽은 예산이 자동 분배되지 않았다');

    /*
     * 합계 검사는 **지금 칸에 든 값의 합**과 대조한다. 예전에는 "250 이 들어 있는가"로
     * 봤는데, 그건 나머지 칸이 비어 있다는 전제에 기댄 것이라 자동 분배가 생기자 깨졌다.
     */
    budgetInputs[0].value = '250';
    window.updateTotal();
    const want = [...budgetInputs].reduce((s, el) => s + (parseInt(el.value) || 0), 0);
    const totalText = doc.getElementById('totalBarPrice').textContent;
    console.log('updateTotal() 후 합계 표시:', totalText, '(칸 합계', want + ')');
    if (totalText.replace(/[^\d]/g, '') !== String(want)) fail(`updateTotal() 후 합계가 칸 합계와 다르다: ${totalText} ≠ ${want}만원`);

    // 예산 자동 분배 (aiParsedBudget=350이 감지되어 있어야 함)
    window.autoDistributeBudget();
    const filledCount = [...budgetInputs].filter((el) => el.value && +el.value > 0).length;
    console.log('autoDistributeBudget() 후 값이 채워진 예산 필드:', filledCount, '/', budgetInputs.length);
    if (filledCount === 0) fail('autoDistributeBudget() 호출 후 예산 필드가 하나도 채워지지 않음 (aiParsedBudget 감지 실패 가능성)');

    // 최종 추천 실행
    window.runAiFinal();
    const tierCards = doc.querySelectorAll('#rHost .ai-tier-card');
    const aiTotal = doc.querySelector('#aiHost .ai-result-total');
    console.log('runAiFinal() 후 티어 카드:', tierCards.length, '개, 결과 요약 표시:', !!aiTotal);
    if (tierCards.length === 0) fail('runAiFinal() 후 추천 카드(.ai-tier-card)가 하나도 렌더되지 않음');
    if (!aiTotal) fail('runAiFinal() 후 .ai-result-total 요약 블록이 렌더되지 않음');

    // 티어 카드 상세 토글
    if (tierCards.length > 0) {
      window.toggleAiDetail(tierCards[0]);
      const body = tierCards[0].querySelector('.ai-detail-body');
      if (!body || body.style.display !== 'block') fail('toggleAiDetail() 호출 후 상세 영역이 열리지 않음');
    }

    /*
     * ── 티어는 값이 비싼 순이어야 한다 (2026-08-16) ──────────────────────
     *
     * 가성비에 "예산 40% 하한"을 넣었더니 **걸러진 싼 제품이 사라지지 않고 스탠다드로
     * 떨어졌다.** 실측으로 냉장고가 프리미엄 199만 · 스탠다드 59만 · **가성비 89만** 이
     * 되어 스탠다드가 가성비보다 싼 역전이 났다. 화면에서 바로 이상해 보인다.
     * 지금은 하한에 걸린 것을 어느 티어에도 넣지 않는다.
     */
    {
      const byCat = new Map();
      for (const card of doc.querySelectorAll('#rHost .ai-cat-group')) {
        const cat = (card.querySelector('.ai-cat-group-head')?.textContent || '').trim();
        const tiers = [...card.querySelectorAll('.ai-tier-card')].map((c) => {
          const t = c.textContent.replace(/\s+/g, ' ');
          return {
            tier: (t.match(/(프리미엄|스탠다드|가성비)/) || [])[1],
            won: Number(((t.match(/(\d[\d,]*)만원/) || [])[1] || '0').replace(/,/g, '')),
          };
        }).filter((x) => x.tier && x.won);
        if (tiers.length >= 2) byCat.set(cat, tiers);
      }
      const rank = { 프리미엄: 3, 스탠다드: 2, 가성비: 1 };
      const bad = [];
      for (const [cat, tiers] of byCat) {
        const sorted = tiers.slice().sort((a, b) => rank[b.tier] - rank[a.tier]);
        for (let i = 0; i + 1 < sorted.length; i++) {
          if (sorted[i].won < sorted[i + 1].won) {
            bad.push(`${cat}: ${sorted[i].tier} ${sorted[i].won}만 < ${sorted[i + 1].tier} ${sorted[i + 1].won}만`);
          }
        }
      }
      if (bad.length) fail(`티어 가격이 역전됐다 — ${bad.join(' / ')}`);
      else console.log(`티어 가격 순서 OK (${byCat.size}개 카테고리)`);
    }

    /*
     * ── 예산을 넘겨 골랐으면 그렇다고 말해야 한다 (2026-08-16) ───────────
     *
     * 예산 안에 제품이 없으면 예전에는 조용히 필터를 끄고 전체 풀을 썼다. 실측으로
     * *"자취방 원룸 이사 300만원"* 에서 TV 몫 60만원에 **890만원 83인치 OLED** 가
     * 프리미엄으로 떴다(15배). 지금은 ①경고를 띄우고 ②싼 쪽에서 고른다.
     */
    {
      doc.getElementById('aq').value = 'TV 30만원';
      await window.runAI(); await new Promise((r) => setTimeout(r, 80));
      window.goStep2(); await new Promise((r) => setTimeout(r, 80));
      window.runAiFinal(); await new Promise((r) => setTimeout(r, 120));
      const warn = [...doc.querySelectorAll('#aiHost .ai-budget')]
        .map((e) => e.textContent).find((t) => /예산을 넘겨/.test(t));
      if (!warn) fail('예산(30만원) 안에 TV 가 없는데 "예산을 넘겨 골랐다"는 경고가 없다');
      const wons = [...doc.querySelectorAll('#rHost .ai-tier-card')]
        .map((c) => Number(((c.textContent.replace(/\s+/g, ' ').match(/(\d[\d,]*)만원/) || [])[1] || '0').replace(/,/g, '')))
        .filter(Boolean);
      /* 싼 쪽에서 골랐는지 — 예산의 10배를 넘는 것을 내밀면 안 된다 */
      const absurd = wons.filter((w) => w > 300);
      if (absurd.length) fail(`예산 30만원인데 ${absurd.join('·')}만원짜리를 내밀었다 — 싼 쪽에서 골라야 한다`);
      else console.log(`예산 초과 안내 OK (경고 있음 · 추천가 ${wons.join('·')}만원)`);
    }

    /*
     * ── 청소기는 형태(로봇/무선/유선)를 지켜야 한다 (2026-08-16) ─────────
     *
     * DB 카테고리는 '청소기' 하나인데 상담에서는 셋을 따로 찾는다. 예전에는
     * *"로봇청소기 100만원"* 에 **무선청소기와 유선 캐니스터**가 나왔다 — 로봇이 한 대도
     * 없이. 제품 상세검색이 이미 모델 접두로 푼 문제다(VR 로봇 · VS 무선 · VC 유선).
     * **키워드로 가르면 안 된다** — 제품군 이름이 형태를 안 밝히는 것이 많다.
     */
    const models = (pre) => [...doc.querySelectorAll('#rHost .ai-tier-card')]
      .map((c) => (c.textContent.match(new RegExp('\\b(' + pre + '[A-Z0-9]{4,})\\b')) || [])[1]).filter(Boolean);
    /*
     * 같은 병이 에어컨에도 있었다 — "에어컨 스탠드" 에 벽걸이가 나왔다.
     * 접두는 size-reps 와 같은 규칙이다: AF 스탠드 · AR 벽걸이 · AW 창문형.
     */
    for (const [q, pre, re, label] of [
      ['로봇청소기 100만원', 'V[RSCW]', /^VR/, '로봇'],
      ['무선청소기 80만원', 'V[RSCW]', /^VS/, '무선'],
      ['에어컨 스탠드 300만원', 'A[FRW]', /^AF/, '스탠드'],
      ['에어컨 벽걸이 200만원', 'A[FRW]', /^AR/, '벽걸이'],
    ]) {
      doc.getElementById('aq').value = q;
      await window.runAI(); await new Promise((r) => setTimeout(r, 80));
      window.goStep2(); await new Promise((r) => setTimeout(r, 80));
      window.runAiFinal(); await new Promise((r) => setTimeout(r, 120));
      const ms = models(pre);
      const wrong = ms.filter((m) => !re.test(m));
      if (!ms.length) fail(`"${q}" 에 추천이 없다`);
      else if (wrong.length) fail(`"${q}" 인데 ${label} 형태가 아닌 것이 나왔다: ${wrong.join(', ')}`);
      else console.log(`형태 지킴 OK — "${q}" → ${ms.join(', ')}`);
    }

    /*
     * 예산을 넘길 때는 **가장 싼 것이 반드시 보여야 한다.** 싼 쪽으로 좁히고도 그 안에서
     * 다시 3등분하면 위쪽이 올라와, 건조기 50만원 상담에서 89만원(최저)이 안 보이고
     * 199/129/119 가 떴다. 지금은 가장 싼 3종만 남긴다.
     */
    {
      doc.getElementById('aq').value = '건조기만 필요해요 예산 50만';
      await window.runAI(); await new Promise((r) => setTimeout(r, 80));
      window.goStep2(); await new Promise((r) => setTimeout(r, 80));
      window.runAiFinal(); await new Promise((r) => setTimeout(r, 120));
      const warn = [...doc.querySelectorAll('#aiHost .ai-budget')].map((e) => e.textContent).find((t) => /예산을 넘겨/.test(t));
      const min = Number((String(warn || '').match(/가장 싼 것 ([\d,]+)만원/) || [])[1]?.replace(/,/g, '') || 0);
      const wons = [...doc.querySelectorAll('#rHost .ai-tier-card')]
        .map((c) => Number(((c.textContent.replace(/\s+/g, ' ').match(/(\d[\d,]*)만원/) || [])[1] || '0').replace(/,/g, ''))).filter(Boolean);
      if (!min) fail('예산 초과 경고에 "가장 싼 것" 이 없다');
      else if (!wons.includes(min)) fail(`예산 초과인데 가장 싼 ${min}만원이 추천에 없다 (나온 것: ${wons.join('·')}만원)`);
      else console.log(`예산 초과 시 최저가 노출 OK — 최저 ${min}만원 포함 (${wons.join('·')}만원)`);
    }

    /* '김치냉장고' 는 '냉장고' 를 품는다 — 짧은 쪽이 딸려오면 예산이 쪼개진다 */
    {
      doc.getElementById('aq').value = '김치냉장고 200만원';
      await window.runAI(); await new Promise((r) => setTimeout(r, 80));
      const picked = [...doc.querySelectorAll('#catGrid .cat-chip.on')].map((c) => c.dataset.cat);
      if (picked.includes('냉장고')) fail(`"김치냉장고" 인데 냉장고까지 골랐다: ${picked.join(', ')}`);
      else if (!picked.includes('김치냉장고')) fail(`"김치냉장고" 가 안 골라졌다: ${picked.join(', ')}`);
      else console.log(`품목 포함관계 OK — 김치냉장고만 (${picked.join(', ')})`);
    }
  } catch (e) {
    fail(`AI 추천 플로우 중 예외: ${e.stack || e.message}`);
  } finally {
    window.setMode('kw');
  }

  // ═══ 10. 카테고리 전수 검색 (51개: CE/MX 27 + 리빙 9 + 데이코 1 + Harman 14) — 0건 카테고리 없는지 ═══
  console.log('── 10. 카테고리 전수 검색 (50개) ──');
  const catNames = Object.keys(CAT_QUERIES);
  console.log('총 카테고리 수:', catNames.length, '(기대: 51 = CE/MX 27 + 리빙 9 + 데이코 1 + Harman 14)');
  if (catNames.length !== 57) fail(`CAT_QUERIES 카테고리 수 = ${catNames.length}, 기대값 57 — DB에 카테고리가 추가/삭제되었다면 CAT_QUERIES를 갱신할 것`);
  for (const [cat, q] of Object.entries(CAT_QUERIES)) {
    try {
      const P = window.parseQuery(q);
      const res = window.search(P);
      const hit = res.filter((r) => r.p.cat === cat).length;
      if (hit === 0) fail(`카테고리 "${cat}" — 검색어 "${q}"로 0건 (search()가 이 카테고리를 하나도 반환하지 못함)`);
    } catch (e) {
      fail(`카테고리 "${cat}" 검색 중 예외: ${e.message}`);
    }
  }
  // DB의 실제 카테고리 집합과 CAT_QUERIES 키 집합이 정확히 일치하는지 (추가/누락 감지)
  const actualCats = new Set([...CE_MX.map((p) => p.cat), ...HARMAN.map((p) => p.cat)]);
  for (const c of actualCats) {
    if (!(c in CAT_QUERIES)) fail(`DB에 존재하는 카테고리 "${c}"가 CAT_QUERIES에 없음 — 새 카테고리 추가 시 테스트도 갱신할 것`);
  }
  for (const c of Object.keys(CAT_QUERIES)) {
    if (!actualCats.has(c)) fail(`CAT_QUERIES에 있는 카테고리 "${c}"가 실제 DB에는 없음 — 카테고리명이 바뀌었거나 삭제됨`);
  }

  /* ═══ 11. 형태 구분(SUBCAT) — 카테고리가 하나인 품목의 하위 형태 ═══
   *
   * DB 카테고리는 '청소기' 하나인데 상담에서는 로봇/무선을 따로 찾는다. "로봇청소기 직배수"에
   * **무선청소기가 섞여 나온 것**이 2026-08-11 사용자 지적이다. 모델 접두가 형태를 가른다.
   */
  console.log('── 11. 형태 구분(로봇/무선/드럼) ──');
  const models = (q) => window.search(window.parseQuery(q)).map((r) => r.p);
  {
    const robot = models('로봇청소기');
    if (!robot.length) fail('"로봇청소기" 0건');
    const bad = robot.filter((p) => !/^VR/i.test(p.model));
    if (bad.length) fail(`"로봇청소기"에 로봇이 아닌 모델: ${bad.slice(0, 3).map((p) => p.model).join(', ')}`);
    console.log(`  로봇청소기 ${robot.length}종 — 전부 VR 접두 ✓`);

    const stick = models('무선청소기');
    if (!stick.length) fail('"무선청소기" 0건');
    const bad2 = stick.filter((p) => !/^VS/i.test(p.model));
    if (bad2.length) fail(`"무선청소기"에 스틱이 아닌 모델: ${bad2.slice(0, 3).map((p) => p.model).join(', ')}`);
    console.log(`  무선청소기 ${stick.length}종 — 전부 VS 접두 ✓`);

    // 형태를 안 밝히면 예전처럼 전체가 나와야 한다(형태 필터가 카테고리 검색을 좁히면 안 된다)
    const allVac = models('청소기');
    if (allVac.length <= robot.length) fail(`"청소기"(${allVac.length})가 "로봇청소기"(${robot.length})보다 넓어야 한다`);

    // 원래 신고된 질의 — 직배수는 실제로 2종뿐이고, 무선청소기가 섞이면 안 된다
    const drain = models('로봇청소기 직배수');
    if (!drain.length) fail('"로봇청소기 직배수" 0건');
    if (drain.some((p) => !/^VR/i.test(p.model))) fail('"로봇청소기 직배수"에 로봇이 아닌 모델이 섞였다');
    if (drain.some((p) => p.kw.indexOf('직배수') < 0)) fail('"로봇청소기 직배수"에 직배수가 없는 모델이 섞였다');
    console.log(`  로봇청소기 직배수 ${drain.length}종 — 전부 VR + 직배수 ✓`);

    // 형태 필터는 자기 카테고리 안에서만 — 다른 품목을 함께 물으면 그쪽은 지우지 않는다
    const mix = models('드럼세탁기 건조기');
    if (!mix.some((p) => p.cat === '건조기')) fail('"드럼세탁기 건조기"에서 건조기가 통째로 사라졌다 — 형태 필터가 남의 카테고리까지 걸렸다');
    if (mix.some((p) => p.cat === '세탁기·콤보' && !/^W[FWH]/i.test(p.model))) fail('"드럼세탁기"에 드럼이 아닌 세탁기가 섞였다');

    /*
     * **띄어 써도 · 조사를 붙여도 같은 형태여야 한다**(2026-08-11 배포본에서 발견).
     * 예전에는 SUBCAT 을 토큰 하나에 그대로 대조해서, 붙여 쓴 것만 걸렸다:
     *   "드럼세탁기" 17종 ↔ **"드럼 세탁기" 38종**(콤보 11 · 설치키트 8 · 통돌이 2 가 섞였다)
     *   "무선청소기" 9종 ↔ **"무선 청소기" 10종**(로봇청소기가 섞였다)
     * '통돌이'는 조사 제거가 '이'를 떼어 **'통돌'** 이 되는 바람에 표에 없는 말이 됐다.
     */
    const forms = [
      ['로봇청소기', '로봇 청소기', /^VR/i],
      ['무선청소기', '무선 청소기', /^VS/i],
      ['유선청소기', '유선 청소기', /^VC/i],
      ['드럼세탁기', '드럼 세탁기', /^W[FWH]/i],
      ['통돌이세탁기', '통돌이 세탁기', /^WA/i],
      ['통버블세탁기', '통버블 세탁기', /^WA/i],
    ];
    for (const [joined, spaced, re] of forms) {
      const a = models(joined), b = models(spaced);
      if (!a.length) fail(`"${joined}" 0건`);
      if (a.length !== b.length) fail(`"${joined}"(${a.length}) 와 "${spaced}"(${b.length}) 결과가 다르다 — 띄어쓰기로 형태 필터가 새어 나간다`);
      const leak = b.filter((p) => !re.test(p.model));
      if (leak.length) fail(`"${spaced}"에 다른 형태가 섞였다: ${leak.slice(0, 4).map((p) => p.model).join(', ')}`);
    }
    console.log(`  띄어 쓴 형태 ${forms.length}가지 — 붙여 쓴 것과 같은 결과 ✓`);

    // 조사가 붙어도 같아야 한다 ('통돌이 세탁기를' 이 '통돌' 로 잘려 조건에서 빠졌다)
    for (const [q, re] of [['통돌이 세탁기를', /^WA/i], ['로봇청소기를', /^VR/i]]) {
      const r = models(q);
      if (!r.length) fail(`"${q}" 0건 — 조사 때문에 형태가 사라졌다`);
      if (r.some((p) => !re.test(p.model))) fail(`"${q}"에 다른 형태가 섞였다`);
    }

    // 형태를 안 밝힌 말까지 좁히면 안 된다 — 오탐 회귀 검사
    const noForm = models('무선 이어폰');
    if (noForm.some((p) => p.cat === '청소기')) fail('"무선 이어폰"이 청소기 형태 필터에 걸렸다');
  }

  /* ═══ 12. 복합 조건 — 조건은 AND, DB 에 없는 말은 뺀다 ═══ */
  console.log('── 12. 복합 조건(AND) ──');
  {
    // 카테고리만 맞으면 남기던 폴백 때문에 조건이 아무 일도 안 하던 것을 막는다
    const wide = models('청소기');
    const narrow = models('청소기 직배수');
    if (narrow.length >= wide.length) fail(`조건을 더해도 안 좁혀진다 — 청소기 ${wide.length} → 청소기 직배수 ${narrow.length}`);
    if (narrow.some((p) => p.kw.indexOf('직배수') < 0)) fail('"청소기 직배수"에 직배수가 없는 모델이 남았다');

    // 사용자가 든 예 — '공기청정'은 카테고리가 아니라 기능이라 무풍 에어컨이 나와야 한다
    const mf = models('무풍 공기청정 19평');
    if (!mf.length) fail('"무풍 공기청정 19평" 0건');
    if (!mf.every((p) => p.cat === '에어컨')) fail('"무풍 공기청정 19평"에 에어컨이 아닌 것이 섞였다');
    console.log(`  무풍 공기청정 19평 → ${mf.length}종 (전부 에어컨) ✓`);

    // DB 에 아예 없는 말은 조건에서 빼고 그 사실을 P.ignored 로 밝힌다
    const P = window.parseQuery('워치 지어낸조건단어');
    const res = window.search(P);
    if (!res.length) fail('DB 에 없는 말 하나가 결과를 통째로 지웠다 — 없는 말은 조건에서 빼야 한다');
    if (!(P.ignored || []).includes('지어낸조건단어')) fail('뺀 말이 P.ignored 에 안 담겼다 — 화면이 그 사실을 밝힐 수 없다');
    console.log(`  워치 + 없는 말 → ${res.length}종, 뺀 말 표시 ✓`);

    /* 없는 말 판정은 **DB 전체가 아니라 그 카테고리 안에서** 해야 한다.
     * 전체로 봤더니 "비스포크 냉장고"가 0종이 됐다 — 냉장고 kw 에는 '비스포크'가 한 종도
     * 없는데 에어드레서·청소기에 14종이 있어 조건이 살아남아 AND 를 깨뜨렸다. */
    const bes = models('비스포크 냉장고');
    if (!bes.length) fail('"비스포크 냉장고" 0종 — 그 카테고리에 없는 말이 조건으로 남았다');
    if (!bes.every((p) => p.cat === '냉장고')) fail('"비스포크 냉장고"에 냉장고가 아닌 것이 섞였다');
    console.log(`  비스포크 냉장고 → ${bes.length}종 (그 카테고리에 없는 말은 뺀다) ✓`);
  }

  /* ═══ 13. 질의 표기 — 사람이 실제로 치는 형태 ═══ */
  console.log('── 13. 질의 표기(구두점·쉼표) ──');
  {
    // "냉장고?" 가 0종이었다. 자연어로 묻는 도구에서 물음표 하나로 0건이 되면 안 된다
    const base = models('냉장고').length;
    for (const q of ['냉장고?', '냉장고!', '"냉장고"', '(냉장고)']) {
      const n = models(q).length;
      if (n !== base) fail(`"${q}" → ${n}종, "냉장고"(${base}종)와 같아야 한다 — 앞뒤 문장부호를 떼야 한다`);
    }
    if (models('로봇청소기?').length !== models('로봇청소기').length) fail('"로봇청소기?" 가 형태 필터를 못 탄다');
    console.log(`  구두점이 붙어도 같은 결과 (냉장고 ${base}종) ✓`);

    /* 숫자 안의 쉼표를 통째로 공백으로 바꾸던 탓에 "1,200만원 이하"가 **200만원**으로
     * 읽혔다 — 0건도 아니고 조용히 틀린 답을 내밀었다. */
    for (const [q, want] of [['1,000만 이하 TV', 1000], ['1,200만원 이하 TV', 1200], ['1000만 이하 TV', 1000]]) {
      const got = window.parseQuery(q).budgetMax;
      if (got !== want) fail(`"${q}" 예산 해석 ${got}만원, 기대 ${want}만원 — 숫자 안의 쉼표를 지워야 한다`);
    }
    console.log('  쉼표가 든 예산을 바르게 읽는다 (1,200만원 → 1200) ✓');
  }

  /* ═══ 14. 화면에 적는 이름과 수치 ═══
   *
   * 둘 다 실제로 어긋나 있었다(2026-08-12 발견).
   *  · 헤더가 아직 **'모델 파인더'** 였다. 그 이름은 통합검색(/search)으로 넘어갔고
   *    이 앱의 정식 명칭은 **'제품 상세검색'** 이다(CLAUDE.md 용어표 · 허브 카드 · 사이드바).
   *  · 상단바는 "586종", 히어로는 "524종" 이라고 **서로 다르게** 말했다. 524 는 데이코 8종을
   *    넣기 전 값이고, 586 은 `setMode()` 안에 있어 초기 화면에서는 불리지도 않았다.
   * 지금은 둘 다 `PRODUCTS` 를 세어 넣으므로, 이 검사는 그 연결이 끊기면 실패한다. */
  console.log('── 14. 화면 표기(이름·제품 수) ──');
  {
    const brand = doc.querySelector('.brand b');
    if (!brand) fail('상단바 이름 요소(.brand b)가 없다');
    else if (brand.textContent.trim() !== '제품 상세검색')
      fail(`상단바 이름이 "${brand.textContent.trim()}" — 정식 명칭은 '제품 상세검색'이다`);
    else console.log('  상단바 이름 = 제품 상세검색 ✓');

    /* `PRODUCTS` 는 최상위 `let` 이라 window 에 없다 — 위에서 원본을 뽑아 둔 값을 쓴다 */
    const n = TOTAL_PRODUCTS;
    const said = (s) => (String(s).match(/(\d+)\s*종/) || [])[1];
    const bc = doc.getElementById('brandCount');
    if (!bc) fail('제품 수 표기 요소(#brandCount)가 없다');
    else if (Number(said(bc.textContent)) !== n)
      fail(`상단바는 "${bc.textContent.trim()}" 인데 DB 는 ${n}종 — 숫자를 박아 두지 말 것`);

    const sub = doc.getElementById('heroSub');
    if (!sub) fail('안내문 요소(#heroSub)가 없다');
    else if (Number(said(sub.textContent)) !== n)
      fail(`안내문은 "${said(sub.textContent)}종" 인데 DB 는 ${n}종 — 초기 화면에서도 세어 넣어야 한다`);
    else console.log(`  상단바·안내문 모두 ${n}종 (DB 에서 세어 넣음) ✓`);
  }

  // ═══ 10. 견적은 없다 — 이 앱은 판매용이 아니다 ═══
  /*
   * 2026-08-17 사용자 결정: *"견적 담기도 없앱니다. 이 앱은 판매용 앱이 아니라
   * 세일즈 코파일럿 말 그대로 **상담사의 보조 장치**일 뿐입니다."*
   *
   * 견적서를 제공하지 않는 조직인데 화면이 「견적 안내」라는 제목으로 금액 합계가 찍힌
   * 한 장을 만들어 고객에게 보내게 되어 있었다. **지우기만 하면 다음 사람이 "상담이
   * 끝나면 고객 손에 아무것도 안 남는다"는 같은 이유로 또 만든다** — 그것이 이 기능이
   * 처음 들어온 근거였다(요청받은 것이 아니라 그렇게 판단해서 넣었다). 그래서 규칙을
   * 검사로 남긴다.
   */
  console.log('── 10. 견적은 없다 ──');
  {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const gone = ['quotePicks', 'quoteOpen', 'qbar', '견적 담기', '견적 한 장'];
    const back = gone.filter((k) => html.includes(k));
    if (back.length) fail(`견적이 되살아났다: ${back.join(' · ')} — 이 앱은 판매용이 아니라 상담사의 보조 장치다`);
    else console.log('  견적 담기·하단 바·견적 지면 모두 없음 ✓');
  }

  // ═══ 11. 제품 id 가 겹치지 않는가 ═══
  /*
   * 삼성 배열과 JBL 배열이 **각자 0부터** 번호를 매겨 와서, 합치면 586종인데 고유 id 는
   * 532개였다. 목록·상세는 객체를 직접 그려 멀쩡해 보이지만 **공유는 id 로 찾는다**
   * (`PRODUCTS.find(x => x.id === openId)`). 그래서 JBL 제품을 열어 공유하면 같은 id 의
   * 삼성 제품이 나갔다 — 고객에게 나가는 그림이라 조용히 위험하다.
   *
   * 화면을 거쳐 확인한다: JBL 을 찾아 카드를 펼치고, **공유가 만드는 것이 그 JBL 제품인가.**
   * id 재부여를 지우면 이 검사가 물린다.
   */
  console.log('── 11. 제품 id 겹침 ──');
  {
    doc.getElementById('q').value = 'JBL 사운드바';
    window.runSearch();
    const cards = [...doc.querySelectorAll('.rmain')];
    const jbl = cards.find((c) => /JBL/i.test(c.textContent));
    if (!jbl) fail('JBL 제품 카드를 찾지 못했다');
    else {
      const m = (jbl.getAttribute('onclick') || '').match(/toggleDetail\((\d+)\)/);
      if (!m) fail('카드에서 id 를 읽지 못했다');
      else {
        window.toggleDetail(+m[1]);
        const built = window.finderShareBuild();
        const txt = JSON.stringify(built || {});
        if (!built) fail('상세를 펼쳤는데 공유가 만들어지지 않았다');
        else if (!/JBL/i.test(txt)) fail('JBL 제품을 펼쳤는데 공유에는 다른 제품이 담겼다 — id 가 겹친다');
        else console.log('  JBL 카드를 펼치면 공유도 그 제품이다 ✓');
      }
    }
  }

  console.log(ok ? 'ALL PASS' : 'SOME FAILED');
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.log('FATAL ERROR:', e.stack || e.message);
  process.exit(1);
});
