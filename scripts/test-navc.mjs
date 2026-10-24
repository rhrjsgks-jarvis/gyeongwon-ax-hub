/*
 * 사이드바 네비게이션 + ☰ 접기 + 맨 위 경로 — 여섯 앱 공용 배선 (2026-10-24 사장님 승인 시안)
 *
 * 서랍·덮개·경로 모양은 share-kit.js(AxNav) 한 곳에 있고, 앱은 셋만 한다:
 *   메뉴 상자에 class="ax-navbox" · 접힘 배치(CSS) · 고른 뒤 AxNav.done() · 경로는 AxNav.crumb.
 * 한 앱만 옛 단계 메뉴(뒤로가기 단추·옆으로 밀기)로 남거나, ☰ 목록(NAVC_PATHS)에서 빠지면
 * 화면마다 메뉴가 다르게 움직인다 — 그것을 문다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const bad = [];

const APPS = [
  ['install', 'public/install-app.html', /html\.ax-navc main\{grid-template-columns:minmax\(0,1fr\)\}/],
  ['finder', 'public/finder-app.html', /html\.ax-navc \.wrap\{grid-template-columns:minmax\(0,1fr\)\}/],
  ['compare', 'public/compare-app.html', /html\.ax-navc #tab-db main\{grid-template-columns:minmax\(0,1fr\)\}/],
  ['as', 'public/as-app.html', /html\.ax-navc \.wrap\{grid-template-columns:minmax\(0,1fr\)\}/],
  ['care', 'public/care-app.html', /html\.ax-navc #carePane\{grid-template-columns:minmax\(0,1fr\)\}/],
  ['install-cost', 'public/install-cost-app.html', /html\.ax-navc \.wrap\{grid-template-columns:minmax\(0,1fr\)\}/],
];
const nav = read('lib/navCollapse.ts');
for (const [name, file, layout] of APPS) {
  const s = read(file);
  if (/dm-back/.test(s)) bad.push(`${name}: 단계 메뉴의 뒤로가기 단추가 남아 있다(사이드바는 단계를 밀고 당기지 않는다)`);
  if (/translateX\(-(100|\$\{)/.test(s)) bad.push(`${name}: 메뉴를 옆으로 미는 단계 전환이 남아 있다`);
  if (!/ax-navbox/.test(s)) bad.push(`${name}: 메뉴 상자에 ax-navbox 가 없다 — ☰ 접힘에서 서랍이 안 열린다`);
  if (!layout.test(s)) bad.push(`${name}: ☰ 로 접혔을 때 내용이 폭을 다 쓰지 않는다`);
  if (!/AxNav\.done\(\)/.test(s)) bad.push(`${name}: 메뉴에서 고른 뒤 서랍을 닫지 않는다(AxNav.done)`);
  if (!/AxNav\.crumb\(/.test(s) || !/class="crumb"/.test(s)) bad.push(`${name}: 맨 위 경로(브레드크럼)가 없다`);
  if (/sk === 'navc'/.test(s)) bad.push(`${name}: 접기 신호를 앱이 따로 받는다 — share-kit.js(AxNav) 한 곳이 받아야 한다`);
  if (!new RegExp(`'/${name}'`).test(nav)) bad.push(`navCollapse.ts 의 NAVC_PATHS 에 '/${name}' 이 없다 — ☰ 가 안 뜬다`);
  if (!/share-kit\.js/.test(s)) bad.push(`${name}: share-kit.js 를 싣지 않는다 — AxNav 가 없다`);
}

const kit = read('public/share-kit.js');
if (!/sk === 'navc'/.test(kit) || !/sk === 'navc-drawer'/.test(kit)) bad.push('share-kit.js: 접기·서랍 신호를 받지 않는다');
if (!/sk: 'navc-set', on: false/.test(kit)) bad.push('share-kit.js: 「메뉴 펼쳐 두기」가 부모에게 알리지 않는다');
if (!/Back\.open\(close, isOpen\)/.test(kit)) bad.push('share-kit.js: 서랍을 기기 뒤로가기로 닫을 수 없다');
if (!/window\.AxNav = \{/.test(kit)) bad.push('share-kit.js: AxNav 가 없다');
if (!/var b = box\(\); if \(!b\) return;/.test(kit)) bad.push('share-kit.js: 메뉴가 없는 화면에서 빈 덮개가 뜬다');
if (/!m\.offsetParent \|\|/.test(kit)) bad.push('share-kit.js: 서랍(fixed)의 메뉴 높이를 못 잰다(offsetParent 판정)');

if (bad.length) { bad.forEach((m) => console.log('FAIL: ' + m)); console.log('SOME FAILED'); process.exit(1); }
console.log('OK: 여섯 앱 사이드바 · ☰ 접기 · 경로 배선');
console.log('ALL PASS');
