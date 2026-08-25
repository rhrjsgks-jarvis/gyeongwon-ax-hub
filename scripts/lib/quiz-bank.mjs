/*
 * **문제은행을 코드에서 읽어 온다** — 자립형 시험지 출력기가 쓰는 유일한 통로.
 *
 * 문제은행의 **단일 출처는 `public/test-app.html` 의 `QB`** 다. 출력기가 자기 사본을
 * 들고 있으면 반드시 어긋난다 — 이 저장소가 허브 카드 개수·앱 버전·비교표 값에서
 * 반복해서 데인 종류다. 그래서 **빌드로 파생**시키고,
 * `test-examtool.mjs` 가 "커밋된 출력기 == 지금 재생성한 것"을 검사한다
 * (`search-index.json`·`size-reps.json` 과 같은 방식).
 *
 * **예전에는 `public/quiz-bank.json` 을 만들어 인쇄 지면이 fetch 했다**(2026-08-19 폐지).
 * 출력기가 앱에서 떨어져 나와 **더블클릭으로 여는 단일 파일**이 되면서 fetch 를 쓸 수
 * 없게 됐다(`file://` 는 CORS 로 막힌다). 그러면 그 json 을 읽을 지면이 하나도 없는데
 * 배포본에는 365KB 가 계속 실린다 — 그래서 파일을 없애고 이 모듈로 바꿨다.
 * 은행은 이제 **빌드 시점에 출력기 HTML 안으로 인라인된다.**
 *
 * ## 정책/제품 갈래도 여기서 붙인다
 * 실제 시험이 **정책테스트**와 **제품테스트**로 나뉘어 있어 인쇄 시험지도 비율을
 * 맞춘다. 우리 은행에는 아직 갈래 표시가 없으므로 **본문 어휘로 판정**한다 —
 * 실제 시험 사진에서 시험명이 찍힌 256장으로 재니 **정밀도 99% · 재현율 100%** 였다.
 * 문항에 `type` 을 직접 넣게 되면 그것이 우선한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'public', 'test-app.html');

/* 정책 어휘 — `.scratch/exam-topics.mjs` 와 같은 목록이어야 한다.
   두 곳이 갈리면 화면 비율과 조사 결과가 서로 다른 말을 한다. */
const POLICY = /정책|프로모션|인센티브|미리장만|거주중|재고\s*소진|패키지\s*포인트|구독클럽|사은품|증정|무상\s*지원|대상\s*모델/;

/** `test-app.html` 의 `QB` 객체를 그대로 꺼낸다 */

/* ## CE / MX 갈래
 * 2026-08-24 사장님 지시 — "시험문제 비중은 CE 50% MX 50%".
 * **분류표를 새로 적지 않는다** — 근거는 모델파인더 DB 의 src 필드다
 * (냉장고 · TV · 에어컨 · 사운드바 = CE / 스마트폰 · 태블릿 · 워치 · 버즈 = MX).
 * 판단이 필요한 두 곳만 여기 적는다:
 *   · **갤럭시북** — finder 는 SEC 로 두지만 조직상 MX 사업부라 MX 로 넣는다.
 *   · **SmartThings** — 가전 연동 플랫폼이고 이 팀이 가전 영업이라 CE 로 둔다.
 * 은행 카테고리가 늘면 여기를 함께 볼 것 — 빠지면 조용히 CE 로 떨어진다. */
const MX_CATS = new Set(['휴대폰', '웨어러블', '갤럭시탭', '갤럭시북']);

/* ## 난이도 — 상 / 중 / 하
 * 2026-08-24 사장님 지시 — "시험난이도 상중하로 3단계 구분(시험지에 난이도표시X)" ·
 * "상 중 하 를 믹스하되 **용어정리를 제대로** 해야 한다". 그 용어정리가 이 주석이다.
 *
 * **가르는 질문은 하나다 — 정답을 고르려면 무엇을 알아야 하는가.**
 *
 *   하 = **무엇인지 아는가**   기능·용어의 뜻과 쓰임 ("SpaceMax 선반 특징으로 올바른 것은?")
 *   중 = **어떻게 다른가**     비교·부정형·인증/규격 판단 ("기존 에코버블보다 개선된 점은?")
 *   상 = **정확히 얼마인가**   수치·규격값·모델코드 암기 ("고낙차 허용 거리로 올바른 것은?")
 *
 * **판정 근거는 규칙이 아니라 관찰이다.** 보기 넷에서 숫자를 지웠더니 서로 같아지면
 * 그 문항은 **틀은 같고 숫자만 다르다** — 즉 소거법이 안 통하고 값을 외워야 한다.
 * 그래서 그것을 '상' 의 으뜸 신호로 쓴다. 문항이 늘어도 그대로 적용된다.
 *
 * **카테고리로 난이도를 매기지 말 것** — 같은 카테고리 안에 쉬운 문항과 어려운 문항이
 * 함께 있어서 뭉개진다(타사비교 등급을 '카테고리 전체 모집단'으로 매기다 실패한 것과 같다).
 *
 * 실측 분포(682문항) — 하 439 · 중 85 · 상 158. 한쪽으로 쏠려 보이지만 은행이 그렇게
 * 생겼기 때문이고, 20문항 뽑기에는 셋 다 충분하다. 화면이 이 분포를 함께 밝힌다. */
const LV_UNIT = '(mm|cm|m|kg|g|L|리터|W|kWh|Pa|dB|인치|형|배|%|시간|분|초|년|개월|만원|원|MP|GB|TB|mAh|Hz|ATM|℃|도|회|단계|등급|코어|px|nm|ms|개|종|가지|명|층|평)';
const LV_NUM  = new RegExp('\\d[\\d,.]*\\s*' + LV_UNIT, 'i');
const LV_CODE = /\b[A-Z]{2,3}\d{2}[A-Z0-9-]{3,}\b/;  /* 모델코드 — 외우지 않으면 못 고른다 */
const LV_CMP  = /vs|비교|차이|대비|다른 점|차별점|보다/i;
const LV_NEG  = /않은|아닌|틀린|잘못/;                       /* 부정형은 보기 넷을 다 판단해야 한다 */
const LV_STD  = /IEC|KS\s?[A-Z]|IP\d{2}|인증|표준|규격/;

/** 보기 넷에서 숫자를 지웠을 때 서로 같아지는가 = 틀은 같고 숫자만 다르다 */
function sameShape(opts) {
  const bare = opts.map(o => String(o).replace(/[\d,.]+/g, '#').replace(/\s+/g, ''));
  return new Set(bare).size <= 2 && /#/.test(bare[0]);
}

/* ## LG 비교 문항 표식
 * 2026-08-24 사장님 지시 — "시험문제 LG비교문항 필요" · TV·냉장고·세탁기·에어컨·공기청정기·
 * 로니(로봇청소기)·코드제로·노트북·정수기. 근거 자료는 `public/compare-app.html` 의
 * LG 베스트샵 카탈로그 실측 스펙이다 — LG 모델은 그 파일에만 싣고 제품 상세검색·통합검색
 * 색인에는 절대 넣지 않는다는 이 저장소의 규칙은 그대로다(문항 본문은 색인 대상이 아니다).
 *
 * ## 2026-08-25 — 판정을 **문자열에서 표식으로** 옮겼다
 * 사장님 지시 — *"엘지문제가 통으로 나오는 게 아니라 … 삼성 000제품의 특징이 아닌 것은?
 * 하고 엘지 보기가 들어가 있게"* · *"질문은 삼성질문이고 보기에 LG를 넣어서 헷갈리게"*.
 *
 * 이 형태(C형)는 **시험지 지면에 'LG' 글자가 한 자도 없는 것이 의도다.** 보기에 든 것은
 * `인버터 리니어 컴프레서`·`트루스팀` 처럼 LG 고유 기술명이지 브랜드명이 아니고,
 * 브랜드를 적어 버리면 그 자리가 곧 정답이라 헷갈리게 만들라는 지시와 정면으로 어긋난다.
 * 그래서 문자열로는 셀 수 없다 — **문항이 스스로 `lg:1` 로 밝힌다**(`q.lv` 와 같은 방식).
 *
 * 옛 규칙은 *"해설에만 LG 가 나오는 것은 세지 않는다 — 약속한 출제 수는 시험지에서
 * 보여야 한다"* 였다. **그 전제가 뒤집혔다.** 지금은 안 보이는 것이 목적이고, 대신
 * `build-lg-questions.mjs` 가 근거(비교표 셀링포인트)를 들고 문항을 만들며 해설이
 * 그것을 밝힌다. 약속을 지키는 자리가 지면에서 생성기와 해설로 옮겨간 것이다.
 *
 * **`LG_RE` 는 판정이 아니라 회귀 검사에 남긴다** — 표식 없이 LG 를 통으로 묻는 문항
 * (A형)이 은행에 다시 들어오지 않는지 `test-examtool` 이 이것으로 지킨다. */
/* `LG` 는 **앞뒤에 영문이 붙지 않을 때만** 브랜드다. 그냥 부분일치로 잡으면 삼성 TV 의
   `DLG 확장 120Hz`(Dual Line Gate)가 LG 로 걸린다 — 이 저장소가 이미 두 번 겪은 종류다
   (제품 상세검색의 '무선 이어폰'이 청소기로 끌려간 것 · AS 의 '프로서비스'가 '프로'로 잡힌 것).
   한글 라인명은 조사가 붙으므로 경계를 걸지 않는다. */
export const LG_RE = /(?<![A-Za-z])LG(?![A-Za-z])|엘지|트롬|디오스|코드제로|퓨리케어|스타일러|로보킹|홈봇|오브제컬렉션/;
export function isLG(q) {
  return q.lg === 1;
}

/** 문항 하나의 난이도. `q.lv` 가 직접 적혀 있으면 그것이 우선한다(정책/제품 갈래와 같은 규칙) */
export function levelOf(q) {
  if (q.lv === '상' || q.lv === '중' || q.lv === '하') return q.lv;
  const opts = q.opts || [];
  const nNum = opts.filter(o => LV_NUM.test(String(o))).length;
  if (nNum >= 3 || sameShape(opts) || LV_CODE.test(q.q) || opts.some(o => LV_CODE.test(String(o)))) return '상';
  if (LV_CMP.test(q.q) || LV_NEG.test(q.q) || LV_STD.test(q.q) || nNum >= 1) return '중';
  return '하';
}

export function readQB() {
  const html = fs.readFileSync(SRC, 'utf8');
  const at = html.indexOf('const QB={');
  if (at < 0) throw new Error('test-app.html 에서 QB 를 찾지 못했다');
  let i = html.indexOf('{', at), depth = 0, end = -1;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error('QB 의 끝을 찾지 못했다');
  return JSON.parse(html.slice(html.indexOf('{', at), end + 1));
}

/** 출력기가 먹는 모양으로 — 문항을 한 줄로 펴고 정책/제품 갈래를 붙인다 */
export function buildBank() {
  const QB = readQB();
  const items = [];
  let seq = 0;
  for (const [cat, list] of Object.entries(QB)) {
    for (const q of list) {
      const blob = q.q + ' ' + q.opts.join(' ') + ' ' + (q.exp || '');
      items.push({
        i: seq++,
        cat,
        type: q.type || (POLICY.test(blob) ? 'policy' : 'product'),
        div: MX_CATS.has(cat) ? 'MX' : 'CE',
        lv: levelOf(q),
        lg: isLG(q) ? 1 : 0,
        q: q.q, opts: q.opts, ans: q.ans, exp: q.exp || '',
      });
    }
  }
  const byType = items.reduce((a, x) => (a[x.type] = (a[x.type] || 0) + 1, a), {});
  const byDiv  = items.reduce((a, x) => (a[x.div]  = (a[x.div]  || 0) + 1, a), {});
  const byLv   = items.reduce((a, x) => (a[x.lv]   = (a[x.lv]   || 0) + 1, a), {});
  /* 난이도 × LG — 고정 출제(20문항 중 LG 4문항)가 실제로 가능한지 여기서 드러난다 */
  const lgByLv = items.filter(x => x.lg).reduce((a, x) => (a[x.lv] = (a[x.lv] || 0) + 1, a), {});
  return {
    total: items.length,
    cats: Object.fromEntries(Object.entries(QB).map(([k, v]) => [k, v.length])),
    byType,
    byDiv,
    byLv,
    lgByLv,
    lgTotal: items.filter(x => x.lg).length,
    items,
  };
}
