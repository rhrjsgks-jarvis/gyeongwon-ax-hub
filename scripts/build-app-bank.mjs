/*
 * **레벨업 챌린지 앱의 문제은행을 시험지와 같게 맞춘다** (2026-09-02 사장님 지시:
 * *"시험지 출력기와 레벨업테스트를 동기화해주세요"*).
 *
 * ## 왜 갈라져 있었나
 *
 * 2026-09-01 에는 사장님이 **「시험지만 교체」**를 고르셨다. 그래서 신규 44모델
 * 371문항은 시험 도구에서만 더해지고, 옛 가전 519문항은 시험 도구에서만 걸러졌다 —
 * 앱은 그대로 두었다. 그 결과 **같은 팀이 두 가지를 공부하게** 됐다:
 *
 *     앱   764문항 — 옛 가전 519 + MX/LG 245
 *     시험 767문항 — 신규 371 + B2B 151 + MX/LG 245
 *
 * 사장님이 이제 맞추라고 하셨으므로 **앱을 시험지 쪽으로** 옮긴다.
 *
 * ## 어느 쪽이 원본인가
 *
 * 이 저장소의 원칙은 *"문제은행의 단일 출처는 `public/test-app.html` 의 `QB`"* 다.
 * 그 원칙을 **그대로 지킨다** — 생성된 문항을 `QB` 안으로 **집어넣는 방식**이라
 * (LG 비교 문항이 이미 그렇게 들어간다) 시험 도구는 계속 `QB` 만 읽는다.
 *
 *     b2b-questions.json  ┐
 *     new-model-questions ┼→ [이 빌드] → public/test-app.html 의 QB → buildBank()
 *     QB 의 손으로 쓴 문항 ┘
 *
 * ## 다시 돌려도 쌓이지 않는다
 *
 * 넣은 문항에 **`src` 표식**(`b2b`·`nm`)을 달아 두고, 다시 돌 때 그 표식이 붙은 것을
 * 먼저 걷어낸 뒤 새로 넣는다. 표식이 없으면 재실행마다 두 배로 불어난다.
 *
 * **옛 가전 문항은 되살아나지 않는다** — 한 번 지우면 `QB` 에 없기 때문이다.
 * 되살리려면 git 에서 꺼내야 한다(그것이 안전한 방향이다).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public', 'test-app.html');
const NL = String.fromCharCode(10);

const readJson = (p) => {
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) return [];
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  /* 두 fixture 모두 {_note,_source,count,items} 꼴이다 — 배열도 받아 준다 */
  return Array.isArray(j) ? j : (j.items || []);
};

/** `const QB={…};` 의 몸통을 괄호 균형으로 찾는다 — 정규식으로는 못 찾는다(안에 중괄호가 많다) */
export function locateQB(html) {
  const key = 'const QB=';
  const at = html.indexOf(key);
  if (at < 0) throw new Error('QB 를 못 찾았다');
  const from = at + key.length;
  if (html[from] !== '{') throw new Error('QB 가 객체가 아니다');
  let depth = 0;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return { from, to: i + 1 }; }
  }
  throw new Error('QB 의 끝을 못 찾았다');
}

/* 옛 가전 판정 — `quiz-bank.mjs` 의 `isOldAppliance` 와 **같은 뜻**이어야 한다.
   그쪽은 이제 이 빌드의 결과를 그대로 읽으므로 판정을 여기 한 곳에서만 한다. */
const MX_CATS = new Set(['휴대폰', '웨어러블', '갤럭시탭', '갤럭시북']);
const POLICY = /정책|프로모션|인센티브|미리장만|거주중|재고\s*소진|패키지\s*포인트|구독클럽|사은품|증정|무상\s*지원|대상\s*모델/;
/* LG 비교 문항(C형)은 지면에 브랜드 글자가 없는 것이 의도라 **표식으로만** 가른다 */
const isLG = (q) => q.lg === 1 || q.lg === true;

export function buildQB(oldQB) {
  const out = {};
  const add = (cat, q) => { (out[cat] || (out[cat] = [])).push(q); };

  /* ① 손으로 쓴 문항 — 옛 가전과 지난 회차의 생성분을 걷어낸다 */
  let kept = 0, dropped = 0;
  for (const [cat, list] of Object.entries(oldQB)) {
    for (const q of list) {
      if (q.src === 'b2b' || q.src === 'nm') continue;      /* 지난 회차의 생성분 */
      const blob = q.q + ' ' + q.opts.join(' ') + ' ' + (q.exp || '');
      const isCE = !MX_CATS.has(cat);
      const isPolicy = q.type === 'policy' || POLICY.test(blob);
      if (isCE && !isLG(q) && !isPolicy) { dropped++; continue; }   /* 옛 가전 */
      add(cat, q); kept++;
    }
  }

  /* ② B2B(SOHO몰) 수치 문항 — **전부 담는다** (2026-09-02 사장님 지시:
     *"시험출력기에 B2B 제품은 살려주세요"*).

     예전에는 MX 만 남기고 CE 310문항을 뺐다 — 「가전 관련 문항은 전부 삭제」라는
     하루 전 지시를 B2B 에도 그대로 적용한 것이었다. 그런데 **B2B 는 성격이 다르다**:
     옛 소비자 모델 사양이 아니라 **SOHO몰 법인 판매 사양**이라, 신규 44모델이
     대신해 주지 못한다. 빼면 그 상담이 시험에서 통째로 사라진다. */
  let nB2B = 0;
  for (const q of readJson('scripts/fixtures/b2b-questions.json')) {
    add(q.cat, { q: q.q, opts: q.opts, ans: q.ans, exp: q.exp || '', src: 'b2b',
      b2bOnly: q.b2bOnly ? 1 : 0 });
    nB2B++;
  }

  /* ③ 신규 44모델 문항 — 옛 가전이 비운 자리를 채운다 */
  let nNM = 0;
  for (const q of readJson('scripts/fixtures/new-model-questions.json')) {
    add(q.cat, { q: q.q, opts: q.opts, ans: q.ans, exp: q.exp || '', src: 'nm', lv: q.lv, fam: q.fam });
    nNM++;
  }

  /* **빈 카테고리는 남기지 않는다** — `pickBalanced` 가 `QB[c].length` 로 거르지만,
     화면의 카테고리 목록에 빈 칸이 뜨면 상담사가 눌러 보고 아무것도 안 나온다. */
  for (const c of Object.keys(out)) if (!out[c].length) delete out[c];

  return { qb: out, kept, dropped, nB2B, nNM };
}

/** 원본과 같은 서식으로 직렬화 — 줄바꿈은 살리고 들여쓰기는 지운다(파일이 이미 그 모양이다) */
export function serialize(qb) {
  return JSON.stringify(qb, null, 1).split(NL).map((l) => l.replace(/^ +/, '')).join(NL);
}

function main() {
  const html = fs.readFileSync(SRC, 'utf8');
  const { from, to } = locateQB(html);
  const oldQB = JSON.parse(html.slice(from, to));
  const { qb, kept, dropped, nB2B, nNM } = buildQB(oldQB);
  const next = html.slice(0, from) + serialize(qb) + html.slice(to);
  const total = Object.values(qb).reduce((a, l) => a + l.length, 0);

  if (fs.existsSync(SRC) && next !== html) fs.writeFileSync(SRC, next);
  console.log('[appbank] ' + total + '문항 · 카테고리 ' + Object.keys(qb).length
    + ' — 남긴 것 ' + kept + ' · 뺀 옛 가전 ' + dropped + ' · B2B ' + nB2B + ' · 신규 ' + nNM);
  const by = {};
  for (const [c, l] of Object.entries(qb)) by[c] = l.length;
  console.log('[appbank] ' + JSON.stringify(by));
}

if (import.meta.url === 'file://' + process.argv[1].split(path.sep).join('/')
    || process.argv[1].endsWith('build-app-bank.mjs')) main();
