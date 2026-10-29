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
  if (!/ax-navbox/.test(s)) bad.push(`${name}: 메뉴 상자에 ax-navbox 가 없다 — ☰ 로 앱 메뉴를 여닫을 수 없다`);
  if (!layout.test(s)) bad.push(`${name}: ☰ 로 접혔을 때 내용이 폭을 다 쓰지 않는다`);
  if (!/AxNav\.done\(\)/.test(s)) bad.push(`${name}: 메뉴에서 고른 뒤 AxNav.done 을 부르지 않는다(지금은 아무 일도 안 하지만 앱 공용 길목이다)`);
  if (!/AxNav\.crumb\(/.test(s) || !/class="crumb"/.test(s)) bad.push(`${name}: 맨 위 경로(브레드크럼)가 없다`);
  if (/sk === 'navc'/.test(s)) bad.push(`${name}: 접기 신호를 앱이 따로 받는다 — share-kit.js(AxNav) 한 곳이 받아야 한다`);
  if (!new RegExp(`'/${name}'`).test(nav)) bad.push(`navCollapse.ts 의 NAVC_PATHS 에 '/${name}' 이 없다 — ☰ 가 안 뜬다`);
  if (!/share-kit\.js/.test(s)) bad.push(`${name}: share-kit.js 를 싣지 않는다 — AxNav 가 없다`);
}

const kit = read('public/share-kit.js');
const has = (s, t) => s.includes(t);
/* 2026-10-29 메뉴 자리 하나 · ☰ 로만 여닫기 — 서랍(저절로 닫힘)이 되살아나면 문다 */
if (!has(kit, "sk === 'navc'")) bad.push('share-kit.js: 앱 메뉴 신호(navc)를 받지 않는다');
if (['navc-drawer', 'ax-drawer', 'navscrim', 'Back.open(close, '].some((t) => has(kit, t))) bad.push('share-kit.js: 서랍이 남아 있다 — 메뉴는 ☰ 로만 여닫는다(고르거나 바깥을 눌러 닫히면 안 된다)');
if (has(kit, 'navc-set')) bad.push('share-kit.js: 앱 안에서 메뉴 열림/닫힘을 바꾼다 — 그것은 머리의 ☰ 만 한다');
if (!has(kit, "sk: 'navc-sheet'") || !has(kit, '‹ 전체 메뉴')) bad.push('share-kit.js: 「‹ 전체 메뉴」로 전체 메뉴로 바꿔 끼울 수 없다');
if (!has(kit, 'ax-navg')) bad.push('share-kit.js: 공통 사이드바가 없는 폭에서도 「‹ 전체 메뉴」가 뜬다');
if (!has(kit, 'window.AxNav = {')) bad.push('share-kit.js: AxNav 가 없다');
if (!has(kit, 'function open() {}') || !has(kit, 'function done() {}')) bad.push('share-kit.js: AxNav.open/done 이 아무 일도 안 해야 한다(앱이 고른 뒤 부른다 — 메뉴가 닫히면 안 된다)');
if (has(kit, '!m.offsetParent ||')) bad.push('share-kit.js: 메뉴 높이를 offsetParent 로 잰다');

/* 부모 쪽 — 판정은 navView 한 곳, ☰ 는 열림/닫힘만 바꾼다 */
const navTsx = read('components/Navigation.tsx');
const ifr = read('components/IframeModule.tsx');
if (!has(nav, 'export function navView(')) bad.push('navCollapse.ts: navView(무엇이 보일지 판정)가 없다');
if (!has(navTsx, 'onClick={() => setNavc(!closed)}')) bad.push('Navigation.tsx: ☰ 가 열림/닫힘만 바꾸지 않는다');
if (has(navTsx + ifr + nav, 'NAVC_DRAWER')) bad.push('서랍 신호(NAVC_DRAWER)가 남아 있다');
if (!has(ifr, 'navView(') || !has(ifr, "'navc-sheet'")) bad.push('IframeModule.tsx: 같은 판정(navView)으로 앱 메뉴를 알리지 않거나 「‹ 전체 메뉴」를 받지 않는다');
if (!has(ifr, 'ax-deeplink')) bad.push('IframeModule.tsx: 같은 앱 다른 칸 바로가기(?fs=)를 다시 열지 않는다');
const css = read('app/globals.css');
const gs = css.indexOf('data-gside');
if (gs < 0 || !has(css, 'html[data-gside="0"] .ax-gside') || has(css.slice(gs, gs + 600), 'display: none')) bad.push('globals.css: 공통 사이드바를 밀어 넣지 않고 끈다');

/* 부품·소모품 — 사이드바와 허브가 같은 네 칸이어야 한다 */
const page = read('app/page.tsx');
const asApp = read('public/as-app.html');
for (const k of ['phone', 'tablet', 'pc', 'consum']) {
  if (!has(navTsx, `'/as?fs=${k}'`)) bad.push(`사이드바 「부품 · 소모품」에 /as?fs=${k} 가 없다`);
  if (!has(page, `'/as?fs=${k}'`)) bad.push(`허브 「부품 · 소모품」에 /as?fs=${k} 가 없다`);
  if (!has(asApp, `['${k}',`)) bad.push(`AS 앱 FEE_SECS 에 '${k}' 칸이 없다 — 바로가기가 첫 화면을 연다`);
}


if (bad.length) { bad.forEach((m) => console.log('FAIL: ' + m)); console.log('SOME FAILED'); process.exit(1); }
console.log('OK: 여섯 앱 사이드바 · ☰ 접기 · 경로 배선');
console.log('ALL PASS');
