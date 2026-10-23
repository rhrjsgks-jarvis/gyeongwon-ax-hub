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
// 2026-08-30 — 콤보·세탁기·건조기·냉장고의 12개월형이 실제로 있는데 onlyPlan:'36' 이
// 감추고 있었다(건조기는 자료까지 이미 있었다). 넷 다 듀얼 플랜으로 바뀌었다.
/*
 * 2026-10-15 — 「12개월형 / 36개월형」이 유형(방문케어 프리미엄·라이트·셀프케어) × 주기로 바뀌었다.
 * `types` 는 삼성닷컴 구독 지면(scripts/fixtures/care-subs.json)에 실제로 있는 유형이다 — 화면 탭과 같아야 한다.
 */
const ALL_PRODUCTS = [
  { key: 'aircon',           name: '에어컨',              hasData: true,  types: ['premium','lite'] },
  { key: 'aicombo',          name: 'AI콤보',               hasData: true,  types: ['premium'] },
  { key: 'washer',           name: '세탁기',               hasData: true,  types: ['premium'] },
  { key: 'dryer',            name: '건조기',               hasData: true,  types: ['premium'] },
  { key: 'fridge',           name: '냉장고',               hasData: true,  types: ['premium','lite'] },
  { key: 'dish',             name: '식기세척기',           hasData: true,  types: ['premium'] },
  { key: 'dresser',          name: '에어드레서',           hasData: true,  types: ['premium','self'] },
  { key: 'airpur_reusable',  name: '공기청정기(리유저블)', hasData: true,  types: ['premium'] },
  { key: 'airpur_s',         name: '공기청정기(S필터)',    hasData: true,  types: ['premium','self'] },
  { key: 'purifier_under',   name: '언더싱크 정수기',      hasData: true,  types: ['premium','self'] },
  /* 2026-08-30 — 한 카드에 묶여 있던 둘을 갈랐다. 카운터탑은 방문케어가 있는데
     얼음정수기와 묶여 통째로 「자가관리」로 떠 있었다(회차표는 아직 못 받아 DATA 없음). */
  { key: 'purifier_counter', name: '카운터탑 정수기', hasData: false, onlyPlan: null, dual: false },
  { key: 'purifier_ice',     name: '얼음정수기',     hasData: false, onlyPlan: null, dual: false },
  { key: 'vacuum',           name: '로봇청소기',           hasData: true,  types: ['premium','self'] },
  { key: 'kimchi',           name: '김치냉장고',           hasData: true,  types: ['premium','lite','self'] },
  { key: 'induction',        name: '인덕션/전기레인지',    hasData: true,  types: ['premium','lite'] },
  /* 2026-10-16 — 가이드 품목 표에 방문케어 프리미엄이 있는 둘을 구독 지면에서 수집해 넣었다 */
  { key: 'sac',              name: '시스템에어컨',         hasData: true,  types: ['premium'] },
  { key: 'dehum',            name: '제습기',               hasData: true,  types: ['premium'] },
  /* 자가관리 안내 — 요금제가 없다(옛 회차 경로를 그대로 탄다) */
  { key: 'microwave',        name: '전자레인지/오븐',      hasData: true,  types: [] },
  { key: 'soundbar',         name: '사운드바',             hasData: true,  types: [] },
  /* 2026-10-16 — 가이드 표상 무상수리서비스만 있는 TV·모니터(회차표 없음 · naNote 로 사실만 적는다) */
  { key: 'tv',               name: 'TV',                   hasData: false, onlyPlan: null, dual: false },
  { key: 'monitor',          name: '모니터',               hasData: false, onlyPlan: null, dual: false },
  /*
   * 모바일 구독 3종 — **회차 구조가 없다**(방문 기사가 없다). `st:'mx'` 라 회차표 경로를
   * 타지 않고 `buildMobileSub` 이 그린다. 개요 화면에서 '자가관리'(na-card)로 표시하면
   * "구독 미대상"이라는 거짓말이 되므로 여기서 따로 센다.
   */
  { key: 'mx_fold8u',        name: '갤럭시 Z 폴드8 울트라', hasData: false, onlyPlan: null, dual: false, mx: true },
  { key: 'mx_fold8',         name: '갤럭시 Z 폴드8',        hasData: false, onlyPlan: null, dual: false, mx: true },
  { key: 'mx_flip8',         name: '갤럭시 Z 플립8',        hasData: false, onlyPlan: null, dual: false, mx: true },
  /* 2026-10-16 원문 대조 — S26 FE 가 구독 대상에 들어왔다 */
  { key: 'mx_s26fe',         name: '갤럭시 S26 FE',         hasData: false, onlyPlan: null, dual: false, mx: true },
  /*
   * PC·태블릿 2종 — **스마트폰과 다른 상품이다**(AI 구독클럽 올인원 2.0).
   * 구독케어(무상수리+파손보상)가 구독에 포함되고 잔존가 보장·민팃 반납이 없다.
   * 셋을 섞으면 상담에서 그대로 틀린 설명이 되므로 아래에서 **서로 섞이지 않는지**도 본다.
   */
  { key: 'ai2_book6',        name: '갤럭시 북6 시리즈',     hasData: false, onlyPlan: null, dual: false, mx: true, ai2: true },
  { key: 'ai2_tabs11',       name: '갤럭시 탭 S10~S12 시리즈', hasData: false, onlyPlan: null, dual: false, mx: true, ai2: true },
];

// 타임라인 모드에 노출되는(=st:'done') 제품 키. TL_MONTHS(care-app.html)에 정의된 키와 일치해야 함.
/* 2026-08-30 — 인덕션이 들어왔다. 삼성닷컴이 방문케어를 파는데 우리는 「미대상」이라
   적고 있었다(현행 구독 SKU 8종). 새 제품을 done 으로 올리면 여기도 함께 넣을 것. */
const DONE_KEYS = ['aircon','aicombo','washer','dryer','fridge','dish','dresser','airpur_reusable','airpur_s','purifier_under','vacuum','kimchi','induction','sac','dehum'];

(async () => {
  /*
   * **고정 대기(200ms)는 취약하다.** 앞 테스트 직후처럼 시스템이 바쁘면 첫 렌더가 그 안에
   * 안 끝나 "계약기간 타일이 없다"로 헛실패한다 — 케어 사진 갤러리를 붙여 첫 렌더가
   * 무거워지자 `npm test` 안에서만 실패했다(단독 실행은 통과).
   * 시간을 늘리는 것은 미봉책이다. **렌더가 끝났는지를 본다.**
   */
  const doc = window.document;
  /*
   * DOM 만 기다리면 모자란다 — `npm test` 로 스위트를 연달아 돌리면 부하 때문에 인라인
   * 스크립트가 6초 안에 못 끝나 `window.switchToCare is not a function` 으로 죽었다
   * (2026-08-12, test-finder 와 같은 종류의 실패다). **스크립트가 만든 것**도 함께 기다리고,
   * 여유를 15초로 둔다. 단독 실행에서는 늘 통과해 원인을 찾기 어려운 종류다.
   */
  for (let i = 0; i < 300; i++) {
    const el = doc.getElementById('body');
    if (el && el.innerHTML.includes('계약기간') && typeof window.switchToCare === 'function') break;
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

      /*
       * **모바일 구독은 회차표를 만들지 않는다** — 방문 기사가 없으므로 회차를 그리면
       * 그 자체가 거짓이다. 그래서 화면이 ①회차 UI 를 하나도 그리지 않고 ②그 사실을
       * 글로 밝히며 ③원문에서 확인한 세 혜택을 적는지 함께 본다.
       * (회차표를 되살리면 ①이, 혜택 문구를 지우면 ③이 물린다 — 둘 다 확인함)
       */
      if (p.mx) {
        const body = doc.getElementById('body');
        const txt = body.textContent.replace(/\s+/g, ' ');
        for (const sel of ['.plan-tabs', '.vtabs', '.type-tabs']) {
          if (body.querySelector(sel)) fail(`[${p.key}] 구독 화면에 회차 UI(${sel})가 그려졌다 — 방문 기사가 없어 회차가 없다`);
        }
        if (!/회차표가 없습니다/.test(txt)) fail(`[${p.key}] "회차표가 없습니다"를 화면이 밝히지 않는다`);
        /* 확인 못 한 것을 지어내지 않았는지 — 원문에 없는 월 요금을 단정하면 안 된다 */
        if (/월 [\d,]+원/.test(txt)) fail(`[${p.key}] 원문에 없는 월 이용료가 적혀 있다`);

        /*
         * **두 상품을 섞지 않는다.** 스마트폰은 `New 갤럭시 AI 구독클럽`(Care+ 별도 가입 ·
         * 잔존가 보장 · 민팃 반납), PC·태블릿은 `올인원 2.0`(구독케어 포함 · 잔존가 없음).
         * 한쪽 문구가 다른 쪽에 새면 상담에서 그대로 틀린 설명이 된다.
         */
        /*
         * **낱말을 통째로 금지하면 안 된다** — 두 상품이 같은 낱말을 다른 뜻으로 쓴다.
         * 모바일 Care+ 에도 자기부담금이 있고, PC 화면은 *"잔존가 보장·민팃 반납이 없고"*
         * 처럼 **부정문으로** 그 말을 쓴다(그게 상담에서 가장 중요한 구분이다).
         * 그래서 **한쪽에만 있을 수 있는 고유 표지**만 금지한다.
         */
        if (p.ai2) {
          for (const must of ['올인원 2.0', '무상수리', '파손보상', '자기부담금', '선납금', '1588-3366']) {
            if (!txt.includes(must)) fail(`[${p.key}] 원문 항목 "${must}" 가 화면에 없다`);
          }
          /* 민팃 고객센터 번호·'자급제'는 스마트폰 상품에만 있는 표지다 */
          for (const bad of ['1877-5446', '자급제', '액세서리 패키지']) {
            if (txt.includes(bad)) fail(`[${p.key}] 스마트폰 전용 표지 "${bad}" 가 섞였다`);
          }
          /* 잔존가·민팃은 **없다고 밝히는 문장**에서만 나와야 한다 */
          if (/잔존가/.test(txt) && !/없고|없다|없습니다/.test(txt)) {
            fail(`[${p.key}] '잔존가' 를 혜택처럼 적었다 — 올인원 2.0 에는 잔존가 보장이 없다`);
          }
        } else {
          for (const must of ['Samsung Care+', '잔존가 보장', '액세서리', '민팃', '1877-5446', '1588-3366', '자급제']) {
            if (!txt.includes(must)) fail(`[${p.key}] 원문 항목 "${must}" 가 화면에 없다`);
          }
          /* 올인원 2.0 고유 표지가 스마트폰 화면에 새면 안 된다 */
          for (const bad of ['올인원 2.0', '구독케어 기간', '선납금']) {
            if (txt.includes(bad)) fail(`[${p.key}] PC·태블릿 전용 표지 "${bad}" 가 섞였다`);
          }
        }
        continue;
      }

      if (!p.hasData) {
        const todo = doc.querySelector('.todo-card');
        if (!todo) { fail(`[${p.key}] expected placeholder .todo-card (no DATA entry)`); continue; }
        /*
         * **'자가관리 가이드' 라는 문구를 박지 않는다**(2026-08-30). 회차표가 없는 제품이
         * 다 자가관리는 아니다 — 카운터탑 정수기는 방문케어까지 되는데 그 문구가 붙어
         * 있으면 화면이 거짓말을 한다. 지켜야 하는 것은 **제품 이름과 설명이 보이는가** 다.
         */
        const tt = todo.textContent;
        if (!tt.includes(p.name)) fail(`[${p.key}] placeholder 에 제품 이름이 없다`);
        else if (tt.replace(/s+/g, ' ').trim().length < 40) fail(`[${p.key}] placeholder 본문이 너무 짧다`);
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

      /* 유형 탭 = 원문에 있는 유형 그대로(순서 프리미엄 → 라이트 → 셀프케어) */
      const tabTypes = [...doc.querySelectorAll('.plan-tab.ptype')].map((el) => el.dataset.ptype);
      const planTabs = tabTypes.length;
      if (tabTypes.join(',') !== p.types.join(',')) fail(`[${p.key}] 유형 탭 ${tabTypes.join(',') || '(없음)'} — 원문은 ${p.types.join(',') || '(없음)'}`);
      if (p.types.length) {
        /* 섹션(접이식)과 O/X 표가 있어야 한다 — 상담사가 차이를 한눈에 보는 자리 */
        if (doc.querySelectorAll('#body .fold').length < 7) fail(`[${p.key}] 접이식 섹션이 모자란다`);
        const oxCols = doc.querySelectorAll('[data-fold="ox"] table.ox tr:first-child th').length - 1;
        if (oxCols !== p.types.length) fail(`[${p.key}] O/X 표 칸이 ${oxCols} — 유형 ${p.types.length}개와 같아야 한다`);
        if (!doc.querySelector('[data-fold="notes"] li')) fail(`[${p.key}] 원문 유의사항 섹션이 없다`);
      }

      const sellCard = doc.getElementById('sellCard');
      if (!sellCard) fail(`[${p.key}] missing #sellCard (selling points)`);
      else if (doc.querySelectorAll('.sell-pt').length === 0) fail(`[${p.key}] sell-card has no sell-pt entries`);

      console.log(`[${p.key}] OK items=${items.length} planTabs=${planTabs}`);
    } catch (e) {
      fail(`[${p.key}] threw: ${e.message}`);
    }
  }

  // ── 3. 유형 × 주기 전환 — 전 품목, 모든 탭·주기를 눌러 본다 ──
  const click = (el) => el.dispatchEvent(new window.Event('click', { bubbles: true }));
  for (const p of ALL_PRODUCTS.filter((x) => x.types && x.types.length)) {
    try {
      window.switchToCare(p.key);
      let combos = 0;
      for (const t of p.types) {
        click(doc.querySelector(`.plan-tab.ptype[data-ptype="${t}"]`));
        const cycles = [...doc.querySelectorAll('.cyc-b')].map((b) => b.dataset.plan);
        for (const pk of (cycles.length ? cycles : [null])) {
          if (pk) click(doc.querySelector(`.cyc-b[data-plan="${pk}"]`));
          combos++;
          const nv = doc.querySelectorAll('.vtab').length;
          const want = +window.eval(`DATA['${p.key}'].plans[curPlan].rounds.length`);
          if (nv !== want) fail(`[${p.key}] ${t}/${pk} 회차 탭 ${nv}개 — 자료는 ${want}회`);
          if (!doc.querySelectorAll('.items .item').length) fail(`[${p.key}] ${t}/${pk} 회차 내용이 비었다`);
          if (hasBadText(bodyEl.innerHTML)) fail(`[${p.key}] ${t}/${pk} 화면에 undefined/NaN`);
        }
      }
      console.log(`[${p.key}] OK 유형·주기 ${combos}가지 전환`);
    } catch (e) {
      fail(`[${p.key}] 유형·주기 전환 중 예외: ${e.message}`);
    }
  }

  /*
   * ── 3-b. 원문 회차 골든 — 삼성 「구독케어 자세히 보기」 표에서 눈으로 확인한 값 ──
   * 품목마다 세척 시점이 다르다. 한 규칙으로 뭉개면(예: 모든 품목 3·6년차 세척) 여기서 물린다.
   */
  const R = (k, pk) => JSON.parse(window.eval(`JSON.stringify(DATA['${k}'].plans['${pk}'] ? DATA['${k}'].plans['${pk}'].rounds.map(r=>r.label+':'+r.badge) : null)`));
  const GOLD = [
    ['aircon', 'P12', '3년차:전문 세척', '6년차:전문 세척'],
    ['aircon', 'L12', '3년차:기본 세척', '6년차:기본 세척'],
    ['fridge', 'P12', '3년차:전문세척 (내부 및 후면)', '6년차:종합점검/케어'],
    ['fridge', 'P36', '3년차:종합점검/케어', '6년차:전문세척 (내부 및 후면)'],
    ['washer', 'P12', '3년차:초음파 세척', '6년차:종합점검/케어'],
    ['induction', 'P12', '3년차:종합점검/케어 + 상판교체'],
    ['vacuum', 'P12', '3년차:배터리 교체 + 종합점검/소모품 교체'],
    ['kimchi', 'S12', '1년차:고내탈취필터 배송'],
  ];
  for (const [k, pk, ...must] of GOLD) {
    const r = R(k, pk);
    if (!r) { fail(`[${k}] ${pk} 요금제가 없다`); continue; }
    for (const m of must) if (!r.includes(m)) fail(`[${k}] ${pk} 에 「${m}」 회차가 없다 — ${r.join(' | ')}`);
  }
  /* 있는 것 / 없는 것 — 없는 조합을 만들어 내면 안 된다 */
  const has = (k, pk) => window.eval(`!!(DATA['${k}'].plans && DATA['${k}'].plans['${pk}'])`);
  if (!has('induction', 'L36')) fail('[induction] 라이트 36개월 주기가 원문에 있는데 없다');
  for (const k of ['aircon', 'fridge', 'kimchi']) if (has(k, 'L36')) fail(`[${k}] 라이트 36개월은 원문에 없다`);
  if (has('airpur_reusable', 'S12') || has('airpur_reusable', 'S6')) fail('[airpur_reusable] 리유저블은 셀프케어 선택 불가(원문)');
  for (const k of ['airpur_s', 'purifier_under', 'airpur_reusable']) if (!has(k, 'P6')) fail(`[${k}] 6개월 주기가 원문에 있는데 없다`);
  if (has('vacuum', 'P36')) fail('[vacuum] 로봇청소기는 36개월 주기가 없다(5년형·12개월)');
  /* 에어컨 라이트에는 냉매 점검·열교환기 고압세척이 **없다** — O/X 의 핵심 차이 */
  window.switchToCare('aircon');
  const oxTxt = doc.querySelector('[data-fold="ox"]').textContent;
  if (!/열교환기 고압세척/.test(oxTxt) || !/핵심 차이/.test(doc.querySelector('[data-fold="ox"]').innerHTML)) fail('[aircon] O/X 에 핵심 차이(열교환기 고압세척)가 없다');
  /* 「핵심 차이」는 라이트에 정말 없는 것만 — 냉장고 「UV 케어」는 라이트에도 「외관 UV 케어」가 있어 빼야 한다 */
  const keyRows = JSON.parse(window.eval(`JSON.stringify(oxRows(DATA['fridge']).filter(r=>r.key).map(r=>r.k))`));
  if (keyRows.join(',') !== '기계실 청소') fail(`[fridge] 핵심 차이가 「기계실 청소」 하나여야 하는데 ${keyRows.join(', ')}`);
  if (ok) console.log('OK: 원문 회차 골든 · 없는 조합 미생성 · 핵심 차이');

  // ── 4. 접기/펴기 — 모두 접기·하나 열기·다시 그려도 상태 유지 ──
  try {
    window.switchToCare('fridge');
    click(doc.querySelector('.fold-bar[data-scope="care"] .fold-all[data-all="0"]'));
    if (doc.querySelectorAll('#body .fold.on').length) fail('모두 접기 후에도 열린 섹션이 있다');
    click(doc.querySelector('[data-fold="terms"] > .fold-h'));
    if (!doc.querySelector('[data-fold="terms"]').classList.contains('on')) fail('섹션 머리를 눌러도 안 열린다');
    click(doc.querySelector('.plan-tab.ptype[data-ptype="lite"]')); /* 다시 그린다 */
    if (!doc.querySelector('[data-fold="terms"]').classList.contains('on')) fail('유형을 바꾸면 열어 둔 섹션이 닫힌다');
    if (doc.querySelector('[data-fold="ox"]').classList.contains('on')) fail('닫아 둔 섹션이 다시 그릴 때 열린다');
    click(doc.querySelector('.fold-bar[data-scope="care"] .fold-all[data-all="1"]'));
    if (doc.querySelectorAll('#body .fold:not(.on)').length) fail('모두 펼치기 후에도 닫힌 섹션이 있다');
    if (ok) console.log('OK: 접기/펴기 (모두 접기 · 하나 열기 · 다시 그려도 유지 · 모두 펼치기)');
  } catch (e) {
    fail('접기/펴기 검사 예외: ' + e.message);
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

    /* 2026-10-15 「새로워진 블루패스」 — 네 갈래 12가지 + 에어컨 전용 2가지 = 14장, 스페셜 패스 2종 */
    const tiles = pane.querySelectorAll('.bp-i').length;
    if (tiles !== 14) fail(`bluepass: 타일 14장(12 + 에어컨 2)이어야 하는데 ${tiles}장`);
    if (!/<b>12가지<\/b>/.test(html)) fail('bluepass: 개수 문장(12가지)이 데이터와 어긋난다');
    if (!/에어컨은 <b>2가지<\/b>/.test(html)) fail('bluepass: 에어컨 개수 문장(2가지)이 데이터와 어긋난다');
    const grp = [...pane.querySelectorAll('.fold .bp-gk')].map((e) => e.textContent).join(',');
    if (grp !== '설치,스마트한 경험,맞춤 케어,안심 A/S') fail(`bluepass: 갈래가 원문(설치·스마트한 경험·맞춤 케어·안심 A/S)과 다르다 — ${grp}`);
    if (pane.querySelectorAll('.sp').length !== 2) fail('bluepass: 스페셜 패스(신혼·이지케어) 2종이 아니다');
    /* 처음에는 전부 접혀 있어야 끌어내리지 않는다 */
    if (pane.querySelectorAll('.fold.on').length) fail('bluepass: 처음부터 펼쳐진 섹션이 있다');

    // 조건이 라벨로 갈려 화면에 실제로 나오는지 — 뭉쳐 두면 상담 중에 안 읽힌다
    for (const label of ['대상', '필요', '제외', '비용']) {
      if (!pane.querySelector(`.bp-cl`)) fail('bluepass: 조건 라벨이 하나도 렌더되지 않았다');
      if (!html.includes(`>${label}</span>`)) fail(`bluepass: 조건 라벨 '${label}' 이 화면에 없다`);
    }

    /*
     * 빠지면 분쟁이 되는 조건 문구 — **원문(ai-subs/guide)에 실제로 있는 것만** 지킨다.
     *
     * 2026-08-30 전수 대조에서 예전 목록 다섯 중 넷이 **원문에 없는 말**이었다.
     * 특히 '하절기(6~9월)는 운영 제외' 는 혜택을 스스로 깎는 말이고,
     * '유상 옵션 — 추가 비용이 발생합니다' 가 붙어 있던 시간맞춤 설치는 원문이
     * **"추가 비용 없이"** 라고 적어 정반대였다. 검사가 그것들을 지키고 있었다 —
     * **검사가 근거 없는 값을 붙들면 고치는 쪽이 실패한다.**
     * 아래는 원문 조건 불릿 다섯과 게이트 문장 그대로다.
     */
    /*
     * 2026-10-15 개편 원문(「블루패스 유의 사항」·패스 유의사항)에서 옮긴 조건.
     * **A/S 패스트트랙 하절기 제외는 이제 원문에 있다** — 8/30 판에는 없어서 지웠던 조건이다.
     */
    const MUST = [
      '냉장고 · 김치냉장고 · 세탁기 · 건조기 · 에어컨 · TV 중 1품목',       // 하나 더 서비스
      'TV 75인치 이상 전 모델',                                           // 시간맞춤 설치 대상
      '추가 비용 발생(유상 옵션)',                                         // 오늘보장 설치
      '하절기(6~8월) 운영 제외',                                           // A/S 패스트트랙
      '일반에어컨 D+1일 내, 가정용 시스템에어컨 D+5일 내',                 // 최우선 설치
      '당사가 제품/배관 시공을 완료한 제품에 한함',                         // 냉매 안심케어
      '파손 수리비의 75% 지원',                                           // 파손보상
      '구독 방문케어 2건 이상 동시 구매',                                   // 신혼 패스
      '계약 체결일에 만 70세 이상',                                        // 이지케어 패스
      'AI 올인원 2.0 구독 고객에게만 제공되는 서비스입니다',                // 스마트 요금제는 블루패스가 없다
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

  /*
   * ── 6-b. **품목 아이콘이 전부 심벌인가** (2026-08-14) ──
   *
   * `prodIcon(p.key, p.icon)` 은 **키**를 넘기는데 `prod-symbols.js` 의 규칙은 한글
   * 이름(`태블릿`·`노트북`)을 본다. 그래서 새로 넣은 `ai2_tabs11` 같은 키가 어느 규칙에도
   * 안 걸려 **이모지로 떨어졌다**(사용자가 화면에서 잡아냈다 — 심벌은 이미 있었고
   * `KEYS` 매핑만 빠져 있었다).
   *
   * 이모지는 OS 가 그리는 컬러 비트맵이라 삼성 블루와 무관한 색이 튀고 기기마다 모양이
   * 다르다 — 이 저장소가 681개를 걷어낸 이유다. 새 제품을 추가할 때 또 빠지지 않게 지킨다.
   */
  try {
    const bad = [];
    for (const p of ALL_PRODUCTS) {
      const html = window.prodIcon(p.key, '🧊');
      if (!/^<svg/.test(String(html))) bad.push(`${p.key}(${p.name})`);
    }
    if (bad.length) fail(`품목 아이콘이 심벌이 아니라 이모지로 떨어진다 — prod-symbols.js 의 KEYS 에 추가할 것: ${bad.join(', ')}`);
    else console.log(`OK: 품목 아이콘 ${ALL_PRODUCTS.length}개 전부 심벌(SVG)`);
  } catch (e) { fail('아이콘 심벌 검사 예외: ' + e.message); }

  // ── 7. 모드 전환: overview ──
  try {
    window.setMode('overview');
    if (doc.getElementById('overviewPane').style.display === 'none') fail('overview mode: overviewPane should be visible');
    if (doc.getElementById('body').style.display !== 'none') fail('overview mode: care body should be hidden');
    if (doc.querySelector('.cat-wrap').style.display !== 'none') fail('overview mode: cat-wrap should be hidden');
    const cards = doc.querySelectorAll('#overviewPane .ov-card');
    if (cards.length !== ALL_PRODUCTS.length) fail(`overview: expected ${ALL_PRODUCTS.length} ov-cards, got ${cards.length}`);
    /* 모델 묶음 넷(2026-10-23 승인안) — 회차형 가전 · 무상수리·기타 · 모바일 · PC·태블릿, 합이 전체와 같다 */
    const ghs = [...doc.querySelectorAll('#overviewPane .ov-gh')].map(x => x.textContent);
    if (ghs.length !== 4 || !/회차형 가전/.test(ghs[0]) || !/모바일/.test(ghs.join(' ')) || !/PC/.test(ghs.join(' ')))
      fail('overview: 모델 묶음 제목 넷이 아니다 — ' + ghs.join(' | '));
    if (!doc.getElementById('careSide')) fail('태블릿 왼쪽 모델 목록(#careSide)이 없다');
    const naCards = doc.querySelectorAll('#overviewPane .ov-card.na-card').length;
    const expectedNa = ALL_PRODUCTS.filter((p) => !DONE_KEYS.includes(p.key) && !p.mx).length;
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

    /*
     * ── 설명 → 선택 → 보기 (2026-08-30 사장님 지시) ────────────────────────────
     * *"타임라인을 누르면 … 설명을하고 어떤것을 선택하고 최종적으로 타임라인 보기를
     * 누르면 결과값을 보여주는 형식"*. 탭을 누르자마자 결과(아무도 고르지 않은
     * 에어컨 12개월형)가 뜨면 안 된다 — 그 상태가 신고된 증상이다.
     */
    {
      const pane = doc.getElementById('timelinePane');
      if (!/타임라인이란/.test(pane.textContent)) fail('타임라인 진입 시 설명이 없다 — 결과부터 내밀고 있다');
      if (!doc.getElementById('tlGo')) fail('「타임라인 보기」 버튼이 없다');
      if (doc.querySelectorAll('#timelinePane .tl-stop').length !== 0) {
        fail('보기를 누르기 전에 결과(회차 점)가 이미 그려져 있다 — 신고된 그 증상이다');
      }
      /* 설명 화면에도 선택 드롭다운 4개(제품·플랜·연·월)가 같은 순서로 있어야 한다 */
      if (doc.querySelectorAll('#timelinePane .tl-sel').length !== 4) {
        fail('설명 화면의 선택 드롭다운이 4개(제품·플랜·연·월)가 아니다');
      }
      /* 보기를 눌러야 결과가 나온다 — 이후 검사들은 결과 화면 기준이다 */
      doc.getElementById('tlGo').click();
      if (doc.querySelectorAll('#timelinePane .tl-stop').length === 0) {
        fail('「타임라인 보기」를 눌렀는데 결과가 안 나온다');
      }
      /* 되돌아가는 길 — 「다시 선택하기」가 설명 화면으로 데려간다 */
      const backBtn = [...pane.querySelectorAll('button')].find((b) => /다시 선택/.test(b.textContent));
      if (!backBtn) fail('「다시 선택하기」 버튼이 없다 — 결과에서 처음으로 돌아갈 길이 없다');
      else {
        backBtn.click();
        if (!/타임라인이란/.test(pane.textContent)) fail('「다시 선택하기」가 설명 화면으로 안 데려간다');
        doc.getElementById('tlGo').click();          // 이후 검사를 위해 결과 화면으로
      }
      /* 탭을 떠났다 돌아오면 다시 설명부터다 — "누르면 설명" 이 흐름의 요점이다 */
      window.setMode('care'); window.setMode('timeline');
      if (!/타임라인이란/.test(pane.textContent)) fail('탭을 다시 눌렀는데 설명이 안 나온다');
      doc.getElementById('tlGo').click();            // 이후 검사를 위해 결과 화면으로
      console.log('OK: 타임라인 — 설명 → 선택 → 보기 → 다시 선택 흐름');
    }
    // 자가관리 제품(인덕션·전자레인지·사운드바)은 방문 케어가 아니라 타임라인 목록에서 빠진다
    /*
     * **기준월은 오늘의 다음 달이다** (2026-08-30 사장님 지시: *"지금은 지난달로 표시됩니다.
     * 10월에 조회하면 11월부터 설치되는걸로"*). 예전에는 2026년 7월이 박혀 있었다.
     * **박아 둔 날짜는 그날 하루만 맞고 다음 달부터 거짓이 된다** — 그래서 검사도
     * 특정 연·월을 적지 않고 "오늘에서 뽑았는가"라는 불변식으로 본다.
     */
    {
      const n = new Date(); n.setDate(1); n.setMonth(n.getMonth() + 1);
      const y = window.eval('tlYear'), m = window.eval('tlMonth');
      if (y !== n.getFullYear() || m !== n.getMonth() + 1) {
        fail(`타임라인 기준월이 ${y}.${m} — 오늘 기준 다음 달(${n.getFullYear()}.${n.getMonth() + 1})이어야 한다`);
      } else {
        const sels = doc.querySelectorAll('.tl-sel');
        const ys = sels.length > 2 ? [...sels[2].querySelectorAll('option')].map((o) => +o.value) : [];
        if (!ys.length) fail('타임라인 연도 드롭다운을 못 찾았다');
        else if (!ys.includes(n.getFullYear() + 6)) fail(`연도 목록이 6년 계약을 못 덮는다 (최대 ${Math.max(...ys)})`);
        else console.log(`OK: 타임라인 기준월이 오늘의 다음 달 (${y}.${m}) · 연도 ${Math.min(...ys)}~${Math.max(...ys)})`);
      }
    }

    const prodOpts = doc.querySelectorAll('.tl-sel')[0].querySelectorAll('option');
    const TL_KEYS = DONE_KEYS.filter((k) => (window.eval(`(DATA['${k}']||{}).contract`) !== '자가관리'));
    if (prodOpts.length !== TL_KEYS.length) fail(`timeline: expected ${TL_KEYS.length} product options, got ${prodOpts.length}`);
    /*
     * 회차는 **점(`.tl-stop`) 개수**로 센다. 예전에는 `<circle` 문자열을 셌는데
     * 그건 SVG 로 그리던 시절의 표현이라, 표현을 바꾸자 검사가 0을 세며 실패했다.
     * 마크업이 아니라 DOM 을 세면 그리는 방법이 바뀌어도 뜻이 유지된다.
     */
    const stops = () => doc.querySelectorAll('#timelinePane .tl-stop').length;
    const circles = stops();
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
     * **단일 플랜 제품으로 넘어가면 플랜이 그쪽으로 보정돼야 한다.**
     * 예전에는 tlPlan 이 옛 값으로 남아 **죽은 표를 그려** 회차 수가 틀렸다
     * (2026-08-11 사용자 보고 — AI콤보에서 같은 증상).
     *
     * **대상을 로봇청소기로 옮겼다**(2026-08-30). 건조기가 12·36 둘 다 갖게 됐기
     * 때문이다 — 삼성닷컴이 파는 12개월형을 onlyPlan:'36' 이 감추고 있었다.
     * 로봇청소기는 5년형·12개월 전용이라 회차가 5회다.
     */
    const prodSel = doc.querySelectorAll('.tl-sel')[0];
    prodSel.value = 'aicombo';                       // 먼저 36개월 주기를 골라 둔다
    prodSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    doc.querySelectorAll('.tl-sel')[1].value = 'P36';
    doc.querySelectorAll('.tl-sel')[1].dispatchEvent(new window.Event('change', { bubbles: true }));
    prodSel.value = 'vacuum';                        // 36개월이 없는 제품으로 넘어간다
    prodSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    const circlesOnly = stops();
    if (circlesOnly !== 5) fail(`timeline: 로봇청소기는 5년형·12개월이라 5회여야 하는데 ${circlesOnly}회`);
    const planOpts = [...doc.querySelectorAll('.tl-sel')[1].querySelectorAll('option')].map((o) => o.value);
    if (planOpts.join(',') !== 'P12,S12') fail(`timeline: 로봇청소기 선택지는 프리미엄 12·셀프케어 12 둘이어야 하는데 ${planOpts.join(',')}`);

    /* 사용자가 신고한 그 조합 — AI콤보 36개월 주기는 2회여야 한다 */
    prodSel.value = 'aicombo';
    prodSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    doc.querySelectorAll('.tl-sel')[1].value = 'P36';
    doc.querySelectorAll('.tl-sel')[1].dispatchEvent(new window.Event('change', { bubbles: true }));
    const circlesCombo = stops();
    if (circlesCombo !== 2) fail(`timeline: AI콤보 36개월 주기는 2회여야 하는데 ${circlesCombo}회 (구독 6년 ÷ 36개월)`);

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
      if (d.contract === '자가관리' || !d.plans) continue;
      for (const pl of Object.keys(d.plans)) {
        const cyc = d.plans[pl].cycle;
        const sched = JSON.parse(window.eval(`JSON.stringify(careSchedule(DATA['${k}'],'${pl}'))`));
        if (!sched.length) { fail(`[${k}] ${pl} 에서 회차 일정을 못 만들었다 — 타임라인이 비어 보인다`); continue; }
        const months = sched.map((x) => x.month);
        const contractM = d.plans[pl].maxTerm * 12;
        const expect = Math.floor(contractM / cyc);
        if (months.some((m, i) => i && m <= months[i - 1])) fail(`[${k}] ${pl} 회차가 오름차순이 아니다 — ${months.join(',')}`);
        else if (months[months.length - 1] > contractM) fail(`[${k}] ${pl} 마지막 회차 ${months[months.length - 1]}개월 — 계약 ${contractM}개월을 넘는다`);
        else if (months.length !== expect) fail(`[${k}] ${pl} 은 ${months.length}회 — 계약 ${contractM}개월 ÷ ${cyc}개월이면 ${expect}회여야 한다 (${months.join(',')})`);
        else {
          const label = d.plans[pl].total;
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
      /* 꼬리표(「일부 품목 한정」 등)는 제목이 아니다 — 떼고 비교한다 */
      .map((e) => { const c = e.cloneNode(true); c.querySelectorAll('.bp-tag').forEach((t) => t.remove()); return c.textContent.trim().replace(/^\d+/, ''); }).filter(Boolean);
    const missing = onScreen.filter((t) => !bpRows.includes(t));
    if (bpRows.length < 6) fail(`[공유] 블루패스 카드가 ${bpRows.length}줄뿐 — 혜택이 빠졌다`);
    else if (onScreen.length && missing.length) fail(`[공유] 화면에 있는 혜택이 카드에 없다: ${missing.join(', ')}`);
    else console.log(`OK: 블루패스 공유 카드에 혜택 ${bpRows.length}개 포함${onScreen.length ? ` (화면 ${onScreen.length}개 전부 대조)` : ''}`);

    window.setMode('care');
  } catch (e) {
    fail('공유 카드 탭 대응 검사 실패: ' + e.message);
  }

  /* 옛 「12개월형 / 36개월형」 자료·화면이 되살아나지 않는다 — 구독 지면이 있는 품목은 CARE_PLANS 하나가 출처다 */
  {
    const left = ['plan12', 'total12', 'render12', 'curTypeA', 'type-tab'].filter((w) => html.includes(w));
    if (left.length) fail(`옛 12/36개월형 자료·코드가 남아 있다: ${left.join(', ')}`);
    else console.log('OK: 옛 12/36개월형 자료·코드 없음');
  }

  /* 섹션 안쪽 여백 — 회차 칩·탭·사진이 카드 끝에 붙어 잘리던 것(2026-10-15 사장님 지적) */
  {
    const bad = [];
    if (!/\.fold-pad\{padding:/.test(html)) bad.push('.fold-pad 규칙 없음');
    if (!/'<div class="fold-pad">' \+ rd \+ '<\/div>'/.test(html)) bad.push('회차 섹션이 여백 상자를 안 거친다');
    if (/\.round-pill\.on\{outline/.test(html)) bad.push('고른 회차 칩이 outline 이라 카드 밖으로 나간다');
    if (!/\.vtabs\{display:grid/.test(html)) bad.push('회차 탭이 폭에 맞춰 나뉘지 않는다');
    if (bad.length) fail('잘림 방지: ' + bad.join(' · '));
    else console.log('OK: 섹션 여백 · 회차 탭 격자 · 고른 칩 안쪽 테두리');
  }

  console.log(ok ? 'ALL PASS' : 'SOME FAILED');
  process.exit(ok ? 0 : 1);
})();
