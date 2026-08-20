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
 *  [6] **설치 전 준비의 그림과 글** — 원문 그림 6장을 옮겨 왔다. 파일이 실제로 있는가 ·
 *      폰이 감당할 크기인가 · 그림 속 글을 글자로도 적었는가(그림 안 글자는 검색이 안 된다).
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

/* ── [4-b] 비고가 값 자리로 밀리지 않았는가 ──────────────
 * 사장님 지적(2026-08-20 — *"식기세척기처럼 다른 항목도 주석이나 비고가 있으면 표기"*)으로
 * 재 보니 케어플러스 쪽이 **한 칸씩 밀려** 있었다: `앵글 → 규격 110,000원 /
 * 금액 "설치비 + 자재비 기준…"`. 행마다 칸 수가 달라 머리글 자리로 자른 탓이다.
 * 지금은 **뒤에서** 자른다. 밀리면 값 자리에 문장이 들어오므로 그것으로 잡는다.
 */
console.log('\n[4-b] 비고가 제자리에 있는가');
let shifted = 0, notes = 0;
D.careplus.groups.forEach((g) => g.sections.forEach((s) => s.rows.forEach((r) => {
  if (!r.values) return;
  if (r.note) notes++;
  r.values.forEach((v) => {
    /* 값은 금액·무상·실비·견적이거나 짧은 조건문이다. 문장이 오면 밀린 것이다 */
    if (v && v.length > 30 && !/^시간별|^\(.*\).*\+/.test(v)) {
      shifted++; console.log(`      값 자리에 문장: ${g.name}/${s.title} · ${r.label} → ${v.slice(0, 44)}`);
    }
  });
})));
ok(shifted === 0, '이전설치 값 칸에 설명 문장이 섞이지 않았다');
ok(notes >= 50, `이전설치 비고 ${notes}건 (밀려 있던 때는 0건이었다)`);
ok(D.careplus.groups.find((g) => g.key === 'ac').sections[1].rows[0].note.includes('자재비'),
   '에어컨 앵글의 비고가 "설치비 + 자재비 기준…" 으로 붙어 있다');
ok(D.careplus.groups.find((g) => g.key === 'common').sections[0].rows
     .some((r) => r.note === '회당비용'), '사다리차 "회당비용" 이 비고 자리에 있다');
/* 표 밖 각주 — 표만 옮기면 사라지는 조건이다 */
ok(D.newInstall.categories.find((c) => c.key === 'ac').sections
     .some((s) => (s.foot || '').includes('신제품 설치 시 무상')),
   '사다리차 절의 표 밖 각주(신제품 설치 시 무상)를 담았다');

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

/* 자료에 비고가 있어도 화면이 안 그리면 소용없다 — 실제로 그려진 줄을 센다 */
let drawn = 0, feet = 0;
D.newInstall.categories.forEach((c) => { win.__cost.go('new', c.key, null);
  drawn += win.document.querySelectorAll('#body .nt').length;
  feet += win.document.querySelectorAll('#body .foot2').length; });
D.careplus.groups.forEach((g) => { win.__cost.go('care', g.key, null);
  drawn += win.document.querySelectorAll('#body .nt').length; });
ok(drawn >= 90, `비고가 화면에 ${drawn}줄 그려진다`);

/*
 * **품목마다 화면 짜임이 같아야 한다**(사장님 지적 — 식기세척기만 1열로 나왔다).
 * 절이 여럿인 품목은 카드가 두 단으로 흐르는데, 절이 하나뿐인 품목(식기세척기 47행)은
 * 흘릴 카드가 없어 오른쪽이 통째로 비었다. 큰 절은 카드가 두 단을 가로지르고
 * 그 안의 줄을 나눈다 — 그 표시(`.wide`)가 붙는지 본다.
 */
const wideOf = (tab, key) => { win.__cost.go(tab, key, null);
  return win.document.querySelectorAll('#body .sec.wide').length; };
ok(wideOf('new', 'dw') === 1, '식기세척기(절 1개·47행)가 두 단을 쓴다');
ok(wideOf('new', 'el') >= 1, '전기레인지(19행)가 두 단을 쓴다');
ok(wideOf('new', 'ac') === 0, '에어컨은 절이 여럿이라 카드 단위로 흐른다(줄은 안 나눈다)');
ok(wideOf('care', 'wash') >= 1, '이전설치 세탁기 추가설치비(46행)가 두 단을 쓴다');
ok(feet >= 1, `절 각주가 화면에 ${feet}개 그려진다`);

win.__cost.go('prep');
ok(text().includes('16A') && text().includes('4000W'), '멀티탭 기준(16A · 4000W)이 화면에 있다');
ok(text().includes('화재'), '정격 초과 시 화재 위험을 밝힌다');
ok(D.safety.targets.every((t) => text().includes(t)), '대상제품 5종을 모두 적는다');

/* ── [6] 설치 전 준비 — 그림과 글을 함께 담았는가 ────────
 * 사장님 요청으로 원문 지면의 그림 6장을 옮겨 왔다. 두 가지를 함께 지킨다:
 *  · **그림 파일이 실제로 있는가** — 없는 파일을 가리키면 화면에서 조용히 사라진다
 *  · **그림 속 글을 옮겨 적었는가** — 그림 안의 글자는 검색이 안 된다
 */
console.log('\n[6] 설치 전 준비 — 그림과 글');
const cards = D.prepMore || [];
ok(cards.length === 3, `추가 안내 카드 ${cards.length}장 (에어컨 안전 · 식기세척기 · 싱크장 리폼)`);

const imgs = [];
D.safety.ok.items.concat(D.safety.no.items).forEach((x) => x.img && imgs.push(x.img));
cards.forEach((c) => { if (c.img) imgs.push(c.img); (c.items || []).forEach((i) => i.img && imgs.push(i.img)); });
const missing = imgs.filter((p) => !fs.existsSync('public' + p));
ok(missing.length === 0, `그림 ${imgs.length}개가 모두 저장소에 있다${missing.length ? ' — 없음: ' + missing.join(', ') : ''}`);

/* 그림이 폰에서 감당할 크기인가 — 매장 전파가 약한 곳에서 지면이 멈추면 안 된다 */
const big = imgs.filter((p) => fs.statSync('public' + p).size > 600 * 1024);
ok(big.length === 0, `600KB 넘는 그림 없음${big.length ? ' — ' + big.join(', ') : ''}`);

/* 그림 속 글이 글자로도 들어와 있는가 — 상담에서 실제로 찾는 말로 확인한다 */
const blobPrep = JSON.stringify(cards);
[['타공', '싱크대 상판 타공'], ['베란다', '설치 불가 위치'], ['아일랜드', '설치 불가 위치'],
 ['55.5', '필요 공간'], ['접근금지', '에어컨 안전'], ['매립장', '싱크장 리폼']]
  .forEach(([w, why]) => ok(blobPrep.includes(w), `${why} — "${w}" 가 글로 들어 있다`));
ok(text().includes('설치가 불가합니다'), '설치 불가 조건이 화면에 나온다');
ok(!/옮기지 못했습니다/.test(text()), '"못 옮겼다" 안내가 남아 있지 않다(이제 옮겼다)');

console.log('\n[7] 검색');
const S = [['사다리차', 1], ['타공', 1], ['멀티탭', 1], ['앵글', 1], ['냉매', 1], ['공휴일', 1], ['이동 거리', 1], ['베란다', 1], ['접근금지', 1]];
S.forEach(([q, n]) => {
  const hits = win.__cost.search(q);
  ok(hits.length >= n, `"${q}" → ${hits.length}건`);
});
ok(win.__cost.search('가').length === 0, '한 글자는 조건으로 쓰지 않는다');

/*
 * **찾아 준 뒤 그 줄로 데려가는가**(2026-08-20 사장님 요청 — *"검색하면 해당 위치로 이동"*).
 * 표까지만 가고 말면 435행 중에서 다시 눈으로 찾아야 한다. `jump()` 는 첫 결과를 눌러
 * 실제로 강조된 줄의 글을 돌려주므로, **찾은 말이 그 줄에 있는지**로 확인할 수 있다.
 */
[['천공', '15,000'], ['야간 할증료', '33,000'], ['멀티탭', '멀티탭']].forEach(function ([q, want]) {
  const landed = win.__cost.jump(q);
  ok(!!landed && landed.indexOf(want) >= 0,
    `"${q}" 검색 → 그 줄로 이동 (${landed ? landed.slice(0, 40) : '이동 못 함'})`);
});

console.log('\n[8] 개인정보');
const blob = JSON.stringify(D);
ok(!/01[016-9][-\s]?\d{3,4}[-\s]?\d{4}/.test(blob), '휴대폰 번호가 없다');
ok(!/newJobID|jobId=/i.test(blob), '주문 단위 식별자가 없다');
/*
 * 이름은 **인사 자리**에서만 본다. 앞 규칙(`[가-힣]{2,3} 고객님`)은 안내 문장의
 * *"…경우 고객님께서 설치를 원하셔도…"* 를 이름으로 읽어 물었다 — 사람 이름이 아니라
 * 흔한 낱말이 앞에 온 것뿐이다. 주문 지면이 이름을 쓰는 자리는 문장 첫머리
 * (*"홍길동 고객님, 안녕하세요"*)이므로 거기만 본다. **판정할 수 없는 것을 검사하면
 * 오탐이 쌓여 검사 자체를 못 믿게 된다.**
 */
ok(!/(^|[.!?]\s*)[가-힣]{2,3}\s?고객님/m.test(blob), '인사 자리에 고객 이름이 없다');

/* fixture 가 출처와 robots 사정을 스스로 적고 있는가 — 다음 사람이 다시 파지 않게 */
ok(/robots/i.test(src._robots || ''), 'fixture 가 robots 사정을 적어 두었다');

console.log(fail ? `\n${fail}건 실패` : '\n모두 통과');
process.exit(fail ? 1 : 0);
