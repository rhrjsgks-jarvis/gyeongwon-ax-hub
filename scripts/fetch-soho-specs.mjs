/* # 2단계 — SOHO몰(B2B) 제품 사양 수집  `npm run fetch:sohospec`
 *
 * 1단계(`fetch:soho`)가 받은 432종의 **사양**을 제품 지면에서 받는다.
 *
 * ## 왜 브라우저가 필요한가
 * `#compGoodsSpec` article 이 원본 HTML 에 **있기는 한데 530자짜리 빈 껍데기**다.
 * 「스펙」 길잡이를 눌러야 채워진다 — B2C(`sec-catalog`) 때와 같은 구조라,
 * CLAUDE.md 에 적어 둔 그때의 교훈을 그대로 쓴다:
 *
 *   ① 「스펙」을 누른다 — 안 누르면 0쌍이다
 *   ② `#compGoodsSpec` **안만** 읽는다 — 지면 전체를 긁으면 맨 위 결제 블록
 *      (최대 혜택가·무이자 할부…)이 사양으로 잡힌다
 *   ③ `dt` 는 묶음 이름이고 **실제 항목은 `dd` 안의 `strong.spec-title` + `p.spec-desc`** 다.
 *      묶음을 값으로 담으면 한 줄에 열 항목이 뭉쳐 검색도 비교도 안 된다
 *   ④ 탭은 `role="tab"` 으로 찾는다 — 클래스에 tab 이 들어갔는지로 보면 툴팁 버튼이
 *      탭으로 잡혀 같은 쌍을 여러 번 센다
 *
 * ## SOHO몰은 B2C 와 **탭 동작이 다르다** (2026-08-25 실측)
 * B2C 는 탭이 **패키지 구성품**이라 누를 때마다 다른 제품 사양이 떴고, 그래서
 * "탭을 합치지 말 것"이 규칙이었다. **여기서는 눌러도 내용이 안 바뀐다** —
 * 탭 2개(`AC023CN1PBH1`·`AC023CX1PBH1`)를 각각 눌러도 늘 같은 90항목이 보인다.
 * 즉 탭은 **이름표**이고 90항목은 **실내기·실외기가 한 표의 두 열**로 들어온 것이다.
 *
 * 그래서 라벨이 겹친다 — `송풍기 형식 = Cross Flow | Propeller`(실내기 | 실외기).
 * **Map 으로 뭉개면 뒤엣것이 앞엣것을 덮어써 조용히 틀린 값이 남는다.**
 * 여기서는 **순서 있는 배열 그대로** 담고, 어느 묶음(dt) 아래였는지도 함께 적는다.
 * 쓸 때 가려 쓰라고 `tabs` 와 `dupLabels` 를 같이 남긴다.
 *
 * ## 법정 표시는 여기서 거르지 않는다
 * B2C 때 `제조국가`·`KC 인증 필 유무` 같은 고지가 26% 를 차지해 걸렀는데,
 * **정확 일치로 거르다 변형 12종 460줄이 배포본에 실려 나갔다**(`제조국` · `제조 국가` …).
 * 그래서 **수집은 원문 그대로 담고 거르는 것은 합칠 때 한다** — 원본이 있어야
 * 무엇을 빼고 있는지 다시 셀 수 있다(그때 배포본을 세다 3종으로 잘못 봤다).
 *
 * ## 끊겨도 이어서 받는다
 * JSONL 로 한 줄씩 덧붙인다. 다시 돌리면 이미 받은 코드는 건너뛴다.
 * `FRESH=1` 이면 처음부터. `LIMIT=n` 으로 몇 종만 시험 삼아 돌릴 수 있다. */
import fs from 'node:fs';

const CAT = 'scripts/fixtures/soho-catalog.json';
const JSONL = '.scratch/soho-specs.jsonl';
const BASE = 'https://www.samsungebiz.com/sohomall/';

const { chromium } = await import('playwright');

const cat = JSON.parse(fs.readFileSync(CAT, 'utf8'));
if (process.env.FRESH === '1' && fs.existsSync(JSONL)) fs.unlinkSync(JSONL);
fs.mkdirSync('.scratch', { recursive: true });

const done = new Set();
if (fs.existsSync(JSONL))
  for (const line of fs.readFileSync(JSONL, 'utf8').split('\n'))
    if (line.trim()) { try { done.add(JSON.parse(line).code); } catch {} }

let todo = cat.items.filter(i => i.url && !done.has(i.code));
if (process.env.LIMIT) todo = todo.slice(0, +process.env.LIMIT);
console.log(`대상 ${todo.length}종 (이미 받은 것 ${done.size}종)`);

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR' });
const page = await ctx.newPage();
/* 그림·글꼴은 사양과 무관하다 — 안 받으면 남의 서버도 우리도 빠르다 */
await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,mp4}', r => r.abort());

let ok = 0, empty = 0, err = 0;
for (const [n, it] of todo.entries()) {
  const url = BASE + it.url;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    /* ① 「스펙」을 누른다 */
    const tab = page.locator('a[data-scroll="compGoodsSpec"]').first();
    if (await tab.count()) { await tab.click({ timeout: 8000 }).catch(() => {}); }
    await page.waitForTimeout(1200);

    const got = await page.evaluate(() => {
      const root = document.querySelector('#compGoodsSpec');          /* ② 안만 읽는다 */
      if (!root) return { tabs: [], pairs: [] };
      /* ④ 탭은 role="tab" 으로만 찾는다 */
      const tabs = [...root.querySelectorAll('[role="tab"]')].map(t => (t.textContent || '').trim()).filter(Boolean);
      /* ③ dd 안의 spec-title / spec-desc 쌍. **묶음 이름(dt)도 함께** 적는다 —
         라벨이 겹칠 때 어느 부분 값인지 가릴 단서가 그것뿐이다. */
      const pairs = [...root.querySelectorAll('dd li')].map(li => {
        const k = li.querySelector('.spec-title'), v = li.querySelector('.spec-desc');
        if (!k || !v) return null;
        const dd = li.closest('dd');
        let dt = dd && dd.previousElementSibling;
        while (dt && dt.tagName !== 'DT') dt = dt.previousElementSibling;
        return [k.textContent.trim(), v.textContent.trim().replace(/\s+/g, ' '),
                dt ? dt.textContent.trim().replace(/\s+/g, ' ') : ''];
      }).filter(Boolean);
      return { tabs, pairs };
    });

    /* 겹치는 라벨 수를 함께 적어 둔다 — 쓸 때 "뭉개면 안 되는 제품"을 바로 가릴 수 있다 */
    const seen = {};
    for (const [k] of got.pairs) seen[k] = (seen[k] || 0) + 1;
    const dupLabels = Object.entries(seen).filter(([, n]) => n > 1).map(([k]) => k);
    const rec = { code: it.code, name: it.name, url: it.url, tabs: got.tabs, dupLabels, specs: got.pairs };
    fs.appendFileSync(JSONL, JSON.stringify(rec) + '\n');
    got.pairs.length ? ok++ : empty++;
    if ((n + 1) % 20 === 0 || n === todo.length - 1)
      console.log(`  ${n + 1}/${todo.length}  사양 있음 ${ok} · 0쌍 ${empty} · 오류 ${err}`);
  } catch (e) {
    err++;
    fs.appendFileSync(JSONL, JSON.stringify({ code: it.code, url: it.url, err: String(e.message || e).slice(0, 80) }) + '\n');
  }
  await new Promise(r => setTimeout(r, 300));
}

await br.close();
console.log(`\n끝. 사양 있음 ${ok}종 · 0쌍 ${empty}종 · 오류 ${err}종 → ${JSONL}`);
