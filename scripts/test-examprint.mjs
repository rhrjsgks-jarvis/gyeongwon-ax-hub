/*
 * **시험지 인쇄가 실제로 되는가** — `node .scratch/exam-print-check.mjs`
 * 요구사항을 하나씩 실물로 확인한다: 20문항 · 매번 다름 · 정답지 짝 · A4.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { chromium } from 'playwright';
const ROOT = process.cwd();
const MIME = { '.html':'text/html; charset=utf-8', '.json':'application/json', '.js':'text/javascript', '.css':'text/css' };
const srv = http.createServer((q,s)=>{
  const u = decodeURIComponent(new URL(q.url,'http://x').pathname);
  const f = path.join(ROOT,'public', u.replace(/^\/+/,''));
  if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){ s.writeHead(404); return s.end(); }
  s.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(s);
});
await new Promise(r=>srv.listen(4791,'127.0.0.1',r));
const br = await chromium.launch();
const page = await br.newPage({ viewport:{width:1200,height:900} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto('http://127.0.0.1:4791/exam-print-app.html',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>document.querySelectorAll('.sheet').length>0,{timeout:15000});

const grab = () => page.evaluate(()=>{
  const sheets=[...document.querySelectorAll('.sheet')];
  const qs=[...sheets[0].querySelectorAll('.q')].map(el=>({
    q: el.querySelector('.qt').textContent.trim(),
    cat: el.querySelector('.tag').textContent.trim(),
    opts:[...el.querySelectorAll('.opts li span:last-child')].map(x=>x.textContent.trim()),
  }));
  const keys=[...sheets[1].querySelectorAll('.akey div span')].map(x=>x.textContent.trim());
  const exps=[...sheets[1].querySelectorAll('.ex .a')].map(x=>x.textContent.trim());
  return { sheets:sheets.length, code:document.querySelector('.head .code').textContent.trim(),
           codes:sheets.map(s=>s.querySelector('.code').textContent.trim()), qs, keys, exps,
           hint:document.getElementById('hint').textContent };
});
const a = await grab();
const NO=['①','②','③','④'];
let ok=true; const say=(c,m)=>{ console.log((c?'OK  ':'FAIL')+': '+m); if(!c) ok=false; };

say(a.sheets===2, '시험지+정답지 두 장 (실제 '+a.sheets+')');
say(a.qs.length===20, '20문항 (실제 '+a.qs.length+')');
say(a.qs.every(q=>q.opts.length===4), '모든 문항 보기 4개');
say(new Set(a.qs.map(q=>q.q)).size===a.qs.length, '문항 중복 없음');
say(a.codes[0]===a.codes[1], '시험지·정답지 코드 일치 ('+a.codes.join(' / ')+')');
say(a.keys.length===20, '정답표 20칸 (실제 '+a.keys.length+')');
/* 정답표의 번호가 해설의 정답과 같은가 */
let match=0;
for(let i=0;i<20;i++){ if(a.exps[i] && a.exps[i].startsWith('정답 '+a.keys[i])) match++; }
say(match===20, '정답표 ↔ 해설 정답 일치 '+match+'/20');
/* 정답 보기가 실제 시험지 보기 안에 있는가 */
let inSheet=0;
for(let i=0;i<20;i++){
  const want=a.exps[i].replace(/^정답 [①②③④]\s*/,'');
  const idx=NO.indexOf(a.keys[i]);
  if(a.qs[i].opts[idx]===want) inSheet++;
}
say(inSheet===20, '정답 위치가 시험지 보기와 일치 '+inSheet+'/20');

/* 매번 달라야 한다 */
const seen=new Set([a.qs.map(q=>q.q).join('|')]);
for(let i=0;i<4;i++){
  await page.click('#gen');
  await page.waitForTimeout(150);
  const b=await grab();
  seen.add(b.qs.map(q=>q.q).join('|'));
}
say(seen.size===5, '5번 뽑아 5번 다 다른 시험지 (실제 '+seen.size+'종)');

/* 같은 코드면 같은 시험지여야 한다(재인쇄) */
const cur=await grab();
const code=cur.codes[0].replace('시험지 ','');
await page.fill('#code', code);
await page.press('#code','Enter');
await page.waitForTimeout(150);
const again=await grab();
say(again.qs.map(q=>q.q).join('|')===cur.qs.map(q=>q.q).join('|'), '같은 코드('+code+') → 같은 시험지 재현');

/* A4 인쇄 — 페이지 수 */
const pdf='.scratch/exam-print-sample.pdf';
await page.pdf({ path: pdf, format:'A4', printBackground:true });
const size=(fs.statSync(pdf).size/1024).toFixed(0);
say(fs.existsSync(pdf), 'A4 PDF 생성 ('+size+'KB) → '+pdf);
say(errs.length===0, '콘솔 오류 없음'+(errs.length?': '+errs[0]:''));
console.log('\n안내문: '+a.hint);
console.log(ok?'\nALL PASS':'\nSOME FAILED');
await br.close(); srv.close();
process.exit(ok?0:1);
