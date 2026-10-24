// 설치환경 가이드(public/install-app.html) 회귀 테스트
// 실행: node scripts/test-install.mjs
// 새 카테고리를 추가하거나 이미지 개수가 바뀌면 아래 allCats / expectedImageCounts를 함께 갱신할 것.

import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readApp } from './lib/read-app.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '..', 'public', 'install-app.html');
const html = readApp('install-app.html');

const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'https://example.com/' });
const { window } = dom;
window.alert = () => {};
window.navigator.clipboard = { writeText: async () => {} };
window.Element.prototype.scrollIntoView = () => {};
window.HTMLAnchorElement.prototype.click = () => {};
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
/* 고정 시간이 아니라 "준비됐는가"를 기다린다 — npm test 로 스위트를 연달아 돌리면
   부하 때문에 200ms 안에 인라인 스크립트가 못 끝난다(test-finder 가 실제로 그렇게 죽었다). */
async function ready(check, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (check()) return true; } catch { /* 아직 없다 */ }
    await wait(25);
  }
  return false;
}

const allCats = [
  '냉장고 4도어 프리스탠딩', '냉장고 4도어 키친핏', '냉장고 4도어 키친핏 Max', '냉장고 2도어',
  '냉장고 1도어', '냉장고 양문형', '냉장고 일반형', '냉장고 페어(2대 이상) 설치', '김치냉장고',
  '세탁기·콤보', '건조기', '에어컨', '시스템에어컨', 'TV', '청소기', '로봇청소기', '식기세척기', '에어드레서',
  '인덕션', '후드', '후드일체형 인덕션', '정수기', '전자레인지', '공기청정기',
];

const expectedImageCounts = {
  '시스템에어컨': 4,
  '냉장고 4도어 프리스탠딩': 3, '냉장고 4도어 키친핏': 3, '냉장고 4도어 키친핏 Max': 2,
  '냉장고 2도어': 1, '냉장고 1도어': 2, '냉장고 양문형': 4, '냉장고 일반형': 1,
  '냉장고 페어(2대 이상) 설치': 4, '김치냉장고': 5, '세탁기·콤보': 11, '건조기': 4, '에어컨': 3,
  'TV': 15, '청소기': 0, '로봇청소기': 3, '식기세척기': 11, '에어드레서': 4,
  '인덕션': 8, '후드': 2, '후드일체형 인덕션': 5, '정수기': 5, '전자레인지': 0, '공기청정기': 0,
};

(async () => {
  const doc = window.document;
  let ok = true;
  /* **스크립트가 돌았는지**를 봐야 한다 — 고정 대기(`wait(200)`)를 쓰면 스위트를 연달아
     돌릴 때 큰 인라인 스크립트가 제때 못 끝나 단독 실행에서만 통과한다(실제로 그렇게 깨졌다).
     예전에는 정적 HTML 에 박혀 있던 카테고리 행을 조건으로 삼아 즉시 참이 됐는데,
     지금은 타일을 `renderCats()` 가 그리므로 타일이 서 있는 것 자체가 유효한 신호다.
     그래도 `selectCat` 을 함께 본다 — 그리기와 고르기는 다른 함수다. */
  if (!await ready(() => typeof window.selectCat === 'function'
    && doc.querySelectorAll('#cats .cat').length > 0))
    console.log('ERROR: 인라인 스크립트가 15초 안에 준비되지 않음 (selectCat · 타일)');

  const rows = doc.querySelectorAll('#cats .cat');
  console.log('total tiles:', rows.length);
  /*
   * **냉장고는 칸 하나다**(2026-10-23 사장님 승인 — 분류 진단 「합치기」). 냉장고 형태 8가지를
   * 「냉장고」 한 칸으로 묶고 고르면 형태 칸이 뜬다. 타일 수 = DB 키를 앞머리로 묶은 수(세어서 견준다).
   */
  const fridgeKeys = allCats.filter((c) => c.indexOf('냉장고 ') === 0);
  const expectTiles = allCats.length - fridgeKeys.length + 1;
  if (rows.length !== expectTiles) {
    console.log(`ERROR: expected ${expectTiles} tiles (냉장고 ${fridgeKeys.length}종을 한 칸으로), got ${rows.length}`);
    ok = false;
  }
  if ([...rows].some((r) => r.dataset.cat.indexOf('냉장고 ') === 0)) {
    console.log('ERROR: 냉장고 형태가 타일로 따로 나와 있다 — 「냉장고」 한 칸이어야 한다'); ok = false;
  }

  const removedCats = ['스마트폰', '노트북'];
  for (const cat of removedCats) {
    const row = [...rows].find((r) => r.dataset.cat === cat);
    if (row) { console.log(`ERROR: ${cat} row should be removed but still present`); ok = false; }
  }
  try {
    window.selectCat('스마트폰');
    console.log('WARN: selectCat("스마트폰") did not throw — verify no dangling reference');
  } catch (e) {
    console.log('OK: selectCat("스마트폰") throws/no-ops as expected (category no longer in DB)');
  }

  for (const cat of allCats) {
    try {
      window.selectCat(cat);
      const mainDisplay = doc.getElementById('main-content').style.display;
      if (mainDisplay !== 'block') { console.log(`ERROR [${cat}] should show main content, got ${mainDisplay}`); ok = false; }
      const imgCount = doc.querySelectorAll('#img-gallery .img-card').length;
      const imageCard = doc.getElementById('image-card');
      const cardVisible = imageCard.style.display !== 'none';
      const srcBtn = doc.getElementById('source-link-btn');
      const expected = expectedImageCounts[cat];
      if (expected === undefined) { console.log(`ERROR [${cat}] missing from expectedImageCounts — update the test`); ok = false; continue; }
      if (imgCount !== expected) { console.log(`ERROR [${cat}] image count = ${imgCount}, expected ${expected}`); ok = false; }
      if (expected > 0 && !cardVisible) { console.log(`ERROR [${cat}] has images but card hidden`); ok = false; }
      if (expected === 0 && cardVisible) { console.log(`ERROR [${cat}] has 0 images but card NOT hidden`); ok = false; }
      if (!srcBtn.href || srcBtn.href.slice(-1) === '#') { console.log(`ERROR [${cat}] invalid href: ${srcBtn.href}`); ok = false; }
      console.log(`[${cat}] images=${imgCount} cardVisible=${cardVisible} href=${srcBtn.href.slice(0, 70)}`);
    } catch (e) {
      console.log(`ERROR [${cat}] threw:`, e.message);
      ok = false;
    }
  }

  /* 냉장고 형태 칸 — 형태를 고르면 「냉장고」 칸이 켜지고 형태 칸 8개 중 그것만 켜진다 */
  window.selectCat('냉장고 4도어 키친핏');
  {
    const on = [...doc.querySelectorAll('#cats .cat.on')].map((r) => r.dataset.cat);
    const vars = [...doc.querySelectorAll('#cat-vars .cat-var')];
    const von = vars.filter((b) => b.classList.contains('on')).map((b) => b.dataset.cat);
    if (on.join() !== '냉장고') { console.log('ERROR: 형태를 골랐는데 「냉장고」 칸이 안 켜진다 —', on); ok = false; }
    if (vars.length !== fridgeKeys.length) { console.log(`ERROR: 냉장고 형태 칸 ${vars.length}개 (기대 ${fridgeKeys.length})`); ok = false; }
    if (von.join() !== '냉장고 4도어 키친핏') { console.log('ERROR: 고른 형태만 켜져야 한다 —', von); ok = false; }
    window.selectCat('세탁기·콤보');
    if (doc.querySelectorAll('#cat-vars .cat-var').length) { console.log('ERROR: 묶음 아닌 품목에 형태 칸이 남았다'); ok = false; }
    /* 「냉장고」 칸을 다시 누르면 마지막에 본 형태로 */
    [...doc.querySelectorAll('#cats .cat')].find((r) => r.dataset.cat === '냉장고').click();
    if (doc.getElementById('res-title').textContent.indexOf('냉장고 4도어 키친핏') < 0) {
      console.log('ERROR: 「냉장고」 칸이 마지막에 본 형태로 돌아가지 않는다'); ok = false;
    }
    /* 「키친핏」을 치면 「냉장고」 칸이 남고 걸린 형태가 형태 칸에 뜬다 */
    window.filterCats('키친핏');
    const found = [...doc.querySelectorAll('#cat-vars .cat-var')].map((b) => b.dataset.cat);
    if (!found.length || !found.every((k) => k.indexOf('키친핏') >= 0)) { console.log('ERROR: 「키친핏」 검색이 형태를 안 띄운다 —', found); ok = false; }
    window.filterCats('');
    console.log(`OK: 냉장고 ${fridgeKeys.length}종 → 칸 1개 + 형태 칸 (검색 「키친핏」 → ${found.length}개)`);
  }

  /*
   * ── 설치 전 준비 (2026-10-23 사장님 승인 — 설치비용 앱에서 옮겨 왔다) ──
   * 자료는 install-cost.json 한 벌이다. 대상 품목에만 붙고 아닌 품목에는 안 붙는다.
   */
  {
    const IC = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'install-cost.json'), 'utf8'));
    window.__install.setIC(IC);
    const prepOf = async (cat) => { window.selectCat(cat); await window.__install.renderPrep(cat);
      return [...doc.querySelectorAll('#prep-wrap .prep-card')].map((x) => x.id); };
    const wash = await prepOf('세탁기·콤보');
    const wtxt = doc.getElementById('prep-wrap').textContent;
    if (wash.join() !== 'prep-safety') { console.log('ERROR: 세탁기에 멀티탭 기준이 안 붙는다 —', wash); ok = false; }
    if (!(wtxt.includes('16A') && wtxt.includes('4000W') && wtxt.includes('화재'))) { console.log('ERROR: 멀티탭 기준(16A · 4000W · 화재)이 화면에 없다'); ok = false; }
    if (!IC.safety.targets.every((t) => wtxt.includes(t))) { console.log('ERROR: 대상제품을 다 적지 않는다'); ok = false; }
    const dw = await prepOf('식기세척기');
    if (!['prep-safety', 'prep-dishwash', 'prep-reform'].every((id) => dw.includes(id))) { console.log('ERROR: 식기세척기 준비 안내가 빠졌다 —', dw); ok = false; }
    if (!doc.getElementById('prep-wrap').textContent.includes('설치가 불가합니다')) { console.log('ERROR: 설치 불가 조건이 화면에 없다'); ok = false; }
    const ac = await prepOf('에어컨');
    if (!ac.includes('prep-aircon')) { console.log('ERROR: 에어컨 고객안전 안내가 안 붙는다 —', ac); ok = false; }
    const tv = await prepOf('TV');
    if (tv.length) { console.log('ERROR: 대상 아닌 TV 에 설치 전 준비가 붙었다 —', tv); ok = false; }
    const sac = await prepOf('시스템에어컨');
    if (sac.includes('prep-safety')) { console.log('ERROR: 「에어컨」 대상이 시스템에어컨까지 물었다(앞머리 판정)'); ok = false; }
    console.log(`OK: 설치 전 준비 — 세탁기 ${wash.length} · 식기세척기 ${dw.length} · 에어컨 ${ac.length} · TV 0`);
  }

  window.filterCats('인덕션');
  let visible = [...doc.querySelectorAll('#cats .cat')].filter((r) => r.style.display !== 'none');
  console.log('search "인덕션" visible:', visible.map((r) => r.dataset.cat));
  /*
   * **개수를 박지 않는다.** 2026-08-30 에 「후드일체형 인덕션」이 생기면서 이 검사가
   * 물었는데, 그건 결함이 아니라 카테고리가 는 것이다 — 개수를 고정하면 검사가
   * 앱을 못 따라가 조용히 무력해진다(이 저장소가 여러 번 데인 종류다).
   * 지켜야 하는 것은 **"친 말이 든 카테고리만 남는가"** 라는 불변식이다.
   */
  if (!visible.length || !visible.every((r) => r.dataset.cat.includes('인덕션'))) {
    console.log('ERROR: 인덕션 search mismatch'); ok = false;
  }
  /* 두 카테고리가 실제로 갈리는지 — 값이 다르므로 섞이면 안 된다 */
  window.filterCats('후드일체형');
  const hoodInd = [...doc.querySelectorAll('#cats .cat')].filter((r) => r.style.display !== 'none');
  if (hoodInd.length !== 1 || hoodInd[0].dataset.cat !== '후드일체형 인덕션') {
    console.log('ERROR: 후드일체형 인덕션이 따로 안 잡힌다 —', hoodInd.map((r) => r.dataset.cat));
    ok = false;
  }

  window.filterCats('공기청정기');
  visible = [...doc.querySelectorAll('#cats .cat')].filter((r) => r.style.display !== 'none');
  if (visible.length !== 1 || visible[0].dataset.cat !== '공기청정기') { console.log('ERROR: 공기청정기 search mismatch'); ok = false; }

  window.filterCats('스마트폰');
  visible = [...doc.querySelectorAll('#cats .cat')].filter((r) => r.style.display !== 'none');
  console.log('search "스마트폰" (removed cat) visible count:', visible.length);
  if (visible.length !== 0) { console.log('ERROR: removed cat should not match search'); ok = false; }

  /* 태블릿(≥720px)은 왼쪽 목록 · 오른쪽 결과 — **screen 으로 묶여 있어야** A4 인쇄(약 718px 폭)에 격자가 안 나간다 */
  {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'install-app.html'), 'utf8');
    if (!/@media screen and \(min-width:720px\)\{\s*main\{[^}]*display:grid/.test(src)) { console.log('ERROR: 태블릿 두 칸 배치가 screen 으로 묶여 있지 않다'); ok = false; }
    if (!/\.cat\.on\{[^}]*box-shadow:inset 0 0 0 1px var\(--primary\)/.test(src) || /\.cat\.on\{background:var\(--primary\)/.test(src)) {
      console.log('ERROR: 고른 칸이 파란 테두리가 아니다(전 앱 통일 2026-10-23)'); ok = false;
    }
  }

  // 화면에 적힌 카테고리 개수가 DB 와 같은가 — 박아 두면 늘려도 옛 숫자가 남는다
  // (2026-08-11: 실제 21개인데 "(20종)"으로 적혀 있었다)
  {
    const title = doc.getElementById('cat-count-title');
    /* INSTALL_DB 는 const 라 window 에 없다 — 드롭다운에 실제로 깔린 항목 수와 댄다.
       "화면에 적힌 개수 = 고를 수 있는 개수" 가 사용자가 보는 진짜 불변식이다. */
    const n = doc.querySelectorAll('#cats .cat').length;
    const said = title && (title.textContent.match(/\((\d+)종\)/) || [])[1];
    if (!title) { console.log('ERROR: 카테고리 개수 표기 요소(#cat-count-title)가 없다'); ok = false; }
    else if (Number(said) !== n) {
      console.log(`ERROR: 화면은 "${said}종" 인데 타일은 ${n}개 — 숫자를 박아 두지 말 것`);
      ok = false;
    } else console.log(`OK: 카테고리 개수 표기 ${n}종 = 타일 수 (DB 에서 세어 넣음)`);
  }

  /*
   * 규격도를 우리 저장소로 옮기는 중이다(`npm run fetch:install-img`).
   * 옮긴 것은 **파일이 실제로 있어야 하고 원본 주소를 `orig` 로 달고 있어야 한다** —
   * 없는 파일을 가리키면 화면에서 규격도가 조용히 사라지고(설치 상담에서 정작 필요한
   * 그림이다), 출처가 없으면 나중에 값을 되짚을 수 없다.
   * 아직 안 옮긴 것은 실패가 아니라 남은 개수로만 알린다.
   */
  {
    const raw = fs.readFileSync(new URL('../public/install-app.html', import.meta.url), 'utf8');
    const local = [...raw.matchAll(/src:'(install-img\/[^']+)'(?:,\s*orig:'([^']*)')?/g)];
    const remote = [...raw.matchAll(/src:'(https:\/\/[^']+)'/g)];
    let bad = 0;
    for (const [, rel, orig] of local) {
      const p = new URL('../public/' + rel, import.meta.url);
      if (!fs.existsSync(p)) { console.log(`ERROR: 규격도 파일이 없다 — ${rel}`); bad++; }
      else if (fs.statSync(p).size < 1024) { console.log(`ERROR: 규격도가 비어 있다 — ${rel}`); bad++; }
      if (!orig) { console.log(`ERROR: 원본 주소(orig)가 없다 — ${rel}`); bad++; }
    }
    if (bad) ok = false;
    else console.log(`OK: 규격도 — 우리 저장소 ${local.length}장(파일·출처 확인) · 아직 외부 ${remote.length}장`);
  }

  {
    const _i = html.indexOf("const INSTALL_DB");
    const _s = html.indexOf("{", _i);
    let _d = 0, _j = _s;
    for (; _j < html.length; _j++) { const c = html[_j]; if (c === "{") _d++; else if (c === "}") { _d--; if (!_d) break; } }
    const DB = new Function("return " + html.slice(_s, _j + 1))();

/*
 * ── **화면에 나가는 문구에 렌더되지 않는 서식을 넣지 않는다** (2026-08-30) ──────────
 *
 * 이 앱의 `row()` 는 문구를 통째로 이스케이프한다. 그래서 `<b>` 든 마크다운 `**` 든
 * **글자 그대로 보인다.** CLAUDE.md 가 `<b>` 로 이미 데인 자리인데, 시스템에어컨을
 * 넣으며 마크다운으로 같은 실수를 했다 — 화면에 `**필수.**` 가 별표째 떴다
 * (검사는 전부 통과했고 **스크린샷이 잡았다**).
 *
 * **`**` 를 통째로 막으면 안 된다** — 와일드카드 모델코드가 그 모양이다
 * (`RK**F42*` · `WF*0F25**` · `DW80F73*`, 실측 20건). 막는 것은 **한글을 감싼 강조**다.
 */

  const RENDERED = ['subtitle', 'source'];
  /* **와일드카드 모델코드를 강조로 오인하지 않는다** — `RK**F42*`·`AP90F08163***` 가
     그 모양이라, 별표 둘 사이가 멀면 서로 다른 코드의 별표를 이어 잡는다(실제로 그랬다).
     그래서 앞은 시작·공백·여는 괄호, 뒤는 끝·공백·문장부호일 때만 강조로 본다. */
  const EMPH = /(^|[\s(「'])\*\*(?=\S)[^*\n]{1,120}?\*\*(?=$|[\s.,)」·'])|__[^_\n]*[가-힣][^_\n]*__|<\/?[a-z]+[^>]*>/i;
  const bad = [];
  for (const [cat, d] of Object.entries(DB)) {
    const texts = [];
    for (const k of RENDERED) if (d[k]) texts.push([k, d[k]]);
    for (const k of ['space', 'utility']) for (const row of (d[k] || [])) texts.push([k, row.join(' ')]);
    for (const k of ['checklist', 'cautions', 'types']) for (const t of (d[k] || [])) texts.push([k, t]);
    for (const im of (d.images || [])) { texts.push(['cap', im.cap || '']); texts.push(['alt', im.alt || '']); }
    for (const [k, t] of texts) {
      const m = String(t).match(EMPH);
      if (m) bad.push(`${cat}/${k} — ${m[0].slice(0, 30)}`);
    }
  }
  if (bad.length) {
    console.log(`ERROR: 렌더되지 않는 서식이 화면 문구에 섞였다 ${bad.length}건 — ${bad.slice(0, 4).join(' · ')}`);
    ok = false;
  } else {
    console.log('OK: 화면 문구에 렌더되지 않는 서식 없음 (와일드카드 모델코드는 정상)');
  }
  }

  /* 사이드바 네비게이션 + ☰ 접기 + 경로 (2026-10-24 사장님 승인 시안) */
  {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'install-app.html'), 'utf8');
    const bad = [];
    if (/class="dm-back"|dm-back/.test(src)) bad.push('단계 메뉴의 뒤로가기 단추가 되살아났다(사이드바는 단계를 밀고 당기지 않는다)');
    if (/translateX\(-100%\)/.test(src)) bad.push('메뉴를 옆으로 미는 단계 전환이 남아 있다');
    if (!/id="crumb"/.test(src) || !/function renderCrumb/.test(src)) bad.push('맨 위 경로(브레드크럼)가 없다');
    if (!/html\.ax-navc main\{grid-template-columns:minmax\(0,1fr\)\}/.test(src)) bad.push('☰ 로 접혔을 때 내용이 폭을 다 쓰지 않는다');
    if (!/sk === 'navc-drawer'/.test(src) || !/id="dm-pin"/.test(src)) bad.push('서랍 열기·메뉴 펼쳐 두기 배선이 없다');
    if (!/Back\.open\(drawerClose/.test(src)) bad.push('서랍을 기기 뒤로가기로 닫을 수 없다');
    const nav = fs.readFileSync(path.join(__dirname, '..', 'lib', 'navCollapse.ts'), 'utf8');
    if (!/NAVC_PATHS = \[[^\]]*'\/install'/.test(nav)) bad.push("navCollapse.ts 의 NAVC_PATHS 에 '/install' 이 없다 — ☰ 가 안 뜬다");
    if (bad.length) { ok = false; bad.forEach((m) => console.log('FAIL: ' + m)); }
    else console.log('OK: 사이드바 네비게이션 · ☰ 접기 · 경로 배선');
  }

  console.log(ok ? 'ALL PASS' : 'SOME FAILED');
  process.exit(ok ? 0 : 1);
})();
