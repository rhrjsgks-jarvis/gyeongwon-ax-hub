/*
 * 삼성전자서비스 **전국 센터 전수 수집** — `node scripts/svc-collect.mjs` (결과는 .scratch/refresh/svc-centers.new.json — 검토 후 fixture 로 옮긴다)
 *
 * 결과: `scripts/fixtures/svc-centers.json` (커밋된다)
 * 검사: `npm run test:svc`
 *
 * ## robots — 수집 가능하다
 * `samsungsvc.co.kr/robots.txt` 는 `User-agent: * / Allow: /` 이고 막는 것은
 * **`Disallow: /*?q=`(검색 결과 지면)뿐**이다. 우리가 쓰는 예약 지면
 * (`/reserve/searchCenter`)과 API 는 금지 목록에 없다.
 * `api.samsungsvc.co.kr` 은 robots 자체가 404(없음)다.
 * **robots → 구조 확인 → 검증 → 수집** 순서를 이 저장소가 자이 도면에서 한 번 어겼고
 * (받아 놓고 나중에 확인해 31장을 전부 지웠다) 그래서 여기서는 먼저 봤다.
 *
 * ## curl 로는 안 된다 — 브라우저 안에서 fetch 해야 한다
 * API 가 Origin 을 본다. LG 사양 API 와 같은 제약이라(CLAUDE.md 「타사 사양을 어디서
 * 받는가」) playwright 로 지면을 연 뒤 `page.evaluate` 안에서 fetch 한다.
 *
 *   GET https://api.samsungsvc.co.kr/svc/hpCenterApi/centerList
 *       ?page=1&pageSize=15&lat={위도}&lng={경도}&fixEnable=&_siteId=ssvc
 *
 * ## 왜 격자로 훑는가 — `pageSize` 를 키워도 15건 상한이다
 * 좌표에서 **가장 가까운 15곳**만 준다(`totalCount:15, pageCount:1`). 전국 목록을
 * 주는 경로가 없으므로 좌표를 옮겨 가며 훑고 `cenId` 로 중복을 없앤다.
 *
 * ## 격자 간격을 눈대중으로 정하지 않는다 — 응답이 스스로 증명해 준다
 * 응답의 `dist` 는 **미터**다(`"dist":331.0` ↔ `"required_dist":"331m"`).
 * 한 점 P 에서 받은 15곳 중 **가장 먼 것의 거리 R** 이 곧 *"P 에서 반경 R 안의 센터는
 * 하나도 빠짐없이 받았다"* 는 뜻이다(더 가까운 것이 있었다면 그것이 15위 안에 들었을
 * 테니까). 그래서 **셀 반쪽 대각선 ≤ R** 이면 그 셀은 **증명된 채로 끝난다.**
 *
 *   · 서울처럼 빽빽한 곳 — 15곳이 5km 안에 몰려 R 이 작다 → 셀을 넷으로 쪼갠다
 *   · 강원 산간·바다 — 15번째가 60km 밖이라 R 이 크다 → 한 번에 끝난다
 *
 * **고정 간격으로 훑으면 안 되는 이유가 이것이다.** 0.35° 한 벌로는 서울·부산에서
 * 반쪽 대각선(27km)이 R(5km)보다 커서 **틈이 남는데 화면에는 아무 표시도 안 난다** —
 * 예비 조사에서 167곳이 나왔지만 그 숫자가 전부인지 아닌지를 말할 근거가 없었다.
 * 지금은 "더 촘촘히 해도 안 늘어난다"가 아니라 **"틈이 없다"** 를 증명한다.
 * (그래도 발견 곡선은 깊이별로 함께 찍는다 — 사람이 눈으로 검산할 수 있어야 한다.)
 *
 * ## 담지 않는 것 — 이 저장소는 public repo 다
 * CLAUDE.md 「AS 관련 정보」의 원칙 그대로 — *"`010` 을 제외한 나머지 번호만,
 * 이름·이메일·임원 명단은 싣지 않는다"*.
 *   · `headName`(센터장 이름) · `headPhoto`(얼굴 사진) · `directTel`(010 직통)
 *   · `custNotice`·`caution` — **HTML 이고 시기성 공지**다(*"26. 8월 25일(화)부터…"*).
 *     굳으면 거짓이 된다. 이 파일이 다른 곳에서 *"낡은 수치가 화면에 남지 않게 할 것"*
 *     이라고 적어 둔 것과 같은 이유로 아예 담지 않는다.
 *   · `keyword`(검색용 동 이름 수백 개) — 한 센터가 4KB 를 먹는다. 담을 값이 아니다.
 * **뽑아 담는 방식(화이트리스트)이라 응답에 새 필드가 생겨도 새어 나가지 않는다.**
 * 지우는 방식(블랙리스트)이면 필드가 하나 늘 때마다 조용히 뚫린다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.join(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.scratch', 'refresh', 'svc-centers.new.json');   // 검토 후 scripts/fixtures 로 옮긴다
const STATE = path.join(ROOT, '.scratch', 'refresh', 'svc-collect.state.json');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/* 남한 경계상자. 마라도(33.06)~강원 최북단(38.62) · 백령도(124.6)~독도(131.9).
 * 독도·백령도까지 넣으면 바다 셀만 늘어나므로 **본토+제주**로 잡고, 그 밖은
 * 어차피 이웃 셀의 R 이 크게 나와 함께 덮인다(덮였다는 것을 아래에서 증명한다). */
const BOX = { latMin: 32.9, latMax: 38.7, lngMin: 125.5, lngMax: 130.0 };
const S0 = 0.8;            // 첫 셀 크기(도)
const S_MIN = 0.01;        // 더 쪼개지 않는 하한 ≈ 1.1km
const CONC = 8;            // 동시 요청 수 — 남의 서버다, 늘리지 말 것

const DEG_KM = 111.32;     // 위도 1도 ≈ 111.32km
const halfDiagM = (s) => s * DEG_KM * 1000 / 2 * Math.SQRT2;

/* ── 담을 필드만 뽑는다(화이트리스트) ────────────────────────────────
 * 필드명은 **응답 그대로** 둔다. 우리 말로 바꿔 적으면 나중에 원문과 대조할 때
 * 무엇이 무엇이었는지 알 수 없다(이 저장소가 카탈로그 대조에서 겪은 그 문제다). */
const pick = (it) => {
  const o = {
    cenId: it.cenId,
    gname: it.gname || null,
    vname: it.vname || null,
    category: it.category || null,
    rcode1: it.rcode1 || null,
    rcode2: it.rcode2 || null,
    rcode3: it.rcode3 || null,
    address: it.address || null,
    addressDoro: it.addressDoro || null,
    doroname: it.doroname || null,
    lat: it.lat != null ? Number(it.lat) : null,
    lng: it.lng != null ? Number(it.lng) : null,
    weekdayStart: it.weekdayStart || null,
    weekdayEnd: it.weekdayEnd || null,
    saturdayStart: it.saturdayStart || null,
    saturdayEnd: it.saturdayEnd || null,
    holidayStart: it.holidayStart || null,
    holidayEnd: it.holidayEnd || null,
    park: it.park || null,
    taxi: it.taxi || null,
    /* 이 작업의 핵심 — 그 센터가 무엇을 받는가.
     * 빈 배열([])과 없음(null)은 **다른 말이다**. 백화점 '바로 서비스'처럼 실제로
     * 목록이 비어 오는 곳이 있는데, 그것을 null 로 뭉개면 *"확인 못 했다"* 가 된다
     * (비교표에서 '없음'과 '미공개'를 가르는 것과 같은 규칙). */
    enableList: Array.isArray(it.enableList) ? it.enableList.slice() : null,
    hpRepTel: it.hpRepTel || null,
  };
  /* `010` 은 어떤 칸에서든 뺀다. 대표번호 칸에 개인 번호가 적혀 있을 수 있다. */
  if (o.hpRepTel && MOBILE.test(o.hpRepTel)) o.hpRepTel = null;
  return o;
};

/* ── 휴대폰 번호 판정 — **앞뒤 경계가 없으면 좌표를 문다** ──────────────
 * 처음에 `[^0-9]010…` 로 썼더니 위도 `37.0104144947115` 가 걸렸다
 * (`.` 다음 `010` · `4144` · `9471`). 검사가 물어 준 것 자체는 옳았지만 이유가 틀렸고,
 * 그대로 두면 **진짜 유출과 좌표를 구분할 수 없어 검사를 끄게 된다** — 이 저장소가
 * *"'무선 이어폰'이 청소기로 끌려간다"* · *"'프로서비스'가 '프로'로 잡힌다"* 로
 * 이미 두 번 겪은 그 병이다. 앞에 숫자나 소수점이 오면 번호가 아니고, 뒤에 숫자가
 * 더 붙어도 번호가 아니다.
 * **그리고 숫자 필드는 아예 보지 않는다**(아래 `scanStrings`) — 좌표는 number 라
 * 문자열만 훑으면 이 종류가 통째로 사라진다. 둘 다 건다: 경계 + 문자열 한정. */
const MOBILE = /(?<![\d.])010[-.\s]?\d{3,4}[-.\s]?\d{4}(?![\d.])/;

/* 중첩된 값을 훑어 **문자열만** 검사기에 넘긴다(enableList 안까지 들어간다) */
function scanStrings(v, hit, keyPath = '') {
  if (typeof v === 'string') { if (MOBILE.test(v)) hit.push(`${keyPath} = ${v}`); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => scanStrings(x, hit, `${keyPath}[${i}]`)); return; }
  if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) scanStrings(x, hit, keyPath ? `${keyPath}.${k}` : k); }
}

/* ── 상태(끊겨도 이어서 돈다) ── */
const st = fs.existsSync(STATE)
  ? JSON.parse(fs.readFileSync(STATE, 'utf8'))
  : { centers: {}, curve: [] };
const seen = new Map(Object.entries(st.centers).map(([k, v]) => [Number(k), v]));
/* 발견 곡선은 **이번 회차 것만** 남긴다. 이어 붙이면 다시 돌렸을 때 0 이 줄줄이
 * 쌓여, 곡선을 보고 *"더 훑어도 안 늘어난다"* 를 판단할 수가 없다(이미 받은
 * 것이라 안 느는 것인지, 정말 없는 것인지가 뭉개진다). 처음부터 다시 세려면
 * `.scratch/svc-collect.state.json` 을 지우고 돌린다. */
st.curve = [];

const browser = await chromium.launch();
const page = await browser.newPage({ userAgent: UA, viewport: { width: 1400, height: 900 } });
await page.goto('https://www.samsungsvc.co.kr/reserve/searchCenter', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);

/* 한 번에 여러 점을 물어 본다 — 왕복이 병목이다 */
async function probeBatch(pts) {
  return page.evaluate(async (ps) => {
    const one = async (p) => {
      const u = 'https://api.samsungsvc.co.kr/svc/hpCenterApi/centerList'
        + `?page=1&pageSize=15&lat=${p.lat}&lng=${p.lng}&fixEnable=&_siteId=ssvc`;
      for (let t = 0; t < 3; t++) {
        try {
          const r = await fetch(u, { credentials: 'include' });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const j = await r.json();
          return { ok: true, items: j.items || [] };
        } catch (e) {
          if (t === 2) return { ok: false, err: String(e && e.message) };
          await new Promise((s) => setTimeout(s, 600 * (t + 1)));
        }
      }
    };
    return Promise.all(ps.map(one));
  }, pts);
}

let queries = 0, failed = 0;
const save = () => {
  st.centers = Object.fromEntries(seen);
  fs.writeFileSync(STATE, JSON.stringify(st));
};

/* 셀 한 벌을 처리하고, 덮였다고 증명하지 못한 셀을 넷으로 쪼개 돌려준다. */
async function runLevel(cells, depth) {
  const before = seen.size;
  const need = [];
  for (let i = 0; i < cells.length; i += CONC) {
    const chunk = cells.slice(i, i + CONC);
    const res = await probeBatch(chunk.map((c) => ({ lat: c.lat.toFixed(5), lng: c.lng.toFixed(5) })));
    for (let k = 0; k < chunk.length; k++) {
      const c = chunk[k], r = res[k];
      queries++;
      if (!r || !r.ok) { failed++; need.push(c); continue; }   // 실패한 셀은 쪼개서 다시 본다
      let maxDist = 0;
      for (const it of r.items) {
        if (typeof it.dist === 'number' && it.dist > maxDist) maxDist = it.dist;
        if (it.cenId == null) continue;
        if (it.cenDel === 'Y') continue;          // 폐점 표시는 담지 않는다
        if (!seen.has(it.cenId)) seen.set(it.cenId, pick(it));
      }
      /* **덮였다는 증명** — 15곳을 다 받았고(=상한에 걸렸고) 그중 가장 먼 것이
       * 셀 반쪽 대각선보다 멀면, 이 셀 안의 어떤 지점에 있는 센터도 이미 받았다.
       * 15곳보다 적게 왔다면 근처에 그것뿐이라는 뜻이라 역시 끝이다. */
      const covered = r.items.length < 15 || maxDist >= halfDiagM(c.s);
      if (!covered && c.s / 2 >= S_MIN) need.push(c);
    }
    process.stdout.write(`\r  깊이 ${depth} (셀 ${cells[0].s.toFixed(3)}°) — ${Math.min(i + CONC, cells.length)}/${cells.length} 질의 · 누적 ${seen.size}곳   `);
  }
  save();
  const found = seen.size - before;
  st.curve.push({ depth, cellDeg: Number(cells[0].s.toFixed(4)), cells: cells.length, newFound: found, total: seen.size });
  console.log(`\r  깊이 ${depth} · 셀 ${cells[0].s.toFixed(3)}° · 질의 ${cells.length} · 새로 ${found}곳 · 누적 ${seen.size}곳`.padEnd(90));
  const next = [];
  for (const c of need) {
    const h = c.s / 4, s2 = c.s / 2;
    for (const dy of [-h, h]) for (const dx of [-h, h]) next.push({ lat: c.lat + dy, lng: c.lng + dx, s: s2 });
  }
  return next;
}

/* 첫 격자 */
let cells = [];
for (let la = BOX.latMin; la <= BOX.latMax; la += S0)
  for (let ln = BOX.lngMin; ln <= BOX.lngMax; ln += S0)
    cells.push({ lat: la + S0 / 2, lng: ln + S0 / 2, s: S0 });

console.log(`삼성전자서비스 센터 수집 — 첫 격자 ${cells.length}셀 (${S0}°)\n`);
let depth = 0, unproven = 0;
while (cells.length) {
  cells = await runLevel(cells, depth++);
  if (cells.length && cells[0].s < S_MIN) {
    unproven = cells.length;
    console.log(`  ⚠ 셀이 ${S_MIN}° 아래로 내려가 멈춘다 — 덮였다고 증명하지 못한 셀 ${unproven}개`);
    break;
  }
}
/* ── 독립 교차검증 — 품목 필터로 전국을 다시 훑는다 ──────────────────
 * 위 세분은 *"좌표 격자에 틈이 없다"* 를 증명하지만, 그 증명은 **API 가 늘 가까운
 * 15곳을 준다**는 가정 위에 서 있다. 가정이 틀렸으면 증명도 함께 무너진다.
 * 그래서 **다른 축으로** 한 번 더 본다 — `fixEnable={품목코드}` 를 걸면 그 품목을
 * 받는 센터만 오는데(실측: TV 를 걸면 결과가 줄어든다), 품목 19종을 전국 좌표에
 * 걸어 훑어서 **우리 목록에 없는 cenId 가 하나라도 나오는지** 본다.
 * 하나라도 나오면 격자 증명이 거짓이라는 뜻이다. `SKIP_VERIFY=1` 로 건너뛴다. */
let verified = null;
if (!process.env.SKIP_VERIFY) {
  const vals = [...new Set([...seen.values()].flatMap((c) => (c.enableList || []).map((e) => e.value)))];
  const pts = [];
  for (let la = 33.4; la <= 38.4; la += 0.8) for (let ln = 126.2; ln <= 129.4; ln += 0.8) pts.push({ la, ln });
  console.log(`\n교차검증 — 품목 ${vals.length}종 × 좌표 ${pts.length}점`);
  const novel = new Map();
  let got = 0;
  for (const v of vals) {
    for (let i = 0; i < pts.length; i += CONC) {
      const chunk = pts.slice(i, i + CONC);
      const res = await page.evaluate(async ({ ps, v }) => Promise.all(ps.map(async (q) => {
        try {
          const r = await fetch('https://api.samsungsvc.co.kr/svc/hpCenterApi/centerList'
            + `?page=1&pageSize=15&lat=${q.la}&lng=${q.ln}&fixEnable=${v}&_siteId=ssvc`, { credentials: 'include' });
          const j = await r.json();
          return (j.items || []).map((it) => [it.cenId, `${it.rcode1} ${it.rcode2} | ${it.gname}`]);
        } catch { return []; }
      })), { ps: chunk, v });
      for (const arr of res) for (const [id, s] of arr) { got++; if (!seen.has(id)) novel.set(id, s); }
    }
    process.stdout.write(`\r  품목 ${v} · 응답 ${got}건 · 새 센터 ${novel.size}곳   `);
  }
  verified = { labels: vals.length, points: pts.length, responses: got, novel: novel.size };
  console.log(`\r  교차검증 — 품목 ${vals.length}종 · 응답 ${got}건 · 격자가 놓친 센터 ${novel.size}곳`.padEnd(90));
  if (novel.size) {
    /* **여기서 멈춘다.** 격자 증명이 거짓이라는 뜻이라, 목록을 그대로 쓰면
     * "전국 전수"라고 적어 둔 것 자체가 거짓말이 된다. */
    for (const [id, s] of novel) console.error(`    놓침 ${id} ${s}`);
    console.error('\n✗ 격자가 놓친 센터가 있다 — 쓰지 않는다. S0 를 줄이거나 세분 규칙을 다시 볼 것');
    await browser.close();
    process.exit(1);
  }
}
await browser.close();

/* ── 검산 ───────────────────────────────────────────────────────────
 * 쓰기 전에 스스로 확인한다. 개인정보가 새면 public repo 에 그대로 공개된다. */
const centers = [...seen.values()].sort((a, b) => a.cenId - b.cenId);
const blob = JSON.stringify(centers);
const leaks = [];
for (const k of ['headName', 'headPhoto', 'directTel', 'custNotice', 'caution', 'keyword'])
  if (blob.includes(`"${k}"`)) leaks.push(k);
{ const hit = []; scanStrings(centers, hit); for (const h of hit) leaks.push(`010 번호 — ${h}`); }
if (leaks.length) {
  console.error(`\n✗ 개인정보가 섞였다 — 쓰지 않는다: ${leaks.join(', ')}`);
  process.exit(1);
}
const bad = centers.filter((c) => !(c.lat > 32.5 && c.lat < 39 && c.lng > 124 && c.lng < 132));
if (bad.length) { console.error(`\n✗ 좌표가 남한 밖인 센터 ${bad.length}곳`); process.exit(1); }

fs.writeFileSync(OUT, JSON.stringify({
  _source: 'samsungsvc.co.kr /svc/hpCenterApi/centerList (robots Allow: /)',
  _collectedAt: new Date().toISOString().slice(0, 10),
  _note: '센터장 이름·사진·010 직통번호는 담지 않는다(public repo)',
  _method: `좌표 격자 적응 세분 — 한 점의 15번째 결과 거리(R)가 셀 반쪽 대각선보다 멀면 그 셀은 덮인 것으로 증명되고, 아니면 넷으로 쪼갠다. 첫 셀 ${S0}° · 하한 ${S_MIN}° · 질의 ${queries}회 · 증명 못 한 셀 ${unproven}개. 도구: .scratch/svc-collect.mjs (로컬 전용)`,
  _excluded: 'headName · headPhoto · directTel · custNotice/caution(시기성 HTML 공지라 굳으면 거짓이 된다) · keyword(동 이름 수백 개)',
  _curve: st.curve,
  _verified: verified
    ? `품목 필터(fixEnable) ${verified.labels}종을 전국 ${verified.points}점에 걸어 ${verified.responses}건을 받아 대조 — 격자가 놓친 센터 ${verified.novel}곳`
    : '건너뜀(SKIP_VERIFY)',
  centers,
}, null, 1) + '\n');

console.log(`\n✓ ${OUT}`);
console.log(`  센터 ${centers.length}곳 · 질의 ${queries}회 · 실패 ${failed}회`);
console.log('\n발견 곡선(깊이 → 셀 크기 → 새로 찾은 수):');
for (const r of st.curve) console.log(`  깊이 ${r.depth} · ${String(r.cellDeg).padStart(6)}° · 셀 ${String(r.cells).padStart(5)} · 새로 ${String(r.newFound).padStart(4)} · 누적 ${r.total}`);
