/* # 손작성 문항의 보기 다시쓰기 적용 — `npm run fix:opts`
 *
 * `scripts/fixtures/option-rewrites.json` 에 사람이 적어 둔 새 보기를 QB 에 넣는다.
 * 규칙과 근거는 그 파일 머리에 있다.
 *
 * ## 넣기 전에 검사한다 — 하나라도 걸리면 그 항목은 **손대지 않는다**
 *   ① `find` 로 문항이 **딱 하나** 잡혀야 한다(여럿이면 어느 것인지 알 수 없다)
 *   ② 보기 수가 그대로여야 한다 — 늘리거나 줄이면 `ans` 자리가 어긋난다
 *   ③ 보기 넷이 서로 달라야 한다(공백 무시) — 같은 말이 둘이면 정답이 둘이다
 *   ④ **정답 자리의 숫자가 그대로여야 한다** — 값이 답인 문항에서 숫자가 바뀌면
 *      조용히 틀린 문항이 된다. 오답 쪽 숫자는 바뀌어도 된다(그게 근사값이다)
 *   ⑤ 고친 뒤 **정답이 가장 길면 안 된다** — 그게 이 작업의 목적이다
 */
import fs from 'node:fs';
import { readQB } from './lib/quiz-bank.mjs';

const SRC = 'public/test-app.html';
const FIX = 'scripts/fixtures/option-rewrites.json';

const flat = s => String(s).replace(/\s/g, '');
const nums = s => (String(s).match(/\d+(?:[.,]\d+)?/g) || []).join('|');

export function applyRewrites({ dry = false } = {}) {
  const rules = JSON.parse(fs.readFileSync(FIX, 'utf8')).items;
  const QB = readQB();
  const all = Object.values(QB).flat();
  let html = fs.readFileSync(SRC, 'utf8');
  const done = [], skip = [];

  for (const r of rules) {
    const hit = all.filter(q => q.q.includes(r.find));
    if (hit.length !== 1) { skip.push(`${r.find} — 문항이 ${hit.length}개 잡혔다`); continue; }
    const q = hit[0];
    if (r.opts.length !== q.opts.length) { skip.push(`${r.find} — 보기 수가 다르다`); continue; }
    if (new Set(r.opts.map(flat)).size !== r.opts.length) { skip.push(`${r.find} — 보기 둘이 같은 말`); continue; }
    if (nums(q.opts[q.ans]) !== nums(r.opts[q.ans])) { skip.push(`${r.find} — 정답의 숫자가 바뀐다`); continue; }
    const maxO = Math.max(...r.opts.filter((_, i) => i !== q.ans).map(o => o.length));
    if (r.opts[q.ans].length > maxO) { skip.push(`${r.find} — 고쳐도 정답이 가장 길다`); continue; }

    /* **문자열로 찾지 않는다.** QB 는 직렬화 서식이 두 가지라(앞쪽 카테고리는 `opts` 를
       여러 줄로 펴고 뒤쪽은 한 줄) `JSON.stringify(opts)` 는 한쪽에서만 맞는다.
       그래서 **그 문항 객체를 먼저 찾고 그 안의 `"opts"` 배열만** 자리로 바꾼다. */
    const qAt = html.indexOf(JSON.stringify(q.q));
    if (qAt < 0) { skip.push(`${r.find} — 질문 문자열을 못 찾았다`); continue; }
    const oAt = html.indexOf('"opts"', qAt);
    const lb = html.indexOf('[', oAt);
    let d = 0, rb = -1;
    for (let i = lb; i < html.length; i++) {
      if (html[i] === '[') d++;
      else if (html[i] === ']' && --d === 0) { rb = i; break; }
    }
    if (lb < 0 || rb < 0 || lb > qAt + 4000) { skip.push(`${r.find} — 보기 배열 경계를 못 찾았다`); continue; }
    if (JSON.stringify(JSON.parse(html.slice(lb, rb + 1))) !== JSON.stringify(q.opts)) {
      skip.push(`${r.find} — 찾은 보기가 그 문항 것이 아니다`); continue;
    }
    html = html.slice(0, lb) + JSON.stringify(r.opts) + html.slice(rb + 1);
    done.push(r.find);
  }

  if (!dry) fs.writeFileSync(SRC, html);
  return { done, skip };
}

if (process.argv[1] && process.argv[1].endsWith('fix-options.mjs')) {
  const { done, skip } = applyRewrites({ dry: process.argv.includes('--dry') });
  console.log(`적용 ${done.length}개 · 건너뜀 ${skip.length}개`);
  skip.forEach(s => console.log('  ⚠ ' + s));
}
