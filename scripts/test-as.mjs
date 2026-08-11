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

// ── [6] 물류센터 배송·설치 관할 ──
/*
 * 관할이 틀리면 배송이 통째로 엉뚱한 센터로 간다. 사내 배포본(2026.1.02 시행) 기준으로
 * 검사한다. 특히 **다른 센터로 넘어간 3건**이 회귀 지점이다 — 원문에서 지명을 기계적으로
 * 뽑으면 "*인천TC로 변경(안산시)" 같은 주석의 지명이 넘겨준 센터에도 남아 두 곳에서 잡힌다.
 */
A.tab = 'contact';
const C = A.CENTERS;
if (!C || C.length !== 21) fail(`물류센터가 ${C ? C.length : 0}개 — 21개여야 한다`);
else pass('물류센터 21개');

// 지사 구성 (원문: 서울 3 · 중부 4 · 남부 7 · 서부 7)
const byBr = {};
for (const c of C) byBr[c.b] = (byBr[c.b] || 0) + 1;
const wantBr = { 서울: 3, 중부: 4, 남부: 7, 서부: 7 };
const brBad = Object.entries(wantBr).filter(([k, v]) => byBr[k] !== v);
if (brBad.length) fail(`지사별 센터 수 불일치: ${brBad.map(([k, v]) => `${k} ${byBr[k]}≠${v}`).join(', ')}`);
else pass('지사별 센터 수 (서울 3 · 중부 4 · 남부 7 · 서부 7)');

/* 번호 형식 — 대부분 1577-39xx 지만 **남서울TC 만 1899-9300** 이다.
 * 형식만 검사하고 체계를 단정하지 않는다(1577 로 맞추려다 실제 번호를 틀리게 고칠 뻔했다). */
const telBad = C.filter((c) => !/^\d{4}-\d{4}$/.test(c.n));
if (telBad.length) fail(`연락처 형식이 깨진 센터: ${telBad.map((c) => c.t).join(', ')}`);
else pass('연락처 형식 21건 정상');

// 골든값 — 원문에서 눈으로 확인한 값
let golden = 0;
for (const [name, code, tel] of [
  ['서서울TC', 'L104', '1577-3913'],
  ['평택TC', 'L108', '1577-3922'],
  ['제주RDC', 'L106', '1577-3971'],
  ['익산TC', 'L121', '1577-3944'],
  ['남서울TC', 'L133', '1899-9300'],
]) {
  const c = C.find((x) => x.t === name);
  if (!c) fail(`${name} 이 없다`);
  else if (c.code !== code || c.n !== tel) fail(`${name}: 코드/번호가 ${c.code}/${c.n} — ${code}/${tel} 이어야 한다`);
  else golden++;
}
if (golden === 5) pass('골든 센터 5건 (코드·번호) 일치');

/* 다른 센터로 넘어간 3건 — 넘겨받은 곳에서만 잡혀야 한다.
 * 이 검사가 깨지면 상담사가 배송 담당 센터를 틀리게 안내한다. */
for (const [region, owner, note] of [
  ['안산시', '인천TC', "평택TC 칸의 '*인천TC로 변경(안산시)' 주석"],
  ['보령시', '아산TC', "세종TC 칸의 '(아산TC로 변경 : 보령시)' 주석"],
  ['영천시', '포항TC', "대구TC 칸의 '/// 포항TC(영천시)' 주석"],
]) {
  const hit = C.filter((c) => c.kw.includes(region)).map((c) => c.t);
  if (hit.length !== 1 || hit[0] !== owner) {
    fail(`${region}: 검색되는 센터가 [${hit.join(', ')}] — ${owner} 하나여야 한다 (${note}에서 딸려 들어왔다)`);
  }
}
pass('관할 이관 3건 (안산→인천 · 보령→아산 · 영천→포항) 넘겨받은 센터에서만 검색됨');

/* 반대로 실제로 두 센터에 걸친 지역은 둘 다 남아 있어야 한다 — 읍·면 단위로 갈린다 */
for (const [region, n] of [['평창군', 2], ['홍천군', 2], ['함평군', 2]]) {
  const hit = C.filter((c) => c.kw.includes(region));
  if (hit.length !== n) fail(`${region}: ${hit.length}개 센터에서 검색 — ${n}개여야 한다(읍·면 단위 분할)`);
}
pass('분할 관할 3건 (평창·홍천·함평) 양쪽 유지');

/* 시·도 이름은 키워드에서 빠져야 한다 — 서울은 네 센터로 갈리는데 '서울'로 다 잡히면 뜻이 없다 */
const sido = C.filter((c) => c.kw.some((k) => /^(서울특별시|인천광역시|경기도|강원도|경상[남북]도|전라[남북]도|충청[남북]도)$/.test(k)));
if (sido.length) fail(`시·도 이름이 검색 키워드에 남아 있다: ${sido.map((c) => c.t).join(', ')}`);
else pass('시·도 머리글은 키워드에서 제외');

// 화면 — 연락처 탭에 21개가 렌더되고 검색이 걸리는가
const pane = doc.querySelector('#contactPane');
const rows = () => pane.querySelectorAll('#lglist .ct').length;
if (rows() !== 21) fail(`연락처 탭에 ${rows()}개 렌더 — 21개여야 한다`);
else pass('연락처 탭 렌더 21건');

const q = pane.querySelector('#lgq');
const type = (v) => { q.value = v; q.dispatchEvent(new window.Event('input')); };
type('수원');
const one = pane.querySelector('#lglist .ct');
if (rows() !== 1 || !/평택TC/.test(one.textContent)) fail(`'수원' 검색 → ${rows()}건 — 평택TC 하나여야 한다`);
else pass("'수원' 검색 → 평택TC 하나");

type('안산');
const first = pane.querySelector('#lglist .ct');
if (!first || !/인천TC/.test(first.textContent)) fail("'안산' 검색 결과 첫 줄이 인천TC 가 아니다");
else pass("'안산' 검색 → 인천TC 가 첫 줄");

type('');
if (rows() !== 21) fail('검색어를 지웠는데 21건으로 돌아오지 않는다');
else pass('검색어 해제 시 전체 복원');

// 번호는 눌러서 걸 수 있어야 한다(share-kit 이 data-tel 로 시트를 띄운다)
const noTel = [...pane.querySelectorAll('#lglist .ct')].filter((el) => !el.dataset.tel);
if (noTel.length) fail(`${noTel.length}개 센터 줄에 data-tel 이 없다 — 눌러도 걸리지 않는다`);
else pass('21건 전부 눌러서 걸기 가능');

// 출처 표기 — 지어낸 값이 아님을 화면이 밝히는가
if (!/센터별 배송 서비스지역/.test(pane.textContent)) fail('물류센터 출처 표기가 없다');
else pass('물류센터 출처 표기');

// 이제 물류센터는 채웠으므로 '미등록' 목록에서 빠져야 한다
if (A.CONTACTS && /물류센터/.test(JSON.stringify(pane.textContent.match(/아직 등록되지 않았습니다[^\n]*/) || ''))) {
  fail("물류센터를 채웠는데 아직 '미등록' 안내에 남아 있다");
} else pass("'미등록' 안내에서 물류센터 제거됨");

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
