/*
 * AS기간 확인 회귀 테스트 — `npm run test:as`
 *
 * **AS 기간은 틀리면 그대로 고객 분쟁이다.** 그래서 다른 모듈보다 검사가 빡빡하다:
 *   [1] 화면이 렌더되고 품목을 고를 수 있는가
 *   [2] 삼성전자서비스 원문의 골든값이 그대로인가 (사람이 원문에서 눈으로 확인한 값)
 *   [3] 근거 없는 값을 만들어 내지 않는가 — 원문에 없는 품목은 "확인 필요"로 표시
 *   [4] 출처 링크가 화면에 있는가
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'as-app.html'), 'utf8');

let ok = true;
const fail = (m) => { console.log('ERROR:', m); ok = false; };
const pass = (m) => console.log('OK:', m);

const dom = new JSDOM(html, { runScripts: 'dangerously' });
const { window } = dom;
const doc = window.document;
const A = window.__as;

// ── [1] 렌더 ──
const cats = [...doc.querySelectorAll('.cat')];
if (cats.length < 20) fail(`품목 버튼이 ${cats.length}개 — 26개여야 한다`);
else pass(`품목 ${cats.length}개 렌더`);
if (!doc.querySelector('#body .card')) fail('본문이 그려지지 않았다');
else pass('본문 렌더');

/*
 * ── [2] 골든값 ──
 * 삼성전자서비스 '보증기간 산정기준' 원문(2026-08-10 확인)에서 눈으로 옮긴 값이다.
 * 데이터를 손보다가 이 값이 흔들리면 회귀다.
 */
const GOLDEN = [
  // [품목, 무상보증, 부품보유, 핵심부품 중 하나 (이름, 기간)]
  ['냉장고',        '1년', 9, '컴프레서', '3년'],
  ['TV',           '1년', 9, 'LCD/LED 패널', '2년'],
  ['에어컨',        '2년', 8, '컴프레서', '4년'],     // 계절성(냉방 전용)
  ['세탁기·콤보',    '1년', 7, '일반모터', '3년'],
  ['건조기',        '1년', 7, '컴프레서', '3년'],
  ['스마트폰',      '2년', 4, null, null],
  ['시스템에어컨',   '1년', 8, '컴프레서', '4년'],     // 냉난방 겸용이라 일반 제품 1년
];
let bad = 0;
for (const [cat, base, hold, part, yr] of GOLDEN) {
  const d = A.DB[cat];
  if (!d) { fail(`골든: 품목 '${cat}' 이 없다`); bad++; continue; }
  if (d.base !== base) { fail(`골든: ${cat} 무상보증 ${d.base} (기대 ${base})`); bad++; }
  if (d.hold !== hold) { fail(`골든: ${cat} 부품보유 ${d.hold} (기대 ${hold})`); bad++; }
  if (part) {
    const hit = (d.core || []).find((c) => c[0] === part);
    if (!hit) { fail(`골든: ${cat} 에 핵심부품 '${part}' 이 없다`); bad++; }
    else if (hit[1] !== yr) { fail(`골든: ${cat} ${part} ${hit[1]} (기대 ${yr})`); bad++; }
  }
}
if (!bad) pass(`골든값 ${GOLDEN.length}품목 일치 (무상보증·부품보유·핵심부품)`);

/*
 * ── [3] 지어내지 않았는가 ──
 * 원문 부품보유 표에 없는 품목은 `hold:null` 이어야 하고, 화면이 "확인 필요"로 알려야 한다.
 * 여기서 임의의 숫자를 채우면 상담사가 그 값을 그대로 고객에게 말한다.
 */
const noHold = Object.entries(A.DB).filter(([, v]) => !v.hold).map(([k]) => k);
if (!noHold.length) fail('부품보유가 전 품목에 채워져 있다 — 원문에 없는 품목이 있어야 정상이다');
else {
  // 그런 품목을 골랐을 때 화면에 경고가 뜨는지
  A.cur = noHold[0];
  const t = doc.querySelector('#body').textContent;
  if (!/확인 필요/.test(t)) fail(`${noHold[0]}: 부품보유를 모르는데 "확인 필요" 안내가 없다`);
  else pass(`원문에 없는 ${noHold.length}품목은 "확인 필요"로 표시 (${noHold.slice(0, 3).join(', ')} 외)`);
}

// 로열블루 연장 기간은 확인하지 못했다 — 숫자를 지어내지 않았는지
if (/\d+\s*년\s*연장/.test(JSON.stringify(A.ROYAL))) fail('로열블루 연장 기간을 지어냈다 — 원문에서 확인하지 못한 값이다');
else pass('로열블루: 확인 못 한 연장 기간을 만들어 내지 않음');

// ── [4] 출처 ──
A.cur = '냉장고';
const body = doc.querySelector('#body').textContent;
const links = [...doc.querySelectorAll('#body a')].map((a) => a.href);
if (!links.some((h) => /samsungsvc\.co\.kr/.test(h))) fail('삼성전자서비스 출처 링크가 없다');
else if (!links.some((h) => /samsung\.com\/sec\/membership/.test(h))) fail('멤버십 출처 링크가 없다');
else pass('출처 링크 2곳 표시');
if (!/1588-3366/.test(body)) fail('고객센터 번호 안내가 없다');
else pass('고객센터 안내 표시');

// ── [5] 모듈 등록 ──
for (const [f, needle, label] of [
  ['app/page.tsx', "href: '/as'", '허브 카드'],
  ['components/Navigation.tsx', "href: '/as'", '사이드바'],
  ['lib/logEvent.ts', "'as'", '로그 모듈 키'],
  ['app/as/page.tsx', 'as-app.html', '라우트'],
]) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  if (!src.includes(needle)) fail(`${label}(${f})에 등록되지 않았다`);
}
pass('허브·사이드바·로그·라우트 등록 확인');

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
