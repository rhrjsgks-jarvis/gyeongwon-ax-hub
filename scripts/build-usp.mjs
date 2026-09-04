#!/usr/bin/env node
/**
 * 타사비교에 실을 **제조사 공식 셀링포인트**를 만든다.
 *   node scripts/build-compare-usp.mjs   →  public/compare-usp.json
 *
 * ## 왜 `on` 에 넣지 않는가 — **넣으면 점수가 조작된다**
 *
 * `compare-app.html` 의 기능 비교는 `scoreS += samOnly.length` 로 **`on` 의 개수가
 * 그대로 종합 스코어**가 된다. 삼성 쪽에만 공식 USP 를 부으면 점수가 근거 없이
 * 올라가고, 그 화면을 그대로 읽은 상담사는 **현장에서 반박당한다**(이 저장소가
 * "국내 일체형 최대용량" 문구로 이미 데인 그 실패다).
 *
 * 실측으로 지금도 **경쟁사 `on` 평균이 4.96 으로 삼성 4.52 보다 많다.** 이것을
 * 숫자로 뒤집는 것이 목적이 아니라, **상담사가 그대로 읽을 문장**을 주는 것이 목적이다.
 * 그래서 별도 절로 두고 점수에는 넣지 않는다.
 *
 * ## 매칭
 *
 * 우리 DB 코드와 삼성닷컴 코드가 다른 경우가 있어(이 파일이 이미 적어 둔 그 문제)
 * ①정확 일치 ②접두 일치 ③(코드가 없는 스마트폰) 이름 일치 순으로 본다.
 * **못 찾으면 담지 않는다** — 비슷한 모델의 문구를 옮겨 적으면 그 자리에서 거짓이 된다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usp = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/sec-usp.json'), 'utf8'));
const items = usp.items || [];
const html = fs.readFileSync(path.join(ROOT, 'public/compare-app.html'), 'utf8');

/* ── 타사비교 DB 를 꺼낸다 ────────────────────────────────────────────────
   정규식으로 긁지 않고 괄호를 세어 잘라 평가한다 — 원문이 조금만 바뀌어도
   정규식은 조용히 빈 값을 돌려주고, 그러면 이 파일이 통째로 비어도 아무도 모른다. */
function readDB() {
  const a = html.indexOf('const DB');
  if (a < 0) throw new Error('compare-app.html 에서 DB 를 못 찾았습니다');
  const start = html.indexOf('{', a);
  let d = 0;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (c === '{') d++;
    else if (c === '}') { d--; if (!d) return new Function('return ' + html.slice(start, i + 1))(); }
  }
  throw new Error('DB 괄호가 안 닫힙니다');
}
const DB = readDB();

const byCode = new Map();
items.forEach((x) => { if (x.code) byCode.set(String(x.code).toUpperCase(), x); });

/* 이름에서 모델코드를 뽑는다 — 대문자 두 자로 시작하는 가장 긴 덩어리 */
function codeOf(name) {
  const toks = String(name).toUpperCase().match(/[A-Z]{2}[A-Z0-9*-]{5,}/g) || [];
  return toks.sort((x, y) => y.length - x.length)[0] || '';
}
/* 이름을 견주기 위한 정규화 — 공백·괄호·용량 표기를 지운다 */
function norm(s) {
  return String(s).toLowerCase().replace(/[()[\]]/g, ' ').replace(/\s+/g, ' ').trim();
}

function match(name, cat) {
  const code = codeOf(name);
  if (code) {
    if (byCode.has(code)) return { hit: byCode.get(code), how: 'exact' };
    const c = code.replace(/[*]/g, '');
    const p = items.find((x) => {
      const xc = String(x.code || '').toUpperCase();
      return xc && (xc.startsWith(c) || c.startsWith(xc));
    });
    if (p) return { hit: p, how: 'prefix' };
    return null;
  }
  /* 코드가 없는 것(스마트폰)은 이름으로 — **모델명이 통째로 들어 있을 때만** 인정한다.
     부분일치로 느슨하게 보면 `S26` 이 `S26 Ultra` 를 물어 다른 제품 문구가 붙는다. */
  const n = norm(name).replace(/\d+gb/g, '').trim();
  const key = n.split(' ').filter((w) => w && w !== 'galaxy').join(' ');
  if (!key) return null;
  const cands = items.filter((x) => {
    const xn = norm(x.name).replace(/\d+gb/g, '');
    return xn.includes(key);
  });
  /* 후보가 여럿이면 담지 않는다 — 어느 것인지 확정할 수 없다 */
  if (cands.length !== 1) return null;
  return { hit: cands[0], how: 'name' };
}

const out = {};
const report = { exact: 0, prefix: 0, name: 0, miss: [] };
for (const [cat, v] of Object.entries(DB)) {
  for (const m of (v.samsung || [])) {
    const r = match(m.name, cat);
    if (!r || !(r.hit.usp || []).length) { report.miss.push(cat + ' · ' + m.name); continue; }
    report[r.how]++;
    const row = { usp: r.hit.usp, src: r.hit.code };
    if (r.hit.grade) { row.grade = r.hit.grade; row.reviews = r.hit.reviews; }
    if (r.how !== 'exact') row.how = r.how;
    out[m.name] = row;
  }
}

const doc = {
  _note: '삼성닷컴 공식 셀링포인트(uspDescList). 제조사가 제품마다 싣는 문구라 상담사가 그대로 읽어도 된다. '
    + '기능 비교의 `on` 과 섞지 않는다 — 그쪽은 개수가 그대로 종합 스코어라 한쪽만 늘리면 점수가 조작된다.',
  _source: 'scripts/fixtures/sec-usp.json (삼성닷컴 goodsList API)',
  _tool: 'node scripts/build-compare-usp.mjs',
  collectedAt: usp.collectedAt,
  models: out,
};
const OUT = path.join(ROOT, 'public/compare-usp.json');
fs.writeFileSync(OUT, JSON.stringify(doc, null, 1));

/* ── ② 제품 상세검색용 — 모델코드로 찾는 경량 맵 ────────────────────────────
 * finder 는 제품이 2천 종이라 **이름이 아니라 모델코드로** 찾는다. 그리고 `cat`·`name`
 * 은 finder 가 이미 갖고 있으므로 담지 않는다 — 그대로 복사하면 780KB 인데 맵으로
 * 줄이면 훨씬 작다. 키를 짧게 두는 것도 같은 이유다(`u`/`g`/`r`).
 *
 * **finder 에는 이미 카탈로그 USP(`p.usp`)가 있다.** 그것과 섞지 않는다 — 출처가
 * 다르면 화면에서도 갈라야 상담사가 어느 것을 고객에게 그대로 읽어도 되는지 안다. */
const lite = {};
for (const x of items) {
  if (!x.code) continue;
  const row = {};
  if ((x.usp || []).length) row.u = x.usp;
  if (x.grade) { row.g = x.grade; row.r = x.reviews; }
  if (Object.keys(row).length) lite[String(x.code).toUpperCase()] = row;
}
const OUT2 = path.join(ROOT, 'public/sec-usp.json');
fs.writeFileSync(OUT2, JSON.stringify({
  _note: '삼성닷컴 공식 셀링포인트·고객평점을 모델코드로 찾는 맵. u=셀링포인트 · g=평점 · r=리뷰 수. '
    + '카탈로그 USP(p.usp)와 출처가 다르므로 화면에서 갈라 보여준다.',
  _source: 'scripts/fixtures/sec-usp.json',
  collectedAt: usp.collectedAt,
  m: lite,
}));

const n = Object.keys(out).length;
const total = Object.values(DB).reduce((s, v) => s + (v.samsung || []).length, 0);
console.log('② 제품 상세검색 — ' + Object.keys(lite).length + '종 · public/sec-usp.json '
  + Math.round(fs.statSync(OUT2).size / 1024) + 'KB');
console.log();
console.log('① 타사비교 삼성 ' + total + '종 중 ' + n + '종에 공식 셀링포인트를 담았습니다');
console.log('  정확 일치 ' + report.exact + ' · 접두 ' + report.prefix + ' · 이름 ' + report.name);
console.log('  평점 있음 ' + Object.values(out).filter((x) => x.grade).length + '종');
console.log('  → public/compare-usp.json ' + Math.round(fs.statSync(OUT).size / 1024) + 'KB');
if (report.miss.length) {
  console.log();
  console.log('  못 찾은 ' + report.miss.length + '종 (담지 않았습니다 — 비슷한 모델 문구를 옮겨 적지 않습니다):');
  report.miss.forEach((s) => console.log('    ·', s.slice(0, 70)));
}
