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
  return [...new Set(bad)];
}

/* ── 읽기 ─────────────────────────────────────────────────────── */
const lib = JSON.parse(fs.readFileSync(LIB, 'utf8'));
const have = new Map((lib.entries || []).map((e) => [`${e.complex}|${e.type}`, e]));
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
    const key = `${e.complex}|${e.type}`;
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
