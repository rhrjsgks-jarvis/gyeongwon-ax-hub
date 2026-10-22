/*
 * 출장비 원문 대조 — 삼성전자서비스 「서비스요금 산정기준」 의 평절기·성수기 출장비가 AS 앱(FEE.trip.rows)과 같은가.
 *   node scripts/check-svc-fee.mjs   →  종료 코드 0 같음 · 3 다름(무엇이 다른지 찍는다) · 1 원문을 못 읽음
 *
 * 금액 네 개뿐이지만 앱 문구 안에 박혀 있어 **자동으로 고치지 않는다** — 주간 점검이 「바뀜 — 손으로 반영」으로 알린다.
 * 원문 줄: 「ㆍ평절기(1~5, 9~12월) : 기본 출장비 28,000원, 할증 출장비 33,000원」
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const html = fs.readFileSync('public/as-app.html', 'utf8');
const mine = [...html.matchAll(/\['(평절기|성수기)[^']*', '([0-9,]+원)', '([0-9,]+원)'\]/g)].map((m) => [m[1], m[2], m[3]]);
if (mine.length !== 2) { console.error('앱의 출장비 표(FEE.trip.rows)를 못 찾았다'); process.exit(1); }

const b = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
let text = '';
try {
  const p = await b.newPage();
  await p.goto('https://www.samsungsvc.co.kr/info/fee?tab=service', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6000);
  text = await p.evaluate(() => document.body.innerText);
} finally { await b.close(); }
const theirs = ['평절기', '성수기'].map((k) => {
  const m = text.match(new RegExp(k + '[^\\n]*?기본 출장비\\s*([0-9,]+원)[^\\n]*?할증 출장비\\s*([0-9,]+원)'));
  return m ? [k, m[1], m[2]] : null;
});
if (theirs.some((x) => !x)) { console.error('원문에서 출장비 줄을 못 찾았다 — 지면 구조가 바뀌었을 수 있다'); process.exit(1); }
const diff = theirs.filter((t, i) => t[1] !== mine[i][1] || t[2] !== mine[i][2]);
if (!diff.length) { console.log('출장비 원문과 같음 — ' + theirs.map((t) => `${t[0]} ${t[1]}/${t[2]}`).join(' · ')); process.exit(0); }
console.log('출장비 바뀜 — ' + diff.map((t) => { const m = mine.find((x) => x[0] === t[0]); return `${t[0]} ${m[1]}/${m[2]} → ${t[1]}/${t[2]}`; }).join(' · '));
process.exit(3);
