/*
 * 가구장 리폼·타공 자료를 미니앱이 읽을 형태로 만든다.
 *   scripts/fixtures/reform-source.json  →  public/reform.json
 *
 * **install-cost 와 같은 구조다** — 원문을 fixture 에 굳혀 두고 파생물을 빌드한다.
 * 그쪽에서 배운 것 둘을 그대로 지킨다:
 *  ① **자동 갱신 경로가 없다는 것을 자료가 스스로 적는다**(`_robots`).
 *     삼성전자로지텍은 robots 가 `Disallow:/` 라 사람이 눈으로 옮겨야 한다.
 *  ② **개인정보가 새지 않게 검사한다** — 이 저장소는 public repo 다.
 *
 * `npm run build:reform` · 고치면 커밋할 것(test-reform 이 재생성 대조를 한다).
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'scripts/fixtures/reform-source.json')
const OUT = path.join(ROOT, 'public/reform.json')

const src = JSON.parse(fs.readFileSync(SRC, 'utf8'))

/* ── 검사 ─────────────────────────────────────────────────────────
   빌드가 통과시키면 그대로 배포된다. **여기서 막는 것이 마지막 관문이다.** */

/** 개인정보 — 이 저장소는 public 이라 이름·휴대폰·이메일이 섞이면 그대로 공개된다. */
function assertNoPrivate(o) {
  const bad = []
  const walk = (v, at) => {
    if (typeof v === 'string') {
      /* 앞뒤에 숫자가 붙으면 번호가 아니다 — 좌표·모델코드가 물린다
         (svc-centers 에서 위도 37.0104144947115 가 010+4144+9471 로 걸렸다) */
      if (/(^|[^0-9.])010[- ]?\d{3,4}[- ]?\d{4}([^0-9]|$)/.test(v)) bad.push(['휴대폰', at, v.slice(0, 60)])
      if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(v)) bad.push(['이메일', at, v.slice(0, 60)])
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, at + '[' + i + ']'))
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], at + '.' + k)
  }
  walk(o, '')
  if (bad.length) {
    console.error('개인정보가 섞였다:')
    bad.forEach((b) => console.error('  ' + b[0] + ' @' + b[1] + ' — ' + b[2]))
    process.exit(1)
  }
}

/** 표의 머리글 칸 수와 값 칸 수가 어긋나면 화면에서 칸이 밀린다(CSV 와 같은 함정). */
function assertGrid(sections) {
  let tables = 0, rows = 0
  for (const s of sections) {
    for (const b of s.blocks || []) {
      if (b.type !== 'table') continue
      tables++
      const w = b.head.length
      for (const r of b.rows) {
        rows++
        if (r.length !== w) {
          console.error(`격자 어긋남 — [${s.id}] ${b.cap}: 머리글 ${w}칸인데 값 ${r.length}칸 — ${r[0]}`)
          process.exit(1)
        }
      }
    }
  }
  return { tables, rows }
}

/** 출처 표시가 실제 출처 목록을 가리키는지. 오타면 화면에 근거가 안 뜬다. */
function assertSrc(sections, sources) {
  const ids = new Set(sources.map((s) => s.id))
  for (const s of sections) {
    for (const b of s.blocks || []) {
      if (b.src && !ids.has(b.src)) {
        console.error(`출처 id 를 못 찾음 — [${s.id}] ${b.cap}: "${b.src}"`)
        process.exit(1)
      }
    }
  }
}

assertNoPrivate(src)
const grid = assertGrid(src.sections)
assertSrc(src.sections, src._source)

/* ── 검색용 키워드 ─────────────────────────────────────────────────
   앱 안 검색이 쓴다. **화면에 적힌 말로 찾아져야 한다** — 이 저장소가
   통합검색에서 되풀이해 지킨 규칙이다(제목의 낱말이 kw 에 없으면 못 찾는다). */
const kwOf = (section) => {
  const bag = [section.title, section.sub]
  for (const b of section.blocks || []) {
    bag.push(b.cap, b.note, b.text)
    if (b.head) bag.push(b.head.join(' '))
    if (b.rows) for (const r of b.rows) bag.push(r.join(' '))
    if (b.items) bag.push(b.items.join(' '))
  }
  return bag
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const out = {
  _note: src._note,
  _robots: src._robots,
  collectedAt: src.collectedAt,
  sources: src._source,
  sections: src.sections.map((s) => ({ ...s, kw: kwOf(s) })),
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 1))

const blocks = src.sections.reduce((a, s) => a + (s.blocks || []).length, 0)
const kb = (fs.statSync(OUT).size / 1024).toFixed(0)
console.log(`public/reform.json — 절 ${src.sections.length} · 블록 ${blocks} · 표 ${grid.tables}(행 ${grid.rows}) · ${kb}KB`)
