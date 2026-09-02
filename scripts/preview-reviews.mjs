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
/* **칸이 시·군(자치구가 있는 네 시는 구)이다**(2026-09-01). 합계는 영업지역과
   같게 맞춘다 — 수원 4구 합 412 · 성남 3구+광주+이천+하남 합 268 …
   그래야 「지도 합계 == 지역 막대」가 실물에서도 확인된다.
   **구를 모르는 매장 한 곳도 일부러 남긴다**(칸 이름 `수원`) — 화면이 그것을
   「어느 구인지 몰라 안 칠했다」로 밝히는지 여기서 드러난다. */
const byMap = {
  장안구: 96, 권선구: 118, 팔달구: 44, 영통구: 140, 수원: 14,   /* 14 = 구 미상 */
  수정구: 38, 중원구: 12, 분당구: 122, 광주: 41, 이천: 33, 하남: 22,
  처인구: 47, 기흥구: 121, 수지구: 88, 화성: 75,
  평택: 52, 오산: 24, 안성: 20,
  만안구: 18, 동안구: 44, 광명: 12,
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
/* ── 매장 신호(급증·급감·침묵) 모의 자료 ─────────────────────────────────────
 * **경계를 일부러 섞는다** — 이 하네스의 값어치가 거기 있다.
 *   · 급증 1곳 · 급감 1곳 · 문턱 아슬하게 못 넘는 1곳(잡음이 안 뜨는지)
 *   · 카페 위주 매장 1곳 — 「신뢰하지 마세요」 경고가 뜨는지
 *   · 작성일이 아예 없는 매장 — 침묵으로 잘못 세지 않는지
 * 실제 자료(VIRAL_JSON)를 쓰면 이 값은 덮인다. */
const sigStores = Object.keys(byStore).filter(n => byStore[n] > 0);
const byStoreMonth = {}, byStoreSrc = {}, lastPost = {};
sigStores.forEach((n, i) => {
  /* 기본은 평탄 — 신호가 안 떠야 정상이다 */
  byStoreMonth[n] = { '2026-04': 6, '2026-05': 6, '2026-06': 6, '2026-07': 6 };
  byStoreSrc[n] = { b: 70, c: 30 };
  lastPost[n] = '2026-07-28';
});
if (sigStores[0]) {                            /* 급증 — 3배 */
  byStoreMonth[sigStores[0]] = { '2026-04': 9, '2026-05': 10, '2026-06': 11, '2026-07': 30 };
}
if (sigStores[1]) {                            /* 급감 — 0.3배 */
  byStoreMonth[sigStores[1]] = { '2026-04': 20, '2026-05': 22, '2026-06': 18, '2026-07': 6 };
}
if (sigStores[2]) {                            /* 문턱 미달 — 배수는 크지만 건수가 적다 */
  byStoreMonth[sigStores[2]] = { '2026-04': 1, '2026-05': 0, '2026-06': 1, '2026-07': 5 };
}
if (sigStores[3]) {                            /* 카페 위주 — 경고가 붙어야 한다 */
  byStoreSrc[sigStores[3]] = { b: 9, c: 91 };
  byStoreMonth[sigStores[3]] = { '2026-04': 10, '2026-05': 11, '2026-06': 9, '2026-07': 26 };
}
if (sigStores[4]) lastPost[sigStores[4]] = '2025-06-02';   /* 침묵 — 15개월 */
if (sigStores[5]) lastPost[sigStores[5]] = '';             /* 작성일 없음 — 침묵으로 세면 안 된다 */

const CAFES = ['다이렉트결혼준비', '레몬테라스 [인테리어,리폼,DIY]', '부동산스터디', '맘스홀릭베이비', '지역맘카페'];
const KINDS = { 구매: 980, 설치: 640, 비교: 410, 문의: 260, 기타: 143 };

const recent = [];
const stores = Object.keys(byStore);
/* **칸이 시·군(자치구가 있는 네 시는 구)으로 갈렸다**(2026-09-01). 모의 자료도
   그 이름을 써야 지도가 실제와 같게 칠해진다 — 옛 이름을 두면 한 칸도 안 칠해지고
   그것을 화면 결함으로 오독하게 된다(오늘 색 스펙트럼에서 실제로 겪었다). */
const cellOf = { 수원: '영통구', 성남: '분당구', 용인: '기흥구', 평택: '평택', 안양: '동안구' };
for (let i = 0; i < 240; i++) {
  /* **작성일을 아는 글 = 블로그다.** 네이버 카페 검색 응답에는 작성일 필드가 아예
     없어 실측으로 `dated` 와 블로그가 1:1 로 일치한다(2,678 = 2,678).
     예전 하네스는 `i < 150` 이라 **카페 줄에도 작성일이 붙어** 실물과 달랐다 —
     그 상태로는 「작성일 모름」 표시도, 정렬 경계도 제대로 검증되지 않는다. */
  /* 출처 셋 — 블로그·카페·웹. **웹문서에도 작성일이 없다**(블로그만 준다). */
  const src = i % 5 === 0 ? '블로그' : (i % 5 === 4 ? '웹' : '카페');
  const dated = src === '블로그';
  /* **경계가 증명된 카페 글** — 글번호가 그 카페 최대치보다 커서 지난 수집 이후에
     쓰인 것이 확실한 글. 발견일을 작성일로 쓰고 화면이 ≈ 를 붙인다.
     하네스에 이 경우가 없으면 그 표시를 영영 검증하지 못한다. */
  const approx = !dated && i % 7 === 0;
  /* 11줄에 한 번은 **같은 매장의 같은 제목**이 되게 한다 — 접기 길을 지나가려면
     매장까지 같아야 한다(열쇠가 제목+매장이다). */
  const dupRow = i % 11 === 0;
  const st = dupRow ? stores[0] : stores[i % stores.length];
  let region = '수원';
  for (const r of Object.keys(byRegion)) if (byRegion[r].stores.indexOf(st) >= 0) region = r;
  const mc = region === '강원' ? ['원주', '춘천', '강릉', '속초'][i % 4] : cellOf[region];
  const d = new Date(2026, 7, 31 - (dated ? i % 90 : 0));
  const ymd = d.toISOString().slice(0, 10);
  recent.push({
    date: ymd, dated: dated || approx, approx: approx,
    store: 'Z' + (100 + stores.indexOf(st)), storeName: st, mc: mc,
    src: src,
    kind: Object.keys(KINDS)[i % 5],
    /* **같은 제목을 일부러 섞는다**(2026-09-02). 실물에는 한 블로거가 같은 제목으로
       여러 번 올린 홍보글이 158묶음 있다 — 모의에 없으면 「접기」 길을 한 번도
       지나가지 않아, 화면을 눈으로 봐도 그 자리가 비어 보인다. */
    title: (dupRow ? '[' + st + '] 위드유 웨딩박람회 일정과 혜택 안내'
                         : '[' + st + '] 혼수가전 ' + Object.keys(KINDS)[i % 5] + ' 후기 ' + (i + 1)),
    link: 'https://example.com/p/' + i,
    cafe: src === '블로그' ? '' : CAFES[i % CAFES.length],
    postdate: dated ? ymd.split('-').join('') : ''
  });
}

const DATA = {
  ok: true, at: '2026-08-31T12:00:00.000Z',
  total: 2433, day: 38, week: 214, month: 1205,
  dated: 1544, undated: 889, newToday: 41,
  minDate: '2021-04-02', maxDate: '2026-08-31',
  byMonth, byDay, byKind: KINDS, byRegion, byMap, byStore,
  bySrc: { 블로그: 812, 카페: 1300, 웹: 321 },
  byStoreSrc, byStoreMonth, lastPost,
  /* **매장별 채널** — 「지점별 분석」이 이것으로 1·2·3 순위를 그린다. 없으면 그 자리가
     늘 비어 있어 **화면을 눈으로 봐도 그 기능을 검증하지 못한다**(실물 확인에서 그랬다).
     카페 이름 + 「네이버 블로그」·「웹문서」 — 실물과 같은 모양으로 섞는다. */
  byStoreChan: (() => {
    const out = {};
    Object.keys(byStore).forEach((nm, i) => {
      const n0 = byStore[nm]; if (!n0) { out[nm] = {}; return; }
      const o2 = {};
      CAFES.forEach((c, j) => { const v = Math.round(n0 * [0.42, 0.23, 0.14, 0.08, 0.04][j]); if (v) o2[c] = v; });
      o2['네이버 블로그'] = Math.max(1, Math.round(n0 * 0.07));
      o2['웹문서'] = Math.max(0, Math.round(n0 * 0.02));
      out[nm] = o2;
    });
    return out;
  })(),
  /* 지역 → 지도 칸. **지역별 색 스펙트럼이 이 값으로 칠한다** — 없으면 칸이
     전부 기본 파랑이 되어 색이 안 붙은 것처럼 보인다(실물에서 잡았다). */
  areaCells: Object.fromEntries(Object.keys(byRegion).map(r =>
    [r, r === '강원' ? ['원주','춘천','강릉','속초']
      : (r === '수원' ? ['장안구','권선구','팔달구','영통구']
      : r === '성남' ? ['수정구','중원구','분당구','광주','이천','하남']
      : r === '용인' ? ['처인구','기흥구','수지구','화성']
      : r === '안양' ? ['만안구','동안구','광명']
      : ['평택','오산','안성'])])),
  /* **칸마다 그 칸의 매장만 담는다.** 예전에는 지역의 매장을 대표 칸 하나에
     통째로 넣어, 확대 화면에서 「평택 칸에 오산·안성 매장」이 딸려 나왔다
     (실물에서 잡았다). 매장 이름이 칸 이름으로 시작하면 그 칸으로 본다. */
  byMapStores: (() => {
    const out = {};
    for (const r of Object.keys(byRegion)) {
      const cells = r === '강원' ? ['원주', '춘천', '강릉', '속초'] : null;
      for (const st of byRegion[r].stores) {
        let cell = cells ? (cells.find((c) => st.startsWith(c)) || cells[0]) : cellOf[r];
        if (!cells) {
          const alt = ['오산', '안성', '광명', '화성', '광주', '이천', '하남'].find((c) => st.startsWith(c));
          if (alt) cell = alt;
        }
        (out[cell] || (out[cell] = [])).push(st);
      }
    }
    return out;
  })(),
  byCafe: CAFES.reduce((o, c, i) => (o[c] = 520 - i * 90, o), {}),
  stores: 65,
  cursor: 0, chainOn: false, chainErr: '',
  dupRows: 0, dupLinks: 0,
  dayUsed: 3120, dailyLimit: 20000, sweep: 10520,
  lastRun: { at: '2026-08-31T12:00:00.000Z', n: 41, done: true, reason: '' },
  /* **`pct:null` 을 하나 섞는다** — 못 잰 것과 0% 는 다른 말이라, 화면이 갈라 다루는지
     여기서 드러난다(0 으로 그리면 「LG 후기가 없다」가 된다). */
  rival: { at: '2026-08-31 03:10', rows: [
    { area: '수원', ours: 412, rival: 96, pct: 81,
      bySrc: { ours: { 블로그: 180, 카페: 190, 웹: 42 }, rival: { 블로그: 30, 카페: 55, 웹: 11 } },
      byKind: { 구매: { o: 160, r: 40 }, 설치: { o: 120, r: 20 }, 비교: { o: 90, r: 30 }, 문의: { o: 42, r: 6 } },
      byMonth: { '2026-05': { o: 40, r: 12 }, '2026-06': { o: 52, r: 9 }, '2026-07': { o: 44, r: 16 }, '2026-08': { o: 44, r: 5 } },
      /* LG 홍보 경로 — 채널·품목·표본. **일부러 한쪽만 있는 채널을 섞는다**
         (「상대 0」이 화면에서 어떻게 보이는지 봐야 한다) */
      byChan: {
        ours: { '다이렉트웨딩': 62, '레몬테라스': 41, '요즘웨딩': 30, 'blog.naver.com': 22, '맘카페수원': 14 },
        rival: { '다이렉트웨딩': 28, '수원맘 모여라': 21, '메이크마이웨딩': 12, 'lgbestshop.co.kr': 9, '입주카페': 4 }
      },
      byProd: { prod: {
        '냉장고': { o: 88, r: 30 }, 'TV': { o: 71, r: 12 }, '세탁기': { o: 60, r: 34 },
        '에어컨': { o: 44, r: 9 }, '의류관리기': { o: 12, r: 26 }, '정수기': { o: 6, r: 19 }
      }, none: { o: 131, r: 24 } },
      sample: [
        { t: 'LG 베스트샵 수원점 스타일러 구매 후기', l: 'https://cafe.naver.com/x/1', c: '다이렉트웨딩', s: '카페', d: '20260812' },
        { t: '수원 LG베스트샵 정수기 렌탈 상담 다녀왔어요', l: 'https://blog.naver.com/y/2', c: '요즘신혼', s: '블로그', d: '20260805' },
        { t: 'LG전자 베스트샵 수원 혼수 견적', l: 'https://cafe.naver.com/x/3', c: '수원맘 모여라', s: '카페', d: '' }
      ] },
    { area: '용인', ours: 331, rival: 210, pct: 61,
      bySrc: { ours: { 블로그: 150, 카페: 150, 웹: 31 }, rival: { 블로그: 80, 카페: 110, 웹: 20 } },
      byKind: { 구매: { o: 140, r: 90 }, 설치: { o: 100, r: 60 }, 비교: { o: 60, r: 40 }, 문의: { o: 31, r: 20 } },
      byMonth: { '2026-05': { o: 30, r: 20 }, '2026-06': { o: 42, r: 25 }, '2026-07': { o: 40, r: 22 }, '2026-08': { o: 38, r: 13 } } },
    { area: '성남', ours: 268, rival: 301, pct: 47,
      bySrc: { ours: { 블로그: 120, 카페: 130, 웹: 18 }, rival: { 블로그: 140, 카페: 140, 웹: 21 } },
      byKind: { 구매: { o: 110, r: 130 }, 설치: { o: 80, r: 90 }, 비교: { o: 50, r: 60 }, 문의: { o: 28, r: 21 } } },
    { area: '평택', ours: 96, rival: 88, pct: 52 },        /* 옛 회차 — 갈래 칸이 없다 */
    /* **못 잰 것(`pct:null`)을 하나 섞는다** — 0% 와 다른 말이라 화면이 갈라 다루는지
       여기서 드러난다(0 으로 그리면 「LG 후기가 없다」가 된다). */
    { area: '안양', ours: 74, rival: 120, pct: null }
    /* **강원을 일부러 뺐다** (2026-09-02). 프로덕션에서 실제로 이랬다 — 강원 한 지역이
       6분 한도에 죽어 다섯 곳만 뜨는데 **화면이 침묵해** 사장님이 세 번 물으셨다.
       빠진 지역을 이름으로 적는지 여기서 눈으로 확인한다. */
  ] },
  /* 기대 지역 이름 — 화면이 「무엇이 빠졌나」를 이것으로 낸다 */
  rivalAreaNames: ['수원', '용인', '성남', '평택', '안양', '강원'],
  rivalUnits: 11,
  /* 매니저 순위 — **네이버 건수를 안 잰 사람(null)을 하나 섞는다.** 0 으로 그리면
     「그 이름으로 글이 없다」가 되어 거짓이다. */
  mgrTop: [
    { name: '윤현식 매니저', n: 33, store: '스타필드수원', naver: 412, known: true },
    { name: '신규철 부점장', n: 17, store: '분당', naver: 96 },
    { name: '박승훈 매니저', n: 16, store: '동탄', naver: null, known: false },
    { name: '한승훈 프로', n: 14, store: '평촌', naver: 58 },
    { name: '정채승 매니저', n: 12, store: '갤러리아광교', naver: 31 }
  ],
  mgrFull: 380, mgrRows: 2433,
  /* 명부 — **0건인 사람을 반드시 섞는다.** 「등록했는데 후기에 안 나온다」가
     화면에 제대로 뜨는지는 그 경우에만 드러난다. */
  mgrList: { '갤러리아광교': ['윤현식', '신규철', '남수호', '홍길동'], '용인구성': ['김준수'] },
  mgrKnown: [
    { name: '김준수', store: '용인구성', n: 44, titles: '매니저' },
    { name: '윤현식', store: '갤러리아광교', n: 33, titles: '매니저' },
    { name: '신규철', store: '갤러리아광교', n: 20, titles: '부점장·프로' },
    { name: '남수호', store: '갤러리아광교', n: 2, titles: '프로·매니저' },
    { name: '홍길동', store: '갤러리아광교', n: 0, titles: '' }
  ],
  alias: { '신세계사우스시티': ['신사시티'], '갤러리아광교': ['갤광교', '광교갤러리아'] },
  /* **도는 중**으로 둔다 — 진행 줄·남은 시간이 실제로 그려지는지 눈으로 봐야 한다.
     11/65 매장을 12분에 훑었으니 남은 54곳은 대략 59분이다. */
  forceFull: true, fullAt: '', chainOn: true,
  cursor: 11, tail: 0,
  runAt: Date.now() - 90 * 1000,
  cycleAt: Date.now() - 12 * 60 * 1000, cycleFrom: 0,
  now: Date.now(),
  watch: CAFES.slice(0, 3).map((c, i) => ({ name: c, n: 120 - i * 40, naver: true })),
  recent,
  /* **삭제로 판정된 글도 섞는다** — 없으면 「삭제된 글 보기」와 안내를 한 번도
     지나가지 않아, 화면을 눈으로 봐도 그 자리가 비어 보인다. */
  dead: {
    n: 3, at: '2026-09-02', canSrc: ['블로그'], err: '',
    list: recent.slice(0, 3).map(function (r, i) {
      return Object.assign({}, r, { dead: true, title: '[삭제됨] ' + r.title, link: 'https://blog.naver.com/x/' + i });
    })
  }
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
  'window.__VIRAL_FIXTURE = ' + JSON.stringify(Object.assign({
  areaColors: { 수원: '#3d52db', 성남: '#9027d5', 용인: '#b62170',
               평택: '#9c4b1d', 안양: '#636613', 강원: '#176b7c' }
}, REAL)) + ';',
  'window.google = { script: { run: (function () {',
  '  var ok = null, ng = null;',
  '  var api = {',
  '    withSuccessHandler: function (f) { ok = f; return api; },',
  '    withFailureHandler: function (f) { ng = f; return api; },',
  '    getSummary: function () { setTimeout(function () { ok && ok(window.__VIRAL_FIXTURE); }, 300); },',
  '    collectReviews: function () { console.log("[preview] collectReviews (로컬이라 아무 일도 하지 않는다)"); },',
  /* **서버에 있는 함수는 여기에도 있어야 한다.** 하나라도 빠지면 화면이 그것을 부르는
     순간 콘솔 오류가 나고, 진행률 폴링은 `progBusy` 가 참으로 굳어 **그 세션 내내 죽는다**.
     그러면 이 하네스로 화면을 보는 뜻이 없어진다 — 진짜 결함이 그 오류에 묻힌다. */
  '    getProgress: function () { setTimeout(function () { ok && ok({}); }, 100); },',
  '    runRival: function () { console.log("[preview] runRival (로컬이라 아무 일도 하지 않는다)"); },',
  '    setManagerNames: function () {}, setAlias: function () {}, setupTrigger: function () {},',
  /* 색을 바꾸면 서버가 다듬은 값을 돌려준다 — 화면이 그것으로 다시 칠한다 */
  '    setAreaColors: function (m) { setTimeout(function () { ok && ok({ ok: true, colors: m && Object.keys(m).length ? m : window.__VIRAL_FIXTURE.areaColors }); }, 50); },',
  '    resetAll: function () {}, continueSweep: function () {},',
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
