#!/usr/bin/env node
/*
 * 삼성닷컴 AI 구독 — 품목별 구독케어 원문 수집 (로컬 전용 · 클라우드는 프록시가 막는다)
 *
 *   npm run collect:care                 전 품목
 *   npm run collect:care -- fridge,kimchi 일부만
 *
 * 구독 지면(subscribe2-d2c)을 브라우저로 렌더해 넷을 뽑는다:
 *   ① 「구독케어」 정의 문단(케어 종류 → 항목)   ② 방문케어 프리미엄/라이트/셀프케어 탭의 사진
 *      — 원문 HTML 에서 **주석으로 빠진 사진은 hidden** 으로 따로 표시한다(그 유형에 없는 항목이다)
 *   ③ 「구독케어 자세히 보기」 표(칸 단위)        ④ 지면 유의사항
 * 결과는 scripts/fixtures/care-subs.json 에 품목별로 덮어쓴다. **못 받은 품목은 옛 값을 그대로 둔다.**
 * 그다음: npm run build:careplans → npm run test:care (정의 없는 케어 이름이 나오면 빌드가 멈춘다)
 *
 * 품목 → 지면 주소(T)는 지면 개편 때 바뀔 수 있다. 바뀌면 카테고리 목록의 ?only-ai-subs 에서
 * goodsList 응답(goodsDetailUrl)을 보고 고친다. robots: 글로벌 www.samsung.com/robots.txt 의
 * * 그룹은 /sec/search/… 만 막는다(구독 지면 허용).
 */
import { chromium } from 'playwright';
import fs from 'fs';
const T = {
  aircon:'ai-subs-living/AF90H19D35WRT-subscribe2-d2c/AF90H19D35WRT/',
  aicombo:'ai-subs-living/WD90H25AHS-subscribe2-d2c/WD90H25AHS/',
  washer:'ai-subs-living/WF90F25ADS-subscribe2-d2c/WF90F25ADS/',
  dryer:'ai-subs-living/DV80H20DDW-subscribe2-d2c/DV80H20DDW/',
  fridge:'ai-subs-kitchen/RM70H91RMA-subscribe2-d2c/RM70H91RMA/',
  kimchi:'ai-subs-kitchen/kimchi-stand-rk70f58m1zg-d2c-subscribe2-D2C/RK70F58M1ZG/',
  dish:'ai-subs-kitchen/DW90F79P1USWS-subscribe2-d2c/DW90F79P1USWS/',
  induction:'ai-subs-kitchen/CC80H63E1HS-subscribe2-d2c/CC80H63E1HS/',
  dresser:'ai-subs-living/DF90H24R5C-subscribe2-d2c/DF90H24R5C/',
  airpur_reusable:'ai-subs-living/AP90H10198UDD-subscribe2-d2c/AP90H10198UDD/',
  airpur_s:'ai-subs-living/AP90H10163UDD-subscribe2-d2c/AP90H10163UDD/',
  vacuum:'ai-subs-living/VR90F01SAG98CS-subscribe2-d2c/VR90F01SAG98CS/',
  purifier_under:'ai-subs-kitchen/RWP54421BF6M-subscribe2-d2c/RWP54421BF6M/',
  /* 2026-10-16 추가 — 가이드 「품목별 맞춤 케어」 표에 방문케어 프리미엄이 있는 품목 */
  sac:'ai-subs-living/AJ30CSS4P36SSY-subscribe2-d2c/AJ30CSS4P36SSY/',
  dehum:'ai-subs-living/AY70H23100GVD-subscribe2-d2c/AY70H23100GVD/',
};
/* 사진 탭이 원래 없는 지면 — 제습기는 표·정의만 있고 유형 탭(사진)이 없다(2026-10-16 확인).
   여기 없는 품목은 탭이 비면 지면 구조가 바뀐 것으로 보고 쓰지 않는다. */
const NO_TABS = new Set(['dehum']);
const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(T);
const b = await chromium.launch();
const FIX = 'scripts/fixtures/care-subs.json';
const out = {};
async function one(key){
  const p = await b.newPage({ viewport:{width:1280,height:900}, userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' });
  try {
    const resp = await p.goto('https://www.samsung.com/sec/'+T[key], { waitUntil:'domcontentloaded', timeout:60000 });
    await p.waitForTimeout(6000);
    for (let i=0;i<10;i++){ await p.evaluate(()=>window.scrollBy(0,1500)); await p.waitForTimeout(300); }
    const r = await p.evaluate(()=>{
      const txt = document.body.innerText;
      const a = txt.indexOf('삼성 AI 구독으로 더 오래'); const z = txt.indexOf('구독케어 자세히 보기', a);
      const block = a>=0 ? txt.slice(a, z>0 ? z : a+4000) : '';
      const tabs = [...document.querySelectorAll('[role=tab][aria-controls^="care-panel"]')].map(t=>{
        const pn = document.getElementById(t.getAttribute('aria-controls'));
        const html = pn ? pn.innerHTML : '';
        const slides = []; const seen = new Set();
        const pick = (frag, hidden) => { const re2 = /<img[^>]*?src="([^"]+)"[^>]*?alt="([^"]*)"[\s\S]*?<dt[^>]*>([\s\S]*?)<\/dt>/g; let mm; while((mm=re2.exec(frag))){ if(seen.has(mm[1])) continue; seen.add(mm[1]); slides.push({hidden, src:mm[1], alt:mm[2], dt:mm[3].replace(/<[^>]+>/g,'').trim()}); } };
        (html.match(/<!--[\s\S]*?-->/g)||[]).forEach(c=>pick(c,true));
        pick(html.replace(/<!--[\s\S]*?-->/g,''), false);
        const h4 = pn && pn.querySelector('h4') ? pn.querySelector('h4').innerText.replace(/\s+/g,' ') : '';
        return { label:t.innerText.trim(), h4, slides };
      });
      // 회차표: 자세히 보기 안
      const zi = [...document.querySelectorAll('*')].find(e=>e.children.length===0 && /구독케어 자세히 보기/.test(e.textContent));
      let tables = [];
      document.querySelectorAll('table').forEach(t=>{ const id=(t.closest('[id]')||{}).id||''; if(/^panel-/.test(id)){ let h=''; let e=t; for(let i=0;i<6 && e;i++){ e=e.previousElementSibling||e.parentElement; if(e && /방문케어|셀프케어|무상수리/.test(e.innerText||'') && (e.innerText||'').length<40){ h=e.innerText.trim(); break; } } tables.push({id, h, t:t.innerText.replace(/\s+/g,' ').trim(), rows:[...t.querySelectorAll('tr')].map(tr=>[...tr.children].map(c=>({x:c.innerText.replace(/\s+/g,' ').trim(), span:+(c.getAttribute('colspan')||1)})))}); } });
      const notes = [...document.querySelectorAll('.service_description_list li')].map(l=>l.innerText.trim());
      return { block, tabs, tables, notes };
    });
    out[key] = { url:T[key], status: resp && resp.status(), ...r };
    console.log(key, resp && resp.status(), 'tabs', r.tabs.map(t=>t.label+':'+t.slides.length).join(','), 'tables', r.tables.length, 'block', r.block.length);
  } catch(e){ console.log(key,'FAIL',e.message.slice(0,100)); }
  await p.close();
}
const q=[...only]; await Promise.all([0,1,2].map(async()=>{ while(q.length) await one(q.shift()); }));
const fx = fs.existsSync(FIX) ? JSON.parse(fs.readFileSync(FIX,'utf8')) : { products:{} };
let n = 0;
for (const [k, v] of Object.entries(out)) {
  /* 반쪽은 쓰지 않는다 — 표나 탭이 비면 지면 구조가 바뀐 것이다 */
  if ((!v.tabs.length && !NO_TABS.has(k)) || !v.tables.length || !v.block) { console.log('✗', k, '— 표/탭/정의가 비어 옛 값을 둔다'); continue; }
  fx.products[k] = { url:'https://www.samsung.com/sec/'+v.url, at:new Date().toLocaleDateString('sv-SE'), block:v.block.trim(), tabs:v.tabs, tables:v.tables.map(t=>({h:t.h,rows:t.rows})), notes:v.notes.map(x=>x.replace(/\s*\n\s*/g,' ')) };
  n++;
}
fx._collectedAt = new Date().toLocaleDateString('sv-SE');
fs.writeFileSync(FIX, JSON.stringify(fx,null,1));
console.log('✓', n, '품목 갱신 →', FIX);
await b.close();
