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
  '전화번호', '동일모델',
];

/* ## 무게·중량은 **품목이 정한다** (2026-08-25 사장님 지시)
 * 처음에는 통째로 뺐는데(*"중량을 물어보는 문항은 제외해주세요"*) 그 뒤 기준이 나왔다 —
 * *"노트북이나 휴대폰 태블릿과 같은 **휴대용 기기**와 **청소기** 등 중량이 중요한
 * 제품에만 사용해주면 됩니다. **사운드바나 큐커 이런 소형가전에서는** 중량이
 * 중요하진 않습니다."*
 *
 * **들고 다니거나 손에 쥐는 물건은 무게가 곧 셀링포인트**이고(그램 vs 갤럭시북이
 * 무게로 붙는다), 놓고 쓰는 가전은 설치하면 끝이라 상담에서 안 쓴다.
 * 그래서 카테고리로 가른다 — 라벨 이름으로는 가를 수 없다. */
const WEIGHT_OK = new Set(['갤럭시북', '갤럭시탭', '휴대폰', '웨어러블', '청소기']);
const isWeight = k => /무게|중량/.test(k);

/* ## 제품 **외형 치수**도 품목이 정한다 (2026-08-25 사장님 지시)
 * *"공기청정기 등 소형가전 등 제품의 사이즈가 필요한 가전은 빌트인 가전제품 등의
 * 설치 관련으로 필요하지, 실제 제품들의 사이즈를 시험으로 내놓을 이유는 없습니다."*
 *
 * **설치 규격이 상담 항목인 품목**에서만 낸다 — 빌트인 인덕션의 타공 규격,
 * 키친핏 냉장고의 좌우 이격처럼 **안 맞으면 설치가 안 되는** 값이다.
 * 사운드바·공기청정기는 놓기만 하면 되니 몇 mm 인지 외울 이유가 없다.
 *
 * **화면 크기는 여기 해당하지 않는다** — `화면사이즈`·`대각선`·`Display` 는 제품을
 * 고르는 기준이지 설치 규격이 아니다. 그래서 라벨로 한 번 더 가른다
 * (실제로 B2B 치수 문항 24개가 전부 화면 크기였다). */
const SIZE_OK = new Set(['냉장고', '김치냉장고', '식기세척기', '인덕션/전기레인지',
  '전자레인지/오븐', '에어컨', '세탁기', '건조기', '에어드레서']);
const isBodySize = k => /치수|크기|사이즈|외형|타공|개구부/.test(k)
  && !/화면|디스플레이|display|스크린|대각선|패널/i.test(k);
const flat = s => String(s).replace(/\s/g, '');
const skipLabel = k => SKIP.some(x => flat(k).includes(flat(x)));

const BAD_VAL = /^(NA|N\/A|-|—|해당없음|없음|\.)?$/i;
const numOf = v => (String(v).match(/\d+(?:[.,]\d+)?/g) || []);

/** 받침에 따라 `으로 / 로`. 안 가리면 `무게으로` 처럼 나간다(실제로 그랬다).
 *  **마지막 글자가 아니라 마지막 한글을 본다** — 라벨이 `운전전류 (최대)` 처럼
 *  괄호로 끝나면 `)` 를 보고 판정해 `(최대)으로` 가 된다. 사람은 `최대` 까지 읽고
 *  조사를 붙이므로 꼬리의 괄호·기호·공백을 걷어낸 뒤 판정한다. */
/** 받침에 따라 주격 조사 '이 / 가' 를 고른다. euro 와 같은 이유로 **마지막 한글**을
 *  본다 — 라벨이 '도어가드 개수' 일 때 '개수이 가장 큰' 으로 나갔다. */
const iga = w => {
  const m = String(w).match(/[가-힣](?=[^가-힣]*$)/);
  if (!m) return '이';
  return (m[0].charCodeAt(0) - 0xAC00) % 28 ? '이' : '가';
};

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
      /* 무게는 휴대용·청소기에서만 낸다 — 놓고 쓰는 가전은 상담에서 안 쓴다 */
      if (isWeight(k) && !WEIGHT_OK.has(qbCat)) { skipped.add(k + " (" + qbCat + ")"); continue; }
      /* 외형 치수는 설치 규격이 상담 항목인 품목에서만 — 화면 크기는 여기 해당 없다 */
      if (isBodySize(k) && !SIZE_OK.has(qbCat)) { skipped.add(k + " (" + qbCat + ")"); continue; }
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
  /* ── 값 비교 문항 ── `다음 중 …이 가장 큰 모델은?`
   *
   * 수치 문항이 전부 '상' 이라 은행이 상 쪽으로 쏠린다. 부정형은 '중' 이라
   * (용어정리의 *"중 = 어떻게 다른가 · 비교·부정형"*) 균형을 되돌리는데,
   * **셀링포인트 부정형은 접었다** — 아래 절에 이유를 적어 두었다.
   * 비교형은 값이 넷 다 실측이라 **단정하는 것이 없다.** */
  for (const [qbCat, labels] of Object.entries(pool)) {
    for (const [label, rows] of Object.entries(labels)) {
      const uniq = [...new Map(rows.map(r => [String(r.val).replace(/\s/g, ''), r])).values()];
      if (uniq.length < 4) continue;
      const num = v => parseFloat((numOf(v)[0] || '0').replace(/,/g, ''));
      const four = uniq.slice(0, 4);
      const vals = four.map(r => num(r.val));
      const top = Math.max(...vals);
      if (vals.filter(v => v === top).length !== 1) continue;   /* 최대가 둘이면 정답이 둘 */
      const ans = vals.indexOf(top);
      out.push({
        cat: qbCat,
        q: `다음 중 ${label}${iga(label)} 가장 큰 모델은?`,
        opts: four.map(r => `${r.name}(${r.code})`),
        ans,
        exp: four.map(r => `${r.code} ${r.val}`).join(' / ')
           + `. 가장 큰 것은 ${four[ans].code}(${four[ans].val})다. (근거: SOHO몰 제품 지면)`,
        lv: '중',            /* 용어정리의 "중 = 어떻게 다른가" */
        b2b: 1,
      });
    }
  }

  /* ── 셀링포인트 부정형은 **만들지 않는다** (2026-08-25) ──
   * 만들어 보고 접었다. `다른 모델의 셀링포인트`를 오답으로 넣었더니 —
   *   · `실용적인 용량과 심플한 디자인` 이 846L 양문형의 정답(=아닌 것)이 됐다
   *   · 모니터 문항의 정답이 `빠른 IPS` 인데 **그 모니터도 IPS 일 수 있다**
   * 방향성 문서가 못 박은 그것이다 — *"원문에서 확인하지 못한 기능은 출제하지 않는다.
   * 없는 것을 '없음'이라고 단정할 수 없다."* **"안 내세운다" 와 "없다" 는 다르다.**
   * C형(LG)이 성립하는 이유는 오답이 **상대 브랜드 고유 기술명**이라 우리 제품에
   * 없다는 것이 확인되기 때문인데, 같은 브랜드 안에서는 그 확인이 안 된다.
   * 아래는 그때 만든 것이고 **되살리지 말 것.**
   *
   * ── 접은 코드 ──
   * 
   *    * 수치 문항이 전부 '상' 이라 은행이 상 쪽으로 쏠린다(중 19%). 부정형은 '중' 이라
   *    * (용어정리의 *"중 = 어떻게 다른가 · 비교·부정형"*) 균형을 되돌린다.
   *    *
   *    * **정답이 둘이 되는 길을 두 겹으로 막는다.** 빌려온 셀링포인트가 이 제품에도
   *    * 있으면 그 문항은 무너진다 —
   *    *   ① **그 카테고리에서 딱 한 제품만 내세우는 문구**만 빌린다. 흔한 문구일수록
   *    *      이 제품에도 있을 확률이 높다(`AI 절약 모드` 처럼 여러 모델이 함께 쓴다).
   *    *   ② 빌린 문구의 **핵심어**(영문·긴 한글 토막)가 이 제품 셀링포인트나 이름에
   *    *      나오면 쓰지 않는다.
   *    * C형(`build-lg-questions`)이 LG 고유 명칭만 쓰는 것과 같은 규칙이다. * /
   *   const norm = s => String(s).replace(/\s/g, '').toLowerCase();
   *   const keyWords = s => [
   *     ...(String(s).match(/[A-Za-z][A-Za-z0-9+]{2,}/g) || []),
   *     ...(String(s).match(/[가-힣]{3,}/g) || []),
   *   ];
   *   / * `uspDescList` 에 **셀링포인트가 아닌 것**이 섞여 온다 — 실측으로 셋을 봤다:
   *        · 스펙 요약   `- 용량: 6kW, 전기타입: 단상, 에너지소비효율등급: 1`
   *        · 판매 옵션   `기본 설치비 포함` · `삼상` · `냉난방전용`
   *        · 너무 긴 홍보문
   *      그대로 쓰면 *"셀링포인트가 아닌 것은?"* 의 정답이 셀링포인트 얘기가 아니게 된다.
   *      **문장인지**로 가른다 — 콜론·앞머리 하이픈이 없고 길이가 사람 말 범위인 것만. * /
   *   const uspOk = u => {
   *     const s = String(u).trim();
   *     return s.length >= 10 && s.length <= 60 && !/[:：]/.test(s) && !/^[-–—]/.test(s)
   *       && (s.match(/,/g) || []).length < 2;
   *   };
   *   const uspBy = {};
   *   for (const info of cat.items) {
   *     const qbCat = (info.cats || []).map(c => CATMAP[c]).find(Boolean);
   *     const usp = (info.usp || []).filter(uspOk);
   *     if (!qbCat || !usp.length) continue;
   *     (uspBy[qbCat] = uspBy[qbCat] || []).push({ ...info, usp });
   *   }
   * 
   *   for (const [qbCat, prods] of Object.entries(uspBy)) {
   *     const freq = {};
   *     for (const p of prods) for (const u of new Set(p.usp.map(norm))) freq[u] = (freq[u] || 0) + 1;
   *     const rare = prods.flatMap(p => p.usp.filter(u => freq[norm(u)] === 1).map(u => ({ u, from: p.code })));
   * 
   *     for (const me of prods) {
   *       if (me.usp.length < 3) continue;
   *       const mine = norm(me.usp.join(' ') + me.name);
   *       const cands = rare.filter(r => r.from !== me.code
   *         && !keyWords(r.u).some(w => mine.includes(norm(w))));
   *       if (!cands.length) continue;
   *       / * **첫 번째를 집지 않는다** — 그러면 카테고리 안의 모든 문항이 같은 오답을
   *          쓰게 되어 두 문항만 봐도 패턴이 읽힌다(실제로 그랬다). 제품마다 다른 것을
   *          고르되 코드로 정하므로 다시 만들어도 같은 시험지가 나온다. * /
   *       const pick = cands[me.code.length % cands.length];
   *       const three = me.usp.slice(0, 3);
   *       const at = (me.code.length + me.name.length) % 4;
   *       const opts = [...three];
   *       opts.splice(at, 0, pick.u);
   *       out.push({
   *         cat: qbCat,
   *         q: `삼성 ${me.name}(${me.code})이 내세우는 셀링포인트가 아닌 것은?`,
   *         opts, ans: at,
   *         exp: `"${pick.u}"는 같은 품목의 다른 모델이 내세우는 문구다. `
   *            + `${me.name}(${me.code})의 셀링포인트는 ${three.join(' / ')}. (근거: SOHO몰 제품 지면)`,
   *         lv: '중',            / * 용어정리의 "중 = 어떻게 다른가(비교·부정형)" * /
   *         b2b: 1,
   *       });
   *     }
   *   }
   * 
   * 
   */

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
