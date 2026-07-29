// AI Care 검색기(public/care-app.html) 회귀 테스트
// 실행: node scripts/test-care.mjs
// PRODUCTS 배열 순서/구성이 바뀌면 아래 ALL_PRODUCTS를 함께 갱신할 것.

import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '..', 'public', 'care-app.html');
const html = fs.readFileSync(htmlPath, 'utf8');

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
  { key: 'kimchi',           name: '김치냉장고',           hasData: true,  onlyPlan: '36', dual: false },
  { key: 'induction',        name: '인덕션/전기레인지',    hasData: true,  onlyPlan: '36', dual: false },
  { key: 'microwave',        name: '전자레인지/오븐',      hasData: true,  onlyPlan: '36', dual: false },
  { key: 'soundbar',         name: '사운드바',             hasData: true,  onlyPlan: '36', dual: false },
];

// 타임라인 모드에 노출되는(=st:'done') 제품 키. TL_MONTHS(care-app.html)에 정의된 키와 일치해야 함.
const DONE_KEYS = ['aircon','aicombo','washer','dryer','fridge','dish','dresser','airpur_reusable','airpur_s','purifier_under','vacuum','kimchi'];

(async () => {
  await wait(200);
  const doc = window.document;
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

  // ── 6. 모드 전환: overview ──
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

  // ── 7. 모드 전환: timeline ──
  try {
    window.setMode('timeline');
    if (doc.getElementById('timelinePane').style.display === 'none') fail('timeline mode: timelinePane should be visible');
    const prodOpts = doc.querySelectorAll('.tl-sel')[0].querySelectorAll('option');
    if (prodOpts.length !== DONE_KEYS.length) fail(`timeline: expected ${DONE_KEYS.length} product options, got ${prodOpts.length}`);
    const circles = (doc.getElementById('timelinePane').innerHTML.match(/<circle/g) || []).length;
    if (circles !== 4) fail(`timeline: default aircon/12개월형 expected 4 round circles, got ${circles}`); // TL_MONTHS.aircon[12] = [12,24,48,60]

    // 제품 select 변경 시뮬레이션 (dryer로 전환) — inline onchange 핸들러 검증
    const prodSel = doc.querySelectorAll('.tl-sel')[0];
    prodSel.value = 'dryer';
    prodSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    const circlesDryer = (doc.getElementById('timelinePane').innerHTML.match(/<circle/g) || []).length;
    if (circlesDryer !== 6) fail(`timeline: dryer/12개월형 expected 6 round circles, got ${circlesDryer}`); // [12,24,36,48,60,72]

    // 플랜 select를 36개월형으로 전환
    const planSel = doc.querySelectorAll('.tl-sel')[1];
    planSel.value = '36';
    planSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    const circlesDryer36 = (doc.getElementById('timelinePane').innerHTML.match(/<circle/g) || []).length;
    if (circlesDryer36 !== 2) fail(`timeline: dryer/36개월형 expected 2 round circles, got ${circlesDryer36}`); // [36,72]

    console.log('OK: timeline mode (default circles, product/plan select switching)');
  } catch (e) {
    fail('timeline mode threw: ' + e.message);
  }

  // ── 8. care 모드 복귀 확인 ──
  try {
    window.setMode('care');
    if (doc.getElementById('body').style.display === 'none') fail('setMode(care) should show body');
    if (doc.getElementById('overviewPane').style.display !== 'none') fail('setMode(care) should hide overviewPane');
    if (doc.getElementById('timelinePane').style.display !== 'none') fail('setMode(care) should hide timelinePane');
    console.log('OK: setMode back to care');
  } catch (e) {
    fail('setMode(care) threw: ' + e.message);
  }

  // ── 9. 셀링포인트 토글 (toggleSell) ──
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

  console.log(ok ? 'ALL PASS' : 'SOME FAILED');
  process.exit(ok ? 0 : 1);
})();
