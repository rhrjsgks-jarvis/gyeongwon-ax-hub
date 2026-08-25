/* # 정답만 길어서 찍히는 문항 고치기 — `npm run fix:anslen`
 *
 * ## 왜 급한가 (2026-08-25 실측)
 * **문제를 안 읽고 가장 긴 보기만 골라도 68% 를 맞힌다**(찍기 25%). 사장님 방향성 문서
 * (`urlquizgenerator_SKILL.md`)가 *"정답만 길고 나머지 보기가 터무니없는 문항은 즉시
 * 버린다 — 읽지 않고도 찍힌다"* 고 못 박은 그것이고, 목표가 **평균 60점대**인데
 * **아무것도 모르고 68점**이면 시험이 성립하지 않는다.
 *
 * 자동 생성한 C형은 22%(찍기 수준)라 정상이다 — **손으로 쓴 문항이 문제**다.
 * 정답만 온전한 설명문이고 오답은 4~6자 단어인 틀이 반복된다.
 *
 * ## 오답을 늘리지 않고 **정답을 줄인다**
 * 오답을 길게 다시 쓰는 것은 **없는 사실을 짓는 일**이라(그럴듯한 오답이 실제로
 * 참이면 정답이 둘이 된다) 하지 않는다. 대신 정답에서 **군더더기만** 덜어낸다 —
 * 뜻이 바뀌지 않는 범위에서.
 *
 *   `레이저로 공간 3D 지도를 정확하게 작성하여 효율적 청소` → `공간 3D 지도 작성`
 *   `UL (UL Solutions)` → `UL`
 *
 * ## 안전장치 — 하나라도 걸리면 그 문항은 **손대지 않는다**
 *   ① 줄인 뒤에도 다른 보기와 **겹치지 않아야** 한다 (겹치면 정답이 둘이 된다)
 *   ② 4자 이상 남아야 한다 (너무 줄면 무슨 말인지 모른다)
 *   ③ **숫자·단위·모델코드가 하나도 사라지면 안 된다** — 값이 답인 문항에서
 *      숫자를 떨어뜨리면 조용히 틀린 문항이 된다
 *   ④ 줄여도 여전히 가장 길면 **고친 것이 아니므로** 되돌린다(기록만 남긴다)
 *
 * 규칙이 감당 못 하는 것은 **그대로 두고 목록으로 보고**한다. 지어내는 것보다 낫다. */
import fs from 'node:fs';
import { readQB } from './lib/quiz-bank.mjs';

const SRC = 'public/test-app.html';
const NUM = /\d|[A-Z]{2,}\d/;

/** 뜻을 바꾸지 않는 축약 규칙. 위에서부터 하나씩 적용해 본다. */
const RULES = [
  /* 괄호 부연. **앞 공백까지 함께 지우고 자리에 아무것도 넣지 않는다** — 공백을 남기면
     뒤따르는 조사가 떨어져 `4개 팬(…)에` 가 `4개 팬 에` 로 깨진다(실제로 그랬다). */
  [/\s*[（(][^)）]*[)）]/g, ''],
  [/^[^\s]{1,12}(?:으로|로)\s+/, ''],                /* 앞머리 수단구 — "레이저로 …" */
  [/^[^\s]{1,10}(?:을|를)\s+통해\s+/, ''],           /* "…를 통해 …" */
  [/(?:하여|해서|하며|하고)\s+.{1,24}$/, ''],        /* "…작성하여 효율적 청소" */
  /* **`및 / 과 / 와` 꼬리는 자르지 않는다** — 부연일 때도 있지만 대개 **병렬 요소**라
     자르면 답이 불완전해진다. 시험 삼아 넣어 봤더니 `색 순도와 밝기` → `색 순도`,
     `삼성 사운드바와 TV 동시 사용` → `삼성 사운드바` 로 **뜻이 무너졌다.**
     `·`·`,` 로 이어진 꼬리도 같은 이유로 두었다. 줄이는 것보다 틀리지 않는 것이 먼저다. */
  [/\s{2,}/g, ' '],
];

const keepsNumbers = (a, b) => {
  const na = (a.match(/\d+(?:[.,]\d+)?/g) || []).join('|');
  const nb = (b.match(/\d+(?:[.,]\d+)?/g) || []).join('|');
  return na === nb;                                   /* 숫자가 하나라도 빠지면 거절 */
};

export function shorten(ans, others) {
  const limit = Math.max(...others.map(o => o.length));
  let cur = ans;
  for (const [re, to] of RULES) {
    if (cur.length <= limit) break;
    const next = cur.replace(re, to).replace(/\s+/g, ' ').trim();
    if (!next || next.length < 4) continue;
    if (next === cur) continue;
    if (others.includes(next)) continue;              /* ① 다른 보기와 겹침 */
    if (!keepsNumbers(ans, next)) continue;           /* ③ 숫자가 사라짐 */
    cur = next;
  }
  if (cur === ans) return null;
  if (cur.length > limit) return null;                /* ④ 여전히 가장 길다 — 고친 것이 아니다 */
  return cur;
}

if (process.argv[1] && process.argv[1].endsWith('fix-answer-length.mjs')) {
  const QB = readQB();
  let html = fs.readFileSync(SRC, 'utf8');
  const dry = process.argv.includes('--dry');
  const changes = [], skipped = [];

  for (const list of Object.values(QB)) {
    for (const q of list) {
      if (q.lg === 1) continue;                       /* C형은 생성기가 만든다 — 여기서 손대지 않는다 */
      const others = q.opts.filter((_, i) => i !== q.ans);
      if (q.opts[q.ans].length <= Math.max(...others.map(o => o.length))) continue;
      const s = shorten(q.opts[q.ans], others);
      if (s) changes.push([q.opts[q.ans], s, q.q]);
      else skipped.push(q);
    }
  }

  for (const [from, to] of changes) {
    const a = JSON.stringify(from), b = JSON.stringify(to);
    if (html.split(a).length - 1 !== 1) continue;     /* 같은 문자열이 여럿이면 건드리지 않는다 */
    html = html.replace(a, b);
  }
  if (!dry) fs.writeFileSync(SRC, html);

  console.log(`줄인 정답 ${changes.length}개 · 규칙이 감당 못 한 것 ${skipped.length}개${dry ? '  (--dry, 쓰지 않음)' : ''}`);
  changes.slice(0, 8).forEach(([a, b]) => console.log(`   "${a}"\n → "${b}"`));
}
