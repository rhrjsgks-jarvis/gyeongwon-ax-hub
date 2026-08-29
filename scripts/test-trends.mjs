/**
 * 「지금 많이 찾는 것」 회귀 검사 — 허브 통합검색창 아래 순위(2026-08-28)
 *
 * `lib/trends.ts` 는 순수 집계 함수라 브라우저 없이 직접 import 해 검사한다
 * (`test-admin.mjs` 가 `lib/logEvent.ts` 를 그렇게 검사하는 것과 같은 방식).
 *
 * **이 검사가 지키는 것 중 가장 중요한 것은 「도구 이름이 허브 카드와 같은가」다.**
 * 같은 것을 두 곳에 적으면 어긋난다 — 이 저장소가 허브 카드 개수·앱 버전·비교표
 * 값에서 반복해 데인 그 종류라, 파일을 실제로 읽어 전수 대조한다.
 */
import { readFileSync } from 'node:fs'
import {
  TOOL_INFO, topTools, topKeywords, pickTrends, kstDayStart, ENOUGH,
} from '../lib/trends.ts'

let fail = 0
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fail++ }

const DAY = 86_400_000
const NOW = Date.UTC(2026, 7, 28, 5, 0, 0)          // 2026-08-28 14:00 KST
const TODAY = kstDayStart(NOW)
let seq = 0
const ev = (module, action, uid, extra, ts = TODAY + (++seq) * 1000) =>
  ({ ts, date: '', module, action, uid, extra })

console.log('\n[1] 창 — KST 자정')
{
  ok(kstDayStart(Date.UTC(2026, 7, 28, 5, 0)) === Date.UTC(2026, 7, 27, 15, 0),
    'KST 자정을 UTC 15:00 으로 잡는다')
  // KST 00:30 은 아직 그날이다 — UTC 로 자르면 하루가 밀린다
  ok(kstDayStart(Date.UTC(2026, 7, 27, 15, 30)) === Date.UTC(2026, 7, 27, 15, 0),
    'KST 00:30 도 같은 날로 본다')
}

console.log('\n[2] 도구 — 세션 수로 센다(누가 많이 눌렀는가가 아니다)')
{
  const logs = [
    ...Array.from({ length: 20 }, () => ev('compare', 'page_view', 'u1')),   // 한 사람이 20번
    ...['a', 'b', 'c'].map((u) => ev('coupon', 'page_view', u)),             // 세 사람이 한 번씩
  ]
  const t = topTools(logs, TODAY)
  ok(t[0].module === 'coupon' && t[0].n === 3, '세 사람(3) 이 한 사람 20번을 이긴다')
  ok(t[1].module === 'compare' && t[1].n === 1, '한 사람은 몇 번을 눌러도 1 이다')
}

console.log('\n[3] 도구 — 세지 않는 것')
{
  const logs = [
    ...['a', 'b', 'c', 'd'].map((u) => ev('hub', 'page_view', u)),
    ...['a', 'b', 'c'].map((u) => ev('planner', 'page_view', u)),
    ...['a', 'b'].map((u) => ev('install', 'page_view', u)),
    ...['a', 'b', 'c'].map((u) => ev('install', 'search', u, 'x')),
  ]
  const t = topTools(logs, TODAY)
  ok(!t.some((x) => x.module === 'hub'), '허브 진입은 세지 않는다(진입은 사용이 아니다)')
  ok(!t.some((x) => x.module === 'planner'), '운영 종료 모듈은 세지 않는다')
  ok(t.length === 1 && t[0].n === 2, 'page_view 만 센다')
}

console.log('\n[4] 검색어 — 표기가 갈려도 한 줄로, 화면에는 사람이 친 말로')
{
  const logs = [
    ev('hub', 'search', 'a', 'WD90H25'),
    ev('hub', 'search', 'b', 'WD90H25'),
    ev('hub', 'search', 'c', 'wd90h25'),
    ev('hub', 'search', 'd', '냉장고'),
  ]
  const k = topKeywords(logs, TODAY)
  ok(k[0].q === 'WD90H25' && k[0].n === 3, '대소문자가 달라도 한 줄로 묶고 많이 쓰인 표기를 적는다')
  ok(k.length === 2, '다른 말은 따로 센다')
}

console.log('\n[5] 검색어 — 화면에 내보내지 않는 것')
{
  const bad = ['010-1234-5678', 'a@b.com', '1', '01012345678', '고객번호 123456789']
  const logs = bad.map((q, i) => ev('hub', 'search', 'u' + i, q))
  ok(topKeywords(logs, TODAY).length === 0, `개인정보·한 글자를 전부 막는다 (${bad.length}종)`)
  // 막느라 멀쩡한 말까지 지우면 안 된다
  const good = ['RM90H91B1W', '무풍', '85인치', 'wd90h25', '냉장고 4도어']
  const gl = good.map((q, i) => ev('hub', 'search', 'u' + i, q))
  ok(topKeywords(gl, TODAY).length === good.length, `멀쩡한 검색어는 그대로 통과한다 (${good.length}종)`)
}

console.log('\n[6] 창 고르기 — 오늘이 얇으면 최근 7일로 넓히고 그 사실을 밝힌다')
{
  const many = (base) => {
    const out = []
    for (let i = 0; i < ENOUGH; i++) {
      out.push(ev(Object.keys(TOOL_INFO)[i], 'page_view', 'u' + i, undefined, base + i * 1000))
      out.push(ev('hub', 'search', 'u' + i, 'kw' + i, base + i * 1000))
    }
    return out
  }
  const rich = pickTrends(many(TODAY), NOW)
  ok(rich.window === 'today', '오늘 자료가 충분하면 오늘로 본다')

  const thin = pickTrends([...many(NOW - 3 * DAY), ev('install', 'page_view', 'z')], NOW)
  ok(thin.window === 'week', '오늘이 얇으면 최근 7일로 넓힌다')
  ok(thin.tools.length >= ENOUGH, '넓히면 실제로 채워진다')

  const old = pickTrends(many(NOW - 30 * DAY), NOW)
  ok(old.tools.length === 0 && old.keywords.length === 0, '7일보다 오래된 것은 안 센다')
}

console.log('\n[7] 순위가 결정적인가 — 같은 값이면 흔들리면 안 된다')
{
  const logs = [
    ev('hub', 'search', 'a', '나중'), ev('hub', 'search', 'b', '나중'),
    ev('hub', 'search', 'c', '먼저'), ev('hub', 'search', 'd', '먼저'),
  ]
  const a = JSON.stringify(topKeywords(logs, TODAY))
  const b = JSON.stringify(topKeywords([...logs].reverse(), TODAY))
  ok(a === b, '순서를 바꿔 넣어도 같은 순위가 나온다')
}

console.log('\n[8] 도구 이름·주소가 허브 카드와 같은가 (두 곳에 적으면 어긋난다)')
{
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
  // 카드에서 href ↔ title 짝을 그대로 뽑는다
  const cards = [...page.matchAll(/href:\s*'([^']+)',[\s\S]{0,200}?title:\s*'([^']+)'/g)]
    .map((m) => ({ href: m[1], title: m[2] }))
  ok(cards.length >= 10, `허브 카드를 읽었다 (${cards.length}장)`)

  let mismatch = []
  for (const [mod, info] of Object.entries(TOOL_INFO)) {
    const card = cards.find((c) => c.href === info.href)
    if (!card) continue                       // 앵커(/#coupon)·외부 링크는 카드 href 가 다르다
    if (card.title !== info.label) mismatch.push(`${mod}: 카드 '${card.title}' ≠ 순위 '${info.label}'`)
  }
  ok(mismatch.length === 0, '카드와 짝지어지는 도구는 이름이 같다' + (mismatch.length ? '\n      ' + mismatch.join('\n      ') : ''))

  // 라우트가 실제로 있는가 — 없는 곳으로 보내면 눌렀을 때 404 다
  const routes = Object.values(TOOL_INFO).map((i) => i.href).filter((h) => !h.startsWith('/#'))
  const missing = routes.filter((h) => {
    try { readFileSync(new URL(`../app${h}/page.tsx`, import.meta.url)); return false } catch { return true }
  })
  ok(missing.length === 0, `주소가 전부 실재한다 (${routes.length}곳)` + (missing.length ? ` — 없음: ${missing}` : ''))
}

console.log('\n[9] 자기강화 고리를 끊었는가 — 칩으로 온 검색은 세지 않는다')
{
  const sp = readFileSync(new URL('../app/search/page.tsx', import.meta.url), 'utf8')
  ok(/from'\s*\)\s*===\s*'trend'/.test(sp), "/search 가 from=trend 를 알아본다")
  ok(/if\s*\(q\s*&&\s*!fromTrend\)\s*logEvent/.test(sp), '그 경우 검색을 기록하지 않는다')
  const cmp = readFileSync(new URL('../components/SearchTrends.tsx', import.meta.url), 'utf8')
  ok(cmp.includes('from=trend'), '칩이 그 표시를 붙여 보낸다')
}

console.log('\n[10] 집계 API 가 원본을 내보내지 않는가')
{
  const r = readFileSync(new URL('../app/api/trends/route.ts', import.meta.url), 'utf8')
  ok(/body\s*=\s*\{[^}]*tools[^}]*keywords[^}]*\}/.test(r), '내보내는 것은 도구·검색어 순위뿐이다')
  ok(!/logs\s*[,}]/.test(r.split('const body')[1] || ''), '원본 로그를 함께 내보내지 않는다')
  /* **좁은 창으로 받으면 조용히 틀린 순위가 나온다.** Apps Script 의 doGet 이 시간순을
     전제로 멈추는데 로그는 대기함 때문에 시간순이 아니다(역행 383곳·최대 332시간).
     실제로 days=8 로 배포했다가 install 49→18 · finder 실종을 겪었다. */
  const fetchLine = r.split(String.fromCharCode(10)).find((l) => l.includes("fetch(") && l.includes("days=")) || ""
  const reqDays = Number((fetchLine.split("days=")[1] || "").replace(/[^0-9]/g, "").slice(0, 3))
  ok(reqDays >= 30, `좁은 창으로 받지 않는다 — 실제 요청 days=${reqDays} (잘려서 순위가 틀린다)`)
  ok(r.includes('days=60'), '관리자와 같은 60일로 받아 창은 여기서 자른다')
  const gas = readFileSync(new URL('../docs/apps-script/Code.gs', import.meta.url), 'utf8')
  ok(gas.includes("if (ts < since) continue;"), 'Code.gs 가 옛 줄을 만나도 멈추지 않는다')
  ok(r.includes('normalizeLogs'), '대시보드와 같은 정규화를 쓴다')
}

console.log(fail ? `\n실패 ${fail}건` : '\nALL PASS')
process.exit(fail ? 1 : 0)
