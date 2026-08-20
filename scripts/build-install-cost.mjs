/*
 * **설치비용 자료 만들기** — `npm run build:installcost`
 *
 * `scripts/fixtures/install-cost-source.json`(원문 격자) → `public/install-cost.json`(앱이 읽는 것).
 *
 * **왜 fixture 를 거치나** — 출처 둘 중 하나가 robots 로 막혀 있어(`delivery.selc.co.kr`)
 * 다시 받아올 수가 없다. 그래서 원문을 저장소에 굳혀 두고 여기서 파생시킨다.
 * `search-index`·`size-reps` 와 같은 구조라 `test-install-cost` 가 **"커밋된 것 == 지금
 * 재생성한 것"** 을 대조한다 — 자료를 고치고 이 빌드를 안 돌리면 검사가 먼저 깨진다.
 *
 * 여기서 더하는 것은 **검색어(kw)** 하나뿐이다. 상담사는 "사다리차" · "타공" · "앵글" 로
 * 찾지 품목부터 고르지 않는다. 표가 435행이라 눈으로 훑을 수 있는 양이 아니다.
 */
import fs from 'node:fs';

const SRC = 'scripts/fixtures/install-cost-source.json';
const OUT = 'public/install-cost.json';
const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));

/* 검색은 소문자 + 쉼표 제거로 맞춘다 — `36,300` 을 `36300` 으로 쳐도 걸려야 한다
   (통합검색 normalize 와 같은 규칙이다) */
const norm = (s) => String(s).toLowerCase().replace(/,(?=\d)/g, '').replace(/\s+/g, ' ').trim();

/*
 * 검색용 평면 목록. **행마다 고유 키(`id`)를 함께 심는다** — 검색 결과를 누르면 그 표가
 * 아니라 **그 줄로** 데려가야 하기 때문이다. 글자로 찾으면 같은 금액(`100,000`)이 여러
 * 줄에 있을 때 엉뚱한 데로 간다. 키는 `탭:품목:절번호:행번호` 라 화면이 그대로 찾아 쓴다.
 */
const rows = [];
const add = (tab, cat, sec, text, id) => {
  const t = norm(text);
  if (t.length > 1) rows.push({ tab, cat, sec, t: text, k: t, id });
};

/* ① 신규 설치 추가비 (삼성전자로지텍) */
const newInstall = src.categories.map((c) => {
  c.sections.forEach((s, si) =>
    s.grid.slice(s.headRows).forEach((r, ri) =>
      add('new', c.key, s.title, r.filter(Boolean).join(' · '), `new:${c.key}:${si}:${ri}`)));
  return c;
});

/* ② 이전설치 (삼성케어플러스) */
src.careplus.groups.forEach((g) =>
  g.sections.forEach((s, si) => s.rows.forEach((r, ri) =>
    add('care', g.key, s.title, r.note || [r.label, ...r.values].filter(Boolean).join(' · '),
      `care:${g.key}:${si}:${ri}`))));

/*
 * ③ 설치 전 준비 — 표가 아니라 카드라 카드 단위로 짚는다.
 * **그림 속 글자는 검색이 안 된다** — 그래서 옮겨 적은 문장을 반드시 색인에 넣는다.
 * "타공" · "베란다" · "아일랜드장" 으로 찾아야 하는데 그림만 있으면 0건이 된다.
 */
const item = (x) => (typeof x === 'string' ? x : x.t);
src.safety.lines.forEach((l, i) => add('prep', 'safety', src.safety.title, l, `prep:line:${i}`));
add('prep', 'safety', src.safety.title, `대상제품 ${src.safety.targets.join(' · ')}`, 'prep:targets');
add('prep', 'safety', src.safety.title,
  `${src.safety.ok.label} ${src.safety.ok.items.map(item).join(' · ')} ${src.safety.ok.spec}`, 'prep:ok');
add('prep', 'safety', src.safety.title,
  `${src.safety.no.label} ${src.safety.no.items.map(item).join(' · ')}`, 'prep:no');

(src.prepMore || []).forEach((c) => {
  add('prep', c.key, c.title, c.lead, `prep:${c.key}`);
  (c.items || []).forEach((x, i) =>
    add('prep', c.key, c.title, `${x.t} — ${x.d}`, `prep:${c.key}:${i}`));
});

const out = {
  _generated: '이 파일은 build-install-cost.mjs 가 만든다. 직접 고치지 말고 fixture 를 고칠 것.',
  collectedAt: src.collectedAt,
  newInstall: {
    title: '신규 설치 추가비',
    note: '삼성전자로지텍 「설치 전 통합안내」 기준입니다. 이전설치와 단가가 다른 항목이 있습니다.',
    source: src._source,
    categories: newInstall,
  },
  careplus: src.careplus,
  safety: src.safety,
  prepMore: src.prepMore,
  index: rows,
};

fs.writeFileSync(OUT, JSON.stringify(out));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
const n1 = newInstall.reduce((n, c) => n + c.sections.reduce((m, s) => m + s.grid.length - s.headRows, 0), 0);
const n2 = src.careplus.groups.reduce((n, g) => n + g.sections.reduce((m, s) => m + s.rows.length, 0), 0);
console.log(`신규 설치 ${n1}행 · 이전설치 ${n2}행 · 검색 ${rows.length}줄 → ${OUT} (${kb}KB)`);
