// AI Care 검색기(public/care-app.html) 회귀 테스트
// 실행: node scripts/test-care.mjs
// PRODUCTS 배열 순서/구성이 바뀌면 아래 ALL_PRODUCTS를 함께 갱신할 것.

import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readApp } from './lib/read-app.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '..', 'public', 'care-app.html');
const html = readApp('care-app.html');

const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'https://example.com/' });
const { window } = dom;
window.alert = () => {};
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

// PRODUCTS 배열(public/care-app.html)과 동일 순서/구성 — DATA 유무·onlyPlan·듀얼플랜 여부를 함께 기록.
const ALL_PRODUCTS = [
  { key: 'aircon',           name: '에어컨',              hasData: true,  onlyPlan: null, dual: true,  typeAB: true  },
  { key: 'aicombo',          name: 'AI콤보',               hasData: true,  onlyPlan: '36', dual: false },
  { key: 'washer',           name: '세탁기',               hasData: true,  onlyPlan: '36', dual: false },
  { key: 'dryer',            name: '건조기',               hasData: true,  onlyPlan: '36', dual: false },
  { key: 'fridge',           name: '냉장고',               hasData: true,  onlyPlan: '36', dual: false },
  { key: 'dish',             name: '식기세척기',           hasData: true,  onlyPlan: null, dual: true,  rounds12: 6 },
  { key: 'dresser',          name: '에어드레서',           hasData: true,  onlyPlan: null, dual: true,  single12: true },
  { key: 'airpur_reusable',  name: '공기청정기(리유저블)', hasData: true,  onlyPlan: '12', dual: false, rounds12: 6 },
  { key: 'airpur_s',         name: '공기청정기(S필터)',    hasData: true,  onlyPlan: '12', dual: false, rounds12: 6 },
  { key: 'purifier_under',   name: '언더싱크 정수기',      hasData: true,  onlyPlan: '12', dual: false, rounds12: 6 },
  { key: 'purifier_counter', name: '카운터탑·얼음 정수기', hasData: false, onlyPlan: null, dual: false },
  { key: 'vacuum',           name: '로봇청소기',           hasData: true,  onlyPlan: '12', dual: false, single12: true },
  // 김치냉장고는 12·36개월형이 다 있다. 예전에 36개월 전용으로 적어 뒀는데 삼성닷컴 대조에서 틀린 것으로 확인됐다
  { key: 'kimchi',           name: '김치냉장고',           hasData: true,  onlyPlan: null, dual: true  },
  { key: 'induction',        name: '인덕션/전기레인지',    hasData: true,  onlyPlan: '36', dual: false },
  { key: 'microwave',        name: '전자레인지/오븐',      hasData: true,  onlyPlan: '36', dual: false },
  { key: 'soundbar',         name: '사운드바',             hasData: true,  onlyPlan: '36', dual: false },
];

// 타임라인 모드에 노출되는(=st:'done') 제품 키. TL_MONTHS(care-app.html)에 정의된 키와 일치해야 함.
const DONE_KEYS = ['aircon','aicombo','washer','dryer','fridge','dish','dresser','airpur_reusable','airpur_s','purifier_under','vacuum','kimchi'];

(async () => {
  /*
   * **고정 대기(200ms)는 취약하다.** 앞 테스트 직후처럼 시스템이 바쁘면 첫 렌더가 그 안에
   * 안 끝나 "계약기간 타일이 없다"로 헛실패한다 — 케어 사진 갤러리를 붙여 첫 렌더가
   * 무거워지자 `npm test` 안에서만 실패했다(단독 실행은 통과).
   * 시간을 늘리는 것은 미봉책이다. **렌더가 끝났는지를 본다.**
   */
  const doc = window.document;
  for (let i = 0; i < 120; i++) {
    const el = doc.getElementById('body');
    if (el && el.innerHTML.includes('계약기간')) break;
    await wait(50);
  }
  let ok = true;
  const fail = (msg) => { console.log('ERROR:', msg); ok = false; };

  // ── 1. 초기 렌더 (DOMContentLoaded 후 curCat='aircon') ──
  const bodyEl = doc.getElementById('body');
  if (!bodyEl.innerHTML.includes('계약기간')) fail('initial render: #body missing 계약기간 summary tile');
  if (doc.getElementById('selNm').textContent !== '에어컨') fail('initial render: selNm should be 에어컨, got ' + doc.getElementById('selNm').textContent);
  console.log('OK: initial render (aircon, care mode)');

  const hasBadText = (htmlStr) => /\bundefined\b/.test(htmlStr) || /\bNaN\b/.test(htmlStr);

  // ── 2. 전 카테고리 순회: switchToCare ──
  for (const p of ALL_PRODUCTS) {
    try {
      window.switchToCare(p.key);
      const nm = doc.getElementById('selNm').textContent;
      if (nm !== p.name) { fail(`[${p.key}] selNm = "${nm}", expected "${p.name}"`); continue; }

      if (!p.hasData) {
        const todo = doc.querySelector('.todo-card');
        if (!todo) { fail(`[${p.key}] expected placeholder .todo-card (no DATA entry)`); continue; }
        if (!todo.textContent.includes('자가관리 가이드')) fail(`[${p.key}] placeholder text missing 자가관리 가이드`);
        if (doc.querySelector('.sumrow')) fail(`[${p.key}] should not render .sumrow when DATA missing`);
        console.log(`[${p.key}] OK (placeholder, no DATA)`);
        continue;
      }

      const html2 = bodyEl.innerHTML;
      if (hasBadText(html2)) { fail(`[${p.key}] rendered HTML contains undefined/NaN`); continue; }

      const sv = [...doc.querySelectorAll('.sumrow .sv')];
      if (sv.length !== 3) { fail(`[${p.key}] expected 3 summary tiles, got ${sv.length}`); continue; }
      if (sv.some((el) => !el.textContent.trim())) fail(`[${p.key}] a summary tile is empty`);

      const items = doc.querySelectorAll('.items .item');
      if (items.length === 0) fail(`[${p.key}] no .item rows rendered`);

      const srcRow = doc.querySelector('.src-wrap .src-row');
      if (!srcRow || !srcRow.textContent.trim()) fail(`[${p.key}] missing source row text`);

      const planTabs = doc.querySelectorAll('.plan-tab').length;
      if (p.dual && planTabs !== 2) fail(`[${p.key}] expected 2 plan-tabs (dual plan), got ${planTabs}`);
      if (!p.dual && planTabs !== 0) fail(`[${p.key}] expected no plan-tabs (single plan), got ${planTabs}`);

      const sellCard = doc.getElementById('sellCard');
      if (!sellCard) fail(`[${p.key}] missing #sellCard (selling points)`);
      else if (doc.querySelectorAll('.sell-pt').length === 0) fail(`[${p.key}] sell-card has no sell-pt entries`);

      console.log(`[${p.key}] OK items=${items.length} planTabs=${planTabs}`);
    } catch (e) {
      fail(`[${p.key}] threw: ${e.message}`);
    }
  }

  // ── 3. 듀얼플랜(12/36) 전환: aircon / dish / dresser ──
  for (const key of ['aircon', 'dish', 'dresser']) {
    try {
      window.switchToCare(key);
      const tab36 = [...doc.querySelectorAll('.plan-tab')].find((el) => el.dataset.plan === '36');
      if (!tab36) { fail(`[${key}] plan-tab 36 not found`); continue; }
      tab36.dispatchEvent(new window.Event('click', { bubbles: true }));
      const vtabs36 = doc.querySelectorAll('.vtab');
      if (vtabs36.length !== 2) fail(`[${key}] plan36: expected 2 vtabs, got ${vtabs36.length}`);
      if (doc.querySelectorAll('.items .item').length === 0) fail(`[${key}] plan36: no items rendered`);
      if (hasBadText(bodyEl.innerHTML)) fail(`[${key}] plan36 render contains undefined/NaN`);

      const tab12 = [...doc.querySelectorAll('.plan-tab')].find((el) => el.dataset.plan === '12');
      tab12.dispatchEvent(new window.Event('click', { bubbles: true }));
      if (doc.querySelectorAll('.items .item').length === 0) fail(`[${key}] plan12: no items rendered after switching back`);
      console.log(`[${key}] OK plan12<->plan36 toggle`);
    } catch (e) {
      fail(`[${key}] plan toggle threw: ${e.message}`);
    }
  }

  // ── 4. A/B 타입 전환 (aircon 전용) ──
  try {
    window.switchToCare('aircon'); // curPlan resets to '12'
    const typeTabs = doc.querySelectorAll('.type-tab');
    if (typeTabs.length !== 2) fail(`[aircon] expected 2 type-tabs, got ${typeTabs.length}`);
    const tabB = [...typeTabs].find((el) => el.dataset.type === 'B');
    tabB.dispatchEvent(new window.Event('click', { bubbles: true }));
    const hdText = doc.querySelector('.card-hd .chd-t')?.textContent || '';
    if (!hdText.includes('B타입')) fail(`[aircon] after B타입 click, card header = "${hdText}"`);
    const tabA = [...doc.querySelectorAll('.type-tab')].find((el) => el.dataset.type === 'A');
    tabA.dispatchEvent(new window.Event('click', { bubbles: true }));
    const hdText2 = doc.querySelector('.card-hd .chd-t')?.textContent || '';
    if (!hdText2.includes('A타입')) fail(`[aircon] after A타입 click, card header = "${hdText2}"`);
    console.log('OK: aircon A타입<->B타입 toggle');
  } catch (e) {
    fail('aircon type-tab toggle threw: ' + e.message);
  }

  // ── 5. 회차(vtab) 순회 — dish plan12 (6회차) ──
  try {
    window.switchToCare('dish'); // curPlan defaults to '12', rounds-based
    const vtabs = doc.querySelectorAll('.vtab');
    if (vtabs.length !== 6) fail(`[dish] expected 6 rounds, got ${vtabs.length}`);
    for (let i = 0; i < vtabs.length; i++) {
      const el = doc.querySelectorAll('.vtab')[i];
      el.dispatchEvent(new window.Event('click', { bubbles: true }));
      const itemCount = doc.querySelectorAll('.items .item').length;
      if (itemCount === 0) fail(`[dish] round ${i} rendered 0 items`);
      if (hasBadText(bodyEl.innerHTML)) fail(`[dish] round ${i} contains undefined/NaN`);
    }
    console.log('OK: dish 6-round vtab cycle');
  } catch (e) {
    fail('dish round cycle threw: ' + e.message);
  }

  // ── 6. 모드 전환: bluepass (첫 화면) ──
  /*
   * 블루패스는 앱을 열면 가장 먼저 보이는 화면이고, 여기 적힌 조건이 빠지면
   * 상담사가 조건 없이 말하게 되어 그대로 고객 분쟁이 된다. 그래서 문구를
   * 골든값으로 박아 회귀를 막는다 — test-as.mjs 가 "확인 필요"를 지키는 것과 같다.
   */
  try {
    window.setMode('bluepass');
    const pane = doc.getElementById('bluepassPane');
    if (pane.style.display === 'none') fail('bluepass mode: bluepassPane should be visible');
    if (doc.getElementById('body').style.display !== 'none') fail('bluepass mode: care body should be hidden');
    if (doc.querySelector('.cat-wrap').style.display !== 'none') fail('bluepass mode: cat-wrap should be hidden');
    if (doc.getElementById('overviewPane').style.display !== 'none') fail('bluepass mode: overviewPane should be hidden');
    if (doc.getElementById('timelinePane').style.display !== 'none') fail('bluepass mode: timelinePane should be hidden');

    // 앱을 열었을 때 기본이 블루패스여야 한다 — 탭 순서가 곧 상담 순서다
    const firstTab = doc.querySelector('.mode-tab');
    if (firstTab.dataset.mode !== 'bluepass') fail(`bluepass should be the first tab, got '${firstTab.dataset.mode}'`);
    const tabOrder = [...doc.querySelectorAll('.mode-tab')].map((t) => t.dataset.mode).join(',');
    if (tabOrder !== 'bluepass,overview,care,timeline') fail(`tab order should be bluepass,overview,care,timeline — got '${tabOrder}'`);

    const html = pane.innerHTML;
    if (hasBadText(html)) fail('bluepass pane contains undefined/NaN');

    // 6가지 + 에어컨 전용 2가지 = 8장
    const tiles = pane.querySelectorAll('.bp-i').length;
    if (tiles !== 8) fail(`bluepass: expected 8 tiles (6 + aircon 2), got ${tiles}`);
    if (!/모두 <b>6가지<\/b>/.test(html)) fail('bluepass: 개수 문장(6가지)이 데이터와 어긋난다');
    if (!/에어컨은 <b>2가지<\/b>/.test(html)) fail('bluepass: 에어컨 개수 문장(2가지)이 데이터와 어긋난다');

    // 조건이 라벨로 갈려 화면에 실제로 나오는지 — 뭉쳐 두면 상담 중에 안 읽힌다
    for (const label of ['대상', '필요', '제외', '비용']) {
      if (!pane.querySelector(`.bp-cl`)) fail('bluepass: 조건 라벨이 하나도 렌더되지 않았다');
      if (!html.includes(`>${label}</span>`)) fail(`bluepass: 조건 라벨 '${label}' 이 화면에 없다`);
    }

    // 빠지면 분쟁이 되는 조건 문구 — 원문 그대로 남아 있어야 한다
    const MUST = [
      '하절기(6~9월)는 운영 제외',            // A/S 패스트트랙을 무제한으로 말하면 안 된다
      'SmartThings 앱 설치 후 제품 연결 필요', // 앱 없이는 사전케어가 동작하지 않는다
      '유상 옵션 — 추가 비용이 발생합니다',    // 오늘보장 설치는 무료가 아니다
      '삼성전자 제품에 한함',                  // 하나 더 서비스는 타사 제품 불가
      'AI 올인원 2.0 구독 고객에게만 제공됩니다', // 스마트 요금제는 블루패스가 없다
    ];
    for (const s of MUST) {
      if (!html.includes(s)) fail(`bluepass: 조건 문구가 사라졌다 — '${s}'`);
    }
    /*
     * curCat 은 'aircon' 으로 **초기화돼 있다**. 그걸 "사용자가 골랐다"로 읽으면
     * 앱을 열자마자 첫 화면이 고른 적 없는 에어컨을 "이 제품"이라고 부른다.
     * 고르기 전 → 일반 문구 / 고른 뒤 → "이 제품에는".
     */
    if (html.includes('이 제품에는')) fail('bluepass: 품목을 고르기 전인데 "이 제품에는" 이라고 말한다');
    if (!html.includes('에어컨에만')) fail('bluepass: 고르기 전에는 "에어컨에만 두 가지가 더 붙습니다" 여야 한다');

    window.switchToCare('aircon');
    window.setMode('bluepass');
    const picked = doc.getElementById('bluepassPane').innerHTML;
    if (!picked.includes('이 제품에는')) fail('bluepass: 에어컨을 고른 뒤에는 "이 제품에는" 이어야 한다');
    console.log('OK: bluepass mode (첫 탭, 8 tiles, 조건 라벨 4종, 골든 문구 5건, 고르기 전/후 문구)');
  } catch (e) {
    fail('bluepass mode threw: ' + e.message);
  }

  // ── 7. 모드 전환: overview ──
  try {
    window.setMode('overview');
    if (doc.getElementById('overviewPane').style.display === 'none') fail('overview mode: overviewPane should be visible');
    if (doc.getElementById('body').style.display !== 'none') fail('overview mode: care body should be hidden');
    if (doc.querySelector('.cat-wrap').style.display !== 'none') fail('overview mode: cat-wrap should be hidden');
    const cards = doc.querySelectorAll('.ov-card');
    if (cards.length !== ALL_PRODUCTS.length) fail(`overview: expected ${ALL_PRODUCTS.length} ov-cards, got ${cards.length}`);
    const naCards = doc.querySelectorAll('.ov-card.na-card').length;
    const expectedNa = ALL_PRODUCTS.filter((p) => !DONE_KEYS.includes(p.key)).length;
    if (naCards !== expectedNa) fail(`overview: expected ${expectedNa} na-cards, got ${naCards}`);

    // overview 카드 클릭 → switchToCare 경유해 care 모드로 복귀
    const fridgeCard = [...cards].find((c) => c.querySelector('.ov-nm')?.textContent === '냉장고');
    fridgeCard.dispatchEvent(new window.Event('click', { bubbles: true }));
    if (doc.getElementById('selNm').textContent !== '냉장고') fail('overview card click did not switch to 냉장고');
    if (doc.getElementById('body').style.display === 'none') fail('overview card click should return to care mode (body visible)');
    console.log('OK: overview mode (16 cards, na pills correct, card click -> care)');
  } catch (e) {
    fail('overview mode threw: ' + e.message);
  }

  // ── 8. 모드 전환: timeline ──
  try {
    window.setMode('timeline');
    if (doc.getElementById('timelinePane').style.display === 'none') fail('timeline mode: timelinePane should be visible');
    // 자가관리 제품(인덕션·전자레인지·사운드바)은 방문 케어가 아니라 타임라인 목록에서 빠진다
    const prodOpts = doc.querySelectorAll('.tl-sel')[0].querySelectorAll('option');
    const TL_KEYS = DONE_KEYS.filter((k) => (window.eval(`(DATA['${k}']||{}).contract`) !== '자가관리'));
    if (prodOpts.length !== TL_KEYS.length) fail(`timeline: expected ${TL_KEYS.length} product options, got ${prodOpts.length}`);
    const circles = (doc.getElementById('timelinePane').innerHTML.match(/<circle/g) || []).length;
    /*
     * 에어컨 12개월형은 **6회**다 — A타입 기본점검·케어 4회(12·24·48·60개월) +
     * B타입 기본 세척 2회(36·72개월). 예전에는 화면이 A타입만 그려 4회로 보였고
     * 이 검사도 4를 기대해 그 상태를 정상으로 굳혀 두고 있었다. total12 는 줄곧
     * "총 6회"라고 말하고 있었으므로 화면이 안내와 어긋나 있던 것이다.
     */
    if (circles !== 6) fail(`timeline: 에어컨 12개월형은 6회여야 하는데 ${circles}회 (A타입 4회 + B타입 2회)`);
    const kinds = [...doc.querySelectorAll('#timelinePane .tl-kind')].map((e) => e.textContent);
    if (kinds.filter((x) => /세척/.test(x)).length !== 2) fail(`timeline: 에어컨 12개월형에 B타입(기본 세척) 2회가 안 보인다 — ${kinds.join(',')}`);

    /*
     * 36개월 전용 제품으로 넘어가면 **플랜이 36으로 보정돼야 한다.**
     * 예전에는 tlPlan 이 '12' 로 남아 죽은 TL_MONTHS[dryer][12] 가 그려져 6회로 보였다
     * (2026-08-11 사용자 보고 — AI콤보에서 같은 증상). 건조기는 onlyPlan:'36' 이라
     * 12개월형이 없으므로 회차는 2회(36·72개월차)여야 한다.
     */
    const prodSel = doc.querySelectorAll('.tl-sel')[0];
    prodSel.value = 'dryer';
    prodSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    const circlesDryer = (doc.getElementById('timelinePane').innerHTML.match(/<circle/g) || []).length;
    if (circlesDryer !== 2) fail(`timeline: dryer 는 36개월 전용이라 2회여야 하는데 ${circlesDryer}회`);
    const planOpts = [...doc.querySelectorAll('.tl-sel')[1].querySelectorAll('option')].map((o) => o.value);
    if (planOpts.length !== 1 || planOpts[0] !== '36') fail(`timeline: dryer 플랜 선택지는 36 하나여야 하는데 ${planOpts.join(',')}`);

    // 36개월 전용 제품에서도 회차는 그대로 2회
    const planSel = doc.querySelectorAll('.tl-sel')[1];
    planSel.value = '36';
    planSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    const circlesDryer36 = (doc.getElementById('timelinePane').innerHTML.match(/<circle/g) || []).length;
    if (circlesDryer36 !== 2) fail(`timeline: dryer/36개월형 expected 2 round circles, got ${circlesDryer36}`); // [36,72]

    // 사용자가 신고한 그 조합 — AI콤보 36개월형은 2회여야 한다
    prodSel.value = 'aicombo';
    prodSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    const circlesCombo = (doc.getElementById('timelinePane').innerHTML.match(/<circle/g) || []).length;
    if (circlesCombo !== 2) fail(`timeline: AI콤보 36개월형은 2회여야 하는데 ${circlesCombo}회 (구독 6년 ÷ 36개월)`);

    console.log('OK: timeline mode (default circles, product/plan select switching)');
  } catch (e) {
    fail('timeline mode threw: ' + e.message);
  }

  // ── 9. care 모드 복귀 확인 ──
  try {
    window.setMode('care');
    if (doc.getElementById('body').style.display === 'none') fail('setMode(care) should show body');
    if (doc.getElementById('bluepassPane').style.display !== 'none') fail('setMode(care) should hide bluepassPane');
    if (doc.getElementById('overviewPane').style.display !== 'none') fail('setMode(care) should hide overviewPane');
    if (doc.getElementById('timelinePane').style.display !== 'none') fail('setMode(care) should hide timelinePane');
    console.log('OK: setMode back to care');
  } catch (e) {
    fail('setMode(care) threw: ' + e.message);
  }

  // ── 10. 셀링포인트 토글 (toggleSell) ──
  try {
    window.switchToCare('aircon');
    const sellBody = doc.getElementById('sellBody');
    const sellArr = doc.getElementById('sellArr');
    const before = sellBody.style.display;
    window.toggleSell();
    const after1 = sellBody.style.display;
    if (after1 === before) fail(`toggleSell: display did not change (before=${before} after=${after1})`);
    const isOpenNow = sellArr.classList.contains('open');
    if ((after1 === 'block') !== isOpenNow) fail('toggleSell: sellArr open class inconsistent with body display');
    window.toggleSell();
    const after2 = sellBody.style.display;
    if (after2 === after1) fail('toggleSell: second toggle should flip display back');
    console.log(`OK: toggleSell (${before} -> ${after1} -> ${after2})`);
  } catch (e) {
    fail('toggleSell threw: ' + e.message);
  }
  /*
   * 타임라인 회차 정합성 — **DATA 하나만 보고 검사한다.**
   *
   * 예전에는 TL_MONTHS 라는 방문시점 표를 DATA 와 따로 들고 있었는데, 둘이 갈라져
   * 다섯 곳이 어긋난 채 배포돼 있었다(2026-08-11, 사용자가 "AI콤보 36개월형이 6회로
   * 나온다"고 알려 줘서 드러났다). 표를 없애고 careSchedule() 이 DATA 에서 직접
   * 만들게 했으므로, 이제 볼 것은 "그 일정이 계약과 맞는가"다.
   *
   * 규칙: **계약기간 ÷ 주기**. 72개월 계약이면 12개월형 6회·36개월형 2회다.
   * **계약기간을 72로 못박지 말 것** — 로봇청소기는 60개월(5년형)이라 12개월형이 5회이고,
   * 처음에 72로 적었다가 멀쩡한 데이터를 오류로 잡았다. contract 문구에서 읽는다.
   * 회차는 오름차순이고 계약기간을 넘지 않는다. total 문구("총 6회")가 있으면 그 수와도
   * 맞아야 하고, 모든 회차에 케어 종류가 있어야 한다(무엇이 나가는지 못 적으면 상담에 못 쓴다).
   * 자가관리 제품은 방문 케어가 아니라 대상이 아니다.
   */
  try {
    const DATA = JSON.parse(window.eval('JSON.stringify(DATA)'));
    let n = 0;
    for (const [k, d] of Object.entries(DATA)) {
      if (d.contract === '자가관리') continue;
      for (const pl of ['12', '36']) {
        if (!d['plan' + pl]) continue;
        const sched = JSON.parse(window.eval(`JSON.stringify(careSchedule(DATA['${k}'],'${pl}'))`));
        if (!sched.length) { fail(`[${k}] plan${pl} 에서 회차 일정을 못 만들었다 — 타임라인이 비어 보인다`); continue; }
        const months = sched.map((x) => x.month);
        const cm = String(d.contract || '').match(/(\d+)\s*개월/);
        if (!cm) { fail(`[${k}] contract 에서 계약기간을 못 읽는다 — "${d.contract}"`); continue; }
        const contractM = +cm[1];
        const expect = Math.floor(contractM / +pl);
        if (months.some((m, i) => i && m <= months[i - 1])) fail(`[${k}] plan${pl} 회차가 오름차순이 아니다 — ${months.join(',')}`);
        else if (months[months.length - 1] > contractM) fail(`[${k}] plan${pl} 마지막 회차 ${months[months.length - 1]}개월 — 계약 ${contractM}개월을 넘는다`);
        else if (months.length !== expect) fail(`[${k}] plan${pl} 은 ${months.length}회 — 계약 ${contractM}개월 ÷ ${pl}개월이면 ${expect}회여야 한다 (${months.join(',')})`);
        else {
          const label = d['total' + pl];
          const said = label && String(label).match(/(\d+)\s*회/);
          if (said && +said[1] !== months.length) fail(`[${k}] plan${pl} 안내는 "${label}" 인데 일정은 ${months.length}회`);
          else if (sched.some((x) => !x.kind)) fail(`[${k}] plan${pl} 에 케어 종류가 없는 회차가 있다 — 무엇이 나가는지 못 적는다`);
          else n++;
        }
      }
    }
    if (ok) console.log(`OK: 타임라인 회차 정합성 ${n}개 플랜 (계약 ÷ 주기 · 오름차순 · total 문구 · 케어 종류)`);
  } catch (e) {
    fail('타임라인 정합성 검사 실패: ' + e.message);
  }

  /* ── 공유 카드는 보고 있는 탭을 따라가야 한다 ──
   *
   * 2026-08-11 사용자 지적: 블루패스·전체보기를 보면서 공유를 누르면 화면에 없는
   * '에어컨 회차표'가 나갔다(네 탭 전부에서 재현). 고객에게 보내는 물건이 화면과
   * 다른 것은 이 도구에서 가장 위험한 고장이라, 탭마다 제 내용이 나오는지 검사한다.
   */
  try {
    const want = {
      care:     { title: '에어컨',              first: '구독 조건' },
      bluepass: { title: '블루패스',            first: '블루패스 혜택' },
      overview: { title: '구독 케어 전체보기',  first: null },
      timeline: { title: null /* tlKey 가 가리키는 제품 — 앞 검사에서 바뀌어 있을 수 있다 */, first: '구독 조건' },
    };
    let n = 0;
    for (const [mode, exp] of Object.entries(want)) {
      window.setMode(mode);
      await wait(30);
      const o = window.careShareBuild();
      if (!o) { fail(`[공유] ${mode} 탭에서 카드가 만들어지지 않는다`); continue; }
      /* DATA·tlKey 는 const/let 이라 window 에 없다 — 타임라인은 제목을 못 박지 않고
         "회차표가 나오는가"만 본다(어느 제품인지는 앞 검사가 바꿔 놓을 수 있다). */
      const wantTitle = exp.title;
      if (wantTitle !== null && o.title !== wantTitle) {
        fail(`[공유] ${mode} 탭인데 카드 제목이 "${o.title}" — "${wantTitle}" 이어야 한다`);
        continue;
      }
      const first = o.sections && o.sections[0] && o.sections[0].h;
      if (wantTitle === null && !o.title) { fail(`[공유] ${mode} 탭 카드에 제목이 없다`); continue; }
      if (exp.first && first !== exp.first) {
        fail(`[공유] ${mode} 탭 카드의 첫 섹션이 "${first}" — "${exp.first}" 이어야 한다`);
        continue;
      }
      n++;
    }
    if (n === 4) console.log('OK: 공유 카드가 보고 있는 탭을 따라간다 (케어·블루패스·전체보기·타임라인)');

    // 블루패스 카드가 화면의 혜택을 실제로 담고 있는가 — 빈 껍데기를 내보내지 않는다
    window.setMode('bluepass');
    await wait(30);
    const bp = window.careShareBuild();
    const bpRows = (bp.sections || []).reduce((a, s) => a.concat((s.rows || []).map((r) => r[0])), []);
    /* 화면(#bluepassPane)에 뜬 혜택 제목이 카드에도 다 있는가 — 빈 껍데기를 내보내지 않는다 */
    const onScreen = [...window.document.querySelectorAll('#bluepassPane .bp-t, #bluepassPane h3, #bluepassPane .bp-nm')]
      /* 화면 제목 앞에는 순번 배지("1A/S 패스트트랙")가 붙는다 — 떼고 비교한다 */
      .map((e) => e.textContent.trim().replace(/^\d+/, '')).filter(Boolean);
    const missing = onScreen.filter((t) => !bpRows.includes(t));
    if (bpRows.length < 6) fail(`[공유] 블루패스 카드가 ${bpRows.length}줄뿐 — 혜택이 빠졌다`);
    else if (onScreen.length && missing.length) fail(`[공유] 화면에 있는 혜택이 카드에 없다: ${missing.join(', ')}`);
    else console.log(`OK: 블루패스 공유 카드에 혜택 ${bpRows.length}개 포함${onScreen.length ? ` (화면 ${onScreen.length}개 전부 대조)` : ''}`);

    window.setMode('care');
  } catch (e) {
    fail('공유 카드 탭 대응 검사 실패: ' + e.message);
  }

  console.log(ok ? 'ALL PASS' : 'SOME FAILED');
  process.exit(ok ? 0 : 1);
})();
