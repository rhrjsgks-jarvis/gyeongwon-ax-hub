/*
 * 삼성전자서비스 전국 센터 자료(`scripts/fixtures/svc-centers.json`) 회귀 검사
 * — `npm run test:svc`
 *
 * 수집은 `.scratch/svc-collect.mjs`(로컬 전용)가 한다. 여기서 지키는 것은 셋이다:
 *
 * ① **개인정보가 한 건도 없는가** — 이 저장소는 public repo 다. 원본 응답에는
 *    센터장 **이름**(`headName`)과 **얼굴 사진**(`headPhoto`), **010 직통번호**
 *    (`directTel`)가 그대로 들어 있다. CLAUDE.md 「AS 관련 정보」의 원칙이
 *    *"`010` 을 제외한 나머지 번호만, 이름·이메일·임원 명단은 싣지 않는다"* 이고,
 *    수집기가 화이트리스트로 뽑아 담지만 **누가 필드를 하나 더 넣는 순간 새므로**
 *    받는 쪽에서도 본다. 새면 되돌릴 수 없다 — 커밋되는 순간 공개된다.
 * ② **자료가 통째로 비거나 반쪽이 나지 않았는가** — 수집이 중간에 끊기면 파일은
 *    멀쩡한데 센터만 줄어든다. 화면에는 "센터 N곳"으로만 보여 원인을 못 찾는다.
 * ③ **취급 품목(`enableList`)이 살아 있는가** — 이 자료를 모은 이유가 그것이다.
 *
 * 값이 바뀌면(센터가 늘거나 줄면) 이 검사가 먼저 깨진다. 그때 숫자를 고치는 것이
 * 아니라 **왜 바뀌었는지 확인하고** 고칠 것.
 */
import fs from 'node:fs';

let ok = true;
const fail = (m) => { ok = false; console.log('ERROR: ' + m); };

const PATH = 'scripts/fixtures/svc-centers.json';
if (!fs.existsSync(PATH)) {
  fail(`${PATH} 가 없다 — \`node .scratch/svc-collect.mjs\` 를 로컬에서 돌릴 것`);
  process.exit(1);
}
const doc = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const cs = doc.centers;

/* ── [1] 출처를 밝히고 있는가 ──
 * 자료만 있고 어디서 왔는지가 없으면 나중에 갱신도 검증도 못 한다. */
{
  for (const k of ['_source', '_collectedAt', '_note'])
    if (!doc[k]) fail(`머리글 \`${k}\` 가 없다`);
  if (doc._source && !/samsungsvc/.test(doc._source)) fail('_source 가 삼성전자서비스를 가리키지 않는다');
  if (doc._collectedAt && !/^\d{4}-\d{2}-\d{2}$/.test(doc._collectedAt)) fail(`_collectedAt 형식이 YYYY-MM-DD 가 아니다: ${doc._collectedAt}`);
  if (ok) console.log(`[1] 출처 OK — ${doc._source} (${doc._collectedAt})`);
}

/* ── [2] 센터 수가 기대 범위인가 ──
 * 2026-08-27 실측 178곳. 범위로 두는 것은 센터가 실제로 열고 닫히기 때문이고,
 * 범위를 벗어나면 **수집이 반쪽 났거나 API 가 바뀐 것**이라 사람이 봐야 한다. */
{
  if (!Array.isArray(cs)) { fail('centers 가 배열이 아니다'); process.exit(1); }
  if (cs.length < 150 || cs.length > 200) fail(`센터 ${cs.length}곳 — 기대 범위(150~200) 밖이다. 수집이 끊겼거나 API 가 바뀐 것이니 눈으로 확인할 것`);
  else console.log(`[2] 센터 ${cs.length}곳 (기대 150~200) OK`);
  const ids = new Set(cs.map((c) => c.cenId));
  if (ids.size !== cs.length) fail(`cenId 가 중복된다 — ${cs.length}건 중 고유 ${ids.size}건`);
  const noId = cs.filter((c) => c.cenId == null);
  if (noId.length) fail(`cenId 가 없는 항목 ${noId.length}건`);
}

/* ── [3] 개인정보가 한 건도 없는가 ── 이 검사가 이 파일의 존재 이유다 ──
 * 필드 이름과 값을 **둘 다** 본다. 이름만 보면 `taxi` 칸에 적힌 개인 번호를 놓치고,
 * 값만 보면 빈 `headName:""` 을 놓친다. */
{
  const BANNED = ['headName', 'headPhoto', 'directTel', 'custNotice', 'caution', 'keyword'];
  const blob = JSON.stringify(cs);
  for (const k of BANNED)
    if (blob.includes(`"${k}"`)) fail(`금지 필드 \`${k}\` 가 담겨 있다 — public repo 다`);

  /* 휴대폰 번호. **앞뒤 경계가 없으면 좌표를 문다** — 수집기에서 실제로
   * 위도 `37.0104144947115` 가 `010`+`4144`+`9471` 로 걸렸다. 앞에 숫자나
   * 소수점이 오면 번호가 아니고, 뒤에 숫자가 더 붙어도 번호가 아니다.
   * 그리고 **문자열 값만** 훑는다 — 좌표는 number 라 이 종류가 통째로 사라진다.
   * (이 저장소가 '무선 이어폰→청소기' · "'프로서비스'가 '프로'로 잡힌다" 로
   *  두 번 겪은 그 병이다. 경계 없는 부분일치는 반드시 엉뚱한 것을 문다.) */
  const MOBILE = /(?<![\d.])010[-.\s]?\d{3,4}[-.\s]?\d{4}(?![\d.])/;
  const hits = [];
  const walk = (v, p) => {
    if (typeof v === 'string') { if (MOBILE.test(v)) hits.push(`${p} = ${v}`); return; }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${p}[${i}]`));
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, p ? `${p}.${k}` : k);
  };
  cs.forEach((c) => walk(c, `cenId ${c.cenId}`));
  for (const h of hits) fail(`010 번호가 담겨 있다 — ${h}`);

  /* 검사가 정말 무는지 스스로 확인한다. 안 물면 위 통과는 아무 뜻이 없다
   * (`test:prod` 가 6회 전부 실패한 채 방치돼 있던 것에서 배운 것). */
  const canary = [{ cenId: 0, taxi: '010-1234-5678' }];
  const bit = [];
  canary.forEach((c) => walk(c, 'canary'));
  if (!MOBILE.test('010-1234-5678')) bit.push('진짜 번호를 못 잡는다');
  if (MOBILE.test('37.0104144947115')) bit.push('좌표를 문다');
  if (MOBILE.test('02-732-9438')) bit.push('일반 번호를 문다');
  if (bit.length) fail(`010 검사기 자체가 틀렸다 — ${bit.join(' · ')}`);

  if (ok) console.log(`[3] 개인정보 0건 OK — 금지 필드 ${BANNED.length}종 · 010 번호 · 검사기 자가확인 통과`);
}

/* ── [4] 시도 17곳이 다 나타나는가 ──
 * **`rcode1` 은 행정 시도 코드가 아니라 서비스 권역 라벨이다.** 전남 센터
 * 7곳(나주·목포·순천·여수·해남·광양)이 `전남광주` 로 적혀 오고, 광주광역시는
 * 따로 `광주` 다. 짐작해서 `전남` 으로 고쳐 담지 않았다 — 원문 값을 그대로 두고
 * **여기서 대응표로 푼다**(원문을 우리 말로 바꿔 담으면 나중에 대조할 때
 * 무엇이 무엇이었는지 알 수 없다). 라벨이 바뀌면 이 검사가 먼저 깨진다. */
{
  const SIDO = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  /* 권역 라벨 → 행정 시도. 표에 없는 라벨은 그대로 쓴다. */
  const NORM = { 전남광주: '전남' };
  const have = new Map();
  for (const c of cs) {
    const raw = c.rcode1 || '(없음)';
    const s = NORM[raw] || raw;
    have.set(s, (have.get(s) || 0) + 1);
  }
  const miss = SIDO.filter((s) => !have.has(s));
  if (miss.length) fail(`시도 ${miss.length}곳에 센터가 하나도 없다: ${miss.join(' ')} — 수집이 반쪽 났을 수 있다`);
  const extra = [...have.keys()].filter((s) => !SIDO.includes(s));
  if (extra.length) fail(`시도로 못 읽는 rcode1 라벨: ${extra.join(' ')} — NORM 대응표에 넣거나 원인을 볼 것`);
  if (ok) {
    console.log(`[4] 시도 17곳 전부 있음 OK (rcode1 은 권역 라벨이라 ${Object.entries(NORM).map(([a, b]) => `${a}→${b}`).join(' ')} 로 읽는다)`);
    console.log('    ' + SIDO.map((s) => `${s} ${have.get(s)}`).join(' · '));
  }
}

/* ── [5] 좌표가 남한 안인가 ──
 * 좌표가 틀리면 "가까운 센터"가 통째로 엉뚱해진다. 위도·경도가 뒤바뀐 것도 잡힌다. */
{
  const bad = cs.filter((c) => !(typeof c.lat === 'number' && typeof c.lng === 'number'
    && c.lat > 32.5 && c.lat < 39.0 && c.lng > 124.0 && c.lng < 132.0));
  if (bad.length) fail(`좌표가 남한 범위 밖이거나 숫자가 아닌 센터 ${bad.length}곳: `
    + bad.slice(0, 5).map((c) => `${c.cenId}(${c.lat},${c.lng})`).join(' '));
  else console.log(`[5] 좌표 ${cs.length}곳 전부 남한 범위(위 32.5~39.0 · 경 124.0~132.0) 안 OK`);
}

/* ── [6] 취급 품목 — 이 자료를 모은 이유 ──
 * **빈 배열([])과 없음(null)은 다른 말이다.** 백화점 '바로서비스'는 목록이 실제로
 * 비어 오는데(모바일 간단점검만 한다), 그것을 null 로 뭉개면 *"확인 못 했다"* 가
 * 된다 — 비교표에서 `없음`(실제로 없다)과 `미공개`(확인 못 했다)를 가르는 것과
 * 같은 규칙이다. null 이 하나라도 있으면 수집기가 필드를 못 읽은 것이다. */
{
  const nul = cs.filter((c) => c.enableList === null);
  const empty = cs.filter((c) => Array.isArray(c.enableList) && c.enableList.length === 0);
  const has = cs.filter((c) => Array.isArray(c.enableList) && c.enableList.length > 0);
  if (nul.length) fail(`enableList 가 null 인 센터 ${nul.length}곳 — 응답에 필드가 없었다는 뜻이라 수집기를 볼 것`);
  if (has.length < cs.length * 0.8) fail(`취급 품목이 있는 센터가 ${has.length}/${cs.length} 곳뿐 — 너무 적다`);

  const shape = has.flatMap((c) => c.enableList).filter((e) => !e || typeof e.label !== 'string' || typeof e.value !== 'number');
  if (shape.length) fail(`enableList 항목이 {label, value} 꼴이 아닌 것 ${shape.length}건`);

  const lab = new Map();
  for (const c of has) for (const e of c.enableList) lab.set(e.label, (lab.get(e.label) || 0) + 1);
  if (lab.size < 10) fail(`품목 라벨이 ${lab.size}종뿐 — 너무 적다`);

  /* 상담에서 실제로 묻는 품목이 살아 있는지 골든으로 못 박는다.
   * **냉장고·세탁기·에어컨은 여기 없는 것이 정상이다** — 들고 갈 수 없어
   * 출장수리로 가는 품목이라 센터 접수 목록에 애초에 없다. 없다고 채워 넣지 말 것. */
  for (const g of ['스마트폰', 'TV', '청소기', '공기청정기', '노트북'])
    if (!lab.has(g)) fail(`품목 라벨에 '${g}' 가 없다`);

  if (ok) console.log(`[6] 취급 품목 OK — 라벨 ${lab.size}종 · 품목 있는 센터 ${has.length}곳 · 빈 목록 ${empty.length}곳 · null ${nul.length}곳`);

  console.log('\n    취급 품목별 센터 수');
  for (const [k, v] of [...lab].sort((a, b) => b[1] - a[1]))
    console.log(`      ${String(v).padStart(4)}  ${k}`);
  console.log(`\n    취급 품목 목록이 비어 있는 센터 ${empty.length}곳 (전부 백화점·매장 '바로서비스')`);
  for (const c of empty) console.log(`      ${c.rcode1} ${c.rcode2} · ${c.gname}`);
}

/* ── [7] 대표번호 · 센터명 ──
 * **"전화번호 꼴인가"로 실패시키지 않는다.** 원문 대표번호 칸에는 실제로
 * `개인별 내선 활용` · `031-8061-내선번호` · `-` 처럼 번호가 아닌 값이 들어 있다.
 * 그건 **삼성 쪽 자료 상태**이지 우리 수집의 결함이 아니라, 여기서 물면 우리가
 * 어쩌지 못하는 이유로 빌드가 빨개진다(늘 실패하는 검사는 아무것도 못 지킨다).
 * 원문 값을 고쳐 담지도 않는다 — `-` 를 null 로 바꾸면 *"대표번호가 없다"* 와
 * *"원문이 '-' 라고 적어 두었다"* 가 뭉개진다.
 * 여기서 무는 것은 **우리가 책임질 수 있는 것**뿐이다: 개인정보와 급격한 변화. */
{
  const tel = cs.filter((c) => c.hpRepTel);
  /* 걸 수 있는 번호인가 — 실패가 아니라 보고용이다 */
  const dialable = tel.filter((c) => /\d{2,4}[-.]\d{3,4}[-.]\d{3,4}/.test(c.hpRepTel));
  const odd = tel.filter((c) => !dialable.includes(c));

  /* 사람 이름·이메일이 번호 칸에 섞이는 것은 **막는다**(public repo) */
  const NAME_TITLE = /[가-힣]{2,4}\s?(님|씨|과장|차장|부장|팀장|대리|사원|센터장|소장|기사)\b/;
  for (const c of tel) {
    if (c.hpRepTel.includes('@')) fail(`대표번호 칸에 이메일이 있다 — cenId ${c.cenId}: ${c.hpRepTel}`);
    if (NAME_TITLE.test(c.hpRepTel)) fail(`대표번호 칸에 사람 이름이 있다 — cenId ${c.cenId}: ${c.hpRepTel}`);
  }
  /* 걸 수 있는 번호가 갑자기 확 줄면 수집이나 API 가 바뀐 것이다 */
  if (dialable.length < cs.length * 0.8)
    fail(`걸 수 있는 대표번호가 ${dialable.length}/${cs.length} 곳뿐 — 수집이나 API 가 바뀌었는지 볼 것`);

  const noName = cs.filter((c) => !c.gname);
  if (noName.length) fail(`센터명(gname)이 없는 항목 ${noName.length}건`);

  if (ok) {
    console.log(`\n[7] 대표번호 OK — 있음 ${tel.length}곳(걸 수 있는 것 ${dialable.length}) / 없음 ${cs.length - tel.length}곳 · 센터명 전부 있음`);
    if (odd.length) {
      console.log(`    번호가 아닌 값 ${odd.length}건 — 원문 그대로 둔다(고쳐 담지 않는다). 화면에 그대로 쓰면 안 되는 값이다:`);
      for (const c of odd) console.log(`      ${c.gname} · ${JSON.stringify(c.hpRepTel)}`);
    }
  }
}

console.log(ok ? '\n✅ test-svc 전부 통과' : '\n❌ test-svc 실패');
process.exit(ok ? 0 : 1);
