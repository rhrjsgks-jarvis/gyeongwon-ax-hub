// 타사비교(public/compare-app.html) 회귀 테스트
// 실행: node scripts/test-compare.mjs
//
// DB에 새 카테고리/브랜드/모델을 추가해도 이 스크립트는 DB 원문을 직접 파싱해서
// 카테고리·브랜드·모델 목록을 자동으로 얻으므로 별도 목록 갱신이 필요 없다.
// (DB, PRESETS는 `const`로 선언돼 있어 window에 노출되지 않으므로, HTML 원문에서
//  객체 리터럴 블록을 잘라내 안전하게 eval하는 방식으로 읽어온다.)

import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readApp } from './lib/read-app.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '..', 'public', 'compare-app.html');
const rawHtml = readApp('compare-app.html');

let ok = true;
function fail(msg) { console.log(`ERROR: ${msg}`); ok = false; }
function assertTrue(cond, msg) { if (!cond) fail(msg); }
function assertEq(actual, expected, msg) {
  if (actual !== expected) fail(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── const 객체 리터럴을 브레이스 매칭으로 잘라내 eval ──
function extractConst(html, name) {
  const marker = `const ${name} = {`;
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) throw new Error(`${name} 선언을 찾지 못했습니다`);
  const braceOpen = startIdx + marker.length - 1;
  let depth = 0, i = braceOpen;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  const objSrc = html.slice(braceOpen, i);
  return new Function(`return (${objSrc});`)();
}

const DB = extractConst(rawHtml, 'DB');
const PRESETS = extractConst(rawHtml, 'PRESETS');

// ── 원본 HTML에서 외부 CDN 스크립트(html2canvas) 제거 — 테스트는 네트워크에 의존하지 않는다 ──
const testHtml = rawHtml.replace(
  /<script src="https:\/\/cdnjs\.cloudflare\.com[^"]*"><\/script>/,
  ''
);

const dom = new JSDOM(testHtml, { runScripts: 'dangerously', url: 'https://example.com/' });
const { window } = dom;
const doc = window.document;

window.alert = (msg) => { window.__lastAlert = msg; };
window.navigator.clipboard = { writeText: async (t) => { window.__lastClipboard = t; return Promise.resolve(); } };
window.Element.prototype.scrollIntoView = () => {};
window.HTMLAnchorElement.prototype.click = () => {};

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
/* 고정 시간이 아니라 "준비됐는가"를 기다린다 — npm test 로 스위트를 연달아 돌리면
   부하 때문에 200ms 안에 인라인 스크립트가 못 끝난다(test-finder 가 실제로 그렇게 죽었다). */
async function ready(check, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (check()) return true; } catch { /* 아직 없다 */ }
    await wait(25);
  }
  return false;
}
function val(id) { return doc.getElementById(id); }
function firstCompInput() { return doc.querySelectorAll('#competitor-list input[type="url"]')[0]; }
function resetUrlTabInputs() {
  val('own-url').value = '';
  const list = doc.getElementById('competitor-list');
  while (list.children.length > 1) list.removeChild(list.lastChild);
  firstCompInput().value = '';
  doc.querySelectorAll('#focus-grid .focus-chip.checked').forEach((c) => c.classList.remove('checked'));
}

(async () => {
  /* **스크립트가 돌았는지**를 본다. DOM 요소는 정적 HTML 에 이미 있을 수 있어
     조건이 즉시 참이 되면 예전 고정 대기와 다를 바가 없다. */
  if (!await ready(() => typeof window.selectCat === 'function' && typeof window.renderHistory === 'function'))
    console.log('ERROR: 인라인 스크립트가 15초 안에 준비되지 않음 (selectCat/renderHistory)');

  // ══════════════════════════════════════════
  // 0. 초기 렌더 — 에러 없이 로드되는지
  // ══════════════════════════════════════════
  assertTrue(doc.getElementById('tab-db') !== null, '초기 렌더 실패: #tab-db 없음');
  assertEq(doc.querySelectorAll('.cat-btn').length, 15, '카테고리 버튼 개수가 15개가 아님');
  console.log('[0] 초기 렌더 OK');

  // 비교 실행 전 가드: copyResult/goQuiz가 예외 없이 안내만 하는지
  try {
    window.copyResult();
    window.goQuiz();
    console.log('[0] 비교 전 가드(copyResult/goQuiz) OK — 예외 없음');
  } catch (e) {
    fail(`비교 실행 전 copyResult/goQuiz 가드에서 예외 발생: ${e.message}`);
  }

  // ══════════════════════════════════════════
  // 1. escHtml — XSS 이스케이프 회귀 방지
  // ══════════════════════════════════════════
  const escCases = [
    ['<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;'],
    [`"'&<>`, '&quot;&#39;&amp;&lt;&gt;'],
    ['정상 텍스트', '정상 텍스트'],
    ['<img src=x onerror=alert(1)>', '&lt;img src=x onerror=alert(1)&gt;'],
  ];
  for (const [input, expected] of escCases) {
    const out = window.escHtml(input);
    assertEq(out, expected, `escHtml("${input}") 이스케이프 결과 불일치`);
  }
  console.log(`[1] escHtml ${escCases.length}건 이스케이프 검증 OK`);

  // ══════════════════════════════════════════
  // 2. 비교 이력(history) 저장형 XSS 회귀 테스트
  //    (53490c1 커밋에서 attribute injection + 미이스케이프 수정됨)
  // ══════════════════════════════════════════
  window.localStorage.clear();
  const xssOwn = 'https://www.samsung.com/sec/"><img src=x onerror=alert(1)>';
  const xssComp = '<script>window.__xssFired=true;</script>lge.co.kr';
  window.saveHistory(xssOwn, xssComp);
  window.renderHistory();
  const histList = val('history-list');
  const histHtml = histList.innerHTML;

  assertTrue(!/<img[^>]*onerror=/i.test(histHtml), 'XSS 회귀: history-list에 미이스케이프 <img onerror=...> 태그가 그대로 렌더됨');
  // renderHistory()는 x.comp 원문을 절대 DOM에 넣지 않고 cats 매핑의 고정 라벨만 사용하므로
  // "<script> 미검출" 자체는 항상 참이다(무의미). 대신 의미 있는 불변조건을 검증한다:
  // x.comp 원문이 (이스케이프 여부와 무관하게) 그대로 노출되지 않아야 한다 — 이걸 실패시키려면
  // renderHistory가 cb 라벨 대신 raw comp 값을 직접 삽입하도록 바뀌어야 한다.
  assertTrue(!histHtml.includes(xssComp), '경쟁사 필드 원문이 history-list에 그대로 노출됨 (cb 라벨 대신 raw 값을 렌더하도록 로직이 바뀌었을 가능성)');
  assertTrue(doc.querySelectorAll('#history-list script').length === 0, 'XSS 회귀: history-list 안에 실제 <script> DOM 요소가 생성됨');
  assertTrue(histHtml.includes('&lt;img'), 'history-list가 위험문자를 이스케이프하지 않음 (&lt;img 미검출)');

  // attribute injection 회귀 방지: onclick 인라인 속성이 아니라 data-hist-idx + addEventListener 패턴이어야 함
  const histRow = histList.querySelector('.history-row');
  assertTrue(histRow !== null, 'history-row가 렌더되지 않음');
  assertTrue(!histRow.hasAttribute('onclick'), 'XSS 회귀: history-row에 인라인 onclick 속성이 부활함 (attribute injection 취약점)');
  assertTrue(histRow.hasAttribute('data-hist-idx'), 'history-row에 data-hist-idx가 없음 — 클릭 핸들러 연결 방식 회귀 의심');

  // 기능은 정상 동작해야 함 (이스케이프가 기능을 깨뜨리지 않았는지)
  histRow.dispatchEvent(new window.Event('click', { bubbles: true }));
  assertEq(val('own-url').value, xssOwn, '이력 클릭 시 own-url이 올바르게 복원되지 않음');
  console.log('[2] history XSS 회귀 방지 + 클릭 기능 정상 OK');

  window.localStorage.clear();
  window.renderHistory();

  // ══════════════════════════════════════════
  // 3. DB 전 카테고리 × 전 브랜드 × 전 모델 조합 순회 렌더 검증
  // ══════════════════════════════════════════
  const CATS = Object.keys(DB);
  assertEq(CATS.length, 15, 'DB 카테고리 개수가 15개가 아님 (카테고리 추가/삭제 시 이 테스트도 함께 확인할 것)');

  // 카테고리 그리드 버튼과 DB 키가 1:1로 매칭되는지 (드리프트 방지)
  const gridCats = [...doc.querySelectorAll('.cat-btn')].map((b) => {
    const m = b.getAttribute('onclick').match(/selectCat\('([^']+)'\)/);
    return m ? m[1] : null;
  });
  for (const c of CATS) {
    assertTrue(gridCats.includes(c), `카테고리 그리드 버튼에 DB 카테고리 "${c}"가 없음`);
  }
  for (const c of gridCats) {
    assertTrue(DB[c] !== undefined, `카테고리 그리드 버튼 "${c}"가 DB에 없음 (죽은 참조)`);
  }

  let comboCount = 0;
  for (const cat of CATS) {
    const d = DB[cat];
    window.selectCat(cat);
    assertTrue(val('model-section').classList.contains('visible'), `[${cat}] model-section이 visible 상태가 아님`);
    assertEq(val('sel-samsung').querySelectorAll('option').length, d.samsung.length, `[${cat}] 삼성 모델 드롭다운 개수 불일치`);

    const brands = Object.keys(d.competitors);
    assertTrue(brands.length > 0, `[${cat}] 경쟁사 브랜드가 0개`);
    assertEq(doc.querySelectorAll('#brand-chips .brand-chip').length, brands.length, `[${cat}] 브랜드 칩 개수 불일치`);

    for (const brand of brands) {
      window.selectBrand(brand);
      const comps = d.competitors[brand];
      assertEq(val('sel-comp').querySelectorAll('option').length, comps.length, `[${cat}/${brand}] 경쟁사 모델 드롭다운 개수 불일치`);

      for (let si = 0; si < d.samsung.length; si++) {
        for (let ci = 0; ci < comps.length; ci++) {
          val('sel-samsung').value = String(si);
          val('sel-comp').value = String(ci);
          try {
            window.renderResult();
          } catch (e) {
            fail(`[${cat}/${brand} samsung#${si} vs comp#${ci}] renderResult() 예외: ${e.message}`);
            continue;
          }
          comboCount++;
          assertTrue(val('result-db').classList.contains('visible'), `[${cat}/${brand}] 결과 카드가 visible 상태가 아님`);
          const specRows = doc.querySelectorAll('#spec-table tr');
          assertTrue(specRows.length >= 2, `[${cat}/${brand}] 스펙 비교표에 데이터 행이 없음`);
          if ((d.sells || []).length) {
            assertTrue(val('sell-points').innerHTML.trim().length > 0, `[${cat}/${brand}] 셀링포인트가 비어있음`);
          }
          if ((d.scripts || []).length) {
            assertTrue(val('scripts').innerHTML.trim().length > 0, `[${cat}/${brand}] 응대 스크립트가 비어있음`);
          }
          assertTrue(val('res-title').textContent.includes(cat), `[${cat}/${brand}] 결과 제목에 카테고리명이 없음`);
        }
      }
    }
  }
  console.log(`[3] DB 전 카테고리 순회: ${CATS.length}개 카테고리, ${comboCount}개 삼성×경쟁사 조합 렌더 검증 OK`);

  // ── 데이터 최신화 회귀 방지 (TV 세대, 아이폰 배터리) ──
  const tv = DB['TV'];
  assertTrue(tv.samsung.some((m) => m.name.includes('R95H')), 'TV 회귀: 삼성 라인업에 Micro RGB R95H(2026 최상위 채번) 플래그십이 없음');
  assertTrue(tv.samsung.some((m) => m.name.includes('QNH80')), 'TV 회귀: 삼성 라인업에 QNH80(2026) 모델이 없음');
  assertTrue(tv.samsung.every((m) => /R95H|QNH80|QNH70/.test(m.name)), 'TV 회귀: 삼성 라인업이 Micro RGB/QNH70/80(2026) 계열이 아닌 구세대로 되돌아감');
  assertTrue(!tv.samsung.some((m) => /QN9\d\dD|QN85D|QN80D/.test(m.name)), 'TV 회귀: 2024년형 D접미사 구모델이 되살아남');
  assertTrue(tv.competitors['LG'].some((m) => m.name.includes('C6')), 'TV 회귀: LG OLED가 C6(2026)이 아닌 구세대로 되돌아감');
  assertTrue(!tv.competitors['LG'].some((m) => /C4|C3/.test(m.name)), 'TV 회귀: LG OLED 구세대(C4/C3) 모델이 되살아남');

  const phone = DB['스마트폰'];
  const iphoneProMax = phone.competitors['애플'].find((m) => m.name.includes('Pro Max'));
  const iphonePro = phone.competitors['애플'].find((m) => m.name.includes('Pro') && !m.name.includes('Max'));
  assertTrue(iphoneProMax && iphoneProMax.name.includes('iPhone 17'), '스마트폰 회귀: 애플 비교 대상이 iPhone 17 세대가 아님');
  assertTrue(!phone.competitors['애플'].some((m) => m.name.includes('iPhone 16')), '스마트폰 회귀: iPhone 16(구세대) 비교 데이터가 되살아남');
  assertTrue(iphonePro && iphonePro.specs.bat === 3998, '스마트폰 회귀: iPhone 17 Pro 배터리가 SIM 버전(3998mAh)이 아닌 eSIM 버전 등으로 되돌아감');
  console.log('[3-b] TV 세대 · 아이폰 배터리 데이터 최신화 회귀 방지 검증 OK');

  // ══════════════════════════════════════════
  // 4. detectCategory / detectBrand
  // ══════════════════════════════════════════
  const catCases = [
    ['https://www.samsung.com/sec/refrigerators/bespoke/', '냉장고'],
    ['워시콤보 washing-machine 최신형', '세탁기·콤보'],
    ['https://www.lge.co.kr/air-conditioners/whisen', '에어컨'],
    ['https://www.samsung.com/sec/tvs/qled-tv/', 'TV'],
    ['https://www.lge.co.kr/robot-vacuum/robo-king', '로봇청소기'],
    ['https://www.dyson.co.kr/vacuum-cleaners/v15', '청소기'],
    ['https://www.samsung.com/sec/smartphones/galaxy-s26-ultra/', '스마트폰'],
    ['LG 트롬 dryer 19kg', '건조기'],
    ['https://www.lge.co.kr/dishwasher', '식기세척기'],
    ['https://www.samsung.com/sec/laptop/galaxybook5-pro/', '노트북'],
    ['이것은 관련 없는 임의의 텍스트입니다', null],
  ];
  for (const [input, expected] of catCases) {
    const got = window.detectCategory(input);
    assertEq(got, expected, `detectCategory("${input}") 결과 불일치`);
  }
  console.log(`[4] detectCategory ${catCases.length}건 검증 OK`);

  const brandCases = [
    ['https://www.roborock.com/kr/s8', '로보락'],
    ['https://www.ecovacs.com/kr/deebot', '에코백스'],
    ['https://www.dreametechnologies.com/kr', '드리미'],
    ['https://www.dyson.co.kr/vacuum-cleaners', '다이슨'],
    ['https://www.hisense.co.kr/tv', '하이센스'],
    ['https://www.tcl.com/kr/tv', 'TCL'],
    ['https://www.apple.com/kr/iphone', '애플'],
    ['https://www.lge.co.kr/refrigerators', 'LG'],
    ['관련 없는 텍스트', null],
  ];
  for (const [input, expected] of brandCases) {
    const got = window.detectBrand(input);
    assertEq(got, expected, `detectBrand("${input}") 결과 불일치`);
  }
  console.log(`[4-b] detectBrand ${brandCases.length}건 검증 OK`);

  // ══════════════════════════════════════════
  // 5. PRESETS / loadPreset
  // ══════════════════════════════════════════
  const presetKeys = Object.keys(PRESETS);
  assertTrue(presetKeys.length > 0, 'PRESETS가 비어있음');
  for (const key of presetKeys) {
    resetUrlTabInputs();
    window.loadPreset(key);
    assertEq(val('own-url').value, PRESETS[key].own, `loadPreset('${key}') 자사 URL 불일치`);
    assertEq(firstCompInput().value, PRESETS[key].comp, `loadPreset('${key}') 경쟁사 URL 불일치`);
  }
  console.log(`[5] PRESETS ${presetKeys.length}건 loadPreset 검증 OK`);

  // 존재하지 않는 프리셋 키는 안전하게 무시되는지
  resetUrlTabInputs();
  try {
    window.loadPreset('존재하지않는키');
    assertEq(val('own-url').value, '', '알 수 없는 프리셋 키에도 own-url이 채워짐 (가드 누락)');
  } catch (e) {
    fail(`loadPreset('존재하지않는키')에서 예외 발생: ${e.message}`);
  }

  // ══════════════════════════════════════════
  // 6. tryInstantCompare — DB 보유 조합 → 즉시비교 / 미보유 조합 → 프롬프트 폴백
  // ══════════════════════════════════════════
  // 6-a. 입력값 없을 때 alert 가드
  resetUrlTabInputs();
  window.__lastAlert = null;
  window.tryInstantCompare();
  assertTrue(!!window.__lastAlert, 'tryInstantCompare(): 자사 URL 미입력 시 alert가 호출되지 않음');

  // 6-b. DB 보유 조합 (냉장고 × LG) → db 탭으로 즉시비교 연결
  resetUrlTabInputs();
  val('own-url').value = 'https://www.samsung.com/sec/refrigerators/bespoke-4door/';
  firstCompInput().value = 'https://www.lge.co.kr/refrigerators/dios';
  window.tryInstantCompare();
  assertEq(val('tab-db').style.display, 'block', 'tryInstantCompare(): DB 보유 조합인데 즉시비교 탭으로 전환되지 않음');
  assertTrue(val('result-db').classList.contains('visible'), 'tryInstantCompare(): DB 보유 조합인데 결과가 렌더되지 않음');

  // 6-c. DB 미보유 조합 (관련 없는 URL) → AI 프롬프트 생성으로 폴백
  window.switchTab('url'); // 결과 확인 후 다시 url 탭으로
  resetUrlTabInputs();
  val('own-url').value = 'https://www.samsung.com/sec/some-unknown-category/xyz/';
  firstCompInput().value = 'https://www.unknown-brand-example.com/product';
  window.tryInstantCompare();
  assertTrue(val('url-result-section').classList.contains('visible'), 'tryInstantCompare(): DB 미보유 조합인데 프롬프트 결과 섹션이 노출되지 않음');
  assertTrue(val('prompt-output').textContent.length > 0, 'tryInstantCompare(): DB 미보유 조합 폴백 시 프롬프트가 비어있음');
  console.log('[6] tryInstantCompare (DB 즉시비교 연결 + 미보유 조합 폴백) 검증 OK');

  // ══════════════════════════════════════════
  // 7. generatePrompt / copyPrompt
  // ══════════════════════════════════════════
  resetUrlTabInputs();
  val('own-url').value = 'https://www.samsung.com/sec/refrigerators/test-model/';
  firstCompInput().value = 'https://www.lge.co.kr/refrigerators/test-model';
  doc.querySelectorAll('#focus-grid .focus-chip')[0].click();
  window.generatePrompt();
  const promptText = val('prompt-output').textContent;
  assertTrue(val('url-result-section').classList.contains('visible'), 'generatePrompt(): 결과 섹션이 visible 상태가 아님');
  assertTrue(promptText.includes('https://www.samsung.com/sec/refrigerators/test-model/'), 'generatePrompt(): 프롬프트에 자사 URL이 누락됨');
  assertTrue(promptText.includes('https://www.lge.co.kr/refrigerators/test-model'), 'generatePrompt(): 프롬프트에 경쟁사 URL이 누락됨');
  assertTrue(promptText.includes('삼성전자'), 'generatePrompt(): 프롬프트에 기본 브랜드명이 누락됨');

  window.__lastClipboard = null;
  window.copyPrompt();
  await wait(10);
  assertEq(window.__lastClipboard, promptText, 'copyPrompt(): 클립보드에 복사된 텍스트가 프롬프트와 다름');
  assertTrue(val('copy-btn').classList.contains('copied'), 'copyPrompt(): 복사 버튼에 copied 클래스가 적용되지 않음');
  console.log('[7] generatePrompt / copyPrompt 검증 OK');

  // 자사 URL 미입력 시 alert 가드
  resetUrlTabInputs();
  window.__lastAlert = null;
  window.generatePrompt();
  assertTrue(!!window.__lastAlert, 'generatePrompt(): 자사 URL 미입력 시 alert가 호출되지 않음');

  // ══════════════════════════════════════════
  // 8. goQuiz / copyQuizPrompt (퀴즈 연동 프롬프트)
  // ══════════════════════════════════════════
  window.switchTab('db');
  window.selectCat('냉장고');
  window.selectBrand('LG');
  val('sel-samsung').value = '0';
  val('sel-comp').value = '0';
  window.renderResult();
  window.goQuiz();
  assertTrue(val('quiz-modal-overlay').classList.contains('visible'), 'goQuiz(): 모달이 visible 상태가 아님');
  const quizPrompt = val('quiz-prompt-output').textContent;
  assertTrue(quizPrompt.includes('냉장고'), 'goQuiz(): 퀴즈 프롬프트에 카테고리명이 누락됨');
  assertTrue(quizPrompt.includes(DB['냉장고'].samsung[0].name), 'goQuiz(): 퀴즈 프롬프트에 삼성 모델명이 누락됨');
  assertTrue(quizPrompt.includes(DB['냉장고'].competitors['LG'][0].name), 'goQuiz(): 퀴즈 프롬프트에 경쟁사 모델명이 누락됨');

  window.closeQuizModal();
  assertTrue(!val('quiz-modal-overlay').classList.contains('visible'), 'closeQuizModal(): 모달이 여전히 visible 상태');

  window.goQuiz();
  window.__lastClipboard = null;
  window.copyQuizPrompt();
  await wait(10);
  assertEq(window.__lastClipboard, quizPrompt, 'copyQuizPrompt(): 클립보드에 복사된 텍스트가 퀴즈 프롬프트와 다름');
  console.log('[8] goQuiz / copyQuizPrompt 검증 OK');

  // ══════════════════════════════════════════
  // 9. URL 즉시비교 — 카테고리 판정 + URL 모델코드 매칭 회귀
  // ══════════════════════════════════════════
  // 실제 사고: 삼성 로봇청소기(jetbot-…)와 LG 로봇청소기(n95tho) URL 어디에도 'robot'이
  // 없어서 무선청소기로 판정됐고, 모델코드를 읽지 않아 항상 각 카테고리 0번 모델만 비교됐다.
  {
    const SAMSUNG_ROBOT = 'https://www.samsung.com/sec/vacuum-cleaners/jetbot-vr90f01sag-d2c/VR90F01SAG/';
    const LG_ROBOT = 'https://www.lge.co.kr/product/vacuum-cleaners/n95tho?modelId=MD10730837&pdpType=PURCHASE';

    assertEq(window.detectCategory(SAMSUNG_ROBOT), '로봇청소기',
      'detectCategory(): 삼성 제트봇 URL이 로봇청소기로 판정되지 않음');
    assertEq(window.detectCategory('https://www.samsung.com/sec/vacuum-cleaners/bespoke-jet-ai-vs28d952hcb/'), '청소기',
      'detectCategory(): 무선청소기 URL이 로봇청소기로 잘못 승격됨');
    assertEq(window.detectBrand(LG_ROBOT), 'LG', 'detectBrand(): LG URL 판정 실패');

    resetUrlTabInputs();
    val('own-url').value = SAMSUNG_ROBOT;
    firstCompInput().value = LG_ROBOT;
    window.tryInstantCompare();
    await wait(10);

    assertEq(val('res-title').textContent, `${DB['로봇청소기'].emoji} 로봇청소기 비교 결과`,
      'tryInstantCompare(): 로봇청소기 결과로 연결되지 않음');

    const samIdx = +val('sel-samsung').value;
    const compIdx = +val('sel-comp').value;
    assertTrue(DB['로봇청소기'].samsung[samIdx].name.includes('VR90F01SAG'),
      `tryInstantCompare(): URL의 삼성 모델(VR90F01SAG)이 선택되지 않음 — 선택된 값: ${DB['로봇청소기'].samsung[samIdx].name}`);
    assertTrue(DB['로봇청소기'].competitors['LG'][compIdx].name.includes('N95THO'),
      `tryInstantCompare(): URL의 LG 모델(N95THO)이 선택되지 않음 — 선택된 값: ${DB['로봇청소기'].competitors['LG'][compIdx].name}`);
    console.log('[9] URL 즉시비교 카테고리·모델 매칭 OK');
  }

  // ══════════════════════════════════════════
  // 10. 비교항목 확충 — 가격 행 전 카테고리 + 데이터에만 있던 항목 노출
  // ══════════════════════════════════════════
  {
    for (const cat of Object.keys(DB)) {
      assertTrue(DB[cat].specItems.some((it) => it.key === 'price'),
        `specItems: "${cat}"에 가격 항목이 없음`);
      assertTrue(DB[cat].specItems.length >= 3,
        `specItems: "${cat}" 비교 항목이 ${DB[cat].specItems.length}개뿐 — 최소 3개`);
    }
    const has = (cat, key) => DB[cat].specItems.some((it) => it.key === key);
    assertTrue(has('TV', 'res') && has('TV', 'panel'), 'TV 해상도·패널 항목 누락');
    assertTrue(has('스마트폰', 'hz'), '스마트폰 주사율 항목 누락');
    assertTrue(has('식기세척기', 'dryType'), '식기세척기 건조 방식 항목 누락');
    assertTrue(has('인덕션', 'kw') && has('인덕션', 'cutout'), '인덕션 출력·타공 항목 누락');

    // 가격은 참고 행이라 종합 스코어를 흔들면 안 된다
    const priceItem = DB['냉장고'].specItems.find((it) => it.key === 'price');
    assertEq(priceItem.score, false, '가격 항목이 score:false가 아님 — 프리미엄 모델이 비싸다는 이유로 열위가 된다');

    window.switchTab('db');
    window.selectCat('인덕션');
    window.selectBrand('LG');
    val('sel-samsung').value = '0';
    // sel-comp는 건드리지 않는다 — 등급 자동매칭이 고른 기본값(가격이 확인된 동급 모델)을
    // 그대로 검증해야 "상담 화면을 열자마자 가격 행이 보이는가"를 실제로 확인할 수 있다.
    window.updateCompetitors();
    window.renderResult();
    const rowLabels = [...val('spec-table').querySelectorAll('.spec-label')].map((td) => td.textContent);
    assertTrue(rowLabels.some((t) => t.includes('가격')), '비교표에 가격 행이 렌더되지 않음');
    assertTrue(rowLabels.some((t) => t.includes('전체 출력')), '비교표에 전체 출력 행이 렌더되지 않음');
    console.log(`[10] 비교항목 확충 OK — 인덕션 ${rowLabels.length}행 렌더`);
  }

  // ══════════════════════════════════════════
  // 10-b. LG 베스트샵 카탈로그 반영 회귀
  //   - 에어드레서(스타일러) 비교항목이 3행에서 늘어났는지
  //   - 카탈로그에는 가격이 없어 price를 비운 모델이 "가격 문의"로 표기되는지
  //     (undefined만원으로 새는 것을 막는 가드)
  // ══════════════════════════════════════════
  {
    window.switchTab('db');
    window.selectCat('에어드레서');
    window.selectBrand('LG');
    val('sel-samsung').value = String(
      [...val('sel-samsung').querySelectorAll('option')].findIndex((o) => o.textContent.includes('DF80H24R1D')));
    val('sel-comp').value = String(
      [...val('sel-comp').querySelectorAll('option')].findIndex((o) => o.textContent.includes('SC5MBR80S')));
    window.renderResult();
    const dressLabels = [...val('spec-table').querySelectorAll('.spec-label')].map((td) => td.textContent);
    // DF80H24R1D는 카탈로그에 가격이 없어 가격 행이 빠지므로 5행(수납·하의·A/S·조작부·크기)이 정상
    assertTrue(dressLabels.length >= 5, `에어드레서 비교표가 ${dressLabels.length}행 — 카탈로그 반영 전(3행)으로 되돌아갔다`);
    ['하의 전용 관리', '조작부', '제품 크기'].forEach((t) => {
      assertTrue(dressLabels.some((l) => l.includes(t)), `에어드레서 비교표에 "${t}" 행이 없음`);
    });
    const dressVals = [...val('spec-table').querySelectorAll('.spec-val')].map((td) => td.textContent).join(' ');
    assertTrue(dressVals.includes('595 × 1,960 × 595'), '삼성 DF80H24R1D 치수(dp 카탈로그)가 렌더되지 않음');
    assertTrue(dressVals.includes('600 × 1,965 × 620'), 'LG SC5MBR80S 치수(LG 카탈로그)가 렌더되지 않음');

    assertTrue(![...val('sel-comp').querySelectorAll('option')].some((o) => o.textContent.includes('undefined')),
      '드롭다운에 undefined가 새어 나옴');

    /*
     * 가격 미확인 모델: 드롭다운은 "가격 문의", 비교표에는 가격 행이 아예 없어야 한다.
     * 예전에는 에어드레서 SC5GMR60S 로 봤는데 공식몰 가격을 채우면서 값이 생겼다.
     * 86MRGB96BKA 는 LG 공식몰에 아예 없는(오프라인 전용으로 보이는) 모델이라 가격을 못 채운다.
     */
    window.selectCat('TV');
    const optTexts = [...val('sel-comp').querySelectorAll('option')].map((o) => o.textContent);
    assertTrue(optTexts.some((t) => t.includes('86MRGB96BKA') && t.includes('가격 문의')),
      '가격 미확인 모델이 "가격 문의"로 표기되지 않음');
    val('sel-comp').value = String(optTexts.findIndex((t) => t.includes('86MRGB96BKA')));
    window.renderResult();
    assertTrue(![...val('spec-table').querySelectorAll('.spec-label')].some((td) => td.textContent.includes('가격')),
      '가격이 없는 모델인데 가격 행이 렌더됨');
    window.selectCat('에어드레서');

    // 로봇청소기 진공도 / 무선청소기 최대 흡입력 행
    window.selectCat('로봇청소기');
    window.selectBrand('LG');
    val('sel-samsung').value = '0';
    val('sel-comp').value = String(
      [...val('sel-comp').querySelectorAll('option')].findIndex((o) => o.textContent.includes('B95AWBTH')));
    window.renderResult();
    const robotLabels = [...val('spec-table').querySelectorAll('.spec-label')].map((td) => td.textContent);
    assertTrue(robotLabels.some((t) => t.includes('진공도')), '로봇청소기 비교표에 진공도 행이 없음');

    window.selectCat('청소기');
    window.selectBrand('LG');
    val('sel-samsung').value = '0';
    val('sel-comp').value = '0';
    window.renderResult();
    const vacLabels = [...val('spec-table').querySelectorAll('.spec-label')].map((td) => td.textContent);
    assertTrue(vacLabels.some((t) => t.includes('최대 흡입력')), '무선청소기 비교표에 최대 흡입력 행이 없음');
    console.log('[10-b] LG 카탈로그 반영(에어드레서·로봇청소기·무선청소기) + 가격 문의 처리 OK');
  }

  // ══════════════════════════════════════════
  // 10-c. LG 카탈로그 2차 반영 회귀 (세탁기·건조기·식기세척기·에어컨·냉장고·TV·노트북·인덕션)
  //   핵심은 "현장에서 반박당하는 문구"가 되살아나지 않게 막는 것이다.
  // ══════════════════════════════════════════
  {
    // (1) 삼성 콤보의 "국내 일체형 최대용량" 문구는 삭제됐어야 한다 —
    //     2026년형 LG 워시콤보(FC2521 계열)가 건조 21kg으로 삼성 20kg보다 크다.
    // on(기능칩)뿐 아니라 sells·counters·scripts까지 전부 훑는다 —
    // 처음엔 on만 검사해 건조기 sells에 같은 문구가 그대로 남아 배포까지 나간 적이 있다.
    ['세탁기·콤보', '건조기'].forEach((cat) => {
      const d = DB[cat];
      const texts = [
        ...d.samsung.flatMap((m) => m.on),
        ...(d.sells || []),
        ...(d.counters || []).flatMap((c) => [c.issue, c.strategy]),
        ...(d.scripts || []).flatMap((c) => [c.trigger, c.text]),
      ];
      texts.forEach((t) => {
        // 대응전략의 "'국내 최대용량'이라는 표현은 쓰지 마세요"는 금지 지시문이라 통과시킨다
        if (/쓰지 마세요/.test(t)) return;
        assertTrue(!/최대용량/.test(t),
          `${cat}에 "최대용량" 문구가 남아 있음 — LG 21kg 대비 사실이 아니다: ${t.slice(0, 60)}`);
        // "LG는 15kg" 같은 단정도 금지 — 2026년형은 21kg이라 구세대만 15kg이다
        assertTrue(!/LG\(15kg\)|LG는 건조 용량이 15kg/.test(t),
          `${cat}에 "LG=15kg" 단정이 남아 있음 — 2026년형 LG는 21kg이다: ${t.slice(0, 60)}`);
      });
    });
    const lgCombo = DB['세탁기·콤보'].competitors['LG'].find((m) => m.name.includes('FC2521SX6C'));
    assertTrue(!!lgCombo, '세탁기·콤보에 LG 워시콤보 FC2521SX6C가 없음');
    assertEq(lgCombo.specs.dry, 21, 'LG FC2521SX6C 건조 용량이 카탈로그값(21kg)이 아님');

    // (2) TV — LG도 Micro RGB를 내므로 "삼성만의 기술" 류 문구가 있으면 안 된다
    const lgTv = DB['TV'].competitors['LG'];
    assertTrue(lgTv.some((m) => m.specs.panel === 'Micro RGB'),
      'TV 경쟁사에 LG Micro RGB가 없음 — 카탈로그 반영이 되돌아갔다');
    assertTrue(!DB['TV'].sells.some((t) => t.includes('삼성 독자 기술')),
      'TV 셀링포인트에 "삼성 독자 기술" 문구가 남아 있음 — LG도 Micro RGB를 낸다');

    // (3) 노트북 — 그램에도 OLED 트림이 있으므로 "그램 IPS" 단정 금지
    assertTrue(DB['노트북'].competitors['LG'].some((m) => m.name.includes('16Z90U-KU7HK')),
      '노트북에 LG 그램 OLED 트림(16Z90U-KU7HK)이 없음');

    // (4) 각 카테고리 비교표가 실제로 렌더되고 신규 행이 나오는지 (DOM)
    const cases = [
      ['세탁기·콤보', 'FC2521SX6C', ['건조 용량', '제품 크기'], '700 × 990 × 885'],
      ['식기세척기', 'DEE6BGE',     ['설치 타입', '제품 크기'], '598 × 815 × 567'],
      ['에어컨',     'FQ25GN9BE1',  ['냉방 면적', '실내기 크기'], '380 × 1,915 × 295'],
      // M876GGA431 은 단종되어 후속 M876GBB231 로 교체했다(같은 라인·871L·1등급, 치수 동일)
      ['냉장고',     'M876GBB231',  ['총 용량', '제품 크기'], '914 × 1,860 × 918'],
      ['TV',        '86MRGB96BKA', ['패널 방식', '제품 크기'], '1,925 × 1,105 × 46.1'],
      ['인덕션',     'BEF3ANHLE',   ['전체 출력', '상판 타공'], '580 × 520 × 59'],
    ];
    cases.forEach(([cat, code, labels, dim]) => {
      window.selectCat(cat);
      window.selectBrand('LG');
      const opts = [...val('sel-comp').querySelectorAll('option')].map((o) => o.textContent);
      const idx = opts.findIndex((t) => t.includes(code));
      assertTrue(idx >= 0, `${cat} 경쟁사 드롭다운에 ${code}가 없음`);
      val('sel-comp').value = String(idx);
      // 삼성 쪽도 해당 스펙을 가진 모델을 골라야 행이 렌더된다
      const sOpts = val('sel-samsung').querySelectorAll('option');
      let rendered = null;
      for (let i = 0; i < sOpts.length; i++) {
        val('sel-samsung').value = String(i);
        window.renderResult();
        const ls = [...val('spec-table').querySelectorAll('.spec-label')].map((td) => td.textContent);
        if (labels.every((l) => ls.some((t) => t.includes(l)))) { rendered = ls; break; }
      }
      assertTrue(!!rendered, `${cat}(${code}) 비교표에 ${labels.join('·')} 행이 어떤 조합에서도 렌더되지 않음`);
      const vals = [...val('spec-table').querySelectorAll('.spec-val')].map((td) => td.textContent).join(' ');
      assertTrue(vals.includes(dim), `${cat}(${code}) 카탈로그 치수 "${dim}"가 렌더되지 않음`);
    });
    console.log(`[10-c] LG 카탈로그 2차 반영 ${cases.length}개 카테고리 + 과장문구 가드 OK`);
  }

  // ══════════════════════════════════════════
  // 11. 즉시비교 직접등록 — 저장 → DB 병합 → 결과 렌더 → 삭제
  // ══════════════════════════════════════════
  // 주의: 위 `DB`는 HTML 원문을 파싱한 별도 사본이라 런타임 등록이 반영되지 않는다.
  // 등록 결과는 실제로 화면에 나타나는 DOM(드롭다운·브랜드칩·비교표)으로 검증한다.
  {
    window.localStorage.removeItem('gw_compare_custom_v1');
    window.rebuildCustom();
    window.switchTab('db');
    window.selectCat('로봇청소기');
    const baseSamsung = val('sel-samsung').querySelectorAll('option').length;
    const baseBrands = doc.querySelectorAll('#brand-chips .brand-chip').length;

    window.openRegisterModal();
    assertTrue(val('reg-modal-overlay').classList.contains('visible'), 'openRegisterModal(): 모달이 열리지 않음');

    val('reg-cat').value = '로봇청소기';
    window.renderRegSpecInputs();
    val('reg-brand').value = '나르왈';
    val('reg-sam-name').value = '테스트 삼성 로봇 (VR99TEST)';
    val('reg-sam-price').value = '150';
    val('reg-sam-on').value = '자동급배수\n스팀살균';
    val('reg-comp-name').value = '나르왈 프리오 (TEST-N1)';
    val('reg-comp-price').value = '130';
    val('reg-comp-on').value = '스팀살균';

    // 카테고리 기본 비교항목(배터리) 입력칸이 자동 생성되는지
    const batS = val('reg-spec-inputs').querySelector('input[data-spec="bat"][data-side="s"]');
    const batC = val('reg-spec-inputs').querySelector('input[data-spec="bat"][data-side="c"]');
    assertTrue(!!batS && !!batC, 'renderRegSpecInputs(): 카테고리 비교항목 입력칸이 만들어지지 않음');
    batS.value = '220'; batC.value = '180';

    // 커스텀 비교 항목 추가
    window.addRegCustomItem();
    const cx = val('reg-custom-inputs').querySelector('.reg-item');
    cx.querySelector('.cx-label').value = '물걸레 회전수';
    cx.querySelector('.cx-unit').value = 'rpm';
    cx.querySelector('.cx-s').value = '200';
    cx.querySelector('.cx-c').value = '180';

    window.submitRegister();
    await wait(10);

    assertTrue(!val('reg-modal-overlay').classList.contains('visible'), 'submitRegister(): 모달이 닫히지 않음');
    assertEq(JSON.parse(window.localStorage.getItem('gw_compare_custom_v1')).length, 1,
      'submitRegister(): localStorage에 등록이 저장되지 않음');

    const labels = [...val('spec-table').querySelectorAll('.spec-label')].map((td) => td.textContent);
    assertTrue(labels.some((t) => t.includes('물걸레 회전수')), '등록 직후 비교표에 커스텀 항목이 없음');
    assertTrue(labels.some((t) => t.includes('배터리')), '등록 직후 비교표에 카테고리 기본 항목이 없음');
    assertTrue(val('res-subtitle').innerHTML.includes('직접등록'), '등록 모델인데 직접등록 배지가 없음');

    // 드롭다운·브랜드칩에 반영됐는지 (카테고리를 다시 열어 확인)
    window.selectCat('로봇청소기');
    assertEq(val('sel-samsung').querySelectorAll('option').length, baseSamsung + 1,
      'submitRegister(): 삼성 모델 드롭다운에 등록 모델이 추가되지 않음');
    const brandNames = [...doc.querySelectorAll('#brand-chips .brand-chip')].map((c) => c.textContent);
    assertTrue(brandNames.includes('나르왈'), 'submitRegister(): 새 브랜드 칩이 만들어지지 않음');

    // 재적용해도 중복되지 않아야 한다 (등록·삭제를 반복해도 안전)
    window.rebuildCustom();
    window.selectCat('로봇청소기');
    assertEq(val('sel-samsung').querySelectorAll('option').length, baseSamsung + 1,
      'rebuildCustom(): 재적용 시 모델이 중복 추가됨');

    // 삭제하면 DB·화면에서 완전히 빠져야 한다
    window.confirm = () => true;
    const id = JSON.parse(window.localStorage.getItem('gw_compare_custom_v1'))[0].id;
    window.deleteCustom(id);
    window.selectCat('로봇청소기');
    assertEq(val('sel-samsung').querySelectorAll('option').length, baseSamsung,
      'deleteCustom(): 등록 모델이 드롭다운에서 제거되지 않음');
    assertEq(doc.querySelectorAll('#brand-chips .brand-chip').length, baseBrands,
      'deleteCustom(): 빈 브랜드 칩이 남아 있음');
    window.selectBrand('LG');
    val('sel-samsung').value = '0'; val('sel-comp').value = '0';
    window.renderResult();
    const afterLabels = [...val('spec-table').querySelectorAll('.spec-label')].map((td) => td.textContent);
    assertTrue(!afterLabels.some((t) => t.includes('물걸레 회전수')), 'deleteCustom(): 커스텀 비교 항목이 남아 있음');
    console.log('[11] 즉시비교 직접등록 등록·병합·삭제 OK');
  }

  // ══════════════════════════════════════════
  // [12] 부정형 값('없음')은 문자열 항목에만 — 2026-08-14 규약
  // ══════════════════════════════════════════
  /*
   * 원문이 "없음"이라고 명시한 것은 값으로 넣는다. 빈 칸으로 두면 **우리가 없는 항목**이
   * 화면에서 통째로 사라져(비교표는 양쪽에 값이 있어야 행을 그린다) 상담사가 자기 약점을
   * 못 본다 — 삼성 AX060CG500GBD 는 UV 가 없는데 그 행이 12개 조합 중 10개에서 빠졌다.
   *
   * 다만 **수치 비교 항목에 넣으면 비교가 통째로 무너진다.** 우열 판정은 양쪽이 숫자일
   * 때만 도는데, 한쪽이 문자열이 되면 그 항목은 영영 무승부가 된다. 그 경계를 지킨다.
   */
  {
    const NEG = /^(없음|미지원|미제공)$/;
    const bad = [];
    let seen = 0;
    for (const [cat, v] of Object.entries(DB)) {
      const all = [...(v.samsung || []), ...Object.values(v.competitors || {}).flat()];
      for (const mo of all) {
        for (const [k, val] of Object.entries(mo.specs || {})) {
          if (!NEG.test(String(val))) continue;
          seen++;
          /* 같은 항목에 숫자를 쓰는 모델이 하나라도 있으면 그건 수치 비교 항목이다 */
          if (all.some((x) => typeof (x.specs || {})[k] === 'number')) {
            bad.push(`[${cat}] ${k} — 수치 항목에 '${val}' (${String(mo.name).slice(0, 28)})`);
          }
        }
      }
    }
    if (bad.length) fail(`[12] 부정형 값 규약 위반 — 수치 비교가 무너진다: ${bad.join(' / ')}`);
    else console.log(`[12] 부정형 값 ${seen}건 — 전부 문자열 항목 OK`);
  }

  /*
   * [13] 값을 모르는 항목("미공개") — 단위도 배지도 붙지 않아야 한다
   *
   * [12] 가 막는 '없음'과 성격이 다르다. '없음'은 **제품에 그 기능이 없다**는 사실이고,
   * '미공개'는 **제조사가 값을 밝히지 않았다**는 뜻이다 — 애플은 아이폰 RAM 을 사양
   * 지면에 아예 적지 않는다(확인함). 그래서 수치 항목(RAM)에 들어가는데, 그대로 두면
   * 두 가지가 화면에서 거짓말을 한다:
   *   ① 단위가 무조건 붙어 **"미공개GB"**
   *   ② 우열 판정이 숫자에서만 도므로 배지가 **"🟡 동급"** — 12GB 와 동급이 아니다
   * `unitOf()` 와 `specUnknown()` 이 그 둘을 막는다. 이 검사는 **렌더된 표를 직접 읽어**
   * 확인한다 — 함수만 부르면 호출부가 그것을 안 쓰게 바뀌어도 통과한다.
   */
  {
    /*
     * 판정 목록은 **앱에서 읽어 온다.** 여기 따로 적으면 앱에 표기를 하나 더 넣었을 때
     * 검사가 그것을 안 보고 조용히 통과한다(실제로 '비대상'을 넣자마자 어긋났다).
     */
    const UNK = window.UNKNOWN_SPEC;
    /* `instanceof RegExp` 로 보면 안 된다 — jsdom 안에서 만든 정규식은 **다른 realm** 의
       객체라 Node 쪽 RegExp 의 인스턴스가 아니다(항상 거짓이 된다). 동작으로 확인한다. */
    if (typeof UNK?.test !== 'function') fail('[13] UNKNOWN_SPEC 을 앱에서 못 읽음 — 이름이 바뀌었는지 확인할 것');
    /* 미공개 값이 실제로 있는 (카테고리, 항목) 을 데이터에서 찾는다 */
    const targets = [];
    for (const [cat, v] of Object.entries(DB)) {
      if (!v.specItems) continue;
      const all = [...(v.samsung || []), ...Object.values(v.competitors || {}).flat()];
      for (const it of v.specItems) {
        if (all.some((m) => UNK.test(String((m.specs || {})[it.key])))) targets.push([cat, it]);
      }
    }
    if (!targets.length) {
      console.log("[13] '미공개' 값 없음 — 건너뜀");
    } else {
      const bad = [];
      let checked = 0;
      for (const [cat, it] of targets) {
        const v = DB[cat];
        for (const [brand, models] of Object.entries(v.competitors || {})) {
          window.selectCat(cat);
          window.selectBrand(brand);
          for (let si = 0; si < (v.samsung || []).length; si++) {
            for (let ci = 0; ci < models.length; ci++) {
              const sv = (v.samsung[si].specs || {})[it.key];
              const cv = (models[ci].specs || {})[it.key];
              if (sv === undefined || cv === undefined) continue;
              if (!UNK.test(String(sv)) && !UNK.test(String(cv))) continue;

              val('sel-samsung').value = String(si);
              val('sel-comp').value = String(ci);
              window.renderResult();
              checked++;

              const row = [...val('spec-table').querySelectorAll('tr')]
                .find((tr) => tr.querySelector('.spec-label')?.textContent.startsWith(it.label));
              if (!row) { bad.push(`[${cat}] ${it.label} 행이 안 그려짐`); continue; }
              const cells = [...row.querySelectorAll('.spec-val')].map((td) => td.textContent.trim());

              /* ① 값을 모른다고 적은 칸에 단위가 붙었나 — "미공개GB" */
              if (it.unit) {
                const glued = cells.find((t) => new RegExp(`(미공개|미상|확인 필요)\\s*${it.unit}`).test(t));
                if (glued) bad.push(`[${cat}] ${it.label} 단위가 붙음: "${glued}"`);
              }
              /* ② 우열·동급 배지가 붙었나 — 모르는 값에 "동급"은 거짓말이다 */
              const badged = cells.find((t) => /우위|열위|동급/.test(t));
              if (badged) bad.push(`[${cat}] ${it.label} 값을 모르는데 배지: "${badged}"`);
            }
          }
        }
      }
      if (bad.length) fail(`[13] 미공개 표기 위반: ${[...new Set(bad)].slice(0, 6).join(' / ')}`);
      else console.log(`[13] '미공개' 항목 ${targets.length}종 · 조합 ${checked}개 — 단위·배지 안 붙음 OK`);
    }
  }

  // ══════════════════════════════════════════
  // 결과
  // ══════════════════════════════════════════
  console.log(ok ? 'ALL PASS' : 'SOME FAILED');
  process.exit(ok ? 0 : 1);
})();
