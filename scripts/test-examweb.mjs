/*
 * **인터랙티브 웹 시험 회귀 검사** — `npm run test:examweb`
 *
 * A4 출력기와 달리 이 파일은 **응시자가 직접 조작한다.** 그래서 "그려지는가"로는
 * 부족하고 **실제로 한 판 쳐 봐야** 한다 — 사번을 넣고, 답을 고르고, 제출하고,
 * 점수가 맞는지 센다. 채점이 틀린 시험은 안 뜨는 시험보다 나쁘다.
 *
 * 네 겹이다:
 *   ① 신선도 — 커밋된 `tools/레벨업챌린지_시험.html` == 지금 재생성한 것
 *   ② 자립성 — 바깥을 부르는 곳 0. 단, 시트 보고용 `fetch` 는 **기본이 꺼져 있어야** 한다
 *   ③ 구성   — 난이도 상 50 / 중 35 / 하 15 (사장님 방향성 문서)
 *   ④ 실물   — 파일 한 장만 임시 폴더에 두고 `file://` 로 열어 한 판 친다
 *   ⑤ 보고   — `SCRIPT_URL` 을 채운 사본으로 **실제로 보내 본다**(성공·실패·재전송)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildExamWeb, OUT } from './build-exam-web.mjs';
import { assertSelfContained } from './build-exam-tool.mjs';

let ok = true;
const say = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ': ' + m); if (!c) ok = false; };

/* ── ① 신선도 ── */
if (!fs.existsSync(OUT)) { say(false, `${OUT} 이 없다 — npm run build:examweb 을 돌리고 커밋할 것`); process.exit(1); }
const committed = fs.readFileSync(OUT, 'utf8');
const { html: fresh, bank } = buildExamWeb();
say(committed === fresh, `커밋된 웹 시험 == 재생성한 것 (문항 ${bank.total}개)`
  + (committed === fresh ? '' : ' — npm run build:examweb 을 돌리고 커밋할 것'));

/* ── ② 자립성 ── */
let selfOk = true, why = '';
try { assertSelfContained(committed); } catch (e) { selfOk = false; why = e.message; }
say(selfOk, '바깥을 부르는 곳 0 (시트 보고는 기본 꺼짐)' + (selfOk ? '' : ' — ' + why));
/* 보고용 주소가 채워진 채로 나가면 **응시 기록이 남의 시트로 흘러간다.** 반드시 빈 값이어야 한다 */
say(/var SCRIPT_URL = '';/.test(committed), 'SCRIPT_URL 이 비어 있다 — 켜는 것은 받는 쪽의 선택이다');

/* ── ④ 실물 ── */
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.log('SKIP: playwright 미설치 — 실물 검사를 건너뛴다.');
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 1);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'examweb-'));
const lone = path.join(dir, '레벨업챌린지_시험.html');
fs.copyFileSync(OUT, lone);

const br = await chromium.launch();
const page = await br.newPage({ viewport: { width: 720, height: 1000 } });
const errs = [], outside = [];
page.on('pageerror', e => errs.push(e.message));
page.on('request', r => { if (!r.url().startsWith('file:')) outside.push(r.url()); });
await page.route('http://**', r => r.abort());
await page.route('https://**', r => r.abort());
await page.goto(pathToFileURL(lone).href, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.getElementById('i-code').textContent !== '–', { timeout: 15000 });

/* 시작 전에는 문항이 한 글자도 보이면 안 된다 — 미리 보고 준비하면 시험이 아니다 */
const before = await page.evaluate(() => ({
  intro: !!document.getElementById('intro') && getComputedStyle(document.getElementById('intro')).display !== 'none',
  qs: document.querySelectorAll('.q').length,
  info: document.getElementById('i-c').textContent,
  code: document.getElementById('i-code').textContent,
  startDisabled: document.getElementById('start').disabled,
}));
say(before.intro && before.qs === 0, '시작 전에는 문항이 안 보인다 (실제 ' + before.qs + '개)');
say(before.startDisabled, '사번을 넣기 전에는 시작할 수 없다');
say(/^[A-Z0-9]{4}$/.test(before.code), '시험지 코드가 붙는다 (' + before.code + ')');

/* 사번 유효성 — 8자리 숫자만 */
await page.fill('#emp', '12ab34');
say(await page.inputValue('#emp') === '1234', '사번칸이 숫자만 받는다 (실제 "' + await page.inputValue('#emp') + '")');
say(await page.locator('#start').isDisabled(), '7자리 이하로는 시작 못 한다');
await page.fill('#emp', '87654321');
say(!(await page.locator('#start').isDisabled()), '8자리를 넣으면 시작할 수 있다');

await page.click('#start');
await page.waitForSelector('.q', { timeout: 8000 });

const info = await page.evaluate(() => {
  const qs = [...document.querySelectorAll('.q')];
  const n = L => qs.filter(q => q.dataset.lv === L).length;
  return { total: qs.length, ha: n('하'), jung: n('중'), sang: n('상'),
           lg: qs.filter(q => q.dataset.lg === '1').length,
           opts: qs.map(q => q.querySelectorAll('.opt').length),
           timer: document.getElementById('timer').textContent,
           subDisabled: document.getElementById('sub').disabled };
});
say(info.total === 25, '25문항이 나온다 (실제 ' + info.total + ')');
say(info.opts.every(n => n === 4), '모든 문항 보기 4개');
/* ③ 구성 — 상 50 · 중 35 · 하 15 (25문항 기준 상 13 · 중 9 · 하 4) */
say(info.sang === 13 && info.jung === 9 && info.ha === 3,
  '난이도 상 13 · 중 9 · 하 3 — 상이 절반 이상(52%) (실제 상 ' + info.sang + ' / 중 ' + info.jung + ' / 하 ' + info.ha + ')');
say(info.lg === 6, '타사비교 6문항 (실제 ' + info.lg + ')');
say(/^\d\d:\d\d$/.test(info.timer), '타이머가 돈다 (' + info.timer + ')');
say(info.subDisabled, '다 풀기 전에는 제출할 수 없다');

/* 한 문항만 고르고 진행률을 본다 */
await page.locator('.q[data-i="0"] .opt').first().click();
say((await page.textContent('#progtxt')).trim() === '답변 1 / 25',
  '진행률이 센다 (' + (await page.textContent('#progtxt')).trim() + ')');
say(await page.locator('#sub').isDisabled(), '1문항만 풀면 아직 제출 못 한다');

/* **정답을 알고 친다** — 채점이 맞는지 보려면 점수를 예측할 수 있어야 한다.
   앞 20문항은 정답, 나머지 5문항은 일부러 오답을 고른다 → 80점이어야 한다. */
const plan = await page.evaluate(() => {
  const ans = window.picked.list.map(q => q.ans);
  return ans.map((a, i) => (i < 20 ? a : (a + 1) % 4));
});
for (const [i, j] of plan.entries())
  await page.locator(`.opt[data-i="${i}"][data-j="${j}"]`).click();
say(!(await page.locator('#sub').isDisabled()), '다 풀면 제출이 열린다');

await page.click('#sub');
await page.waitForSelector('#result', { timeout: 8000 });
const res = await page.evaluate(() => ({
  score: document.querySelector('.result .score').textContent.trim(),
  grade: document.querySelector('.result .grade').textContent.trim(),
  emp: document.querySelector('.result dd').textContent.trim(),
  right: document.querySelectorAll('.opt.right').length,
  wrong: document.querySelectorAll('.opt.wrong').length,
  exps: document.querySelectorAll('.exp').length,
  timer: document.getElementById('timer').textContent,
}));
say(res.score === '80점', '채점이 맞는다 — 20/25 → 80점 (실제 ' + res.score + ')');
say(res.grade === '우수합니다', '등급이 붙는다 (' + res.grade + ')');
say(res.emp === '87654321', '결과에 사번이 남는다 (' + res.emp + ')');
say(res.right === 25, '모든 문항에 정답이 표시된다 (실제 ' + res.right + ')');
say(res.wrong === 5, '틀린 것만 오답 표시 (실제 ' + res.wrong + ')');
say(res.exps === 5, '틀린 문항에만 해설이 붙는다 (실제 ' + res.exps + ')');
say(res.timer === '종료', '제출하면 타이머가 멈춘다');

/* 제출 뒤에는 답을 바꿀 수 없어야 한다 — 바꿀 수 있으면 점수가 거짓이 된다 */
await page.locator('.opt[data-i="0"]').first().click();
say((await page.locator('.opt.sel').count()) === 0, '제출 뒤에는 답을 못 바꾼다');

/* ── ⑤ 시트 보고 ──
 * 기본값이 꺼짐이라 위 실물 검사는 이 길을 **한 줄도 안 지나간다.** 켜 놓고 쓰는 것이
 * 이 기능의 본래 모습인데 검사가 없으면 조용히 썩는다 — 그래서 주소를 채운 사본을 만들어
 * `fetch` 만 가짜로 물리고 한 판 더 친다.
 *
 * 가장 무서운 고장은 "안 보내 놓고 기록됨이라 적는 것"이라 **보낸 내용까지 들여다본다.** */
{
  const url = 'https://script.example.test/exec';
  const lone2 = path.join(dir, 'with-url.html');
  fs.writeFileSync(lone2, committed.replace("var SCRIPT_URL = '';", "var SCRIPT_URL = '" + url + "';"));

  const ctx = await br.newContext({ viewport: { width: 720, height: 1000 } });
  /* 진짜로 나가지 않게 fetch 를 갈아 끼운다. `__mode` 로 성공·실패를 바꾼다. */
  await ctx.addInitScript(() => {
    window.__sent = [];
    window.__mode = 'ok';
    window.fetch = u => {
      window.__sent.push(String(u));
      return window.__mode === 'ok'
        ? Promise.resolve({ ok: true, text: () => Promise.resolve('{"ok":true}') })
        : Promise.reject(new Error('offline'));
    };
  });
  const p2 = await ctx.newPage();
  const play = async (emp, mode) => {
    await p2.goto(pathToFileURL(lone2).href, { waitUntil: 'domcontentloaded' });
    await p2.waitForFunction(() => document.getElementById('i-code').textContent !== '–', { timeout: 15000 });
    if (mode) await p2.evaluate(m => { window.__mode = m; }, mode);
    await p2.fill('#emp', emp);
    await p2.click('#start');
    await p2.waitForSelector('.q', { timeout: 8000 });
    const ans = await p2.evaluate(() => window.picked.list.map(q => q.ans));
    for (const [i, j] of ans.entries()) await p2.locator(`.opt[data-i="${i}"][data-j="${j}"]`).click();
    await p2.click('#sub');
    await p2.waitForSelector('#result', { timeout: 8000 });
    await p2.waitForFunction(() => {
      const el = document.getElementById('rec');
      return el && el.textContent !== '…' && el.textContent.indexOf('보내는 중') < 0;
    }, { timeout: 8000 }).catch(() => {});
    return p2.evaluate(() => ({
      sent: window.__sent.slice(), rec: (document.getElementById('rec') || {}).textContent || '',
      left: (window.box ? window.box() : []).length,
    }));
  };

  const a = await play('11112222');
  say(a.sent.length === 1, `보내기가 실제로 나간다 (실제 ${a.sent.length}건)`);
  const qs = new URL(a.sent[0] || 'https://x/?').searchParams;
  say(qs.get('empId') === '11112222' && qs.get('score') === '100' && qs.get('total') === '25',
    `사번·점수·문항수가 실려 간다 (${qs.get('empId')} · ${qs.get('score')}점 · ${qs.get('total')}문항)`);
  say(!!qs.get('code') && !!qs.get('startedAt'),
    '시험지 코드와 응시시각이 함께 간다 — 받는 쪽이 중복을 이것으로 거른다');
  say(a.rec === '기록됨', `성공하면 화면이 그렇게 적는다 (${a.rec})`);
  say(a.left === 0, `보낸 것은 대기함에서 지운다 (남은 ${a.left}건)`);

  /* **실패를 성공이라 말하지 않는다** — 여기가 이 기능에서 가장 위험한 자리다 */
  const b = await play('33334444', 'fail');
  say(b.rec.indexOf('기록 실패') === 0, `실패하면 실패라고 적는다 (${b.rec})`);
  say(b.left === 1, `못 보낸 것은 대기함에 남는다 (남은 ${b.left}건)`);

  /* 다시 열면 밀린 것부터 털어낸다. localStorage 가 막힌 브라우저에서는 이것만 못 한다 */
  await p2.goto(pathToFileURL(lone2).href, { waitUntil: 'domcontentloaded' });
  const store = await p2.evaluate(() => { try { localStorage.setItem('t','1'); return true; } catch (e) { return false; } });
  if (store) {
    const c = await p2.evaluate(() => new Promise(r => setTimeout(() => r({
      sent: window.__sent.length, left: window.box().length }), 400)));
    say(c.sent === 1 && c.left === 0, `다시 열면 밀린 것을 다시 보낸다 (보냄 ${c.sent} · 남은 ${c.left})`);
  } else {
    console.log('SKIP: 이 브라우저는 file:// 에서 localStorage 를 막는다 — 재전송 검사만 건너뛴다');
  }
  await ctx.close();
}

say(outside.length === 0, '바깥으로 나간 요청 0' + (outside.length ? ' — ' + outside[0] : ''));
say(errs.length === 0, '콘솔 오류 없음' + (errs.length ? ' — ' + errs[0] : ''));

await br.close();
console.log('\n구성: ' + before.info);
console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
