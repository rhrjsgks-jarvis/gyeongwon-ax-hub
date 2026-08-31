// 가구장 리폼 · 타공 규격 회귀 테스트
// 실행: node scripts/test-reform.mjs
//
// 이 모듈이 지켜야 하는 것은 install-cost 와 같다 —
//  ① 커밋된 파생물이 최신인가(재생성 대조)
//  ② 금액·치수 골든값이 그대로인가
//  ③ **출처가 갈리는 값을 한쪽으로 뭉개지 않았는가** (인덕션 전용 차단기)
//  ④ **신규 설치와 이전설치를 갈라 적는가** (안 가르면 상담사가 틀린 번호를 준다)
//  ⑤ 개인정보가 안 섞였는가 (public repo 다)
//  ⑥ 표 격자가 맞는가 (머리글 칸 수 = 값 칸 수)
import fs from 'fs'
import { execFileSync } from 'child_process'
/* **경로에 한글이 있다** — `new URL(...).pathname` 은 `%EB%85%B8…` 로 인코딩된 것을
   돌려줘 `Cannot find module` 이 난다. `fileURLToPath` 가 되돌린다. */
import { fileURLToPath } from 'url'

const url = (p) => new URL(p, import.meta.url)
let failed = 0
const fail = (m) => { console.error('ERROR: ' + m); failed++ }
const ok = (m) => console.log('OK: ' + m)

const OUT = url('../public/reform.json')
const SRC = url('../scripts/fixtures/reform-source.json')

/* ── [1] 신선도 — 커밋된 파생물이 지금 소스에서 나온 것인가 ──
   search-index·size-reps·examtool 과 같은 방식이다. 소스를 고치고 빌드를 안 돌리면
   **화면이 옛 자료를 보여주는데 아무 표시도 안 난다.** */
const before = fs.readFileSync(OUT, 'utf8')
execFileSync(process.execPath, [fileURLToPath(new URL('build-reform.mjs', import.meta.url))], { stdio: 'pipe' })
const after = fs.readFileSync(OUT, 'utf8')
if (before !== after) fail('[1] public/reform.json 이 낡았다 — `npm run build:reform` 을 돌려 커밋할 것')
else ok('[1] 커밋된 reform.json == 지금 재생성한 것')

const data = JSON.parse(after)
const src = JSON.parse(fs.readFileSync(SRC, 'utf8'))

/* ── [2] 골든 — 원문에서 확인한 값이 그대로인가 ──
   숫자를 손으로 고치다 조용히 틀어지는 것을 막는다. 전부 삼성닷컴 원문 값이다. */
const flat = JSON.stringify(data)
const GOLD = [
  ['냉장고장 단품 A(칸막이 제거)', '450,000원'],
  ['세트 A 기본형', '850,000원'],
  ['세트 D 홈바형', '1,630,000원'],
  ['빌트인 냉장고 B 수납형', '945,000원'],
  ['로봇청소기 표준규격장', '240,000원'],
  ['키친핏 Max 냉장고장 가로', '916mm 이상'],
  ['키친핏 Max 김치 가로', '803mm 이상'],
  ['키친핏 Max 높이', '1,873mm 이상'],
  ['인덕션 타공', '560 × 480mm'],
  ['오븐 75L 타공 폭', '560mm'],
  ['오븐 50L 타공 폭', '564mm'],
  ['후드장 리폼 1개', '300,000원'],
]
let g = 0
for (const [what, v] of GOLD) {
  if (!flat.includes(v)) fail(`[2] 골든값이 사라졌다 — ${what}: "${v}"`)
  else g++
}
if (g === GOLD.length) ok(`[2] 금액·치수 골든 ${g}건 그대로`)

/* ── [3] 출처가 갈리는 값을 한쪽으로 뭉개지 않았는가 ──
   인덕션 전용 차단기가 삼성닷컴 28,000원 ↔ 로지텍 무료로 갈린다.
   **한쪽을 고르면 상담에서 그대로 사고가 된다** — 에어컨 등급에서 세운 규칙이다. */
const conf = src.sections.flatMap((s) => (s.blocks || []).filter((b) => b.type === 'conflict'))
if (!conf.length) fail('[3] 출처가 갈리는 값(conflict 블록)이 사라졌다 — 인덕션 전용 차단기는 두 출처가 다르다')
else {
  const c = conf[0]
  const both = JSON.stringify(c)
  if (!both.includes('28,000') || !both.includes('무료')) fail('[3] 두 값 중 하나가 빠졌다 — 28,000원과 무료가 함께 있어야 한다')
  else if (c.rows.length < 2) fail('[3] 출처가 하나뿐이다 — 어느 쪽 값인지 밝혀야 한다')
  else ok(`[3] 갈리는 값 ${conf.length}건을 양쪽 다 적는다 (한쪽을 고르지 않는다)`)
}

/* ── [4] 신규 설치 ↔ 이전설치를 갈라 적는가 ──
   삼성닷컴 「인덕션 설치사」(신규, 4개사)와 사내 이전설치 표(중앙에너지)는 **다른 물건**이다.
   조사에서 처음에 "CLAUDE.md 가 틀렸다"고 판정했다가 원문 재확인으로 뒤집힌 자리라
   화면이 그 구분을 잃으면 안 된다. */
const who = data.sections.find((s) => s.id === 'who')
if (!who) fail('[4] 접수처 절이 없다')
else {
  const t = JSON.stringify(who)
  const need = ['신규', '이전설치', '1588-7192', '1899-4850']
  const miss = need.filter((x) => !t.includes(x))
  if (miss.length) fail(`[4] 접수처 구분이 무너졌다 — 빠진 것: ${miss.join(', ')}`)
  else ok('[4] 신규 설치(다설 1588-7192) ↔ 이전설치(중앙에너지 1899-4850) 를 갈라 적는다')
}

/* ── [5] 개인정보 — public repo 다 ── */
const priv = []
const walk = (v, at) => {
  if (typeof v === 'string') {
    if (/(^|[^0-9.])010[- ]?\d{3,4}[- ]?\d{4}([^0-9]|$)/.test(v)) priv.push('휴대폰 @' + at)
    if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(v)) priv.push('이메일 @' + at)
  } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, at + '[' + i + ']'))
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], at + '.' + k)
}
walk(data, '')
if (priv.length) fail('[5] 개인정보가 섞였다 — ' + priv.slice(0, 3).join(' · '))
else ok('[5] 개인정보 없음 (휴대폰·이메일 0건)')

/* ── [6] 표 격자 — 머리글 칸 수 = 값 칸 수 ──
   어긋나면 화면에서 칸이 통째로 밀린다(CSV 머리글과 같은 함정). */
let tables = 0, bad = 0
for (const s of data.sections) {
  for (const b of s.blocks || []) {
    if (b.type !== 'table') continue
    tables++
    for (const r of b.rows) if (r.length !== b.head.length) { bad++; fail(`[6] 격자 어긋남 — [${s.id}] ${b.cap}`) }
  }
}
if (!bad) ok(`[6] 표 ${tables}개의 격자가 맞다`)

/* ── [7] 「확인 못 한 것」을 남겨 두는가 ──
   이 저장소가 되풀이해 지킨 규칙 — 「없음」과 「확인 못 함」은 다른 말이다.
   누가 이 절을 지우면 화면이 *"다 안다"* 고 말하게 된다. */
const unk = data.sections.find((s) => s.id === 'unknown')
const unkRows = unk ? (unk.blocks || []).filter((b) => b.type === 'unknown').flatMap((b) => b.rows) : []
if (unkRows.length < 3) fail('[7] 「확인 못 한 것」이 사라졌다 — 못 찾은 것은 두드려 본 곳과 함께 남긴다')
else ok(`[7] 확인 못 한 것 ${unkRows.length}건을 근거와 함께 남긴다`)

/* ── [8] 화면이 자료를 읽는 길이 살아 있는가 ──
   앱이 `/reform.json` 을 받고 절마다 `kw` 로 검색한다. 한쪽만 고치면 조용히 깨진다. */
const app = fs.readFileSync(url('../public/reform-app.html'), 'utf8')
if (!app.includes("fetch('/reform.json'")) fail('[8] 앱이 /reform.json 을 받지 않는다')
else if (!data.sections.every((s) => typeof s.kw === 'string' && s.kw.length > 20)) fail('[8] 절에 검색 키워드(kw)가 없다')
else ok(`[8] 앱↔자료 연결 정상 (절 ${data.sections.length}개 · 전부 kw 있음)`)

/* ── [9] 배선 — 모듈을 만들고 어딘가 빠뜨리면 조용히 사라진다 ──
   이 저장소가 AS·배치·포스터 셋에서 실제로 겪은 일이다(MODULE_META 누락 → 통계 0). */
const wires = [
  ['app/reform/page.tsx', 'reform-app.html', '라우트'],
  ['app/page.tsx', "href: '/reform'", '허브 카드'],
  ['lib/logEvent.ts', "'reform'", 'LogModule'],
  ['app/admin/page.tsx', 'reform: {', 'MODULE_META'],
]
let w = 0
for (const [f, needle, what] of wires) {
  const s = fs.readFileSync(url('../' + f), 'utf8')
  if (!s.includes(needle)) fail(`[9] ${what} 가 빠졌다 — ${f} 에 "${needle}" 없음`)
  else w++
}
if (w === wires.length) ok(`[9] 배선 ${w}곳 (라우트·허브 카드·로그·대시보드)`)

console.log(failed ? `\n${failed}건 실패` : '\nALL PASS')
process.exit(failed ? 1 : 0)
