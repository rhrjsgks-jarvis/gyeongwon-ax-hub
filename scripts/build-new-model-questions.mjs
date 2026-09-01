/* # 신규 44개 모델 문항 생성기 — `npm run build:nmq`
 *
 * 2026-09-01 사장님 지시 —
 *   *"기존 시험지출력기 자료에서 **가전 관련 문항은 전부 삭제**하고 그 자리에 아래
 *   신규 모델 목록만 사용해 같은 문항수·같은 유형·같은 난이도·같은 배점·같은 톤으로
 *   새 문제를 출제해줘. 특히 **설치환경을 디테일하게** 다뤄서 …"*
 *
 * ## 어디에 들어가나 — **시험 도구에만** 들어간다
 * `scripts/fixtures/b2b-questions.json` 과 같은 통로다. `public/test-app.html` 의 `QB`
 * (레벨업 챌린지 **앱**이 브라우저에서 직접 읽는 것)는 **손대지 않고**,
 * `quiz-bank.mjs` 의 `buildBank()` 가 시험 도구용 은행을 만들 때 여기서 합친다.
 * 사장님 결정이 「시험지만 교체」였다.
 *
 * ## 옛 가전 문항은 `buildBank()` 가 걸러 낸다
 * 여기서 지우지 않는다 — 앱은 그대로 써야 하기 때문이다. 걸러 내는 기준은
 * `div === 'CE' && !lg` 한 줄이고, LG 비교 문항 85개는 `lg:1` 표식이 있어 그대로 남는다
 * (사장님 확정: *"LG 비교 문항 85개는 유지"*).
 *
 * ## 지어낸 수치를 한 줄도 넣지 않는다
 * 네 갈래 전부 **커밋된 원문에서만** 값을 가져오고, 값이 없으면 그 문항을 만들지 않는다.
 *
 *   ① 모델 사양 (상·중) … 모델파인더 DB — 오답은 **같은 품목 신규 모델의 실제 값**, 모자라면 근사값
 *   ② 설치환경 (상·중·하) … 설치환경 가이드 `INSTALL_DB` — **품목 단위**로 낸다
 *   ③ 설치 비용 (상) … `install-cost.json` — 추가 자재비·이전설치·할증·거리
 *   ④ 셀링포인트 (하) … `usp-models.json` — 삼성이 공식으로 싣는 3줄
 *
 * ## 설치환경 문항은 **품목 단위**다
 * 카테고리 규격을 특정 모델의 값인 것처럼 적으면, 그 모델이 그 규격이 아닐 때
 * 화면이 거짓말을 한다. 그래서 ②는 모델코드를 쓰지 않고 *"4도어 프리스탠딩 냉장고를
 * 설치할 때"* 처럼 묻는다. 반대로 ①은 그 SKU 사양표에서 온 값이라 모델코드를 적는다.
 *
 * ## 정답이 둘이 되지 않게 — 기계가 검산한다
 * ②는 손으로 쓴 문항이지만 **정답은 원문에 있어야 하고**(`ansIn`), **오답의 수치는
 * 그 품목 원문에 없어야 한다**(`badNot`). 둘 다 빌드가 확인하고, 어긋나면 그 자리에서
 * 던진다 — 조용히 틀린 문항이 매장에 나가는 것보다 빌드가 죽는 편이 낫다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModels, readSpecs, fxOf, readInstallDB, readInstallCost, installText, ROOT } from './lib/new-model-sources.mjs';
import { INSTALL_QUESTIONS } from './fixtures/new-model-install.mjs';

const OUT = path.join(ROOT, 'scripts', 'fixtures', 'new-model-questions.json');

/* ── 품목 이름 ── 문제은행 카테고리로 맞춘다. **없는 이름을 새로 만들지 않는다** —
   `MX_CATS`·대시보드 집계가 이 이름을 보고 갈래를 정하므로, 새 칸을 만들면 조용히 샌다. */
const CAT_OF_FINDER = { '세탁기·콤보': '세탁기' };
const CAT_OF_USP = {
  TV: 'TV', 사운드바: '사운드바', 냉장고: '냉장고', 김치냉장고: '김치냉장고', 정수기: '정수기',
  에어컨: '에어컨', 공기청정기: '공기청정기', 청소기: '청소기', 로봇청소기: '청소기',
  인덕션: '인덕션/전기레인지', 식기세척기: '식기세척기',
};
/* 설치환경 가이드 24칸 → 문제은행 칸. 가이드가 더 잘게 쪼개져 있다(냉장고 8칸). */
export const CAT_OF_INSTALL = {
  '냉장고 4도어 프리스탠딩': '냉장고', '냉장고 4도어 키친핏': '냉장고', '냉장고 4도어 키친핏 Max': '냉장고',
  '냉장고 2도어': '냉장고', '냉장고 1도어': '냉장고', '냉장고 양문형': '냉장고', '냉장고 일반형': '냉장고',
  '냉장고 페어(2대 이상) 설치': '냉장고', 김치냉장고: '김치냉장고', '세탁기·콤보': '세탁기', 건조기: '건조기',
  에어컨: '에어컨', 시스템에어컨: '에어컨', TV: 'TV', 청소기: '청소기', 로봇청소기: '청소기',
  식기세척기: '식기세척기', 에어드레서: '에어드레서', 인덕션: '인덕션/전기레인지', 후드: '인덕션/전기레인지',
  '후드일체형 인덕션': '인덕션/전기레인지', 정수기: '정수기', 전자레인지: '전자레인지/오븐', 공기청정기: '공기청정기',
};

/* ── 조사 ── 받침을 안 가리면 `무게으로`·`개수이` 로 나간다(실제로 그랬다).
   **마지막 글자가 아니라 마지막 한글**을 본다 — 라벨이 `운전전류 (최대)` 처럼
   괄호로 끝나면 `)` 를 보고 판정한다. */
const lastKo = w => (String(w).match(/[가-힣](?=[^가-힣]*$)/) || [])[0] || '';
const jong = w => { const c = lastKo(w); return c ? (c.charCodeAt(0) - 0xAC00) % 28 : -1; };
export const euro = w => { const f = jong(w); return f < 0 ? '으로' : (f === 0 || f === 8) ? '로' : '으로'; };
export const iga  = w => { const f = jong(w); return f <= 0 ? '가' : '이'; };
export const eunn = w => { const f = jong(w); return f <= 0 ? '는' : '은'; };
export const eulreul = w => { const f = jong(w); return f <= 0 ? '를' : '을'; };
export const ida = w => { const f = jong(w); return f <= 0 ? '다' : '이다'; };

const numOf = v => (String(v).match(/\d+(?:[.,]\d+)?/g) || []);
const flat = s => String(s).replace(/\s/g, '');
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 값 둘이 사실상 같은가 — 문자열이 달라도 숫자 하나가 같으면 같은 말이다 */
const sameVal = (a, b) => {
  if (flat(a) === flat(b)) return true;
  const na = numOf(a), nb = numOf(b);
  return na.length === 1 && nb.length === 1 &&
    parseFloat(na[0].replace(/,/g, '')) === parseFloat(nb[0].replace(/,/g, ''));
};

/** 근사값 — 정답 숫자를 5~15% 비켜 놓는다. 20% 넘게 벌리면 눈으로 걸러진다. */
function near(val, pct) {
  const m = String(val).match(/\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const raw = m[0], n = parseFloat(raw.replace(/,/g, ''));
  if (!isFinite(n) || n === 0) return null;
  const dec = (raw.split('.')[1] || '').length;
  let x = n * (1 + pct);
  x = dec ? x.toFixed(dec) : String(Math.round(x));
  if (x === raw.replace(/,/g, '')) return null;
  if (raw.includes(',')) x = Number(x).toLocaleString('en-US');
  return String(val).replace(raw, x);
}

/** 제목이 정답을 흘리는가. 공백을 지우고 글자 사이에 `\s*` 를 넣어 찾는다 —
 *  `6 인용` 과 `6인용` 이 안 맞아 정작 찾으려던 것을 놓친다. */
const spaced = val => {
  const a = flat(val);
  return a.length < 2 ? null : new RegExp(a.split('').map(escRe).join('\\s*'), 'g');
};
export const leaksAnswer = (text, val) => {
  const re = spaced(val);
  return re ? re.test(String(text)) : false;
};
/** 이름에서 그 값을 지운다. 쓸 만한 이름이 안 남으면 null(그 문항을 버린다). */
function hideSpec(name, val) {
  const re = spaced(val);
  if (!re || !re.test(name)) return name;
  let s = String(name).replace(spaced(val), '')
    .replace(/\(\s*\)/g, ' ').replace(/\/\s*(?=[(),]|$)/g, ' ')
    .replace(/\s*,\s*(?=,|$)/g, '').replace(/\s{2,}/g, ' ').replace(/\s+([),])/g, '$1').trim();
  s = s.replace(/[\s/,·-]+$/, '').trim();
  return s.length >= 3 ? s : null;
}

/** 정답 자리를 문자열에서 결정적으로 고른다 — 다시 만들어도 같은 시험지가 나온다 */
function slot(seedStr, n) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % n;
}
/** 정답 하나 + 오답들 → {opts, ans} */
function place(ans, bad, seed) {
  const at = slot(seed, 4);
  const opts = bad.slice(0, 3);
  opts.splice(at, 0, ans);
  return { opts, ans: at };
}

/* ══════════════════════════════════════════════════════════════════════
   ① 모델 사양 — 신규 44 모델의 사양표에서
   ══════════════════════════════════════════════════════════════════════ */
/* 시험에 낼 값이 아닌 라벨. 공백을 지우고 **부분일치**로 본다 —
   `제조국`·`제조 국가` 처럼 변형이 많고, 정확 일치로 걸렀다가 샌 적이 있다. */
const SKIP_LABEL = ['제조자', '수입자', '제조국', '출시년월', '품질보증', 'A/S책임자', 'AS책임자',
  'KC인증', '인증기관', '인증번호', '인증구분', '제품인증', '제품명', '모델명', '모델번호',
  '전화번호', '동일모델', '포장', '바코드', '원산지'];
/* **색상은 묻지 않는다** — 시험 지식이 아니고, `*` 가 색상 자리인 모델이 여럿이라
   그 SKU 의 색을 정답으로 삼으면 형제 SKU 에게 거짓이 된다. */
const isColor = k => /색상|컬러|color/i.test(k);
/* 무게는 **들고 다니는 물건**에서만 — 놓고 쓰는 가전은 설치하면 끝이라 상담에서 안 쓴다
   (2026-08-25 사장님 기준 그대로: 휴대용 기기와 청소기). */
const WEIGHT_OK = new Set(['청소기']);
const isWeight = k => /무게|중량/.test(k);
/* 외형 치수는 **설치 규격이 상담 항목인 품목**에서만. 화면 크기는 여기 해당 없다 —
   제품을 고르는 기준이지 설치 규격이 아니다. */
const SIZE_OK = new Set(['냉장고', '김치냉장고', '식기세척기', '인덕션/전기레인지',
  '전자레인지/오븐', '에어컨', '세탁기', '건조기', '에어드레서', '정수기']);
const isBodySize = k => /치수|크기|사이즈|외형|타공|개구부/.test(k)
  && !/화면|디스플레이|display|스크린|대각선|패널/i.test(k);
const skipLabel = k => SKIP_LABEL.some(x => flat(k).includes(flat(x)));

const BAD_VAL = /^(NA|N\/A|-|—|해당없음|없음|\.)?$/i;

function specQuestions(models, specs) {
  /* 카테고리 → 라벨 → [{model, name, val}] */
  const pool = {};
  for (const m of models) {
    if (!m.code) continue;
    for (const [k, v] of fxOf(specs, m.code)) {
      if (skipLabel(k) || isColor(k)) continue;
      if (isWeight(k) && !WEIGHT_OK.has(m.cat)) continue;
      if (isBodySize(k) && !SIZE_OK.has(m.cat)) continue;
      const val = String(v).trim();
      if (BAD_VAL.test(val) || val.length > 26) continue;
      if (numOf(val).length !== 1) continue;      /* 숫자가 없거나 여럿이면 근사값을 못 만든다 */
      ((pool[m.cat] = pool[m.cat] || {})[k] = pool[m.cat][k] || []).push({ ...m, val });
    }
  }
  const out = [];
  for (const [cat, labels] of Object.entries(pool)) {
    for (const [label, rows] of Object.entries(labels)) {
      const uniq = [...new Map(rows.map(r => [flat(r.val), r])).values()];
      if (uniq.length < 2) continue;             /* 형제 값이 없으면 오답이 근사값뿐이라 안 낸다 */
      for (const me of uniq) {
        const bad = [];
        for (const r of uniq) {                  /* 세대 교차 — 같은 품목 신규 모델의 실제 값 */
          if (bad.length >= 3) break;
          if (!sameVal(r.val, me.val) && !bad.some(b => sameVal(b, r.val))) bad.push(r.val);
        }
        for (const p of [0.08, -0.12, 0.15, -0.06, 0.11]) {
          if (bad.length >= 3) break;
          const n = near(me.val, p);
          if (n && !sameVal(n, me.val) && !bad.some(b => sameVal(b, n))) bad.push(n);
        }
        if (bad.length < 3) continue;
        const shown = hideSpec(me.name, me.val);
        if (shown === null) continue;
        const q = `삼성 ${shown}(${me.code})의 ${label}${euro(label)} 올바른 것은?`;
        if (leaksAnswer(q, me.val)) continue;
        const { opts, ans } = place(me.val, bad, me.code + label);
        out.push({ cat, q, opts, ans, lv: '상', nm: 1, fam: 'spec',
          exp: `${me.name}(${me.code})의 ${label}${eunn(label)} ${me.val}이다. `
             + `오답은 같은 품목 신규 모델의 실제 값이거나 근사값이다. (근거: 모델파인더 DB — 카탈로그·삼성닷컴 사양)` });
      }
    }
  }
  /* 비교형 (중) — 값이 넷 다 실측이라 단정하는 것이 없다. 은행이 '상' 으로 쏠리는 것을 되돌린다. */
  for (const [cat, labels] of Object.entries(pool)) {
    for (const [label, rows] of Object.entries(labels)) {
      const uniq = [...new Map(rows.map(r => [flat(r.val), r])).values()];
      if (uniq.length < 4) continue;
      const num = v => parseFloat((numOf(v)[0] || '0').replace(/,/g, ''));
      const four = uniq.slice(0, 4), vals = four.map(r => num(r.val));
      const top = Math.max(...vals);
      if (vals.filter(v => v === top).length !== 1) continue;   /* 최대가 둘이면 정답이 둘 */
      out.push({ cat, q: `다음 신규 모델 중 ${label}${iga(label)} 가장 큰 것은?`,
        opts: four.map(r => `${r.name}(${r.code})`), ans: vals.indexOf(top), lv: '중', nm: 1, fam: 'spec',
        exp: four.map(r => `${r.code} ${r.val}`).join(' / ')
           + `. 가장 큰 것은 ${four[vals.indexOf(top)].code}(${four[vals.indexOf(top)].val})다. (근거: 모델파인더 DB)` });
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════
   ② 설치환경 — 손으로 쓰고 기계가 검산한다
   ══════════════════════════════════════════════════════════════════════ */
/** 원문에 그 말이 있는가. 공백·구분기호를 지우고 본다 — 원문이 `560 × 480mm`,
 *  보기가 `560 x 480mm` 처럼 적히는 일이 흔하다. */
/** 원문에 그 말이 있는가.
 *
 *  **부분일치로 그냥 보면 안 된다.** 이 저장소가 두 번 데인 종류다
 *  (제품 상세검색의 '무선 이어폰'이 청소기로 · AS 의 '프로서비스'가 '프로'로).
 *  여기서도 처음 돌렸을 때 `90mm` 이 `760~990mm` 안에서, `1.0m` 이 `0.04~1.0 MPa`
 *  안에서 걸려 **멀쩡한 오답이 "원문에 있다"로 잡혔다.** 그래서 세 겹으로 본다:
 *    · 공백·가운뎃점·쉼표는 **있어도 없어도 같은 말**로 본다(`560 × 480mm` ↔ `560×480mm`)
 *    · `×`·`x`·`*` 는 한 글자로 본다
 *    · 숫자로 시작하면 **앞이 숫자가 아니어야** 하고, 글자로 끝나면 **뒤가 글자가
 *      아니어야** 한다 — 다른 수치·단위의 꼬리를 물지 않게 */
function has(hay, needle) {
  const N = String(needle).trim();
  if (!N) return false;
  const body = N.split('').map(ch => {
    if (/[\s·,]/.test(ch)) return '[\\s·,]*';
    if (/[×xX*]/.test(ch)) return '[×xX*]';
    return escRe(ch);
  }).join('[\\s·,]*');
  const head = /^[0-9]/.test(N) ? '(?<![0-9.])' : '';
  const tail = /[A-Za-z]$/.test(N) ? '(?![A-Za-z])' : (/[0-9]$/.test(N) ? '(?![0-9])' : '');
  return new RegExp(head + body + tail, 'i').test(String(hay));
}

function installQuestions(db) {
  const out = [], bad = [];
  /* **한 건에서 멈추지 않고 전부 모아 보고한다.** 하나씩 던지면 고칠 때마다 다시
     돌려야 하고, 남은 것이 몇 건인지 알 수가 없다. */
  for (const it of INSTALL_QUESTIONS) {
    const why = [];
    const cat = CAT_OF_INSTALL[it.src];
    if (!cat) { bad.push(`[${it.src}] 문제은행 칸을 모른다`); continue; }
    const src = installText(db, it.src);
    /* ⓐ 정답은 원문에 있어야 한다 */
    for (const key of [].concat(it.ansIn || it.ans))
      if (!has(src, key)) why.push(`정답 근거가 원문에 없다: "${key}"`);
    /* ⓑ 일부러 빌려온 다른 라벨의 진짜 값 — 원문에 있어야 한다(오타 방지) */
    for (const key of [].concat(it.badIn || []))
      if (!has(src, key)) why.push(`badIn 이 원문에 없다: "${key}"`);
    /* ⓒ 지어낸 오답의 수치는 그 품목 원문에 없어야 한다 — 있으면 정답이 둘이 된다 */
    for (const key of [].concat(it.badNot || []))
      if (has(src, key)) why.push(`오답이 원문에 있다(정답이 둘이 된다): "${key}"`);
    if ((it.bad || []).length < 3) why.push('오답이 3개 미만이다');
    if (!(it.badNot || []).length && !(it.badIn || [])
      .length) why.push('badNot·badIn 이 둘 다 비었다 — 오답을 검산할 근거가 없다');
    if (leaksAnswer(it.q, it.ans)) why.push('제목이 정답을 흘린다');
    if (new Set([it.ans, ...it.bad].map(flat)).size !== 4) why.push('보기 넷 중 같은 것이 있다');
    if (why.length) { bad.push(`[${it.src}] ${it.q}\n    - ` + why.join('\n    - ')); continue; }
    const { opts, ans } = place(it.ans, it.bad, it.q);
    out.push({ cat, q: it.q, opts, ans, lv: it.lv, nm: 1, fam: 'install',
      exp: `${it.exp} (근거: 설치환경 가이드 「${it.src}」)` });
  }
  if (bad.length) throw new Error(`설치환경 문항 ${bad.length}건이 원문과 어긋난다:\n\n` + bad.join('\n\n'));
  return out;
}

/* ══════════════════════════════════════════════════════════════════════
   ③ 설치 비용 — 추가 자재비·이전설치·할증·거리 (상)
   ══════════════════════════════════════════════════════════════════════ */
/* 표의 한 칸을 묻고, 오답은 **같은 표의 다른 실제 금액**이다. 근사값을 쓰지 않는다 —
   금액표는 이웃 칸이 이미 헷갈리는 값이라 세대 교차만으로 충분하다.
   **신규 설치와 이전설치는 단가가 다른 항목이 있으므로** 문항이 어느 쪽인지 반드시 밝힌다
   (같은 사다리차가 신제품 설치는 무상, 이전설치는 36,300원이다). */
const MONEY = /^\d{1,3}(,\d{3})+$/;
const COST_CAT = { ac: '에어컨', dw: '식기세척기', el: '인덕션/전기레인지', rf: '냉장고',
  wm: '세탁기', ref: '냉장고', tv: 'TV', common: '에어컨' };
/* **한 묶음 안에 여러 품목의 표가 섞여 있다** — `가구장 리폼` 에는 냉장고장뿐 아니라
   식기세척기·로봇청소기·후드·인덕션·정수기 표가 함께 있고, `전기레인지 · 정수기` 도
   둘이 한 칸이다. 묶음 이름만 보고 칸을 정하면 정수기 문항이 인덕션 칸에 쌓인다. */
const SEC_CAT = [[/정수기/, '정수기'], [/식기세척기/, '식기세척기'], [/로봇청소기/, '청소기'],
  [/세탁기|건조기/, '세탁기'], [/에어드레서/, '에어드레서'], [/오븐|전자레인지/, '전자레인지/오븐'],
  [/후드|인덕션|전기레인지/, '인덕션/전기레인지'], [/냉장고/, '냉장고']];
const secCat = (title, fallback) => (SEC_CAT.find(([re]) => re.test(title)) || [, fallback])[1];

function costQuestions(cost) {
  const out = [];
  const seen = new Set();
  const push = (cat, where, label, val, siblings, kind) => {
    const bad = [];
    for (const s of siblings) {
      if (bad.length >= 3) break;
      if (s !== val && !bad.includes(s) && MONEY.test(s)) bad.push(s);
    }
    if (bad.length < 3) return;
    const q = `${where} — ${label}의 금액으로 올바른 것은?`;
    if (seen.has(q) || q.length > 120) return;
    seen.add(q);
    const A = v => v + '원';
    /* **맨 숫자로도 새는지 본다** — 표에 금액 칸이 둘이면 라벨에 다른 금액이 섞여
       들어와 제목이 정답을 흘린다(`스카이 · ~2시간 · 190,000` 이 실제로 그랬다). */
    if (leaksAnswer(q, A(val)) || leaksAnswer(q, val)) return;
    const { opts, ans } = place(A(val), bad.map(A), q);
    out.push({ cat, q, opts, ans, lv: '상', nm: 1, fam: 'cost',
      exp: `${where} 의 ${label} 은 ${A(val)}이다. 오답은 같은 표의 다른 실제 금액이다. (근거: ${kind})` });
  };

  /* **한 표에서 세 문항까지만** 낸다(`PER_SEC`). 표 하나가 40행짜리도 있어(이동 거리
     비용 30행) 전부 내면 은행이 금액 암기로 뒤덮인다 — 실제로 처음 돌렸을 때 562문항 중
     306개가 금액이었다. 사장님이 강조한 것은 설치환경이지 요금표 암기가 아니다.
     고르는 자리는 표 이름으로 결정한다 — 다시 만들어도 같은 문항이 나온다. */
  const PER_SEC = 3;
  const takeSome = (rows, sec) => {
    if (rows.length <= PER_SEC) return rows;
    const step = rows.length / PER_SEC, at = slot(sec, Math.max(1, Math.floor(step)));
    return Array.from({ length: PER_SEC }, (_, i) => rows[Math.min(rows.length - 1, Math.floor(i * step) + at)]);
  };
  /* 비교형 (중) — 값이 넷 다 실제 금액이라 단정하는 것이 없다. 은행이 '상' 으로
     쏠리는 것을 되돌린다(모델 사양 비교형과 같은 이유). */
  const compare = (cat, where, rows, kind) => {
    const four = takeSome(rows, where + '#cmp').concat(rows).slice(0, 4);
    const uniq = [...new Map(four.map(r => [r.val, r])).values()];
    if (uniq.length < 4) return;
    const num = v => parseFloat(v.replace(/,/g, ''));
    const vals = uniq.map(r => num(r.val));
    const top = Math.max(...vals);
    if (vals.filter(v => v === top).length !== 1) return;
    const q = `${where} 에서 금액이 가장 높은 항목은?`;
    if (seen.has(q) || q.length > 120) return;
    seen.add(q);
    out.push({ cat, q, opts: uniq.map(r => r.label), ans: vals.indexOf(top), lv: '중', nm: 1, fam: 'cost',
      exp: uniq.map(r => `${r.label} ${r.val}원`).join(' / ')
         + `. 가장 높은 것은 ${uniq[vals.indexOf(top)].label}(${uniq[vals.indexOf(top)].val}원)이다. (근거: ${kind})` });
  };

  /* 신규 설치 추가비 — 격자(grid) 로 온다. 머리글 줄은 headRows 로 밝혀져 있다. */
  for (const c of cost.newInstall.categories) {
    const cat = COST_CAT[c.key];
    if (!cat) continue;
    for (const sec of c.sections) {
      const head = (sec.grid || [])[(sec.headRows || 1) - 1] || [];
      const grid = (sec.grid || []).slice(sec.headRows || 1);
      /* **금액 칸이 둘인 표가 있다** — 사다리차 표는 `신제품 설치`와 `이전설치`를
         나란히 적는다(같은 사다리차가 신제품은 무상, 이전설치는 36,300원이다).
         맨 뒤 칸만 값으로 보면 라벨에 `무상` 이 섞여 들어가 **무엇을 묻는지가 거짓**이
         된다. 그래서 값 칸을 세어서 찾고, 둘 이상이면 어느 칸인지 라벨에 적는다. */
      const valCols = head.map((_, i) => i).filter(i => grid.filter(r => MONEY.test(r[i])).length >= 2);
      if (!valCols.length) continue;
      const money = grid.flatMap(r => valCols.map(i => r[i])).filter(v => MONEY.test(v));
      if (money.length < 4) continue;
      /* 금액 칸이 둘이면 그 표가 신규·이전을 함께 적는 표다 — 「신규」로 못 박으면
         `이전설치` 칸을 묻는 문항이 스스로 모순이 된다. */
      const where = `${c.name} ${valCols.length > 1 ? '설치 추가비' : '신규 설치 추가비'} 「${sec.title}」`;
      const rows = [];
      for (const r of grid) for (const i of valCols) {
        if (!MONEY.test(r[i])) continue;
        const label = [...new Set(r.filter((_, j) => !valCols.includes(j)).filter(Boolean))].join(' · ');
        if (!label) continue;
        rows.push({ val: r[i], label: label + (valCols.length > 1 && head[i] ? ` · ${head[i]}` : '') });
      }
      const sc = secCat(sec.title, cat);
      for (const r of takeSome(rows, where))
        push(sc, where, r.label, r.val, money.filter(v => v !== r.val), '삼성전자로지텍 설치 전 통합안내');
      compare(sc, where, rows, '삼성전자로지텍 설치 전 통합안내');
    }
  }
  /* 삼성케어플러스 이전설치 — 행(row) 로 온다. */
  for (const g of cost.careplus.groups) {
    const cat = COST_CAT[g.key];
    if (!cat) continue;
    /* **표가 얇으면 같은 묶음의 다른 표에서 오답을 빌린다.** 야간 할증(33,000원)처럼
       금액이 한둘뿐인 표가 있는데, 그대로 두면 사장님이 짚은 **주말·야간 할증과
       사다리차**가 문항에서 통째로 빠진다. 빌려온 값도 전부 실제 금액이고 문항이
       어느 표인지 밝히므로 정답이 흔들리지 않는다. */
    const groupMoney = g.sections.flatMap(s => (s.rows || []).flatMap(r => r.values || []))
      .filter(v => MONEY.test(v));
    for (const sec of g.sections) {
      const src = (sec.rows || []).filter(r => r.label && (r.values || []).length);
      const money = [...new Set([...src.flatMap(r => r.values).filter(v => MONEY.test(v)), ...groupMoney])];
      if (money.length < 4) continue;
      const multi = (sec.head || []).length > 2;
      const where = `삼성케어플러스 ${g.name} 「${sec.title}」`;
      const rows = [];
      for (const r of src) for (let i = 0; i < r.values.length; i++) {
        if (!MONEY.test(r.values[i])) continue;
        const col = multi ? (sec.head[i + 1] || '') : '';
        rows.push({ val: r.values[i], label: r.label + (col ? ` · ${col}` : '') });
      }
      const sc = secCat(sec.title, cat);
      for (const r of takeSome(rows, where))
        push(sc, where, r.label, r.val, money.filter(v => v !== r.val), '삼성닷컴 케어플러스 이전설치');
      compare(sc, where, rows, '삼성닷컴 케어플러스 이전설치');
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════
   ④ 셀링포인트 — 삼성이 공식으로 싣는 3줄 (하)
   ══════════════════════════════════════════════════════════════════════ */
/* **「이 문구를 내세우는 제품은?」 한 가지 형태만 낸다.**
 * 반대 형태(「이 제품의 셀링포인트가 **아닌** 것은?」)는 만들지 않는다 — 다른 모델의
 * 문구를 오답으로 빌리면 **그 기능이 이 제품에도 있을 수 있어** 정답이 둘이 된다.
 * *"안 내세운다"* 와 *"없다"* 는 다른 말이다(B2B 생성기가 같은 이유로 접은 자리다).
 *
 * 여기서는 **그 문구가 44개 안에서 딱 한 모델의 것**임을 확인하고, 나머지 세 보기의
 * `usp`·`heads`·제품명 어디에도 그 문구의 핵심어가 없는 것까지 본다. */
function uspQuestions(models) {
  const out = [];
  const key = s => flat(s).toLowerCase();
  const words = s => [...(String(s).match(/[A-Za-z][A-Za-z0-9+]{2,}/g) || []),
                      ...(String(s).match(/[가-힣]{3,}/g) || [])];
  /* `usp`(목록 API 의 셀링포인트 3줄)와 `heads`(제품 지면 특장점 제목)를 함께 쓴다.
     둘 다 삼성이 그 제품 지면에 **공식으로 싣는 문구**라 근거가 같다. */
  const linesOf = m => [
    ...(m.usp || []).map(t => ({ t, kind: '공식 셀링포인트' })),
    ...(m.heads || []).map(t => ({ t, kind: '제품 지면 특장점' })),
  ];
  const freq = {};
  for (const m of models) for (const u of new Set(linesOf(m).map(x => key(x.t)))) freq[u] = (freq[u] || 0) + 1;
  const blobOf = m => key([...(m.usp || []), ...(m.heads || []), m.name].join(' '));
  /* **흔한 낱말로 거르면 같은 품목이 통째로 빠진다.** `디자인` 은 TV 전 모델의 특장점에
     들어 있어, 그것으로 거르면 오답이 사운드바·냉장고로 밀려 문항이 시시해진다.
     그래서 **44개 안에서 드문 낱말만** 판정에 쓴다(문서빈도 4 이하). */
  const df = {};
  for (const m of models) for (const w of new Set(words([...(m.usp || []), ...(m.heads || []), m.name].join(' ')).map(key)))
    df[w] = (df[w] || 0) + 1;

  for (const m of models) {
    /* 오답은 **같은 품목의 다른 모델**이 먼저다. 품목에 모델이 셋도 안 되면
       (에어컨 2 · 김치냉장고 2 · 사운드바 2 · 정수기 1) 다른 품목에서 채운다 —
       안 그러면 그 품목은 문항이 한 건도 안 나온다. */
    const sibs = [...models.filter(x => x.cat === m.cat && x.model !== m.model),
                  ...models.filter(x => x.cat !== m.cat)];
    const mine = linesOf(m).filter(x => freq[key(x.t)] === 1 && x.t.length >= 8 && x.t.length <= 46);
    if (!mine.length) continue;
    /* 한 모델에서 **두 문항까지만** — 더 내면 같은 보기 넷이 되풀이돼 패턴이 읽힌다 */
    const chosen = [mine[slot(m.model, mine.length)], mine[slot(m.model + '#2', mine.length)]];
    for (const pick of [...new Map(chosen.map(x => [x.t, x])).values()]) {
      const ws = words(pick.t).map(key).filter(w => (df[w] || 0) <= 4);
      /* 오답 모델이 **그 문구를 통째로 갖고 있거나**(부분 문자열) **드문 핵심어를
         갖고 있으면** 쓰지 않는다 — 정답이 둘이 된다. 앞엣것이 결정적이다:
         `Micro RGB AI 엔진` 은 `Micro RGB AI 엔진 Pro` 안에 통째로 들어 있어
         정확 일치 검사만으로는 못 걸린다. */
      const pool = sibs.filter(s => {
        const blob = blobOf(s);
        return !blob.includes(key(pick.t)) && !ws.some(w => blob.includes(w));
      });
      if (pool.length < 3) continue;
      const bad = pool.slice(0, 3).map(s => `${s.name}(${s.model})`);
      const q = `삼성이 「${pick.t}」${eulreul(pick.t)} ${pick.kind}${euro(pick.kind)} 싣는 신규 모델은?`;
      if (seenUsp.has(q) || leaksAnswer(q, m.name)) continue;
      seenUsp.add(q);
      const { opts, ans } = place(`${m.name}(${m.model})`, bad, q);
      out.push({ cat: m.cat, q, opts, ans, lv: '하', nm: 1, fam: 'usp',
        exp: `「${pick.t}」${eunn(pick.t)} ${m.name}(${m.model})의 ${pick.kind}${ida(pick.kind)}. `
           + `나머지 보기는 다른 신규 모델이며 그 문구를 싣지 않는다. (근거: 삼성닷컴 목록 API uspDescList·제품 지면 특장점, 2026-09-01 수집)` });
    }
  }
  return out;
}
const seenUsp = new Set();

/* ══════════════════════════════════════════════════════════════════════ */
/** 44개 모델 명부 — 사양이 있는 것만 `code` 가 채워진다.
 *  **근접 코드의 값을 옮겨 적지 않는다** — 세대가 다르면 다른 물건이다. */
export function registry() {
  const { models } = readModels();
  const specs = readSpecs();
  return models.map(m => {
    const stem = m.model.replace(/\*+$/, '');
    let code = null;
    for (const c of [m.model, stem, m.secCode]) if (c && specs.byModel.has(c)) { code = c; break; }
    if (!code) {                                   /* 색상 자리(`*`)만 다른 SKU 를 찾는다 */
      const hit = specs.all.find(p => p.model && p.model.startsWith(stem) && p.model.length <= stem.length + 3);
      if (hit) code = hit.model;
    }
    const fcat = code ? specs.byModel.get(code).cat : null;
    const cat = (fcat && (CAT_OF_FINDER[fcat] || fcat)) || CAT_OF_USP[m.cat] || null;
    if (!cat) throw new Error(`모델 ${m.model} 의 문제은행 칸을 모른다 (usp cat=${m.cat})`);
    return { ...m, ask: m.model, code, cat };
  });
}

export function buildNewModelQuestions() {
  const models = registry();
  const specs = readSpecs();
  const db = readInstallDB();
  const cost = readInstallCost();
  const items = [
    ...specQuestions(models.filter(m => m.code), specs),
    ...installQuestions(db),
    ...costQuestions(cost),
    ...uspQuestions(models),
  ];
  /* 같은 문항이 두 번 실리면 한 시험지에 같은 것이 나올 수 있다 */
  const seen = new Set(), uniq = [];
  for (const q of items) { if (seen.has(q.q)) continue; seen.add(q.q); uniq.push(q); }
  return { items: uniq, models };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { items, models } = buildNewModelQuestions();
  fs.writeFileSync(OUT, JSON.stringify({
    _note: '2026-09-01 사장님 지시로 시험지의 가전 문항을 신규 44개 모델로 갈았다. '
         + '네 갈래(모델 사양·설치환경·설치 비용·셀링포인트) 모두 커밋된 원문에서만 값을 가져오며 지어낸 수치가 없다. '
         + 'npm run build:nmq 로 다시 만든다. 레벨업 챌린지 앱(QB)은 건드리지 않는다 — 시험 도구만 이 파일을 읽는다.',
    _source: 'scripts/fixtures/usp-models.json · public/finder-app.html(PRODUCTS) · public/finder-extra.json · '
           + 'public/install-app.html(INSTALL_DB) · public/install-cost.json',
    count: items.length, items,
  }, null, 1));
  const by = (k) => { const a = {}; for (const q of items) a[q[k]] = (a[q[k]] || 0) + 1; return a; };
  console.log(`생성 ${items.length}문항 → ${path.relative(ROOT, OUT)}`);
  console.log('갈래별:', JSON.stringify(by('fam')));
  console.log('난이도:', JSON.stringify(by('lv')));
  console.log('품목별:', Object.entries(by('cat')).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(' · '));
  console.log(`사양을 못 찾은 모델 ${models.filter(m => !m.code).length}종:`,
    models.filter(m => !m.code).map(m => m.ask).join(' · '));
}
