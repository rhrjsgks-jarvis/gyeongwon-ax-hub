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
import { minifyHtml } from './minify-inline.mjs';

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
for (const f of apps) {
  const src = fs.readFileSync(path.join(PUB, f), 'utf8');
  const { html, fails: fs2 } = await minifyHtml(src, f);
  fails.push(...fs2); before += src.length; after += html.length;
  fs.writeFileSync(path.join(tmp, f), html);
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
await b.close(); srv.close();
fs.rmSync(tmp, { recursive: true, force: true });

/* 배포 빌드가 실제로 압축을 부르는가 */
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (!/minify-inline\.mjs --vercel/.test(pkg.scripts.build || '')) fail('build 스크립트가 압축을 부르지 않는다 — 효과가 배포에 안 나간다');
else pass('배포 빌드가 압축을 부른다(Vercel 에서만 — 로컬 원본은 그대로)');

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
