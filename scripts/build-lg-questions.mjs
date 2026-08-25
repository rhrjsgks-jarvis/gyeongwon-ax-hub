/* # LG 비교 문항(C형) 생성기 — `npm run build:lgq`
 *
 * 2026-08-25 사장님 지시 — *"엘지문제가 통으로 나오는 게 아니라 삼성과 엘지의 비교문항으로
 * 보기에 엘지 내용이 섞여있거나 하는 방식으로 헷갈리게 … 삼성 000제품의 특징이 아닌 것은?
 * 하고 엘지 보기가 들어가 있게"*.
 *
 * 그 전까지 LG 문항 68개 중 **48개가 "LG 단독 지식"** 이었다 — *"LG 코드제로 A9 의 최대
 * 흡입력으로 올바른 것은?"* 처럼 상담사에게 **LG 스펙을 외우라**고 묻고 있었다.
 * 사장님이 원한 형태(삼성 주어 + 보기에 LG)는 68개 중 **1개**뿐이었다.
 *
 * ## 왜 손으로 안 쓰고 생성기인가
 * 근거가 `public/compare-app.html` 의 DB(삼성·LG 모델별 셀링포인트 `on[]`)에 이미 있다.
 * 손으로 옮겨 적으면 타사비교 값이 바뀔 때 문항만 옛 값으로 남는다 — 이 저장소가 허브 카드
 * 개수·앱 버전·비교표 값에서 반복해서 데인 종류다. 그래서 **비교표에서 자동으로 만든다.**
 *
 * ## "정답이 둘" 을 막는 두 겹
 * ① **고유 명칭만 쓴다**(`scripts/fixtures/lg-only-features.json` 의 '확정').
 *    `on[]` 은 셀링포인트 목록이지 기능 전체 목록이 아니라, "삼성 on[] 에 없다" 가
 *    "삼성에 없다" 를 뜻하지 않는다. 실제로 이 규칙 없이 돌렸더니 `냉방능력 9,800W`·
 *    `32GB LPDDR5x`·`OLED 패널` 을 정답으로 뽑았고 **셋 다 삼성에도 있다.**
 *    비교표에서 '없음'(실제로 없다)과 '미공개'(확인 못 했다)를 가르는 것과 같은 규칙이다.
 * ② **겹침 가드** — 확정 목록에 있어도 그 카테고리 삼성 `on[]` 과 겹치면 **던진다.**
 *    목록이 늘 때 조용히 통과하는 것을 막는 안전망이다.
 *
 * ## 질문에 모델코드를 넣지 않는다
 * `levelOf()` 가 모델코드를 보고 '상'(수치 암기)으로 매기는데 이 문항이 묻는 것은
 * 코드가 아니라 기능이다. 코드를 넣으면 난이도가 통째로 잘못 잡힌다.
 *
 * ## 표식 `lg:1`
 * C형은 **시험지 지면에 'LG' 글자가 한 자도 없는 것이 의도**다(그래야 헷갈린다).
 * 그래서 문자열로는 셀 수 없어 문항이 스스로 밝힌다 — `levelOf()` 가 `q.lv` 를
 * 우선하는 것과 같은 방식이다. 다시 돌리면 `lg:1` 을 전부 갈아 끼우므로 몇 번 돌려도 같다. */
import fs from 'node:fs';
import { LG_RE } from './lib/quiz-bank.mjs';

const SRC = 'public/test-app.html';
const CMP = 'public/compare-app.html';
const FIX = 'scripts/fixtures/lg-only-features.json';

/* 비교표 카테고리 → 문제은행 카테고리. 이름이 서로 다르고 1:N 이다(청소기·로봇청소기 → 청소기).
   **빠뜨리면 그 카테고리가 조용히 0문항이 된다** — 아래에서 카테고리별 생성 수를 찍는다. */
const CAT = {
  '냉장고': '냉장고', '세탁기·콤보': '세탁기', '건조기': '건조기', '에어컨': '에어컨',
  'TV': 'TV', '청소기': '청소기', '로봇청소기': '청소기', '식기세척기': '식기세척기',
  '김치냉장고': '김치냉장고', '에어드레서': '에어드레서', '인덕션': '인덕션/전기레인지',
  '공기청정기': '공기청정기', '정수기': '정수기', '노트북': '갤럭시북',
};

const han = s => s.match(/[가-힣]+/g) || [];
const eng = s => (s.match(/[A-Za-z0-9]+/g) || []).map(w => w.toLowerCase());

/** 같은 기술을 다르게 부른 것인가.
 *  한글은 3글자만 이어져도 의심한다 — LG '24시간 자동정온' ↔ 삼성 '미세자동정온'.
 *  영문·숫자는 단어가 통째로 같을 때만 본다 — 부분문자열로 보면 LG 'ThinQ' 가
 *  삼성 'SmartThings' 와 "Thi" 로 걸려 멀쩡한 오답이 날아간다. */
function overlap(a, b) {
  const eb = eng(b);
  for (const w of eng(a)) if (w.length >= 2 && eb.includes(w)) return w;
  const hb = han(b);
  for (const s of han(a)) {
    for (let n = 3; n <= s.length; n++) {
      for (let i = 0; i + n <= s.length; i++) {
        const p = s.slice(i, i + n);
        if (hb.some(t => t.includes(p))) return p;
      }
    }
  }
  return null;
}

/** 받침에 따라 조사를 고른다. 기능 이름이 `ThinQ 연동`(받침 ㅇ)·`트루스팀`(받침 없음)
 *  처럼 갈려서, 하나로 박으면 해설이 "매직스페이스은" 처럼 나간다.
 *  한글로 안 끝나면(영문·숫자) 읽는 소리가 갈리므로 받침 없는 쪽으로 둔다. */
function josa(word, withFinal, withoutFinal) {
  const c = String(word).trim().slice(-1).charCodeAt(0);
  const isHan = c >= 0xAC00 && c <= 0xD7A3;
  return isHan && (c - 0xAC00) % 28 ? withFinal : withoutFinal;
}

/** 괄호와 꼬리 모델코드를 뗀 제품 이름 */
const plain = n => n.replace(/\s*\([^)]*\)\s*/g, ' ')
  .replace(/\s+[A-Z][A-Z0-9-]{5,}\s*$/, '').replace(/\s+/g, ' ').trim();

/** 브랜드가 이미 이름에 있으면 또 붙이지 않는다 — "LG LG 올레드 evo" 가 된다 */
const lgName = n => (/^LG\b/.test(plain(n)) ? plain(n) : `LG ${plain(n)}`);

/* ## 제품은 **모델명으로** 가리킨다 (2026-08-25 사장님 지시)
 * *"식기세척기 12인용 보다는 모델명으로 시험문제를 내주는 것이 좋습니다"* ·
 * *"모델명을 넣어주셔야 할 것 같습니다"*.
 *
 * 그 전에는 `14인용` 같은 스펙만 붙였는데 **삼성 식기세척기 14인용이 3종**이라 이름이
 * 겹쳤고, 겹치는 것은 버리고 있었다(그래서 문항이 줄었다). 모델코드는 유일하므로
 * 버릴 일이 없고 상담사가 어느 제품인지 정확히 안다.
 *
 * **코드가 있는 자리가 두 가지다** — 대부분은 이름 끝(`… DW80F73Y1UEWS`)인데
 * TV·청소기·로봇청소기는 **괄호 안**이다(`… 85인치 (KQ85QNH80)`). 한쪽만 보면
 * 그 카테고리 문항에 코드가 통째로 빠진다.
 *
 * 예전에 코드를 뺐던 이유(`levelOf()` 가 모델코드를 '상'=수치 암기로 매긴다)는
 * 이제 없다 — C형은 `lv:'중'` 을 직접 달기 때문이다. */
const codeOf = n => {
  const tail = n.match(/([A-Z][A-Z0-9-]{5,})\s*$/);
  if (tail) return tail[1];
  const p = (n.match(/\(([^)]*)\)/) || [, ''])[1].split(',')[0].trim();
  return /^[A-Z][A-Z0-9-]{5,}$/.test(p) ? p : '';
};

/** 괄호 안의 스펙(용량·평형·인용수). **숫자가 있는 것만** 쓴다 —
 *  그래야 `dp 카탈로그 스펙표` 같은 **내부 메모가 시험지로 새어 나가지 않는다**
 *  (v151 에서 실제로 겪은 사고다). 목록으로 막지 않고 데이터가 스스로 판정한다. */
const specOf = n => {
  const p = (n.match(/\(([^)]*)\)/) || [, ''])[1].split(',')[0].trim();
  if (!p || !/\d/.test(p) || /^[A-Z][A-Z0-9-]{5,}$/.test(p)) return '';
  return p;
};

/** 질문 주어 — `제품명 스펙(모델코드)` */
const nameOf = m => {
  const spec = specOf(m.name), code = codeOf(m.name);
  return plain(m.name) + (spec ? ' ' + spec : '') + (code ? `(${code})` : '');
};

/** 해설에 쓸 짧은 이름 — **코드를 뺀다.** 질문에 이미 있어 되풀이이고,
 *  코드를 넣었더니 해설이 길어져 **정답지가 3쪽으로 흘렀다**(검사가 잡았다).
 *  "답안지 2페이지" 는 사장님 지시라 그쪽을 지킨다. */
const shortOf = m => {
  const spec = specOf(m.name);
  return plain(m.name) + (spec ? ' ' + spec : '');
};

function labelsFor(models) {
  const out = new Map();
  for (const m of models) out.set(m, nameOf(m));
  return out;
}

/* 같은 제품에 다른 LG 기능을 물으면 **질문 문구가 똑같아진다.** 뜻이 같은 문형을 돌려
   가른다 — 덤으로 "6칸이 다 같은 문형이라 패턴이 읽힌다" 는 약점도 함께 풀린다.
   넷 다 부정형이라 묻는 것은 같다. */
const STEMS = [
  name => `삼성 ${name}의 특징이 아닌 것은?`,
  name => `삼성 ${name}의 기능이 아닌 것은?`,
  name => `다음 중 삼성 ${name}의 셀링포인트가 아닌 것은?`,
  name => `삼성 ${name}에 해당하지 않는 것은?`,
];

/** 비교표에서 C형 문항을 만든다 */
export function buildLGQuestions() {
  const src = fs.readFileSync(CMP, 'utf8').match(/\nconst DB = (\{[\s\S]*?\n\});/);
  if (!src) throw new Error('compare-app.html 의 DB 를 찾지 못했다');
  const DB = new Function('return ' + src[1])();
  const FX = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  const OK = FX['확정'];
  const BAN = new Set(FX['금지']['목록']);
  const out = [];
  /* 같은 제품이 두 카테고리에 실린다 — 콤보는 '세탁기·콤보' 와 '건조기' 양쪽에 있고
     셀링포인트도 조금씩 다르다. 그대로 두면 **같은 질문이 두 번** 나온다.
     시험에서는 같은 물건이므로 먼저 만난 카테고리에서 한 번만 쓴다. */
  const usedModel = new Set();

  for (const [cmpCat, node] of Object.entries(DB)) {
    const qbCat = CAT[cmpCat];
    if (!qbCat) continue;
    const lgs = (node.competitors || {})['LG'] || [];
    /* 모델코드를 뗀 이름이 같은 모델이 있다(색상·트림 변형). 시험에서는 같은 제품이라
       **한 이름당 하나만** 쓴다 — 셀링포인트가 가장 많은 것을 남긴다. 안 그러면 같은
       질문이 두 번 나온다(식기세척기 빌트인 14인용이 실제로 그랬다). */
    const cand = (node.samsung || []).filter(p => (p.on || []).length >= 3);
    const NAME = labelsFor(cand);
    const pick = new Map();
    for (const p of cand) {
      const k = NAME.get(p);
      const cur = pick.get(k);
      if (!cur || (p.on || []).length > (cur.on || []).length) pick.set(k, p);
    }
    const ss = [...pick.values()].filter(p => !usedModel.has(NAME.get(p)));
    if (!ss.length || !lgs.length) continue;
    for (const p of ss) usedModel.add(NAME.get(p));

    const ssAll = [...new Set((node.samsung || []).flatMap(p => p.on || []))];
    const allow = [...(OK[cmpCat] || []), ...OK['공통']];

    const usable = allow.filter(f => lgs.some(p => (p.on || []).includes(f)));
    if (usable.length > STEMS.length)
      throw new Error(`${cmpCat}: LG 고유 ${usable.length}개 > 문형 ${STEMS.length}개 — 문형을 더 만들 것`);

    usable.forEach((f, fi) => {
      const owner = lgs.find(p => (p.on || []).includes(f));
      if (BAN.has(f)) throw new Error(`확정과 금지에 함께 있다: ${f}`);
      const bad = ssAll.find(s => overlap(f, s));
      if (bad) throw new Error(`겹침 가드 — "${f}" 가 삼성 "${bad}" 와 겹친다 (${cmpCat})`);

      for (const p of ss) {
        const three = (p.on || []).slice(0, 3);
        const name = NAME.get(p);
        /* 정답 자리를 문항마다 흩는다 — 한 자리에 몰리면 찍어서 맞는다 */
        const at = (name.length + f.length) % 4;
        const opts = [...three];
        opts.splice(at, 0, f);
        out.push({
          cat: qbCat,
          q: STEMS[fi](name),
          opts,
          ans: at,
          exp: `${f}${josa(f, '은', '는')} ${lgName(owner.name)}의 기능이다. `
             + `삼성 ${shortOf(p)}의 셀링포인트는 ${three.join(' · ')}. `
             + `(근거: 타사비교 세일즈가이드)`,
          /* 난이도는 못 박는다 — 이 형태는 용어정리의 "중 = 어떻게 다른가(비교·부정형)" 다.
             문형에 따라 `levelOf()` 가 흔들리면 시험지 난이도 배분이 함께 흔들린다. */
          lv: '중',
          lg: 1,
        });
      }
    });
  }

  /* 같은 질문이 두 번 나오면 시험지에서 그대로 드러난다 — 만든 자리에서 막는다 */
  const seen = new Map();
  for (const q of out) {
    const prev = seen.get(q.q);
    if (prev) throw new Error(`질문이 겹친다: "${q.q}"\n  ① ${prev.opts.join(' / ')}\n  ② ${q.opts.join(' / ')}`);
    seen.set(q.q, q);
  }
  return out;
}

/* ── QB 손보기 ──
   파일 전체를 다시 직렬화하면 diff 가 7,000줄이 되어 사람이 못 읽는다. 그래서
   **괄호 깊이를 세어** 원소의 시작·끝 자리만 찾아 그 자리만 손댄다.
   CLAUDE.md 가 경고한 그 함정(카테고리마다 서식이 다르고, 정규식으로 끝을 찾으면
   엉뚱한 자리에 끼운다)을 정규식을 안 쓰는 것으로 피한다. */

function spanOfQB(html) {
  const at = html.indexOf('const QB={');
  if (at < 0) throw new Error('QB 를 찾지 못했다');
  const from = html.indexOf('{', at);
  let depth = 0;
  for (let i = from; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) return [from, i];
  }
  throw new Error('QB 의 끝을 찾지 못했다');
}

/** 카테고리 배열의 닫는 `]` 자리와, 그 안 원소들의 [시작,끝] 목록 */
function arrayOf(html, qb, cat) {
  const key = `"${cat}": [`;
  const at = html.indexOf(key, qb[0]);
  if (at < 0 || at > qb[1]) throw new Error(`카테고리를 찾지 못했다: ${cat}`);
  let depth = 0, start = -1;
  const elems = [];
  for (let i = at + key.length - 1; i <= qb[1]; i++) {
    const c = html[i];
    if (c === '[' || c === '{') { depth++; if (depth === 2 && c === '{') start = i; }
    else if (c === ']' || c === '}') {
      if (depth === 2 && c === '}' && start >= 0) { elems.push([start, i]); start = -1; }
      if (--depth === 0) return { close: i, elems };
    }
  }
  throw new Error(`배열의 끝을 찾지 못했다: ${cat}`);
}

/** 뒤쪽 카테고리 서식(opts 를 한 줄로)에 맞춘다 */
const render = q => '{\n'
  + `"q": ${JSON.stringify(q.q)},\n`
  + `"opts": ${JSON.stringify(q.opts)},\n`
  + `"ans": ${q.ans},\n`
  + `"exp": ${JSON.stringify(q.exp)},\n`
  + `"lv": ${JSON.stringify(q.lv)},\n`
  + `"lg": 1\n}`;

/* A형 = LG 를 묻는데 삼성이 주어가 아닌 문항. "통으로 나오는" 그것이다.
   **`LG_RE` 를 여기 또 적지 않는다** — 두 벌이면 한쪽만 고쳤을 때 생성기와 검사가
   서로 다른 말을 한다(이 저장소가 허브 카드 개수·앱 버전에서 반복해서 데인 종류다). */
const SS_RE = /삼성|BESPOKE|비스포크|Neo QLED|무풍|패밀리허브|키친핏|제트|그랑데|에어드레서|갤럭시|더 플레이트|더플레이트|에코버블|더 프레임|비스포크/;
export const isStandaloneLG = q =>
  (LG_RE.test(q.q) || (q.opts || []).some(o => LG_RE.test(String(o)))) && !SS_RE.test(q.q);

export function main() {
  let html = fs.readFileSync(SRC, 'utf8');
  const made = buildLGQuestions();
  const byCat = {};
  for (const q of made) (byCat[q.cat] = byCat[q.cat] || []).push(q);

  const qb = spanOfQB(html);
  const cats = Object.keys(JSON.parse(html.slice(qb[0], qb[1] + 1)));
  const edits = [];
  let dropStandalone = 0, dropOld = 0;

  for (const cat of cats) {
    const { close, elems } = arrayOf(html, qb, cat);
    let kept = 0;
    for (const [s, e] of elems) {
      const q = JSON.parse(html.slice(s, e + 1));
      if (q.lg === 1) { edits.push({ s, e }); dropOld++; }
      else if (isStandaloneLG(q)) { edits.push({ s, e }); dropStandalone++; }
      else kept++;
    }
    const add = byCat[cat] || [];
    if (add.length) edits.push({ s: close, ins: (kept ? ',\n' : '') + add.map(render).join(',\n') });
  }

  /* 뒤에서부터 고쳐야 앞쪽 자리가 안 밀린다 */
  edits.sort((a, b) => b.s - a.s);
  for (const ed of edits) {
    if (ed.ins !== undefined) { html = html.slice(0, ed.s) + ed.ins + html.slice(ed.s); continue; }
    /* 원소 하나를 뺄 때 앞뒤 쉼표도 함께 정리한다 — 안 하면 JSON 이 깨진다 */
    let a = ed.s, b = ed.e + 1;
    while (a > 0 && /\s/.test(html[a - 1])) a--;
    if (html[a - 1] === ',') a--;
    else { while (/\s/.test(html[b])) b++; if (html[b] === ',') b++; }
    html = html.slice(0, a) + html.slice(b);
  }

  fs.writeFileSync(SRC, html);
  return { made: made.length, dropStandalone, dropOld, byCat };
}

if (process.argv[1] && process.argv[1].endsWith('build-lg-questions.mjs')) {
  const r = main();
  console.log(`뺀 문항 — LG 단독 ${r.dropStandalone}개 · 옛 C형 ${r.dropOld}개`);
  console.log(`넣은 문항 — C형 ${r.made}개`);
  console.log('카테고리별:', Object.entries(r.byCat).map(([c, v]) => `${c} ${v.length}`).join(' · '));
}
