#!/usr/bin/env node
/**
 * 벽 분할 모델 경로 — `npm run test:seg`
 *
 * 배치 시뮬레이터는 도면의 벽을 모델(plan3d)로 읽고, 못 읽으면 규칙 인식으로 물러선다.
 * 규칙 경로는 test-plans·test-real 이 `?seg=0` 으로 지킨다. 여기서는 **모델 경로**를 지킨다.
 *
 *   ① 싣는 것 — 등록부의 모델 파일이 있고 이름 해시가 내용과 맞는가 · 런타임 파일이 제 판인가
 *   ② 모델로 읽힌다 — 실제 분양 도면에서 벽을 모델이 찾았고 문·창이 갈렸는가
 *   ③ 물러선다 — 등록부에서 빼거나 모델 파일이 없으면 **규칙 인식으로** 간다(상담이 멈추면 안 된다)
 *   ④ 3D — 모델이 가른 문(인방)·창(인방+유리)이 서는가
 *   ⑤ 품질 — 실제 도면에서 **방 이름 자리를 벽으로 칠한 비율**(글자오탐)이 규칙 인식보다 나쁘지 않은가
 *   ⑥ 벽 편집 — 고르기·지우기·되돌리기·영역 지우기가 판정과 3D 를 함께 바꾸는가(진짜 마우스)
 *      방 이름 자리는 방 안이다(OCR 좌표, plan-names.json) — 정답 없이 매장 도면을 채점하는 잣대다
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
let ok = true;
const fail = (m) => { ok = false; console.log('ERROR: ' + m); };
const pass = (m) => console.log('OK: ' + m);

/* ① 싣는 것 */
const man = JSON.parse(fs.readFileSync(path.join(PUB, 'models', 'manifest.json'), 'utf8'));
const ws = man.wallSeg;
if (!ws) { console.log('SKIP: 등록부에 wallSeg 가 없다 — 모델을 끈 상태다(규칙 인식만 쓴다)'); process.exit(0); }
const mf = path.join(PUB, 'models', ws.file);
if (!fs.existsSync(mf)) fail(`등록부가 가리키는 모델 파일이 없다: models/${ws.file}`);
else {
  const h = crypto.createHash('sha256').update(fs.readFileSync(mf)).digest('hex').slice(0, 10);
  if (!ws.file.includes(h)) fail(`모델 이름의 해시가 내용과 다르다(${ws.file} vs ${h}) — 캐시 우선이라 옛 모델이 굳는다`);
  else pass(`① 모델 models/${ws.file} (${(fs.statSync(mf).size / 1e6).toFixed(1)}MB) — 이름 해시 일치`);
}
const ortV = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'onnxruntime-web', 'package.json'), 'utf8')).version;
if (ws.ort !== `vendor/ort-${ortV}`) fail(`런타임 폴더가 설치된 판과 다르다(${ws.ort} vs ort-${ortV}) — node scripts/build-seg.mjs 를 다시 돌릴 것`);
for (const f of ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'])
  if (!fs.existsSync(path.join(PUB, ws.ort, f))) fail(`런타임 파일이 없다: ${ws.ort}/${f}`);
if (ok) pass(`① 런타임 ${ws.ort} (3개)`);

let chromium;
try { ({ chromium } = await import('playwright')); } catch { console.log('SKIP: playwright 없음'); process.exit(ok ? 0 : 1); }

const T = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.jpg': 'image/jpeg', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, s) => {
  const f = path.join(PUB, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); s.end(fs.readFileSync(f));
}).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
const b = await chromium.launch();

/** 앱을 열고 도면 한 장을 올린 뒤 벽 인식이 끝날 때까지 기다린다 */
async function openPlan(file, { query = '', route } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
  if (route) await ctx.route(route.url, route.fn);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${base}/place-app.html${query}`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__place && window.__place.useImage, null, { timeout: 20000 });
  await p.evaluate((f) => window.__place.useImage(f), file);
  await p.waitForFunction(() => { const s = window.__place.state; return s.baseInfo && s.baseMask; }, null, { timeout: 90000 });
  return { ctx, p, errs };
}
const stat = (p) => p.evaluate(() => {
  const s = window.__place.state, m = s.baseMask;
  const cnt = (a) => { if (!a) return 0; let n = 0; for (const v of a) n += v; return n; };
  return { source: s.baseInfo.source, segMs: s.baseInfo.segMs, wall: cnt(m.dark) / m.dark.length, door: cnt(m.door), win: cnt(m.win) };
});

/* ② 모델로 읽힌다 */
const PLAN = '/plans/c39/84B.jpg';
{
  const { ctx, p, errs } = await openPlan(PLAN);
  const r = await stat(p);
  if (r.source !== 'model') fail(`② 모델이 아니라 ${r.source} 로 읽혔다 — 모델 경로가 죽었다`);
  else if (r.wall < 0.01 || r.wall > 0.30) fail(`② 벽 픽셀 ${(r.wall * 100).toFixed(1)}% — 도면 벽으로 보기 어렵다(1~30% 기대). 학습 안 된 모델이 실렸을 수 있다`);
  else if (!r.door || !r.win) fail(`② 문 ${r.door} · 창 ${r.win} 픽셀 — 모델이 문·창을 가르지 못했다`);
  else pass(`② 모델이 읽었다 — 벽 ${(r.wall * 100).toFixed(1)}% · 문 ${r.door}px · 창 ${r.win}px · ${r.segMs}ms`);
  if (errs.length) fail('② 페이지 오류: ' + errs.join(' | '));

  /* ④ 3D — 축척을 세우고 연다 */
  const o = await p.evaluate(async () => {
    const P = window.__place, s = P.state;
    if (!s.mmPerPx) { s.mmPerPx = 14; s.scaled = true; }
    if (window.load3D) await window.load3D();
    window.Place3D.open();
    return window.Place3D._dbg.openings;
  }).catch((e) => ({ err: String(e) }));
  if (!o || o.err) fail('④ 3D 에 문·창이 서지 않았다 ' + (o && o.err ? o.err : ''));
  else pass(`④ 3D 에 문 ${o.door}곳(인방) · 창 ${o.win}곳(인방+유리)`);
  await ctx.close();
}

/* ③ 물러선다 — 등록부에서 빼면 / 모델 파일이 없으면 */
for (const [label, route] of [
  ['등록부에 모델이 없을 때', { url: '**/models/manifest.json', fn: async (rt) => {
    const j = JSON.parse(fs.readFileSync(path.join(PUB, 'models', 'manifest.json'), 'utf8')); delete j.wallSeg;
    await rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) }); } }],
  ['모델 파일을 못 받을 때', { url: '**/models/wall-seg.*', fn: (rt) => rt.fulfill({ status: 404, body: '' }) }],
]) {
  const { ctx, p, errs } = await openPlan(PLAN, { route });
  const r = await stat(p);
  if (r.source !== 'rule') fail(`③ ${label} 규칙 인식으로 물러서지 않았다(${r.source})`);
  else if (errs.length) fail(`③ ${label} 페이지 오류: ${errs.join(' | ')}`);
  else pass(`③ ${label} — 규칙 인식으로 물러섰다(벽 ${(r.wall * 100).toFixed(1)}%)`);
  await ctx.close();
}

/* ⑥ 벽 편집 — 사람이 고치면 판정(픽셀 마스크)과 3D(선분)가 **함께** 바뀌는가 · 되돌리기 · 영역 지우기
   계산은 test-wallvec ⑧~⑬ 이 지키고, 여기서는 **화면 배선**을 진짜 마우스로 지킨다. */
{
  const { ctx, p, errs } = await openPlan(PLAN);
  await p.evaluate(() => { const s = window.__place.state; s.mmPerPx = 17.369; s.scaled = true;
    document.querySelectorAll('#modal.on').forEach((m) => m.classList.remove('on')); document.getElementById('btn-vedit').click(); });
  const inView = await p.evaluate(() => { const s = window.__place.state, bm = s.baseMask, f = s.mmPerPx / (bm.S || 1), r = document.getElementById('cv').getBoundingClientRect();
    let out = 0; for (const w of bm.vec.walls){ const x = (w.o === 'h' ? w.a : w.c) * f * s.zoom + s.panX, y = (w.o === 'h' ? w.c : w.a) * f * s.zoom + s.panY; if (x < -2 || y < -2 || x > r.width + 2 || y > r.height + 2) out++; }
    return { mode: s.mode, out }; });
  if (inView.mode !== 'vedit') fail('⑥ 벽 편집에 들어가지 못했다(모드 ' + inView.mode + ')');
  else if (inView.out) fail(`⑥ 벽 편집에 들어갔는데 읽은 벽 ${inView.out}개가 화면 밖이다 — 첨부 평면처럼 고칠 것이 안 보인다`);
  const pick = await p.evaluate(() => { const s = window.__place.state, bm = s.baseMask, v = bm.vec, bb = bm.bbox, cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
    let bi = -1, bd = 1e9; v.walls.forEach((w, i) => { const L = w.b - w.a; if (L < 20) return;
      const x = w.o === 'h' ? (w.a + w.b) / 2 : w.c, y = w.o === 'h' ? w.c : (w.a + w.b) / 2, d = Math.hypot(x - cx, y - cy);
      if (d < bd && !v.openings.some((o) => o.wall === i)) { bd = d; bi = i; } });
    const w = v.walls[bi], mx = w.o === 'h' ? (w.a + w.b) / 2 : w.c, my = w.o === 'h' ? w.c : (w.a + w.b) / 2, f = s.mmPerPx / (bm.S || 1);
    const r = document.getElementById('cv').getBoundingClientRect();
    return { mx, my, x: r.left + mx * f * s.zoom + s.panX, y: r.top + my * f * s.zoom + s.panY, n: v.walls.length }; });
  const judge = () => p.evaluate(([mx, my]) => { const s = window.__place.state, f = s.mmPerPx / (s.baseMask.S || 1); return window.__place.wallAt(mx * f, my * f); }, [pick.mx, pick.my]);
  await p.mouse.click(pick.x, pick.y);
  const sel = await p.evaluate(() => window.__place.state.vEdit.sel);
  const j0 = await judge();
  await p.click('#ve-del');
  const j1 = await judge();
  await p.click('#ve-undo');
  const j2 = await judge();
  if (!sel || sel.kind !== 'w') fail('⑥ 벽을 눌렀는데 벽이 안 골라졌다: ' + JSON.stringify(sel));
  else if (j0 !== 'wall' || j1 !== 'free' || j2 !== 'wall') fail(`⑥ 판정이 편집을 안 따른다 — 지우기 전 ${j0} · 지운 뒤 ${j1} · 되돌린 뒤 ${j2}(wall·free·wall 기대)`);
  else pass('⑥ 누르면 골라지고 · 지우면 그 자리가 놓을 수 있는 곳이 되고 · 되돌리면 벽으로 돌아온다');
  /* 영역 지우기 — 위쪽 30% 에 통째로 든 벽(84B 의 「기본형」 첨부 평면)을 끌어 두른다 */
  const box = await p.evaluate(() => { const s = window.__place.state, bm = s.baseMask, v = bm.vec, lim = bm.h * 0.3, f = s.mmPerPx / (bm.S || 1);
    const top = v.walls.filter((w) => (w.o === 'h' ? w.c + w.t / 2 : w.b) < lim);
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (const w of top){ const t = w.t / 2, r = w.o === 'h' ? [w.a, w.c - t, w.b, w.c + t] : [w.c - t, w.a, w.c + t, w.b];
      x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[2]); y1 = Math.max(y1, r[3]); }
    const c = document.getElementById('cv').getBoundingClientRect(), P = (x, y) => [c.left + x * f * s.zoom + s.panX, c.top + y * f * s.zoom + s.panY];
    return { n: top.length, a: P(x0 - 6, y0 - 6), b: P(x1 + 6, y1 + 6), w0: v.walls.length }; });
  if (box.n < 5) fail(`⑥ 준비 — 84B 위쪽 첨부 평면 벽이 ${box.n}개뿐이다(모델이 바뀌었으면 도면을 다시 고를 것)`);
  else {
    await p.click('#ve-box');
    await p.mouse.move(box.a[0], box.a[1]); await p.mouse.down();
    for (let k = 1; k <= 6; k++) await p.mouse.move(box.a[0] + (box.b[0] - box.a[0]) * k / 6, box.a[1] + (box.b[1] - box.a[1]) * k / 6);
    await p.mouse.up();
    const w1 = await p.evaluate(() => window.__place.state.baseMask.vec.walls.length);
    if (box.w0 - w1 < box.n * 0.8) fail(`⑥ 영역 지우기 — 첨부 평면 ${box.n}개 중 ${box.w0 - w1}개만 지웠다`);
    else pass(`⑥ 영역 지우기 — 첨부 평면을 한 번에 지웠다(벽 ${box.w0}→${w1})`);
  }
  /* 3D 가 편집 결과를 그대로 세우는가 */
  const d3 = await p.evaluate(async () => { const v = window.__place.state.baseMask.vec;
    document.getElementById('ve-done').click();
    if (window.load3D) await window.load3D(); window.Place3D.open();
    const o = window.Place3D._dbg.openings;
    return { d3: o, door: v.openings.filter((x) => x.type === 'door' && x.wall >= 0).length, win: v.openings.filter((x) => x.type === 'win' && x.wall >= 0).length }; });
  if (!d3.d3 || d3.d3.door !== d3.door || d3.d3.win !== d3.win) fail(`⑥ 3D 가 편집을 안 따른다 — 선분 문 ${d3.door}·창 ${d3.win} vs 3D ${JSON.stringify(d3.d3)}`);
  else pass(`⑥ 3D 가 편집 결과 그대로 선다(문 ${d3.door} · 창 ${d3.win})`);
  if (errs.length) fail('⑥ 페이지 오류: ' + errs.join(' | '));
  await ctx.close();
}

/* ⑤ 품질 — 실제 도면에서 방 이름 자리를 벽으로 칠했나(규칙 대 모델, 같은 도면·같은 잣대) */
{
  const names = JSON.parse(fs.readFileSync(path.join(PUB, 'plan-names.json'), 'utf8'));
  const idx = JSON.parse(fs.readFileSync(path.join(PUB, 'plan-index.json'), 'utf8'));
  const pool = [];
  for (const c of idx.complexes) for (const pl of c.plans) if ((pl.axis || 0) >= 0.35 && (names[pl.file] || []).length >= 4) pool.push(pl.file);
  const pick = pool.sort((a, z) => crypto.createHash('md5').update(a).digest('hex').localeCompare(crypto.createHash('md5').update(z).digest('hex'))).slice(0, Number(process.env.SEG_N || 12));
  const score = { rule: [0, 0, 0], model: [0, 0, 0] };            // [이름 자리 중 벽, 이름 자리 수, 벽 못 찾은 도면]
  for (const f of pick) for (const mode of ['rule', 'model']) {
    const { ctx, p } = await openPlan('/' + f, { query: mode === 'rule' ? '?seg=0' : '' });
    const r = await p.evaluate((pts) => {
      const s = window.__place.state, m = s.baseMask, S = m.S || 1;
      let hit = 0, n = 0, wall = 0;
      for (const v of m.dark) wall += v;
      for (const q of pts) {
        const cx = Math.round(q.x * s.imgW * S), cy = Math.round(q.y * s.imgH * S), r = Math.max(1, Math.round(Math.min(m.w, m.h) * 0.006));
        let on = 0, tot = 0;
        for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue; tot++; on += m.dark[y * m.w + x];
        }
        if (tot) { n++; if (on / tot > 0.3) hit++; }
      }
      return { hit, n, empty: wall / m.dark.length < 0.005 ? 1 : 0, source: s.baseInfo.source };
    }, names[f]);
    const k = r.source === 'model' ? 'model' : 'rule';
    score[k][0] += r.hit; score[k][1] += r.n; score[k][2] += r.empty;
    await ctx.close();
  }
  const rate = (k) => score[k][0] / Math.max(1, score[k][1]);
  const line = `규칙 ${(rate('rule') * 100).toFixed(1)}% vs 모델 ${(rate('model') * 100).toFixed(1)}% (방 이름 ${score.model[1]}곳 · 도면 ${pick.length}장) · 벽 못 찾은 도면 규칙 ${score.rule[2]} / 모델 ${score.model[2]}`;
  if (rate('model') > rate('rule') + 0.02) fail('⑤ 모델이 방 이름 자리를 규칙보다 더 벽으로 칠한다 — ' + line);
  else if (score.model[2] > score.rule[2]) fail('⑤ 모델이 벽을 못 찾은 도면이 규칙보다 많다 — ' + line);
  else pass('⑤ 글자오탐 ' + line);
}

await b.close(); srv.close();
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
