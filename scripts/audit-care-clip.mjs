#!/usr/bin/env node
/*
 * AI구독 케어 화면 잘림 감사 — 폭 320·360·390·430 × 13개 품목 × 유형·주기 전부 + 블루패스.
 *   node scripts/audit-care-clip.mjs [주소]   (기본 http://127.0.0.1:8877/care-app.html — public/ 을 웹 서버로 띄운다)
 * 셋을 센다: 화면 밖 · 잘리는 상자 밖 · 테두리 있는 칩이 카드 끝 1.5px 안에 붙음(모서리가 깎여 보인다).
 * 2026-10-15 사장님 지적(회차 칩·6년차 탭 잘림)에서 만들었다. 「잘림 0건」이 나와야 한다.
 */
import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://127.0.0.1:8877/care-app.html';
const b = await chromium.launch();
const found = {};
for (const W of [320, 360, 390, 430]) {
  const p = await b.newPage({ viewport:{width:W,height:900} });
  await p.goto(URL); await p.waitForTimeout(900);
  const audit = async (tag) => {
    const res = await p.evaluate(() => {
      const out = [];
      const root = document.querySelector('#body:not([style*="none"])') || document.querySelector('#bluepassPane');
      const scope = [document.getElementById('body'), document.getElementById('bluepassPane')].filter(e => e && e.offsetParent !== null);
      for (const sc of scope) for (const el of sc.querySelectorAll('*')) {
        if (!el.offsetParent || el.closest('.tt-w')) continue;          /* 일부러 옆으로 미는 곳 */
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
        /* ① 화면 밖 */
        if (r.right > innerWidth + 0.5 || r.left < -0.5) out.push('화면밖 ' + (el.className||el.tagName) + ' ' + (el.textContent||'').trim().slice(0,20));
        /* ② overflow:hidden 조상 밖으로 */
        let a = el.parentElement;
        while (a && a !== sc) { const cs = getComputedStyle(a); if (/hidden|clip/.test(cs.overflow + cs.overflowX)) break; a = a.parentElement; }
        if (a && a !== sc) { const ar = a.getBoundingClientRect(); if (r.right > ar.right + 0.5 || r.left < ar.left - 0.5) out.push('잘림 ' + (el.className||el.tagName) + ' ⊂ ' + a.className + ' ' + (el.textContent||'').trim().slice(0,20));
          /* 붙음 — 테두리·그림자·배경이 있는 작은 요소가 잘리는 카드 끝에 1.5px 안으로 닿으면 모서리가 깎여 보인다 */
          const cs = getComputedStyle(el); const deco = parseFloat(cs.borderLeftWidth) > 0 || parseFloat(cs.borderRightWidth) > 0 || cs.boxShadow !== 'none' || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(cs.borderRadius) > 0);
          if (deco && r.width < ar.width - 4 && (ar.right - r.right < 1.5 || r.left - ar.left < 1.5)) out.push('붙음 ' + (el.className||el.tagName) + ' ⊂ ' + a.className + ' ' + (el.textContent||'').trim().slice(0,20)); }
        /* ③ 글자 넘침 */
        if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.push('글자넘침 ' + el.className + ' ' + el.textContent.trim().slice(0,20));
      }
      if (document.documentElement.scrollWidth > innerWidth) out.push('가로스크롤 ' + document.documentElement.scrollWidth);
      return [...new Set(out)];
    });
    if (res.length) found[W + ' ' + tag] = res.slice(0, 8);
  };
  await p.evaluate(()=>setMode('bluepass')); await p.click('.fold-bar[data-scope="bp"] .fold-all[data-all="1"]'); await p.waitForTimeout(300); await audit('블루패스');
  for (const k of ['aircon','fridge','kimchi','induction','washer','aicombo','dryer','dish','dresser','airpur_s','airpur_reusable','vacuum','purifier_under']) {
    await p.evaluate(k=>switchToCare(k), k); await p.waitForTimeout(150);
    await p.click('.fold-bar[data-scope="care"] .fold-all[data-all="1"]');
    for (const t of await p.$$eval('.plan-tab.ptype', a=>a.map(x=>x.dataset.ptype))) {
      await p.click(`.plan-tab.ptype[data-ptype="${t}"]`); await p.waitForTimeout(100);
      for (const c of [null, ...await p.$$eval('.cyc-b', a=>a.map(x=>x.dataset.plan))]) {
        if (c) { await p.click(`.cyc-b[data-plan="${c}"]`); await p.waitForTimeout(100); }
        const nv = await p.$$eval('.vtab', a=>a.length);
        await p.click(`.vtab[data-round="${nv-1}"]`); await p.waitForTimeout(80);   /* 마지막 회차를 고른 상태에서도 */
        await audit(k + '/' + t + '/' + (c||'기본'));
      }
    }
  }
  await p.close();
}
console.log(Object.keys(found).length ? JSON.stringify(found, null, 1) : "잘림 0건");
if (Object.keys(found).length) process.exitCode = 1;
await b.close();
