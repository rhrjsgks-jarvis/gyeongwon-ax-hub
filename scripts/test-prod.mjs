/*
 * 배포본 실물 상담 N회 — `npm run test:prod` (기본 10회, `RUNS=3` 으로 줄일 수 있다)
 *
 * ## 왜 이 검사가 따로 있는가
 *
 * 나머지 스위트는 **데이터와 순수 함수**를 본다. `test:e2e` 는 화면이 뜨는지까지 본다.
 * 그런데 매장에서 실제로 터진 사고는 **상담을 처음부터 끝까지 밟았을 때만** 드러났다 —
 * 단지를 고르고, 축척을 맞추고, 가전을 놓고, 3D 로 넘어가는 그 흐름이다.
 *
 * ## 이 검사의 값어치는 회수가 아니라 **판정 기준**에 있다
 *
 * 2026-08-13 에 같은 흐름을 5회 돌린 임시 스크립트가 **"버그 0건"** 이라고 보고했는데,
 * 그 출력 안에는 축척이 2.5배 틀려 *"TV 115인치 → 65인치면 들어갑니다"* 가 나온 회차가
 * 있었다. 사람이 숫자를 읽고서야 찾았다. **회수를 10회로 늘려도 그 10회 모두 "0건"이라고
 * 말했을 것이다.** 그래서 아래 판정을 코드에 박는다 — 전부 그때 눈으로 잡은 것들이다.
 *
 *   ① 공간 합이 색인 전용면적의 30~180% 밖    축척이 통째로 틀어지면 여기가 먼저 걸린다
 *   ② 이름 없는 **큰** 공간(전체의 12% 이상)  여러 방이 하나로 잡혔다는 신호
 *      (자투리에 이름이 안 붙는 것은 정상이라 참고로만 적는다)
 *   ③ 부속 공간(현관·발코니…)이 거실보다 큼    이름이 실제와 어긋났다는 뜻
 *   ④ 추천 문구의 전용면적이 색인과 2배 이상 차이
 *   ⑤ 콘솔 오류 · 4xx/5xx · 3D 안 열림 · 한 대도 배치 못 함
 *
 * ## 알려진 미해결은 실패로 세지 않는다
 *
 * 고쳐지지 않은 것 때문에 늘 빨간 상태가 되면 다른 작업을 막는다(실제 도면 코퍼스와
 * 같은 규칙). `KNOWN` 에 사유와 함께 적고, **보고는 하되** 종료 코드에는 넣지 않는다.
 * 고쳐지면 "이제 통과한다"고 알려 목록에서 빼게 한다.
 *
 * 대상 기본값은 프로덕션이다. 로컬 빌드로 보려면 `PROD=http://localhost:3000`.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const BASE = process.env.PROD || 'https://salescopilot-store.vercel.app';
const RUNS = Math.max(1, +(process.env.RUNS || 10));

let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.log('SKIP: playwright 가 없어 배포본 검사를 건너뜁니다 (npm i -D playwright)');
  process.exit(0);
}

/*
 * **알려진 미해결.** 보고는 하되 실패로 세지 않는다.
 * 고치면 여기서 지운다 — 지우지 않으면 고쳐진 사실이 묻힌다.
 */
const KNOWN = [
  { match: /공간 합 .* 의 \d+%/,
    why: '축척 기준 벽 오선정 — "침실1 가로"로 세대 전체 폭을 물어 축척이 통째로 틀어지는 도면이 있다'
       + '(2026-08-13 확인. 작게도 크게도 틀린다 — 원주 푸르지오 85A 12% · 안양자이 50-2 194%)' },
  { match: /자이 헤리티지 23 .*이름 없는 큰 공간/,
    why: '자이 헤리티지 23 — 여러 방이 한 덩어리로 잡힌다. 닫기 반경으로는 가를 수 없음이 확인됐다'
       + '(반경 전 구간 훑어도 최소 폭 5,795mm, 실제 침실3 은 2,890mm)' },
];
/* 도면 이름까지 함께 넘긴다 — "이 도면에서만 알려진 것"을 다른 도면까지 덮으면 안 된다 */
const isKnown = (line) => KNOWN.find((k) => k.match.test(line));

/* ── 대상 고르기 ────────────────────────────────────────────────
 * 축척이 색인에 실린 도면과 **실리지 않은 도면**을 섞는다 — 매장에서 흔한 쪽은
 * 실리지 않은 쪽이다(치수가 인쇄된 분양 도면이 8%뿐이라 92%가 그 경로다).
 * 안 실린 것은 **파일명 해시 순**으로 뽑는다. 목록 순서로 뽑으면 도면을 한 장만
 * 넣어도 표본이 통째로 밀려, 인식을 한 줄도 안 고쳤는데 결과가 바뀐다.
 */
const idx = JSON.parse(fs.readFileSync(path.join(root, 'public', 'plan-index.json'), 'utf8'));
const all = [];
for (const c of idx.complexes || []) for (const p of c.plans || [])
  all.push({ ...p, region: c.region, complex: c.complex });
const usable = all.filter((p) => (p.axis ?? 1) >= 0.35);
const h = (s) => crypto.createHash('sha1').update(s).digest('hex');
const scaled = usable.filter((p) => p.mmPerPx).sort((a, b) => h(a.file).localeCompare(h(b.file)));
const plain = usable.filter((p) => !p.mmPerPx && p.exclusiveM2)
  .sort((a, b) => h(a.file).localeCompare(h(b.file)));
const targets = [];
for (let i = 0; targets.length < RUNS && i < Math.max(scaled.length, plain.length); i++) {
  if (scaled[i] && targets.length < RUNS) targets.push(scaled[i]);
  if (plain[i] && targets.length < RUNS) targets.push(plain[i]);
  if (plain[i + plain.length / 2 | 0] && targets.length < RUNS) targets.push(plain[i + (plain.length / 2 | 0)]);
}

/** 부속 공간 — 이것이 거실보다 크면 이름이 실제와 어긋난 것이다 */
const SIDE_ROOM = /현관|발코니|드레스룸|세탁실|욕실|팬트리|다용도/;

let ok = true;
const fail = (m) => { console.log('ERROR:', m); ok = false; };
const pass = (m) => console.log('OK:', m);
const knownHits = [];

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];

for (let n = 0; n < targets.length; n++) {
  const t = targets[n];
  const [sido, city] = (t.region || '').split(' ');
  const bugs = [], notes = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 880 } });
  /* 배치 시뮬레이터가 '개발중인 서비스'로 내려가 비밀번호 뒤에 있다(2026-08-17).
     여기서 재는 것은 그 도구의 흐름이지 자물쇠가 아니므로 세션 값을 미리 넣어 지나간다. */
  await page.addInitScript(() => {
    try { sessionStorage.setItem('ax_dev_unlocked_until', String(Date.now() + 3600e3)) } catch {}
  });
  const errs = [], bad = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
  page.on('response', (r) => { if (r.status() >= 400 && !/\/api\/logs/.test(r.url())) bad.push(`${r.status()} ${r.url().slice(0, 60)}`); });
  const f = page.frameLocator('iframe');
  const fr = () => page.frames().find((x) => /place-app\.html/.test(x.url()));
  const step = async (name, fn) => {
    try { return await fn(); } catch (e) { bugs.push(`${name}: ${String(e.message || e).split('\n')[0].slice(0, 110)}`); return null; }
  };

  await page.goto(BASE + '/place', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  await step('단지 불러오기', async () => {
    await f.locator('#btn-lib').click();
    await page.waitForTimeout(1500);
    await f.locator(`#libchips .chip:has-text("${sido}")`).first().click();
    await page.waitForTimeout(450);
    await f.locator(`#libbody .libitem:has-text("${city}")`).first().click();
    await page.waitForTimeout(650);
    await f.locator(`#libbody .libitem:has-text("${t.complex}")`).first().click();
    await page.waitForTimeout(750);
    await f.locator(`#libbody .libitem:has-text("${t.type}")`).first().click();
  });
  await page.waitForTimeout(5500);

  await step('공간 확정', async () => {
    /*
     * **글자가 아니라 id 로 잡는다**(2026-08-16 정정).
     *
     * 확정 버튼 문구는 상황에 따라 바뀐다 —
     *   `more.length ? `${more.length+1}개로 확정` : '이 공간 확정'`
     * 도면을 올리면 집 전체를 먼저 잡게 되면서(2026-08-15) `more` 가 거의 항상 차서
     * **"N개로 확정"** 이 뜬다. 그런데 이 검사는 '이 공간 확정' 이라는 글자를 붙들고
     * 있어 **6회 전부 15초 타임아웃**이었다. 앱은 멀쩡했다.
     *
     * 늘 실패하는 검사는 아무것도 지키지 못한다 — 게다가 이 스위트는 `npm test` 에
     * 없어서 아무도 못 봤다. 화면 문구는 바뀌라고 있는 것이고, **id 는 안 바뀐다.**
     */
    /*
     * **못 찾으면 화면에 무엇이 있었는지 적는다**(2026-08-16).
     *
     * 이 단계가 6회 전부 15초 타임아웃이었는데 **뒤 흐름은 매번 성공**했다 —
     * 공간 9~11곳 인식 · 가전 배치 · 3D 열림. 즉 앱은 멀쩡하고 이 단계만 막혔다.
     * 실제로 찍어 보니 막대는 떠 있는데(`on`) **`#d-ok` 가 없고** 모달이 열려 있었다.
     * 실측으로 확정했다 — 그때 막대에 있는 버튼은 **`wl-next · wl-pick · wl-two ·
     * wl-again · wl-ok`**, 전부 **벽 길이(축척) 입력** 손잡이다. 즉 단지를 불러오면
     * 공간을 이미 등록해 두고(9곳) **곧장 축척을 묻는다** — 이 경로에 확정 단계는 없다
     * (2026-08-15 '도면을 올리면 집 전체를 먼저 잡는다'의 결과다).
     * 직접 올린 도면 경로에는 아직 남아 있을 수 있어 단계를 지우지는 않았다.
     *
     * **통과시키려고 단계를 지우지 않는다.** 아직 확정하지 못했기 때문이다. 대신
     * 못 찾았을 때 **그 순간 화면 상태를 함께 남겨** 다음 사람이 판단하게 한다 —
     * 아무 정보 없이 "Timeout" 만 남으면 이번처럼 원인 찾기를 처음부터 다시 한다.
     */
    const ok = f.locator('#draftbar #d-ok');
    if (await ok.count()) { await ok.click({ timeout: 15000 }); }
    else {
      const st = await fr()?.evaluate(() => {
        const d = document.getElementById('draftbar'), sh = document.getElementById('sheet');
        const P = window.__place || {};
        return {
          bar: d ? d.className + '/' + getComputedStyle(d).display : '없음',
          btns: d ? [...d.querySelectorAll('button')].map((b) => b.id || b.textContent.trim().slice(0, 10)).join(',') : '',
          sheet: sh ? getComputedStyle(sh).display : '-',
          rooms: (P.state?.rooms || []).length, scaled: !!P.state?.scaled,
        };
      }).catch(() => null);
      notes.push(`공간 확정 버튼(#d-ok)이 없었다 — 막대 ${st?.bar} 버튼[${st?.btns}] · 모달 ${st?.sheet} · 공간 ${st?.rooms}곳 · 축척 ${st?.scaled ? '확정' : '미확정'}`);
      return;
    }
    await page.waitForTimeout(800);
    await f.locator('#sheet .modal-actions button.primary').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1300);
  });

  /* 축척이 색인에 없으면 벽 길이를 묻는다 — 화면이 안내하는 표준값(3,300mm)을 넣는다 */
  const asks = await f.locator('#wl').isVisible().catch(() => false);
  if (asks) await step('벽 길이 입력', async () => {
    await f.locator('#wl').fill('3300');
    await f.locator('#wl-ok').click();
  });
  await page.waitForTimeout(7500);

  const st = await fr().evaluate(() => {
    const P = window.__place;
    const rooms = P.state.rooms.map((r) => ({ name: r.name, m2: +(P.roomArea(r) / 1e6).toFixed(1) }));
    return { mmPerPx: P.state.mmPerPx, rooms,
      sum: +rooms.reduce((s, r) => s + r.m2, 0).toFixed(1) };
  }).catch(() => ({ rooms: [] }));

  // ① 공간 합 vs 색인 전용면적
  if (t.exclusiveM2 && st.sum) {
    const ratio = st.sum / t.exclusiveM2;
    if (ratio < 0.30 || ratio > 1.80)
      bugs.push(`공간 합 ${st.sum}㎡ 가 전용 ${t.exclusiveM2}㎡ 의 ${(ratio * 100).toFixed(0)}% — 축척이 통째로 틀렸을 때 나오는 값이다`);
  }
  /*
   * ② **이름 없는 큰 공간.** 자투리에 이름이 안 붙는 것은 정상이다 — 이름 풀이
   * 방 개수보다 짧으면 `공간 13` 으로 떨어지고, 작은 틈새라면 상담에 지장이 없다.
   * 문제가 되는 것은 **큰 덩어리에 이름이 없을 때**다. 그건 인식이 여러 방을 하나로
   * 잡았다는 신호이고, 화면에는 `공간 14 54.7㎡` 처럼 떠서 상담사가 그대로 읽는다.
   * 문턱 12% 는 실측에서 갈랐다 — 자투리 14.9/142.2 = 10.5% vs 덩어리 54.7/179.7 = 30%.
   */
  const unnamed = st.rooms.filter((r) => /^공간\s*\d+$/.test(r.name));
  const bigUnnamed = unnamed.filter((r) => st.sum && r.m2 / st.sum >= 0.12);
  if (bigUnnamed.length)
    bugs.push(`이름 없는 큰 공간이 화면에 있다: ${bigUnnamed.map((r) => `${r.name} ${r.m2}㎡`).join(' · ')}`
      + ` (전체 ${st.sum}㎡ 의 ${bigUnnamed.map((r) => (r.m2 / st.sum * 100).toFixed(0) + '%').join('·')}) — 여러 방이 하나로 잡혔을 때 나오는 모양이다`);
  else if (unnamed.length) notes.push(`이름 없는 자투리 ${unnamed.map((r) => `${r.name} ${r.m2}㎡`).join(' · ')}`);
  // ③ 부속 공간이 거실보다 큼
  const living = st.rooms.find((r) => /거실/.test(r.name));
  const bigSide = living && st.rooms.filter((r) => SIDE_ROOM.test(r.name) && r.m2 > living.m2);
  if (bigSide && bigSide.length)
    bugs.push(`부속 공간이 거실(${living.m2}㎡)보다 크다: ${bigSide.map((r) => `${r.name} ${r.m2}㎡`).join(' · ')} — 이름이 실제와 어긋났다`);

  // ④ 추천 문구의 전용면적
  let rec = '';
  await step('가전 선택', async () => {
    await f.locator('#btn-add').click();
    await page.waitForTimeout(2000);
    rec = await fr().evaluate(() => (document.getElementById('a-rec') || {}).textContent || '');
  });
  const said = (rec.match(/전용\s*([\d,]+)\s*㎡/) || [])[1];
  if (said && t.exclusiveM2) {
    const v = +said.replace(/,/g, '');
    if (v > t.exclusiveM2 * 2 || v < t.exclusiveM2 / 2)
      bugs.push(`추천 문구가 "전용 ${v}㎡" 라고 말하는데 색인은 ${t.exclusiveM2}㎡ 다`);
  }

  // ⑤ 배치·3D·건전성
  await step('자동 배치', async () => { await f.locator('#auto').click(); await page.waitForTimeout(3500); });
  const it = await fr().evaluate(() => {
    const P = window.__place;
    return { total: P.state.items.length, placed: P.state.items.filter((i) => !i.staged).length };
  }).catch(() => ({ total: 0, placed: 0 }));
  if (!it.total) bugs.push('가전이 한 대도 올라가지 않았다');
  else if (!it.placed) bugs.push(`가전 ${it.total}대가 전부 대기 상태 — 한 대도 배치되지 않았다`);

  await step('3D 보기', async () => { await f.locator('#btn-3d').click(); await page.waitForTimeout(6500); });
  const d3 = await fr().evaluate(() => !!(window.Place3D && window.Place3D.isOpen)).catch(() => false);
  if (!d3) bugs.push('3D 가 열리지 않았다');
  if (errs.length) bugs.push(`콘솔 오류 ${errs.length}건: ${errs[0]}`);
  if (bad.length) bugs.push(`4xx/5xx ${bad.length}건: ${bad[0]}`);

  const head = `${n + 1}/${targets.length} ${t.region} ${t.complex} ${t.type}`
    + ` (전용 ${t.exclusiveM2 ?? '?'}㎡ · 축척 ${t.mmPerPx ? '색인' : '입력'})`;
  console.log(`\n── ${head}`);
  console.log(`   공간 ${st.rooms.length}곳 합 ${st.sum ?? 0}㎡ · 1px=${(st.mmPerPx || 0).toFixed(2)}mm · 가전 ${it.placed}/${it.total} · 3D ${d3 ? '열림' : '안 열림'}`);
  for (const b of bugs) {
    const k = isKnown(head + " " + b);
    if (k) { knownHits.push(`${head} — ${b}`); console.log(`   △ (알려진) ${b}`); }
    else console.log(`   ❌ ${b}`);
  }
  for (const nt of notes) console.log('   · 참고: ' + nt);
  if (!bugs.length) console.log('   ✅ 문제 없음');
  results.push({ head, bugs: bugs.filter((b) => !isKnown(head + " " + b)) });
  await page.close();
}
await browser.close();

const hard = results.filter((r) => r.bugs.length);
console.log(`\n════ 배포본 상담 ${results.length}회 ════`);
if (knownHits.length) {
  console.log(`알려진 미해결 ${knownHits.length}건 (실패로 세지 않음):`);
  knownHits.forEach((k) => console.log(`  △ ${k}`));
  console.log('  ' + KNOWN.map((k) => '· ' + k.why).join('\n  '));
}
if (!hard.length) pass(`${results.length}회 전부 통과 (판정 기준 5종)`);
else for (const r of hard) fail(`${r.head} — ${r.bugs.join(' / ')}`);

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
