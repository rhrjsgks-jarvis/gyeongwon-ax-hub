/*
 * 모델별 USP — 자료와 결과물이 어긋나지 않는지.
 *
 * **가장 위험한 것은 「지어낸 USP」다.** 이 저장소의 첫 원칙이 그것이고, 여기서는
 * *"못 찾은 모델에 비슷한 모델의 문구가 들어가는 것"* 으로 나타난다. 화면으로는
 * 절대 못 잡는다 — 그럴듯한 문장이 그럴듯한 자리에 있기 때문이다.
 *
 * `npm run test:uspmodel`
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const J = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', 'usp-models.json'), 'utf8'))
const M = J.models
let ok = true
const fail = (m) => { ok = false; console.log('FAIL: ' + m) }

/* ① 사장님이 지목한 44개가 그대로 있는가. **줄어도 늘어도 안 된다** —
   빠지면 그 모델을 안 다룬 것이고, 늘면 시키지 않은 것이 섞인 것이다. */
const WANT = [
  'KMR85RH95AFXKR', 'KMR85RH9GAFXKR', 'KQ77SH95AFXKR', 'KQ77SH93AFXKR', 'KQ85LSH03WFXKR',
  'KU85MH80AFXKR', 'KU27LSFM7AXXKR',
  'HW-Q930H', 'HW-Q990H',
  'RM90H91B1W', 'RM80H91S1X', 'RM70H91RMA', 'RM80H64S2A', 'RM90H64P2W',
  'RK80F49C1X', 'RK80F42C2A',
  'RWP90H15AN*',
  'WD90H25AH*', 'WH90F2522AAH*', 'WD80H25BHS', 'DV10BB8440GB', 'WA80F19SKB',
  'WW13BB844DGB', 'WF90F25AD*', 'DV90F22CD*', 'DF90H24R5C', 'DF18CB8700CR',
  'AF90H19D38WR*', 'AF70F19D24IR*',
  'AP90H10198EDD', 'AP90H10163EDD', 'AP70F06103RVD',
  'VS90F40CN*', 'VS70H18GV*',
  'VR90F01SAG*', 'VR90F01AAG*',
  'CC99H63I1D', 'CC99F63G1DS', 'CC99F63U1DS', 'CC80H63G1HS',
  'DW99F79E1US*', 'DW90F79F1US*', 'DW80F75L1U*', 'DW90F79P']
const have = M.map((m) => m.model)
const miss = WANT.filter((w) => !have.includes(w))
const extra = have.filter((h) => !WANT.includes(h))
if (miss.length) fail(`지목 모델이 빠졌다: ${miss.join(', ')}`)
if (extra.length) fail(`지목하지 않은 모델이 섞였다: ${extra.join(', ')}`)
if (!miss.length && !extra.length) console.log(`OK: 사장님이 지목한 ${WANT.length}개 모델이 그대로다`)

/* ② **못 찾은 모델에 남의 문구가 들어가지 않았는가.** 다른 모델의 USP 와 글자가 같으면
   옮겨 적은 것이다(같은 제품군이라 우연히 겹치는 일은 3줄 전부에서는 없다). */
const bySig = new Map()
for (const m of M) {
  const sig = (m.usp || []).map((u) => u.replace(/\s/g, '')).join('|')
  if (!sig) continue
  if (!bySig.has(sig)) bySig.set(sig, [])
  bySig.get(sig).push(m)
}
const dup = [...bySig.values()].filter((g) => g.length > 1)
/* **같은 제품이면 겹치는 것이 정상이다.** 가르는 근거는 셋 —
   ①제품명이 같다(색상 변형) ②한쪽 주소에 다른 쪽 코드가 들어 있다
   (AI구독 전용 SKU 가 그렇다: `ai-subs-kitchen/CC99F63G1DS-subscribe2-d2c/CC99F63U1DS/`)
   ③수집할 때 그 사실을 적어 두었다.
   **제품명만 보면 안 된다** — 구독 목록은 같은 제품인데 `(플렉스존)` 을 떼고 적는다. */
const sameProduct = (g) => {
  if (new Set(g.map((m) => m.name)).size === 1) return true
  for (const a of g) for (const b of g) {
    if (a === b) continue
    const code = String(b.secCode || b.model).replace(/\*/g, '')
    if (code && String(a.url || '').includes(code)) return true
    if (/USP 동일|같은 제품|색상 변형/.test(String(a.note || ''))) return true
  }
  return false
}
const suspect = dup.filter((g) => !sameProduct(g))
if (suspect.length) {
  for (const g of suspect) fail(`USP 3줄이 통째로 같은데 제품명이 다르다 — 옮겨 적었을 수 있다: ${g.map((m) => m.model).join(' / ')}`)
} else {
  console.log(`OK: USP 가 통째로 겹치는 서로 다른 제품 없음 (겹침 ${dup.length}쌍은 전부 같은 제품의 색상 변형)`)
}

/* ③ 못 찾은 것은 **비워 두고 이유를 적었는가.** 0 을 적거나 조용히 비우면
   *"USP 가 없는 제품"* 으로 읽힌다(비교표의 「없음」↔「미공개」와 같은 규칙). */
const noUsp = M.filter((m) => !(m.usp || []).length)
const noReason = noUsp.filter((m) => !(m.note || m.noteShort))
if (noReason.length) fail(`USP 를 못 찾았는데 이유가 없다: ${noReason.map((m) => m.model).join(', ')}`)
else console.log(`OK: USP 미확인 ${noUsp.length}건 전부 이유가 적혀 있다 (${noUsp.map((m) => m.model).join(', ')})`)

/* ④ **제품 사양이 섞이지 않았는가.** 사장님 지시: *"제품스펙은 필요없습니다"*.
   치수·무게·소비전력 같은 값이 USP 자리에 들어오면 상담 문장이 아니라 스펙표가 된다. */
/* 값만 늘어놓은 것은 상담 문장이 아니다 — 쉼표로 잇는 나열 꼴만 잡는다.
   `세탁 25kg, 건조 20kg 국내 최대 용량` 같은 정상 문장을 물지 않게 좁혔다. */
const SPECY = /(\d+[\d.,]*\s*(mm|kg|W|L|㎡|인치|형)\s*[,·]\s*){2,}|치수\s*:|색상\s*:/
const specy = M.filter((m) => (m.usp || []).some((u) => SPECY.test(u)))
if (specy.length) {
  /* **막지 않고 알린다** — 삼성이 그렇게 등록해 둔 SKU 가 실제로 있다(AF90H19D38WRT).
     우리가 넣은 것이 아니므로 실패시키면 우리가 어쩌지 못하는 이유로 빌드가 빨개진다. */
  console.log(`알림: 값만 나열한 USP 가 ${specy.length}건 — ${specy.map((m) => m.model).join(', ')}`)
  console.log('      (삼성이 그 SKU 에 사양 형태로 등록해 둔 것이다. 상담 문장은 「핵심 키워드」 쪽을 쓸 것)')
} else {
  console.log('OK: USP 자리에 값 나열이 없다')
}

/* ④-b **「최초·최대·유일」은 현장에서 반박당한다.** 이 저장소가 타사비교로 실제로
   겪은 일이다 — *"국내 일체형 최대용량(건조 20kg)"* 은 LG 워시콤보가 세탁 25/건조 21kg
   이라 성립하지 않아 셀링포인트에서 지웠다. **삼성 공식 문구라도 그대로 읽으면 안 된다.**
   지우지는 않는다(삼성이 쓴 말이다) — 상담 전에 확인하라고 알린다. */
const BRAG = /국내\s*최[대초]|세계\s*최[대초]|업계\s*최[대초]|유일/
const brag = []
for (const m of M) for (const u of (m.usp || [])) if (BRAG.test(u)) brag.push(`${m.model}: ${u}`)
if (brag.length) {
  console.log(`알림: 현장에서 반박당할 수 있는 문구 ${brag.length}건 — 상담 전 타사비교로 확인할 것`)
  brag.forEach((b) => console.log('      · ' + b))
} else {
  console.log('OK: 「최초·최대·유일」 문구 없음')
}

/* ⑤ 키워드가 **장표에 담기는 길이**인가. 50자를 넘으면 본문이 섞여 들어온 것이고,
   그런 줄은 키워드 칸에서 잘려 읽히지 않는다. */
const longKeys = M.reduce((a, m) => a + (m.heads || []).filter((h) => h.length > 50).length, 0)
const shownKeys = M.reduce((a, m) => a + (m.heads || []).filter((h) => h.length <= 50).slice(0, 22).length, 0)
if (shownKeys < 200) fail(`장표에 담기는 키워드가 ${shownKeys}개뿐이다 — 추출이 깨졌을 수 있다`)
else console.log(`OK: 장표 키워드 ${shownKeys}개 (50자 넘어 빠지는 줄 ${longKeys}개)`)

/* ⑥ **결과물이 자료보다 낡지 않았는가.** 자료를 고치고 PPT 를 안 만들면 사장님이
   옛 장표를 보게 된다(이 저장소가 색인·size-reps 에서 쓰는 그 규칙). */
const pptx = path.join(ROOT, 'tools', '모델별USP.pptx')
const srcP = path.join(ROOT, 'scripts', 'fixtures', 'usp-models.json')
if (!fs.existsSync(pptx)) fail('tools/모델별USP.pptx 가 없다 — npm run build:uspmodel')
else if (fs.statSync(pptx).mtimeMs < fs.statSync(srcP).mtimeMs) {
  fail('PPT 가 자료보다 낡았다 — npm run build:uspmodel 을 다시 돌려 커밋할 것')
} else {
  console.log(`OK: PPT 가 자료보다 새것이다 (${(fs.statSync(pptx).size / 1024).toFixed(0)}KB)`)
}

console.log(ok ? 'ALL PASS' : 'SOME FAILED')
process.exit(ok ? 0 : 1)
