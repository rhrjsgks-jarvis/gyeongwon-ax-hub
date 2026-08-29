/**
 * 시크릿쿠폰 발급기 회귀 검사 — `docs/apps-script/Coupon.gs` (2026-08-28)
 *
 * **Apps Script 는 구글에서만 돌기 때문에** 붙여넣기 전에는 확인할 방법이 없다.
 * 그래서 `SpreadsheetApp`·`LockService` 를 흉내 낸 **가짜 시트**를 만들어 실제 코드를
 * 그대로 돌려 본다 — 설치환경 이미지 수집기를 가짜 이미지 서버로 검사하는 것과 같은 방식이다
 * (*"삼성닷컴이 막힌 환경에서도 정말 제대로 바꿔치기하는가를 확인할 유일한 방법"*).
 *
 * 지키는 것 중 가장 중요한 둘:
 *   ① **`미사용` 을 소진으로 읽지 않는다** — 실제로 그렇게 읽어 전 종류가 「소진」으로 떴다.
 *   ② **같은 쿠폰이 두 번 나가지 않는다** — 고객에게 같은 번호가 가는 사고다.
 */
import { readFileSync } from 'node:fs'

let fail = 0
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fail++ }

/* ── 가짜 스프레드시트 ───────────────────────────────────── */
function makeSheet(name, rows) {
  const cells = rows.map((r) => r.slice())
  return {
    getName: () => name,
    isSheetHidden: () => false,
    getLastRow: () => cells.length,
    getLastColumn: () => cells.reduce((m, r) => Math.max(m, r.length), 0),
    getRange(row, col, nRows, nCols) {
      if (nRows === undefined) {
        return {
          getValue: () => (cells[row - 1] || [])[col - 1] ?? '',
          setValue: (v) => { while ((cells[row - 1] || []).length < col) cells[row - 1].push(''); cells[row - 1][col - 1] = v },
        }
      }
      return {
        getValues: () => {
          const out = []
          for (let r = row; r < row + nRows; r++) {
            const line = []
            for (let c = col; c < col + nCols; c++) line.push((cells[r - 1] || [])[c - 1] ?? '')
            out.push(line)
          }
          return out
        },
      }
    },
    _cells: cells,
  }
}

function install(sheets) {
  globalThis.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({ getSheets: () => sheets }),
    flush: () => {},
  }
  globalThis.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }
  globalThis.HtmlService = {
    createTemplateFromFile: () => { throw new Error('no file') },
    createHtmlOutput: (h) => h,
  }
  globalThis.Logger = { log: () => {} }
}

/* 실제 파일을 그대로 평가한다 — 사본을 만들면 그 사본만 검사하게 된다 */
const SRC = readFileSync(new URL('../docs/apps-script/Coupon.gs', import.meta.url), 'utf8')
const load = () => { (0, eval)(SRC) }

const CODES = ['SBZ-8842-1193', 'SBZ-7710-2284', 'SBZ-9931-4402', 'SBZ-1122-3344']

console.log('\n[1] `미사용` 을 소진으로 읽지 않는다 (실제로 겪은 사고)')
{
  const s = makeSheet('버즈4쿠폰', CODES.map((c) => [c, '미사용', '']))
  install([s]); load()
  const t = getAvailableTypes()[0]
  ok(t.count === 4, `미사용 4장을 잔여 4매로 센다 (실제: ${t.count})`)
  ok(!t.unreadable, '읽지 못함으로 잡히지 않는다')
}

console.log('\n[2] 빈칸도 미사용이다 · `사용` 은 세지 않는다')
{
  const s = makeSheet('버즈4쿠폰', [
    [CODES[0], '사용', new Date()],
    [CODES[1], '미사용', ''],
    [CODES[2], '', ''],
  ])
  install([s]); load()
  ok(getAvailableTypes()[0].count === 2, '사용 1장을 뺀 2장이 잔여다')
}

console.log('\n[3] 점명 열이 남아 있어도 찾아낸다 (9월 전 시트)')
{
  const s = makeSheet('버즈4쿠폰', [
    ['매장', '쿠폰번호', '상태'],
    ['성남', CODES[0], '미사용'],
    ['오산', CODES[1], '미사용'],
    ['수원', CODES[2], '사용'],
  ])
  install([s]); load()
  const t = getAvailableTypes()[0]
  ok(t.count === 2, `점명이 A열이어도 잔여 2매를 센다 (실제: ${t.count})`)
}

console.log('\n[4] 머리글은 쿠폰으로 세지 않는다')
{
  const s = makeSheet('버즈4쿠폰', [['쿠폰번호', '상태', '시각'], ...CODES.map((c) => [c, '미사용', ''])])
  install([s]); load()
  ok(getAvailableTypes()[0].total === 4, '머리글 줄을 빼고 4장으로 센다')
}

console.log('\n[5] 뽑으면 그 자리에서 `사용` 이 된다')
{
  const s = makeSheet('버즈4쿠폰', CODES.map((c) => [c, '미사용', '']))
  install([s]); load()
  const r = drawCoupon('버즈4쿠폰')
  ok(r.success && CODES.indexOf(r.couponNumber) !== -1, '쿠폰이 하나 나온다')
  ok(s._cells[r.rowIndex - 1][1] === '사용', '그 줄이 곧바로 `사용` 으로 바뀐다')
  ok(s._cells[r.rowIndex - 1][2] instanceof Date, '시각이 찍힌다')
  ok(getAvailableTypes()[0].count === 3, '잔여가 한 장 준다')
}

console.log('\n[6] **같은 쿠폰이 두 번 나오지 않는다** (고객에게 같은 번호가 가는 사고)')
{
  const s = makeSheet('버즈4쿠폰', CODES.map((c) => [c, '미사용', '']))
  install([s]); load()
  const got = []
  for (let i = 0; i < 4; i++) got.push(drawCoupon('버즈4쿠폰').couponNumber)
  ok(new Set(got).size === 4, `네 번 뽑아 네 장이 다 다르다 (${new Set(got).size}/4)`)
  const more = drawCoupon('버즈4쿠폰')
  ok(!more.success && more.soldOut, '다 나가면 소진으로 답한다')
}

console.log('\n[7] 취소하면 되살아난다 · 시각도 지운다')
{
  const s = makeSheet('버즈4쿠폰', CODES.map((c) => [c, '미사용', '']))
  install([s]); load()
  const r = drawCoupon('버즈4쿠폰')
  const back = cancelDraw(r.couponType, r.rowIndex, r.couponNumber)
  ok(back.success, '취소가 성공한다')
  ok(s._cells[r.rowIndex - 1][1] === '미사용', '`미사용` 으로 되돌아간다')
  ok(s._cells[r.rowIndex - 1][2] === '', '시각을 지운다 (안 지우면 나간 것으로 오해한다)')
  ok(getAvailableTypes()[0].count === 4, '잔여가 원래대로 돌아온다')
}

console.log('\n[8] 사용완료는 여러 번 눌러도 같다')
{
  const s = makeSheet('버즈4쿠폰', CODES.map((c) => [c, '미사용', '']))
  install([s]); load()
  const r = drawCoupon('버즈4쿠폰')
  confirmUse(r.couponType, r.rowIndex, r.couponNumber)
  confirmUse(r.couponType, r.rowIndex, r.couponNumber)
  ok(s._cells[r.rowIndex - 1][1] === '사용', '두 번 눌러도 `사용` 그대로다')
  ok(getAvailableTypes()[0].count === 3, '잔여가 더 줄지 않는다')
}

console.log('\n[9] 줄이 밀려도 쿠폰번호로 다시 찾는다')
{
  const s = makeSheet('버즈4쿠폰', CODES.map((c) => [c, '미사용', '']))
  install([s]); load()
  const r = drawCoupon('버즈4쿠폰')
  const wrongRow = (r.rowIndex % 4) + 1        // 엉뚱한 줄 번호를 넘긴다
  cancelDraw(r.couponType, wrongRow, r.couponNumber)
  ok(s._cells[r.rowIndex - 1][1] === '미사용', '번호로 찾아 제 줄을 되돌린다')
  ok(getAvailableTypes()[0].count === 4, '엉뚱한 줄을 건드리지 않았다')
}

console.log('\n[10] 못 읽은 것과 소진을 구분한다 (화면이 거짓말하지 않게)')
{
  const s = makeSheet('버즈4쿠폰', [['성남'], ['오산']])   // 쿠폰번호가 없다
  install([s]); load()
  const t = getAvailableTypes()[0]
  ok(t.unreadable === true, '쿠폰번호를 못 찾으면 `읽지 못함` 으로 답한다')
  const d = drawCoupon('버즈4쿠폰')
  ok(!d.success && !d.soldOut, '소진이 아니라 오류로 답한다')
}

console.log('\n[11] 탭 하나가 종류 하나 · `_` 탭은 세지 않는다')
{
  const a = makeSheet('버즈4쿠폰', CODES.map((c) => [c, '미사용', '']))
  const b = makeSheet('워치울트라2/워치9쿠폰', CODES.slice(0, 2).map((c) => [c, '미사용', '']))
  const memo = makeSheet('_메모', [['아무거나 123456']])
  install([a, b, memo]); load()
  const types = getAvailableTypes()
  ok(types.length === 2, `쿠폰 탭 둘만 센다 (실제: ${types.length})`)
  ok(types[0].type === '버즈4쿠폰' && types[1].type === '워치울트라2/워치9쿠폰', '탭 이름이 곧 버튼 이름이다')
  ok(types[1].count === 2, '탭마다 따로 센다')
}

console.log('\n[12] 화면과 스크립트가 같은 함수를 본다')
{
  const html = readFileSync(new URL('../docs/apps-script/CouponIndex.html', import.meta.url), 'utf8')
  const calls = [...new Set([...html.matchAll(/withFailureHandler\([^)]*\)\s*\.\s*([A-Za-z_]+)\s*\(/g)].map((m) => m[1]))]
  const missing = calls.filter((f) => !SRC.includes('function ' + f + '('))
  ok(missing.length === 0, `화면이 부르는 ${calls.length}개가 전부 있다` + (missing.length ? ` — 없음: ${missing}` : ''))
  ok(!/storeInput|findStoreCode|getStoreList/.test(html), '화면에 매장명 입력이 남아 있지 않다')
  /* 화면 문구가 동작과 어긋나면 상담사가 반대로 행동한다 */
  ok(html.includes('이미 사용 처리'), '경고 문구가 지금 동작(뽑는 즉시 사용)과 맞는다')
}

console.log('\n[13] 바코드 — 그려 놓고 **되읽어서** 대조한다')
{
  const html = readFileSync(new URL('../docs/apps-script/CouponIndex.html', import.meta.url), 'utf8')

  /* **화면 안의 인코더를 그대로 꺼내 돌린다.** 검사가 제 사본을 들면 두 벌이 조용히
     갈린다 — QR 이 포스터의 인라인 사본과 격자를 대조하는 것과 같은 이유다. */
  const src = html.slice(html.indexOf('var C128 = ('), html.indexOf('var BC_KINDS'))
    + html.slice(html.indexOf('function bcSvg('), html.indexOf('function bcPick('))
  const M = new Function(src + '; return { code128B, code39, bcSvg, C128, C39, C39_WIDE }')()

  /* 막대·여백을 폭 목록으로 되돌린다 */
  const runs = (bits) => {
    const out = []
    for (let i = 0; i < bits.length;) { let j = i; while (j < bits.length && bits[j] === bits[i]) j++; out.push(j - i); i = j }
    return out
  }
  const decode128 = (bits) => {
    const r = runs(bits), vals = []
    for (let k = 0; k < r.length;) {
      const take = (r.length - k === 7) ? 7 : 6
      const v = M.C128.indexOf(r.slice(k, k + take).join(''))
      if (v < 0) return null
      vals.push(v); k += take
    }
    if (vals[0] !== 104 || vals[vals.length - 1] !== 106) return null
    const data = vals.slice(1, -2)
    let sum = 104; data.forEach((v, i) => { sum += v * (i + 1) })
    if (sum % 103 !== vals[vals.length - 2]) return null      // 검사문자
    return data.map((v) => String.fromCharCode(v + 32)).join('')
  }
  const decode39 = (bits) => {
    const r = runs(bits), inv = {}
    for (const c in M.C39) inv[M.C39[c]] = c
    let out = ''
    for (let k = 0; k + 9 <= r.length;) {
      let pat = ''
      for (let m = 0; m < 9; m++) pat += r[k + m] === 1 ? 'n' : (r[k + m] === M.C39_WIDE ? 'w' : '?')
      if (!inv[pat]) return null
      out += inv[pat]; k += 9
      if (k < r.length) { if (r[k] !== 1) return null; k++ }   // 글자 사이 좁은 여백
    }
    return (out[0] === '*' && out[out.length - 1] === '*') ? out.slice(1, -1) : null
  }

  /* 실제로 들어올 법한 모양들 — 하이픈·순수숫자·긴 코드 */
  const CASES = ['SBZ-8842-1193', 'ABCDEF123456', '0123456789', 'SM-R630N-2026-0001', 'Z9']
  let bad128 = [], bad39 = []
  for (const c of CASES) {
    if (decode128(M.code128B(c)) !== c) bad128.push(c)
    if (decode39(M.code39(c)) !== c) bad39.push(c)
  }
  ok(bad128.length === 0, `Code 128 왕복 ${CASES.length}건 — 되읽은 값이 쿠폰번호와 같다` + (bad128.length ? ` — 틀림: ${bad128}` : ''))
  ok(bad39.length === 0, `Code 39 왕복 ${CASES.length}건 — 되읽은 값이 쿠폰번호와 같다` + (bad39.length ? ` — 틀림: ${bad39}` : ''))

  /* **하이픈이 반드시 들어가야 한다**(사장님 확정: "화면에 보이는 그대로").
     빼고 인코딩하면 스캔 값과 직원이 눈으로 읽고 친 값이 갈린다. */
  ok(decode128(M.code128B('SBZ-8842-1193')).includes('-'), 'Code 128 이 하이픈을 그대로 담는다')
  ok(decode39(M.code39('SBZ-8842-1193')).includes('-'), 'Code 39 가 하이픈을 그대로 담는다')

  /* **못 담는 글자는 지어내지 않는다.** 대문자로 바꾸거나 지워서 그리면 그 자리에서는
     아무도 모르고 계산대에서 틀린 쿠폰이 찍힌다. */
  ok(M.code128B('버즈4쿠폰코드') === null, '한글이 섞이면 Code 128 이 null 을 낸다(억지로 안 그린다)')
  ok(M.code39('buds4-a1') === null, '소문자가 섞이면 Code 39 가 null 을 낸다')
  ok(M.code128B('buds4-a1') !== null, '소문자는 Code 128 이 담는다 — 그래서 주 규격이다')

  /* 좌우 여백(quiet zone)은 규격 요구값이라 **SVG 안에서** 준다.
     CSS 여백에 맡기면 화면이 좁아졌을 때 조용히 사라진다. */
  const svg = M.bcSvg(M.code128B('SBZ-8842-1193'), 300, 64)
  const firstX = Number(svg.match(/<rect x="([\d.]+)"/)[1])
  const modW = 300 / (M.code128B('SBZ-8842-1193').length + 20)
  ok(Math.abs(firstX - modW * 10) < 0.01, `첫 막대 앞에 여백 10모듈이 있다 (${firstX.toFixed(1)}px)`)
  /* **언급이 아니라 실제 사용을 본다.** 처음엔 'crispEdges' 를 찾았다가 "쓰지 않는다"고
     적어 둔 주석에 걸렸다 — 이 저장소가 반복해 데인 부분일치 함정이다. */
  ok(!/shape-rendering/.test(html), '각지게 그리지 않는다 — 픽셀에 맞추면 막대 경계가 밀려 폭 비율이 틀어진다')

  /* 금색 티켓 위에 그으면 스캐너가 대비를 못 잡는다 */
  ok(/\.bc\{[^}]*background:#fff/.test(html), '바코드를 흰 블록 위에 그린다(대비 요구값)')
  ok(html.includes('renderBarcode(res.couponNumber)'), '뽑은 그 번호로 그린다')
  ok(html.includes('id="bcBox"') && html.includes('id="bcAltBtn"'), '바코드 자리와 규격 전환이 화면에 있다')
  ok(!/api\.|https?:\/\/[^"']*barcode/i.test(html.slice(html.indexOf('var C128'))), '바깥 바코드 서버를 부르지 않는다(쿠폰번호가 남의 로그에 남는다)')
}

console.log('\n[14] 바코드 표 자체가 옳은가 — **규격에서 다시 만들어** 대조한다')
{
  /* 왕복 검사([13])는 표의 두 항목이 서로 **바뀌어 있어도 통과한다** — 넣을 때도 뺄 때도
     같은 표를 보기 때문이다. 실제 스캐너는 다른 글자로 읽는다. 그래서 표를 안 믿고
     규격의 성질에서 다시 만들어 견준다. */
  const html = readFileSync(new URL('../docs/apps-script/CouponIndex.html', import.meta.url), 'utf8')
  const src = html.slice(html.indexOf('var C128 = ('), html.indexOf('var BC_KINDS'))
  const M = new Function(src + '; return { C128, C39 }')()

  /* ── Code 128 ── 규격 제약(요소 6개 · 각 1~4모듈 · 합 11 · 막대 폭 합이 짝수)을
     만족하는 조합을 전부 만들어 표와 견준다. */
  const gen = new Set()
  for (let a = 1; a <= 4; a++) for (let b = 1; b <= 4; b++) for (let c = 1; c <= 4; c++)
    for (let d = 1; d <= 4; d++) for (let e = 1; e <= 4; e++) for (let f = 1; f <= 4; f++)
      if (a + b + c + d + e + f === 11 && (a + c + e) % 2 === 0) gen.add(`${a}${b}${c}${d}${e}${f}`)

  ok(M.C128.length === 107 && new Set(M.C128).size === 107, '값이 107개이고 전부 다르다')
  const table = new Set(M.C128.slice(0, 106))
  ok([...table].every((p) => gen.has(p)), '표의 모든 패턴이 규격 제약을 만족한다')

  /* **빠진 둘은 규격이 일부러 뺀 것이다.** 정지문자(2331112)의 앞 6요소와, 그것을 거꾸로
     읽은 것의 앞 6요소 — 바코드는 양방향으로 읽히므로 정지문자와 헷갈릴 이 둘을 안 쓴다.
     표가 이 예외까지 맞다는 것이 전사(轉寫)가 옳다는 증거다. */
  const stop = M.C128[106]
  const banned = [stop.slice(0, 6), [...stop].reverse().join('').slice(0, 6)].sort()
  const extra = [...gen].filter((p) => !table.has(p)).sort()
  ok(JSON.stringify(extra) === JSON.stringify(banned),
    `표에 없는 조합이 정지문자와 헷갈리는 둘뿐이다 (${extra})`)
  ok(M.C128[103] === '211412' && M.C128[104] === '211214'
     && M.C128[105] === '211232' && stop === '2331112', '시작 A/B/C·정지 문자가 규격값과 같다')

  /* ── Code 39 ── 이 표는 **유도된다.** 40글자가 10개씩 네 무리이고 무리마다 넓은 여백의
     자리가 정해져 있으며(3·5·7·1), 무리 안 n번째 글자는 넓은 막대 두 자리가 무리를
     가로질러 같다. 나머지 4글자는 넓은 막대가 없고 여백 {1,3,5,7} 중 셋이 넓다.
     그래서 **바꿔치기까지 잡힌다.** */
  const G = [['1234567890', 3], ['ABCDEFGHIJ', 5], ['KLMNOPQRST', 7], ['UVWXYZ-. *', 1]]
  const BARS = [[0, 8], [2, 8], [0, 2], [4, 8], [0, 4], [2, 4], [6, 8], [0, 6], [2, 6], [4, 6]]
  const built = {}
  for (const [chars, sp] of G) for (let i = 0; i < 10; i++) {
    const p = Array(9).fill('n')
    BARS[i].forEach((x) => { p[x] = 'w' })
    p[sp] = 'w'
    built[chars[i]] = p.join('')
  }
  const SP = [7, 5, 3, 1]                    // 어느 조합이 어느 글자인지는 공표된 표 순서다
  SP.forEach((skip, i) => {
    const p = Array(9).fill('n')
    SP.filter((x) => x !== skip).forEach((x) => { p[x] = 'w' })
    built['$/+%'[i]] = p.join('')
  })

  const keys = Object.keys(M.C39)
  ok(keys.length === 44, `글자가 44개다 (실제 ${keys.length})`)
  const diff = keys.filter((k) => M.C39[k] !== built[k])
  ok(diff.length === 0, `44글자가 규격 규칙으로 만든 표와 한 글자도 다르지 않다 — 어긋남 ${diff}`)
}

console.log('\n[15] 바코드를 **보여준 뒤에** 그린다 (실물에서 잡은 조용한 버그)')
{
  /* 숨어 있을 때 그리면 상자 폭이 0 이라 하한값 180px 로 떨어지는데, 화면에는 멀쩡한
     바코드로 보인다. 실측으로 막대가 0.17mm 가 되어 **규격 하한 0.19mm 에도 못 미쳤다** —
     눈으로는 못 잡고 계산대에서야 드러나는 종류라 순서를 검사로 고정한다. */
  const html = readFileSync(new URL('../docs/apps-script/CouponIndex.html', import.meta.url), 'utf8')
  const iShow = html.indexOf("el('ticketSection').classList.add('show')")
  const iDraw = html.indexOf('renderBarcode(res.couponNumber)')
  ok(iShow > -1 && iDraw > iShow, '티켓을 보여준 뒤에 바코드를 그린다(상자 폭이 0 이면 안 된다)')
  ok(/box\.clientWidth/.test(html), '상자 폭을 재서 그린다 — 폭을 숫자로 박지 않는다')
  ok(/addEventListener\('resize'/.test(html), '창 크기·화면 방향이 바뀌면 다시 그린다')

  /* PC 를 키우되 좁은 화면 값은 건드리지 않는다(2026-08-28 사장님 요청) */
  ok(html.includes('@media (min-width:1024px)') && html.includes('@media (min-width:1440px)'),
    'PC 분기가 있다 — 넓은 화면에서만 키운다')
  const pc = html.slice(html.indexOf('@media (min-width:1024px)'))
  ok(/\.type-btn \.t-name\{font-size:2[0-9]/.test(pc), 'PC 에서 쿠폰 종류 글자를 키운다')
}

console.log(fail ? `\n실패 ${fail}건` : '\nALL PASS')
process.exit(fail ? 1 : 0)
