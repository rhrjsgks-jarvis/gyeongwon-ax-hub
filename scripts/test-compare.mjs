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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '..', 'public', 'compare-app.html');
const rawHtml = fs.readFileSync(htmlPath, 'utf8');

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
  await wait(200);

  // ══════════════════════════════════════════
  // 0. 초기 렌더 — 에러 없이 로드되는지
  // ══════════════════════════════════════════
  assertTrue(doc.getElementById('tab-db') !== null, '초기 렌더 실패: #tab-db 없음');
  assertEq(doc.querySelectorAll('.cat-btn').length, 10, '카테고리 버튼 개수가 10개가 아님');
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
  assertEq(CATS.length, 10, 'DB 카테고리 개수가 10개가 아님 (카테고리 추가/삭제 시 이 테스트도 함께 확인할 것)');

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
  assertTrue(tv.samsung.every((m) => m.name.includes('QNH80')), 'TV 회귀: 삼성 라인업이 QNH80(2026)이 아닌 구세대로 되돌아감');
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
  // 결과
  // ══════════════════════════════════════════
  console.log(ok ? 'ALL PASS' : 'SOME FAILED');
  process.exit(ok ? 0 : 1);
})();
