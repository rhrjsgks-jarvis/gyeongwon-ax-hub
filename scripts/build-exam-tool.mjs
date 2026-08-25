/*
 * **자립형 시험지 출력기를 만든다** — `npm run build:examtool`
 *
 * 결과물은 `tools/시험지출력기.html` 한 장이고, 그 파일만 있으면 된다:
 * 더블클릭 → 브라우저 → 새 시험지 → 인쇄. **인터넷도 서버도 필요 없다.**
 *
 * ## 왜 앱이 아니라 파일인가
 * 2026-08-19 사용자 결정 — *"오로지 시험문제 출력용 별도로 필요합니다 …
 * 기존 세일즈코파일럿에 업데이트하는 형식이 아닙니다"* · *"다른사람에게 메일로
 * 전달하면 거기서 출력을 할 수 있어야 합니다."*
 * 한 번 `/exam-print` 라우트로 앱에 붙였다가 되돌렸다(cd1a3b0, 푸시 안 함).
 *
 * ## 그래서 자립성이 기능 요구사항이다
 * 메일로 받은 사람의 PC 에는 우리 저장소도 사내망도 없다. 바깥 것을 하나라도 부르면
 * 그 환경에서 조용히 반쪽이 된다 — 폰트가 안 오면 조판이 틀어지고, 은행을 fetch 하면
 * `file://` CORS 로 **아무 문제도 안 나온다.**
 * 그래서 **빌드가 스스로 검사한다**(`assertSelfContained`). 나중에 누가 CDN 폰트나
 * 외부 스크립트를 틀에 넣으면 배포가 아니라 **여기서** 막힌다.
 *
 * ## 문제은행은 사본이 아니라 파생물이다
 * 단일 출처는 `public/test-app.html` 의 `QB`. 매번 원본에서 새로 읽어 넣고,
 * `test-examtool` 이 "커밋된 출력기 == 지금 재생성한 것"을 검사한다
 * (`search-index.json`·`size-reps.json` 과 같은 방식).
 * **문항을 늘렸으면 이 빌드를 다시 돌려 커밋할 것** — 안 그러면 매장에 나간 파일이
 * 옛 문항으로 굳는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBank } from './lib/quiz-bank.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TPL = path.join(ROOT, 'scripts', 'exam-print-template.html');
const OUTDIR = path.join(ROOT, 'tools');
export const OUT = path.join(OUTDIR, '시험지출력기.html');

/*
 * 바깥을 부르는 곳이 하나라도 있으면 그 자리에서 멈춘다.
 * 검사 대상은 "네트워크를 타는 것"뿐이다 — `href="#"` 같은 문서 내부 참조는 상관없다.
 */
const OUTSIDE = [
  [/https?:\/\//, '외부 주소(http)'],
  [/<script[^>]+\bsrc=/i, '외부 스크립트'],
  [/<link[^>]+\bhref=/i, '외부 스타일시트·폰트'],
  [/<img[^>]+\bsrc=(?!["']data:)/i, '외부 이미지'],
  [/@import/i, 'CSS @import'],
  [/\bfetch\s*\(/, 'fetch (file:// 에서 CORS 로 막힌다)'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
];

/* ## 웹 시험만 예외가 하나 있다 — 결과를 시트로 보내는 `fetch` (2026-08-25)
 *
 * 사장님 지시 문서(`urlquizgenerator_SKILL.md`)가 요구한 기능이라 뺄 수 없다.
 * 그렇다고 검사를 무르면 **진짜 외부 의존이 들어와도 안 걸린다** — 그래서
 * **무르는 대신 조건을 검사한다.** 셋을 다 지켜야 통과한다:
 *
 *   ① `fetch` 는 딱 한 번만 나온다
 *   ② `SCRIPT_URL` 이 **빈 문자열로 선언**돼 있다 — 즉 기본값은 아무 데도 안 보낸다
 *   ③ 그 `fetch` 가 `if (SCRIPT_URL)` 안에 있다
 *
 * 그래야 "받아서 열면 그대로 돈다"는 성질이 지켜진다. 시트로 보내려면 파일을 받은
 * 쪽이 주소를 직접 넣어야 하고, 그건 **의식적인 선택**이다. */
function beaconOk(html) {
  const fetches = (html.match(/\bfetch\s*\(/g) || []).length;
  const emptyUrl = /var\s+SCRIPT_URL\s*=\s*''\s*;/.test(html);
  const guarded = /if\s*\(\s*SCRIPT_URL\s*\)/.test(html);
  return fetches === 1 && emptyUrl && guarded;
}

export function assertSelfContained(html) {
  const bad = OUTSIDE.filter(([re, why]) => {
    if (!re.test(html)) return false;
    if (why.startsWith('fetch') && beaconOk(html)) return false;   /* 위 세 조건을 지킨 보고용 */
    return true;
  }).map(([, why]) => why);
  if (bad.length) {
    throw new Error(
      '자립형이 아니다 — 메일로 받은 사람의 PC 에서 조용히 반쪽이 된다: ' + bad.join(' · ')
    );
  }
}

/** 틀에 **문제은행과 출제 로직**을 끼운다. A4 인쇄용과 웹 시험이 함께 쓴다 —
 *  출제부를 두 벌로 두면 한쪽만 고쳤을 때 두 시험지가 다른 말을 한다. */
export function fillTemplate(tplPath) {
  const tpl = fs.readFileSync(tplPath, 'utf8');
  const bankMark = '/*__QUIZ_BANK__*/null';
  const coreMark = '/*__EXAM_CORE__*/';
  if (!tpl.includes(bankMark)) throw new Error('틀에서 ' + bankMark + ' 자리를 찾지 못했다');
  if (!tpl.includes(coreMark)) throw new Error('틀에서 ' + coreMark + ' 자리를 찾지 못했다');

  const bank = buildBank();
  /* `</script>` 가 문자열 안에 있으면 브라우저가 거기서 스크립트를 끊는다.
     은행 본문에 그런 글자가 들어올 일은 없지만, 들어오면 파일이 통째로 죽으므로 막는다. */
  const json = JSON.stringify(bank).replace(/<\//g, '<\\/');
  const core = fs.readFileSync(path.join(path.dirname(TPL), 'lib', 'exam-core.js'), 'utf8');
  const html = tpl.replace(bankMark, json).replace(coreMark, core);
  assertSelfContained(html);
  return { html, bank };
}

export function buildExamTool() { return fillTemplate(TPL); }

/* 직접 실행했을 때만 파일을 쓴다 — 테스트는 buildExamTool() 만 불러 대조한다 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { html, bank } = buildExamTool();
  fs.mkdirSync(OUTDIR, { recursive: true });
  fs.writeFileSync(OUT, html);
  console.log(
    `문항 ${bank.total}개 · 카테고리 ${Object.keys(bank.cats).length}개 · ${JSON.stringify(bank.byType) + ' · ' + JSON.stringify(bank.byDiv)}`
  );
  console.log(`→ tools/시험지출력기.html (${(Buffer.byteLength(html) / 1024).toFixed(0)}KB) · 바깥을 부르는 곳 0`);
}
