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
  '세탁기·콤보', '건조기', '에어컨', 'TV', '청소기', '로봇청소기', '식기세척기', '에어드레서',
  '인덕션', '정수기', '전자레인지', '공기청정기',
];

const expectedImageCounts = {
  '냉장고 4도어 프리스탠딩': 3, '냉장고 4도어 키친핏': 3, '냉장고 4도어 키친핏 Max': 2,
  '냉장고 2도어': 1, '냉장고 1도어': 2, '냉장고 양문형': 4, '냉장고 일반형': 1,
  '냉장고 페어(2대 이상) 설치': 2, '김치냉장고': 5, '세탁기·콤보': 9, '건조기': 4, '에어컨': 3,
  'TV': 15, '청소기': 0, '로봇청소기': 3, '식기세척기': 11, '에어드레서': 4,
  '인덕션': 8, '정수기': 5, '전자레인지': 0, '공기청정기': 0,
};

(async () => {
  const doc = window.document;
  let ok = true;
  /* **스크립트가 돌았는지**를 봐야 한다. `.cat-drop-row` 는 정적 HTML 에 이미 있어
     조건이 즉시 참이 되고, 그러면 예전 고정 대기와 다를 바가 없다(실제로 그렇게 깨졌다). */
  if (!await ready(() => typeof window.selectCat === 'function'))
    console.log('ERROR: 인라인 스크립트가 15초 안에 준비되지 않음 (selectCat)');

  const rows = doc.querySelectorAll('.cat-drop-row');
  console.log('total rows:', rows.length);
  if (rows.length !== allCats.length) {
    console.log(`ERROR: expected ${allCats.length} rows, got ${rows.length}`);
    ok = false;
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

  window.filterCatDrop('인덕션');
  let visible = [...doc.querySelectorAll('.cat-drop-row')].filter((r) => r.style.display !== 'none');
  console.log('search "인덕션" visible:', visible.map((r) => r.dataset.cat));
  if (visible.length !== 1 || visible[0].dataset.cat !== '인덕션') { console.log('ERROR: 인덕션 search mismatch'); ok = false; }

  window.filterCatDrop('공기청정기');
  visible = [...doc.querySelectorAll('.cat-drop-row')].filter((r) => r.style.display !== 'none');
  if (visible.length !== 1 || visible[0].dataset.cat !== '공기청정기') { console.log('ERROR: 공기청정기 search mismatch'); ok = false; }

  window.filterCatDrop('스마트폰');
  visible = [...doc.querySelectorAll('.cat-drop-row')].filter((r) => r.style.display !== 'none');
  console.log('search "스마트폰" (removed cat) visible count:', visible.length);
  if (visible.length !== 0) { console.log('ERROR: removed cat should not match search'); ok = false; }

  // 화면에 적힌 카테고리 개수가 DB 와 같은가 — 박아 두면 늘려도 옛 숫자가 남는다
  // (2026-08-11: 실제 21개인데 "(20종)"으로 적혀 있었다)
  {
    const title = doc.getElementById('cat-count-title');
    /* INSTALL_DB 는 const 라 window 에 없다 — 드롭다운에 실제로 깔린 항목 수와 댄다.
       "화면에 적힌 개수 = 고를 수 있는 개수" 가 사용자가 보는 진짜 불변식이다. */
    const n = doc.querySelectorAll('.cat-drop-row').length;
    const said = title && (title.textContent.match(/\((\d+)종\)/) || [])[1];
    if (!title) { console.log('ERROR: 카테고리 개수 표기 요소(#cat-count-title)가 없다'); ok = false; }
    else if (Number(said) !== n) {
      console.log(`ERROR: 화면은 "${said}종" 인데 드롭다운은 ${n}개 — 숫자를 박아 두지 말 것`);
      ok = false;
    } else console.log(`OK: 카테고리 개수 표기 ${n}종 = 드롭다운 항목 수 (DB 에서 세어 넣음)`);
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

  console.log(ok ? 'ALL PASS' : 'SOME FAILED');
  process.exit(ok ? 0 : 1);
})();
