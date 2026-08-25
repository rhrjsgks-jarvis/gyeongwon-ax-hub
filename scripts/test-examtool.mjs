/*
 * **자립형 시험지 출력기 회귀 검사** — `npm run test:examtool`
 *
 * 이 도구는 앱과 달리 **매장에 파일 그 자체가 나간다**(메일·USB). 한 번 나간 파일은
 * 회수가 안 되므로, 배포 URL 을 확인하는 다른 앱보다 검사가 더 무겁게 걸려 있다.
 *
 * 세 겹이다:
 *  ① **신선도** — 커밋된 `tools/시험지출력기.html` == 지금 재생성한 것.
 *     문항을 늘리고 빌드를 안 돌리면 매장 파일이 옛 문항으로 굳는데,
 *     그 사실이 화면에 아무 표시도 안 난다(search-index·size-reps 와 같은 규칙).
 *  ② **자립성** — 바깥을 부르는 곳이 0. 메일로 받은 사람의 PC 에는 우리 서버가 없다.
 *  ③ **실물** — 파일 **한 장만** 임시 폴더에 복사해 `file://` 로 열어 본다.
 *     형제 파일이 하나도 없는 상태가 곧 "메일로 받아 더블클릭한 상태"다.
 *     그 사이 http(s) 요청이 하나라도 나가면 실패시킨다.
 *
 * ③ 은 playwright 가 없으면 SKIP 하지만 ①② 는 브라우저 없이 늘 돈다 —
 * 조용히 썩는 것은 ① 이고, 그건 검사에 브라우저가 필요 없다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildExamTool, assertSelfContained, OUT } from './build-exam-tool.mjs';
import { buildLGQuestions, isStandaloneLG } from './build-lg-questions.mjs';
import { readQB, LG_RE } from './lib/quiz-bank.mjs';

let ok = true;
const say = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ': ' + m); if (!c) ok = false; };

/* ── ① 신선도 ── */
if (!fs.existsSync(OUT)) {
  say(false, 'tools/시험지출력기.html 이 없다 — `npm run build:examtool` 을 돌리고 커밋할 것');
  process.exit(1);
}
const committed = fs.readFileSync(OUT, 'utf8');
const { html: fresh, bank } = buildExamTool();
say(committed === fresh,
  `커밋된 출력기 == 재생성한 것 (문항 ${bank.total}개)` +
  (committed === fresh ? '' : ' — `npm run build:examtool` 을 돌리고 커밋할 것'));

/* ── ①-b LG 비교 문항(C형) ──
 * 2026-08-25 사장님 지시 — *"엘지문제가 통으로 나오는 게 아니라 … 질문은 삼성질문이고
 * 보기에 LG를 넣어서 헷갈리게"*. 그 전에는 LG 68문항 중 **48개가 "LG 단독 지식"**
 * (상담사에게 LG 스펙을 외우라고 묻는 것)이었다. 되돌아오면 여기서 걸린다. */
const ALL = Object.values(readQB()).flat();

const standalone = ALL.filter(isStandaloneLG);
say(standalone.length === 0, 'LG 를 통으로 묻는 문항 0개'
  + (standalone.length ? ` — ${standalone.length}개 발견: "${standalone[0].q}"` : ''));

const cq = ALL.filter(q => q.lg === 1);
const key = qs => qs.map(q => `${q.q}|${q.opts.join('|')}|${q.ans}`).sort().join('\n');
say(key(cq) === key(buildLGQuestions()),
  `커밋된 C형 == 재생성한 것 (${cq.length}개)`
  + (key(cq) === key(buildLGQuestions()) ? '' : ' — `npm run build:lgq` 를 돌리고 커밋할 것'));

/* 지면에 브랜드가 보이면 그 자리가 곧 정답이라 "헷갈리게" 라는 지시와 어긋난다.
   보기에 드는 것은 `트루스팀`·`인버터 리니어 컴프레서` 같은 **고유 기술명**이어야 한다. */
const shape = cq.filter(q => !/삼성/.test(q.q) || LG_RE.test(q.q)
  || (q.opts || []).some(o => LG_RE.test(String(o))));
say(shape.length === 0, 'C형은 삼성이 주어이고 지면에 LG 브랜드 표기가 없다'
  + (shape.length ? ` — ${shape.length}개 어긋남: "${shape[0].q}"` : ''));

/* ── ①-c 읽지 않고 찍히는가 ──
 * 사장님 방향성 문서(`urlquizgenerator_SKILL.md`) — *"정답만 길고 나머지 보기가
 * 터무니없는 문항은 즉시 버린다. 읽지 않고도 찍힌다."*
 *
 * **문제를 안 읽고 가장 긴 보기만 고르는 전략**의 적중률을 잰다. 찍기는 25% 이고,
 * 2026-08-25 처음 재니 **68.0%** 였다 — 목표가 *"평균 60점대"* 인데 아무것도
 * 모르고 68점이면 시험이 성립하지 않는다.
 *
 * 자동 생성한 C형은 22%(찍기 수준)라 정상이고 **손으로 쓴 문항이 문제**다.
 * `npm run fix:anslen` 이 뜻을 안 바꾸는 축약으로 36개를 줄여 **63.4%** 가 됐다.
 * 나머지 418개는 **오답을 다시 써야** 하는 authoring 이라 규칙으로 못 한다.
 *
 * 여기 문턱은 **하한이 아니라 상한**이다 — 나빠지면 실패한다.
 * **고칠 때마다 이 숫자를 함께 내려** 다시 못 오르게 할 것(개구부 기준선과 같은 규칙). */
{
  const items = bank.items;
  const longest = q => { let b = 0; for (let i = 1; i < q.opts.length; i++) if (q.opts[i].length > q.opts[b].length) b = i; return b; };
  const hit = items.filter(q => longest(q) === q.ans).length;
  const rate = hit / items.length * 100;
  const CAP = 37;                       /* 실측 36.3%. 배치를 돌 때마다 함께 내릴 것 */
  say(rate <= CAP, `가장 긴 보기만 골랐을 때 ${rate.toFixed(1)}% (상한 ${CAP}% · 찍기 25%)`
    + (rate <= CAP ? '' : ' — 정답만 긴 문항이 늘었다. npm run fix:anslen 과 오답 다시쓰기'));
  const auto = items.filter(q => q.lg);
  const autoHit = auto.filter(q => longest(q) === q.ans).length;
  say(autoHit / auto.length <= 0.35,
    `  └ 자동 생성 C형은 ${(autoHit / auto.length * 100).toFixed(0)}% — 찍기 수준을 지킨다`);
}

/* ── ② 자립성 ── */
let selfOk = true, why = '';
try { assertSelfContained(committed); } catch (e) { selfOk = false; why = e.message; }
say(selfOk, '바깥을 부르는 곳 0' + (selfOk ? '' : ' — ' + why));
say(committed.includes('"items"') && committed.includes('"policy"'),
  '문제은행이 파일 안에 들어 있다 (' + (Buffer.byteLength(committed) / 1024).toFixed(0) + 'KB)');

/* ── ③ 실물 ── */
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.log('SKIP: playwright 미설치 — 실물 검사를 건너뛴다.');
  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 1);
}

/* 형제 파일이 하나도 없는 폴더 = 메일로 받아 내려받은 상태 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'examtool-'));
const lone = path.join(dir, '시험지출력기.html');
fs.copyFileSync(OUT, lone);

const br = await chromium.launch();
const page = await br.newPage({ viewport: { width: 1200, height: 900 } });
const errs = [];
const outside = [];
page.on('pageerror', e => errs.push(e.message));
page.on('request', r => { if (!r.url().startsWith('file:')) outside.push(r.url()); });
await page.route('http://**', r => r.abort());
await page.route('https://**', r => r.abort());

await page.goto(pathToFileURL(lone).href, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.querySelectorAll('.sheet').length > 0, { timeout: 15000 });

const grab = () => page.evaluate(() => {
  const sheets = [...document.querySelectorAll('.sheet')];
  const exam = sheets.filter(s => !s.classList.contains('ans'));
  const ansSheets = sheets.filter(s => s.classList.contains('ans'));
  const qs = exam.flatMap(sh => [...sh.querySelectorAll('.q')]).map(el => ({
    q: el.querySelector('.qt').textContent.trim(),
    opts: [...el.querySelectorAll('.opts li span:last-child')].map(x => x.textContent.trim()),
    div: el.dataset.div || '',
    lv: el.dataset.lv || '',
    lg: el.dataset.lg === '1',
  }));
  /* 시험지 지면에 난이도 글자가 새어 나갔는지 — 사장님 지시가 "시험지에 난이도표시X" 다 */
  const examText = exam.map(s => s.innerText).join(' ');
  const ansLv = ansSheets.flatMap(sh => [...sh.querySelectorAll('.ex .lv')]).map(x => x.textContent.trim());
  const keys = ansSheets.flatMap(sh => [...sh.querySelectorAll('.akey div span')]).map(x => x.textContent.trim());
  const exps = ansSheets.flatMap(sh => [...sh.querySelectorAll('.ex .a')]).map(x => x.textContent.trim());
  return {
    sheets: sheets.length, examSheets: exam.length, ansSheets: ansSheets.length,
    perPage: exam.map(sh => sh.querySelectorAll('.q').length),
    wordmarks: sheets.filter(sh => sh.querySelector('.head .brand svg')).length,
    codes: sheets.map(s => s.querySelector('.code').firstChild.textContent.trim()),
    tags: document.querySelectorAll('.tag').length,
    qs, keys, exps, examText, ansLv,
    hint: document.getElementById('hint').textContent, title: document.title,
  };
});
const a = await grab();
const NO = ['①', '②', '③', '④'];

/*
 * **쪽당 5문항으로 직접 끊는다**(2026-08-24 사장님 지시). 브라우저가 알아서 흘리게 두면
 * 한 블록이 여러 쪽에 걸쳐, 블록의 padding 이 첫 쪽 위·마지막 쪽 아래에만 걸린다 —
 * 가운데 쪽은 여백이 0이 되어 잘렸다. 한 블록 = 한 쪽이면 그 문제가 사라진다.
 */
say(a.examSheets === 4, '시험지 4장 (실제 ' + a.examSheets + ')');
say(a.ansSheets >= 1, '정답지 ' + a.ansSheets + '장');
say(a.perPage.every(n => n === 5), '쪽당 5문항 (실제 ' + a.perPage.join('/') + ')');
/* 로고가 잘려 안 보인다는 신고가 있었다 — 이제 모든 장에 들어간다 */
say(a.wordmarks === a.sheets, '모든 장에 삼성 워드마크 (' + a.wordmarks + '/' + a.sheets + ')');
say(a.qs.length === 20, '20문항 (실제 ' + a.qs.length + ')');
say(a.qs.every(q => q.opts.length === 4), '모든 문항 보기 4개');
/* 품목 이름은 답을 좁혀 주는 힌트다 — 되살아나면 여기서 걸린다 */
say(a.tags === 0, '문항 옆에 품목 이름이 없다 (실제 ' + a.tags + '개)');
say(new Set(a.qs.map(q => q.q)).size === a.qs.length, '문항 중복 없음');

/*
 * **CE / MX 를 반씩 낸다** — 2026-08-24 사장님 지시("시험문제 비중은 CE 50% MX 50%").
 * 갈래는 `scripts/lib/quiz-bank.mjs` 의 MX_CATS 가 정하고, 근거는 모델파인더 DB 의 src 다.
 * `data-div` 는 화면·인쇄에 안 보이는 표식이라 시험지에 힌트를 주지 않는다.
 */
{
  const ce = a.qs.filter(q => q.div === 'CE').length;
  const mx = a.qs.filter(q => q.div === 'MX').length;
  say(ce === 10 && mx === 10, 'CE / MX 를 반씩 낸다 (실제 CE ' + ce + ' / MX ' + mx + ')');
  say(a.hint.indexOf('CE 10 / MX 10') >= 0, '안내문이 CE/MX 구성을 밝힌다');
}

/*
 * **난이도는 섞고, 시험지에는 적지 않는다** — 2026-08-24 사장님 지시
 * ("시험난이도 상중하로 3단계 구분(시험지에 난이도표시X)" · "상 중 하 를 믹스").
 * 갈래 정의는 `scripts/lib/quiz-bank.mjs` 의 `levelOf()` 주석에 있다 —
 * 하=무엇인지 아는가 / 중=어떻게 다른가 / 상=정확히 얼마인가.
 */
{
  const n = L => a.qs.filter(q => q.lv === L).length;
  say(n('하') === 3 && n('중') === 7 && n('상') === 10,
      '난이도 하 3 / 중 7 / 상 10 (실제 ' + ['하','중','상'].map(L => L + ' ' + n(L)).join(' / ') + ')');
  say(a.qs.every(q => ['하','중','상'].includes(q.lv)), '모든 문항에 난이도가 붙어 있다');
  /* 표식은 data 속성이라 인쇄에 안 나온다 — 지면 글자에 난이도가 섞이면 힌트가 된다 */
  say(!/(^|[^가-힣])(난이도|하급|중급|상급)([^가-힣]|$)/.test(a.examText),
      '시험지 지면에 난이도가 적혀 있지 않다');
  /* 정답지에는 적는다(사장님 결정) — 채점·복기에 쓴다 */
  say(a.ansLv.filter(x => ['하','중','상'].includes(x)).length === 20,
      '정답지 20문항 전부에 난이도 표시 (실제 ' + a.ansLv.filter(x => ['하','중','상'].includes(x)).length + ')');
  say(a.hint.indexOf('난이도 하 3 / 중 7 / 상 10') >= 0, '안내문이 난이도 구성을 밝힌다');
}

/*
 * **LG 비교 문항 4개 고정** — 2026-08-24 사장님 지시("시험문제 LG비교문항 필요").
 * 근거 자료는 `public/compare-app.html` 의 LG 베스트샵 카탈로그 실측 스펙이고,
 * 판정은 `quiz-bank.mjs` 의 `isLG()` 가 **질문·보기**로만 한다(해설만으로는 세지 않는다 —
 * 응시자가 보는 지면에 LG 가 없는 문항을 LG 문항이라 세면 약속이 거짓이 된다).
 */
{
  const lg = a.qs.filter(q => q.lg).length;
  say(lg === 6, 'LG 비교 문항 6개 고정 (실제 ' + lg + ')');
  say(a.hint.indexOf('LG 비교 6문항') >= 0, '안내문이 LG 문항 수를 밝힌다');
}
/*
 * **한 장만 보고 통과시키지 말 것.** 위 셋(CE/MX · 난이도 · LG)은 추첨마다 다시 맞춰야
 * 하는데, 한 시험지만 검사하면 **우연히 맞은 것**을 통과시킨다. 실제로 두 번 당했다 —
 * 여백은 무작위 추첨에서 깨졌고(고정 12종은 통과), LG 는 채우기 단계에서 우연히 6개가
 * 뽑혔다. 그래서 여러 번 뽑아 **전부** 맞는지 본다.
 */
{
  const N = 12, bad = [];
  for (let t = 0; t < N; t++) {
    await page.click('#gen');
    await page.waitForFunction(() => document.querySelectorAll('.sheet').length > 0);
    const c = await page.evaluate(() => {
      const qs = [...document.querySelectorAll('.sheet:not(.ans) .q')];
      const n = (k, v) => qs.filter(e => e.dataset[k] === v).length;
      return { code: document.querySelector('.code').firstChild.textContent.trim(),
               total: qs.length, ce: n('div', 'CE'), mx: n('div', 'MX'),
               ha: n('lv', '하'), jung: n('lv', '중'), sang: n('lv', '상'),
               lg: qs.filter(e => e.dataset.lg === '1').length };
    });
    const ok2 = c.total === 20 && c.ce === 10 && c.mx === 10 &&
                c.ha === 3 && c.jung === 7 && c.sang === 10 && c.lg === 6;
    if (!ok2) bad.push(c.code + '(CE' + c.ce + '/MX' + c.mx + ' 하' + c.ha + '중' + c.jung +
                       '상' + c.sang + ' LG' + c.lg + ')');
  }
  say(bad.length === 0, N + '번 뽑아 전부 구성이 맞다 (CE10/MX10 · 하3중7상10 · LG6)' +
      (bad.length ? ' — 어긋난 것 ' + bad.length + '건: ' + bad.slice(0, 4).join(' ') : ''));
}

say(new Set(a.codes).size === 1, '모든 장의 시험지 코드 일치 (' + a.codes[0] + ')');
say(a.keys.length === 20, '정답표 20칸 (실제 ' + a.keys.length + ')');

let match = 0;
for (let i = 0; i < 20; i++) if (a.exps[i] && a.exps[i].startsWith('정답 ' + a.keys[i])) match++;
say(match === 20, '정답표 ↔ 해설 정답 일치 ' + match + '/20');

let inSheet = 0;
for (let i = 0; i < 20; i++) {
  const want = a.exps[i].replace(/^정답 [①②③④]\s*/, '');
  if (a.qs[i].opts[NO.indexOf(a.keys[i])] === want) inSheet++;
}
say(inSheet === 20, '정답 위치가 시험지 보기와 일치 ' + inSheet + '/20');

/* 저장되는 PDF 파일 이름이 시험지 코드를 단다 — 여러 장 뽑아도 파일이 안 섞인다 */
const code0 = a.codes[0].replace('시험지 ', '');
say(a.title === '시험지_' + code0, '문서 제목이 시험지 코드를 단다 (' + a.title + ')');

/* 매번 달라야 한다 */
const seen = new Set([a.qs.map(q => q.q).join('|')]);
for (let i = 0; i < 4; i++) {
  await page.click('#gen');
  await page.waitForTimeout(150);
  seen.add((await grab()).qs.map(q => q.q).join('|'));
}
say(seen.size === 5, '5번 뽑아 5번 다 다른 시험지 (실제 ' + seen.size + '종)');

/*
 * **인쇄는 시험지를 바꾸지 않는다 — 일부러 그렇다**(2026-08-19 사용자 확인).
 * 바꾸는 것은 `새 시험지` 버튼뿐이다. 인쇄가 그 자리에서 새로 뽑으면
 * ①화면에서 검토한 것과 다른 것이 프린터로 나가고 ②코드를 넣어 같은 시험지를
 * 다시 뽑는 재인쇄·채점 대조가 무너진다. "안 바뀌네" 하고 고치지 말 것.
 */
{
  const before = await grab();
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('#prt');
  await page.waitForTimeout(150);
  const after = await grab();
  say(after.qs.map(q => q.q).join('|') === before.qs.map(q => q.q).join('|') &&
      after.codes[0] === before.codes[0],
    '인쇄를 눌러도 시험지가 그대로 (' + before.codes[0] + ') — 바꾸는 것은 새 시험지 버튼뿐');
}

/* 같은 코드면 같은 시험지여야 한다(재인쇄·채점 대조) */
const cur = await grab();
const code = cur.codes[0].replace('시험지 ', '');
await page.fill('#code', code);
await page.press('#code', 'Enter');
await page.waitForTimeout(150);
const again = await grab();
say(again.qs.map(q => q.q).join('|') === cur.qs.map(q => q.q).join('|'),
  '같은 코드(' + code + ') → 같은 시험지 재현');

/*
 * **난이도 비중을 골라 출력한다** — 2026-08-25 사장님 요청
 * ("문제난이도 비중을 선택해서 출력할수있게"). 기본을 하4·중8·상8 로 올렸고
 * (*"상담매니저들 실력향상과 전문성을 위한 … 조금 더 난이도가 높아도 됩니다"*)
 * 프리셋 넷 + 직접 지정을 둔다. **고른 대로 안 나오면 화면이 거짓말을 하는 것**이라
 * 프리셋 전부를 실제로 눌러 결과를 센다.
 */
{
  const want = { '3,7,10': [3, 7, 10], '8,7,5': [8, 7, 5], '4,8,8': [4, 8, 8], '1,6,13': [1, 6, 13], '0,6,14': [0, 6, 14] };
  for (const [val, [lo, mid, hi]] of Object.entries(want)) {
    await page.selectOption('#lv', val);
    await page.waitForTimeout(150);
    const g = await grab();
    const n = L => g.qs.filter(q => q.lv === L).length;
    say(n('하') === lo && n('중') === mid && n('상') === hi,
      `난이도 프리셋 ${val} → 실제 하 ${n('하')} / 중 ${n('중')} / 상 ${n('상')}`);
    /* LG 6문항은 전부 '중' 이라 중 칸이 6 이상인 프리셋에서는 그대로 지켜져야 한다 */
    if (mid >= 6) say(g.qs.filter(q => q.lg).length === 6,
      `  └ 그 배분에서도 LG 6문항 유지 (실제 ${g.qs.filter(q => q.lg).length})`);
  }

  /* 직접 지정 — 합이 20 이 아니어도 **비율**로 읽어야 한다(3·3·4 → 5·5·10) */
  await page.selectOption('#lv', 'manual');
  await page.fill('#lvL', '3'); await page.fill('#lvM', '3'); await page.fill('#lvH', '4');
  await page.dispatchEvent('#lvH', 'change');
  await page.waitForTimeout(150);
  const m = await grab();
  const c = L => m.qs.filter(q => q.lv === L).length;
  say(c('하') === 6 && c('중') === 6 && c('상') === 8,
    `직접 지정 3·3·4 를 비율로 읽는다(3:3:4 → 6:6:8) → 하 ${c('하')} / 중 ${c('중')} / 상 ${c('상')}`);

  /* 중을 LG 수(6) 아래로 내리면 LG 가 다 못 들어간다 — **원인을 밝히는지** 본다.
     "은행에 N개뿐" 같은 틀린 원인을 말하면 안 된다. */
  await page.fill('#lvM', '0'); await page.fill('#lvL', '0'); await page.fill('#lvH', '20');
  await page.dispatchEvent('#lvH', 'change');
  await page.waitForTimeout(150);
  const z = await grab();
  say(z.qs.filter(q => q.lv === '상').length === 20, '상 20 을 고르면 전부 상 (실제 '
    + z.qs.filter(q => q.lv === '상').length + ')');
  say(z.qs.filter(q => q.lg).length === 0 && /난이도 “중” 인데/.test(z.hint),
    'LG 가 안 들어가는 배분이면 그 원인을 화면이 밝힌다');

  await page.selectOption('#lv', '3,7,10');   /* 뒷 검사를 위해 기본값으로 되돌린다 */
  await page.waitForTimeout(150);
}

/*
 * **쪽수를 못 박는다** — 2026-08-19 사용자: *"A4 로 출력하면 너무 작게 나옵니다.
 * 답안지는 1장으로 나와도 되는데 시험지는 2~3장으로 나눠서 문제를 조금 더 크게".*
 * 조판을 조이는 것이 늘 미덕이 아니다 — 이 도구의 결과물은 **시험장에서 사람이 읽는
 * 종이**다. 글자를 줄여 쪽수를 아끼면 여기서 걸린다.
 *
 * 어림(높이 ÷ A4)으로 재지 말 것 — `.q` 의 page-break-inside:avoid 가 쪽 끝에서
 * 문항을 통째로 다음 장으로 밀어 빈 자리가 생긴다(어림 3장, 실제 4장이었다).
 */
{
  const count = (buf) => (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  /* 시험지가 여러 장으로 나뉘었으므로 **묶음 단위**(.ans 여부)로 숨겨 센다 */
  const only = async (wantAns) => {
    await page.evaluate((w) => document.querySelectorAll('.sheet').forEach((s) => {
      s.style.display = (s.classList.contains('ans') === w) ? '' : 'none';
    }), wantAns);
    const n = count(await page.pdf({ format: 'A4', printBackground: true }));
    await page.evaluate(() => document.querySelectorAll('.sheet').forEach((s) => { s.style.display = ''; }));
    return n;
  };
  const exam = await only(false), ans = await only(true);
  say(exam === a.examSheets, '시험지 블록 ' + a.examSheets + '개 = A4 ' + exam + '쪽 (한 블록 = 한 쪽)');

  /*
   * **여백은 인쇄 설정과 무관해야 한다.** @page 여백만 믿으면 인쇄창에서 여백을 “없음”으로
   * 고르는 순간 통째로 무시돼 다시 잘린다(2026-08-24 현장에서 11mm · 31mm 두 번 다 잘렸다).
   * 지금은 한 블록 = 한 쪽이라 **.sheet 의 padding** 이 그 쪽의 위아래 모두에 걸린다.
   * 그래서 여기서는 ①실제 여백값 ②인쇄 설정을 바꿔도 쪽수가 그대로인지 를 함께 본다.
   */
  {
    const pad = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.sheet'));
      const mm = v => parseFloat(v) / (96 / 25.4);
      return { top: mm(cs.paddingTop), side: mm(cs.paddingLeft) };
    });
    say(pad.top >= 17, '쪽 위아래 여백 18mm (실제 ' + pad.top.toFixed(0) + 'mm)');
    /* 하한선은 설정값(15mm)보다 0.1 낮게 잡는다 — mm→px→mm 왕복에서 15mm 가 14.998mm 로
     * 돌아와 '여유 0' 인 하한선이 반올림 하나에 깨진다. 14mm 이하는 그대로 물린다. */
    say(pad.side >= 9.9, '쪽 좌우 여백 10mm (실제 ' + pad.side.toFixed(1) + 'mm)');

    /* **폰에서 인쇄해도 여백이 그대로여야 한다.** `@media (max-width:820px)` 가 미디어 종류를
     * 안 밝히면 인쇄에도 걸리고 `@media print` 와 명시도가 같아 뒤에 있는 쪽이 이긴다 —
     * 실제로 폰 인쇄에서 여백이 14px(3.7mm)로 무너져 프린터가 못 찍는 가장자리 안으로 들어가
     * **좌측 상단 워드마크가 잘렸다**(2026-08-24 매장 보고). 위 검사는 넓은 화면에서 재므로
     * 이걸 못 잡는다 — **화면을 좁혀 인쇄 매체로 재는 것**이 유일한 재현이다. */
    const vp = page.viewportSize() || { width: 1280, height: 720 };
    await page.setViewportSize({ width: 390, height: 900 });
    await page.emulateMedia({ media: 'print' });
    const phone = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.sheet'));
      const mm = v => parseFloat(v) / (96 / 25.4);
      return { top: mm(cs.paddingTop), side: mm(cs.paddingLeft) };
    });
    await page.emulateMedia({ media: null });
    await page.setViewportSize(vp);
    say(phone.top >= 17 && phone.side >= 9.9,
        '폰 화면에서 인쇄해도 여백 그대로 (실제 ' + phone.top.toFixed(0) + ' / ' + phone.side.toFixed(1) + 'mm)');

    const base = count(await page.pdf({ format: 'A4', printBackground: true }));
    let steady = true, badCase = '';
    /* 인쇄창에서 고를 수 있는 현실적인 두 값만 본다. “넓게”(25mm)는 우리 26mm 위에 다시
       25mm 를 얹는 셈이라 5문항이 물리적으로 한 쪽에 안 들어간다 — 화면 안내가 쓰지 말라고 적는다. */
    for (const m of ['0', '10mm']) {
      const tag = await page.addStyleTag({ content: '@media print{ @page{ size:A4; margin:' + m + ' } }' });
      const n = count(await page.pdf({ format: 'A4', printBackground: true }));
      if (n !== base) { steady = false; badCase = m + ' → ' + n + '쪽'; }
      await page.evaluate(el => el.remove(), tag);
    }
    say(steady, '인쇄창 여백을 바꿔도 쪽수 그대로 (' + base + '쪽)' + (steady ? '' : ' — ' + badCase));
  }
  /*
   * 정답지는 **1~2장 다 정상**이다(2026-08-24 사장님 확인: "정답지가 2장이 되어도 상관없습니다").
   * 해설을 2단(`columns:2`)으로 짜는데 크롬이 다단 블록을 쪽 경계에서 잘 못 나눠,
   * 내용이 210mm 뿐이어도 여백을 조금만 주면 두 쪽으로 흘린다. 조판을 조이면
   * 해설 글자가 작아지므로 **기준을 넓히는 쪽**을 골랐다.
   */
  say(ans === a.ansSheets, '정답지 블록 ' + a.ansSheets + '개 = A4 ' + ans + '쪽 (한 블록 = 한 쪽)');

  /*
   * **쪽수만으로는 못 지킨다 — 글꼴 하한을 함께 본다.**
   * 옛 조판(문항 12.5px)으로 되돌려 보니 시험지가 2장이라 "2~3장" 범위를 그대로
   * 통과했다. 쪽수는 결과이고 요구사항은 "글자를 크게" 였다. 하한으로 잡는다
   * (test-real 이 품질 지표를 하한으로 지키는 것과 같은 모양).
   */
  const font = await page.evaluate(() => ({
    q: parseFloat(getComputedStyle(document.querySelector('.qh')).fontSize),
    o: parseFloat(getComputedStyle(document.querySelector('.opts li')).fontSize),
  }));
  say(font.q >= 16, '문항 글꼴 16px 이상 (실제 ' + font.q + 'px)');
  say(font.o >= 14, '보기 글꼴 14px 이상 (실제 ' + font.o + 'px)');
}

/* A4 로 인쇄되는가 */
const pdf = path.join(dir, 'sample.pdf');
await page.pdf({ path: pdf, format: 'A4', printBackground: true });
say(fs.existsSync(pdf), 'A4 PDF 생성 (' + (fs.statSync(pdf).size / 1024).toFixed(0) + 'KB)');

say(outside.length === 0, '바깥으로 나간 요청 0' + (outside.length ? ': ' + outside[0] : ''));
say(errs.length === 0, '콘솔 오류 없음' + (errs.length ? ': ' + errs[0] : ''));
console.log('\n안내문: ' + a.hint);
console.log(ok ? '\nALL PASS' : '\nSOME FAILED');

await br.close();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
