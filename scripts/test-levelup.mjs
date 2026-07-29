// 레벨업테스트(public/test-app.html) 회귀 테스트
// 실행: node scripts/test-levelup.mjs
//
// 커버리지:
//  1. 초기 렌더 (로그인 화면만 표시, 전역 함수 노출)
//  2. escHtml XSS 이스케이프 단위 테스트
//  3. startQuiz 입력값 검증 (지점명/이름 미입력 에러)
//  4. startQuiz 문항 구성 — CE/MX/CE+MX 모드별 25문항(24객관식+1주관식), 중복 없음, 4지선다
//  5. 이름/사번(지점명) XSS 회귀 — 악성 문자열이 결과 화면 DOM에 살아있는 엘리먼트로 삽입되지 않는지
//  6. selectOpt / updateProgress 진행률 계산
//  7. showResults 채점 — 만점/0점/부분점수 시나리오에서 CE/MX/에세이 점수가 NaN·undefined 없이 정상 계산
//  8. saveToGoogle — 실제 네트워크(Google Apps Script POST)를 막고 예외 없이 흐름을 타는지 확인
//
// 주의: st 객체는 startQuiz 이후 answers/submitted가 리셋되지 않으므로(재시험 UI 없음),
// 시나리오마다 반드시 새 JSDOM 인스턴스를 생성한다.

import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '..', 'public', 'test-app.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

let ok = true;
function assert(cond, msg) {
  if (!cond) { console.log('ERROR:', msg); ok = false; }
  else { console.log('OK:', msg); }
}

function loadDom() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'https://example.com/' });
  const { window } = dom;
  window.alert = () => {};
  window.scrollTo = () => {};
  window.Element.prototype.scrollIntoView = () => {};
  // saveToGoogle()은 fetch가 아니라 hidden iframe + <form method=POST> 제출로 Google Apps Script에
  // 데이터를 보낸다. jsdom은 기본적으로 form.submit()의 실제 네비게이션을 구현하지 않아 실제 네트워크
  // 호출은 발생하지 않지만("Not implemented" 콘솔 에러만 출력), 테스트에서는 이를 명시적으로 no-op으로
  // 막아 잡음 없이/결정적으로 검증한다. 지시사항에 따라 전역 fetch도 함께 mock한다(코드가 fetch를 쓰지
  // 않으므로 호출되면 안 됨 — 즉 fetch 호출 횟수 0이 기대값).
  window.HTMLFormElement.prototype.submit = function () { window.__formSubmitCalled = (window.__formSubmitCalled || 0) + 1; };
  let fetchCalls = 0;
  window.fetch = async (...args) => { fetchCalls++; throw new Error('fetch should not be called: ' + JSON.stringify(args)); };
  Object.defineProperty(window, '__fetchCalls', { get: () => fetchCalls });
  return dom;
}

function getSt(window, expr) {
  return window.eval(expr);
}

async function startFresh(mode, empId, empName) {
  const dom = loadDom();
  const { window } = dom;
  await wait(50);
  const doc = window.document;
  if (empId !== undefined) doc.getElementById('empId').value = empId;
  if (empName !== undefined) doc.getElementById('empName').value = empName;
  if (mode === 'ce') doc.getElementById('modeCe').checked = true;
  else if (mode === 'mx') doc.getElementById('modeMx').checked = true;
  else doc.getElementById('modeCeMx').checked = true;
  window.startQuiz();
  return dom;
}

(async () => {
  // ── 1. 초기 렌더 ──────────────────────────────────────────
  {
    const dom = loadDom();
    const { window } = dom;
    await wait(50);
    const doc = window.document;
    assert(doc.getElementById('loginScreen') !== null, '[초기렌더] loginScreen 존재');
    assert(doc.getElementById('quizScreen').style.display === 'none', '[초기렌더] quizScreen 초기 숨김');
    assert(doc.getElementById('resultScreen').innerHTML.trim() === '', '[초기렌더] resultScreen 비어있음');
    for (const fn of ['startQuiz', 'renderQuiz', 'selectOpt', 'updateProgress', 'startTimer', 'showResults', 'saveToGoogle', 'escHtml', 'handleSubmit', 'prepareQ', 'shuffle', 'pickN']) {
      assert(typeof window[fn] === 'function', `[초기렌더] window.${fn} 전역 함수 노출`);
    }
  }

  // ── 2. escHtml 이스케이프 단위 테스트 (XSS 회귀 방지 핵심) ──
  {
    const dom = loadDom();
    const { window } = dom;
    await wait(50);
    const cases = [
      ['<', '&lt;'],
      ['>', '&gt;'],
      ['"', '&quot;'],
      ["'", '&#39;'],
      ['&', '&amp;'],
      ['<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;'],
      ['"><img src=x onerror=alert(1)>', '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'],
      ["'-alert(1)-'", '&#39;-alert(1)-&#39;'],
      ['평범한 한글 이름', '평범한 한글 이름'],
    ];
    for (const [input, expected] of cases) {
      const out = window.escHtml(input);
      assert(out === expected, `[escHtml] escHtml(${JSON.stringify(input)}) → ${JSON.stringify(expected)} (실제: ${JSON.stringify(out)})`);
    }
  }

  // ── 3. startQuiz 입력값 검증 ──────────────────────────────
  {
    const dom = loadDom();
    const { window } = dom;
    await wait(50);
    const doc = window.document;
    doc.getElementById('empId').value = '';
    doc.getElementById('empName').value = '';
    window.startQuiz();
    assert(doc.getElementById('empErr').textContent === '지점명을 입력해주세요.', '[검증] 지점명 미입력 에러 메시지');
    assert(doc.getElementById('loginScreen').style.display !== 'none', '[검증] 지점명 미입력 시 로그인 화면 유지');

    doc.getElementById('empId').value = '수원점';
    doc.getElementById('empName').value = '';
    window.startQuiz();
    assert(doc.getElementById('nameErr').textContent === '이름을 입력해주세요.', '[검증] 이름 미입력 에러 메시지');
    assert(doc.getElementById('quizScreen').style.display === 'none', '[검증] 이름 미입력 시 시험 시작 안 됨');
  }

  // ── 4. startQuiz 문항 구성 (모드별) ───────────────────────
  {
    const modeCases = [
      { mode: 'ce', expectedTotal: 24, listVar: 'ALL_CE' },
      { mode: 'mx', expectedTotal: 24, listVar: 'ALL_MX' },
      { mode: 'cemx', expectedTotal: 24, ceCount: 16, mxCount: 8 },
    ];
    for (const c of modeCases) {
      const dom = await startFresh(c.mode, '수원점', '홍길동');
      const { window } = dom;
      await wait(50);
      const doc = window.document;

      const qCount = getSt(window, 'st.questions.length');
      assert(qCount === c.expectedTotal, `[문항구성:${c.mode}] 객관식 문항 수 = ${c.expectedTotal} (실제 ${qCount})`);

      const texts = getSt(window, 'st.questions.map(q=>q.q)');
      assert(new Set(texts).size === texts.length, `[문항구성:${c.mode}] 문항 중복 없음`);

      const optLens = getSt(window, 'st.questions.map(q=>q.shuffledOpts.length)');
      assert(optLens.every((n) => n === 4), `[문항구성:${c.mode}] 모든 문항 4지선다`);

      const ansRange = getSt(window, 'st.questions.map(q=>q.shuffledAns)');
      assert(ansRange.every((a) => a >= 0 && a <= 3), `[문항구성:${c.mode}] shuffledAns 0~3 범위`);

      if (c.listVar) {
        const inList = getSt(window, `st.questions.every(q=>${c.listVar}.includes(q.cat))`);
        assert(inList === true, `[문항구성:${c.mode}] 전 문항이 ${c.listVar} 카테고리 소속`);
      } else {
        const ceCnt = getSt(window, 'st.questions.filter(q=>ALL_CE.includes(q.cat)).length');
        const mxCnt = getSt(window, 'st.questions.filter(q=>ALL_MX.includes(q.cat)).length');
        assert(ceCnt === c.ceCount, `[문항구성:${c.mode}] CE 문항 수 = ${c.ceCount} (실제 ${ceCnt})`);
        assert(mxCnt === c.mxCount, `[문항구성:${c.mode}] MX 문항 수 = ${c.mxCount} (실제 ${mxCnt})`);
      }

      // DOM 렌더 확인: q-card 25개(24 객관식 + 1 주관식 essay), 객관식 카드마다 opt-btn 4개
      const qCards = doc.querySelectorAll('.q-card');
      assert(qCards.length === 25, `[문항구성:${c.mode}] DOM에 q-card 25개 렌더 (실제 ${qCards.length})`);
      assert(doc.getElementById('essayInput') !== null, `[문항구성:${c.mode}] Q25 주관식 textarea 렌더`);
      let allFourOpts = true;
      for (let qi = 0; qi < c.expectedTotal; qi++) {
        const btns = doc.querySelectorAll(`#qcard-${qi} .opt-btn`);
        if (btns.length !== 4) allFourOpts = false;
      }
      assert(allFourOpts, `[문항구성:${c.mode}] 각 문항 카드에 opt-btn 4개`);
    }
  }

  // ── 5. 이름/사번 XSS 회귀 테스트 ──────────────────────────
  {
    const maliciousName = '<img src=x onerror=alert(1)>';
    const maliciousEmpId = '"><svg onload=alert(2)>지점';
    const maliciousEssay = '<script>document.title="hacked"</script>';

    const dom = await startFresh('cemx', maliciousEmpId, maliciousName);
    const { window } = dom;
    await wait(50);
    const doc = window.document;

    // 주관식 입력에도 악성 문자열 입력 후 input 이벤트로 st.essay 반영
    const essayEl = doc.getElementById('essayInput');
    essayEl.value = maliciousEssay;
    essayEl.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert(doc.getElementById('essayCount').textContent === String(maliciousEssay.length), '[XSS] essayCount가 입력 길이 반영');

    // 강제 제출 (0문항 응답이어도 handleSubmit(true)는 통과)
    await window.handleSubmit(true);

    const resultScreenEl = doc.getElementById('resultScreen');
    const resultHtml = resultScreenEl.innerHTML;
    const resultText = resultScreenEl.textContent;
    // 살아있는 위험 엘리먼트가 생성되면 안 됨 (innerHTML 삽입 시 <script>는 애초에 실행되지 않지만,
    // <img onerror=...>/<svg onload=...>는 실제 브라우저에서 즉시 실행되므로 엘리먼트 자체가 생기면 안 된다)
    assert(doc.querySelectorAll('#resultScreen img').length === 0, '[XSS] resultScreen에 <img> 엘리먼트 생성 안 됨');
    assert(doc.querySelectorAll('#resultScreen svg').length === 0, '[XSS] resultScreen에 <svg> 엘리먼트 생성 안 됨');
    assert(doc.querySelectorAll('#resultScreen script').length === 0, '[XSS] resultScreen에 <script> 엘리먼트 생성 안 됨');
    // 원문 태그가 이스케이프되지 않은 채로 HTML 마크업에 살아있으면 안 됨 (innerHTML 문자열 레벨 검사)
    assert(!resultHtml.includes('<img src=x onerror=alert(1)>'), '[XSS] 이름 원문 태그가 unescaped로 삽입되지 않음');
    assert(!resultHtml.includes('<svg onload=alert(2)>'), '[XSS] 지점명 원문 태그가 unescaped로 삽입되지 않음');
    assert(!resultHtml.includes('<script>document.title'), '[XSS] 에세이 원문 <script> 태그가 unescaped로 삽입되지 않음');
    // 내용 자체는 사라지지 않고 순수 텍스트로 안전하게 표시되어야 함
    // (textContent는 파싱된 DOM 텍스트 노드를 그대로 읽으므로 &quot; 등 엔티티가 원래 문자로 복원되어 보이는 것이 정상 —
    //  중요한 건 이 문자열이 <img>/<svg>/<script> "엘리먼트"가 아니라 텍스트로만 존재한다는 점이다(위에서 이미 확인))
    assert(resultText.includes('img src=x onerror=alert(1)'), '[XSS] 이름 내용이 텍스트로 안전하게 보존됨');
    assert(resultText.includes('svg onload=alert(2)'), '[XSS] 지점명 내용이 텍스트로 안전하게 보존됨');
    assert(resultText.includes('document.title="hacked"'), '[XSS] 에세이 내용이 텍스트로 안전하게 보존됨');
  }

  // ── 6. selectOpt / updateProgress ────────────────────────
  {
    const dom = await startFresh('cemx', '수원점', '홍길동');
    const { window } = dom;
    await wait(50);
    const doc = window.document;

    assert(doc.getElementById('progressText').textContent === '0 / 24 답변 완료', '[진행률] 초기 0/24');
    assert(doc.getElementById('submitBtn').disabled === true, '[진행률] 초기 제출 버튼 비활성');

    window.selectOpt(0, 0);
    assert(doc.getElementById('progressText').textContent === '1 / 24 답변 완료', '[진행률] 1문항 응답 후 1/24');
    assert(doc.getElementById('opt-0-0').classList.contains('selected'), '[진행률] 선택한 opt-btn에 selected 클래스');
    assert(doc.getElementById('qcard-0').classList.contains('answered'), '[진행률] 응답한 q-card에 answered 클래스');

    // 같은 문항 재선택(다른 보기) — 이전 선택 해제되고 중복 카운트 안 됨
    window.selectOpt(0, 1);
    assert(doc.getElementById('progressText').textContent === '1 / 24 답변 완료', '[진행률] 같은 문항 재선택 시 카운트 유지(중복 없음)');
    assert(!doc.getElementById('opt-0-0').classList.contains('selected'), '[진행률] 재선택 시 이전 보기 selected 해제');
    assert(doc.getElementById('opt-0-1').classList.contains('selected'), '[진행률] 재선택 시 새 보기 selected 적용');

    for (let qi = 1; qi < 24; qi++) window.selectOpt(qi, 0);
    assert(doc.getElementById('progressText').textContent === '24 / 24 답변 완료', '[진행률] 24문항 전부 응답 시 24/24');
    assert(doc.getElementById('submitBtn').disabled === false, '[진행률] 24/24 완료 시 제출 버튼 활성화');
    assert(doc.getElementById('submitBtn').textContent === '제출하기', '[진행률] 24/24 완료 시 버튼 텍스트 "제출하기"');
  }

  // ── 7. showResults 채점 시나리오 ─────────────────────────
  // 7-a. 만점 (객관식 전부 정답 + 에세이 작성)
  {
    const dom = await startFresh('cemx', '수원점', '만점왕');
    const { window } = dom;
    await wait(50);
    const doc = window.document;
    const shuffledAns = getSt(window, 'st.questions.map(q=>q.shuffledAns)');
    shuffledAns.forEach((ans, qi) => window.selectOpt(qi, ans));
    const essayEl = doc.getElementById('essayInput');
    essayEl.value = 'AI로 재고 확인을 자동화하고 싶습니다.';
    essayEl.dispatchEvent(new window.Event('input', { bubbles: true }));

    await window.handleSubmit(false);

    const scoreVals = [...doc.querySelectorAll('.score-box-val')].map((el) => el.textContent);
    assert(scoreVals.every((v) => v !== 'NaN' && v !== 'undefined' && v.trim() !== ''), `[채점:만점] 점수 박스에 NaN/undefined 없음 (${scoreVals.join(',')})`);
    assert(scoreVals[0] === '64', `[채점:만점] CE(16문항) 만점 64점 (실제 ${scoreVals[0]})`);
    assert(scoreVals[1] === '32', `[채점:만점] MX(8문항) 만점 32점 (실제 ${scoreVals[1]})`);
    assert(scoreVals[2] === '4', `[채점:만점] 에세이 작성 시 4점 (실제 ${scoreVals[2]})`);
    const totalText = doc.querySelector('.score-main').firstChild.textContent.trim();
    assert(totalText === '100', `[채점:만점] 총점 100점 (실제 ${totalText})`);
    assert(doc.querySelector('.score-grade').classList.contains('grade-s'), '[채점:만점] S등급 부여');
    assert(doc.querySelector('.all-correct') !== null, '[채점:만점] 오답 없음 안내 문구 표시');
    assert(doc.querySelector('.wrong-section') === null, '[채점:만점] 오답 섹션 미표시');
  }

  // 7-b. 0점 (미응답 강제 제출, 에세이 미작성)
  {
    const dom = await startFresh('cemx', '수원점', '영점이');
    const { window } = dom;
    await wait(50);
    const doc = window.document;

    await window.handleSubmit(true); // 아무 응답도 하지 않고 강제 제출(타이머 만료 시나리오와 동일 경로)

    const scoreVals = [...doc.querySelectorAll('.score-box-val')].map((el) => el.textContent);
    assert(scoreVals.every((v) => v !== 'NaN' && v !== 'undefined' && v.trim() !== ''), `[채점:0점] 점수 박스에 NaN/undefined 없음 (${scoreVals.join(',')})`);
    assert(scoreVals[0] === '0', `[채점:0점] CE 0점 (실제 ${scoreVals[0]})`);
    assert(scoreVals[1] === '0', `[채점:0점] MX 0점 (실제 ${scoreVals[1]})`);
    assert(scoreVals[2] === '0', `[채점:0점] 에세이 미작성 시 0점 (실제 ${scoreVals[2]})`);
    const totalText = doc.querySelector('.score-main').firstChild.textContent.trim();
    assert(totalText === '0', `[채점:0점] 총점 0점 (실제 ${totalText})`);
    assert(doc.querySelector('.score-grade').classList.contains('grade-c'), '[채점:0점] C등급 부여');
    const wrongItems = doc.querySelectorAll('.wrong-item');
    assert(wrongItems.length === 24, `[채점:0점] 오답 24문항 전부 표시 (실제 ${wrongItems.length})`);
    assert(doc.querySelector('.wrong-my').textContent.includes('미응답'), '[채점:0점] 미응답 문항은 "(미응답)"으로 표시');
  }

  // 7-c. 부분 정답 (CE/MX 각각 절반 정답, ce 단일 모드)
  {
    const dom = await startFresh('ce', '수원점', '반타작');
    const { window } = dom;
    await wait(50);
    const doc = window.document;
    const shuffledAns = getSt(window, 'st.questions.map(q=>q.shuffledAns)');
    shuffledAns.forEach((ans, qi) => {
      const correct = qi % 2 === 0; // 짝수 인덱스만 정답
      const chosen = correct ? ans : (ans + 1) % 4;
      window.selectOpt(qi, chosen);
    });
    await window.handleSubmit(false);

    const scoreVals = [...doc.querySelectorAll('.score-box-val')].map((el) => el.textContent);
    assert(scoreVals.every((v) => v !== 'NaN' && v !== 'undefined' && v.trim() !== ''), `[채점:부분] 점수 박스에 NaN/undefined 없음 (${scoreVals.join(',')})`);
    // ce 단일 모드는 24문항 중 12문항(짝수 인덱스) 정답 → 48점
    assert(scoreVals[0] === '48', `[채점:부분] CE 24문항 중 12문항 정답 = 48점 (실제 ${scoreVals[0]})`);
    const totalText = doc.querySelector('.score-main').firstChild.textContent.trim();
    assert(totalText === '48', `[채점:부분] 총점 48점(에세이 미작성) (실제 ${totalText})`);
    assert(doc.querySelector('.score-grade').classList.contains('grade-c'), '[채점:부분] C등급(48점 < 60) 부여');
  }

  // ── 8. saveToGoogle / 네트워크 차단 확인 ─────────────────
  {
    const dom = await startFresh('cemx', '수원점', '저장확인');
    const { window } = dom;
    await wait(50);
    let threw = false;
    try {
      await window.handleSubmit(true);
    } catch (e) {
      threw = true;
      console.log('  예외 내용:', e.message);
    }
    assert(!threw, '[saveToGoogle] handleSubmit → saveToGoogle 흐름에서 예외 발생 안 함');
    assert(window.__fetchCalls === 0, '[saveToGoogle] 전역 fetch가 호출되지 않음 (iframe+form POST 방식이므로 0회가 정상)');
    assert(window.__formSubmitCalled === 1, '[saveToGoogle] form.submit()이 정확히 1회 호출됨(=Apps Script로 제출 시도했으나 mock으로 실제 네트워크는 차단됨)');
    const driveStatus = window.document.getElementById('driveStatus');
    assert(driveStatus !== null && driveStatus.textContent.includes('저장 중'), '[saveToGoogle] 제출 직후 "저장 중..." 상태 표시(실제 네트워크 응답은 mock으로 차단되어 대기 상태 유지)');
  }

  console.log(ok ? 'ALL PASS' : 'SOME FAILED');
  process.exit(ok ? 0 : 1);
})();
