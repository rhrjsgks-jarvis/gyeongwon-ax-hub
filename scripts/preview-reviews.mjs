/**
 * 바이럴분석기 화면을 **눈으로 보는** 하네스 — `npm run preview:viral`
 *
 * 이 화면은 Apps Script 배포본이라 **사장님만 볼 수 있었다.** 우리는 소스만 보고
 * 고치고, 붙여 넣은 뒤에야 잘못을 알았다(스크립틀릿 한 글자에 화면이 통째로 죽은
 * 적이 있다). `<?!= data ?>` 자리에 모의 JSON 을 넣으면 정적 HTML 이 되어 로컬에서
 * 그대로 열린다.
 *
 *   npm run preview:viral          → .scratch/_viral.html 만 만든다
 *   npm run preview:viral -- 8899  → 만들고 그 포트로 띄운다 (Ctrl+C 로 끈다)
 *
 * **`.scratch/` 가 아니라 여기 있는 이유.** 그쪽은 커밋되지 않아 이 PC 를 떠나면
 * 사라진다. 이 하네스는 화면을 눈으로 보는 **유일한 길**이라 저장소가 들고 있어야 한다.
 *
 * **모의 데이터에 경계를 일부러 섞는다** — 0건 칸(속초) · 작성일 미상 · `pct:null`.
 * 그래야 「0건과 관할 밖이 색으로 갈리는가」처럼 **경계에서만 드러나는 것**이 보인다.
 * 실제로 이 하네스가 네 개를 잡았다(라벨 겹침 · 이름표가 칸 밖 · renderDiag 미정의 ·
 * 진단 뒤 카드가 통째로 죽음). **소스만 봐서는 하나도 못 봤을 것이다.**
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const SRC = path.join(ROOT, 'docs/apps-script/ReviewsIndex.html');
const OUTDIR = path.join(ROOT, '.scratch');
const OUT = path.join(OUTDIR, '_viral.html');

/* 지도 칸 — 경기 5(영업지역) + 강원은 시. **0건 칸을 일부러 남긴다**(속초).
   그래야 「0건(관할)」과 「관할 밖」이 색으로 갈리는지 눈으로 확인된다. */
const byMap = {
  수원: 412, 성남: 268, 용인: 331, 평택: 96, 안양: 74,
  원주: 88, 춘천: 41, 강릉: 23, 속초: 0
};
const byRegion = {
  수원: { n: 412, stores: ['스타필드수원', '북수원', '서수원', '영통', '권선', '수원', '롯데수원', 'AK수원', '갤러리아광교'] },
  용인: { n: 331, stores: ['수지', '용인구성', '동탄', '용인기흥', '롯데동탄', '신세계사우스시티'] },
  성남: { n: 268, stores: ['분당', '성남', 'AK분당', '현대판교', '하남미사', '신세계하남', '광주', '이천증포'] },
  평택: { n: 96, stores: ['평택', '오산', '안성', '평택고덕', 'AK평택'] },
  안양: { n: 74, stores: ['평촌', '안양본', '광명소하', '롯데평촌'] },
  강원: { n: 152, stores: ['원주', '단구', '단계', 'AK원주', '춘천', '석사', '강릉', '강릉옥천', '속초'] }
};
const byStore = {};
for (const r of Object.keys(byRegion)) {
  const st = byRegion[r].stores;
  st.forEach((n, i) => { byStore[n] = Math.max(0, Math.round(byRegion[r].n / st.length * (1.6 - i * 0.22))); });
}
const byMonth = {
  '2026-03': 412, '2026-04': 587, '2026-05': 892,
  '2026-06': 741, '2026-07': 1024, '2026-08': 1205
};
const byDay = {};
for (let i = 0; i < 30; i++) {
  const d = new Date(2026, 7, 31 - i);
  byDay[d.toISOString().slice(0, 10)] = 20 + ((i * 7) % 40);   /* 고정값 — 돌릴 때마다 달라지면 눈으로 비교할 수가 없다 */
}
const CAFES = ['다이렉트결혼준비', '레몬테라스 [인테리어,리폼,DIY]', '부동산스터디', '맘스홀릭베이비', '지역맘카페'];
const KINDS = { 구매: 980, 설치: 640, 비교: 410, 문의: 260, 기타: 143 };

const recent = [];
const stores = Object.keys(byStore);
const cellOf = { 수원: '수원', 성남: '성남', 용인: '용인', 평택: '평택', 안양: '안양' };
for (let i = 0; i < 240; i++) {
  const dated = i < 150;                       /* 앞쪽은 작성일 아는 글 — 정렬·경계선 확인용 */
  const st = stores[i % stores.length];
  let region = '수원';
  for (const r of Object.keys(byRegion)) if (byRegion[r].stores.indexOf(st) >= 0) region = r;
  const mc = region === '강원' ? ['원주', '춘천', '강릉', '속초'][i % 4] : cellOf[region];
  const d = new Date(2026, 7, 31 - (dated ? i % 90 : 0));
  const ymd = d.toISOString().slice(0, 10);
  recent.push({
    date: ymd, dated: dated,
    store: 'Z' + (100 + i), storeName: st, mc: mc,
    src: i % 3 === 0 ? '블로그' : '카페',
    kind: Object.keys(KINDS)[i % 5],
    title: '[' + st + '] 혼수가전 ' + Object.keys(KINDS)[i % 5] + ' 후기 ' + (i + 1),
    link: 'https://example.com/p/' + i,
    cafe: i % 3 === 0 ? '' : CAFES[i % CAFES.length],
    postdate: dated ? ymd.split('-').join('') : ''
  });
}

const DATA = {
  ok: true, at: '2026-08-31T12:00:00.000Z',
  total: 2433, day: 38, week: 214, month: 1205,
  dated: 1544, undated: 889, newToday: 41,
  minDate: '2021-04-02', maxDate: '2026-08-31',
  byMonth, byDay, byKind: KINDS, byRegion, byMap, byStore,
  bySrc: { 블로그: 812, 카페: 1621 },
  byCafe: CAFES.reduce((o, c, i) => (o[c] = 520 - i * 90, o), {}),
  stores: 65,
  cursor: 0, chainOn: false, chainErr: '',
  dupRows: 0, dupLinks: 0,
  dayUsed: 3120, dailyLimit: 20000, sweep: 10520,
  lastRun: { at: '2026-08-31T12:00:00.000Z', n: 41, done: true, reason: '' },
  /* **`pct:null` 을 하나 섞는다** — 못 잰 것과 0% 는 다른 말이라, 화면이 갈라 다루는지
     여기서 드러난다(0 으로 그리면 「LG 후기가 없다」가 된다). */
  rival: { rows: [
    { area: '수원', ours: 412, rival: 96, pct: 81 },
    { area: '용인', ours: 331, rival: 210, pct: 61 },
    { area: '성남', ours: 268, rival: 301, pct: 47 },
    { area: '평택', ours: 96, rival: 88, pct: 52 },
    { area: '안양', ours: 74, rival: 120, pct: 38 },
    { area: '강원', ours: 152, rival: 0, pct: null }
  ] },
  /* 매니저 순위 — **네이버 건수를 안 잰 사람(null)을 하나 섞는다.** 0 으로 그리면
     「그 이름으로 글이 없다」가 되어 거짓이다. */
  mgrTop: [
    { name: '윤현식 매니저', n: 33, store: '스타필드수원', naver: 412 },
    { name: '신규철 부점장', n: 17, store: '분당', naver: 96 },
    { name: '박승훈 매니저', n: 16, store: '동탄', naver: null },
    { name: '한승훈 프로', n: 14, store: '평촌', naver: 58 },
    { name: '정채승 매니저', n: 12, store: '갤러리아광교', naver: 31 }
  ],
  mgrFull: 380, mgrRows: 2433,
  alias: { '신세계사우스시티': ['신사시티'], '갤러리아광교': ['갤광교', '광교갤러리아'] },
  forceFull: false, fullAt: '2026-08-28',
  watch: CAFES.slice(0, 3).map((c, i) => ({ name: c, n: 120 - i * 40, naver: true })),
  recent
};

/* **자료를 HTML 에 심지 않는다**(2026-08-31 구조 변경). 실물과 같은 길을 타야 하므로
   `google.script.run.getSummary()` 가 자료를 돌려주는 가짜를 심는다 — 그래야
   「뼈대가 먼저 뜨고 자료가 나중에 채워지는」 그 흐름을 눈으로 볼 수 있다.

   `VIRAL_JSON` 에 파일 경로를 주면 **실제 프로덕션 자료**로 띄운다:
     VIRAL_JSON=/tmp/viral.json npm run preview:viral -- 8899 */
const ext = process.env.VIRAL_JSON;
const SHOW = ext ? JSON.parse(fs.readFileSync(ext, 'utf8')) : DATA;
const REAL = SHOW.data || SHOW;
delete REAL.cached;

let html = fs.readFileSync(SRC, 'utf8');
if (html.indexOf('<' + '?') >= 0) {
  console.error('[preview] HTML 에 스크립틀릿이 남아 있다 — 정적 출력이라 글자로 뜬다');
  process.exit(1);
}

/* 지연을 조금 준다(300ms) — 「뼈대 먼저」가 실제로 보이는지 눈으로 확인하려면
   자료가 즉시 오면 안 된다. */
const stub = [
  '<script>',
  'window.__VIRAL_FIXTURE = ' + JSON.stringify(REAL) + ';',
  'window.google = { script: { run: (function () {',
  '  var ok = null, ng = null;',
  '  var api = {',
  '    withSuccessHandler: function (f) { ok = f; return api; },',
  '    withFailureHandler: function (f) { ng = f; return api; },',
  '    getSummary: function () { setTimeout(function () { ok && ok(window.__VIRAL_FIXTURE); }, 300); },',
  '    collectReviews: function () { console.log("[preview] collectReviews (로컬이라 아무 일도 하지 않는다)"); },',
  '    setDailyLimit: function () {}, dedupeReviews: function () {}, stopSweep: function () {}',
  '  };',
  '  return api;',
  '})() } };',
  'try { localStorage.removeItem("viral_card_order"); } catch (e) {}',
  '</script>'
].join(String.fromCharCode(10));
/* **첫 `<script>` 앞에만** 끼운다. `replace` 는 넣는 문자열의 달러+백틱을 특수 패턴으로
   해석하고(CLAUDE.md 에 적힌 그 사고), `split/join` 은 **모든** `<script>` 를 바꿔
   지도 블록에도 스텁이 들어간다. 자리를 찾아 잘라 붙이는 것이 유일하게 정확하다. */
const at = html.indexOf('<script>');
if (at < 0) { console.error('[preview] <script> 를 못 찾았다'); process.exit(1); }
html = html.slice(0, at) + stub + String.fromCharCode(10) + html.slice(at);

if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(OUT, html);
console.log('[preview] .scratch/_viral.html — ' + (html.length / 1024).toFixed(0) + 'KB'
  + (ext ? ' · 실제 자료(' + ext + ')' : ' · 모의 자료')
  + ' · 지도 칸 ' + Object.keys(REAL.byMap || {}).length
  + ' · 목록 ' + (REAL.recent || []).length + '건');

/* 포트를 주면 띄운다. 역슬래시를 쓰지 않는다(heredoc·셸이 먹는다). */
const port = Number(process.argv[2] || 0);
if (port) {
  http.createServer((q, s2) => {
    s2.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    fs.createReadStream(OUT).pipe(s2);
  }).listen(port, '127.0.0.1', () => {
    console.log('[preview] http://127.0.0.1:' + port + '/  (Ctrl+C 로 끕니다)');
  });
}
