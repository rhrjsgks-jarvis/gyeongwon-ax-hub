/*
 * QR 생성기(`lib/qr.ts`) 회귀 테스트.
 *
 * **왜 "그려 보고 눈으로 확인"으로 끝내면 안 되나** — QR 은 망가져도 QR 처럼 생겼다.
 * 마스크가 파인더까지 덮거나 형식정보의 EC 레벨이 틀리면 그림은 멀쩡한데
 * **어떤 리더기로도 안 읽힌다**(`lib/qr.ts` 주석에 두 사례가 다 적혀 있다).
 *
 * 그래서 만든 격자를 **되읽는다**. 브라우저(BarcodeDetector)도 외부 디코더도 쓰지 않는다 —
 * 이 저장소는 오프라인·무의존 테스트가 원칙이고, `test-admin.mjs` 가 `lib/logEvent.ts` 를
 * 직접 import 하는 것과 같은 방식이다(`qrMatrix` 는 DOM 을 안 쓰는 순수 함수다).
 *
 * 검사 네 겹:
 *   ① 구조     — 크기·파인더 3개·분리자·타이밍·고정 검정 모듈
 *   ② 형식정보 — 두 사본이 같고, BCH 로 유효하며, EC 레벨이 실제로 M 인가
 *   ③ 오류정정 — 블록마다 RS 신드롬이 전부 0인가 (ecc() 를 독립적으로 검산한다)
 *   ④ 왕복     — 마스크를 풀고 지그재그를 되짚어 원래 문자열이 나오는가
 *
 * 실행: node --experimental-strip-types scripts/test-qr.mjs
 */
import fs from 'fs';
import vm from 'vm';
import { qrMatrix } from '../lib/qr.ts';

let ok = true;
const pass = (m) => console.log(`OK: ${m}`);
const fail = (m) => { ok = false; console.error(`FAIL: ${m}`); };
const check = (cond, m) => (cond ? pass(m) : fail(m));

/* ── 레벨 M 제원 (ISO/IEC 18004) ── */
const VER_M = {
  1: [26, 10, 1, 0], 2: [44, 16, 1, 0], 3: [70, 26, 1, 0], 4: [100, 18, 2, 0],
  5: [134, 24, 2, 0], 6: [172, 16, 4, 0], 7: [196, 18, 4, 0], 8: [242, 22, 2, 2],
  9: [292, 22, 3, 2], 10: [346, 26, 4, 1],
};
const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};
const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/* ── GF(256) — 신드롬 계산용(생성기 0x11d) ── */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/* ── 기능 모듈 지도를 기하학만 보고 다시 만든다(생성기 결과를 믿지 않는다) ── */
function funcMap(size, ver) {
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (r, c) => { if (r >= 0 && r < size && c >= 0 && c < size) fn[r][c] = true; };
  for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]])
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) mark(r0 + r, c0 + c);
  for (let i = 8; i < size - 8; i++) { mark(6, i); mark(i, 6); }
  const al = ALIGN[ver];
  for (const r of al) for (const c of al) {
    if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) mark(r + dr, c + dc);
  }
  mark(size - 8, 8);
  for (let i = 0; i <= 8; i++) { mark(8, i); mark(i, 8); }
  for (let i = 0; i < 8; i++) { mark(8, size - 1 - i); mark(size - 1 - i, 8); }
  if (ver >= 7) for (let i = 0; i < 18; i++) {
    mark(Math.floor(i / 3), size - 11 + (i % 3));
    mark(size - 11 + (i % 3), Math.floor(i / 3));
  }
  return fn;
}

/** 형식정보 15비트를 (레벨, 마스크) 32가지로 전수 대조해 확정한다. */
function decodeFormat(raw) {
  for (let lvl = 0; lvl < 4; lvl++) for (let mk = 0; mk < 8; mk++) {
    const f5 = (lvl << 3) | mk;
    let d = f5 << 10;
    for (let i = 4; i >= 0; i--) if ((d >> (i + 10)) & 1) d ^= 0x537 << i;
    if ((((f5 << 10) | d) ^ 0x5412) === raw) return { lvl, mk };
  }
  return null;
}

/** 격자를 되읽어 원래 문자열을 복원한다. */
function decode(g) {
  const size = g.length;
  const ver = (size - 17) / 4;
  const [total, ecPer, g1, g2] = VER_M[ver];
  const blocks = g1 + g2, dataLen = total - ecPer * blocks;

  // 형식정보 — 두 사본을 각각 읽는다
  const b = (i) => (i ? 1 : 0);
  let a = 0, c2 = 0;
  for (let i = 0; i <= 5; i++) a |= b(g[8][i]) << i;
  a |= b(g[8][7]) << 6; a |= b(g[8][8]) << 7; a |= b(g[7][8]) << 8;
  for (let i = 9; i <= 14; i++) a |= b(g[14 - i][8]) << i;
  for (let i = 0; i <= 7; i++) c2 |= b(g[8][size - 1 - i]) << i;
  for (let i = 8; i <= 14; i++) c2 |= b(g[size - 15 + i][8]) << i;

  const fmt = decodeFormat(a);
  const fn = funcMap(size, ver);

  // 마스크를 풀고 지그재그를 되짚는다
  const bits = [];
  if (fmt) {
    let up = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (let i = 0; i < size; i++) {
        const row = up ? size - 1 - i : i;
        for (const c of [col, col - 1]) {
          if (fn[row][c]) continue;
          bits.push((g[row][c] !== MASKS[fmt.mk](row, c)) ? 1 : 0);
        }
      }
      up = !up;
    }
  }
  const stream = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    stream.push(v);
  }

  // 디인터리브 — 앞 g1 블록은 short 개, 뒤 g2 블록은 short+1 개
  const short = Math.floor(dataLen / blocks);
  const sizes = Array.from({ length: blocks }, (_, i) => short + (i >= g1 ? 1 : 0));
  const data = sizes.map(() => []), ecs = sizes.map(() => []);
  let p = 0;
  for (let i = 0; i < Math.max(...sizes); i++)
    for (let bi = 0; bi < blocks; bi++) if (i < sizes[bi]) data[bi].push(stream[p++]);
  for (let i = 0; i < ecPer; i++) for (let bi = 0; bi < blocks; bi++) ecs[bi].push(stream[p++]);

  // RS 신드롬 — 유효한 부호어면 전부 0이다
  const syndromesZero = data.every((d, bi) => {
    const cw = [...d, ...ecs[bi]];
    for (let j = 0; j < ecPer; j++) {
      let s = 0;
      for (let i = 0; i < cw.length; i++) s ^= mul(cw[i], EXP[(j * (cw.length - 1 - i)) % 255]);
      if (s !== 0) return false;
    }
    return true;
  });

  // 페이로드 — 모드(0100) + 길이 + 바이트
  // 데이터 부호어는 블록을 **순서대로 이어붙인 것**이다. 여기서 다시 인터리브하면
  // 블록이 하나인 버전(1·3)에서는 우연히 같은 결과가 나와 통과하고,
  // 블록이 여럿인 버전 8(38·38·39·39)에서만 깨진다.
  const words = data.flat();
  const flat = [];
  for (const w of words) for (let i = 7; i >= 0; i--) flat.push((w >> i) & 1);
  const take = (n, at) => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | flat[at + i]; return v; };
  const mode = take(4, 0);
  const lenBits = ver < 10 ? 8 : 16;
  const len = take(lenBits, 4);
  const bytes = [];
  for (let i = 0; i < len; i++) bytes.push(take(8, 4 + lenBits + i * 8));

  return {
    ver, size, fmt, formatCopiesMatch: a === c2, syndromesZero, mode,
    text: new TextDecoder().decode(new Uint8Array(bytes)),
  };
}

/* ── 검사 ── */
const CASES = [
  ['짧은 주소', 'https://salescopilot-store.vercel.app'],
  ['한글', '경원영업팀 세일즈 코파일럿'],
  ['컨시어지 접수(긴 Apps Script 주소)',
    'https://script.google.com/macros/s/AKfycbzhQZIPSl8_bCnw4Sp0BRs2SkxWukAx5Eg0L3gE8U93e1SzvEsdoguGYIf4isur_SCZ/exec?page=board&s=Z583'],
  ['한 글자', 'A'],
];

for (const [name, text] of CASES) {
  const g = qrMatrix(text);
  const size = g.length;
  const ver = (size - 17) / 4;

  // ① 구조
  const finderOK = [[0, 0], [0, size - 7], [size - 7, 0]].every(([r0, c0]) => {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
      const want = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      if (g[r0 + r][c0 + c] !== want) return false;
    }
    return true;
  });
  let timingOK = true;
  for (let i = 8; i < size - 8; i++)
    if (g[6][i] !== (i % 2 === 0) || g[i][6] !== (i % 2 === 0)) timingOK = false;

  check(Number.isInteger(ver) && ver >= 1 && ver <= 10, `${name} — 크기 ${size} (버전 ${ver})`);
  check(finderOK, `${name} — 파인더 3개가 규격대로다 (마스크가 안 덮었다)`);
  check(timingOK, `${name} — 타이밍 패턴이 교대로 유지된다`);
  check(g[size - 8][8] === true, `${name} — 고정 검정 모듈이 살아 있다`);

  // ②③④
  const d = decode(g);
  check(d.formatCopiesMatch, `${name} — 형식정보 두 사본이 일치한다`);
  check(!!d.fmt, `${name} — 형식정보가 BCH 로 유효하다`);
  check(d.fmt?.lvl === 0b00, `${name} — EC 레벨이 실제로 M(0b00)이다`);
  check(d.syndromesZero, `${name} — 모든 블록의 RS 신드롬이 0이다`);
  check(d.mode === 0b0100, `${name} — 바이트 모드(0100)로 인코딩됐다`);
  check(d.text === text, `${name} — 되읽은 문자열이 원본과 같다`);
}

/* ── 포스터의 인라인 사본이 갈라지지 않았는가 ──
 * `public/*.html` 미니앱이 자립형인 것은 이 저장소의 구조라 QR 생성기를 복사해 갖고 있는 것
 * 자체는 맞다. 문제는 **조용히 갈라지는 것**이다 — 한쪽만 고치면 인쇄물 QR 만 안 읽히는데,
 * 인쇄물은 회수가 안 된다. 같은 입력에 같은 격자가 나오는지 대조한다
 * (`test-consistency.mjs` 가 모델코드를 파일 간 대조하는 것과 같은 발상).
 *
 * DOM 없이 QR 부분만 떼어 vm 에서 돌린다 — 포스터의 나머지는 캔버스·이벤트라 여기 필요 없다. */
{
  const html = fs.readFileSync('public/poster-app.html', 'utf8');
  const from = html.indexOf('/* ── GF(256)');
  const to = html.indexOf('function drawQR(');

  if (from < 0 || to < 0 || to < from) {
    fail('포스터에서 QR 생성기 구간을 못 찾았다 — 표식이 바뀌었으면 이 테스트도 함께 고칠 것');
  } else {
    const ctx = vm.createContext({ TextEncoder });
    const posterQrMatrix = vm.runInContext(html.slice(from, to) + '\nqrMatrix', ctx);
    const same = CASES.every(([, text]) =>
      JSON.stringify(posterQrMatrix(text)) === JSON.stringify(qrMatrix(text)));
    check(same, '포스터의 인라인 QR 생성기가 lib/qr.ts 와 같은 격자를 내놓는다');
  }
}

// 범위 밖은 조용히 틀린 QR 을 내놓지 말고 던져야 한다
try {
  qrMatrix('x'.repeat(400));
  fail('버전 10 초과 — 던지지 않고 그냥 만들었다');
} catch {
  pass('버전 10 초과 — 조용히 틀린 QR 을 만들지 않고 던진다');
}

console.log(ok ? '\n전부 통과' : '\n실패 있음');
process.exit(ok ? 0 : 1);
