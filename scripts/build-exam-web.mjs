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

export function buildExamWeb() { return fillTemplate(TPL); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { html, bank } = buildExamWeb();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);
  console.log(`문항 ${bank.total}개 · 난이도 ${JSON.stringify(bank.byLv)} · ${JSON.stringify(bank.byDiv)}`);
  console.log(`→ ${OUT} (${(Buffer.byteLength(html) / 1024).toFixed(0)}KB) · 바깥을 부르는 곳 0`);
}
