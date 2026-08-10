/**
 * QR 코드 생성기 — 외부 API 없이 브라우저에서 직접 그린다.
 *
 * **왜 직접 만드나** — 허브 QR 이 `api.qrserver.com` 에 의존하고 있었는데, 매장에서 인쇄할
 * QR 을 남의 서버에 맡기면 ①그 서버가 죽으면 못 뽑고 ②해상도가 그쪽 정책에 묶이며
 * ③매장 와이파이가 불안하면 아예 안 나온다. 인쇄물은 한 번 잘못 나가면 회수가 어렵다.
 *
 * 범위는 이 용도에 필요한 만큼 — 바이트 모드 · 오류정정 M · 버전 1~10(URL 270자까지).
 *
 * **기능 모듈(파인더·타이밍·정렬·형식정보)을 따로 표시해 둔다.** 마스크를 여기에까지
 * 적용하면 파인더가 뭉개져 **어떤 리더기로도 안 읽힌다** — 실제로 그렇게 만들었다가
 * 디코더로 검증해서 잡았다. 표준이 요구하는 것은 "데이터 영역에만" 마스크다.
 */

/* ── GF(256) — 리드-솔로몬 오류정정 ── */
const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
}
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]])

function ecc(data: number[], n: number): number[] {
  let gen = [1]
  for (let i = 0; i < n; i++) {
    const next = new Array(gen.length + 1).fill(0)
    for (let j = 0; j < gen.length; j++) { next[j] ^= gen[j]; next[j + 1] ^= mul(gen[j], EXP[i]) }
    gen = next
  }
  const rem = new Array(n).fill(0)
  for (const d of data) {
    const factor = d ^ rem[0]
    rem.shift(); rem.push(0)
    for (let i = 0; i < n; i++) rem[i] ^= mul(gen[i + 1], factor)
  }
  return rem
}

/** 레벨 M — [총 부호어, EC/블록, 그룹1 블록 수, 그룹2 블록 수] */
const VER_M: Record<number, [number, number, number, number]> = {
  1: [26, 10, 1, 0], 2: [44, 16, 1, 0], 3: [70, 26, 1, 0], 4: [100, 18, 2, 0],
  5: [134, 24, 2, 0], 6: [172, 16, 4, 0], 7: [196, 18, 4, 0], 8: [242, 22, 2, 2],
  9: [292, 22, 3, 2], 10: [346, 26, 4, 1],
}
const ALIGN: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
}
const VER_INFO: Record<number, number> = { 7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3 }

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
]

/** 문자열 → QR 모듈 격자(true = 검정) */
export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text))

  let ver = 0, total = 0, ecPer = 0, g1 = 0, g2 = 0
  for (let v = 1; v <= 10; v++) {
    const [t, e, b1, b2] = VER_M[v]
    const blocks = b1 + b2
    const lenBits = v < 10 ? 8 : 16
    if (Math.ceil((4 + lenBits + bytes.length * 8) / 8) <= t - e * blocks) {
      ver = v; total = t; ecPer = e; g1 = b1; g2 = b2; break
    }
  }
  if (!ver) throw new Error('QR: 내용이 너무 깁니다(버전 10 초과)')

  const size = 17 + ver * 4
  const blocks = g1 + g2
  const dataLen = total - ecPer * blocks

  /* ── 비트열 ── */
  const bits: number[] = []
  const push = (val: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1) }
  push(0b0100, 4)
  push(bytes.length, ver < 10 ? 8 : 16)
  for (const b of bytes) push(b, 8)
  for (let i = 0; i < 4 && bits.length < dataLen * 8; i++) bits.push(0)
  while (bits.length % 8) bits.push(0)
  const words: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]
    words.push(v)
  }
  const PAD = [0xec, 0x11]
  for (let i = 0; words.length < dataLen; i++) words.push(PAD[i % 2])

  /* ── 블록 분할 → EC → 인터리브 ── */
  const short = Math.floor(dataLen / blocks)
  const dataBlocks: number[][] = [], ecBlocks: number[][] = []
  let at = 0
  for (let i = 0; i < blocks; i++) {
    const n = short + (i >= g1 ? 1 : 0)
    const blk = words.slice(at, at + n); at += n
    dataBlocks.push(blk); ecBlocks.push(ecc(blk, ecPer))
  }
  const stream: number[] = []
  const maxLen = Math.max(...dataBlocks.map((b) => b.length))
  for (let i = 0; i < maxLen; i++) for (const b of dataBlocks) if (i < b.length) stream.push(b[i])
  for (let i = 0; i < ecPer; i++) for (const b of ecBlocks) stream.push(b[i])

  /* ── 기능 모듈 배치 ──
     `fn[r][c] = true` 인 자리는 **마스크를 적용하지 않는다.** */
  const grid: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false))
  const fn: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false))
  const put = (r: number, c: number, v: boolean) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return
    grid[r][c] = v; fn[r][c] = true
  }

  // 파인더 + 분리자
  for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const inner = r >= 0 && r < 7 && c >= 0 && c < 7
      const on = inner && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))
      put(r0 + r, c0 + c, on)
    }
  }
  // 타이밍
  for (let i = 8; i < size - 8; i++) { put(6, i, i % 2 === 0); put(i, 6, i % 2 === 0) }
  // 정렬
  const al = ALIGN[ver]
  for (const r of al) for (const c of al) {
    if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
      put(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1)
  }
  put(size - 8, 8, true)                       // 항상 검정

  // 형식·버전 정보 자리를 기능 모듈로 예약(값은 마스크 확정 후)
  for (let i = 0; i <= 8; i++) { fn[8][i] = true; fn[i][8] = true }
  for (let i = 0; i < 8; i++) { fn[8][size - 1 - i] = true; fn[size - 1 - i][8] = true }
  if (ver >= 7) for (let i = 0; i < 18; i++) {
    fn[Math.floor(i / 3)][size - 11 + (i % 3)] = true
    fn[size - 11 + (i % 3)][Math.floor(i / 3)] = true
  }

  /* ── 데이터 채우기 (오른쪽 아래에서 지그재그) ── */
  let bit = 0, up = true
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--
    for (let i = 0; i < size; i++) {
      const row = up ? size - 1 - i : i
      for (const c of [col, col - 1]) {
        if (fn[row][c]) continue
        const byte = stream[bit >> 3] ?? 0
        grid[row][c] = ((byte >> (7 - (bit & 7))) & 1) === 1
        bit++
      }
    }
    up = !up
  }

  /* ── 형식 정보(BCH 15,5) ── */
  const putFormat = (g: boolean[][], mk: number) => {
    /*
     * **레벨 M 은 `0b00` 이다.** L=01 · M=00 · Q=11 · H=10 — 이름 순서가 아니다.
     * 0b10(=H)을 쓰면 EC 데이터는 M 으로 만들어 놓고 라벨만 H 가 되어
     * **어떤 디코더도 못 읽는다**(파인더·타이밍이 멀쩡해도 그렇다).
     */
    let fmt = (0b00 << 3) | mk                 // 레벨 M
    let d = fmt << 10
    for (let i = 4; i >= 0; i--) if ((d >> (i + 10)) & 1) d ^= 0x537 << i
    fmt = ((fmt << 10) | d) ^ 0x5412
    const b = (i: number) => ((fmt >> i) & 1) === 1
    // 왼쪽 위 (표준 배치)
    for (let i = 0; i <= 5; i++) g[8][i] = b(i)
    g[8][7] = b(6); g[8][8] = b(7); g[7][8] = b(8)
    for (let i = 9; i <= 14; i++) g[14 - i][8] = b(i)
    // 오른쪽 위 / 왼쪽 아래
    for (let i = 0; i <= 7; i++) g[8][size - 1 - i] = b(i)
    for (let i = 8; i <= 14; i++) g[size - 15 + i][8] = b(i)
    if (ver >= 7) {
      const vi = VER_INFO[ver]
      for (let i = 0; i < 18; i++) {
        const v = ((vi >> i) & 1) === 1
        g[Math.floor(i / 3)][size - 11 + (i % 3)] = v
        g[size - 11 + (i % 3)][Math.floor(i / 3)] = v
      }
    }
  }

  /* ── 마스크 8가지 중 벌점 최소 ── */
  const penalty = (g: boolean[][]) => {
    let s = 0
    // N1: 같은 색 5개 이상 연속
    for (let i = 0; i < size; i++) {
      for (const line of [g[i], g.map((row) => row[i])]) {
        let run = 1
        for (let j = 1; j < size; j++) {
          if (line[j] === line[j - 1]) { run++; if (run === 5) s += 3; else if (run > 5) s++ }
          else run = 1
        }
      }
    }
    // N2: 2×2 같은 색
    for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++)
      if (g[r][c] === g[r][c + 1] && g[r][c] === g[r + 1][c] && g[r][c] === g[r + 1][c + 1]) s += 3
    // N4: 검정 비율 편향
    let dark = 0
    for (const row of g) for (const v of row) if (v) dark++
    s += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10
    return s
  }

  let best: boolean[][] | null = null, bestScore = Infinity
  for (let mk = 0; mk < 8; mk++) {
    const g = grid.map((row) => row.slice())
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
      if (!fn[r][c] && MASKS[mk](r, c)) g[r][c] = !g[r][c]   // ← 기능 모듈은 건드리지 않는다
    putFormat(g, mk)
    const s = penalty(g)
    if (s < bestScore) { bestScore = s; best = g }
  }
  return best!
}

/**
 * QR 을 캔버스에 그린다.
 * `scale` 은 모듈 하나의 픽셀 크기 — 인쇄용이면 12 이상(A4 에 5cm 로 뽑아도 또렷하다).
 */
export function drawQR(text: string, scale = 12, quiet = 4, label?: string): HTMLCanvasElement {
  const m = qrMatrix(text)
  const n = m.length
  const w = (n + quiet * 2) * scale
  const labelH = label ? Math.round(scale * 7) : 0
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = w + labelH
  const x = cv.getContext('2d')!
  x.fillStyle = '#fff'
  x.fillRect(0, 0, cv.width, cv.height)
  x.fillStyle = '#000'
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    if (m[r][c]) x.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale)
  if (label) {
    x.fillStyle = '#111'
    x.font = `600 ${Math.round(scale * 2.6)}px "맑은 고딕", system-ui, sans-serif`
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.fillText(label, w / 2, w + labelH / 2 - scale * 0.6)
  }
  return cv
}
