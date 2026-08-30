/*
 * 당사제품 비교용 경량 자료를 만든다 (2026-08-30 사장님 요청)
 *   *"당사제품끼리 비교할수있는 방법이 있으면 좋겠습니다. 최대 4개까지 비교가되면
 *     좋을 것 같습니다. 당사제품비교는 동일품목군에서끼리만 비교가되어야합니다"*
 *
 * **자료를 새로 만들지 않는다.** 비교에 필요한 것은 이미 두 곳에 있다 —
 *   · `public/finder-app.html` 의 인라인 `PRODUCTS`(574종, 카탈로그 대조분)
 *   · `public/finder-extra.json`(1,423종, 삼성닷컴 수집분)
 * 뒤엣것은 이미 파일이라 미니앱이 그대로 받는다. **앞엣것만** 파일로 뽑는다.
 *
 * **인라인 리터럴을 정규식으로 긁지 않는다** — 순수 JSON 이 아니라(주석·후행 쉼표)
 * 조금만 바뀌어도 조용히 빈 값이 되고, 그러면 비교 목록에서 574종이 통째로 사라진다.
 * jsdom 으로 앱을 띄워 `PRODUCTS` 를 그대로 꺼낸다(다른 빌드 스크립트와 같은 방식).
 *
 * **담는 것은 비교에 쓰는 다섯뿐이다** — cat · group · model · price · fx.
 * `kw` 는 담지 않는다(fx 를 소문자로 베낀 글이라 파일이 두 배가 된다 — CLAUDE.md 규칙).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'finder-app.html');
const OUT = path.join(ROOT, 'public', 'finder-core.json');

const html = fs.readFileSync(SRC, 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://example.com/finder-app.html',
  pretendToBeVisual: true,
});
const w = dom.window;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* 고정 대기를 쓰지 않는다 — 부하가 걸리면 200ms 안에 안 끝난다(이 저장소가 데인 함정) */
let P = null;
for (let i = 0; i < 80; i++) {
  try { P = w.eval('typeof PRODUCTS !== "undefined" ? PRODUCTS : null'); } catch { P = null; }
  if (Array.isArray(P) && P.length) break;
  await wait(150);
}
if (!Array.isArray(P) || !P.length) {
  console.error('PRODUCTS 를 꺼내지 못했습니다 — finder-app.html 의 인라인 스크립트가 바뀌었는지 보세요');
  process.exit(1);
}

const slim = P.map((p) => ({
  cat: p.cat, group: p.group, model: p.model,
  price: p.price === undefined ? null : p.price,
  fx: p.fx || [],
})).filter((p) => p.cat && p.model);

/* 카테고리마다 몇 종인지 — 비교는 같은 품목군 안에서만 하므로 이 분포가 곧 쓸모다 */
const by = {};
for (const p of slim) by[p.cat] = (by[p.cat] || 0) + 1;
const alone = Object.entries(by).filter(([, n]) => n < 2).map(([c]) => c);

fs.writeFileSync(OUT, JSON.stringify(slim));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`finder-core.json 생성: ${slim.length}종 · ${kb}KB · 카테고리 ${Object.keys(by).length}개`);
if (alone.length) {
  console.log(`  (인라인만으로는 1종뿐인 카테고리 ${alone.length}개 — 삼성닷컴 수집분과 합치면 늘어난다: ${alone.slice(0, 6).join(', ')}${alone.length > 6 ? ' …' : ''})`);
}
dom.window.close();
