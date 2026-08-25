/* # B2B(SOHO몰) 사양 문항 생성기 — `npm run build:b2bq`
 *
 * 2026-08-25 사장님 지시 — 손으로 쓴 문항 454개가 *"읽지 않고도 찍히는"* 상태인데
 * 오답을 다시 쓰는 authoring 은 규모가 커서, **자동 생성 문항을 늘려 비중을 낮추는**
 * 길(B)을 골랐다. 재료는 SOHO몰에서 받은 432종·사양 21,767줄이다.
 *
 * ## 왜 수치 문항인가 — 세 가지가 한 번에 풀린다
 *   ① **길이 누출이 없다** — 보기가 전부 같은 꼴의 숫자라 "가장 긴 것"이 안 통한다
 *      (손작성 문항의 적중률 68% 를 만든 그 결함이 여기서는 구조적으로 안 생긴다)
 *   ② **난이도가 '상'** 이다 — 용어정리의 *"상 = 정확히 얼마인가(수치 암기)"* 이고,
 *      방향성 문서가 요구한 **상 50%** 를 채워 준다
 *   ③ 값이 전부 제품 지면 원문이라 **지어낸 것이 없다**
 *
 * ## 오답 만드는 법 — 방향성 문서의 4종 중 둘을 쓴다
 *   · **세대 교차**(문서 2번) — 같은 카테고리 **다른 모델의 진짜 값**. 가장 강력하다.
 *     실제로 헷갈리는 값이라 *"그렇게 알고 있는 사람이 있는 오해"* 가 된다.
 *   · **근사값**(문서 4번) — 형제 값이 모자랄 때만. 정답에서 5~15% 비켜난 수.
 *     20% 넘게 벌리면 눈으로 걸러진다고 문서가 적어 두었다.
 *   브랜드 교차는 C형(`build-lg-questions`)이 하고, 조건 누락은 authoring 이라 안 한다.
 *
 * ## 안 내는 것
 *   · **법정 표시** — 제조자·출시년월·KC인증·인증번호·품질보증기준. 시험에 낼 값이 아니다.
 *     B2C 때 **정확 일치로 걸렀다가 변형이 샜으므로**(제조국 · 제조 국가 …)
 *     공백을 지우고 맞춘다. 무엇을 뺐는지 화면에 찍어 눈으로 검산한다.
 *   · **라벨이 겹치는 제품의 그 라벨** — 실내기·실외기가 한 표의 두 열로 와서
 *     같은 라벨에 값이 둘이다. 그대로 내면 **정답이 둘**이 된다.
 *   · 값이 비었거나 `NA`·`-` 인 것, 너무 긴 값(24자 초과), 숫자가 없는 값. */
import fs from 'node:fs';

const CAT = 'scripts/fixtures/soho-catalog.json';
const SPECS = '.scratch/soho-specs.jsonl';
const OUT = 'scripts/fixtures/b2b-questions.json';

/* SOHO몰 카테고리 → 문제은행 카테고리. **없는 것은 문항을 만들지 않는다** —
   사이니지·프린터는 문제은행에 칸이 없고, 짐작해 넣으면 엉뚱한 데 쌓인다. */
const CATMAP = {
  refrigerators: '냉장고', 'kimchi-refrigerators': '김치냉장고', dishwashers: '식기세척기',
  'electric-range': '인덕션/전기레인지', 'micro-wave-ovens': '전자레인지/오븐',
  'air-conditioners': '에어컨', 'system-air-conditioners': '에어컨',
  'air-cleaner': '공기청정기', 'vacuum-cleaners': '청소기', 'laundry-combo': '세탁기',
  'washing-machines': '세탁기', dryers: '건조기', airdresser: '에어드레서',
  shoedresser: '에어드레서', 'water-purifier': '정수기', tv: 'TV', 'sound-bar': '사운드바',
  'galaxy-book': '갤럭시북', tablets: '갤럭시탭', monitors: '갤럭시북',
};

/* 시험에 낼 값이 아닌 라벨. 공백을 지우고 **부분일치**로 본다 —
   `제조국` · `제조 국가` 처럼 변형이 많다. */
const SKIP = ['제조자', '수입자', '제조국', '출시년월', '품질보증', 'A/S책임자', 'AS책임자',
  'KC인증', '인증기관', '인증번호', '인증구분', '제품인증', '제품명', '모델명', '색상',
  '전화번호', '동일모델'];
const flat = s => String(s).replace(/\s/g, '');
const skipLabel = k => SKIP.some(x => flat(k).includes(flat(x)));

const BAD_VAL = /^(NA|N\/A|-|—|해당없음|없음|\.)?$/i;
const numOf = v => (String(v).match(/\d+(?:[.,]\d+)?/g) || []);

/** 받침에 따라 `으로 / 로`. 안 가리면 `무게으로` 처럼 나간다(실제로 그랬다).
 *  **마지막 글자가 아니라 마지막 한글을 본다** — 라벨이 `운전전류 (최대)` 처럼
 *  괄호로 끝나면 `)` 를 보고 판정해 `(최대)으로` 가 된다. 사람은 `최대` 까지 읽고
 *  조사를 붙이므로 꼬리의 괄호·기호·공백을 걷어낸 뒤 판정한다. */
const euro = w => {
  const m = String(w).match(/[가-힣](?=[^가-힣]*$)/);
  if (!m) return '으로';                              /* 한글이 없으면(영문·숫자) 읽는 소리가 갈린다 */
  const f = (m[0].charCodeAt(0) - 0xAC00) % 28;
  return (f === 0 || f === 8) ? '로' : '으로';        /* 받침 없음·ㄹ 받침은 '로' */
};

/** 보기 둘이 **사실상 같은 값**인지. 문자열이 달라도 숫자와 단위가 같으면 같은 말이다 —
 *  `200 cd/㎡` 와 `200 cd/㎡ cd/㎡` 가 실제로 함께 나왔다(단위가 원문에서 겹쳐 적혀 있었다).
 *  방향성 문서가 *"보기 4개 중 2개가 명백히 같은 말인 문항은 즉시 버린다"* 고 한 그것이다. */
const sameVal = (a, b) => {
  const key = s => String(s).replace(/\s/g, '').replace(/(.+?)\1+$/, '$1');
  if (key(a) === key(b)) return true;
  const na = numOf(a), nb = numOf(b);
  return na.length === 1 && nb.length === 1 && parseFloat(na[0].replace(/,/g, '')) === parseFloat(nb[0].replace(/,/g, ''));
};

/** 근사값 — 정답의 숫자를 5~15% 비켜 놓는다. 형식(단위·구분)은 그대로 둔다. */
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

export function buildB2BQuestions() {
  const cat = JSON.parse(fs.readFileSync(CAT, 'utf8'));
  const byCode = new Map(cat.items.map(i => [i.code, i]));
  const recs = fs.readFileSync(SPECS, 'utf8').trim().split('\n')
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(r => r && r.specs && r.specs.length);

  /* 카테고리별로 (라벨 → [{code, name, value}]) 를 모은다. 형제 값이 오답 재료다. */
  const pool = {};
  const skipped = new Set();
  for (const r of recs) {
    const info = byCode.get(r.code);
    if (!info) continue;
    const qbCat = (info.cats || []).map(c => CATMAP[c]).find(Boolean);
    if (!qbCat) continue;
    const dup = new Set(r.dupLabels || []);
    for (const [k, v] of r.specs) {
      if (skipLabel(k)) { skipped.add(k); continue; }
      if (dup.has(k)) continue;                       /* 값이 둘 — 정답이 둘이 된다 */
      const val = String(v).trim();
      if (BAD_VAL.test(val) || val.length > 24) continue;
      if (numOf(val).length !== 1) continue;          /* 숫자가 없거나 여럿이면 근사값을 못 만든다 */
      ((pool[qbCat] = pool[qbCat] || {})[k] = pool[qbCat][k] || []).push({ code: r.code, name: info.name, val });
    }
  }

  const out = [];
  for (const [qbCat, labels] of Object.entries(pool)) {
    for (const [label, rows] of Object.entries(labels)) {
      const uniq = [...new Map(rows.map(r => [String(r.val).replace(/\s/g, ''), r])).values()];
      if (uniq.length < 2) continue;
      /* **한 라벨에서 모델 셋까지** 문항을 만든다 — 값이 다르면 다른 문항이다.
         하나만 만들면 21,767줄을 두고도 수확이 172개에 그친다. */
      for (const me of uniq.slice(0, 3)) {
        const sibs = uniq.map(r => r.val).filter(v => !sameVal(v, me.val));    /* 세대 교차 */
        const opts = [me.val];
        for (const v of sibs) {
          if (opts.length >= 4) break;
          if (!opts.some(o => sameVal(o, v))) opts.push(v);
        }
        for (const p of [0.08, -0.12, 0.15, -0.06, 0.11]) {   /* 모자라면 근사값 */
          if (opts.length >= 4) break;
          const n = near(me.val, p);
          if (n && !opts.some(o => sameVal(o, n))) opts.push(n);
        }
        if (opts.length < 4) continue;
        const at = (me.code.length + label.length) % 4;
        const four = opts.slice(1);
        four.splice(at, 0, me.val);
        out.push({
          cat: qbCat,
          q: `삼성 ${me.name}(${me.code})의 ${label}${euro(label)} 올바른 것은?`,
          opts: four, ans: at,
          exp: `${me.name}(${me.code})의 ${label}은 ${me.val}이다. `
             + `오답은 같은 품목 다른 모델의 실제 값이거나 근사값이다. (근거: SOHO몰 제품 지면)`,
          lv: '상',            /* 용어정리의 "상 = 정확히 얼마인가" */
          b2b: 1,
        });
      }
    }
  }
  return { items: out, skippedLabels: [...skipped].sort() };
}

if (process.argv[1] && process.argv[1].endsWith('build-b2b-questions.mjs')) {
  const { items, skippedLabels } = buildB2BQuestions();
  fs.writeFileSync(OUT, JSON.stringify({
    _note: 'SOHO몰(B2B) 사양에서 자동 생성한 수치 문항. 오답은 형제 모델 실제값(세대 교차) 또는 근사값. '
         + '값은 전부 제품 지면 원문이며 지어낸 것이 없다. npm run build:b2bq 로 다시 만든다.',
    _source: 'scripts/fixtures/soho-catalog.json + SOHO몰 제품 지면 사양',
    count: items.length, items,
  }, null, 1));
  const by = {};
  for (const q of items) by[q.cat] = (by[q.cat] || 0) + 1;
  console.log(`생성 ${items.length}문항 → ${OUT}`);
  console.log('카테고리별:', Object.entries(by).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(' · '));
  console.log(`법정 표시로 뺀 라벨 ${skippedLabels.length}종:`, skippedLabels.slice(0, 12).join(' · '));
}
