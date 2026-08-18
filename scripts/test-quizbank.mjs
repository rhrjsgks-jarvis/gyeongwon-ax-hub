/*
 * **문제은행 파생 파일이 최신인가** — `node scripts/test-quizbank.mjs`
 *
 * `quiz-bank.json` 은 `test-app.html` 의 QB 를 빌드로 뽑은 것이라, 문항을 늘리고
 * `npm run build:quizbank` 를 안 돌리면 **인쇄 시험지만 옛 은행에서 뽑힌다.**
 * 화면에는 아무 표시도 안 나므로 검사가 잡아야 한다
 * (`search-index.json`·`size-reps.json` 과 같은 방식).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.join(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public', 'quiz-bank.json');
let ok = true;
const say = (c, m) => { console.log((c ? 'OK: ' : 'ERROR: ') + m); if (!c) ok = false; };

const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
say(!!before, 'quiz-bank.json 이 커밋돼 있다');
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-quiz-bank.mjs')], { cwd: ROOT, stdio: 'pipe' });
const after = fs.readFileSync(OUT, 'utf8');
say(before === after, '커밋된 quiz-bank.json = 지금 재생성한 것 (다르면 npm run build:quizbank 후 커밋할 것)');

const bank = JSON.parse(after);
/* 은행과 원본의 문항 수가 같아야 한다 */
const html = fs.readFileSync(path.join(ROOT, 'public', 'test-app.html'), 'utf8');
const at = html.indexOf('const QB={');
let i = html.indexOf('{', at), d = 0, end = -1;
for (; i < html.length; i++) { if (html[i] === '{') d++; else if (html[i] === '}') { d--; if (d === 0) { end = i; break; } } }
const QB = JSON.parse(html.slice(html.indexOf('{', at), end + 1));
const total = Object.values(QB).reduce((a, v) => a + v.length, 0);
say(bank.total === total, `문항 수 일치 — 은행 ${bank.total} / 원본 ${total}`);
say(bank.items.every((x) => x.opts && x.opts.length === 4 && x.ans >= 0 && x.ans <= 3),
    '모든 문항이 보기 4개 · 정답 인덱스 0~3');
say(bank.items.every((x) => x.type === 'policy' || x.type === 'product'),
    '모든 문항에 정책/제품 갈래가 붙어 있다');
console.log(`  (정책 ${bank.byType.policy || 0} · 제품 ${bank.byType.product || 0})`);

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
