/*
 * **설치비용 · 사전준비 회귀 검사** — `npm run test:installcost`
 *
 * 이 모듈이 다루는 것은 **고객에게 그대로 청구되는 금액**이다. 틀리면 그 자리에서 분쟁이
 * 되므로, 다른 미니앱보다 한 겹 더 촘촘히 본다.
 *
 *  [1] **재생성 대조** — 커밋된 `public/install-cost.json` == 지금 fixture 로 다시 만든 것.
 *      (`search-index`·`size-reps` 와 같은 규칙. fixture 만 고치고 빌드를 안 돌리면 여기서 걸린다.)
 *  [2] **골든값** — 원문에서 눈으로 확인한 금액 몇 개를 못 박는다. 표가 435행이라
 *      한 칸이 밀려도 눈에 안 띈다.
 *  [3] **신규 설치 ↔ 이전설치를 섞지 않는가** — 사다리차가 신규는 무상, 이전설치는
 *      36,300원이다. 이 구분이 무너지면 상담에서 정반대로 안내하게 된다.
 *  [4] **격자가 반듯한가** — 열이 어긋난 표는 값이 옆 칸으로 밀린 것이다.
 *  [5] **출처·확인일이 화면에 나오는가** — 근거 없는 금액을 띄우지 않는다는 이 저장소의 원칙.
 *  [6] **못 옮긴 것을 못 옮겼다고 적는가** — 그림으로만 있는 안내 2건.
 *  [7] **검색** — 상담사가 실제로 치는 말로 걸리는가.
 *  [8] **개인정보가 섞이지 않았는가** — 원문이 주문 단위 지면이었다. 저장소는 public 이다.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';

let fail = 0;
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FAIL'} ${m}`); if (!c) fail++; };

/* ── [1] 재생성 대조 ─────────────────────────────────── */
console.log('[1] 재생성 대조');
const before = fs.readFileSync('public/install-cost.json', 'utf8');
execFileSync(process.execPath, ['scripts/build-install-cost.mjs'], { stdio: 'pipe' });
const after = fs.readFileSync('public/install-cost.json', 'utf8');
ok(before === after, '커밋된 install-cost.json 이 fixture 재생성 결과와 같다');

const D = JSON.parse(after);
const src = JSON.parse(fs.readFileSync('scripts/fixtures/install-cost-source.json', 'utf8'));

/* ── [2] 골든값 — 원문에서 눈으로 확인한 것만 ──────────── */
console.log('\n[2] 골든값');
const findNew = (cat, sec, label) => {
  const c = D.newInstall.categories.find((x) => x.key === cat);
  const s = c.sections.find((x) => x.title.includes(sec));
  return (s.grid.slice(s.headRows).find((r) => r.join(' ').includes(label)) || []).join(' ');
};
const GOLD_NEW = [
  ['ac', '앵글', '스텐', '180,000'],
  ['ac', '천공', '천공(타공)', '15,000'],
  ['ac', '냉매가스', 'R-32', '4,000'],
  ['ac', '배관추가', '주름배관', '24,000'],
  ['el', '전기레인지', '도시가스 막음', '10,000'],
  ['el', '전기레인지', '전용 차단기 설치', '무료'],
  ['dw', '싱크장', '매립장(코너장)', '130,000'],
];
GOLD_NEW.forEach(([c, s, l, v]) => {
  const row = findNew(c, s, l);
  ok(row.includes(v), `신규 ${c}/${s} · ${l} = ${v}${row ? '' : ' (행을 못 찾음)'}`);
});

const findCare = (grp, sec, label) => {
  const g = D.careplus.groups.find((x) => x.key === grp);
  const s = g.sections.find((x) => x.title.includes(sec));
  const r = s.rows.find((x) => (x.label || '').includes(label));
  return r ? [r.label, ...r.values].join(' ') : '';
};
const GOLD_CARE = [
  ['ac', '이전설치', '멀티형', '404,000'],
  ['ref', '이전설치', '일반형', '79,000'],
  ['wash', '이전설치', '일반형 세탁기', '76,000'],
  ['common', '야간', '야간 할증료', '33,000'],
  ['common', '이동 거리', '11-20km', '25,000'],
];
GOLD_CARE.forEach(([g, s, l, v]) => {
  const row = findCare(g, s, l);
  ok(row.includes(v), `이전설치 ${g}/${s} · ${l} = ${v}${row ? '' : ' (행을 못 찾음)'}`);
});

/* ── [3] 신규 ↔ 이전설치를 섞지 않는가 ────────────────── */
console.log('\n[3] 신규 설치와 이전설치는 단가가 다르다');
const ladNew = (() => {
  const c = D.newInstall.categories.find((x) => x.key === 'ac');
  const s = c.sections.find((x) => x.title.includes('사다리차'));
  return { s, row: s.grid.slice(s.headRows).find((r) => r[0].includes('일반 사다리차')) };
})();
ok(!!ladNew.row && ladNew.row.includes('무상'),
   '신규 설치의 일반 사다리차는 무상이다');
ok(!!ladNew.row && ladNew.row.includes('36,300'),
   '같은 표가 이전설치 36,300원도 함께 보여준다(둘을 나란히 적는다)');
ok(ladNew.s.grid.slice(0, ladNew.s.headRows).some((r) => r.join(' ').includes('신제품 설치')),
   '머리글이 「신제품 설치 / 이전설치」로 갈려 있다');
ok(findCare('common', '사다리차', '사다리차 사용').includes('36,300'),
   '이전설치 쪽 사다리차는 36,300원이다');

/* ── [4] 격자가 반듯한가 ─────────────────────────────── */
console.log('\n[4] 표 격자');
let ragged = 0, secs = 0;
D.newInstall.categories.forEach((c) => c.sections.forEach((s) => {
  secs++;
  const w = s.grid[0].length;
  if (!s.grid.every((r) => r.length === w)) { ragged++; console.log(`      어긋남: ${c.name} / ${s.title}`); }
}));
ok(ragged === 0, `신규 설치 ${secs}절의 열이 모두 반듯하다`);
let bad = 0, crows = 0;
D.careplus.groups.forEach((g) => g.sections.forEach((s) => s.rows.forEach((r) => {
  if (r.note) return;
  crows++;
  if (r.values.length !== s.head.length - 1) { bad++; console.log(`      칸 수 다름: ${g.name} / ${s.title} / ${r.label}`); }
})));
ok(bad === 0, `이전설치 ${crows}행의 값 칸 수가 머리글과 맞는다`);

/* ── [5]~[8] 화면 ────────────────────────────────────── */
console.log('\n[5] 화면');
const html = fs.readFileSync('public/install-cost-app.html', 'utf8');
/* `fetch` 대역은 **`beforeParse` 에서** 심어야 한다 — jsdom 은 생성하는 동안 인라인
   스크립트를 이미 실행하므로, 만들고 난 뒤에 넣으면 늦어서 그 자리에서 죽는다. */
const dom = new JSDOM(html, {
  runScripts: 'dangerously', url: 'https://x.test/install-cost-app.html',
  beforeParse(w) {
    w.fetch = () => Promise.resolve({ json: () => Promise.resolve(D) });
    w.scrollTo = () => {};        // jsdom 미구현 — 검사와 무관한 잡음이라 막아 둔다
  },
});
const win = dom.window;
await new Promise((r) => {
  const t = setInterval(() => { if (win.__cost && win.__cost.data) { clearInterval(t); r(); } }, 25);
  setTimeout(() => { clearInterval(t); r(); }, 8000);
});
ok(!!(win.__cost && win.__cost.data), '앱이 자료를 읽어 들였다');

const text = () => win.document.getElementById('body').textContent;
ok(text().includes('원문 보기') && text().includes(D.collectedAt),
   `출처와 확인일(${D.collectedAt})을 화면에 적는다`);

win.__cost.go('prep');
ok(text().includes('16A') && text().includes('4000W'), '멀티탭 기준(16A · 4000W)이 화면에 있다');
ok(text().includes('화재'), '정격 초과 시 화재 위험을 밝힌다');
ok(D.safety.targets.every((t) => text().includes(t)), '대상제품 5종을 모두 적는다');

console.log('\n[6] 못 옮긴 것');
ok(D.imageOnly.length === 2 && text().includes('옮기지 못했습니다'),
   '그림으로만 있는 안내 2건을 "못 옮겼다"고 밝힌다');

console.log('\n[7] 검색');
const S = [['사다리차', 1], ['타공', 1], ['멀티탭', 1], ['앵글', 1], ['냉매', 1], ['공휴일', 1], ['이동 거리', 1]];
S.forEach(([q, n]) => {
  const hits = win.__cost.search(q);
  ok(hits.length >= n, `"${q}" → ${hits.length}건`);
});
ok(win.__cost.search('가').length === 0, '한 글자는 조건으로 쓰지 않는다');

console.log('\n[8] 개인정보');
const blob = JSON.stringify(D);
ok(!/01[016-9][-\s]?\d{3,4}[-\s]?\d{4}/.test(blob), '휴대폰 번호가 없다');
ok(!/newJobID|jobId=/i.test(blob), '주문 단위 식별자가 없다');
ok(!/[가-힣]{2,3}\s?고객님/.test(blob), '고객 이름이 없다');

/* fixture 가 출처와 robots 사정을 스스로 적고 있는가 — 다음 사람이 다시 파지 않게 */
ok(/robots/i.test(src._robots || ''), 'fixture 가 robots 사정을 적어 두었다');

console.log(fail ? `\n${fail}건 실패` : '\n모두 통과');
process.exit(fail ? 1 : 0);
