#!/usr/bin/env node
/**
 * 미니앱 코드 재고 — `npm run audit:code [파일]`
 *
 * 사장님 지시(2026-10-07): *"코드가 어지러우면 주기적으로 정리해주고 압축해서"*.
 * 「주기적으로」는 **셀 수 있어야** 뜻이 있다 — 그래서 손으로 훑지 않고 이 도구가 센다.
 * 2026-10-07 첫 재고(place-app.html 12,036줄)에서 **죽은 함수 0 · console.log 0 · 안 쓰는 CSS 0**
 * 이었고, 진짜 중복은 벽 런 판정 여섯 줄이 세 곳에 흩어진 것 하나였다(runTol·runOps 로 모았다).
 *
 * 보고하는 것:
 *   ① 정의만 있고 아무도 안 부르는 함수(이름이 파일에 한 번만 나온다)
 *   ② 같은 이름·같은 본문으로 두 번 이상 선언된 화살표 유틸(블록마다 다시 적은 것)
 *   ③ 가장 긴 함수 10개(쪼갤 후보 — 다만 쪼개는 것 자체가 목적은 아니다)
 *   ④ <style> 의 클래스 중 HTML·JS 어디에도 없는 것
 *   ⑤ console.log · debugger · TODO/FIXME
 *   ⑥ 줄 구성(코드 / 주석 / 빈 줄) — 주석은 이 저장소의 기록이라 지우지 않는다. 배포본은
 *      scripts/minify-inline.mjs 가 어차피 걷어낸다
 *
 * 종료 코드는 늘 0 이다 — 판단은 사람이 한다(가짜 양성이 있다: 즉시 실행 함수 · 문자열로
 * 조립되는 클래스 · 자료로 참조되는 파일. CLAUDE.md 「죽은 코드 재고」 절 참조).
 */
import fs from 'node:fs';

const file = process.argv[2] || 'public/place-app.html';
const s = fs.readFileSync(file, 'utf8');
const L = s.split('\n');
const esc = (n) => n.replace(/\$/g, '\\$');

/* ⑥ 줄 구성 */
let comment = 0, blank = 0;
for (const l of L) { const t = l.trim(); if (!t) blank++; else if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) comment++; }
console.log(`${file} — ${L.length.toLocaleString()}줄 · ${(s.length / 1024).toFixed(0)}KB · 코드 ${L.length - comment - blank} · 주석 ${comment}(${Math.round(comment / L.length * 100)}%) · 빈 줄 ${blank}`);

/* ① 죽은 함수 */
const decl = [];
L.forEach((l, i) => { const m = l.match(/^(\s*)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/); if (m) decl.push({ i, ind: m[1].length, n: m[2] }); });
const dead = decl.filter((d) => (s.match(new RegExp('\\b' + esc(d.n) + '\\b', 'g')) || []).length === 1);
console.log(`① 함수 ${decl.length}개 · 정의만 있고 안 쓰는 것 ${dead.length}개${dead.length ? ' — ' + dead.map((d) => `${d.n}@${d.i + 1}`).join(' ') : ''}`);

/* ② 같은 본문의 화살표 유틸 */
const arrows = {};
for (const m of s.matchAll(/^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(\([^)]*\)|[\w$]+)\s*=>\s*(.*)$/gm)) {
  const body = (m[2] + '=>' + m[3]).replace(/\s+/g, ' ').trim();
  (arrows[m[1]] = arrows[m[1]] || []).push(body);
}
const dup = Object.entries(arrows).map(([n, v]) => { const same = v.filter((b, i) => v.indexOf(b) !== i); return same.length ? [n, same.length + 1, same[0]] : null; }).filter(Boolean);
console.log(`② 같은 본문으로 두 번 이상 적힌 화살표 유틸 ${dup.length}개${dup.map(([n, c, b]) => `\n   ${n} ×${c}  ${b.slice(0, 80)}`).join('')}`);

/* ③ 긴 함수 */
const len = decl.map((d, k) => { let e = L.length; for (let j = k + 1; j < decl.length; j++) if (decl[j].ind <= d.ind) { e = decl[j].i; break; } return { n: d.n, i: d.i + 1, len: e - d.i }; });
console.log('③ 긴 함수 — ' + len.sort((a, b) => b.len - a.len).slice(0, 10).map((x) => `${x.n}(${x.len})`).join(' · '));

/* ④ 안 쓰는 CSS 클래스 */
const s0 = s.indexOf('<style>'), s1 = s.indexOf('</style>');
if (s0 >= 0 && s1 > s0) {
  const css = s.slice(s0, s1), rest = s.slice(0, s0) + s.slice(s1);
  const cls = [...new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]))].filter((c) => !/^\d/.test(c));
  const unused = cls.filter((c) => !rest.includes(c));
  console.log(`④ CSS 클래스 ${cls.length}개 · HTML·JS 에 없는 것 ${unused.length}개${unused.length ? ' — ' + unused.join(' ') : ''}`);
}

/* ⑤ 찌꺼기 */
const cnt = (re) => (s.match(re) || []).length;
console.log(`⑤ console.log ${cnt(/console\.log\(/g)} · debugger ${cnt(/\bdebugger\b/g)} · TODO/FIXME ${cnt(/\b(TODO|FIXME)\b/g)}`);
