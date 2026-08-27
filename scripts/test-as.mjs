/*
 * AS 관련 정보 회귀 테스트 — `npm run test:as`
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
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const APP = path.join(root, 'public', 'as-app.html');
const html = fs.readFileSync(APP, 'utf8');

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
  /*
   * 모바일·웨어러블(2026-08-14 추가). **원문 표를 브라우저로 다시 읽어 확인한 값**이다 —
   * 표0 보증기간은 `일반 제품 1년(전제품 공통)` · `휴대폰/스마트폰/태블릿 2년` · `계절성 2년`
   * 셋뿐이고, 워치·버즈·링·핏·XR·SSD·헤드폰은 **어느 칸에도 없다.** 그래서 1년(전제품 공통)이고
   * 부품보유는 근거가 없어 비운다. 2년으로 올리면 그 자체가 지어낸 값이 된다.
   */
  ['워치',          '1년', null, null, null],
  ['버즈',          '1년', null, null, null],
  ['헤드폰·이어폰',  '1년', null, null, null],
  /* 표0 계절성 칸에 **선풍기**가 명시돼 있고 부품보유 표에도 "선풍기 5년"이 있다 */
  ['선풍기',        '2년', 5, null, null],
  /*
   * 하만 오디오(2026-08-27 추가). **출처가 다르다** — 삼성전자서비스 '보증기간 산정기준'
   * 원문에는 하만·JBL·AKG 가 **한 줄도 없다**(렌더된 DOM 전수 확인). 값은 하만 공식
   * 서비스센터 안내(harmansvc.co.kr/wtyinfo) 원문 그대로다:
   *   *"하만 오디오 제품의 보증기간은 구입일로부터 12개월 입니다."*
   *   *"※ 제품의 품질보증기간은 구입 후 12개월, 부품 보유기간은 3년 이며, 유통과정에 따라 연장될 수 있습니다."*
   * **부품보유 3년은 이 앱에서 유일하게 삼성 표 밖에서 온 값이다** — 삼성 표의 최소가 3년
   * (생활용품·주방가전)이라 우연히 같아 보이지만 근거가 다르다. 지우거나 4년(컴퓨터 및
   * 주변기기)으로 맞추지 말 것.
   */
  ['JBL·하만카돈·AKG', '1년', 3, null, null],
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

/*
 * ── [3-b] 멤버십 무상수리 기간 연장 (2026-08-11 원문 확인) ──
 * 원문: samsung.com/sec/membership/membershipBluecare — "무상수리 서비스 기간을 총 3년으로 연장",
 * "기존 무상보증기간을 포함한 총 3년간의 무상수리 서비스 제공".
 *
 * **여기서 지켜야 할 것은 '3년'이라는 숫자가 아니라 '포함'이다.** 누가 이걸 "3년 연장"
 * 으로 고치면 기본 보증 2년인 냉방전용 에어컨 고객에게 1년을 더 약속하게 된다.
 */
if (A.ROYAL.ext !== '총 3년') fail(`로열블루 연장 기간이 "총 3년"이 아니다 — ${A.ROYAL.ext}`);
else pass('로열블루: 연장 기간 "총 3년" (원문값)');

const royalTxt = JSON.stringify(A.ROYAL);
if (!/기존 무상보증기간을 포함한 총 3년/.test(royalTxt))
  fail('"기존 무상보증기간을 포함한" 문구가 없다 — 3년이 더해지는 것으로 읽힌다');
else pass('로열블루: 기존 보증기간 "포함"임을 명시');

if (/(\+\s*3\s*년|3년\s*(추가|더))/.test(royalTxt))
  fail('"3년 추가"로 적었다 — 원문은 기존 보증을 포함한 총 3년이다');
else pass('로열블루: "3년 추가"로 오독될 표현 없음');

if (!/로열블루/.test(A.ROYAL.grade) || !/프레스티지/.test(A.ROYAL.grade))
  fail('대상 등급이 로열블루·프레스티지 둘 다가 아니다 — 원문은 둘 다 대상이다');
else pass('로열블루: 대상 등급 로열블루·프레스티지');

/* 대상 품목에서는 기간이 뜨고, 대상 아닌 품목에서는 뜨지 않아야 한다.
 * 후자가 핵심이다 — 김치냉장고 화면에 "총 3년"이 떠 있으면 그대로 잘못 안내된다. */
{
  const want = Object.entries(A.RB).filter(([, v]) => v[0] === 'ok').map(([k]) => k);
  const no = Object.entries(A.RB).filter(([, v]) => v[0] === 'no').map(([k]) => k);
  if (!want.length || !no.length) fail('RB 대상/제외 분류가 비어 있다');
  let e = 0;
  for (const k of want) {
    if (!A.DB[k]) { fail(`RB 에 있는 "${k}" 가 DB 에 없다`); e++; continue; }
    A.cur = k;
    const t = doc.querySelector('#body').textContent;
    if (!/총 3년/.test(t)) { fail(`${k}: 연장 대상인데 "총 3년"이 화면에 없다`); e++; }
    if (!/대상/.test(t)) { fail(`${k}: 연장 대상 표시가 없다`); e++; }
  }
  for (const k of no) {
    if (!A.DB[k]) { fail(`RB 에 있는 "${k}" 가 DB 에 없다`); e++; continue; }
    A.cur = k;
    const t = doc.querySelector('#body').textContent;
    if (/총 3년/.test(t)) { fail(`${k}: 연장 대상이 아닌데 "총 3년"이 화면에 떠 있다`); e++; }
    if (!/대상이 아닙니다/.test(t)) { fail(`${k}: 대상이 아니라는 표시가 없다`); e++; }
  }
  /* 4대 품목이 아닌 품목(원문이 다루지 않음)도 기간을 말하면 안 된다 */
  const na = Object.keys(A.DB).find((k) => !A.RB[k]);
  A.cur = na;
  const t = doc.querySelector('#body').textContent;
  if (/총 3년/.test(t)) { fail(`${na}: 4대 품목이 아닌데 "총 3년"이 떠 있다`); e++; }
  if (!e) pass(`멤버십 연장: 대상 ${want.length}품목만 기간 표시 · 제외 ${no.length}품목과 비대상은 "대상 아님"`);
}

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

/*
 * 번호는 **하나도 빠짐없이** 눌러서 걸 수 있어야 한다(share-kit 이 data-tel 로 시트를 띄운다).
 *
 * 예전에는 줄의 대표번호 하나만 눌렸다 — 서서울TC 처럼 번호가 셋인 곳에서 나머지 둘은
 * 눈으로 읽고 받아적어야 했다(2026-08-11 사용자 지적).
 */
const noTel = [...pane.querySelectorAll('#lglist .ct')]
  .filter((el) => !el.querySelector('[data-tel]'));
if (noTel.length) fail(`${noTel.length}개 센터 줄에 누를 수 있는 번호가 없다`);
else pass('21건 전부 눌러서 걸기 가능');

{
  // 화면에 적힌 번호 = 누를 수 있는 번호 (한 줄에 번호가 여럿이어도)
  const TELRE = /(1[5-9]\d{2}-\d{4}|0\d{1,2}-\d{3,4}-\d{4})/g;
  let shown = 0, missing = [];
  for (const row of pane.querySelectorAll('#lglist .ct')) {
    const tappable = new Set([...row.querySelectorAll('[data-tel]')].map((b) => b.textContent.trim()));
    for (const m of (row.textContent.match(TELRE) || [])) {
      shown++;
      if (![...tappable].some((t) => t.includes(m))) missing.push(m);
    }
  }
  if (missing.length) fail(`화면에 있는데 누를 수 없는 번호 ${missing.length}건 (예: ${missing.slice(0, 3).join(', ')})`);
  else pass(`물류센터에 보이는 번호 ${shown}개가 전부 눌린다`);

  // 서서울TC — 사용자가 짚은 그 줄. 대표 + 운영 2회선 = 3개가 모두 눌려야 한다
  const seo = [...pane.querySelectorAll('#lglist .ct')].find((r) => /서서울/.test(r.textContent));
  const nums = seo ? [...seo.querySelectorAll('[data-tel]')] : [];
  if (nums.length < 3) fail(`서서울TC 에서 누를 수 있는 번호가 ${nums.length}개 — 대표 1 + 운영 2 여야 한다`);
  else pass(`서서울TC 번호 ${nums.length}개 전부 눌린다`);

  /* 범위 표기(031-922-8546~7)는 화면에 그대로 두되 **거는 번호는 앞 번호**여야 한다.
     그대로 넘기면 숫자만 남겨 03192285467 로 잘못 걸린다. */
  const bad = [...pane.querySelectorAll('#contactPane [data-tel]')].filter((b) => /[~∼]/.test(b.dataset.tel));
  if (bad.length) fail(`걸기 번호에 범위 꼬리가 남은 것 ${bad.length}건 (예: ${bad[0].dataset.tel})`);
  else pass('범위 번호(~N)는 앞 번호로 걸린다');

  // 라벨 칸으로 세워 적는다 — ' · ' 로 이어 붙이면 좁은 화면에서 아무 데서나 줄이 바뀐다
  if (!seo || !seo.querySelector('.opsrow .opsl')) fail('상황실·운영 줄이 라벨 칸으로 정렬돼 있지 않다');
  else pass('번호 줄이 라벨 칸으로 정렬됨');

  /* 안내문에 박힌 번호도 눌려야 한다 — 목록이든 안내문이든 "보이면 눌린다"는 같다.
     접수 순서 3단계의 아비스 번호가 글자로만 있었다. */
  A.tab = 'contact';
  doc.querySelector('#g-mv').open = true;
  const step = [...doc.querySelectorAll('#g-mv .step')].find((e) => /1811-7958/.test(e.textContent));
  if (!step) fail('접수 순서에 아비스 번호가 없다');
  else if (!step.querySelector('[data-tel="1811-7958"]')) fail('접수 순서 안내문의 번호가 눌리지 않는다');
  else pass('안내문에 박힌 번호도 눌린다');

  /* 한 칸에 번호가 둘인 값(동탄 추가 회선 "031-377-9136 · 9137")은 각각 눌려야 하고,
     뒷자리만 적힌 번호는 앞 번호의 국번을 물려받아야 한다(원문 031-377-9135~7). */
  if (typeof window.renderB2B === 'function') window.renderB2B();
  const dt = [...doc.querySelectorAll('#itlist [data-tel]')].filter((b) => /9136|9137/.test(b.textContent));
  if (dt.length !== 2) fail(`동탄 추가 회선이 ${dt.length}개로 쪼개졌다 — 2개여야 한다`);
  else if (dt[1].dataset.tel !== '031-377-9137') fail(`뒷자리 번호가 ${dt[1].dataset.tel} — 031-377-9137 이어야 한다`);
  else pass('한 칸에 둘인 번호가 각각 눌리고 국번을 물려받는다');

  // 걸 수 없는 tel 값이 하나도 없어야 한다(숫자·하이픈·+ 만)
  const dial = [...doc.querySelectorAll('#contactPane [data-tel]')];
  const badDial = dial.filter((b) => !/^[\d+][\d\-+]*$/.test(b.dataset.tel));
  if (badDial.length) fail(`걸 수 없는 tel 값 ${badDial.length}건 (예: ${badDial[0].dataset.tel})`);
  else pass(`연락처 탭 번호 ${dial.length}개 전부 걸 수 있는 형식`);

  // 중첩 button 은 HTML 위반이라 클릭이 먹지 않는 브라우저가 있다
  const nested = doc.querySelectorAll('button button').length;
  if (nested) fail(`중첩 button ${nested}건 — 안쪽 번호가 눌리지 않을 수 있다`);
  else pass('중첩 button 없음');
}

// 출처 표기 — 지어낸 값이 아님을 화면이 밝히는가
if (!/센터별 배송 서비스지역/.test(pane.textContent)) fail('물류센터 출처 표기가 없다');
else pass('물류센터 출처 표기');

// 이제 물류센터는 채웠으므로 '미등록' 목록에서 빠져야 한다
if (A.CONTACTS && /물류센터/.test(JSON.stringify(pane.textContent.match(/아직 등록되지 않았습니다[^\n]*/) || ''))) {
  fail("물류센터를 채웠는데 아직 '미등록' 안내에 남아 있다");
} else pass("'미등록' 안내에서 물류센터 제거됨");

/* ────────────────────────────────────────────────────────────
 * [7] 이전설치·빌트인 탭 — B2B 관할 · 싱크장 리폼 · 접수 순서
 *
 * 출처는 사내 배포본 'B2B 이전설치 센터 권역현황·연락처'(2025.02)다.
 * 이 앱은 **로그인 없는 공개 주소**이고 저장소도 public 이라, 원문에 있는
 * 담당자 실명·개인 업무메일·직통번호·임원 명단은 **싣지 않는다.**
 * 아래 [7-d] 가 그것이 새어 들어오지 않았는지 검사한다.
 * ──────────────────────────────────────────────────────────── */
const B = A.B2B, S = A.SINK, N = A.B2B_NATION, IT = A.B2B_IT, MID = A.MID;
/* 사람 이름 + 직급 패턴. **직급 글자가 회사명 안에 들어 있는 경우를 걸러야 한다** —
 * '프로서비스'(순천 협력사)가 '프로' 로 잡혔다. 이름 뒤에 붙어 **거기서 끝나는** 것만 본다. */
const NAME_TITLE = /[가-힣]{2,3}(부장|차장|과장|대리|이사|상무|전무|사원|주임|파트장|센터장|프로)(?![가-힣])/;


// [7-a] 표 크기
if (!B || B.length !== 20) fail(`B2B 빌트인 관할이 ${B ? B.length : 0}행 — 원문은 20행이다`);
else pass('B2B 빌트인 관할 20행');
if (!S || S.length !== 4) fail(`싱크장 리폼 협력사가 ${S ? S.length : 0}곳 — 원문은 4곳이다`);
else pass('싱크장 리폼 협력사 4곳');
/* 전국 담당은 **품목별로 갈라 적는다** — 상담사는 "정수기 이전설치 어디죠"로 찾는다 */
if (!N || N.length !== 4) fail(`전국 담당이 ${N ? N.length : 0}건 — 인덕션·정수기·후드·시스템에어컨 4건이다`);
else pass('전국 담당 4건 (인덕션 · 정수기 · 후드 · 시스템에어컨)');
{
  /* **번호는 지역이 아니라 품목으로 갈린다.** 중앙에너지 한 곳이 전국을 맡고 접수는
     본사콜 하나이며, 후드만 전용 회선이다. 지역별로 갈리는 것은 설치 지사(19곳)이고
     그 지사들의 개별 번호는 원문에 없다 — 없는 번호를 만들어 넣지 않는다. */
  for (const [key, tel, partner] of [
    ['ind', '1899-4850', '중앙에너지'], ['wat', '1899-4850', '중앙에너지'],
    ['hood', '1577-5488', '중앙에너지'], ['sac', '031-222-6666', '티지이엔지'],
  ]) {
    const x = N.find((v) => v.key === key);
    if (!x) fail(`전국 담당에 ${key} 가 없다`);
    else if (x.n !== tel || x.p !== partner) fail(`${key}: ${x.p}/${x.n} — ${partner}/${tel} 이어야 한다`);
  }
  pass('품목별 번호 골든 4건 (후드만 전용 회선)');
  if (N.find((v) => v.key === 'ind').n !== N.find((v) => v.key === 'wat').n) {
    fail('인덕션·정수기는 같은 본사콜이어야 한다');
  } else pass('인덕션 = 정수기 본사콜 (같은 번호)');

  if (!MID || MID.length !== 19) fail(`중앙에너지 설치 지사가 ${MID ? MID.length : 0}곳 — 원문은 19곳이다`);
  else pass('중앙에너지 설치 지사 19곳');
  // 지사별 전화번호는 원문에 없다 — 생기면 지어낸 것이다
  if (/\d{2,4}-\d{3,4}-\d{4}|\d{4}-\d{4}/.test(JSON.stringify(MID))) {
    fail('설치 지사 표에 전화번호가 들어 있다 — 원문에는 없다');
  } else pass('설치 지사에 지어낸 번호 없음');
  for (const [g, area] of [['원주지사', '평창군'], ['양산지사', '울산'], ['제주지사', '제주시']]) {
    const m = MID.find((x) => x.g === g);
    if (!m || !m.a.includes(area)) fail(`${g} 관할에 ${area} 가 없다`);
  }
  pass('설치 지사 관할 골든 3건');
}
if (!IT || IT.length !== 12) fail(`B2B IT 관할이 ${IT ? IT.length : 0}행 — 원문은 12행이다`);
else pass('B2B IT 관할 12행');

/* IT 번호는 원문에서 담당자 이름 옆에 있어 대표번호인지 직통인지 알 수 없었다.
 * 2026-08-11 사용자가 대표번호로 확인해 줘서 실었다. 원주·제주 번호가 가전 표의
 * 협력사 대표번호와 **정확히 같다** — 그 확인과 맞아떨어지는 교차검증이다. */
for (const [center, tel] of [
  ['동탄', '031-377-9135'], ['원주', '033-731-3432'], ['대구', '070-7706-2147'],
  ['세종', '070-7110-7303'], ['익산', '062-972-2118'], ['제주', '064-756-3260'],
]) {
  const r = IT.find((x) => x.c === center);
  if (!r) fail(`B2B IT 관할에 ${center} 가 없다`);
  else if (r.n !== tel) fail(`IT ${center} 번호가 ${r.n} — 원문은 ${tel}`);
}
pass('B2B IT 골든 6건');
for (const [center, gajeon] of [['원주', '디앤아이'], ['제주', '새론']]) {
  const it = IT.find((x) => x.c === center), ga = B.find((x) => x.c === center);
  if (!it || !ga || it.n !== ga.n || it.p !== gajeon) {
    fail(`${center}: IT 번호(${it && it.n})와 가전 번호(${ga && ga.n})가 달라 대표번호 교차검증에 실패`);
  }
}
pass('IT ↔ 가전 대표번호 교차검증 2건 (원주 · 제주)');

// [7-b] 골든값 — 원문에서 눈으로 확인한 값. 번호가 틀리면 고객을 엉뚱한 곳으로 보낸다.
for (const [partner, center, tel] of [
  ['경성티에스', '인천', '032-672-3624'],
  ['명일', '동서울', '031-527-6745'],
  ['대양빌텍', '화성', '1577-8691'],
  ['성광티시엠', '포항', '055-371-2329'],
  ['새론', '제주', '064-756-3260'],
  ['디앤아이', '원주', '033-731-3432'],
]) {
  const r = B.find((x) => x.p === partner && x.c === center);
  if (!r) fail(`B2B 관할에 ${partner}·${center} 가 없다`);
  else if (r.n !== tel) fail(`${partner}·${center} 번호가 ${r.n} — 원문은 ${tel}`);
}
pass('B2B 골든 6건 (협력사·센터·이전설치 문의번호)');

// 싱크장 리폼 — 아비스만 대표번호와 이전설치 문의번호가 다르다(원문 확인)
const abis = S.find((x) => /아비스/.test(x.p));
if (!abis || abis.n !== '1811-7958' || abis.n2 !== '1644-0385') {
  fail(`아비스 번호가 ${abis && abis.n}/${abis && abis.n2} — 원문은 1811-7958 / 1644-0385`);
} else pass('아비스 대표 1811-7958 · 이전설치 1644-0385');
for (const [p, tel] of [['에스엘피', '1577-6066'], ['성광티시엠', '1522-0481'], ['아이시티', '1811-6759']]) {
  const r = S.find((x) => x.p === p);
  if (!r || r.n !== tel) fail(`싱크장 리폼 ${p} 번호가 ${r && r.n} — 원문은 ${tel}`);
}
pass('싱크장 리폼 골든 3건');

// [7-c] 협력사 단위로 번호가 하나여야 한다 — 원문의 '이전설치 문의전화' 칸이 병합돼 있다
{
  const byP = {};
  for (const r of B) (byP[r.p] = byP[r.p] || new Set()).add(r.n);
  const split = Object.entries(byP).filter(([, v]) => v.size > 1);
  if (split.length) fail(`한 협력사에 번호가 여럿이다: ${split.map(([k, v]) => `${k}(${[...v].join('/')})`).join(', ')}`);
  else pass('협력사 하나당 이전설치 문의번호 하나 (원문 병합셀과 일치)');
}

// [7-d] **개인정보가 새어 들어오지 않았는가** — 이것이 이 구간의 핵심이다
{
  const blob = JSON.stringify([B, S, N, IT]);
  const leaks = [];
  if (/@/.test(blob)) leaks.push('이메일 주소');
  if (NAME_TITLE.test(blob)) leaks.push('직급이 붙은 사람 이름');
  /* **막는 것은 `010`(휴대폰) 하나다**(2026-08-11 사용자 지시: "010번호를 제외한
     나머지번호는 적혀있는대로 적어주세요"). 나머지 국번은 업무 회선이라는 것이
     자료 소유자의 판단이고, 실제로 070 둘은 협력사 대표번호로 확인됐다.
     이름·이메일 검사는 그대로 둔다 — 지시는 **번호**에 대한 것이었다. */
  if (/010-\d{3,4}-\d{4}/.test(blob)) leaks.push('개인 휴대폰(010) 번호');
  if (leaks.length) fail(`공개 데이터에 개인정보가 들어 있다: ${leaks.join(' · ')}`);
  else pass('개인정보 미포함 (이메일 · 담당자 실명 · 010 번호 없음)');

  /* **원문에 적힌 번호가 빠지지 않았는가.** 한동안 '이전설치 문의전화' 칸만 옮겨
     물류전화가 통째로 사라져 있었다 — 경성티에스는 두 번호가 다르다. */
  for (const [where, tel] of [
    ['경성티에스 물류', '032-675-5100'],
    ['중앙에너지 물류', '032-675-3311'],
    ['중앙에너지 후드', '1577-5488'],
    ['아비스 물류', '031-270-3871~5'],
    ['디앤아이 IT 추가회선', '031-377-9136'],
  ]) {
    if (!blob.includes(tel)) fail(`원문의 ${where} 번호 ${tel} 가 빠져 있다`);
  }
  pass('원문에 따로 적힌 번호 5건 유지 (물류전화 · 후드 · 추가 회선)');

  // 임원 명단은 통째로 들어오면 안 된다
  if (/(대표이사|인사팀장|지원팀장|국판팀장|지사장)/.test(html)) fail('원문의 임원 명단이 소스에 남아 있다');
  else pass('임원 명단 미포함');
}

// [7-e] 화면 — 탭이 셋이고, 이전설치 탭이 렌더되며 관할 검색이 걸리는가
{
  const tabs = doc.querySelectorAll('.mode-tab');
  /* **AS센터 찾기가 가운데다**(2026-08-27 사장님 지시) — 상담 흐름이
     "보증기간 → 어디로 가나 → 누구에게 거나" 순이다. 순서까지 검사한다. */
  const want = ['as', 'center', 'contact'];
  const got = [...tabs].map((t) => t.dataset.tab);
  if (got.length !== 3) fail(`탭이 ${got.length}개 — AS기간 · AS센터 찾기 · 연락처 셋이어야 한다`);
  else if (got.join(',') !== want.join(',')) fail(`탭 순서가 ${got.join('·')} — AS센터가 가운데여야 한다`);
  else pass('탭 3개 · AS센터 찾기가 가운데');

  /* 연락처 탭은 **세 묶음으로 접혀** 있다(2026-08-11 사용자 요청 — 다 펼쳐 두면 예순 줄이
     넘어 상담 중에 못 읽는다). 기본은 닫힘이고 눌러야 열린다. */
  A.tab = 'contact';
  const mp = doc.querySelector('#contactPane');
  /* **묶음은 품목·업무 단위로 쪼갠다**(2026-08-11 사용자 요청). 상담사는 "정수기 이전설치
     어디죠"로 찾지 "B2B 협력사가 뭐죠"로 찾지 않는다. 담당이 갈리는 단위가 곧 찾는 단위다. */
  const WANT = 'g-as,g-hm,g-lg,g-mv,g-sink,g-ind,g-wat,g-hood,g-sac,g-it';
  const grps = [...mp.querySelectorAll('.grp')];
  if (grps.map((g) => g.id).join(',') !== WANT) {
    fail(`묶음이 [${grps.map((g) => g.id).join(',')}] — [${WANT}] 여야 한다`);
  } else pass(`연락처 탭 묶음 ${grps.length}개 (AS·수리 / 하만 오디오 / 물류 / 빌트인 / 리폼 / 인덕션 / 정수기 / 후드 / 시스템에어컨 / IT)`);
  if (grps.some((g) => g.open)) fail('묶음이 기본으로 펼쳐져 있다 — 눌러야 열려야 한다');
  else pass('묶음 기본 접힘');
  // 열어 보지 않고도 무엇이 얼마나 있는지 알아야 한다
  for (const [id, n] of [['g-as', A.CONTACTS.reduce((a, g) => a + g.items.length, 0)],
                         ['g-hm', 1], ['g-lg', A.CENTERS.length], ['g-mv', B.length], ['g-sink', S.length],
                         ['g-ind', 1], ['g-wat', 1], ['g-hood', 1], ['g-sac', 1], ['g-it', IT.length]]) {
    const el = mp.querySelector(`#${id} .gc`);
    if (!el) { fail(`${id} 묶음이 없다`); continue; }
    if (el.textContent !== `${n}건`) fail(`${id} 묶음 제목의 건수가 "${el.textContent}" — "${n}건" 이어야 한다`);
  }
  pass('묶음 제목에 건수 표기 (6·1·21·20·4·1·1·1·1·12)');

  /* '아직 등록되지 않은 연락처' 카드는 없앴다 — 비워 뒀던 둘이 실제로 채워졌기 때문이다.
     채운 자료 옆에 "미등록"이 남아 있으면 그 자료까지 미등록으로 읽힌다. */
  if (/등록되지 않은/.test(mp.textContent)) fail("'아직 등록되지 않은 연락처' 카드가 남아 있다");
  else pass("'미등록 연락처' 카드 제거됨");
  const rows = () => mp.querySelectorAll('#b2blist .ct').length;
  if (rows() !== 20) fail(`이전설치 탭에 ${rows()}건 렌더 — 20건이어야 한다`);
  else pass('이전설치 탭 렌더 20건');

  const q = mp.querySelector('#b2bq');
  const type = (v) => { q.value = v; q.dispatchEvent(new window.Event('input')); };
  type('청주');
  const first = mp.querySelector('#b2blist .ct');
  if (rows() !== 1 || !/대양빌텍/.test(first.textContent)) {
    fail(`'청주' 검색 → ${rows()}건 — 대양빌텍(세종) 하나여야 한다`);
  } else pass("'청주' 검색 → 대양빌텍(세종) 하나");
  type('');
  if (rows() !== 20) fail('검색어를 지웠는데 20건으로 돌아오지 않는다');
  else pass('검색어 해제 시 전체 복원');

  // 리폼이 먼저라는 안내가 화면에 있어야 한다 — 번호만 알면 그 자리에서 설치가 무산된다
  if (!/리폼/.test(mp.textContent) || !/1811-7958/.test(mp.textContent)) {
    fail('식기세척기 이전설치 순서 안내(싱크대 리폼 선행 · 아비스 1811-7958)가 화면에 없다');
  } else pass('식기세척기 리폼 선행 안내 노출');

  // IT 부문도 같은 검색칸으로 함께 걸러져야 한다 — 상담사는 지역을 칠 뿐이다
  const itRows = () => mp.querySelectorAll('#itlist .ct').length;
  if (itRows() !== 12) fail(`B2B IT 목록에 ${itRows()}건 렌더 — 12건이어야 한다`);
  else pass('B2B IT 렌더 12건');
  /* 한 검색칸이 두 표를 함께 거르고, **같은 지역이라도 담당이 갈린다**는 것이 보여야 한다 —
     안동은 가전 성광티시엠 / IT 다존텍이다. 표를 합쳤다면 이 검사가 깨진다. */
  /* 가전과 IT 는 묶음이 갈렸으므로 **검색칸도 각자** 쓴다. 같은 안동인데 담당이 다르다 */
  const itq = mp.querySelector('#itq');
  const typeIt = (v) => { itq.value = v; itq.dispatchEvent(new window.Event('input')); };
  type('안동'); typeIt('안동');
  const ga = mp.querySelector('#b2blist .ct');
  const it = mp.querySelector('#itlist .ct');
  if (rows() !== 1 || itRows() !== 1) {
    fail(`'안동' → 가전 ${rows()}건 / IT ${itRows()}건 — 각각 1건이어야 한다`);
  } else if (!/성광티시엠/.test(ga.textContent) || !/다존텍/.test(it.textContent)) {
    fail(`'안동' 담당이 가전 ${ga.textContent.slice(0, 10)} / IT ${it.textContent.slice(0, 10)} — 성광티시엠 / 다존텍이어야 한다`);
  } else pass("'안동' → 가전 성광티시엠 · IT 다존텍 (담당이 갈린다)");
  type(''); typeIt('');

  // 줄마다 대표번호 + 원문에 따로 적힌 번호(물류·후드 등)가 **전부** 눌려야 한다
  const noTel = [...mp.querySelectorAll('#b2blist .ct, #itlist .ct')]
    .filter((el) => !el.querySelector('[data-tel]'));
  if (noTel.length) fail(`${noTel.length}건에 누를 수 있는 번호가 없다`);
  else pass('이전설치 32건 전부 눌러서 걸기 가능');

  {
    const TELRE = /(1[5-9]\d{2}-\d{4}|0\d{1,2}-\d{3,4}-\d{4})/g;
    const missing = [];
    for (const row of mp.querySelectorAll('#b2blist .ct, #itlist .ct')) {
      const tap = [...row.querySelectorAll('[data-tel]')].map((b) => b.textContent.trim());
      for (const m of (row.textContent.match(TELRE) || [])) {
        if (!tap.some((t) => t.includes(m))) missing.push(m);
      }
    }
    if (missing.length) fail(`이전설치에 보이는데 못 누르는 번호 ${missing.length}건 (예: ${missing.slice(0, 3).join(', ')})`);
    else pass('이전설치 줄의 추가 회선·물류번호까지 전부 눌린다');
  }
}

/* ────────────────────────────────────────────────────────────
 * [8] 상단 통합 검색 — 세 탭에 흩어진 것을 한 칸에서 찾는가
 * 찾기만 하고 데려가지 않으면 상담사는 다시 탭을 뒤져야 한다.
 * ──────────────────────────────────────────────────────────── */
{
  A.tab = 'as';
  for (const [q, needle] of [
    ['수원', '평택TC'],
    ['냉장고', '냉장고'],
    ['김해', '양산TC'],
    ['아비스', '아비스'],
    ['청주', '대양빌텍'],
  ]) {
    const r = A.search(q);
    if (!r.length) fail(`상단 검색 "${q}" → 0건`);
    else if (!r.some((t) => t.includes(needle))) fail(`상단 검색 "${q}" 결과에 "${needle}" 가 없다: ${r.join(', ')}`);
  }
  pass('상단 검색 5건 대표 질의 통과');

  // 조건을 겹치면 좁아져야 한다(AND)
  const a = A.search('냉장고').length, b = A.search('냉장고 컴프레서').length;
  if (!(b > 0 && b <= a)) fail(`상단 검색 AND 가 안 걸린다 — 냉장고 ${a} / 냉장고 컴프레서 ${b}`);
  else pass(`상단 검색 다조건 AND (냉장고 ${a} → 냉장고 컴프레서 ${b})`);

  /*
   * **한 글자는 조건으로 쓰지 않는다**(2026-08-11 사용자 지적: *"AS 검색에서 검색해도
   * 다른 내용도 검색이 됩니다"*). 판정이 `kw.includes` 라 한 글자면 어디에나 걸렸다 —
   * 실측으로 '장' 23건 · '기' 58건 · '이' 52건 · '대' 40건이 무작위로 나왔다.
   * 허브 통합검색이 같은 이유로 이미 막아 둔 규칙이다.
   */
  const oneChar = ['장', '기', '이', '대', '스', '1'].map((c) => [c, A.search(c).length]).filter(([, n]) => n > 0);
  if (oneChar.length) fail(`한 글자로 결과가 나온다 — ${oneChar.map(([c, n]) => `${c} ${n}건`).join(' · ')}`);
  else pass('한 글자는 조건으로 쓰지 않는다 (6자 전부 0건)');

  /*
   * **화면에 적힌 말로 찾아져야 한다.** 아래는 전부 예전에 0건이던 것들이다 —
   * '로열블루'는 멤버십 카드가 색인에 아예 없었고, 나머지는 조사·꼬리말이 붙어 죽었다.
   */
  for (const [q, needle] of [
    ['로열블루', '로열블루'],
    ['멤버십 연장', '로열블루'],
    ['냉장고 보증기간', '냉장고'],
    ['에어컨 몇년', '에어컨'],
    ['부품보유기간', '냉장고'],
    ['드럼세탁기 dd모터 몇 년 보증인가요', '세탁기'],
  ]) {
    const r = A.search(q);
    if (!r.length) fail(`"${q}" → 0건 — 화면에 있는 말로 못 찾는다`);
    else if (!r.some((t) => t.includes(needle))) fail(`"${q}" 결과에 "${needle}" 가 없다: ${r.slice(0, 3).join(', ')}`);
  }
  pass('상담사가 쓰는 말(조사·꼬리말·표기 짝) 6건 통과');

  // 없는 말은 0건이어야 한다 — 아무거나 무는 검색은 없느니만 못하다
  if (A.search('없는말없는말').length) fail('없는 말로 검색했는데 결과가 나온다');
  else pass('없는 말 → 0건');

  // 고르면 그 탭으로 데려가는가
  /* 고른 결과가 **접힌 묶음 안에 있으면 아무 일도 안 일어난 것처럼 보인다** —
     찾아 준 뜻이 없어지므로 탭 전환 + 묶음 펼침 + 목록 필터가 함께 걸려야 한다. */
  for (const [q, needle, gid, listId] of [
    ['청주', /대양빌텍/, 'g-mv', '#b2blist'],
    ['수원', /평택TC/, 'g-lg', '#lglist'],
    ['삼성전자서비스', /삼성전자서비스/, 'g-as', null],
    ['정수기 이전설치', /정수기 이전설치/, 'g-wat', null],
    ['광주지사', /광주지사/, 'g-ind', null],
  ]) {
    A.tab = 'as';
    for (const g of doc.querySelectorAll('.grp')) g.open = false;
    const inp = doc.querySelector('#sq');
    inp.value = q;
    inp.dispatchEvent(new window.Event('input'));
    const btn = [...doc.querySelectorAll('#sres .sr')].find((el) => needle.test(el.textContent));
    if (!btn) { fail(`상단 검색 '${q}' 결과에 ${needle} 줄이 없다`); continue; }
    btn.click();
    if (A.tab !== 'contact') fail(`'${q}' 를 눌렀는데 탭이 ${A.tab} — contact 로 가야 한다`);
    else if (!doc.querySelector(`#${gid}`).open) fail(`'${q}' 를 눌렀는데 ${gid} 묶음이 안 열렸다`);
    else if (listId && doc.querySelectorAll(`${listId} .ct`).length !== 1) {
      fail(`'${q}' 를 눌렀는데 ${listId} 가 ${doc.querySelectorAll(`${listId} .ct`).length}건 — 1건으로 좁혀져야 한다`);
    } else continue;
  }
  pass('검색 결과를 누르면 탭 전환 + 묶음 펼침 + 목록 필터가 함께 걸린다 (5건)');
}

/* ────────────────────────────────────────────────────────────
 * [9] 센터별 상황실 · 운영 · VOC (운영업무 협조(B2C) · VOC 연락처(B2C) 표)
 * 두 표 모두 행 단위가 물류센터라 CENTERS 에 코드로 붙였다 — 따로 실으면 같은 센터가
 * 세 번 나온다. 아래가 그 이어붙임이 어긋나지 않았는지 검사한다.
 * ──────────────────────────────────────────────────────────── */
const OPS = A.OPS, VOCHQ = A.VOC_HQ;

// [9-a] 21곳 전부에 붙었는가 — 하나라도 빠지면 그 센터만 정보가 없는 채로 남는다
{
  const miss = C.filter((c) => !OPS[c.code]).map((c) => c.t);
  if (miss.length) fail(`상황실·운영 정보가 없는 센터: ${miss.join(', ')}`);
  else pass(`센터 ${C.length}곳 전부에 상황실·운영 연락처 연결`);
  const orphan = Object.keys(OPS).filter((k) => !C.some((c) => c.code === k));
  if (orphan.length) fail(`CENTERS 에 없는 코드가 OPS 에 있다: ${orphan.join(', ')}`);
  else pass('OPS 코드가 전부 실제 센터를 가리킴');
}

// [9-b] **상황실 번호 = 물류 대표번호** — 21곳 중 19곳이 일치한다.
// 두 자료(‘센터별 배송 서비스지역’ 26.1.2 · ‘B2B 권역현황’ 25.02)가 서로를 검산해 준다.
// 어긋난 둘만 sitN 으로 따로 싣는다 — 그 예외가 늘어나면 어느 한쪽 표기가 틀린 것이다.
{
  const diff = C.filter((c) => OPS[c.code].sitN).map((c) => c.t).sort();
  if (diff.join(',') !== '울산TC,창원TC') {
    fail(`상황실 번호가 물류 대표번호와 다른 센터가 [${diff.join(', ')}] — 울산TC·창원TC 둘이어야 한다`);
  } else pass('상황실 = 물류 대표번호 19/21 (다른 곳은 울산·창원뿐, 양쪽 다 표기)');
  if (OPS.L128.sitN !== '054-254-0725' || OPS.L127.sitN !== '070-4694-4540') {
    fail(`울산/창원 상황실 번호가 ${OPS.L128.sitN}/${OPS.L127.sitN} — 054-254-0725/070-4694-4540 이어야 한다`);
  } else pass('울산·창원 상황실 골든값');
}

// [9-c] 골든값 — 원문에서 눈으로 옮긴 값
for (const [code, sit, job, first] of [
  ['L104', '명일', '가전 AC', '031-922-8544'],
  ['L113', '삼우 F&G', '가전 AC', '032-678-8074'],
  ['L133', '지엘', '통합', '031-799-5042'],
  ['L117', '스마트로지텍', '가전 AC', '044-271-2926'],
  ['L106', '새론', '통합', '064-724-1735'],
]) {
  const o = OPS[code];
  if (o.sit !== sit || o.job !== job || o.op[0] !== first) {
    fail(`${code}: ${o.sit}/${o.job}/${o.op[0]} — ${sit}/${job}/${first} 이어야 한다`);
  }
}
pass('상황실·업무·운영 골든 5건');

// 업무 구분은 원문의 두 값뿐이다
{
  const bad = Object.entries(OPS).filter(([, o]) => !['가전 AC', '통합'].includes(o.job));
  if (bad.length) fail(`업무 구분이 원문에 없는 값: ${bad.map(([k, o]) => `${k}=${o.job}`).join(', ')}`);
  else pass("업무 구분은 '가전 AC' / '통합' 둘뿐");
}

// [9-d] **010 은 여기서도 막는다.** 원문 VOC 표의 화성·원주는 010 번호밖에 없어 비워 뒀다 —
// 그 둘에 voc 가 생겼다면 010 을 옮겨 온 것이다.
{
  const blob = JSON.stringify([OPS, VOCHQ]);
  if (/010-\d{3,4}-\d{4}/.test(blob)) fail('상황실·운영·VOC 에 010 번호가 들어 있다');
  else pass('상황실·운영·VOC 에 010 없음');
  if (/@/.test(blob)) fail('상황실·운영·VOC 에 이메일이 들어 있다');
  else if (NAME_TITLE.test(blob)) fail('상황실·운영·VOC 에 직급 붙은 사람 이름이 들어 있다');
  else pass('담당자 이름·이메일 미포함');
  for (const code of ['L108', 'L115']) {
    if ((OPS[code].voc || []).length) fail(`${code}: 원문 VOC 는 010 뿐이라 비어 있어야 한다`);
  }
  pass('화성·원주 VOC 는 비움 (원문에 010 뿐)');
}

// [9-e] VOC 본사 창구 + 화면 렌더 + 번호로 되짚기
{
  if (VOCHQ.n !== '031-270-3518') fail(`VOC 본사 번호가 ${VOCHQ.n} — 031-270-3518 이어야 한다`);
  else pass('물류 VOC 본사 창구 031-270-3518');

  A.tab = 'contact';
  const pane = doc.querySelector('#contactPane');
  pane.querySelector('#g-lg').open = true;
  // 라벨 칸(.opsl)으로 세워 적는다 — 센터마다 최소 '상황실' 한 줄이 붙는다
  const lines = [...pane.querySelectorAll('#lglist .opsl')].filter((e) => e.textContent === '상황실');
  if (lines.length < C.length) fail(`상황실 줄이 ${lines.length}개 — 센터 ${C.length}곳에 다 붙어야 한다`);
  else pass(`상황실 줄 ${lines.length}개 렌더`);

  // 번호를 보고 어느 센터인지 되짚는 일이 실제로 있다
  const q = pane.querySelector('#lgq');
  const type = (v) => { q.value = v; q.dispatchEvent(new window.Event('input')); };
  type('031-270-3813');
  const hit = pane.querySelectorAll('#lglist .ct');
  if (hit.length !== 1 || !/평택TC/.test(hit[0].textContent)) {
    fail(`운영 번호로 역검색 → ${hit.length}건 — 평택TC 하나여야 한다`);
  } else pass("운영 번호 '031-270-3813' 로 평택TC 역검색");
  type('스마트로지텍');
  const h2 = pane.querySelectorAll('#lglist .ct');
  if (h2.length !== 1 || !/세종TC/.test(h2[0].textContent)) {
    fail(`상황실 협력사로 역검색 → ${h2.length}건 — 세종TC 하나여야 한다`);
  } else pass("상황실 협력사 '스마트로지텍' 으로 세종TC 역검색");
  type('');

  // 에어컨 동시 발송 주의 — 원문 머리에 적힌 것이라 빠지면 안 된다
  if (!/수원.*평택TC 주문을 동시/.test(pane.textContent)) fail('에어컨 수원·평택TC 동시 발송 주의가 화면에 없다');
  else pass('에어컨 동시 발송 주의 노출');
}

/*
 * ── [12] 통합검색이 보낸 딥링크가 **실제로 착지하는가** ──
 *
 * 허브 통합검색은 `/as?q=<제목>` 으로 보내고, 앱은 그 값으로 `searchDocs()` 에서
 * 항목을 찾아 `go()` 를 부른다. 제목이 한 글자라도 다르면 **예외도 경고도 없이**
 * 검색 결과만 뜨고 끝난다 — 화면으로는 알기 어렵다.
 *
 * `test-search ④-c` 도 같은 것을 보지만, 그쪽은 앱의 **데이터에서 제목을 다시 만들어**
 * 색인과 맞춰 본다 — 앱이 그 문서를 실제로 만드는지는 볼 수 없다. 여기서는
 * **앱이 실제로 내놓는 목록**(`searchDocs()`)과 대조한다.
 *
 * 제목이 맞아도 **`go()` 가 화면을 안 바꾸면 소용이 없다.** 멤버십 항목이 그랬다 —
 * `setTab('as'); revealBody()` 뿐이라 AS 탭이 이미 기본 화면이어서 눌러도 그대로였고,
 * 정작 멤버십 카드는 본문 한참 아래에 있었다(2026-08-13 딥링크 전수 확인에서 드러났다).
 * 그래서 그 항목만은 **어디로 데려가는지**까지 검사한다.
 */
{
  const idxPath = path.join(root, 'public', 'search-index.json');
  if (!fs.existsSync(idxPath)) {
    console.log('SKIP: search-index.json 이 없어 딥링크 착지 검사를 건너뜁니다');
  } else if (typeof A.searchDocs !== 'function') {
    fail('as-app 이 searchDocs 를 내보내지 않는다 — 딥링크 착지를 검사할 수 없다');
  } else {
    const entries = JSON.parse(fs.readFileSync(idxPath, 'utf8')).entries || [];
    const titles = new Set(A.searchDocs().map((d) => d.title));
    const links = entries.filter((e) => e.m === 'as' && (e.href || '').startsWith('/as?q='))
      .map((e) => ({ title: e.title, q: decodeURIComponent(e.href.slice('/as?q='.length)) }));
    const miss = links.filter((l) => !titles.has(l.q));
    if (!links.length) fail('색인에 AS 딥링크가 하나도 없다 — build:index 를 다시 돌렸는가');
    else if (miss.length)
      fail(`AS 딥링크 ${miss.length}건이 앱 목록에 없는 제목을 가리킨다(그 항목으로 안 열린다): `
        + miss.slice(0, 5).map((l) => `"${l.q}"`).join(' · '));
    else pass(`AS 딥링크 ${links.length}건이 전부 앱 항목(${titles.size}개)에 착지한다`);

    /* 멤버십 항목은 **카드까지** 데려가야 한다 — 대상 품목으로 옮기고 카드가 화면에 있어야 한다 */
    const royal = A.searchDocs().find((d) => d.kind === '멤버십');
    if (!royal) fail('멤버십 항목이 AS 검색 목록에 없다');
    else {
      A.cur = '노트북';                       // 연장 대상이 아닌 품목에서 출발시킨다
      royal.go();
      const card = doc.getElementById('royalCard');
      const okTarget = (A.RB[A.cur] || [])[0] === 'ok';
      if (!card) fail('멤버십 딥링크 뒤에도 #royalCard 가 화면에 없다 — 카드로 데려가지 못한다');
      else if (!okTarget) fail(`멤버십 딥링크가 연장 대상이 아닌 품목('${A.cur}')에 머문다 — 카드가 "대상 아님"만 보여준다`);
      else if (!/총 3년/.test(card.textContent)) fail('멤버십 카드에 연장 기간(총 3년)이 안 보인다');
      else pass(`멤버십 딥링크가 대상 품목('${A.cur}')의 카드로 데려간다`);
    }
  }
}


/*
 * ── [14] 하만 오디오(JBL · harman/kardon · AKG) ──
 *
 * 사장님 지적으로 넣었다(2026-08-27) — *"JBL 그룹 계열 상품 AS 관련 정보 및 AS 기간
 * 정보가 누락"*. 이 품목은 **이 앱에서 유일하게 출처가 삼성전자서비스가 아니다.**
 * 그래서 값이 아니라 **어느 원문에서 왔는지**까지 검사한다 — 삼성 기준을 그대로 갖다
 * 쓰면 영수증이 없을 때 "생산년월 + 3개월"로 안내하게 되는데 하만은 "제조번호 회수일자
 * + 15개월" 이다. 그 한 줄이 상담에서 그대로 분쟁이 된다.
 */
{
  const KEY = 'JBL·하만카돈·AKG';
  const d = A.DB[KEY];
  if (!d) fail(`품목 '${KEY}' 이 없다 — 하만 계열 AS 정보가 누락된 상태다`);
  else {
    /* 출처가 하만이어야 한다. 삼성 원문에는 이 브랜드가 한 줄도 없다(전수 확인) */
    if (!d.src || !/harmansvc\.co\.kr/.test(d.src[1]))
      fail('하만 품목의 출처가 하만 공식 안내(harmansvc.co.kr)가 아니다');
    else pass('하만 품목의 출처가 하만 공식 서비스센터 안내');

    /* 삼성 공통 RULES 를 쓰면 안 된다 — 영수증 없을 때의 기산이 다르다 */
    if (!d.rules || !d.rules.length) fail('하만 품목이 삼성 공통 RULES 를 쓴다 — 영수증 없을 때 기산이 다르다');
    else if (!d.rules.some((r) => /15개월/.test(r.t)))
      fail('하만 적용 기준에 "제조번호 회수일자로부터 15개월" 이 없다');
    else if (d.rules.some((r) => /3개월 감안|생산년월/.test(r.t)))
      fail('하만 적용 기준에 삼성의 "생산년월 + 3개월" 이 섞였다');
    else pass('하만 적용 기준이 하만 원문 기준 (영수증 없으면 회수일자 + 15개월)');

    /* 영업용 단축은 삼성 1/2 과 결과가 같지만 원문 표기가 "절반(6개월)" 이다 */
    if (!/6개월/.test(d.baseNote || '')) fail('하만 영업용 단축(6개월) 표기가 없다');
    else pass('하만 영업용 단축 6개월 표기');

    /* 화면이 실제로 그렇게 그리는가 — 값만 맞고 화면이 삼성 출처를 적으면 소용없다 */
    A.cur = KEY;
    const bodyEl = doc.getElementById('body');
    const body = bodyEl.textContent;
    /* **출처는 링크로 판정한다.** 본문에는 *"삼성전자서비스 '보증기간 산정기준'에
       나오지 않습니다"* 라는 부인 문구가 일부러 들어 있어 글자로 보면 뒤집힌다. */
    const links = [...bodyEl.querySelectorAll('.src a')].map((a) => a.getAttribute('href') || '');
    if (!/12개월|1년/.test(body)) fail('하만 화면에 보증기간이 안 보인다');
    else if (!/3년/.test(body)) fail('하만 화면에 부품보유 3년이 안 보인다');
    else if (links.some((u) => /samsungsvc\.co\.kr/.test(u)))
      fail('하만 화면이 삼성전자서비스 원문을 출처 링크로 걸고 있다');
    else if (!links.some((u) => /harmansvc\.co\.kr/.test(u)))
      fail('하만 화면에 하만 출처 링크가 없다');
    else if (!/나오지 않습니다|없어/.test(body))
      fail('하만 화면이 "삼성 원문에는 이 브랜드가 없다"는 사실을 밝히지 않는다');
    else pass('하만 화면이 하만 출처만 링크하고, 삼성 원문에 없다는 사실을 밝힌다');

    /* 멤버십 연장 대상이 아니다 — 4대 품목이 아니고, 애초에 삼성전자서비스가 수리하지 않는다 */
    if ((A.RB[KEY] || [])[0] === 'ok') fail('하만이 멤버십 무상수리 연장 대상으로 표시된다');
    else if (/총 3년/.test(doc.getElementById('royalCard').textContent))
      fail('하만 품목에 멤버십 연장 기간(총 3년)이 떠 있다');
    else pass('하만은 멤버십 연장 대상 아님으로 표시');

    /* 삼성 사운드바·헤드폰을 열었을 때 하만으로 가는 길이 있어야 한다 —
       그쪽은 접수처도 부품보유기간도 다른데 화면이 같아 보이면 그대로 잘못 안내한다 */
    for (const k of ['사운드바', '헤드폰·이어폰']) {
      if (!/JBL|하만/.test(A.DB[k].note || '')) fail(`'${k}' 에 하만은 기준이 다르다는 안내가 없다`);
    }
    pass('삼성 사운드바·헤드폰에 "하만은 기준이 다르다" 안내');
  }

  /* 연락처 — 삼성전자서비스가 **수리하지 않는다**는 사실이 화면에 있어야 한다 */
  const H = A.HARMAN;
  if (!H) fail('HARMAN 연락처가 없다');
  else {
    if (H.n !== '02-553-3494') fail(`하만 서비스센터 번호가 ${H.n} — 02-553-3494 여야 한다`);
    else pass('하만 서비스센터 대표번호 골든 02-553-3494');
    /* public repo 다 — 사람 이름·010 번호는 싣지 않는다 */
    const blob = JSON.stringify(H);
    if (/010[-\s]?\d{3,4}[-\s]?\d{4}/.test(blob)) fail('하만 연락처에 010 번호가 있다');
    else pass('하만 연락처에 010 번호 없음');

    A.tab = 'contact';
    const g = doc.querySelector('#g-hm');
    if (!g) fail('연락처 탭에 하만 묶음(g-hm)이 없다');
    else if (g.open) fail('하만 묶음이 기본으로 펼쳐져 있다');
    else if (!/접수만/.test(g.textContent))
      fail('하만 묶음에 "삼성전자서비스는 접수만 받습니다" 안내가 없다 — 번호만 보면 잘못 안내한다');
    else if (!g.querySelector('[data-tel]')) fail('하만 묶음에 누를 수 있는 번호가 없다');
    else pass('하만 묶음: 기본 접힘 · "접수만" 안내 · 번호 누를 수 있음');

    /* 상단 검색에서 "JBL" · "하만" · "AKG" 로 찾아져야 한다 */
    for (const q of ['jbl', '하만', 'akg']) {
      const hit = A.searchDocs().filter((x) => (x.kw || '').toLowerCase().includes(q));
      if (!hit.length) fail(`상단 검색에서 "${q}" 로 하만 자료를 못 찾는다`);
    }
    pass('상단 검색에서 JBL · 하만 · AKG 로 찾힌다');
  }
}

/*
 * ── [13] AS센터 찾기 — 한글 입력 · 이름 · 접이식 ──
 *
 * **한글이 자모로 쪼개지던 버그가 여기 있었다**(2026-08-27 사장님 보고 —
 * *"성남 이라고 검색하고 싶은데 ㅅ ㅓ ㅇ ㄴ ㅏ ㅁ 이렇게 검색되어 오작동"*).
 * 입력할 때마다 `pane.innerHTML` 을 통째로 다시 써서 **입력칸이 새 DOM 요소로 바뀌었고**,
 * 그러면 IME 조합 버퍼가 끊겨 자모가 그대로 확정된다.
 *
 * **`fill()` 처럼 값을 통째로 넣으면 이 버그는 재현되지 않는다** — IME 를 안 거치기 때문이다.
 * 그래서 조합 이벤트를 직접 쏘고, **입력칸이 같은 DOM 요소로 남아 있는지**를 본다.
 * 그것이 조합이 살아남는 조건 자체다(값 비교만으로는 jsdom 이 IME 를 흉내 내지 못한다).
 *
 * 센터 목록은 `fetch` 로 오는데 jsdom 에는 fetch 가 없어 `loadSvc()` 로 직접 넣는다.
 */
{
  const svcPath = path.join(root, 'public', 'svc-centers.json');
  if (!fs.existsSync(svcPath)) {
    console.log('SKIP: svc-centers.json 이 없어 AS센터 검사를 건너뜁니다');
  } else if (typeof A.loadSvc !== 'function') {
    fail('as-app 이 loadSvc 를 내보내지 않는다 — AS센터 탭을 검사할 수 없다');
  } else {
    const SVC = JSON.parse(fs.readFileSync(svcPath, 'utf8'));
    A.tab = 'center';
    A.loadSvc(SVC);
    const box = () => doc.getElementById('svcq');
    const rows = () => [...doc.querySelectorAll('#svclist .svcd')];

    if (!box()) fail('AS센터 검색칸(#svcq)이 없다');
    else if (!rows().length) fail('AS센터 목록이 한 줄도 안 그려졌다');
    else pass(`AS센터 탭 렌더 (${rows().length}곳)`);

    /* [13-a] 입력해도 **입력칸이 그대로 남는가** — 이것이 IME 조합이 살아남는 조건이다 */
    {
      const el0 = box();
      const steps = ['ㅅ', '서', '성', '성ㄴ', '성나', '성남'];
      let swapped = 0;
      for (const buf of steps) {
        el0.value = buf;
        el0.dispatchEvent(new window.Event('input', { bubbles: true }));
        if (doc.getElementById('svcq') !== el0) swapped++;
      }
      const after = doc.getElementById('svcq');
      if (swapped) {
        fail(`한글 조합: 입력 ${steps.length}회 중 ${swapped}회에서 입력칸이 새 요소로 바뀐다`
          + ' — IME 조합이 끊겨 "성남"이 "ㅅㅓㅇㄴㅏㅁ"으로 확정된다');
      } else if (after.value !== '성남') {
        fail(`한글 조합 뒤 입력칸 값이 "${after.value}" — "성남"이어야 한다`);
      } else pass('한글 조합: 입력칸이 같은 요소로 남고 값이 "성남"으로 온전하다');

      /* 그 검색이 실제로 좁히는가 */
      const nm = rows().map((d) => d.querySelector('.svcn').textContent);
      if (!nm.length || !nm.every((n) => /성남|분당/.test(n)))
        fail(`"성남" 검색 결과가 ${nm.length}곳 — 성남권 센터로 좁혀져야 한다 (${nm.slice(0, 3).join(', ')})`);
      else pass(`"성남" 검색이 ${nm.length}곳으로 좁혀진다`);
    }

    /* [13-b] `삼성전자` 접두는 화면에서만 떼고 **데이터는 그대로** 둔다 */
    {
      if (!SVC.items.every((x) => /^삼성전자\s/.test(x.full)))
        fail('svc-centers.json 의 full 에서 "삼성전자" 접두가 사라졌다 — 원문 대조용 데이터는 그대로여야 한다');
      else pass('데이터(svc-centers.json)는 "삼성전자" 접두를 그대로 갖고 있다');

      box().value = '';
      box().dispatchEvent(new window.Event('input', { bubbles: true }));
      const nm = rows().map((d) => d.querySelector('.svcn').textContent.trim());
      const left = nm.filter((n) => n.startsWith('삼성전자'));
      if (left.length) fail(`화면 이름 ${left.length}곳에 "삼성전자"가 남아 있다 (예: ${left[0]})`);
      else pass(`화면 이름 ${nm.length}곳에서 "삼성전자" 접두 제거`);

      /* **`nm`(짧은 이름)을 그냥 쓰면 모바일/바로서비스 구분이 사라진다** — `full` 에서 접두만 뗀다 */
      const kind = nm.filter((n) => /^모바일 |바로\s?서비스/.test(n));
      if (kind.length < nm.length * 0.9)
        fail(`이름에서 모바일/바로서비스 구분이 사라졌다 — ${nm.length}곳 중 ${kind.length}곳만 남았다`);
      else pass('이름에 모바일/바로서비스 구분이 남아 있다');

      /* 접두를 떼도 178곳 이름이 유일해야 검색·딥링크가 한 곳을 가리킨다 */
      const uniq = new Set(SVC.items.map((x) => A.svcName(x)));
      if (uniq.size !== SVC.items.length)
        fail(`접두를 떼면 이름이 겹친다 — ${SVC.items.length}곳 중 ${uniq.size}개만 유일하다`);
      else pass(`접두를 떼도 이름 ${uniq.size}곳 전부 유일`);
    }

    /* [13-c] 접이식 — 기본은 접혀 있고, 눌러야 세부가 보인다 */
    {
      const open = rows().filter((d) => d.open);
      if (open.length) fail(`AS센터 ${open.length}곳이 기본으로 펼쳐져 있다 — 눌러야 열려야 한다`);
      else pass(`AS센터 ${rows().length}곳 기본 접힘`);

      const first = rows()[0];
      const sum = first.querySelector('summary');
      /* 접힌 줄에 **이름 · 가전 접수 배지 · 시·군·구**가 있어야 고를 수 있다.
         어느 동네인지 모르면 못 고르고, 가전 접수 여부를 모르면 TV 고객을 모바일 전용 센터로 보낸다 */
      if (!sum.querySelector('.svcn')) fail('접힌 줄에 센터 이름이 없다');
      else if (!/가전 접수|모바일만/.test(sum.textContent)) fail('접힌 줄에 가전 접수 배지가 없다');
      else if (!sum.querySelector('.sg').textContent.trim()) fail('접힌 줄에 시·군·구가 없다');
      else pass('접힌 줄에 이름 · 가전 접수 배지 · 시·군·구가 있다');

      /* 주소·번호 같은 세부는 **펼침 안쪽**에 있어야 한다 — 접힌 줄에 있으면 접은 뜻이 없다 */
      const detail = first.querySelector('.svcd-b');
      if (!detail) fail('펼침 영역(.svcd-b)이 없다');
      else if (/주소/.test(sum.textContent)) fail('접힌 줄에 주소가 그대로 노출된다');
      else if (!/주소/.test(detail.textContent)) fail('펼쳐도 주소가 안 보인다');
      else pass('세부(주소·영업·대표·주차·찾아가기·취급)는 펼침 안쪽에만 있다');

      /*
       * 닫힌 `<details>` 안이어도 전화 버튼은 걸려야 한다. `wireContacts` 는
       * `querySelectorAll('[data-tel]')` 로 훑는데 **닫힌 details 의 자식도 DOM 에는 있으므로**
       * 접혀 있어도 걸린다 — 여기서 보는 것은 그 전제, 즉 *"접힌 채로도 번호가 DOM 에 있는가"* 다.
       * (`wireContacts` 는 `share-kit.js` 에 있고 jsdom 은 외부 스크립트를 안 싣는다.
       *  실제로 걸리는지는 브라우저에서 재서 확인했다 — 접힌 상태로 40/40.)
       */
      const tel = [...doc.querySelectorAll('#svclist [data-tel]')];
      /* **`dial` 이 있는 센터만** 버튼이 된다 — `031-8061-내선검색` 같은 대표번호는
         걸 수 있는 번호가 아니라서 자료가 `dial:null` 로 비워 두었다(전국 6곳).
         예전 렌더는 거기서 숫자만 추려 `0318061` 을 만들어 걸었다 — 없는 번호다. */
      const want = SVC.items.filter((x) => x.sd === '경기' && x.tel && x.dial).length;
      const bad = tel.filter((e) => !/^0\d{8,10}$/.test(e.dataset.tel || ''));
      if (rows().some((d) => d.open)) fail('이 검사는 접힌 상태에서 해야 한다');
      else if (tel.length !== want)
        fail(`접힌 목록의 번호가 ${tel.length}건 — dial 이 있는 센터 ${want}곳만큼 있어야 한다`);
      else if (bad.length)
        fail(`걸 수 없는 tel 값 ${bad.length}건 (예: "${bad[0].dataset.tel}") — dial 을 쓰지 않고 지어냈다`);
      else pass(`접힌 상태에서도 번호 ${tel.length}건이 DOM 에 있고 전부 걸 수 있는 형식`);

      /* 걸 수 없는 대표번호는 **글자로만** 남아야 한다 — 지워도 안 되고(원문에 있는 값이다) 걸려도 안 된다 */
      {
        const noDial = SVC.items.find((x) => x.tel && !x.dial);
        if (!noDial) { pass('dial 이 비어 있는 센터가 없다'); }
        else {
          box().value = A.svcName(noDial);
          box().dispatchEvent(new window.Event('input', { bubbles: true }));
          const r = rows()[0];
          if (!r) fail(`"${A.svcName(noDial)}" 를 못 찾는다`);
          else if (!r.textContent.includes(noDial.tel))
            fail(`걸 수 없는 대표번호("${noDial.tel}")가 화면에서 사라졌다 — 원문에 있는 값이라 적어야 한다`);
          else if (r.querySelector('[data-tel]') && [...r.querySelectorAll('[data-tel]')]
                     .some((e) => (e.textContent || '').includes(noDial.tel)))
            fail(`걸 수 없는 대표번호("${noDial.tel}")가 버튼이 됐다 — 누르면 없는 번호로 걸린다`);
          else pass(`걸 수 없는 대표번호는 글자로만 적는다 ("${noDial.tel}")`);
          box().value = '';
          box().dispatchEvent(new window.Event('input', { bubbles: true }));
        }
      }
    }

    /* [13-d] 검색으로 한 곳만 남으면 펼쳐 준다 — 접혀 있으면 찾아 준 뜻이 없다 */
    {
      const target = A.svcName(SVC.items.find((x) => /성남센터/.test(x.full)) || SVC.items[0]);
      box().value = target;
      box().dispatchEvent(new window.Event('input', { bubbles: true }));
      const r = rows();
      if (r.length !== 1) fail(`"${target}" 로 찾았는데 ${r.length}곳 — 한 곳이어야 한다`);
      else if (!r[0].open) fail(`"${target}" 한 곳만 남았는데 접혀 있다 — 찾아 준 뜻이 없다`);
      else pass(`이름으로 찾으면 그 한 곳이 펼쳐진다 ("${target}")`);

      /* 여러 곳이 나오는 검색에서는 접힌 채여야 한다 — 그게 이 변경의 목적이다 */
      box().value = '수원';
      box().dispatchEvent(new window.Event('input', { bubbles: true }));
      const many = rows();
      if (many.length < 2) fail(`"수원" 검색이 ${many.length}곳 — 여러 곳이어야 한다`);
      else if (many.some((d) => d.open)) fail('"수원" 검색 결과가 펼쳐져 있다 — 여러 곳일 때는 접혀 있어야 한다');
      else pass(`"수원" 검색 ${many.length}곳은 접힌 채로 남는다`);

      /* 통합검색이 보내는 AS센터 딥링크도 그 한 곳에 착지해야 한다 */
      const doc0 = A.searchDocs().find((d) => d.kind === 'AS센터' && /성남센터/.test(d.title));
      if (!doc0) fail('AS센터 항목이 통합검색 목록에 없다');
      else {
        doc0.go();
        const r2 = rows();
        if (r2.length !== 1) fail(`AS센터 딥링크를 눌렀는데 ${r2.length}곳이 남았다 — 그 한 곳만 남아야 한다`);
        else if (!r2[0].open) fail('AS센터 딥링크로 온 센터가 접혀 있다');
        else pass('통합검색 AS센터 딥링크가 그 한 곳을 펼쳐서 보여준다');
      }
    }
  }
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
