/*
 * 당사제품 비교 — 회귀 검사 (2026-08-30 신설)
 *
 * 사장님이 못 박은 것 셋을 지킨다:
 *   ① **최대 4개** ② **동일 품목군에서끼리만** ③ 위치는 **개발 중** 안
 *
 * 그리고 이 저장소가 반복해서 데인 것 둘:
 *   · 자료가 갈라지지 않는가 — 제품 상세검색과 **같은 파일**을 쓴다
 *   · 새 모듈을 만들면 `LogModule`·`IframeModule` 허용 목록·대시보드 라벨 셋을
 *     함께 고쳐야 한다. 한쪽만 고치면 **로그가 조용히 버려지거나** 사용 현황에
 *     한 줄도 안 잡혀 "안 쓰는 모듈"로 읽힌다.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, ...p.split('/')), 'utf8');

let ok = true;
const pass = (m) => console.log('OK: ' + m);
const fail = (m) => { ok = false; console.log('ERROR: ' + m); };

const app = rd('public/own-compare-app.html');
const route = rd('app/own-compare/page.tsx');
const dev = rd('lib/devModules.ts');
const log = rd('lib/logEvent.ts');
const ifr = rd('components/IframeModule.tsx');
const admin = rd('app/admin/page.tsx');
const sw = rd('public/sw.js');

/* ── ① 최대 4개 ─────────────────────────────────────────────────── */
{
  const m = /var MAX = (\d+);/.exec(app);
  if (!m) fail('MAX 를 못 찾음');
  else if (+m[1] !== 4) fail(`최대 개수가 ${m[1]} — 사장님 지시는 4개다`);
  else if (!/picked\.length >= MAX/.test(app)) fail('MAX 를 실제로 막는 자리가 없다');
  else pass('최대 4개까지만 고를 수 있다');
}

/* ── ② 동일 품목군에서끼리만 ───────────────────────────────────────
 * 두 겹으로 지킨다 — 목록이 그 품목군만 보여주고(inCat), 품목군을 바꾸면 고른 것을
 * 비운다. 뒤엣것이 없으면 다른 품목군 제품이 섞여 사장님 규칙이 그 자리에서 깨진다. */
{
  const one = /function inCat\(\)\{[\s\S]{0,200}?p\.cat === cur/.test(app);
  const two = /addEventListener\('change'[\s\S]{0,400}?picked = \[\]/.test(app);
  if (!one) fail('목록이 고른 품목군으로 좁혀지지 않는다');
  else if (!two) fail('품목군을 바꿔도 고른 것이 남는다 — 다른 품목군 제품이 섞인다');
  else pass('같은 품목군 안에서만 비교한다 (목록 좁힘 + 바꾸면 비움)');
}

/* ── ③ 개발 중 안에 있다 ───────────────────────────────────────── */
{
  if (!/href: '\/own-compare'/.test(dev)) fail('DEV_MODULES 에 없다 — 사장님이 개발 중 안에 두라고 하셨다');
  else if (!/status: 'dev'/.test(dev.slice(dev.indexOf("href: '/own-compare'"), dev.indexOf("href: '/own-compare'") + 700))) {
    fail("DEV_MODULES 항목의 status 가 'dev' 가 아니다");
  } else if (!/개발 중 —/.test(route)) fail('라우트에 개발 중 경고 띠가 없다 — 자물쇠 대신 이 띠가 그 몫을 진다');
  else pass('개발 중 목록에 있고 경고 띠를 지고 있다');
}

/* ── ④ 자료가 갈라지지 않는가 ─────────────────────────────────────
 * 제품 상세검색과 **같은 파일**을 쓴다. 따로 만들면 값이 갈라지고, 갈라진 쪽을 본
 * 상담사가 틀린 사양을 읽는다(이 저장소가 허브 카드 개수·비교표 값에서 데인 종류). */
{
  const uses = ['finder-core.json', 'finder-extra.json'].filter((f) => app.includes(f));
  if (uses.length !== 2) fail(`자료 파일을 둘 다 쓰지 않는다 (${uses.join(', ') || '없음'})`);
  else if (!fs.existsSync(path.join(ROOT, 'public', 'finder-core.json'))) {
    fail('finder-core.json 이 없다 — npm run build:owncompare 를 돌려 커밋할 것');
  } else pass('제품 상세검색과 같은 두 파일을 쓴다');

  /*
   * **재생성 대조** — 인라인 `PRODUCTS` 를 고치고 이 파일을 안 올리면 조용히 낡는다.
   * 단종 처리·카탈로그 대조로 인라인이 바뀌는 일이 잦은데, 그때 당사제품 비교만
   * 옛 사양을 보여주게 된다.
   *
   * **주석은 예전부터 "재생성 대조" 라고 적혀 있었는데 코드는 모양만 보고 있었다**
   * (길이 400 이상 · 필드 존재 · kw 없음). 검사가 스스로에 대해 거짓말을 하고 있었던 셈이라
   * 여기서 실제로 다시 만들어 견준다 — `search-index`·`size-reps`·`examtool` 이 쓰는 방식이다.
   */
  {
    const built = path.join(ROOT, 'public', 'finder-core.json');
    const before = fs.readFileSync(built, 'utf8');
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-own-compare.mjs')],
        { cwd: ROOT, stdio: 'ignore' });
      const after = fs.readFileSync(built, 'utf8');
      if (before !== after) {
        fs.writeFileSync(built, before);        // 검사가 파일을 바꿔 놓지 않는다
        fail('finder-core.json 이 낡았다 — 인라인 PRODUCTS 를 고쳤으면 `npm run build:owncompare` 를 돌려 커밋할 것');
      } else pass('finder-core.json 이 최신이다 (지금 다시 만든 것과 같다)');
    } catch (e) {
      fs.writeFileSync(built, before);
      fail('finder-core.json 재생성에 실패했다 — ' + String(e.message || e).split('\n')[0].slice(0, 90));
    }
  }
  const core = JSON.parse(rd('public/finder-core.json'));
  if (!Array.isArray(core) || core.length < 400) fail(`finder-core.json 이 ${core.length}종 — 너무 적다`);
  else if (core.some((p) => !p.cat || !p.model || !Array.isArray(p.fx))) fail('finder-core.json 에 cat·model·fx 가 빠진 항목이 있다');
  else if (core.some((p) => p.kw)) fail('finder-core.json 에 kw 가 들어 있다 — fx 를 베낀 글이라 파일이 두 배가 된다');
  else pass(`finder-core.json ${core.length}종 (cat·model·fx 만, kw 없음)`);
}

/* ── ⑤ 새 모듈을 만들면 함께 고쳐야 하는 세 곳 ──────────────────── */
{
  const miss = [];
  if (!/'ownCompare'/.test(log)) miss.push('lib/logEvent.ts 의 LogModule');
  if (!/'ownCompare'/.test(ifr)) miss.push('components/IframeModule.tsx 의 ALLOWED_MODULE');
  if (!/ownCompare:/.test(admin)) miss.push('app/admin/page.tsx 의 MODULE_META');
  if (miss.length) fail('로그 배선이 빠진 곳: ' + miss.join(' · ') + ' — 한쪽만 고치면 로그가 조용히 버려진다');
  else pass('로그 배선 세 곳(LogModule · iframe 허용 · 대시보드 라벨)이 모두 있다');

  if (!/finder-core/.test(sw)) fail('sw.js 가 finder-core.json 을 캐시하지 않는다 — 전파가 끊긴 매장에서 목록이 통째로 빈다');
  else pass('sw.js 가 finder-core.json 을 SWR 로 잡는다');
}

/* ── ⑥ 화면이 사실을 말하는가 ─────────────────────────────────────
 * 「—」를 "그 기능이 없다" 로 읽으면 상담에서 거짓이 된다 — 자료에 없다는 뜻이다.
 * 비교표에서 값을 비우는 규칙과 같은 자리다. */
{
  if (!/자료에 없다는 뜻/.test(app)) fail('「—」의 뜻을 화면이 밝히지 않는다');
  else {
    /* **주석을 세지 않는다** — "등급을 매기지 않는다" 는 설명글이 그 자체로 걸린다.
       실제로 등급을 그리는 코드(grade 를 화면에 내는 자리)가 있는지만 본다. */
    const code = app.slice(app.indexOf("'use strict'"));
    const bad = /grade\s*[:(]|badge\(|S급|A급/.test(code);
    if (bad) fail('우리 제품끼리인데 등급을 매기는 코드가 있다 — 타사비교와 다른 도구다');
    else pass('「—」의 뜻을 밝히고, 우리 제품끼리라 등급을 매기지 않는다');
  }
}


/* ── ⑦ 열 머리글이 서로 갈리는가 (2026-08-30 사장님 보고: "보기가 어렵습니다") ──
 *
 * 폰에서 4개를 고르면 두 열만 보이는데, 머리글이 제품군 이름뿐이라 **넷 중 셋이
 * 「갤럭시 S26 시리즈」로 똑같았다.** 실제 앱을 jsdom 에 띄워 같은 제품군 4개를 고르고
 * ①머리글 글자가 서로 다른지 ②번호 칩(.cno)이 붙는지 본다 — 실자료(finder-core)로 돈다.
 */
{
  const { JSDOM } = await import('jsdom');
  const html = fs.readFileSync(path.join(ROOT, 'public', 'own-compare-app.html'), 'utf8')
    /* 공용 스크립트는 인라인으로 — jsdom 은 상대경로 src 를 못 받아 뒤 스크립트가 멈춘다 */
    .replace(/<script src="([^"]+)"><\/script>/g, (m, f) => {
      try { return '<script>' + fs.readFileSync(path.join(ROOT, 'public', f), 'utf8') + '</script>'; }
      catch { return ''; }
    });
  const core = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'finder-core.json'), 'utf8'));
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://e.com/own-compare-app.html' });
  const w = dom.window;
  /* fetch 를 실자료로 물린다 — extra 는 비워도 core 만으로 검사가 선다 */
  w.fetch = (u) => Promise.resolve({ ok: true, json: () => Promise.resolve(
    /extra/.test(String(u)) ? { add: [] } : core) });
  await new Promise((r) => setTimeout(r, 400));
  await w.eval('load()').catch?.(() => {});
  await new Promise((r) => setTimeout(r, 400));

  const doc = w.document;
  const s26 = core.filter((x) => /S26 시리즈/.test(x.group || '')).slice(0, 3);
  if (s26.length < 3) fail('S26 시리즈 3종을 못 모았다 — 검사 재료가 없다');
  else {
    w.eval('cur = ' + JSON.stringify(s26[0].cat) + '; picked = ' + JSON.stringify(s26.map((x) => x.model)) + '; renderTable();');
    const ths = [...doc.querySelectorAll('#out thead th')].slice(1);
    /* **큰 줄(첫 줄)만 견준다** — textContent 로 합쳐 세면 작은 회색 줄(model) 덕에
       옛 화면(제품군 셋이 똑같이 큰 글씨)도 통과해 검사가 아무것도 못 지킨다
       (실제로 되돌려 넣었는데 안 물렸다). 눈에 먼저 들어오는 것은 큰 줄이다. */
    const texts = ths.map((t) => {
      let out = '';
      for (const n of t.childNodes){
        if (n.nodeName === 'BR') break;
        if (n.classList && n.classList.contains('cno')) continue;   // 번호는 이름이 아니다
        out += n.textContent;
      }
      return out.trim();
    });
    const uniq = new Set(texts);
    if (uniq.size !== texts.length) fail('열 머리글이 겹친다(' + texts.join(' | ') + ') — 어느 열이 어느 제품인지 알 수 없다');
    else pass('같은 제품군 3개를 골라도 열 머리글이 전부 다르다 (' + texts.map((t) => t.slice(0, 14)).join(' · ') + ')');
    const chips = doc.querySelectorAll('#out thead .cno').length;
    if (chips !== s26.length) fail('열 번호 칩이 ' + chips + '개 — 고른 것 칩과 번호로 이어져야 한다');
    else pass('열마다 번호 칩(①②③) — 고른 것 칩과 같은 번호로 이어진다');
  }
  dom.window.close();
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
