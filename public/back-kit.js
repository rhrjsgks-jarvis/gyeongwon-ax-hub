/*
 * 뒤로가기 — 미니앱 공용.
 *
 * **휴대폰 뒤로가기를 누르면 앱이 통째로 닫혔다.** 시트·모달·드롭다운을 열어 둔 채
 * 뒤로가기를 누르면 그것만 닫히기를 기대하는데, 허브를 벗어나 버린다. 배치 시뮬레이터는
 * 2026-08-09 에 자체 `pushBack`/`stepBack` 으로 이 문제를 풀었지만 나머지 여덟 앱은
 * 그대로였다(2026-08-13 정리).
 *
 * **한 곳에 모아 두는 이유** — 앱마다 복사하면 고칠 일이 생길 때 여덟 곳을 고쳐야 한다
 * (share-kit.js·prod-symbols.js 와 같은 이유).
 *
 * ── 쓰는 법 ──
 *   여는 곳에서   Back.open(닫는함수, 열렸나판정)
 *   직접 닫을 때  Back.done()        ← 빠뜨려도 스스로 낫는다(아래)
 *
 * ── 어떻게 동작하나 ──
 * 무언가를 열 때 히스토리를 한 칸 쌓아 두면, 휴대폰 뒤로가기가 **그 칸부터** 소비한다.
 * 앱을 벗어나려면 쌓아 둔 칸을 다 쓴 뒤라야 한다.
 *
 * ── 빠뜨림을 견딘다 ──
 * 사용자가 X 로 직접 닫으면 쌓아 둔 칸이 남는다. 그대로 두면 **뒤로가기 한 번이 아무 일도
 * 안 하고 삼켜진다** — 배치 시뮬레이터가 지금 그렇다. 그래서 등록할 때 닫기 함수와 함께
 * **"아직 열려 있나"** 를 물어볼 수 있는 판정자를 받는다. 뒤로가기가 오면 스택 위에서부터
 * 이미 닫힌 것을 건너뛰고 **실제로 열려 있는 첫 항목**을 닫는다. 판정자를 넘기지 않으면
 * 예전처럼 무조건 닫기를 부르므로, **닫기 함수는 이미 닫힌 상태에서 불려도 안전해야 한다.**
 *
 * ── 주의 ──
 * 미니앱은 iframe 안에서 돌지만 `history.pushState` 는 **브라우저 전체 히스토리**에 쌓인다.
 * 그래서 바깥(허브)의 뒤로가기가 이 칸을 먼저 소비한다 — 배치 시뮬레이터에서 확인된 동작이다.
 */
(function (global) {
  'use strict';

  /** 열려 있는 것들. 나중에 연 것이 뒤에 온다 */
  var stack = [];
  /** 우리가 스스로 부른 history.back() 이 낳을 popstate 개수 — 그것까지 닫으면 두 번 닫힌다 */
  var quiet = 0;
  /**
   * 뒤로가기가 부른 닫기가 도는 중인가.
   *
   * 앱의 닫기 함수는 대개 `Back.done()` 을 함께 부른다(직접 닫는 경로에서 필요하다).
   * 그 함수를 뒤로가기가 부르면 done() 이 스택을 한 칸 더 까고 `history.back()` 을 또 불러
   * **한 번 눌렀는데 두 단계가 물린다.** 배선을 여덟 앱에 흩뿌리면 반드시 재발하는 형태라
   * 여기서 원천적으로 막는다 — 도는 동안 done() 은 아무 일도 하지 않는다.
   */
  var closing = false;

  function push() {
    try { history.pushState({ bk: stack.length + 1 }, ''); return true; }
    catch (e) { return false; }
  }

  /**
   * 무언가를 열었다고 알린다.
   * @param close  닫는 함수. **이미 닫힌 상태에서 불려도 안전해야 한다.**
   * @param isOpen (선택) 아직 열려 있는지 돌려주는 함수. 있으면 빠뜨림을 스스로 고친다.
   */
  function open(close, isOpen) {
    if (typeof close !== 'function') return;
    stack.push({ close: close, isOpen: typeof isOpen === 'function' ? isOpen : null, pushed: push() });
  }

  /**
   * 앱이 스스로 닫았다 — 쌓아 둔 히스토리 칸도 함께 되돌린다.
   * 부르지 않아도 다음 뒤로가기 때 정리되지만, 부르면 그 한 번을 아끼게 된다.
   */
  function done() {
    if (closing) return;                 // 뒤로가기가 부른 닫기다 — 이미 물리는 중이다
    var top = stack.pop();
    if (!top || !top.pushed) return;
    quiet++;
    try { history.back(); } catch (e) { quiet--; }
  }

  /** 한 단계 물린다. 실제로 닫은 것이 있으면 true */
  function step() {
    while (stack.length) {
      var top = stack.pop();
      if (top.isOpen && !top.isOpen()) continue;   // 이미 직접 닫혔다 — 계속 물린다
      closing = true;
      try { top.close(); } catch (e) {}
      closing = false;
      return true;
    }
    return false;
  }

  global.addEventListener('popstate', function () {
    if (quiet > 0) { quiet--; return; }
    step();
  });

  global.Back = {
    open: open, done: done, step: step,
    /** 지금 몇 개가 쌓여 있나 — 테스트와 디버깅용 */
    depth: function () { return stack.length; },
    /** 테스트용 초기화. 화면에서는 쓰지 않는다 */
    _reset: function () { stack = []; quiet = 0; },
  };
})(window);
