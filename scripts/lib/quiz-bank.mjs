/*
 * **문제은행을 코드에서 읽어 온다** — 자립형 시험지 출력기가 쓰는 유일한 통로.
 *
 * 문제은행의 **단일 출처는 `public/test-app.html` 의 `QB`** 다. 출력기가 자기 사본을
 * 들고 있으면 반드시 어긋난다 — 이 저장소가 허브 카드 개수·앱 버전·비교표 값에서
 * 반복해서 데인 종류다. 그래서 **빌드로 파생**시키고,
 * `test-examtool.mjs` 가 "커밋된 출력기 == 지금 재생성한 것"을 검사한다
 * (`search-index.json`·`size-reps.json` 과 같은 방식).
 *
 * **예전에는 `public/quiz-bank.json` 을 만들어 인쇄 지면이 fetch 했다**(2026-08-19 폐지).
 * 출력기가 앱에서 떨어져 나와 **더블클릭으로 여는 단일 파일**이 되면서 fetch 를 쓸 수
 * 없게 됐다(`file://` 는 CORS 로 막힌다). 그러면 그 json 을 읽을 지면이 하나도 없는데
 * 배포본에는 365KB 가 계속 실린다 — 그래서 파일을 없애고 이 모듈로 바꿨다.
 * 은행은 이제 **빌드 시점에 출력기 HTML 안으로 인라인된다.**
 *
 * ## 정책/제품 갈래도 여기서 붙인다
 * 실제 시험이 **정책테스트**와 **제품테스트**로 나뉘어 있어 인쇄 시험지도 비율을
 * 맞춘다. 우리 은행에는 아직 갈래 표시가 없으므로 **본문 어휘로 판정**한다 —
 * 실제 시험 사진에서 시험명이 찍힌 256장으로 재니 **정밀도 99% · 재현율 100%** 였다.
 * 문항에 `type` 을 직접 넣게 되면 그것이 우선한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'public', 'test-app.html');

/* 정책 어휘 — `.scratch/exam-topics.mjs` 와 같은 목록이어야 한다.
   두 곳이 갈리면 화면 비율과 조사 결과가 서로 다른 말을 한다. */
const POLICY = /정책|프로모션|인센티브|미리장만|거주중|재고\s*소진|패키지\s*포인트|구독클럽|사은품|증정|무상\s*지원|대상\s*모델/;

/** `test-app.html` 의 `QB` 객체를 그대로 꺼낸다 */
export function readQB() {
  const html = fs.readFileSync(SRC, 'utf8');
  const at = html.indexOf('const QB={');
  if (at < 0) throw new Error('test-app.html 에서 QB 를 찾지 못했다');
  let i = html.indexOf('{', at), depth = 0, end = -1;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error('QB 의 끝을 찾지 못했다');
  return JSON.parse(html.slice(html.indexOf('{', at), end + 1));
}

/** 출력기가 먹는 모양으로 — 문항을 한 줄로 펴고 정책/제품 갈래를 붙인다 */
export function buildBank() {
  const QB = readQB();
  const items = [];
  let seq = 0;
  for (const [cat, list] of Object.entries(QB)) {
    for (const q of list) {
      const blob = q.q + ' ' + q.opts.join(' ') + ' ' + (q.exp || '');
      items.push({
        i: seq++,
        cat,
        type: q.type || (POLICY.test(blob) ? 'policy' : 'product'),
        q: q.q, opts: q.opts, ans: q.ans, exp: q.exp || '',
      });
    }
  }
  const byType = items.reduce((a, x) => (a[x.type] = (a[x.type] || 0) + 1, a), {});
  return {
    total: items.length,
    cats: Object.fromEntries(Object.entries(QB).map(([k, v]) => [k, v.length])),
    byType,
    items,
  };
}
