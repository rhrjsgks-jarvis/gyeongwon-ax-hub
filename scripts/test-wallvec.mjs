#!/usr/bin/env node
/**
 * 벽 벡터화(public/wall-vec.js) — `npm run test:wallvec`
 *
 * 정답을 아는 **합성 도면**으로 본다. 실제 도면으로 잰 수치(모델 마스크 대비 재현 95.6% ·
 * 정밀 96.8% · AI Hub 정답 IoU 77.0, 2026-09-28)는 .scratch/ml-lab/vec-eval.mjs 가 잰다.
 *
 *   ① 방 하나 — 네 벽이 선분 넷으로, 다시 칠하면 원래 마스크와 거의 같다
 *   ② 삼킴 — 같은 선 위 두 조각의 중심선이 조금 달라도 한쪽이 사라지지 않는다(실제로 300px 벽이 빠졌다)
 *   ③ 모서리 — 두 벽이 만나는 칸이 비지 않는다(끝을 상대 벽 바깥 면까지)
 *   ④ 토막 — 창과 모서리 사이의 짧은 벽은 살리고, 떨어진 부스러기는 버린다
 *   ⑤ 문 — 여닫는 호까지 포함한 정사각형 덩어리를 **벽의 틈** 위에, 틈 폭으로 놓는다
 *   ⑥ 속도 — 1024px 도면 한 장 100ms 안(실측 중앙값 10ms)
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'public', 'wall-vec.js'), 'utf8'));
const V = globalThis.WallVec;
let ok = true;
const fail = (m) => { ok = false; console.log('ERROR: ' + m); };
const pass = (m) => console.log('OK: ' + m);

const W = 400, H = 300;
const blank = () => new Uint8Array(W * H);
const fill = (m, x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 1; };
const iou = (a, b) => { let tp = 0, u = 0; for (let i = 0; i < a.length; i++) { tp += a[i] & b[i]; u += a[i] | b[i]; } return tp / Math.max(1, u); };
const T = 10;                                   // 벽 두께 10px

/** 방 하나: (50,50)-(350,250) 바깥 면, 두께 10 */
function room(m) {
  fill(m, 50, 50, 350, 50 + T); fill(m, 50, 250 - T, 350, 250);
  fill(m, 50, 50, 50 + T, 250); fill(m, 350 - T, 50, 350, 250);
}

/* ① */
{
  const m = blank(); room(m);
  const v = V.vectorize({ w: W, h: H, wall: m });
  const r = iou(V.rasterize(v, W, H), m);
  const h = v.walls.filter((s) => s.o === 'h').length, vv = v.walls.filter((s) => s.o === 'v').length;
  if (h !== 2 || vv !== 2) fail(`① 방 하나가 가로 ${h} · 세로 ${vv} 개로 나왔다(2·2 기대)`);
  else if (r < 0.97) fail(`① 다시 칠한 것이 원래와 IoU ${(r * 100).toFixed(1)}% — 97% 미만`);
  else if (v.walls.some((s) => Math.abs(s.t - T) > 1)) fail('① 두께가 틀렸다: ' + v.walls.map((s) => s.t).join(','));
  else pass(`① 방 하나 — 선분 4개 · IoU ${(r * 100).toFixed(1)}% · 두께 ${T}px`);
}

/* ② 같은 선 위 두 조각, 중심선이 2px 어긋남 — 위 조각(길다)이 삼켜지면 안 된다 */
{
  const m = blank();
  fill(m, 100, 20, 110, 170);    // 위: x 100..110, y 20..170 (150px)
  fill(m, 98, 172, 108, 240);    // 아래: 2px **왼쪽**(중심선이 더 작다 — 옛 정렬에서 먼저 오는 쪽) · 틈 2px(잇는 여유 안)
  const v = V.vectorize({ w: W, h: H, wall: m });
  const cov = v.walls.filter((s) => s.o === 'v').reduce((a, s) => a + (s.b - s.a), 0);
  if (cov < 210) fail(`② 세로 벽이 ${cov}px 만 남았다(약 220px 기대) — 한 조각이 삼켜졌다`);
  else pass(`② 어긋난 두 조각이 이어지고 사라지지 않는다(${cov}px)`);
}

/* ③ 모서리 칸 */
{
  const m = blank(); room(m);
  const ras = V.rasterize(V.vectorize({ w: W, h: H, wall: m }), W, H);
  const holes = [[55, 55], [345, 55], [55, 245], [345, 245]].filter(([x, y]) => !ras[y * W + x]);
  if (holes.length) fail(`③ 모서리 ${holes.length}곳이 비었다: ${JSON.stringify(holes)}`);
  else pass('③ 네 모서리가 다 찼다');
}

/* ④ 토막 — 아래 벽에 창(160..300)이 있고, 왼쪽 모서리와 창 사이 짧은 벽(60..90, 30px = 두께 3배 미만) */
{
  const m = blank(), win = blank();
  fill(m, 50, 50, 50 + T, 250);                       // 왼쪽 세로 벽
  fill(m, 50, 240, 78, 250);                          // 짧은 토막 — 세로 벽 면(60)부터 창까지 18px, 두께의 2배 미만
  fill(win, 78, 242, 300, 248);                       // 창
  fill(m, 300, 240, 350, 250);
  fill(m, 200, 120, 206, 126);                        // 떨어진 부스러기 6x6
  const v = V.vectorize({ w: W, h: H, wall: m, win });
  const stub = v.walls.some((s) => s.o === 'h' && s.c > 240 && s.c < 250 && s.a <= 62 && s.b >= 76);
  const speck = v.walls.some((s) => s.c > 115 && s.c < 131 && s.a >= 195 && s.b <= 211);
  if (!stub) fail('④ 창 옆 짧은 벽(토막)이 빠졌다 — 3D 에서 창이 공중에 뜬다');
  else if (speck) fail('④ 떨어진 부스러기가 벽이 됐다');
  else pass('④ 창 옆 토막은 살리고 부스러기는 버린다');
  const w1 = v.openings.find((o) => o.type === 'win');
  if (!w1 || w1.o !== 'h' || w1.wall < 0) fail('④ 창이 아래 벽선에 붙지 않았다: ' + JSON.stringify(w1));
  else pass(`④ 창이 가로 벽선에 붙었다(${Math.round(w1.a)}..${Math.round(w1.b)})`);
}

/* ⑤ 문 — 위 벽 x 150..210 이 틈, 그 아래(방 안) 60x60 정사각형이 문(호 포함 상자) */
{
  const m = blank(), door = blank();
  fill(m, 50, 50, 150, 60); fill(m, 210, 50, 350, 60);          // 위 벽, 틈 150..210
  fill(m, 50, 50, 60, 250); fill(m, 340, 50, 350, 250); fill(m, 50, 240, 350, 250);
  fill(door, 150, 55, 210, 115);                                  // 정사각형 60x60
  const v = V.vectorize({ w: W, h: H, wall: m, door });
  const d = v.openings.find((o) => o.type === 'door');
  if (!d) fail('⑤ 문이 안 잡혔다');
  else if (d.o !== 'h' || Math.abs(d.c - 55) > 3) fail(`⑤ 문이 엉뚱한 선 위에 있다: o=${d.o} c=${d.c}(가로, 55 기대)`);
  else if (Math.abs(d.a - 150) > 3 || Math.abs(d.b - 210) > 3) fail(`⑤ 문 폭이 틈과 다르다: ${d.a}..${d.b}(150..210 기대)`);
  else if (Math.abs(d.t - T) > 1) fail(`⑤ 문 두께가 벽과 다르다: ${d.t}`);
  else pass('⑤ 정사각형 문 덩어리를 벽 틈 위(가로, 150..210)에 벽 두께로 놓았다');
}

/* ⑦ 떠 있는 문 — 방 한가운데 문 덩어리가 같은 줄 위 **먼** 벽에 붙으면 안 된다(실측 84B 에서 거실 한가운데 인방이 섰다) */
{
  const m = blank(), door = blank();
  room(m);
  fill(m, 290, 145, 340, 155);                                     // 방 안 짧은 벽, 가로 줄 y=150
  fill(door, 150, 150, 200, 200);                                  // 윗변이 그 줄 위(y=150)지만 90px 떨어져 있다
  const v = V.vectorize({ w: W, h: H, wall: m, door });
  const d = v.openings.find((o) => o.type === 'door');
  if (!d) fail('⑦ 문 덩어리가 아예 안 나왔다');
  else if (d.wall >= 0) fail(`⑦ 방 한가운데 문이 먼 벽(${d.wall})에 붙었다 — 3D 에서 공중에 인방이 선다`);
  else pass('⑦ 벽에 닿지 않는 문 덩어리는 벽에 붙이지 않는다(wall -1)');
}

/* ⑧~⑫ 사람이 고친다 — WallVec.edit (배치 시뮬레이터 '벽 편집') */
const E = V.edit;
function withDoor(){
  const m = blank(), door = blank();
  fill(m, 50, 50, 150, 60); fill(m, 210, 50, 350, 60);
  fill(m, 50, 50, 60, 250); fill(m, 340, 50, 350, 250); fill(m, 50, 240, 350, 250);
  fill(m, 200, 100, 210, 240);                                    // 방 가운데 칸막이(세로)
  fill(door, 150, 55, 210, 115);
  return { m, v: V.vectorize({ w: W, h: H, wall: m, door }) };
}
/* ⑧ 고르기 — 문 위를 누르면 벽이 아니라 문이 잡힌다 */
{
  const { v } = withDoor();
  const h1 = E.hit(v, 180, 55, 4), h2 = E.hit(v, 55, 150, 4), h3 = E.hit(v, 120, 150, 4);
  if (!h1 || h1.kind !== 'o') fail('⑧ 문 위를 눌렀는데 문이 안 잡혔다: ' + JSON.stringify(h1));
  else if (!h2 || h2.kind !== 'w' || v.walls[h2.i].o !== 'v') fail('⑧ 왼쪽 벽을 눌렀는데 그 벽이 안 잡혔다: ' + JSON.stringify(h2));
  else if (h3) fail('⑧ 빈 방바닥을 눌렀는데 무언가 잡혔다: ' + JSON.stringify(h3));
  else pass('⑧ 문은 문으로 · 벽은 벽으로 · 빈 바닥은 아무것도 안 잡힌다');
}
/* ⑨ 벽 지우기 — 번호가 밀려도 문은 제 벽에 남는다 */
{
  const { v } = withDoor();
  const d = v.openings.find((o) => o.type === 'door');
  const host = v.walls[d.wall];
  v.walls.splice(d.wall, 1); v.walls.push(host);                      // 문 벽을 맨 뒤로 — 앞 번호를 지울 자리를 만든다
  v.openings = [d];                                                   // 이 검사는 문 하나만 본다
  d.wall = v.walls.length - 1;
  const victim = 0;                                                   // 문 벽보다 앞 번호를 지운다
  if (victim < 0) fail('⑨ 준비 실패 — 문 벽보다 앞 번호 벽이 없다');
  else {
    E.removeWall(v, victim);
    if (v.walls[d.wall] !== host) fail('⑨ 앞 벽을 지웠더니 문이 엉뚱한 벽을 가리킨다(번호가 안 밀렸다)');
    else {
      const hi = v.walls.indexOf(host);
      E.removeWall(v, hi);
      if (v.openings.some((o) => o === d)) fail('⑨ 벽을 지웠는데 그 벽의 문이 남았다 — 3D 에서 문이 허공에 선다');
      else pass('⑨ 벽을 지우면 뒤 번호가 당겨지고, 그 벽의 문은 함께 지워진다');
    }
  }
}
/* ⑩ 벽 옮기기 — 문이 따라간다 */
{
  const { v } = withDoor();
  const d = v.openings.find((o) => o.type === 'door'), c0 = v.walls[d.wall].c;
  E.moveWall(v, d.wall, c0 + 20);
  if (Math.abs(d.c - (c0 + 20)) > 0.5) fail(`⑩ 벽을 20 옮겼는데 문은 ${d.c}(${c0 + 20} 기대)`);
  else pass('⑩ 벽을 옮기면 붙은 문도 같은 만큼 간다');
}
/* ⑪ 벽 더하기 — 모서리를 바깥 면까지 이어 홈이 없다 */
{
  const m = blank(); room(m);
  const v = V.vectorize({ w: W, h: H, wall: m });
  const i = E.addWall(v, 57, 150, 343, 152, T, 8);                 // 좌우 벽 중심선 근처에서 찍었다
  const s = v.walls[i];
  const ras = V.rasterize(v, W, H);
  if (i < 0 || s.o !== 'h') fail('⑪ 가로 벽이 안 더해졌다: ' + JSON.stringify(s));
  else if (s.a > 50.5 || s.b < 349.5) fail(`⑪ 끝이 수직 벽 바깥 면까지 안 갔다: ${s.a}..${s.b}(50..350 기대)`);
  else if (!ras[151 * W + 55] || !ras[151 * W + 345]) fail('⑪ 새 벽과 옆 벽 사이가 비었다');
  else pass(`⑪ 두 점으로 더한 벽이 옆 벽 바깥 면까지 이어진다(${s.a}..${s.b})`);
}
/* ⑫ 판정 마스크 — 지운 벽 자리는 비고, 교차점에서 남의 벽은 안 깎인다 · 되돌리기 */
{
  const { m, v } = withDoor();
  const w0 = JSON.parse(JSON.stringify(v.walls)), snap = E.snapshot(v);
  const mid = v.walls.findIndex((s) => s.o === 'v' && s.c > 190 && s.c < 215);   // 가운데 칸막이
  E.removeWall(v, mid);
  const out = E.editedMask(m, w0, v, W, H);
  if (out[170 * W + 205]) fail('⑫ 지운 칸막이 자리가 판정 마스크에 벽으로 남았다 — 거기 가전을 못 놓는다');
  else if (!out[245 * W + 205]) fail('⑫ 칸막이를 지우며 아래 벽(교차점)까지 깎였다');
  else if (!out[55 * W + 100]) fail('⑫ 손대지 않은 벽이 판정 마스크에서 사라졌다');
  else {
    E.restore(v, snap);
    if (v.walls.length !== w0.length) fail('⑫ 되돌리기가 벽 수를 되살리지 못했다');
    else pass('⑫ 지운 벽 자리는 비고 · 교차점은 남고 · 되돌리기가 원래대로 돌린다');
  }
}

/* ⑬ 영역 지우기 — 네모 안에 통째로 든 것만 지운다(첨부 평면), 걸친 바깥벽은 남긴다 */
{
  const m = blank(); room(m);
  fill(m, 360, 20, 390, 22); fill(m, 360, 40, 390, 42); fill(m, 360, 20, 362, 42); fill(m, 388, 20, 390, 42);   // 오른쪽 위 작은 첨부 평면
  const v = V.vectorize({ w: W, h: H, wall: m, opt: {} });
  const n0 = v.walls.length;
  const n = E.removeInRect(v, 345, 10, 399, 60);                    // 첨부 평면을 두르되 방 오른쪽 벽(340..350)에 걸친다
  const right = v.walls.some((s) => s.o === 'v' && s.c > 340 && s.c < 350 && s.b - s.a > 150);
  if (!n) fail('⑬ 네모 안의 첨부 평면이 하나도 안 지워졌다');
  else if (!right) fail('⑬ 네모에 걸치기만 한 방 오른쪽 벽까지 지웠다');
  else if (v.walls.some((s) => (s.o === 'h' ? (s.a + s.b) / 2 : s.c) > 355 && (s.o === 'h' ? s.c : (s.a + s.b) / 2) < 50)) fail('⑬ 첨부 평면 조각이 남았다');
  else pass(`⑬ 영역 지우기 — 첨부 평면 ${n}개를 지우고 걸친 바깥벽은 남겼다(${n0}→${v.walls.length})`);
}

/* ⑥ 속도 — 1024x768 에 방 격자 */
{
  const w = 1024, h = 768, m = new Uint8Array(w * h);
  const f2 = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * w + x] = 1; };
  for (let x = 40; x <= 980; x += 188) f2(x, 40, x + 14, 730);
  for (let y = 40; y <= 720; y += 172) f2(40, y, 994, y + 14);
  const t0 = performance.now(); const v = V.vectorize({ w, h, wall: m }); const ms = performance.now() - t0;
  if (ms > 100) fail(`⑥ ${ms.toFixed(0)}ms — 100ms 초과`);
  else pass(`⑥ 1024px 방 격자 ${ms.toFixed(0)}ms · 선분 ${v.walls.length}개`);
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
