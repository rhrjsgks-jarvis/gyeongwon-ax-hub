#!/usr/bin/env node
/**
 * 압축본이 원본과 **똑같이 동작하는가** — `npm run test:minify`
 *
 * 배포 빌드는 미니앱 인라인 JS·CSS 를 압축한다(scripts/minify-inline.mjs). 다른 검사들은
 * 원본 소스의 글자를 읽으므로 압축본을 검사할 수 없다 — 그래서 여기서 **나란히** 연다.
 *
 *   ① 압축 실패 블록이 없는가(있으면 그 블록은 원본 그대로 나간다 — 알고는 있어야 한다)
 *   ② 원본·압축본을 실제 브라우저로 열어 **페이지 오류 수 · 화면 글자 · 전역 함수 목록**이 같은가
 *   ③ 앱마다 대표 동작 하나를 양쪽에서 해 보고 결과 화면이 같은가
 *   ④ 압축이 실제로 줄였는가(효과가 사라지면 누군가 빌드 훅을 뺀 것이다)
 *
 * 화면 글자를 견주는 이유 — 압축기가 전역 이름을 바꾸거나 문자열을 망가뜨리면 가장 먼저
 * 화면에 드러난다. 사람 눈 대신 글자 전체를 견준다.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { minifyHtml, splitBlocks, SPLIT_DIR } from './minify-inline.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
let ok = true;
const fail = (m) => { ok = false; console.log('ERROR: ' + m); };
const pass = (m) => console.log('OK: ' + m);

let chromium;
try { ({ chromium } = await import('playwright')); } catch { console.log('SKIP: playwright 없음'); process.exit(0); }

/* 압축본을 임시 폴더에 만든다 — 원본은 건드리지 않는다 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-'));
const apps = fs.readdirSync(PUB).filter((f) => f.endsWith('-app.html')).sort();
let before = 0, after = 0;
const fails = [];
const splitBy = {};
for (const f of apps) {
  const src = fs.readFileSync(path.join(PUB, f), 'utf8');
  const { html: mini, fails: fs2 } = await minifyHtml(src, f);
  /* 배포 빌드와 똑같이 — 압축한 뒤 큰 자료 블록을 떼어낸다 */
  const { html, files } = splitBlocks(mini, f);
  fails.push(...fs2); before += src.length; after += html.length + files.reduce((n, x) => n + x.code.length, 0);
  fs.writeFileSync(path.join(tmp, f), html);
  if (files.length) fs.mkdirSync(path.join(tmp, SPLIT_DIR), { recursive: true });
  for (const x of files) fs.writeFileSync(path.join(tmp, SPLIT_DIR, x.name), x.code);
  splitBy[f] = files.map((x) => x.name);
}
if (fails.length) fail('압축 못 한 블록: ' + fails.join(' / '));
else pass(`① 미니앱 ${apps.length}개 전부 압축됨`);
if (after > before * 0.9) fail(`압축 효과가 거의 없다(${before} → ${after}자)`);
else pass(`④ 원본 ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB`);

/* 한 서버가 두 갈래를 준다 — /o/ 는 원본, /m/ 은 압축본. 나머지 파일(json·vendor)은 public 그대로 */
const srv = http.createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const m = u.match(/^\/(o|m)\/(.*)$/);
  const rel = m ? m[2] : u.slice(1);
  let f = path.join(PUB, rel);
  if (m && m[1] === 'm' && rel.endsWith('-app.html')) f = path.join(tmp, rel);
  if (u.startsWith('/' + SPLIT_DIR + '/')) f = path.join(tmp, u.slice(1));
  if (m && m[1] === 'm' && rel === 'sw.js') f = path.join(PUB, 'sw.js');
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  const ext = path.extname(f);
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream';
  s.writeHead(200, { 'content-type': type + '; charset=utf-8' }); s.end(fs.readFileSync(f));
}).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;

/* 앱마다 대표 동작 — 원본에서 되는 것이 압축본에서도 똑같이 돼야 한다 */
const ACT = {
  'finder-app.html': async (p) => { await p.fill('#q', '냉장고 4도어').catch(() => {}); await p.keyboard.press('Enter').catch(() => {}); },
  'compare-app.html': async (p) => { await p.locator('select').first().selectOption({ index: 2 }).catch(() => {}); },
  'as-app.html': async (p) => { await p.locator('.cat').nth(3).click().catch(() => {}); },
  'install-app.html': async (p) => { await p.locator('select').first().selectOption({ index: 3 }).catch(() => {}); },
  'care-app.html': async (p) => { await p.locator('button, .prod, .card').nth(2).click().catch(() => {}); },
};

const b = await chromium.launch();
async function snap(kind, f) {
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${base}/${kind}/${f}`, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  if (ACT[f]) { await ACT[f](p); await p.waitForTimeout(600); }
  const r = await p.evaluate(() => ({
    text: document.body ? document.body.innerText : '',
    fns: Object.keys(window).filter((k) => { try { return typeof window[k] === 'function'; } catch { return false; } }).sort(),
  }));
  await ctx.close();
  return { ...r, errs };
}
for (const f of apps) {
  const o = await snap('o', f), m = await snap('m', f);
  const why = [];
  if (m.errs.length !== o.errs.length) why.push(`페이지 오류 ${o.errs.length} → ${m.errs.length}: ${m.errs.slice(0, 2).join(' | ')}`);
  if (o.text !== m.text) {
    let i = 0; while (i < o.text.length && o.text[i] === m.text[i]) i++;
    why.push(`화면 글자가 다르다(${i}번째 글자부터): 원본 "${o.text.slice(i, i + 40)}" / 압축 "${m.text.slice(i, i + 40)}"`);
  }
  const lost = o.fns.filter((k) => !m.fns.includes(k));
  if (lost.length) why.push(`압축본에서 사라진 전역 함수: ${lost.slice(0, 8).join(', ')}`);
  if (why.length) fail(`${f} — ${why.join(' · ')}`);
  else pass(`② ${f} 원본과 같다 (전역 함수 ${o.fns.length}개 · 화면 ${o.text.length}자${ACT[f] ? ' · ③ 동작 후 화면도 같다' : ''})`);
}
/* ⑤ 떼어낸 앱이 의도한 그 둘인가 — 자료가 무거운 앱만. 배치 시뮬레이터처럼 떼면 느려지는 앱은 안 뗀다 */
{
  const got = Object.entries(splitBy).filter(([, v]) => v.length).map(([k]) => k).sort();
  const want = ['finder-app.html', 'test-app.html'];
  if (JSON.stringify(got) !== JSON.stringify(want)) fail(`떼어낸 앱이 ${got.join(', ') || '없음'} — 기대는 ${want.join(', ')}(자료가 무거운 두 앱). 문턱(SPLIT_MIN)을 다시 볼 것`);
  else pass(`⑤ 큰 자료 블록만 떼어냈다 — ${got.map((k) => splitBy[k][0]).join(', ')}`);
  if (splitBy['place-app.html'].length) fail('배치 시뮬레이터가 떼어졌다 — 약한 전파 첫 방문이 +17% 느려진 앱이다(실측)');
}

/* ⑥ 세 가지가 한꺼번에 맞는가 — 해시 파일명은 위(⑤)에서, 헤더·서비스워커는 여기서 */
{
  const cfg = fs.readFileSync(path.join(ROOT, 'next.config.js'), 'utf8');
  if (!/source:\s*'\/_split\/:path\*'[\s\S]{0,120}immutable/.test(cfg)) fail('next.config.js 가 /_split/ 에 immutable 캐시 헤더를 안 준다 — 재방문이 분리 전보다 느려진다(실측 +17%)');
  else pass('⑥ /_split/ 에 immutable 캐시 헤더');
  const sw = fs.readFileSync(PUB + '/sw.js', 'utf8');
  if (!/startsWith\('\/_split\/'\)\)\s*\{\s*e\.respondWith\(cacheFirst/.test(sw)) fail('서비스워커가 /_split/ 을 캐시 우선으로 안 잡는다');
  else pass('⑥ 서비스워커가 /_split/ 을 캐시 우선으로 잡는다');
  const nf = sw.slice(sw.indexOf('function networkFirst'), sw.indexOf('function networkFirst') + 400);
  const sr = sw.slice(sw.indexOf('function swr'), sw.indexOf('function swr') + 400);
  if (!nf.includes('putWithSplit(') || !sr.includes('putWithSplit(')) fail('미니앱 HTML 을 떼어낸 자료와 한 쌍으로 캐시하지 않는 길이 있다(networkFirst·swr 둘 다 필요)');
  else pass('⑥ 미니앱 HTML 을 떼어낸 자료와 한 쌍으로 캐시한다(networkFirst·swr)');
}

/* ⑦ 오프라인 — 실제 서비스워커로 한 번 열고, 전파를 끊고 다시 열어도 제품이 그대로 있는가.
 *    이것이 한 쌍 캐시의 목적이다. 쌍이 깨지면 HTML 은 뜨는데 PRODUCTS 가 없다. */
for (const f of ['finder-app.html', 'test-app.html']) {
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${base}/m/${f}`, { waitUntil: 'load' });
  await p.evaluate(async () => { await navigator.serviceWorker.register('/sw.js', { scope: '/' }); await navigator.serviceWorker.ready; });
  await p.reload({ waitUntil: 'load' });               // 이번 내비게이션이 서비스워커를 지나며 한 쌍을 캐시한다
  await p.waitForTimeout(1500);
  const online = await p.evaluate(() => document.body.innerText);
  const ctrl = await p.evaluate(() => !!navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  await p.reload({ waitUntil: 'load' }).catch(() => {});
  await p.waitForTimeout(800);
  const offline = await p.evaluate(() => document.body.innerText).catch(() => '');
  /* 화면 글자만으로는 자료가 실렸는지 모른다(첫 화면이 짧다) — 떼어낸 블록이 만든 전역을 직접 센다 */
  const dataN = await p.evaluate((g) => { try { return (0, eval)(g + '.length'); } catch { return -1; } }, f === 'finder-app.html' ? 'PRODUCTS' : 'Object.keys(QB)').catch(() => -1);
  const why = [];
  if (!ctrl) why.push('서비스워커가 페이지를 잡지 못했다');
  if (offline !== online) why.push(`오프라인 화면이 다르다(온라인 ${online.length}자 · 오프라인 ${offline.length}자)`);
  if (errs.length) why.push('페이지 오류: ' + errs.slice(0, 2).join(' | '));
  if (!(dataN > 0)) why.push('오프라인에서 떼어낸 자료가 안 실렸다(' + dataN + ')');
  if (why.length) fail(`⑦ ${f} — ${why.join(' · ')}`);
  else pass(`⑦ ${f} 전파를 끊어도 온라인과 같은 화면(${online.length}자) · 자료 ${dataN}건 — HTML 과 떼어낸 자료가 한 쌍으로 캐시됐다`);
  await ctx.close();
}

/* ⑧ 첫 방문에 열어 둔 화면 — 서비스워커가 설치되자마자(reload 없이) 전파를 끊어도 그 화면이 열리는가.
 *    서비스워커는 자기를 설치한 방문의 요청을 못 가로채므로, activate 에서 **지금 열린 창**을 캐시에
 *    넣어야 한다(warmOpenClients). 안 넣으면 처음 연 기기가 전파를 잃는 순간 아무것도 안 열린다. */
{
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.goto(`${base}/m/place-app.html`, { waitUntil: 'load' });
  await p.evaluate(async () => { await navigator.serviceWorker.register('/sw.js', { scope: '/' }); await navigator.serviceWorker.ready; });
  await p.waitForTimeout(2500);                        // activate → 열린 창을 캐시에 넣는 시간
  const online = await p.evaluate(() => document.body.innerText);
  await ctx.setOffline(true);
  const st = await p.reload({ waitUntil: 'load' }).then((r) => r && r.status()).catch((e) => 'ERR ' + e.message.slice(0, 40));
  await p.waitForTimeout(800);
  const offline = await p.evaluate(() => document.body.innerText).catch(() => '');
  const app = await p.evaluate(() => !!(window.__place && window.__place.state)).catch(() => false);
  if (st !== 200 || offline !== online || !app) fail(`⑧ 첫 방문만 하고 전파를 끊으면 안 열린다 — ${st} · 앱 ${app} · 글자 ${online.length}/${offline.length}`);
  else pass('⑧ 첫 방문에 열어 둔 화면은 reload 없이 전파를 끊어도 열린다(activate 가 열린 창을 캐시에 넣는다)');
  await ctx.close();
}

await b.close(); srv.close();
fs.rmSync(tmp, { recursive: true, force: true });

/* 배포 빌드가 실제로 압축을 부르는가 */
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (!/minify-inline\.mjs --vercel/.test(pkg.scripts.build || '')) fail('build 스크립트가 압축을 부르지 않는다 — 효과가 배포에 안 나간다');
else pass('배포 빌드가 압축을 부른다(Vercel 에서만 — 로컬 원본은 그대로)');

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
