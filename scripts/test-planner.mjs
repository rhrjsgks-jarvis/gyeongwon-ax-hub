// 패키지 플래너(public/package-planner.html) 회귀 테스트
// 실행: node scripts/test-planner.mjs
//
// package-planner.html의 CATEGORIES/DB/PYEONG_RULES 등은 top-level const/let이라
// window 전역에 직접 노출되지 않지만, selectMode/selectPyeong/toggleCat/updateDiscount/
// recommend/switchTier/resetAll/getThreeTiers/getCatBudget/discPrice 등은 top-level
// function 선언이라 classic <script>에서 window.xxx로 노출되며, 클로저를 통해
// CATEGORIES/DB/state 등 module-scope 변수를 그대로 참조한다. 따라서 내부 계산 함수를
// 직접 호출해 DB 무결성/가격 계산을 검증할 수 있다.
//
// 새 카테고리를 추가/삭제하면 아래 ALL_CATS / STEP_CATS를 함께 갱신할 것 — 안 하면
// 테스트가 실패하거나 새 카테고리가 커버리지에서 누락된다.

import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '..', 'public', 'package-planner.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.com/' });
const { window } = dom;
window.alert = () => {};
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = () => {};
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

// CATEGORIES 배열(HTML 내 정의) 순서 그대로 — 카테고리 추가/삭제 시 함께 갱신
const ALL_CATS = [
  'fridge', 'washer', 'dryer', 'tv', 'aircon', 'dishwasher', 'airdresser',
  'robot', 'vacuum', 'kimchi', 'induction', 'airpurifier', 'microwave',
  'soundbar', 'laptop', 'tablet', 'phone', 'wearable',
];
// step:true 카테고리 (아파트 평형 선택 시 자동 선택되는 필수 품목)
const STEP_CATS = ['fridge', 'washer', 'tv', 'aircon'];
const PYEONGS = [20, 25, 33, 40, 50];

function numFrom(text) {
  return parseInt(String(text).replace(/[^0-9-]/g, ''), 10);
}

(async () => {
  await wait(200);
  const doc = window.document;
  let ok = true;
  function fail(msg) { console.log('ERROR:', msg); ok = false; }

  // ── 0. 초기 렌더 ──
  if (doc.getElementById('sec-mode').classList.contains('hidden')) fail('초기 상태: sec-mode가 보여야 함');
  ['sec-apt', 'sec-cat', 'sec-budget', 'sec-result'].forEach((id) => {
    if (!doc.getElementById(id).classList.contains('hidden')) fail(`초기 상태: ${id}는 숨겨져 있어야 함`);
  });
  console.log('OK: 초기 렌더 — sec-mode만 노출, 나머지 섹션 hidden');

  // ── 1. getThreeTiers — DB 전 카테고리 순회 (누락 카테고리 검증) ──
  for (const catId of ALL_CATS) {
    try {
      const tiers = window.getThreeTiers(catId);
      if (!tiers) { fail(`[${catId}] getThreeTiers가 null 반환 — DB에서 누락된 카테고리`); continue; }
      const { premium, recommended, budget, flagship, cands } = tiers;
      if (!premium || !recommended || !budget) { fail(`[${catId}] premium/recommended/budget 중 누락`); continue; }
      if (!flagship) { fail(`[${catId}] flagship 정의 누락`); }
      if (!cands || cands.length === 0) { fail(`[${catId}] DB 후보 제품이 0개`); }
      [premium, recommended, budget].forEach((p) => {
        if (!p.model || typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price < 0) {
          fail(`[${catId}] 비정상 제품 데이터: ${JSON.stringify(p)}`);
        }
      });
    } catch (e) {
      fail(`[${catId}] getThreeTiers 예외 발생: ${e.message}`);
    }
  }
  console.log(`OK: getThreeTiers — ${ALL_CATS.length}개 카테고리 전체 순회 완료`);

  // ── 2. 모드 선택 — 아파트 패키지 ──
  window.selectMode('apt');
  if (doc.getElementById('sec-apt').classList.contains('hidden')) fail('selectMode(apt) 후 sec-apt가 보여야 함');
  if (!doc.getElementById('btn-apt').classList.contains('active')) fail('btn-apt가 active여야 함');
  if (doc.getElementById('btn-budget').classList.contains('active')) fail('btn-budget는 active가 아니어야 함');
  console.log('OK: selectMode("apt")');

  // ── 3. 평형 선택 — 대표값 5종 전체 순회 ──
  for (const p of PYEONGS) {
    window.selectPyeong(p);
    const note = doc.getElementById('pyeong-rec-note');
    if (note.classList.contains('hidden')) fail(`[${p}평] pyeong-rec-note가 보여야 함`);
    if (doc.getElementById('sec-cat').classList.contains('hidden')) fail(`[${p}평] sec-cat이 보여야 함`);
    if (doc.getElementById('sec-budget').classList.contains('hidden')) fail(`[${p}평] sec-budget이 보여야 함`);

    const items = doc.querySelectorAll('#cat-grid .cat-item');
    if (items.length !== ALL_CATS.length) {
      fail(`[${p}평] cat-grid 항목 수 ${items.length}개, 예상 ${ALL_CATS.length}개`);
    }
    const selectedItems = doc.querySelectorAll('#cat-grid .cat-item.selected');
    if (selectedItems.length !== STEP_CATS.length) {
      fail(`[${p}평] 기본 선택 항목 수 ${selectedItems.length}개, 예상 ${STEP_CATS.length}개(${STEP_CATS.join(',')})`);
    }
    STEP_CATS.forEach((id) => {
      if (!doc.getElementById('cat-' + id).classList.contains('selected')) {
        fail(`[${p}평] ${id}는 자동 선택되어야 함`);
      }
    });
    console.log(`OK: [${p}평] pyeong-rec-note 표시, cat-grid ${items.length}개, 기본선택 ${selectedItems.length}개`);
  }

  // ── 4. toggleCat — 전 카테고리 on/off 반영 검증 (마지막 순회한 33평 상태 기준 유지) ──
  window.selectPyeong(33);
  for (const id of ALL_CATS) {
    const el = doc.getElementById('cat-' + id);
    if (!el.classList.contains('selected')) window.toggleCat(id);
    if (!el.classList.contains('selected')) fail(`toggleCat(${id}) 선택 실패`);
  }
  for (const id of ALL_CATS) {
    window.toggleCat(id); // off
    if (doc.getElementById('cat-' + id).classList.contains('selected')) fail(`toggleCat(${id}) 해제 실패`);
    window.toggleCat(id); // on
    if (!doc.getElementById('cat-' + id).classList.contains('selected')) fail(`toggleCat(${id}) 재선택 실패`);
  }
  console.log(`OK: toggleCat — ${ALL_CATS.length}개 카테고리 전체 on/off 정상, 현재 전체 선택 상태`);

  // ── 5. 할인율 슬라이더 + 예산 + recommend() 전 카테고리 렌더 검증 ──
  doc.getElementById('discount-slider').value = 15;
  window.updateDiscount();
  if (doc.getElementById('discount-val').textContent !== '15%') fail('discount-val이 15%를 표시해야 함');

  doc.getElementById('budget-input').value = '3000';
  window.recommend();
  if (doc.getElementById('sec-result').classList.contains('hidden')) fail('recommend() 후 sec-result가 보여야 함');

  for (const id of ALL_CATS) {
    for (const idx of [0, 1, 2]) {
      const tab = doc.getElementById(`tab_${id}_${idx}`);
      const tc = doc.getElementById(`tc_${id}_${idx}`);
      if (!tab || !tc) { fail(`[${id}] 티어 ${idx} 탭/컨텐츠 누락`); continue; }
      const priceDiscEl = tc.querySelector('.price-disc');
      if (!priceDiscEl) { fail(`[${id}] 티어 ${idx} price-disc 요소 누락`); continue; }
      const val = numFrom(priceDiscEl.textContent);
      if (!Number.isFinite(val) || val < 0) fail(`[${id}] 티어 ${idx} 할인가 비정상: "${priceDiscEl.textContent}"`);
      const origEl = tc.querySelector('.price-orig');
      if (origEl) {
        const orig = numFrom(origEl.textContent);
        const expected = Math.round(orig * (1 - 15 / 100));
        if (val !== expected) fail(`[${id}] 티어 ${idx} 할인 계산 불일치: got ${val}, expected ${expected} (orig ${orig})`);
      }
    }
  }
  const summaryTotalEl = doc.querySelector('.summary-total');
  if (!summaryTotalEl) fail('summary-total 요소 누락');
  else {
    const totalVal = numFrom(summaryTotalEl.textContent);
    if (!Number.isFinite(totalVal) || totalVal < 0) fail(`summary-total 값 비정상: "${summaryTotalEl.textContent}"`);
  }
  console.log(`OK: recommend() — 전체 ${ALL_CATS.length}개 카테고리 × 3티어 가격 계산 정상, 15% 할인 반영 확인, 요약 총액 정상`);

  // ── 6. switchTier ──
  window.switchTier('fridge', 2);
  if (doc.getElementById('tc_fridge_2').classList.contains('hidden')) fail('switchTier(fridge,2) 후 티어2가 보여야 함');
  if (!doc.getElementById('tc_fridge_0').classList.contains('hidden')) fail('switchTier(fridge,2) 후 티어0은 숨겨져야 함');
  if (!doc.getElementById('tc_fridge_1').classList.contains('hidden')) fail('switchTier(fridge,2) 후 티어1은 숨겨져야 함');
  if (!doc.getElementById('tab_fridge_2').classList.contains('active')) fail('탭2가 active여야 함');
  if (doc.getElementById('tab_fridge_0').classList.contains('active')) fail('탭0은 active가 아니어야 함');
  window.switchTier('fridge', 1);
  console.log('OK: switchTier — 탭 전환 시 티어 컨텐츠 표시/active 클래스 정상 반영');

  // ── 7. 카테고리 해제 → recommend() 결과에서 제외 확인 ──
  window.toggleCat('wearable');
  window.recommend();
  if (doc.getElementById('tc_wearable_1')) fail('wearable 해제 후 recommend() 결과에 남아있으면 안 됨');
  window.toggleCat('wearable'); // 원복
  console.log('OK: toggleCat 해제 시 recommend() 결과에서 즉시 제외됨');

  // ── 8. resetAll() ──
  window.resetAll();
  ['sec-apt', 'sec-cat', 'sec-budget', 'sec-result'].forEach((id) => {
    if (!doc.getElementById(id).classList.contains('hidden')) fail(`resetAll() 후 ${id}는 숨겨져야 함`);
  });
  if (doc.getElementById('btn-apt').classList.contains('active')) fail('resetAll() 후 btn-apt는 active가 아니어야 함');
  if (doc.getElementById('btn-budget').classList.contains('active')) fail('resetAll() 후 btn-budget는 active가 아니어야 함');
  if (doc.getElementById('budget-input').value !== '') fail('resetAll() 후 budget-input이 비어있어야 함');
  if (doc.getElementById('discount-slider').value !== '0') fail('resetAll() 후 discount-slider가 0이어야 함');
  if (doc.getElementById('discount-val').textContent !== '0%') fail('resetAll() 후 discount-val이 0%여야 함');
  console.log('OK: resetAll() — 모든 섹션/입력값/버튼 상태 초기화 확인');

  // ── 9. 금액대별 추천 모드 — 초기 선택 0개, 미선택 시 recommend() no-op ──
  window.selectMode('budget');
  if (doc.getElementById('sec-cat').classList.contains('hidden')) fail('budget 모드: sec-cat이 보여야 함');
  if (doc.getElementById('sec-budget').classList.contains('hidden')) fail('budget 모드: sec-budget이 보여야 함');
  if (!doc.getElementById('sec-apt').classList.contains('hidden')) fail('budget 모드: sec-apt는 계속 숨겨져야 함');
  const preselected = doc.querySelectorAll('#cat-grid .cat-item.selected').length;
  if (preselected !== 0) fail(`budget 모드는 초기 선택 0개여야 함, got ${preselected}`);

  window.recommend();
  if (!doc.getElementById('sec-result').classList.contains('hidden')) {
    fail('카테고리 미선택 상태에서 recommend() 호출 시 sec-result가 보이면 안 됨(alert만 발생해야 함)');
  }
  console.log('OK: budget 모드 — 초기 미선택 상태 확인, 미선택 recommend() 호출 시 안전하게 no-op');

  // ── 10. 극단적 예산(초저예산) — 예산초과 상황에서도 NaN/음수 없는지 ──
  ['fridge', 'tv', 'aircon'].forEach((id) => window.toggleCat(id));
  doc.getElementById('budget-input').value = '10';
  doc.getElementById('discount-slider').value = 0;
  window.updateDiscount();
  window.recommend();
  ['fridge', 'tv', 'aircon'].forEach((id) => {
    const tc = doc.getElementById(`tc_${id}_1`);
    if (!tc) { fail(`[초저예산][${id}] 결과 카드 누락`); return; }
    const priceDiscEl = tc.querySelector('.price-disc');
    const val = numFrom(priceDiscEl.textContent);
    if (!Number.isFinite(val) || val < 0) fail(`[초저예산][${id}] 가격 비정상: "${priceDiscEl.textContent}"`);
  });
  console.log('OK: 극단적 저예산(10만원) — 예산초과 상황에서도 가격 계산 정상(NaN/음수 없음)');

  // ── 11. 무제한 예산(0) + 최대 할인율(30%) — 전 카테고리 재검증 ──
  window.resetAll();
  window.selectMode('budget');
  ALL_CATS.forEach((id) => window.toggleCat(id));
  doc.getElementById('budget-input').value = '0';
  doc.getElementById('discount-slider').value = 30;
  window.updateDiscount();
  window.recommend();
  for (const id of ALL_CATS) {
    for (const idx of [0, 1, 2]) {
      const tc = doc.getElementById(`tc_${id}_${idx}`);
      if (!tc) { fail(`[무제한+30%][${id}] 티어 ${idx} 누락`); continue; }
      const priceDiscEl = tc.querySelector('.price-disc');
      const val = numFrom(priceDiscEl.textContent);
      if (!Number.isFinite(val) || val < 0) fail(`[무제한+30%][${id}] 티어 ${idx} 가격 비정상`);
      const origEl = tc.querySelector('.price-orig');
      if (origEl) {
        const orig = numFrom(origEl.textContent);
        const expected = Math.round(orig * 0.7);
        if (val !== expected) fail(`[무제한+30%][${id}] 티어 ${idx} 할인계산 불일치: got ${val}, expected ${expected}`);
      }
    }
  }
  console.log('OK: 무제한 예산 + 30%(최대) 할인율 — 전체 카테고리 3티어 가격 계산 정상');

  // ── 12. discPrice / getCatBudget 직접 호출 검증 ──
  const dp30 = window.discPrice(1000);
  if (dp30 !== 700) fail(`discPrice(1000) 30% 할인 상태에서 700 예상, got ${dp30}`);
  const catBudgetUnlimited = window.getCatBudget('fridge');
  if (catBudgetUnlimited !== Infinity) fail(`예산 0(무제한) 상태에서 getCatBudget('fridge')는 Infinity여야 함, got ${catBudgetUnlimited}`);

  doc.getElementById('budget-input').value = '2000';
  window.recommend();
  let sumCatBudgets = 0;
  ALL_CATS.forEach((id) => { sumCatBudgets += window.getCatBudget(id); });
  if (!Number.isFinite(sumCatBudgets) || Math.abs(sumCatBudgets - 2000) > ALL_CATS.length) {
    fail(`카테고리별 예산 배분 합계가 총예산(2000)과 크게 어긋남: ${sumCatBudgets}`);
  }
  console.log(`OK: discPrice()/getCatBudget() 직접 호출 — 할인 계산·예산 배분 로직 정상 (배분합계 ${sumCatBudgets}/2000)`);

  console.log(ok ? 'ALL PASS' : 'SOME FAILED');
  process.exit(ok ? 0 : 1);
})();
