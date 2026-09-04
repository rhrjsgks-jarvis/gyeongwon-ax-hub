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
import { readQB } from './lib/quiz-bank.mjs';

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

/* ══════════════════════════════════════════════════════════════════════
   ⑤ 등급 비교 — 세일즈가이드가 같은 표에 나란히 적은 형제 모델 (중)
   ══════════════════════════════════════════════════════════════════════ */
/* 2026-09-02 사장님 요청 — *"시험지출력기 문제를 세일즈가이드를 참조해서 개선해줘"*.
 *
 * ## 왜 이 갈래인가
 * 셀링포인트 문항 80개는 전부 **「이 문구를 내세우는 제품은?」 한 형태**이고 난이도가
 * 죄다 「하」다. 그런데 **매장에서 가장 많이 받는 질문은 그것이 아니다** —
 * *"SH95 랑 SH85 뭐가 달라요?"* 다. 그 지식이 문항에 **한 건도 없었다.**
 *
 * 세일즈가이드는 그 답을 이미 갖고 있다. 같은 스펙표에 등급을 나란히 적고, 노트에
 * *"SH85 — Glare Free·WOC 미적용"* 처럼 **없는 것까지 밝힌다.**
 *
 * ## 「없다」를 말할 수 있는 이유
 * CLAUDE.md 는 *"셀링포인트가 **아닌** 것은?" 형태를 만들지 않는다 — "안 내세운다"와
 * "없다"는 다른 말"* 이라고 못 박았다. 그 경고는 **다른 제품의 문구를 빌려 올 때**의
 * 이야기다. 여기서는 가이드가 **같은 표 안에서 등급별로** 적었으므로 근거가 다르다.
 *
 * ## 「등급 차이」와 「유무 차이」를 반드시 가른다
 *   「AI 축구모드 Pro」 vs 「AI 축구모드」  → **등급 차이** — 하위에도 있다. 쓰면 거짓
 *   「FloatLayer Design」 vs 없음          → **유무 차이** — 이것만 쓴다
 * 가르는 법: 상위 문구의 핵심어가 **하위 usp 어디에도 없어야** 한다.
 *
 * ## 오답은 「둘 다 가진 것」에서만 뽑는다
 * 그래야 정답이 하나로 남는다. 상위에만 있는 것이 여럿이어도(SH95 는 7개) 오답에
 * 섞이지 않으므로 안전하다.
 */
function tierQuestions(guides) {
  const out = [];
  /* **기능 이름은 usp·heads 줄의 앞 토막이다** — 가이드가 `무반사 기술 — UL 인증을 …`
     꼴로 적는다. 설명까지 통째로 보기로 쓰면 100자가 넘어 읽지 않고도 찍힌다. */
  const featOf = (u) => { const i = String(u).search(/\s[—–-]\s/); return (i > 0 ? String(u).slice(0, i) : String(u)).trim(); };
  /* 보기 길이 6~46자 — 냉장고 가이드는 특장점을 **문장으로** 적어 그대로 쓰면
     보기가 23~60자로 널뛴다. **정답만 길면 읽지 않고도 찍힌다.** */
  const fits = (f) => f.length >= 8 && f.length <= 46;
  /* 가이드가 **없다고 못 박은** 표현. 「안 내세운다」가 아니라 「없다」여야 한다. */
  const MISSING = /미적용|미지원|없음|해당\s*없|불가/;
  /* 그 모델이 **실제로 가진** 기능 이름 — 오답은 여기서만 뽑는다 */
  const featuresOf = (m) => [...new Set([...(m.usp || []), ...(m.heads || [])].map(featOf).filter(fits))];

  /* **같은 파일 · 같은 품목끼리만** 짝짓는다 — 다른 가이드끼리 견주면 근거가 둘이 되고,
     수집 시점이 달라 같은 기능을 다르게 적었을 수 있다. */
  const grp = new Map();
  for (const m of guides) {
    if (!(m.usp || []).length || !m.name) continue;
    const k = m.file + '|' + m.cat;
    if (!grp.has(k)) grp.set(k, []);
    grp.get(k).push(m);
  }

  for (const arr of grp.values()) {
    if (arr.length < 2) continue;
    for (const H of arr) {
      for (const L of arr) {
        if (H === L) continue;
        /* **이름이 같은 짝은 뺀다.** 색상·용량 변형이 같은 이름으로 여러 줄 들어 있으면
           *"둘 중 어느 것"* 을 물을 수가 없다 — 화면이 같은 이름 둘을 보기로 내민다. */
        if (flat(H.name) === flat(L.name)) continue;

        /* **정답은 추론하지 않는다 — 원문이 "미적용"이라 적은 것만 쓴다.**
           예전에는 두 등급의 usp 를 문자열로 견줘 *"H 에만 있는 줄"* 을 정답으로 삼았는데,
           그 방식은 **두 등급이 똑같은 문장을 3개 이상 공유**해야 오답이 채워진다.
           2026-09-02 에 가이드 11종을 전수로 다시 뽑으니 등급마다 문구가 제각각이라
           그 겹침이 사라져 **11 → 2문항**이 됐다. 자료가 좋아졌는데 문항이 준 것이다.
           지금은 가이드가 표에 적어 둔 **"SH85 : Glare Free - (미적용)"** 을 근거로 쓴다 —
           추론이 아니라 원문이고, 같은 자료에서 **32짝**이 성립한다(실측). */
        /* **자료 결손** — 가이드는 시리즈 대표 한 줄에 특장점을 몰아 적고 형제 줄은
           비워 두는 일이 있다(무풍콤보 갤러리 프로가 usp 32 vs 1). **한쪽이 절반도 안 되면
           견주지 않는다** — 그대로 견주면 *"이 모델에는 32가지가 없다"* 가 쏟아진다. */
        if ((L.usp || []).length * 2 < (H.usp || []).length) continue;

        const lacks = (L.notes || []).filter(n => MISSING.test(n));
        if (!lacks.length) continue;
        const lHas = featuresOf(L);
        /* **「등급 차이」와 「유무 차이」를 반드시 가른다.**
           원문이 `AI 축구모드 표 — SH85 : AI 축구모드 (AI 축구모드 Pro 미적용)` 이라 적으면
           **없는 것은 「AI 축구모드」가 아니라 「AI 축구모드 Pro」다** — SH85 도 축구모드는 갖고
           있다. 그대로 정답으로 내면 거짓이다.
           가르는 자리는 **값 칸**이다: 콜론 뒤 괄호 앞이 그 모델이 실제로 가진 값이라,
           거기에 기능 이름이 되풀이되면 **가진 것**이다.
           (`SH85 : Glare Free - (미적용)` 은 값이 `-` 라 진짜 없는 것이다.) */
        const lacksFeature = (f) => lacks.some((n) => {
          if (!n.includes(f)) return false;
          const c = n.lastIndexOf(':');
          const val = (c >= 0 ? n.slice(c + 1) : n).split('(')[0];
          return !val.includes(f);
        });
        const only = [...new Set(featuresOf(H).filter(lacksFeature))]
          /* 한쪽에서는 없다 하고 그 모델 제 문구에는 남아 있으면 근거가 서로 어긋난 것이다 */
          .filter(f => !lHas.includes(f));
        if (!only.length) continue;

        /* **오답은 L 이 실제로 가진 것에서만 뽑는다.** 그래야 *"H에는 있고 L에는 없는 것"* 의
           오답으로 성립한다(L 이 가졌으니 정답일 수 없다). **제3 모델에서 빌리지 말 것** —
           그 기능이 L 에도 있을 수 있어 *"안 내세운다 ≠ 없다"* 가 그대로 되살아난다. */
        const bad0 = lHas.filter(f => !lacksFeature(f) && !only.includes(f));
        if (bad0.length < 3) continue;

        const cat = CAT_OF_USP[H.cat] || CAT_OF_USP[L.cat];
        if (!cat) continue;                       /* 문제은행 칸을 모르면 만들지 않는다 */
        /* **한 짝에서 한 문항만** — 더 내면 보기 넷이 그대로 되풀이돼 패턴이 읽힌다 */
        const ans = only[slot(H.name + L.name, only.length)];
        /* 오답도 **짝마다 다른 자리**에서 뽑는다(늘 앞 셋이면 같은 보기가 반복된다) */
        const st = slot(H.name + L.name + '#b', bad0.length);
        const bad = [];
        for (let i = 0; i < bad0.length && bad.length < 3; i++) bad.push(bad0[(st + i) % bad0.length]);
        if (bad.length < 3) continue;

        const hn = H.name.trim(), ln = L.name.trim();
        const q = `세일즈가이드 기준, 「${hn}」에는 있지만 「${ln}」에는 없는 것은?`;
        if (seenTier.has(q) || leaksAnswer(q, ans)) continue;
        seenTier.add(q);
        const { opts, ans: at } = place(ans, bad, q);
        out.push({ cat, q, opts, ans: at, lv: '중', nm: 1, fam: 'tier',
          exp: `「${ans}」${eunn(ans)} ${hn}에만 적용된다 — 가이드가 ${ln} 에 대해 미적용이라 밝혔다. `
             + `나머지 세 보기는 ${ln} 도 갖고 있다. (근거: ${H.src} / ${L.src})` });
      }
    }
  }
  return out;
}
const seenTier = new Set();

/* ══════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════
   ⑥⑦ 삼성닷컴 현행 사양으로 **얇은 칸을 채운다** — 기능 유무(하) · 수치 비교(중)
   ══════════════════════════════════════════════════════════════════════ */
/* 2026-09-04 재고 조사에서 나온 두 가지를 함께 고친다.
 *
 * ## ① 은행이 '상'으로 쏠려 있다 — 806 / 1,187 (68%)
 * ①~⑤ 갈래 중 사양·비용이 전부 수치 암기라 그렇다. **더 넣을 것은 '하'와 '중'이다.**
 * 여기서 '상'을 한 문항도 만들지 않는 이유가 그것이다.
 *
 * ## ② 칸이 통째로 얇다 — TV 242 ↔ 전자레인지/오븐 3 (80배)
 * 그래서 **모자란 칸부터 채운다**(`FLOOR`). 이미 두꺼운 칸(TV·에어컨·냉장고)에는
 * 한 문항도 더하지 않는다 — 재료는 그쪽이 가장 많지만, 넣으면 불균형이 커진다.
 *
 * ## 「주력 모델」을 어떻게 고르나
 * **삼성닷컴 현행 목록에 있는 모델**만 쓴다(`scripts/fixtures/sec-catalog.json`, 1,896종).
 * 그 목록에 실려 있다는 것이 곧 *"지금 파는 모델"* 이라는 뜻이고, 이 저장소가 가진
 * 유일한 판매 여부 근거다. **인기·판매량으로 고르지 않는다** — 그런 자료가 없다.
 *
 * ## 지어낸 값이 한 톨도 없다
 *   ⑥ 기능 유무 … 보기 넷이 **전부 그 모델 제 사양표의 라벨**이다. 정답은 원문이
 *      「없음/미지원」이라 적은 것이고 오답은 「있음/지원」이라 적은 것이다.
 *      **모델을 가로지르지 않으므로** *"안 내세운다 ≠ 없다"* 함정이 원천적으로 없다
 *      (등급 비교 ⑤가 「미적용」 표기만 쓰는 것과 같은 근거다).
 *   ⑦ 수치 비교 … 보기 넷이 전부 실측값이고 최대가 유일할 때만 낸다. 단정하는 것이 없다.
 */
const SEC_CATALOG = path.join(ROOT, 'scripts', 'fixtures', 'sec-catalog.json');

/* 모델파인더 카테고리 → 문제은행 칸. **없는 칸을 새로 만들지 않는다** —
   냉동고·업소용 냉장고·모니터·프린터·SSD 는 문제은행에 칸이 없어 통째로 뺀다. */
const WIDE_CAT = {
  TV: 'TV', 에어컨: '에어컨', 냉장고: '냉장고', 김치냉장고: '김치냉장고', '세탁기·콤보': '세탁기',
  건조기: '건조기', 청소기: '청소기', 공기청정기: '공기청정기', 식기세척기: '식기세척기',
  '인덕션/전기레인지': '인덕션/전기레인지', 에어드레서: '에어드레서', 정수기: '정수기',
  사운드바: '사운드바', '전자레인지/오븐': '전자레인지/오븐',
  스마트폰: '휴대폰', '스마트폰(폴더블)': '휴대폰', '스마트폰(A시리즈)': '휴대폰',
  워치: '웨어러블', 버즈: '웨어러블', 핏: '웨어러블', 태블릿: '갤럭시탭', 노트북: '갤럭시북',
};

/* **채워 올릴 목표선.** 지금 은행에서 세탁기 59 · 김치냉장고 63 이 중간 크기라
   그 언저리를 목표로 잡았다. 이미 이보다 두꺼운 칸에는 더하지 않는다.
   재료가 모자라 목표선에 못 닿는 칸이 있는 것은 정상이다 — **지어내서 채우지 않는다.** */
const FLOOR = 60;

const YESV = /^(있음|지원|적용|탑재|제공)$/;
const NOV = /^(없음|미지원|미적용|미탑재|해당없음|해당 없음)$/;

/* 기능 라벨이 아닌 것 — 이름이 속성(형태·타입·방식)이면 「적용되지 않는 항목」으로
   읽기가 어색하고, 치수·색상·전원은 시험 지식이 아니다. */
const FEAT_SKIP = /형태|타입|방식|종류|색상|컬러|color|치수|크기|사이즈|무게|중량|전원|소비전력|용량|등급|재질|원산지|보증/i;

/* 라벨을 같은 뜻끼리 묶는 열쇠. **한 모델이 `SmartThings Hub 없음` 과
   `SmartThings 모바일 앱 지원 있음` 을 함께 갖는 일이 실제로 있다**(세탁기 44종).
   그대로 두면 보기 넷이 서로 모순되므로, 같은 열쇠끼리 있음·없음이 갈리면 그 열쇠를
   통째로 버린다. 부분일치로 데인 이 저장소의 규칙대로 **넉넉히 잡아 버리는 쪽**이다. */
const LABEL_ALIAS = [
  [/smartthings|스마트 ?싱스/i, 'smartthings'], [/bixby|빅스비/i, 'bixby'],
  [/wi-?fi|와이 ?파이|무선 ?랜/i, 'wifi'], [/bluetooth|블루투스/i, 'bluetooth'],
  [/dolby ?atmos|돌비 ?애트모스/i, 'atmos'],
];
/* **토막을 정렬해서 본다.** 공백만 지우면 「UV살균 LED」와 「UV LED 살균」이 다른 열쇠가
   되어 한 모델의 보기 넷에 **같은 말이 두 번** 들어간다(공기청정기에서 실제로 그랬다).
   말 순서가 달라도 같은 항목이면 같은 열쇠가 나오게 한다. */
function labelKey(k) {
  for (const [re, to] of LABEL_ALIAS) if (re.test(k)) return to;
  const toks = String(k).toLowerCase().match(/[가-힣]+|[a-z0-9]+/g) || [];
  return toks.sort().join('|') || flat(k).toLowerCase();
}

/** 삼성닷컴 현행 목록 — 「지금 파는 모델」의 유일한 근거 */
function readSecCodes() {
  return new Set(JSON.parse(fs.readFileSync(SEC_CATALOG, 'utf8')).items.map(x => x.code));
}

/* 제품군 이름이 시험 지면에 그대로 나가므로 쓸 수 없는 것은 거른다.
   `스펙 정의 (건조기)`·`기타 (현행)` 은 수집 과정의 자리표시자이고,
   묶음(`더블 패키지`·`+상단 설치 키트`)은 이 저장소가 모델파인더에서 이미 빼는 것이다. */
const BAD_GROUP = /스펙 ?정의|^기타|미확인|현행\)|✅|테스트/;
const IS_BUNDLE = /더블 ?패키지|패키지$|\+ ?상단 ?설치|\+ ?필터|세트$|먼지봉투|다회용포|리폼비|\+[^(]*케이스/;

/** 넓힌 후보 모델 — 삼성닷컴 현행 · 문제은행 칸이 있는 것 · 이름이 쓸 만한 것 */
function widePool(specs) {
  const sec = readSecCodes();
  const out = [];
  for (const p of specs.all) {
    if (!p.model || !sec.has(p.model)) continue;
    const cat = WIDE_CAT[p.cat];
    if (!cat) continue;
    const name = String(p.group || '').trim();
    if (!name || name.length > 44 || BAD_GROUP.test(name) || IS_BUNDLE.test(name)) continue;
    out.push({ cat, name, code: p.model, fx: fxOf(specs, p.model) });
  }
  out.sort((a, b) => (a.cat + a.code).localeCompare(b.cat + b.code));
  return out;
}

/** ⑥ 기능 유무 — 보기 넷이 **한 모델 제 사양표**에서 나온다 */
function featQuestions(pool) {
  const out = [], seenSet = new Set();
  for (const m of pool) {
    const yes = [], no = [], byKey = new Map();
    for (const [k, v] of m.fx) {
      const label = String(k).trim(), val = String(v).trim();
      if (!YESV.test(val) && !NOV.test(val)) continue;
      if (FEAT_SKIP.test(label) || skipLabel(label)) continue;
      /* 사양표가 여러 항목을 한 줄에 묶어 적은 것(「무풍 / 취침 / 자동」)은 보기로 못 쓴다 —
         "적용되지 않는 항목" 이 셋 중 어느 것인지가 흐려진다. */
      if (label.includes('/')) continue;
      if (label.length < 2 || label.length > 24) continue;
      const key = labelKey(label);
      if (byKey.has(key)) {                       /* 같은 뜻인데 값이 갈리면 통째로 버린다 */
        if (byKey.get(key).yes !== YESV.test(val)) byKey.get(key).bad = true;
        continue;
      }
      byKey.set(key, { label, yes: YESV.test(val), bad: false });
    }
    for (const r of byKey.values()) { if (r.bad) continue; (r.yes ? yes : no).push(r.label); }
    /* 열쇠가 서로를 품으면(`WiFi` ⊂ `WiFi 다이렉트`) 보기 넷에 함께 넣지 않는다 */
    const disjoint = (list) => {
      const keep = [];
      for (const a of list) if (!keep.some(b => {
        const x = labelKey(a), y = labelKey(b);
        return x.includes(y) || y.includes(x);
      })) keep.push(a);
      return keep;
    };
    const Y = disjoint(yes), N = disjoint(no);
    const forms = [];
    if (N.length >= 1 && Y.length >= 3) forms.push({ ans: N, bad: Y, neg: true });
    if (Y.length >= 1 && N.length >= 3) forms.push({ ans: Y, bad: N, neg: false });
    for (const f of forms) {
      const ans = f.ans[slot(m.code + (f.neg ? '#n' : '#y'), f.ans.length)];
      const st = slot(m.code + '#b' + (f.neg ? 'n' : 'y'), f.bad.length);
      const bad = [];
      for (let i = 0; i < f.bad.length && bad.length < 3; i++) {
        const c = f.bad[(st + i) % f.bad.length];
        const x = labelKey(ans), y = labelKey(c);
        if (x.includes(y) || y.includes(x)) continue;
        if (!bad.includes(c)) bad.push(c);
      }
      if (bad.length < 3) continue;
      /* 같은 사양표를 가진 형제 SKU 가 쌍둥이 문항을 만든다 — 보기 묶음으로 걸러 낸다 */
      const sig = m.cat + '|' + f.neg + '|' + [ans, ...bad].map(flat).sort().join('|');
      if (seenSet.has(sig)) continue;
      seenSet.add(sig);
      const q = `삼성 ${m.name}(${m.code})에 ${f.neg ? '적용되지 않는' : '적용되는'} 항목은?`;
      if (leaksAnswer(q, ans) || bad.some(b => leaksAnswer(q, b))) continue;
      const { opts, ans: at } = place(ans, bad, q);
      out.push({ cat: m.cat, q, opts, ans: at, lv: '하', nm: 1, fam: 'feat',
        exp: `${m.name}(${m.code}) 사양표 — ${ans}: ${f.neg ? '없음' : '있음'} / `
           + bad.map(b => `${b}: ${f.neg ? '있음' : '없음'}`).join(' · ')
           + `. 보기 넷이 모두 이 모델의 사양표 항목이다. (근거: 모델파인더 DB — 삼성닷컴 사양)` });
    }
  }
  return out;
}

/** ⑦ 수치 비교 — 넓힌 후보로 '중' 을 만든다. 값이 넷 다 실측이라 단정하는 것이 없다. */
/* **크고 작음을 물을 수 없는 라벨.** 그냥 두면 「전자파적합성 등록번호가 가장 큰 것은?」
   같은 문항이 나온다(실측) — 등록번호·인증번호는 수치가 아니라 식별자다. */
const NOT_MEASURABLE = /번호|등록|인증|규격|코드|일자|년월|연월|시리얼|버전/;
function wideCompareQuestions(pool) {
  const by = {};
  for (const m of pool) for (const [k, v] of m.fx) {
    const label = String(k).trim(), val = String(v).trim();
    if (skipLabel(label) || isColor(label) || NOT_MEASURABLE.test(label)) continue;
    if (!val || val.length > 26 || numOf(val).length !== 1) continue;
    ((by[m.cat] = by[m.cat] || {})[label] = by[m.cat][label] || []).push({ ...m, val });
  }
  const out = [];
  for (const [cat, labels] of Object.entries(by)) {
    for (const [label, rows] of Object.entries(labels)) {
      /* 같은 값·같은 이름은 한 번만 — 형제 SKU 가 보기 넷을 채우면 시험이 안 된다 */
      const uniq = [...new Map(rows.map(r => [flat(r.val), r])).values()]
        .filter((r, i, a) => a.findIndex(x => flat(x.name) === flat(r.name)) === i);
      if (uniq.length < 4) continue;
      const num = v => parseFloat((numOf(v)[0] || '0').replace(/,/g, ''));
      const st = slot(cat + label, uniq.length);
      const four = Array.from({ length: 4 }, (_, i) => uniq[(st + i) % uniq.length]);
      const vals = four.map(r => num(r.val));
      /* **단위가 다르면 크고 작음을 물을 수 없다.** 「내구성」이 한쪽은 「5 ATM」,
         한쪽은 「IP68」이라 그대로 두면 5 와 68 을 견주는 거짓 문항이 나온다(실측).
         숫자를 지운 나머지가 곧 단위이고, 넷이 같을 때만 낸다. */
      const unit = v => String(v).replace(/[\d,.]+/g, '').replace(/\s+/g, '').toLowerCase();
      if (new Set(four.map(r => unit(r.val))).size !== 1) continue;
      const top = Math.max(...vals);
      if (vals.filter(v => v === top).length !== 1) continue;   /* 최대가 둘이면 정답이 둘 */
      const q = `다음 중 ${label}${iga(label)} 가장 큰 것은?`;
      const opts = four.map(r => `${r.name}(${r.code})`);
      if (new Set(opts.map(flat)).size !== 4) continue;
      if (opts.some(o => leaksAnswer(q, o))) continue;
      /* **제품군 이름이 답을 흘린다** — 「건조 용량이 가장 큰 것은?」인데 보기가
         「AI 건조기 21kg / … 22kg」이면 사양을 몰라도 맞힌다(실측). 이긴 모델의
         이름에 그 값의 숫자가 그대로 있으면 버린다. */
      const win = four[vals.indexOf(top)];
      if ((String(win.name).match(/\d+(?:[.,]\d+)?/g) || [])
        .some(x => parseFloat(x.replace(/,/g, '')) === top)) continue;
      out.push({ cat, q, opts, ans: vals.indexOf(top), lv: '중', nm: 1, fam: 'wcmp',
        exp: four.map(r => `${r.code} ${r.val}`).join(' / ')
           + `. 가장 큰 것은 ${four[vals.indexOf(top)].code}(${four[vals.indexOf(top)].val})다. `
           + `(근거: 모델파인더 DB — 삼성닷컴 사양)` });
    }
  }
  return out;
}

/** 지금 은행이 칸마다 몇 문항인가 — **커밋된 자료만** 보고 센다.
 *  `QB` 의 손으로 쓴 문항은 `build:appbank` 가 남기는 것과 **같은 규칙**으로 센다
 *  (그쪽이 지우는 옛 가전을 여기서 세면 목표선이 어긋난다). */
function baseCounts(made) {
  const n = {};
  const bump = (cat) => { n[cat] = (n[cat] || 0) + 1; };
  const MXC = new Set(['휴대폰', '웨어러블', '갤럭시탭', '갤럭시북']);
  const POL = /정책|프로모션|인센티브|미리장만|거주중|재고 ?소진|패키지 ?포인트|구독클럽|사은품|증정|무상 ?지원|대상 ?모델/;
  for (const [cat, list] of Object.entries(readQB())) {
    for (const q of list) {
      if (q.src) continue;                                  /* 지난 회차의 생성분 */
      const blob = q.q + ' ' + q.opts.join(' ') + ' ' + (q.exp || '');
      if (!MXC.has(cat) && q.lg !== 1 && q.type !== 'policy' && !POL.test(blob)) continue;
      bump(cat);
    }
  }
  const b2b = path.join(ROOT, 'scripts', 'fixtures', 'b2b-questions.json');
  if (fs.existsSync(b2b)) for (const q of (JSON.parse(fs.readFileSync(b2b, 'utf8')).items || [])) bump(q.cat);
  for (const q of made) bump(q.cat);
  return n;
}

/** 목표선까지만 담는다 — **모자란 칸부터**. 넉넉한 칸에는 한 문항도 더하지 않는다. */
function fillThin(made, cand) {
  const room = baseCounts(made);
  const out = [];
  for (const q of cand) {
    const left = FLOOR - (room[q.cat] || 0);
    if (left <= 0) continue;
    room[q.cat] = (room[q.cat] || 0) + 1;
    out.push(q);
  }
  return out;
}

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

/** 세일즈가이드 원문 창고 — **등급 비교 문항만** 여기서 온다.
 *  `usp-models.json`(명부)은 라인업 대표만 담지만, 가이드는 **같은 표의 형제 등급**을
 *  전부 들고 있다 — SH95·SH93·SH90·SH85 처럼. 그 차이가 매장의 첫 질문이다. */
function readGuides() {
  const p = path.join(ROOT, 'scripts', 'fixtures', 'usp-guides.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).models;
}

export function buildNewModelQuestions() {
  const models = registry();
  const specs = readSpecs();
  const db = readInstallDB();
  const cost = readInstallCost();
  const made = [
    ...specQuestions(models.filter(m => m.code), specs),
    ...installQuestions(db),
    ...costQuestions(cost),
    ...uspQuestions(models),
    ...tierQuestions(readGuides()),
  ];
  /* ⑥⑦ 은 **모자란 칸만** 채운다 — 앞의 다섯 갈래를 다 만든 뒤에 남은 자리를 센다.
     '하'(기능 유무)를 먼저 담는다: 은행이 '상'으로 쏠려 있어 그쪽이 더 급하다. */
  const pool = widePool(specs);
  const items = [...made, ...fillThin(made, [...featQuestions(pool), ...wideCompareQuestions(pool)])];
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
