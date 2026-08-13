/*
 * 뒤로가기 공용 스택(`public/back-kit.js`) 회귀 검사.
 *
 * 이 기능의 고장은 **화면에 아무 표시도 안 난다** — 뒤로가기를 눌렀는데 아무 일이
 * 안 일어나거나(칸이 남았다) 두 단계가 한꺼번에 물린다(칸을 두 번 깠다). 매장에서
 * 폰으로 써 봐야 알게 되므로 여기서 잡는다.
 *
 * jsdom 의 history 는 실제 브라우저와 달리 `history.back()` 이 동기로 popstate 를
 * 쏘지 않는다. 그래서 popstate 를 직접 발생시켜 "뒤로가기가 왔다"를 흉내 낸다 —
 * back-kit 이 보는 것은 그 이벤트뿐이라 검사로서 성립한다.
 */
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../public/back-kit.js', import.meta.url), 'utf8');

let fail = 0;
const ok = (cond, label) => {
  console.log((cond ? 'OK: ' : 'FAIL: ') + label);
  if (!cond) fail++;
};

function fresh() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://x.test/app.html', runScripts: 'outside-only' });
  const w = dom.window;
  /* history.back() 은 jsdom 에서 비동기라 검사에 쓸 수 없다 — 부른 횟수만 센다 */
  w.__backCalls = 0;
  const realBack = w.history.back.bind(w.history);
  w.history.back = () => { w.__backCalls++; };
  w.eval(src);
  /** 뒤로가기가 왔다 */
  w.pop = () => w.dispatchEvent(new w.PopStateEvent('popstate'));
  return w;
}

/* [1] 열면 히스토리를 쌓고, 뒤로가기가 그것을 닫는다 */
{
  const w = fresh();
  let open = true;
  const before = w.history.length;
  w.Back.open(() => { open = false; }, () => open);
  ok(w.history.length === before + 1, '[1] 열면 히스토리를 한 칸 쌓는다');
  w.pop();
  ok(open === false, '[1] 뒤로가기가 그 항목을 닫는다');
  ok(w.Back.depth() === 0, '[1] 닫으면 스택이 비워진다');
}

/* [2] 여러 개를 열면 나중에 연 것부터 닫힌다 */
{
  const w = fresh();
  const state = { a: true, b: true };
  w.Back.open(() => { state.a = false; }, () => state.a);
  w.Back.open(() => { state.b = false; }, () => state.b);
  w.pop();
  ok(state.b === false && state.a === true, '[2] 나중에 연 것부터 닫힌다');
  w.pop();
  ok(state.a === false, '[2] 그다음 것이 닫힌다');
}

/* [3] 직접 닫으면 쌓아 둔 칸도 되돌린다 */
{
  const w = fresh();
  let open = true;
  const close = () => { open = false; w.Back.done(); };
  w.Back.open(close, () => open);
  close();
  ok(w.__backCalls === 1, '[3] 직접 닫으면 history.back() 을 부른다');
  ok(w.Back.depth() === 0, '[3] 스택도 비워진다');
}

/*
 * [4] **뒤로가기가 부른 닫기 안에서 done() 이 또 불려도 두 단계가 물리지 않는다.**
 * 앱의 닫기 함수는 대개 done() 을 함께 부르므로 이 경우가 실제로 늘 일어난다.
 */
{
  const w = fresh();
  const state = { a: true, b: true };
  w.Back.open(() => { state.a = false; w.Back.done(); }, () => state.a);
  w.Back.open(() => { state.b = false; w.Back.done(); }, () => state.b);
  w.pop();
  ok(state.b === false && state.a === true, '[4] 뒤로가기 한 번에 한 단계만 물린다');
  ok(w.__backCalls === 0, '[4] 그 안의 done() 은 history.back() 을 부르지 않는다');
}

/*
 * [5] **done() 을 빠뜨린 경로가 있어도 스스로 낫는다.**
 * 배선을 여덟 앱에 흩뿌리면 빠뜨림이 반드시 생긴다. 판정자가 "이미 닫혔다"고 알려 주면
 * 그 칸을 건너뛰고 진짜 열려 있는 것을 닫는다 — 뒤로가기가 헛도는 일이 없다.
 */
{
  const w = fresh();
  const state = { a: true, b: true };
  w.Back.open(() => { state.a = false; }, () => state.a);
  w.Back.open(() => { state.b = false; }, () => state.b);
  state.b = false;                       // X 로 직접 닫았는데 done() 을 안 불렀다
  w.pop();
  ok(state.a === false, '[5] 빠뜨린 칸을 건너뛰고 실제로 열린 것을 닫는다');
}

/* [6] 물릴 것이 없으면 아무 일도 하지 않는다 — 앱을 벗어나는 것은 브라우저 몫이다 */
{
  const w = fresh();
  ok(w.Back.step() === false, '[6] 빈 스택에서 step() 은 false');
  w.pop();
  ok(w.Back.depth() === 0, '[6] 예외 없이 지나간다');
}

/* [7] 판정자를 안 넘기면 예전처럼 무조건 닫는다(닫기 함수가 멱등해야 한다) */
{
  const w = fresh();
  let n = 0;
  w.Back.open(() => { n++; });
  w.pop();
  ok(n === 1, '[7] 판정자 없이도 닫힌다');
}

/*
 * [8] **아홉 앱이 back-kit 을 싣고 있는가.** 스크립트 태그를 빠뜨리면 그 앱만 조용히
 * 예전 동작(앱을 벗어남)으로 돌아간다 — 화면에 아무 표시도 안 난다.
 * 배치 시뮬레이터는 자체 `pushBack`/`stepBack` 을 갖고 있어 제외다(더 많은 것을 물린다).
 */
{
  const dir = new URL('../public/', import.meta.url);
  const apps = ['as', 'care', 'compare', 'finder', 'install', 'poster', 'quiz', 'test'];
  const miss = apps.filter((a) => !fs.readFileSync(new URL(a + '-app.html', dir), 'utf8')
    .includes('<script src="back-kit.js"></script>'));
  ok(miss.length === 0, '[8] 여덟 앱 전부 back-kit.js 를 싣는다' + (miss.length ? ' — 빠진 앱: ' + miss.join(', ') : ''));
  const place = fs.readFileSync(new URL('place-app.html', dir), 'utf8');
  ok(/function\s+stepBack/.test(place), '[8] 배치 시뮬레이터는 자체 뒤로가기를 그대로 갖고 있다');
}

/*
 * [9] **서비스워커가 공용 스크립트를 캐시하는가.** 미니앱 HTML 만 캐시하면 전파가 끊겼을 때
 * 화면은 뜨는데 심벌·공유·뒤로가기가 죽는다 — 캐시가 반쪽만 듣는 상태가 된다.
 */
{
  const sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const line = (sw.match(/^const SWR = .*$/m) || [''])[0];
  ok(['share-kit', 'prod-symbols', 'back-kit'].every((k) => line.includes(k)),
    '[9] sw.js 의 SWR 규칙이 공용 스크립트 셋을 함께 잡는다');
}

console.log(fail ? `\n${fail}건 실패` : '\nALL PASS');
process.exit(fail ? 1 : 0);
