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

const rows = [];   // 검색용 평면 목록 — 어디에 있는 값인지 함께 담아 눌러서 갈 수 있게 한다
const add = (tab, cat, sec, text) => {
  const t = norm(text);
  if (t.length > 1) rows.push({ tab, cat, sec, t: text, k: t });
};

/* ① 신규 설치 추가비 (삼성전자로지텍) */
const newInstall = src.categories.map((c) => {
  c.sections.forEach((s) =>
    s.grid.slice(s.headRows).forEach((r) => add('new', c.key, s.title, r.filter(Boolean).join(' · '))));
  return c;
});

/* ② 이전설치 (삼성케어플러스) */
src.careplus.groups.forEach((g) =>
  g.sections.forEach((s) => s.rows.forEach((r) =>
    add('care', g.key, s.title, r.note || [r.label, ...r.values].filter(Boolean).join(' · ')))));

/* ③ 설치 전 준비 */
src.safety.lines.forEach((l) => add('prep', 'safety', src.safety.title, l));
add('prep', 'safety', src.safety.title, `대상제품 ${src.safety.targets.join(' · ')}`);
add('prep', 'safety', src.safety.title, `${src.safety.ok.label} ${src.safety.ok.items.join(' · ')} ${src.safety.ok.spec}`);
add('prep', 'safety', src.safety.title, `${src.safety.no.label} ${src.safety.no.items.join(' · ')}`);

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
  imageOnly: src.imageOnly,
  index: rows,
};

fs.writeFileSync(OUT, JSON.stringify(out));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
const n1 = newInstall.reduce((n, c) => n + c.sections.reduce((m, s) => m + s.grid.length - s.headRows, 0), 0);
const n2 = src.careplus.groups.reduce((n, g) => n + g.sections.reduce((m, s) => m + s.rows.length, 0), 0);
console.log(`신규 설치 ${n1}행 · 이전설치 ${n2}행 · 검색 ${rows.length}줄 → ${OUT} (${kb}KB)`);
