// 모델 파인더(public/finder-app.html) 회귀 테스트
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
// DB(CE+MX+Harman 297종, 41개 카테고리)가 바뀌면 아래 TOTAL_PRODUCTS / CAT_QUERIES /
// expectedCatCounts 등을 함께 갱신할 것 — 안 하면 테스트가 실패한다.

import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '..', 'public', 'finder-app.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'https://example.com/' });
const { window } = dom;
window.alert = () => {};
window.navigator.clipboard = { writeText: async () => {} };
window.Element.prototype.scrollIntoView = () => {};
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── DB 원본 직접 추출 (window.PRODUCTS는 top-level let이라 접근 불가) ──
function extractArray(varDeclPrefix) {
  const line = html.split('\n').find((l) => l.trim().startsWith(varDeclPrefix));
  if (!line) throw new Error(`소스에서 "${varDeclPrefix}" 선언을 찾지 못함`);
  const jsonStr = line.slice(line.indexOf('['), line.lastIndexOf(']') + 1);
  return JSON.parse(jsonStr);
}
const CE_MX = extractArray('let PRODUCTS');
const HARMAN = extractArray('const HARMAN_PRODUCTS');
const TOTAL_PRODUCTS = CE_MX.length + HARMAN.length; // 243 + 54 = 297

// 카테고리별 매칭 대표 검색어. CE/MX는 CATSYN 단일 매핑 토큰을 사용해 정확히 그 카테고리만
// 걸리도록 했고, Harman 14종은 CATSYN과 충돌하지 않는(예: "사운드바"/"홈시어터"/"돌비애트모스"
// 등은 CE 카테고리로 강제 필터링되므로 회피) 브랜드+모델/스펙 단서로 구성했다.
const CAT_QUERIES = {
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
  await wait(200);
  const doc = window.document;
  let ok = true;
  const fail = (msg) => { console.log('ERROR:', msg); ok = false; };

  // ═══ 1. 초기 렌더 ═══
  console.log('── 1. 초기 렌더 ──');
  const exBtns = doc.querySelectorAll('#exRow .ex');
  console.log('example buttons:', exBtns.length);
  if (exBtns.length === 0) fail('예시 키워드 버튼이 렌더되지 않음');
  if (!doc.getElementById('mKw').classList.contains('on')) fail('초기 모드가 키워드 모드(mKw)가 아님');
  if (doc.getElementById('mAi').classList.contains('on')) fail('초기 상태에서 AI 모드가 켜져있음');
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
    { q: 'JBL 사운드바 방수', desc: '브랜드+스펙 조합', minResults: 1 },
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
    doc.getElementById('aq').value = '신혼부부인데 집이 좁아요. 세탁기랑 건조기 둘 다 필요하고 예산은 350만원 정도예요.';
    await window.runAI();
    const chips = doc.querySelectorAll('#catGrid .cat-chip');
    const selectedChips = [...doc.querySelectorAll('#catGrid .cat-chip.on')].map((c) => c.dataset.cat);
    console.log('runAI() 후 카테고리 칩:', chips.length, '개, 자동선택:', selectedChips.length, '개');
    if (chips.length === 0) fail('runAI() 후 카테고리 선택 칩이 렌더되지 않음');
    const expectedAuto = ['냉장고', '세탁기·콤보', '건조기', 'TV', '에어컨', '식기세척기', '에어드레서', '청소기'];
    for (const c of expectedAuto) {
      if (!selectedChips.includes(c)) fail(`"신혼부부" 문장인데 "${c}" 카테고리가 자동 선택되지 않음`);
    }

    // toggleCat으로 카테고리 하나 추가
    window.toggleCat('노트북');
    const toggledOn = [...doc.querySelectorAll('#catGrid .cat-chip.on')].map((c) => c.dataset.cat);
    if (!toggledOn.includes('노트북')) fail('toggleCat("노트북") 후 노트북이 선택 상태로 표시되지 않음');
    const nextBtn = doc.getElementById('aiNextBtn');
    if (!nextBtn || !nextBtn.textContent.includes(String(toggledOn.length))) fail('toggleCat 후 aiNextBtn 텍스트가 갱신되지 않음');

    // 다시 꺼서 원상복구 (세탁기 패키지 8개만 유지)
    window.toggleCat('노트북');

    // Step2로 이동
    window.goStep2();
    const configCards = doc.querySelectorAll('#rHost .cat-config-card');
    console.log('goStep2() 후 카테고리별 설정 카드:', configCards.length, '개 (기대: 8개)');
    if (configCards.length !== 8) fail(`goStep2() 후 설정 카드 수 = ${configCards.length}, 기대값 8`);
    const featChips = doc.querySelectorAll('#rHost .feat-chip');
    if (featChips.length === 0) fail('goStep2() 후 기능 선택 칩(.feat-chip)이 하나도 없음');

    // 기능 칩 하나 토글
    const someFeat = featChips[0];
    window.toggleFeat(someFeat);
    if (!someFeat.classList.contains('on')) fail('toggleFeat() 호출 후 칩에 on 클래스가 붙지 않음');

    // 예산 입력 후 합계 갱신
    const budgetInputs = doc.querySelectorAll('#rHost .cat-budget-input');
    if (budgetInputs.length !== 8) fail(`예산 입력 필드 수 = ${budgetInputs.length}, 기대값 8`);
    budgetInputs[0].value = '250';
    window.updateTotal();
    const totalText = doc.getElementById('totalBarPrice').textContent;
    console.log('updateTotal() 후 합계 표시:', totalText);
    if (!totalText.includes('250')) fail(`updateTotal() 후 합계가 반영되지 않음: ${totalText}`);

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
  } catch (e) {
    fail(`AI 추천 플로우 중 예외: ${e.stack || e.message}`);
  } finally {
    window.setMode('kw');
  }

  // ═══ 10. 카테고리 전수 검색 (41개: CE/MX 27 + Harman 14) — 0건 카테고리 없는지 ═══
  console.log('── 10. 카테고리 전수 검색 (41개) ──');
  const catNames = Object.keys(CAT_QUERIES);
  console.log('총 카테고리 수:', catNames.length, '(기대: 41 = CE/MX 27 + Harman 14)');
  if (catNames.length !== 41) fail(`CAT_QUERIES 카테고리 수 = ${catNames.length}, 기대값 41 — DB에 카테고리가 추가/삭제되었다면 CAT_QUERIES를 갱신할 것`);
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

  console.log(ok ? 'ALL PASS' : 'SOME FAILED');
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.log('FATAL ERROR:', e.stack || e.message);
  process.exit(1);
});
