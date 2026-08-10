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
    if (circles !== 4) fail(`timeline: default aircon/12개월형 expected 4 round circles, got ${circles}`); // TL_MONTHS.aircon[12] = [12,24,48,60]

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
   * 타임라인 회차 정합성 — TL_MONTHS 는 DATA 의 rounds 와 반드시 같아야 한다.
   *
   * 이 검사가 없어서 다섯 곳이 어긋난 채로 배포돼 있었다(2026-08-11). 화면은 조용히
   * 틀린 회차를 그렸고 사용자가 "AI콤보 36개월형이 6회로 나온다"고 알려 준 뒤에야 드러났다.
   * DATA 는 손으로 다듬는 자료라 앞으로도 회차가 바뀔 텐데, 그때 TL_MONTHS 를 같이
   * 안 고치면 같은 사고가 난다.
   *
   * 에어컨 12 만 예외다 — rounds 가 비어 있어 대조할 근거가 없다(별도 확인 대상).
   */
  try {
    const DATA = window.eval('JSON.stringify(DATA)') && JSON.parse(window.eval('JSON.stringify(DATA)'));
    const TL = JSON.parse(window.eval('JSON.stringify(TL_MONTHS)'));
    const EXEMPT = new Set(['aircon:12']);   // rounds 가 비어 있어 대조 불가
    let n = 0;
    for (const [k, d] of Object.entries(DATA)) {
      // 자가관리 제품은 방문 케어가 아니다 — rounds 가 "사용 후 매회 / 연 1회 권장" 같은
      // 관리 안내라 개월수로 대조할 대상이 아니고, 타임라인 목록에서도 빠진다.
      if (d.contract === '자가관리') continue;
      for (const pl of ['12', '36']) {
        if (EXEMPT.has(`${k}:${pl}`)) continue;
        const plan = d['plan' + pl];
        const months = (TL[k] || {})[pl];
        if (!plan && months) { fail(`[${k}] plan${pl} 이 없는데 TL_MONTHS 에 ${months.length}회가 남아 있다 — 플랜을 바꿔도 이 회차가 그려진다`); continue; }
        if (!plan) continue;
        const rounds = (plan.rounds || []).length;
        if (!rounds) continue;                       // 내용이 아직 안 채워진 플랜
        if (!months) { fail(`[${k}] plan${pl} 은 ${rounds}회인데 TL_MONTHS 에 없다 — 타임라인이 비어 보인다`); continue; }
        if (months.length !== rounds) { fail(`[${k}] plan${pl} rounds ${rounds}회 ≠ 타임라인 ${months.length}회`); continue; }
        // 회차 문구의 개월수와 타임라인 값이 같아야 한다 ("36개월차 (3년차)" → 36)
        const fromRounds = plan.rounds.map((r) => parseInt(String(r.month).replace(/[^0-9]/, '') , 10));
        const mism = fromRounds.map((m, i) => (m === months[i] ? null : `${i + 1}회차 ${m} vs ${months[i]}`)).filter(Boolean);
        if (mism.length) fail(`[${k}] plan${pl} 개월이 어긋남 — ${mism.join(', ')}`);
        else n++;
      }
    }
    if (ok) console.log(`OK: 타임라인 회차 정합성 ${n}개 플랜 (rounds ↔ TL_MONTHS 개월까지 일치)`);
  } catch (e) {
    fail('타임라인 정합성 검사 실패: ' + e.message);
  }

  console.log(ok ? 'ALL PASS' : 'SOME FAILED');
  process.exit(ok ? 0 : 1);
})();
