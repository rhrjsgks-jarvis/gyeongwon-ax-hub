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
import { buildExamTool, assertSelfContained, OUT, STATS, statsSource } from './build-exam-tool.mjs';
import { buildLGQuestions, isStandaloneLG } from './build-lg-questions.mjs';
import { readQB, LG_RE } from './lib/quiz-bank.mjs';
import { buildNewModelQuestions } from './build-new-model-questions.mjs';

/* 신규 44개 모델 문항 fixture — 「커밋본 == 재생성」을 대조한다 */
const NM_OUT = 'scripts/fixtures/new-model-questions.json';

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

/* 대시보드가 이 파일에서 문항 수를 읽어 화면에 적는다. 낡으면 **화면이 거짓말을 한다** —
   손으로 박아 둔 `574문` 이 실제 은행과 어긋난 채 오래 떠 있었다(2026-08-26 사장님 지적). */
const statsNow = fs.existsSync(STATS) ? fs.readFileSync(STATS, 'utf8') : '';
say(statsNow === statsSource(bank),
  `커밋된 문항 수 파일 == 재생성한 것 (은행 ${bank.total} · 앱 ${bank.appTotal})` +
  (statsNow === statsSource(bank) ? '' : ' — `npm run build:examtool` 을 돌리고 커밋할 것'));

/* ── ①-b LG 비교 문항(C형) ──
 * 2026-08-25 사장님 지시 — *"엘지문제가 통으로 나오는 게 아니라 … 질문은 삼성질문이고
 * 보기에 LG를 넣어서 헷갈리게"*. 그 전에는 LG 68문항 중 **48개가 "LG 단독 지식"**
 * (상담사에게 LG 스펙을 외우라고 묻는 것)이었다. 되돌아오면 여기서 걸린다. */
const ALL = Object.values(readQB()).flat();

const standalone = ALL.filter(isStandaloneLG);
say(standalone.length === 0, 'LG 를 통으로 묻는 문항 0개'
  + (standalone.length ? ` — ${standalone.length}개 발견: "${standalone[0].q}"` : ''));

/* **`LG U+` 는 통신사이지 경쟁사가 아니다**(2026-09-04). 삼성 제품명이 유통 채널을
   그대로 달고 있어 사양 비교 문항 4개가 위 검사에 걸렸다 — 단어 경계로는 못 거른다
   (`LG U+` 는 뒤가 공백이라 경계 조건을 정상 통과한다). 이 오탐은 검사만 헛도는 것이
   아니라 `build-lg-questions.mjs` 가 같은 판정으로 은행에서 문항을 **지운다.**
   양쪽을 함께 본다 — 한쪽만 보면 규칙을 아무거나 느슨하게 해도 통과한다. */
for (const [s, want] of [
  ['갤럭시 S23 FE 통신사폰 (SKT/KT/LG U+)(SM-S711NZPWKOD)', false],
  ['갤럭시 버디3 사업자향 (LG U+)(SM-A156LZKALUC)', false],
  ['LG 유플러스 전용 모델', false],
  ['LG 트롬 워시타워', true],
  ['LG전자 디오스 얼음정수기', true],
  ['DLG 확장 120Hz', false],
]) say(LG_RE.test(s) === want,
  `LG 판정 — ${JSON.stringify(s)} → ${want ? 'LG' : 'LG 아님'}`);

const cq = ALL.filter(q => q.lg === 1);
const key = qs => qs.map(q => `${q.q}|${q.opts.join('|')}|${q.ans}`).sort().join('\n');
say(key(cq) === key(buildLGQuestions()),
  `커밋된 C형 == 재생성한 것 (${cq.length}개)`
  + (key(cq) === key(buildLGQuestions()) ? '' : ' — `npm run build:lgq` 를 돌리고 커밋할 것'));

/* ── ①-d 신규 44개 모델 (2026-09-01 사장님 지시) ──
 * *"기존 시험지출력기 자료에서 **가전 관련 문항은 전부 삭제**하고 그 자리에 아래
 * 신규 모델 목록만 사용해 … 새 문제를 출제해줘"* · 확정: 「시험지만 교체」(앱의 `QB`
 * 는 그대로) · 「LG 비교 문항 85개는 유지」.
 *
 * 셋을 지킨다 — **커밋본이 최신인가 · 옛 가전 문항이 정말 빠졌는가 · 앱은 그대로인가.**
 * 가운데가 핵심이다: 걸러 내는 규칙이 `buildBank()` 한 줄이라, 그 줄이 사라지면
 * 830문항이 **조용히** 되살아나고 화면에는 아무 표시도 안 난다. */
{
  const nmKey = qs => qs.map(q => `${q.q}|${q.opts.join('|')}|${q.ans}|${q.lv}`).sort().join('\n');
  const committedNm = JSON.parse(fs.readFileSync(NM_OUT, 'utf8')).items;
  const freshNm = buildNewModelQuestions().items;
  say(nmKey(committedNm) === nmKey(freshNm),
    `커밋된 신규 모델 문항 == 재생성한 것 (${committedNm.length}개)`
    + (nmKey(committedNm) === nmKey(freshNm) ? '' : ' — `npm run build:nmq` 를 돌리고 커밋할 것'));

  /* 시험 도구 은행에 옛 가전 문항이 남아 있으면 안 된다 —
     남는 CE 는 **LG 비교(C형) · 신규 모델 · B2B · 정책 문항** 넷이다.

     **B2B 는 「옛 가전」이 아니다**(2026-09-02 사장님 지시: *"시험출력기에 B2B
     제품은 살려주세요"*). 하루 전에는 「가전 관련 문항은 전부 삭제」를 B2B 에도
     그대로 적용해 CE 310문항을 뺐는데, **성격이 다르다** — 옛 소비자 모델 사양이
     아니라 **SOHO몰 법인 판매 사양**이라 신규 44모델이 대신해 주지 못한다.
     빼면 그 상담이 시험에서 통째로 사라진다. */
  const stale = bank.items.filter(q => q.div === 'CE' && !q.lg && !q.nm && !q.b2b && q.type !== 'policy');
  say(stale.length === 0, `시험 은행에 남은 옛 가전 문항 ${stale.length}개`
    + (stale.length ? ` — 예: "${stale[0].q.slice(0, 50)}"` : ''));
  say(bank.nmTotal >= 300 && bank.lgTotal === 85,
    `신규 모델 ${bank.nmTotal}문항 · LG 비교 ${bank.lgTotal}문항(유지)`);

  /* **앱과 시험 도구가 같은 은행을 본다**(2026-09-02 사장님 지시: *"시험지 출력기와
     레벨업테스트를 동기화해주세요"*). 하루 전의 「시험지만 교체」를 뒤집은 것이다.

     이제 시험 은행은 `QB` 를 **그대로** 읽는다 — 더하거나 빼는 규칙이 `quiz-bank.mjs`
     로 돌아오면 두 곳이 다시 갈린다. `appTotal === total` 이 그것을 붙든다. */
  say(bank.appTotal === ALL.length && bank.appTotal === bank.total && ALL.length > 600,
    `앱과 시험지가 같은 은행 (${ALL.length}문항)`);

  /* 갈래가 한쪽으로 쏠리면 시험지가 같은 모양만 되풀이한다. 설치환경이 사장님
     지시의 핵심이라 그쪽이 가장 두꺼워야 하고, 금액 암기가 은행을 덮으면 안 된다. */
  const fam = bank.byFam || {};
  say((fam.install || 0) >= 100, `설치환경 문항 ${fam.install || 0}개 (모델 사양 ${fam.spec || 0} · 설치비용 ${fam.cost || 0} · 셀링포인트 ${fam.usp || 0})`);
  say((fam.cost || 0) <= bank.nmTotal * 0.25, `  └ 금액 문항이 신규 문항의 1/4 이하 (${fam.cost || 0}/${bank.nmTotal})`);
}

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
  const CAP = 30;                       /* 실측 29.9%(2026-09-01 신규 모델 교체 후). 배치를 돌 때마다 함께 내릴 것 */
  say(rate <= CAP, `가장 긴 보기만 골랐을 때 ${rate.toFixed(1)}% (상한 ${CAP}% · 찍기 25%)`
    + (rate <= CAP ? '' : ' — 정답만 긴 문항이 늘었다. npm run fix:anslen 과 오답 다시쓰기'));
  const auto = items.filter(q => q.lg);
  const autoHit = auto.filter(q => longest(q) === q.ans).length;
  say(autoHit / auto.length <= 0.35,
    `  └ 자동 생성 C형은 ${(autoHit / auto.length * 100).toFixed(0)}% — 찍기 수준을 지킨다`);

  /* **제목이 정답을 흘리면 안 된다.** 제품 이름에 스펙이 박힌 것이 흔해서
     "…카운터탑 6인용…의 용량은?" 같은 문항이 자동으로 만들어진다 — 읽기만 해도 풀린다
     (2026-08-26 사장님이 시험지에서 잡아냈다. 그때 13개였다).
     값의 공백을 **먼저 지우고** 글자 사이에 \s* 를 넣어 찾는다 — '6 인용' 과 '6인용' 이
     안 맞아 정작 찾으려던 것을 놓친다. 앞뒤가 영숫자면 오탐이다('2026' 안의 '20',
     모델코드 'LS32FM' 안의 '32'). 모델코드로 스펙을 읽는 것은 **지식**이라 통과시킨다. */
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const leak = q => {
    const a = String(q.opts[q.ans] || '').replace(/\s+/g, '');
    if (a.length < 2) return false;
    /* 다른 보기가 정답을 통째로 품으면(지원 ⊂ 미지원) 제목의 그 낱말은 힌트가 못 된다 */
    if (q.opts.some((o, i) => i !== q.ans && o.replace(/\s+/g, '').includes(a))) return false;
    return new RegExp('(^|[^0-9A-Za-z])' + a.split('').map(escRe).join('\\s*') + '([^0-9A-Za-z]|$)')
      .test(q.q);
  };
  const leaked = items.filter(leak);
  say(leaked.length === 0, `제목에 정답이 드러난 문항 ${leaked.length}개`
    + (leaked.length ? ` — 예: ${leaked[0].q.slice(0, 60)} → ${leaked[0].opts[leaked[0].ans]}` : ''));
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
    b2b: el.dataset.b2b === '1',
    /* **배지가 실제로 그려졌는가** — 표식만 보면 안 된다. 실제로  필드를
       문항 객체에 안 실어 **표식도 배지도 0개**였던 적이 있다(추첨은 멀쩡했다). */
    b2bMark: !!el.querySelector('.b2b'),
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
 * **B2B 문항은 지면에 밝힌다** — 2026-09-03 사장님 요청(*"B2B 모델은 B2B 문제라고
 * 표기해주시면 좋겠습니다"*). 법인 전용 모델이라 소비자 매장에서 못 보는 제품이고,
 * 모르면 「내가 모르는 제품이 나왔다」로만 읽힌다.
 *
 * **표식과 배지를 함께 본다.** 처음 붙였을 때 b2b 필드를 문항 객체에 안 실어
 * 12번 뽑아도 배지가 0개였다 — 추첨은 멀쩡했고(160문항 중 60개가 원본에서 B2B)
 * **예외도 오류도 없이 그냥 안 떴다.** 표식만 검사하면 그 결함을 못 잡는다.
 */
{
  const marked = a.qs.filter(q => q.b2b).length;
  const drawn = a.qs.filter(q => q.b2bMark).length;
  say(marked === drawn, 'B2B 표식과 배지가 짝이 맞는다 (표식 ' + marked + ' · 배지 ' + drawn + ')');
  /* 은행의 38.8% 가 B2B 라 20문항이면 거의 늘 하나는 든다. 다만 무작위라
     **0개일 수도 있으므로 "있으면 배지가 붙는가"만** 지킨다 — 개수를 박으면 헛되이 깨진다. */
  if (drawn) say(true, 'B2B 문항에 배지가 붙는다 (' + drawn + '개)');

  /* ── **배지는 B2B 「전용」 모델에만** (2026-09-03 사장님 지시) ─────────────────
   * *"시험지 출력기 B2B 표시가 B2B 전용 모델에만 표시되면 좋겠습니다."*
   * SOHO몰은 갤럭시북·TV 같은 **일반 제품도 판다** — 461문항 전부에 배지를 달면
   * 상담사가 *"일반 매장에선 못 파는 모델"* 로 잘못 읽는다(실측 207개만 전용).
   *
   * 표식이 **세 곳을 거쳐** 온다(생성기 → appbank → quiz-bank → 틀). 하나만 빠뜨려도
   * **배지가 조용히 0개**가 된다 — 실제로 appbank 에서 빠뜨려 12판 0배지였다. */
  const b2bSrc = JSON.parse(fs.readFileSync(new URL('fixtures/b2b-questions.json', import.meta.url), 'utf8'));
  /* **문항 텍스트만으로는 짝을 못 찾는다** — 「다음 중 소비전력이 가장 큰 모델은?」 처럼
     여러 카테고리가 같은 문장을 쓴다(보기가 달라 서로 다른 문항이다). 보기까지 넣어
     열쇠를 만든다. 시험지는 보기 순서를 섞으므로 **정렬해서** 맞춘다. */
  const keyOf = (q, o) => q + '||' + [...(o || [])].map(String).sort().join('|');
  const onlySet = new Set(b2bSrc.items.filter(q => q.b2bOnly).map(q => keyOf(q.q, q.opts)));
  const allSet = new Set(b2bSrc.items.map(q => keyOf(q.q, q.opts)));
  const wrong = a.qs.filter(q => q.b2bMark && allSet.has(keyOf(q.q, q.opts)) && !onlySet.has(keyOf(q.q, q.opts)));
  const miss = a.qs.filter(q => !q.b2bMark && onlySet.has(keyOf(q.q, q.opts)));
  say(!wrong.length, '전용이 아닌 모델에는 배지를 안 단다'
    + (wrong.length ? ' — ' + wrong[0].q.slice(0, 46) : ''));
  /* **짝을 하나도 못 찾으면 이 검사는 아무것도 못 지킨다** — 열쇠가 어긋나도
     wrong·miss 가 0 이라 조용히 통과한다. 실제로 맞춰 본 것이 있는지 함께 본다. */
  const matched = a.qs.filter(q => allSet.has(keyOf(q.q, q.opts))).length;
  say(matched > 0, 'B2B 문항을 은행과 짝지어 검사했다 (' + matched + '개)');
  say(!miss.length, '전용 모델에는 배지가 빠지지 않는다'
    + (miss.length ? ' — ' + miss[0].q.slice(0, 46) : ''));
  say(b2bSrc.items.some(q => q.b2bOnly) && b2bSrc.items.some(q => !q.b2bOnly),
    '판정이 갈린다 — 전용 ' + onlySet.size + ' · 일반 채널에도 있음 ' + (allSet.size - onlySet.size));

  /* 표식이 지나는 세 곳 — 하나라도 빠지면 배지가 조용히 사라진다 */
  const rd = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  say(rd('scripts/build-b2b-questions.mjs').includes('function markB2BOnly('),
    '생성기가 일반 채널과 대조해 전용 여부를 정한다');
  say(rd('scripts/build-app-bank.mjs').includes('b2bOnly: q.b2bOnly ? 1 : 0'),
    'appbank 가 표식을 옮긴다');
  say(rd('scripts/lib/quiz-bank.mjs').includes('b2bOnly: q.b2bOnly ? 1 : 0'),
    '은행이 표식을 옮긴다');
  say(rd('scripts/exam-print-template.html').includes("q.b2bOnly ? '<span class=\"b2b\">B2B</span>' : ''"),
    'A4 시험지가 전용일 때만 배지를 그린다');
  say(rd('scripts/exam-web-template.html').includes("q.b2bOnly ? '<span class=\"b2b\">B2B</span>' : ''"),
    '웹 시험이 전용일 때만 배지를 그린다');
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

    /*
     * **여백 검사만은 시험지를 고정한다**(2026-08-30).
     * 문항을 무작위로 뽑으므로 내용이 쪽 경계에 걸리면 여백과 무관하게 6↔7쪽으로 갈린다 —
     * 이 검사가 이따금 빨개져 **다른 실패를 못 보게** 만들었다. 출력기는 `?code=` 로 같은
     * 시험지를 다시 뽑으므로(재인쇄·채점 대조용으로 이미 있는 기능) 그것을 쓴다.
     * 무작위성만 빼고 **여백 불변식은 그대로** 지킨다.
     */
    await page.goto(pathToFileURL(lone).href + '?code=EXAM', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('.sheet').length > 0, { timeout: 15000 });
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

/* ── 세일즈가이드 USP 원본 (2026-09-02 사장님 요청) ─────────────────────────
 * *"구글드라이브에 추가된 파일들을 분석해서 제품별 USP를 다시정리해주세요"*
 *
 * `usp-guides.json` 은 **손으로 옮긴 원문 창고**라 재생성 대조를 할 수 없다. 대신
 * **되짚을 수 있는가**를 지킨다 — 출처 없이 들어온 문구는 지어낸 것과 구분되지 않는다.
 */
{
  const g = JSON.parse(fs.readFileSync(new URL('../scripts/fixtures/usp-guides.json', import.meta.url), 'utf8'));
  const rows = g.models || [];
  const noFile = rows.filter((r) => !r.file).length;
  const noWhat = rows.filter((r) => !r.model && !r.name).length;
  const empty = rows.filter((r) => !(r.usp && r.usp.length) && !(r.heads && r.heads.length) && !r.note).length;
  const noSrc = rows.filter((r) => !r.src).length;
  say(rows.length > 0, 'USP 원본 ' + rows.length + '항목');
  say(noFile === 0, '항목마다 어느 파일에서 왔는지 적혀 있다' + (noFile ? ' (빠진 것 ' + noFile + ')' : ''));
  say(noWhat === 0, '항목마다 모델코드나 제품명이 있다' + (noWhat ? ' (빠진 것 ' + noWhat + ')' : ''));
  say(empty === 0, '빈 항목이 없다' + (empty ? ' (' + empty + '개)' : ''));
  /* 쪽수까지 적힌 것이 대부분이어야 한다 — 없으면 원문에서 되짚을 수가 없다 */
  say(noSrc <= rows.length * 0.2, '출처(쪽)가 8할 이상 적혀 있다 (없는 것 ' + noSrc + ')');
  /* **두 자료가 같은 것을 담고 있는지 검산** — 모델별USP.pptx 는 usp-models.json 의 출처다 */
  const ppt = rows.filter((r) => r.file === '모델별USP.pptx').length;
  const um = JSON.parse(fs.readFileSync(new URL('../scripts/fixtures/usp-models.json', import.meta.url), 'utf8')).models.length;
  /* **PPT 44 == 명부 44 였던 검사를 「적지 않다」로 바꿨다**(2026-09-02) — 사장님 승인으로
     가이드에만 있던 11종을 명부에 더해 55 가 됐다. 명부가 PPT 보다 적으면 그때는
     지목된 모델을 빠뜨린 것이라 여전히 걸러야 한다. */
  say(um >= ppt, 'usp-models.json ' + um + '건이 모델별USP.pptx ' + ppt + '건보다 적지 않다');
}
/* ── 등급 비교 문항 (2026-09-02 사장님 요청 — *"세일즈가이드를 참조해서 개선"*) ────
 * 세일즈가이드가 **같은 스펙표에 나란히 적은 형제 등급**의 차이를 묻는다.
 * 매장에서 가장 많이 받는 질문(*"SH95 랑 SH85 뭐가 달라요?"*)인데 문항이 한 건도
 * 없었다. **「없다」고 말하는 문항이라 근거가 특히 중요하다** — 아래가 그 안전선이다. */
{
  const bad = [];
  const nm = JSON.parse(fs.readFileSync(NM_OUT, 'utf8'));
  const tier = (nm.items || []).filter(q => q.fam === 'tier');
  if (!tier.length) bad.push('등급 비교 문항이 한 건도 없다 — 갈래가 사라졌다');

  for (const q of tier) {
    /* ⓐ **두 모델 이름이 서로 달라야 한다.** 가이드에는 색상·용량 변형이 **같은 이름**으로
       여러 줄 들어 있어(김치플러스 10종·무풍콤보 18종), 그대로 짝지으면 화면이
       *"둘 중 어느 것"* 을 묻게 된다 — 사람이 고를 수가 없다. */
    const names = [...q.q.matchAll(/「(.+?)」/g)].map(m => m[1].replace(/\s/g, ''));
    if (names.length !== 2) bad.push('질문이 두 모델을 「」로 밝히지 않는다: ' + q.q.slice(0, 40));
    else if (names[0] === names[1]) bad.push('같은 이름 둘을 견준다 — 고를 수가 없다: ' + q.q.slice(0, 50));
    /* ⓑ 보기 길이 — **정답만 길면 읽지 않고도 찍힌다** */
    for (const o of q.opts) {
      if (o.length < 8 || o.length > 46) bad.push('보기 길이가 8~46자를 벗어난다(' + o.length + '자): ' + o.slice(0, 30));
    }
    /* ⓒ 보기가 서로 달라야 한다 */
    if (new Set(q.opts).size !== q.opts.length) bad.push('보기가 겹친다: ' + q.q.slice(0, 40));
    /* ⓓ **근거를 밝힌다** — 「없다」는 주장이라 어느 가이드 몇 쪽인지가 있어야 한다 */
    if (!/근거:/.test(q.exp || '')) bad.push('해설에 근거가 없다: ' + q.q.slice(0, 40));
    /* ⓔ 난이도는 '중' — 비교·판단이라 용어정리의 그 자리다 */
    if (q.lv !== '중') bad.push('난이도가 중이 아니다: ' + q.lv);
  }

  /* ⓕ **정답이 「가장 긴 보기」에 몰리지 않는가** — 문제를 안 읽고 찍는 전략을 막는다 */
  if (tier.length) {
    const longest = q => { let b = 0; for (let i = 1; i < q.opts.length; i++) if (q.opts[i].length > q.opts[b].length) b = i; return b; };
    const rate = tier.filter(q => longest(q) === q.ans).length / tier.length * 100;
    if (rate > 40) bad.push('가장 긴 보기만 골라도 ' + rate.toFixed(0) + '% 맞는다 (상한 40%)');
  }

  /* ⓖ **생성기의 안전장치가 살아 있는가.** 아래 둘이 빠지면 조용히 거짓 문항이 쏟아진다:
       · 자료 결손 — 가이드가 시리즈 대표 한 줄에만 특장점을 적고 형제는 비워 두는 일이
         있다(무풍콤보 usp 32 vs 1). 그대로 견주면 *"이 모델에는 32가지가 없다"* 가 된다.
       · 유무 차이 — 「AI 축구모드 Pro」 vs 「AI 축구모드」는 **등급 차이**라 "없다"가 거짓이다. */
  const gen = fs.readFileSync('scripts/build-new-model-questions.mjs', 'utf8');
  if (!gen.includes('(L.usp || []).length * 2 < (H.usp || []).length')) {
    bad.push('자료 결손 가드가 없다 — 「자료가 없다」를 「기능이 없다」로 낸다');
  }
  if (!gen.includes('flat(H.name) === flat(L.name)) continue')) {
    bad.push('같은 이름 제외가 없다 — 변형끼리 견주는 문항이 나온다');
  }
  /* **유무 차이는 문자열이 아니라 동작으로 지킨다**(2026-09-02). 예전에는 생성기 소스에
     특정 한 줄이 있는지만 봤는데, **그 줄을 지워도 값을 설정하는 다른 줄이 남아 통과**하는
     종류라(이 저장소가 `dataset.zoomed` 에서 이미 데였다) 검사가 제 일을 안 한다.
     지금은 **나온 문항마다 원문에 근거가 실제로 있는지** 대조한다:
       ① 정답이 그 모델(L)의 「미적용」 노트에 적혀 있는가
       ② 그 노트의 **값 칸**(콜론 뒤 괄호 앞)이 정답을 되풀이하지 않는가
          — 되풀이하면 L 도 그것을 가진 것이고, 없는 것은 괄호 안의 상위 등급이다
            (`SH85 : AI 축구모드 (AI 축구모드 Pro 미적용)`). */
  const guides = JSON.parse(fs.readFileSync(
    new URL('../scripts/fixtures/usp-guides.json', import.meta.url), 'utf8')).models;
  const MISS = /미적용|미지원|없음|해당\s*없|불가/;
  let unproven = 0, tierGrade = 0;
  for (const t of tier) {
    /* 질문이 「H」에는 있지만 「L」에는 없는 것은? 꼴이라 뒤 이름이 L 이다 */
    const nm = [...String(t.q).matchAll(/「([^」]+)」/g)].map((m) => m[1]);
    if (nm.length < 2) continue;
    const L = guides.find((g) => g.name.trim() === nm[1].trim());
    if (!L) { unproven++; continue; }
    const ansText = t.opts[t.ans];
    const lacks = (L.notes || []).filter((n) => MISS.test(n));
    const proven = lacks.some((n) => {
      if (!n.includes(ansText)) return false;
      const c = n.lastIndexOf(':');
      const val = (c >= 0 ? n.slice(c + 1) : n).split('(')[0];
      if (val.includes(ansText)) { tierGrade++; return false; }   /* 등급 차이지 유무 차이가 아니다 */
      return true;
    });
    if (!proven) unproven++;
  }
  if (unproven) bad.push(`정답에 원문 근거가 없는 등급비교 ${unproven}건`);
  if (tierGrade) bad.push(`등급 차이(Pro/일반)를 「없다」로 낸 것 ${tierGrade}건`);

  if (bad.length) { ok = false; console.log('FAIL: 등급 비교 문항 — ' + bad.slice(0, 4).join(' · ')); }
  else say(true, '등급 비교 문항 ' + tier.length + '개 — 이름이 다른 형제끼리 · 근거 있음 · 보기 길이 균형');
}

/* ── 기능 유무 · 수치 비교 (2026-09-04 — 삼성닷컴 사양으로 얇은 칸을 채웠다) ────
 * 재고 조사에서 둘이 나왔다 — 은행이 '상' 으로 68% 쏠렸고, TV 242 ↔ 전자레인지 3 으로
 * 칸이 통째로 얇다. 두 갈래를 더해 **'하'와 '중'만** 만들고 **모자란 칸에만** 넣는다.
 *
 * **문자열이 있는지로 보지 않는다** — 이 저장소가 그렇게 여러 번 데였다.
 * 나온 문항마다 **원문(모델 사양표)을 다시 읽어** 정답·오답을 대조한다. */
{
  const { readSpecs, fxOf } = await import('../scripts/lib/new-model-sources.mjs');
  const specs = readSpecs();
  const secCodes = new Set(JSON.parse(fs.readFileSync(
    new URL('../scripts/fixtures/sec-catalog.json', import.meta.url), 'utf8')).items.map((x) => x.code));
  const nmj = JSON.parse(fs.readFileSync(NM_OUT, 'utf8')).items || [];
  const feat = nmj.filter((q) => q.fam === 'feat');
  const wcmp = nmj.filter((q) => q.fam === 'wcmp');
  const bad = [];
  const flat2 = (x) => String(x).replace(/\s/g, '');
  const YESV = /^(있음|지원|적용|탑재|제공)$/;
  const NOV = /^(없음|미지원|미적용|미탑재|해당없음|해당 없음)$/;

  if (!feat.length) bad.push('기능 유무 문항이 한 건도 없다 — 갈래가 사라졌다');
  if (!wcmp.length) bad.push('수치 비교 문항이 한 건도 없다 — 갈래가 사라졌다');

  /* ⓐ 기능 유무 — 보기 넷이 **모두 그 모델 제 사양표**에 있고 있음/없음이 맞아야 한다 */
  for (const q of feat) {
    const code = (String(q.q).match(/\(([A-Za-z0-9][A-Za-z0-9\-/*.]{3,})\)에/) || [])[1];
    if (!code) { bad.push('제목에서 모델코드를 못 읽었다: ' + q.q.slice(0, 40)); continue; }
    if (!secCodes.has(code)) bad.push('삼성닷컴 현행 목록에 없는 모델: ' + code);
    const fx = new Map(fxOf(specs, code).map(([k, v]) => [flat2(k), String(v).trim()]));
    const neg = q.q.includes('적용되지 않는');
    q.opts.forEach((o, i) => {
      const v = fx.get(flat2(o));
      if (v === undefined) { bad.push(`${code} 사양표에 보기 "${o}" 가 없다`); return; }
      const want = neg ? (i === q.ans ? NOV : YESV) : (i === q.ans ? YESV : NOV);
      if (!want.test(v)) bad.push(`${code} "${o}" = "${v}" — ${i === q.ans ? '정답' : '오답'} 조건에 안 맞는다`);
    });
    /* 보기 넷이 **같은 말이면 안 된다.** 「UV살균 LED」와 「UV LED 살균」이 한 모델에
       함께 있어 실제로 보기 둘이 같은 말이 됐다 — 토막을 정렬해서 본다. */
    const key = (k) => (String(k).toLowerCase().match(/[가-힣]+|[a-z0-9]+/g) || []).sort().join('|');
    const ks = q.opts.map(key);
    if (new Set(ks).size !== 4) bad.push('보기 넷 중 같은 말이 있다: ' + q.q.slice(0, 40));
    for (const a2 of ks) for (const b2 of ks) {
      if (a2 !== b2 && (a2.includes(b2) || b2.includes(a2))) bad.push('보기가 서로를 품는다: ' + a2 + ' / ' + b2);
    }
  }

  /* ⓑ 수치 비교 — 정답 자리가 실제 최대인가 · 단위가 넷 다 같은가 */
  for (const q of wcmp) {
    const label = (String(q.q).match(/^다음 중 (.+?)(?:이|가) 가장 큰 것은\?$/) || [])[1];
    if (!label) { bad.push('제목에서 라벨을 못 읽었다: ' + q.q.slice(0, 40)); continue; }
    const vals = [];
    for (const o of q.opts) {
      const c = (String(o).match(/\(([^()]+)\)$/) || [])[1];
      if (!c || !secCodes.has(c)) { bad.push(`보기 "${o}" 의 모델코드를 현행 목록에서 못 찾았다`); vals.push(null); continue; }
      const row = fxOf(specs, c).find(([k]) => flat2(k) === flat2(label));
      if (!row) { bad.push(`${c} 사양표에 "${label}" 이 없다`); vals.push(null); continue; }
      vals.push(String(row[1]).trim());
    }
    if (vals.some((v) => v === null)) continue;
    const num = (v) => parseFloat(((String(v).match(/\d+(?:[.,]\d+)?/g) || [])[0] || '0').replace(/,/g, ''));
    const ns = vals.map(num), top = Math.max(...ns);
    if (ns.filter((x) => x === top).length !== 1) bad.push('최대가 둘 이상이다: ' + q.q.slice(0, 40));
    else if (ns.indexOf(top) !== q.ans) bad.push('정답 자리가 실제 최대와 다르다: ' + q.q.slice(0, 40));
    /* **단위가 다르면 크고 작음을 물을 수 없다** — 「5 ATM」과 「IP68」을 견주게 된다 */
    const unit = (v) => String(v).replace(/[\d,.]+/g, '').replace(/\s+/g, '').toLowerCase();
    if (new Set(vals.map(unit)).size !== 1) bad.push('보기 넷의 단위가 다르다: ' + vals.join(' / '));
  }

  /* ⓒ **'상' 을 한 문항도 만들지 않는다** — 은행이 이미 '상' 68% 라 더하면 나빠진다 */
  const hard = [...feat, ...wcmp].filter((q) => q.lv === '상');
  if (hard.length) bad.push(`새 갈래가 '상' 을 ${hard.length}건 만들었다 — 하·중만 만들어야 한다`);

  /* ⓓ **두꺼운 칸에는 한 문항도 더하지 않는다.** 재료는 TV·에어컨·냉장고가 가장 많아
     그냥 만들면 불균형이 오히려 커진다 — 「모자란 칸부터」가 이 갈래의 목적이다. */
  const FAT = ['TV', '에어컨', '냉장고', '김치냉장고', '갤럭시북', '갤럭시탭'];
  const spill = [...feat, ...wcmp].filter((q) => FAT.includes(q.cat));
  if (spill.length) bad.push(`이미 두꺼운 칸에 ${spill.length}건이 들어갔다 (${spill[0].cat})`);

  if (bad.length) { ok = false; console.log('FAIL: 기능 유무·수치 비교 — ' + bad.slice(0, 4).join(' · ')); }
  else {
    say(true, `기능 유무 ${feat.length}개 · 수치 비교 ${wcmp.length}개 — 사양표 대조 통과 · 하/중만 · 얇은 칸만`);
  }
}

say(outside.length === 0, '바깥으로 나간 요청 0' + (outside.length ? ': ' + outside[0] : ''));
say(errs.length === 0, '콘솔 오류 없음' + (errs.length ? ': ' + errs[0] : ''));
console.log('\n안내문: ' + a.hint);
console.log(ok ? '\nALL PASS' : '\nSOME FAILED');

await br.close();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
