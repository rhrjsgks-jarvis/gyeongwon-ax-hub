/*
 * 내보낸 벽선을 **공용 라이브러리에 합친다** — `npm run merge:library <파일…>`
 *
 * ## 왜 필요한가
 *
 * 앱은 이미 "도면 이미지 대신 방 경계(mm 좌표)만" 저장한다 — 분양 도면은 저작권이 있어
 * 저장소에 둘 수 없지만 **파생 측정값인 좌표는 담을 수 있기 때문**이다. 화면에도
 * 내보내기(JSON)가 있다. 그런데 **합치는 쪽이 없었다.** 그래서 상담사가 애써 잡아 둔
 * 벽선이 각자 기기의 localStorage 에만 남고, 공용 목록(`public/plan-library.json`)은
 * **0건인 채로** 있었다(2026-08-17 확인). 합치는 손이 없으면 아무도 안 모은다.
 *
 * ## 무엇을 검사하는가 — 여기가 이 스크립트의 값어치다
 *
 * 합치는 것 자체는 쉽다. 어려운 것은 **쓰레기가 공용 목록에 들어가지 않게** 하는 것이다.
 * 매장에서 잘못 잡힌 벽이 들어가면 그걸 불러온 다른 상담사가 **틀린 치수로 상담한다** —
 * 이 앱에서 가장 위험한 실패다. 그래서 아래를 전부 통과한 것만 담는다:
 *
 *   ① 이미지·base64 가 섞여 있지 않은가   저작권 자료가 저장소에 들어가면 안 된다
 *   ② 방이 있고 벽이 닫혀 있는가          벽 3개 미만은 방이 아니다
 *   ③ 치수가 사람이 사는 크기인가         한 변 300mm~30m · 방 1~200㎡
 *   ④ 단지·타입 이름이 있는가             없으면 매장에서 고를 수가 없다
 *   ⑤ 이미 있는 것과 겹치는가             같은 단지·타입이면 **덮지 않고 물어보게** 남긴다
 *
 * ③ 의 범위는 넉넉하게 잡았다 — 좁히면 멀쩡한 것을 막는다. 목적은 "정확한 값 고르기"가
 * 아니라 **"명백히 잘못된 것 거르기"** 다.
 *
 * ## 덮어쓰지 않는다
 *
 * 같은 단지·타입이 이미 있으면 **건너뛰고 보고만 한다**(`--force` 로만 덮는다).
 * 공용 목록은 여러 매장이 함께 쓰는 것이라, 조용히 덮으면 남이 확인해 둔 값이 사라진다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'public', 'plan-library.json');

const args = process.argv.slice(2);
const force = args.includes('--force');
const dry = args.includes('--dry');
const files = args.filter((a) => !a.startsWith('--'));

if (!files.length) {
  console.log(`사용법: npm run merge:library <내보낸.json…> [--force] [--dry]

  앱의 '단지 불러오기 → 내보내기(JSON)' 로 받은 파일을 공용 목록에 합친다.
  --force  같은 단지·타입을 덮어쓴다(기본은 건너뛴다)
  --dry    합치지 않고 무엇이 들어갈지만 보여준다`);
  process.exit(0);
}

/* ── 검사 ─────────────────────────────────────────────────────── */
const MM_MIN = 300, MM_MAX = 30000;      // 한 변 30cm ~ 30m
const M2_MIN = 1, M2_MAX = 200;          // 방 1㎡ ~ 200㎡

/** 다각형 넓이(㎡) — 벽 선분을 순서대로 이은 것으로 본다 */
function areaM2(walls) {
  let a = 0;
  for (const w of walls) a += (w.x1 * w.y2 - w.x2 * w.y1);
  return Math.abs(a / 2) / 1e6;
}

/*
 * ── 타입 이름이 밝히는 크기와 실제로 잡힌 넓이가 맞는가 ────────────────
 *
 * 이 파일 맨 위의 스키마가 **스스로 계약을 적어 두었다** — `type` 은 "84A 등, 숫자
 * 부분이 전용면적(㎡)". 그러면 잡힌 방 넓이의 합과 그 숫자를 견주는 것만으로 명백한
 * 불량이 드러난다. 바깥 자료를 끌어올 필요가 없다.
 *
 * **실측 (2026-08-17, 도면 인쇄 치수로 축척을 맞춰 뽑은 11건 · `.scratch/seed-library.mjs`)**
 *
 *   멀쩡한 것        0.86 · 0.92 · 0.98 · 1.25 배
 *   거르고 싶은 것   0.55 · 4.66 · 5.36 · 6.89 배
 *   잴 수 없는 것    `T1` 처럼 숫자가 없는 타입 3건
 *
 * 위쪽 1.25 배는 **버그가 아니라 정상**이다 — 트인 거실 안의 주방을 따로 잡는 것을
 * 일부러 그렇게 두었고(CLAUDE.md), 그래서 합계가 전용면적을 넘는다. 발코니가 잡히면
 * 더 늘 수도 있다.
 *
 * 아래쪽 0.55 배는 **인식이 절반만 된 것**이다. 다만 상담사가 일부러 거실 하나만 잡아
 * 저장하는 경우도 있어, 낮다고 전부 불량이라 할 수는 없다.
 *
 * 4.66~6.89 배는 **타입 이름 자체가 틀린 것**으로 보인다(자이 헤리티지 22·23·24 —
 * 주택형 OCR 이 숫자만 읽어 뭉갠 자리다). 상담사가 `23` 을 고르면 158㎡ 집이 뜬다.
 */
/**
 * @param {number} sumM2   잡힌 방 넓이의 합(㎡)
 * @param {number} typeM2  타입 이름에서 읽은 전용면적(㎡)
 * @returns {string|null}  거를 이유 · 통과면 null
 */
function sizeVerdict(sumM2, typeM2) {
  const k = sumM2 / typeM2;
  /*
   * **0.6 ~ 1.6 배**(2026-08-17 사용자 결정). 실측 정상 범위 0.86~1.25 에 앞뒤로 여유를
   * 둔 값이다 — 목적은 "정확한 값 고르기"가 아니라 **"명백히 잘못된 것 거르기"** 라는
   * 이 파일의 다른 범위들(한 변 30m · 방 1~200㎡)과 같은 생각이다.
   */
  if (k > 1.6) return `잡힌 넓이 ${sumM2.toFixed(0)}㎡ 가 타입 ${typeM2}㎡ 의 ${k.toFixed(1)}배 — 타입 이름이나 인식이 틀렸다`;
  if (k < 0.6) return `잡힌 넓이 ${sumM2.toFixed(0)}㎡ 가 타입 ${typeM2}㎡ 의 ${k.toFixed(1)}배 — 집이 반만 잡혔다`;
  return null;
}

function checkEntry(e) {
  const bad = [];
  if (!e || typeof e !== 'object') return ['항목이 객체가 아니다'];
  if (!e.complex) bad.push('단지명이 없다');
  if (!e.type) bad.push('타입이 없다');

  /* ① 이미지가 섞이지 않았는지 — 저작권 자료를 저장소에 넣지 않는다 */
  const raw = JSON.stringify(e);
  if (/data:image|base64,|\.jpg|\.png/i.test(raw)) bad.push('이미지/base64 가 섞여 있다 — 벽 좌표만 담아야 한다');

  const rooms = e.rooms || [];
  if (!rooms.length) bad.push('방이 없다');

  for (const r of rooms) {
    for (const p of (r.parts || [])) {
      const w = p.walls || [];
      if (w.length < 3) { bad.push(`"${r.name || '?'}" 벽이 ${w.length}개 — 방이 아니다`); continue; }
      for (const s of w) {
        for (const v of [s.x1, s.y1, s.x2, s.y2]) {
          if (!Number.isFinite(v)) { bad.push(`"${r.name || '?'}" 좌표에 숫자가 아닌 값`); break; }
        }
        const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
        if (len > MM_MAX) bad.push(`"${r.name || '?'}" 벽 한 변이 ${Math.round(len)}mm — 30m 를 넘는다`);
      }
      const a = areaM2(w);
      if (a < M2_MIN || a > M2_MAX) bad.push(`"${r.name || '?'}" 넓이 ${a.toFixed(1)}㎡ — 사람이 사는 크기가 아니다`);
    }
  }

  /*
   * ── 가장 넓은 방이 거실인가 ────────────────────────────────────
   *
   * `test-plans` 가 이미 지키는 규칙이다 — *"홍천 84B 는 가장 넓은 곳이 거실이다.
   * 순서로 붙이면 '침실1' 이 되던 자리다"*. 세대 평면에서 가장 넓은 방은 거실이고,
   * 그렇지 않다는 것은 **이름이 엉뚱한 방에 붙었다**는 뜻이다.
   *
   * 실측으로 `원주역 우미 린 더 스카이 T1` 이 **거실 7.8㎡ · 침실2 23.2㎡** 였다.
   * 75㎡ 집에 그런 거실은 없다. 벽선(지오메트리)은 멀쩡한데 이름만 어긋난 것인데,
   * 라이브러리는 이미지 없이 이름만 남으므로 **화면에서 바로잡을 근거가 사라진다.**
   *
   * **방이 3곳 이상일 때만 본다** — 상담사가 방 하나만 잡아 저장하는 경우가 있고,
   * 그때 가장 넓은 방이 침실인 것은 정상이다.
   */
  if (rooms.length >= 3) {
    let big = null, bigA = -1;
    for (const r of rooms) {
      let a = 0;
      for (const p of (r.parts || [])) a += areaM2(p.walls || []);
      if (a > bigA) { bigA = a; big = r; }
    }
    if (big && !/거실/.test(big.name || '')) {
      bad.push(`가장 넓은 ${bigA.toFixed(1)}㎡ 가 "${big.name || '이름없음'}" 이다 — 방 이름이 엉뚱한 자리에 붙었다`);
    }
  }

  /* 타입 숫자와 실제 넓이가 맞는가 — 숫자가 없는 타입(`T1`)은 잴 수 없으니 넘어간다 */
  {
    const m = String(e.type || '').match(/[\d.]+/);
    const typeM2 = m ? parseFloat(m[0]) : NaN;
    /*
     * **`T1` 의 `1` 은 전용면적이 아니다.** 주택형을 못 읽은 도면이 그렇게 적히는데
     * 그대로 재면 배율이 90배로 나와 멀쩡한 항목이 통째로 걸린다(실측 3건).
     * 사람이 사는 집의 전용면적은 10㎡ 아래로 내려가지 않으므로 거기서 자른다.
     */
    if (Number.isFinite(typeM2) && typeM2 >= 10) {
      let sum = 0;
      for (const r of rooms) for (const p of (r.parts || [])) sum += areaM2(p.walls || []);
      const why = sizeVerdict(sum, typeM2);
      if (why) bad.push(why);
    }
  }
  return [...new Set(bad)];
}

/* ── 읽기 ─────────────────────────────────────────────────────── */
/*
 * **키에 지역이 들어간다.** 단지명은 전국에서 유일하지 않다 — 실측으로 `자이 헤리티지`가
 * **경기 화성**과 **경기 용인** 두 곳에 있다(도면 색인 c132 · c85, 서로 다른 집이다).
 * `단지|타입` 만으로 잡으면 한쪽이 다른 쪽을 "이미 있다"로 밀어내거나 `--force` 에
 * 조용히 덮인다. 그러면 **엉뚱한 집 벽선으로 상담한다.**
 */
const keyOf = (e) => `${e.region || ''}|${e.complex}|${e.type}`;

const lib = JSON.parse(fs.readFileSync(LIB, 'utf8'));
const have = new Map((lib.entries || []).map((e) => [keyOf(e), e]));
const before = have.size;

let added = 0, skipped = 0, replaced = 0, rejected = 0;
const report = [];

for (const f of files) {
  if (!fs.existsSync(f)) { console.log(`❌ 파일 없음: ${f}`); continue; }
  let doc;
  try { doc = JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { console.log(`❌ JSON 이 아니다: ${f} — ${e.message}`); continue; }

  const list = Array.isArray(doc) ? doc : (doc.entries || []);
  console.log(`\n■ ${path.basename(f)} — 항목 ${list.length}개`);

  for (const e of list) {
    const key = keyOf(e);
    const bad = checkEntry(e);
    if (bad.length) {
      rejected++;
      report.push(`   ❌ ${key} — ${bad.join(' · ')}`);
      continue;
    }
    if (have.has(key) && !force) {
      skipped++;
      report.push(`   ⏭  ${key} — 이미 있다(덮으려면 --force)`);
      continue;
    }
    if (have.has(key)) replaced++; else added++;
    /* 담는 것은 검사를 통과한 필드만 — 내보낸 파일에 딴 것이 붙어 있어도 새어 들어가지 않는다 */
    have.set(key, {
      region: e.region || '', complex: e.complex, type: e.type,
      addedAt: e.addedAt || new Date().toISOString().slice(0, 10),
      ...(e.by ? { by: e.by } : {}),
      rooms: e.rooms.map((r) => ({
        name: r.name,
        parts: (r.parts || []).map((p) => ({
          walls: p.walls.map((w) => ({
            x1: Math.round(w.x1), y1: Math.round(w.y1),
            x2: Math.round(w.x2), y2: Math.round(w.y2), open: !!w.open,
          })),
        })),
      })),
    });
    report.push(`   ✅ ${key} — 방 ${e.rooms.length}곳`);
  }
}

report.forEach((r) => console.log(r));

/* 지역·단지·타입 순으로 정렬해 둔다 — 사람이 diff 를 읽을 수 있어야 한다 */
const merged = [...have.values()].sort((a, b) =>
  (a.region || '').localeCompare(b.region || '') || a.complex.localeCompare(b.complex) || String(a.type).localeCompare(String(b.type)));

console.log(`\n════ 합치기 ${dry ? '(미리보기)' : ''} ════`);
console.log(`  담음 ${added} · 덮음 ${replaced} · 건너뜀 ${skipped} · 거른 것 ${rejected}`);
console.log(`  공용 목록 ${before} → ${merged.length}개`);

if (dry) { console.log('  (--dry 라 파일을 쓰지 않았다)'); process.exit(0); }
if (!added && !replaced) { console.log('  바뀐 것이 없어 파일을 쓰지 않았다'); process.exit(0); }

lib.entries = merged;
fs.writeFileSync(LIB, JSON.stringify(lib, null, 1) + '\n');
console.log(`  → public/plan-library.json (${(fs.statSync(LIB).size / 1024).toFixed(1)}KB)`);
console.log('  **커밋해야 매장에 나간다** — 이 파일은 배포본에 그대로 실린다.');
