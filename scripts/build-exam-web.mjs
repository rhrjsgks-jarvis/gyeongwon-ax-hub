/* # 인터랙티브 웹 시험 만들기 — `npm run build:examweb`
 *
 * 2026-08-25 사장님 지시 — `urlquizgenerator_SKILL.md` 의 4단계가 최종 목표다
 * (*"최종목표는 C 아닌가요?? C를 목표로 진행해주세요"*).
 *
 * A4 출력기(`build-exam-tool.mjs`)와 **문제은행·출제 로직을 함께 쓴다** —
 * `fillTemplate()` 하나가 둘 다 채운다. 다른 것은 틀뿐이다.
 *
 * ## 왜 파일 하나인가
 * 매장·본사 어디서든 **메일이나 링크로 받아 그대로 열려야** 한다. 서버도 설치도 없다.
 * `assertSelfContained()` 가 바깥을 부르는 곳이 0인지 검사하고, 하나라도 있으면 던진다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fillTemplate } from './build-exam-tool.mjs';

const TPL = 'scripts/exam-web-template.html';
export const OUT = 'tools/레벨업챌린지_시험.html';

/* 성적을 시트로 보내는 판. **커밋되는 파일에는 주소를 넣지 않는다** —
   이 시험지는 링크·메일로 퍼지는 파일이라 주소가 박힌 채 나가면 남의 시트로
   응시 기록이 흘러간다(`test-examweb` 이 커밋본의 SCRIPT_URL 이 빈 문자열인지 검사한다).
   그래서 주소는 **환경변수로만** 받고 결과는 gitignore 되는 별도 파일로 낸다.

     EXAM_SCRIPT_URL='https://script.google.com/macros/s/…/exec' npm run build:examweb

   손으로 끼워 넣지 말 것 — 다음 빌드가 덮어써서 **조용히 기록이 끊긴다.** */
export const OUT_REC = 'tools/레벨업챌린지_시험_기록용.html';

export function buildExamWeb() { return fillTemplate(TPL); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { html, bank } = buildExamWeb();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);
  console.log(`문항 ${bank.total}개 · 난이도 ${JSON.stringify(bank.byLv)} · ${JSON.stringify(bank.byDiv)}`);
  console.log(`→ ${OUT} (${(Buffer.byteLength(html) / 1024).toFixed(0)}KB) · 바깥을 부르는 곳 0`);

  const url = (process.env.EXAM_SCRIPT_URL || '').trim();
  if (url) {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url))
      throw new Error(`EXAM_SCRIPT_URL 이 웹 앱 주소가 아니다 — /macros/s/…/exec 여야 한다: ${url}`);
    const rec = html.replace("var SCRIPT_URL = '';", `var SCRIPT_URL = '${url}';`);
    if (rec === html) throw new Error('SCRIPT_URL 자리를 찾지 못했다 — 템플릿이 바뀌었는지 볼 것');
    fs.writeFileSync(OUT_REC, rec);
    console.log(`→ ${OUT_REC} (기록용 · gitignore 대상) · 결과를 시트로 보낸다`);
  } else {
    console.log('   (기록용 판은 안 만들었다 — EXAM_SCRIPT_URL 을 주면 함께 만든다)');
  }
}
