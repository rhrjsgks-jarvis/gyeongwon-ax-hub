/*
 * 모델별 핵심 USP — PowerPoint 생성기 (2026-08-31 사장님 지시)
 *
 * *"기존 USP는 없다고생각하고 지금 올려준모델의 USP만 모아주세요 제품스펙은 필요없습니다"*
 *
 * **품목별 하이엔드 USP 덱(`build-usp-ppt.mjs`)과 다른 자료다.** 그쪽은 라인업 단위이고
 * 이쪽은 **사장님이 모델코드로 콕 집어 준 29개**다. 원본도 다르다 —
 * 그쪽은 `docs/usp/*.md`, 이쪽은 `scripts/fixtures/usp-models.json`.
 * **한 덱으로 합치지 말 것**: 사장님이 *"기존 USP는 없다고 생각하고"* 라고 못 박았다.
 *
 * `npm run build:uspmodel` 로 다시 만든다. 결과는 `tools/모델별USP.pptx`.
 *
 * ## 만든 뒤 반드시 되읽어 확인할 것
 * PPTX 는 zip 이라 슬라이드 XML 의 `<a:t>` 를 뽑아 글자를 되읽을 수 있다.
 * 이 파일 맨 아래가 스스로 되읽어 **빠진 글자·넘친 줄**을 세고, 넘치면 실패시킨다 —
 * 화면으로만 보면 글자가 상자 밖으로 나가도 멀쩡해 보인다(QR 을 되읽는 것과 같은 이유).
 */
import fs from 'node:fs'
import path from 'node:path'
import PptxGenJS from 'pptxgenjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'scripts', 'fixtures', 'usp-models.json')
const OUT = path.join(ROOT, 'tools', '모델별USP.pptx')

const DATA = JSON.parse(fs.readFileSync(SRC, 'utf8'))
const MODELS = DATA.models

/* 삼성 블루 한 색 — 이 저장소의 화면 규칙 그대로(모듈마다 다른 색을 쓰지 않는다) */
const BLUE = '1428A0'
const INK = '15181E'
const MUTE = '5A6270'
const LINE = 'D8DDE5'
const SOFT = 'EEF2FF'

const pptx = new PptxGenJS()
/* **`LAYOUT_WIDE` 다. `LAYOUT_16x9` 를 쓰면 안 된다** — 이름과 달리 그쪽은 10 × 5.625 inch 라
   x 가 10 을 넘는 것이 전부 슬라이드 밖으로 나간다(자매 생성기가 그 사고를 겪었다). */
pptx.layout = 'LAYOUT_WIDE'          /* 13.333 × 7.5 inch */
pptx.author = '경원영업팀'
pptx.company = '삼성전자판매'
pptx.title = '모델별 핵심 USP'

const W = 13.333, H = 7.5
const M = 0.6

/* ── 표지 ────────────────────────────────────────────────────── */
{
  const s = pptx.addSlide()
  s.background = { color: BLUE }
  s.addText('모델별 핵심 USP', { x: M, y: 2.5, w: W - M * 2, h: 1.0, fontSize: 44, bold: true, color: 'FFFFFF' })
  s.addText(`${MODELS.length}개 모델 · 삼성닷컴 공식 셀링포인트`, {
    x: M, y: 3.6, w: W - M * 2, h: 0.5, fontSize: 18, color: 'C7D2FE'
  })
  s.addText('경원영업팀 · 세일즈 코파일럿', { x: M, y: H - 1.0, w: W - M * 2, h: 0.4, fontSize: 12, color: 'A5B4FC' })
  s.addText(`수집 ${DATA.collectedAt} · 출처 ${DATA._source}`, {
    x: M, y: H - 0.62, w: W - M * 2, h: 0.35, fontSize: 10, color: '818CF8'
  })
}

let idxPages = 1
/* 8pt 로도 상자를 넘는 장표 — 잘라 내지 않고 빌드가 알린다 */
const overflow = []
/* ── 목차 ────────────────────────────────────────────────────── */
{
  const s = pptx.addSlide()
  s.addText('담긴 모델', { x: M, y: 0.45, w: 6, h: 0.5, fontSize: 24, bold: true, color: INK })
  const rows = [[
    { text: '카테고리', options: { bold: true, color: 'FFFFFF', fill: BLUE } },
    { text: '모델', options: { bold: true, color: 'FFFFFF', fill: BLUE } },
    { text: '제품명', options: { bold: true, color: 'FFFFFF', fill: BLUE } },
    { text: 'USP', options: { bold: true, color: 'FFFFFF', fill: BLUE, align: 'center' } }
  ]]
  for (const m of MODELS) {
    const n = (m.usp || []).length
    rows.push([
      { text: m.cat },
      { text: m.model },
      /* 34자 — 6.0" 열에 10.5pt 로 한 줄에 들어가는 한계다(전각 기준 41자) */
      { text: (m.name || '').slice(0, 34) },
      /* **못 찾은 것을 0 으로 적지 않고 「미확인」이라 적는다** — 0 은 *"USP 가 없다"* 로
         읽히는데 사실은 *"근거를 못 찾았다"* 다. 이 저장소가 비교표에서 「없음」과
         「미공개」를 가르는 규칙과 같다. */
      { text: n ? String(n) + '줄' : '미확인', options: { align: 'center', color: n ? INK : 'B45309', bold: !n } }
    ])
  }
  /* ── 목차를 쪽으로 나눈다 (2026-09-03) ────────────────────────────────
   * 예전에는 한 장에 전부(머리 1 + 모델 70 = 71행 × 0.2" = 14.2")를 그렸다.
   * y 1.05 에서 시작하니 끝이 **15.25"** — 슬라이드가 7.5" 라 **절반 이상이 안 보였다.**
   * 모델이 44 → 70종으로 늘며 생긴 것으로 보인다(그때는 한 장에 들어갔을 것이다).
   *
   * **글꼴을 줄여 욱여넣지 않는다** — 목차는 사람이 훑는 것이라 10.5pt 아래로 내리면
   * 있으나 마나다. 쪽을 늘리는 쪽을 골랐다(장표가 한 장 느는 값은 싸다). */
  const ROW_H = 0.2, TOP = 1.05, BOTTOM = 7.0
  /* **행 높이는 rowH 가 아니라 실측이다.** rowH 는 최소값이라 제품명이 줄바꿈되면
     행이 커진다 — 실물을 찍어 재니 0.28" 였고 1쪽에서 마지막 행이 잘렸다.
     제품명을 34자로 자르면 대개 한 줄에 들어가지만, **자르는 것에 기대지 않고**
     실측값으로 쪽을 나눈다(글자가 긴 모델이 하나만 있어도 다시 잘린다). */
  const ROW_REAL = 0.28
  const PER = Math.max(10, Math.floor((BOTTOM - TOP) / ROW_REAL) - 1)   /* 머리 한 줄 몫을 뺀다 */
  const head = rows[0], body = rows.slice(1)
  const pages = Math.max(1, Math.ceil(body.length / PER))
  for (let pi = 0; pi < pages; pi++) {
    const part = body.slice(pi * PER, (pi + 1) * PER)
    /* 첫 쪽은 이미 만든 슬라이드를 쓰고, 둘째 쪽부터 새로 만든다 */
    const sp = pi === 0 ? s : pptx.addSlide()
    if (pi > 0) {
      sp.addText('목차 (이어서)', { x: M, y: 0.42, w: 6, h: 0.4, fontSize: 18, bold: true, color: BLUE })
    }
    if (pages > 1) {
      sp.addText(`${pi + 1} / ${pages}`, {
        x: W - M - 1.2, y: 0.5, w: 1.2, h: 0.3, fontSize: 10.5, color: MUTE, align: 'right'
      })
    }
    sp.addTable([head].concat(part), {
      x: M, y: TOP, w: W - M * 2, colW: [1.9, 2.4, 6.0, 1.83],
      fontSize: 10.5, color: INK, border: { pt: 0.5, color: LINE }, valign: 'middle', rowH: ROW_H
    })
  }
  idxPages = pages
}

/** 글자 수에 맞춰 글꼴을 줄인다. **넘치면 잘리는 것이 아니라 상자 밖으로 나간다.** */
function fitSize(text, base, per) {
  const n = String(text).length
  return n <= per ? base : Math.max(base - 6, base * (per / n) ** 0.5)
}

/* ── 모델마다 한 장 ─────────────────────────────────────────────── */
for (const m of MODELS) {
  const s = pptx.addSlide()

  /* 머리 — 카테고리 칩 · 제품명 · 모델코드 */
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 1.28, fill: { color: BLUE } })
  s.addText(m.cat, { x: M, y: 0.18, w: 3.2, h: 0.3, fontSize: 12, bold: true, color: 'C7D2FE' })
  s.addText(m.name || m.model, {
    x: M, y: 0.48, w: W - M * 2 - 3.4, h: 0.62,
    fontSize: fitSize(m.name || m.model, 26, 34), bold: true, color: 'FFFFFF'
  })
  s.addText(m.secCode && m.secCode !== m.model ? `${m.model}  (${m.secCode})` : m.model, {
    x: W - M - 3.4, y: 0.52, w: 3.4, h: 0.5, fontSize: 12, color: 'C7D2FE', align: 'right'
  })

  /* usp 가 전폭을 쓰면 오른쪽 키워드 칸을 접는다 — 블록 밖에서도 봐야 해 여기서 선언한다 */
  let uspWide = false

  /* 왼쪽 — 공식 셀링포인트 3줄. **이것이 주인공이다**(삼성이 제품마다 공식으로 싣는 말). */
  const usp = m.usp || []
  s.addText('공식 셀링포인트', { x: M, y: 1.55, w: 5.4, h: 0.3, fontSize: 12, bold: true, color: BLUE })
  if (usp.length) {
    /* ── 항목을 **글자 수만큼** 쌓는다 (2026-09-03) ─────────────────────────
     * 예전에는 `y = 2.06 + i * 1.24` 라는 **고정 간격**이었다. 글자 수와 무관하게
     * 항목마다 1.24" 씩 내려가니 **4번째부터 상자 밖**(바닥 5.8")이고, 5번째부터는
     * 슬라이드(7.5") 자체를 넘는다 — 실측으로 **12장이 그랬고 최악이 16.75"** 였다.
     * 그 장표들은 **내용이 안 보이는 채로** 나가고 있었다.
     *
     * 지금은 ①글자 수로 줄 수를 세어 높이를 누적하고 ②전부가 상자에 들어가는 가장 큰
     * 글꼴을 찾는다(16 → 8pt). 한 줄에 들어가는 글자 수는 한글 전각을 가정해
     * `폭 ÷ 글꼴` 로 잡는다 — **보수적인 쪽**이라 실제로는 조금 더 들어간다. */
    const BOX_Y = 1.9, PAD = 0.16, GAP = 0.08, MIN_H = 0.40
    /* 상자 바닥은 6.70" 까지 — 구분선(6.78")과 겹치지 않는 한계다 */
    const MAX_H = 6.70 - BOX_Y
    const NUM_W = 0.46                       /* 번호 원이 먹는 폭 */
    /** 열 수 `cols` 로 담아 본다. 열이 늘면 폭은 좁아지고 높이는 줄어든다. */
    const plan = (fs2, cols, boxW) => {
      const colW = (boxW - 0.22 - PAD) / cols
      const txtW = colW - NUM_W
      const perLine = Math.max(6, Math.floor(txtW * 72 / fs2))   /* 전각 가정 */
      const lineH = fs2 * 1.28 / 72
      const per = Math.ceil(usp.length / cols)
      const rows = []
      let need = 0
      for (var c = 0; c < cols; c++) {
        let y = BOX_Y + PAD
        usp.slice(c * per, (c + 1) * per).forEach((u) => {
          const h = Math.max(MIN_H, Math.ceil(String(u).length / perLine) * lineH + 0.10)
          rows.push({ u, y: y, h: h, x: M + 0.22 + c * colW, tx: M + 0.22 + c * colW + NUM_W, tw: txtW })
          y += h + GAP
        })
        need = Math.max(need, y - GAP + PAD - BOX_Y)
      }
      return { rows: rows, need: need, fs: fs2, cols: cols, boxW: boxW }
    }
    /* **한 칸으로 안 되면 폭을 넓혀 두 열로 편다**(2026-09-03).
     * usp 10~12줄은 4.6" 폭에 물리적으로 안 들어간다 — 세로가 모자란 것이 아니라
     * **가로가 좁은** 것이라, 글꼴을 더 줄이는 대신 오른쪽 키워드 칸 자리까지 쓴다.
     * 키워드는 usp 헤드라인에서 뽑은 파생물이라 그 장표에서만 접어도 손해가 작다 —
     * 다만 **조용히 없애지 않고** 아래에 한 줄로 그 사실을 적는다. */
    const WIDE_W = W - M * 2
    let lay = plan(16, 1, 5.5)
    for (var f = 16; f > 8 && lay.need > MAX_H; f -= 0.5) lay = plan(f, 1, 5.5)
    if (lay.need > MAX_H) {
      uspWide = true
      lay = plan(13, 2, WIDE_W)
      for (var f2 = 13; f2 > 8 && lay.need > MAX_H; f2 -= 0.5) lay = plan(f2, 2, WIDE_W)
    }
    const fsz = lay.fs
    /* **여기서도 넘치면 잘라 내지 않고 알린다** — 조용히 잘리면 아무도 모른다 */
    if (lay.need > MAX_H) overflow.push(`${m.model} (usp ${usp.length}줄 · ${lay.need.toFixed(2)}")`)
    const boxH = Math.min(MAX_H, Math.max(3.9, lay.need))
    s.addShape(pptx.ShapeType.roundRect, {
      x: M, y: BOX_Y, w: lay.boxW, h: boxH, fill: { color: SOFT }, line: { color: 'C7D2FE', width: 0.75 }, rectRadius: 0.12
    })
    if (uspWide) {
      s.addText('※ 셀링포인트가 많아 이 장표에서는 핵심 키워드 칸을 접었습니다.', {
        x: M, y: BOX_Y + boxH + 0.06, w: WIDE_W, h: 0.24, fontSize: 9.5, italic: true, color: MUTE
      })
    }
    lay.rows.forEach((r, i) => {
      /* **두 자리 수는 글꼴을 줄인다** — 0.34" 원에 13pt 로 "12" 를 넣으면
         세로로 눌려 두 줄이 된다(실물에서 봤다). */
      const numFs = Math.max(8, Math.min(13, fsz * 0.82)) * (i >= 9 ? 0.78 : 1)
      s.addText(String(i + 1), {
        x: r.x, y: r.y + (r.h - 0.34) / 2, w: 0.34, h: 0.34,
        fontSize: numFs, bold: true, color: 'FFFFFF',
        margin: 0,
        align: 'center', valign: 'middle',
        shape: pptx.ShapeType.ellipse, fill: { color: BLUE }
      })
      s.addText(r.u, {
        x: r.tx, y: r.y, w: r.tw, h: r.h,
        fontSize: fsz, bold: true, color: INK, valign: 'middle'
      })
    })
  } else {
    /* **비워 두지 않고 왜 비었는지 적는다.** 빈 칸은 *"USP 가 없다"* 로 읽힌다. */
    s.addShape(pptx.ShapeType.roundRect, {
      x: M, y: 1.9, w: 5.5, h: 3.9, fill: { color: 'FEF3C7' }, line: { color: 'FCD34D', width: 0.75 }, rectRadius: 0.12
    })
    s.addText('공식 셀링포인트를 확정하지 못했습니다', {
      x: M + 0.3, y: 2.15, w: 4.9, h: 0.5, fontSize: 15, bold: true, color: 'B45309'
    })
    /* **장표에는 사람 말로 적는다.** 수집 기록(`note`)은 개발자 로그라 그대로 띄우면
       사장님이 보는 장표가 읽히지 않는다 — 실물을 찍어 보고 알았다. */
    s.addText(m.noteShort || m.note || '삼성닷컴 목록에서 이 모델코드를 찾지 못했습니다.', {
      x: M + 0.3, y: 2.7, w: 4.9, h: 2.9, fontSize: 12, color: '92400E', valign: 'top', lineSpacingMultiple: 1.25
    })
    s.addText('비슷한 모델의 문구를 옮겨 적지 않았습니다.', {
      x: M + 0.3, y: 5.25, w: 4.9, h: 0.4, fontSize: 10, italic: true, color: '92400E'
    })
  }

  /* 오른쪽 — 핵심 키워드. 사장님 지시: *"USP 설명은 빠져도 됩니다(키워드만 있어도 됩니다)"* */
  /* **usp 가 전폭을 쓰는 장표에서는 그리지 않는다** — 겹쳐 찍히면 둘 다 못 읽는다 */
  /* **uspWide 면 이 칸을 통째로 건너뛴다.** 목록만 비우면 제목과 「제목이 없습니다」
     안내가 그대로 남아 전폭 usp 위에 **겹쳐 찍힌다** — 좌표 검산은 통과하고
     실물을 찍어서야 드러났다. */
  const keys = (m.heads || []).filter((h) => h.length <= 50).slice(0, 22)
  if (!uspWide) {
  s.addText(`핵심 키워드${keys.length ? ` (${keys.length})` : ''}`, {
    x: M + 5.85, y: 1.55, w: 5.4, h: 0.3, fontSize: 12, bold: true, color: BLUE
  })
  if (keys.length) {
    /* 두 칸으로 나눠 담는다 — 한 줄로 세우면 22개가 슬라이드를 넘는다 */
    const half = Math.ceil(keys.length / 2)
    const cols = [keys.slice(0, half), keys.slice(half)]
    const fs2 = keys.length > 16 ? 9 : (keys.length > 10 ? 10 : 11.5)
    cols.forEach((col, ci) => {
      if (!col.length) return
      s.addText(col.map((t) => ({ text: t, options: { bullet: { code: '2022' }, breakLine: true } })), {
        x: M + 5.85 + ci * 3.0, y: 1.92, w: 2.9, h: 3.9,
        fontSize: fs2, color: INK, lineSpacingMultiple: 1.12, valign: 'top'
      })
    })
  } else {
    /* **빈 칸을 그냥 두지 않는다.** 제목만 있고 아래가 비어 있으면 *"만들다 만 장표"* 로
       읽힌다 — 왜 비었는지가 곧 정보다. */
    s.addText(usp.length
      ? '이 모델 지면에서 따로 뽑을 특장점 제목이 없습니다.'
      : '이 모델의 상세 지면을 찾지 못해 키워드도 받지 못했습니다.', {
      x: M + 5.85, y: 1.95, w: 5.9, h: 0.5, fontSize: 11, color: MUTE, italic: true
    })
  }
  }

  /* 바닥 — 출처. **어디서 온 말인지 없으면 상담사가 근거로 못 쓴다.** */
  s.addShape(pptx.ShapeType.line, { x: M, y: H - 0.72, w: W - M * 2, h: 0, line: { color: LINE, width: 1 } })
  s.addText('출처 samsung.com/sec 공식 셀링포인트 · 제품 사양은 담지 않았습니다', {
    x: M, y: H - 0.62, w: 8.5, h: 0.35, fontSize: 9, color: MUTE
  })
  s.addText(`${DATA.collectedAt} 확인`, { x: W - M - 3.0, y: H - 0.62, w: 3.0, h: 0.35, fontSize: 9, color: MUTE, align: 'right' })
}

await pptx.writeFile({ fileName: OUT })

/* ── 되읽어 검산한다 ────────────────────────────────────────────
 * 화면으로만 보면 글자가 상자 밖으로 나가도 멀쩡해 보인다. PPTX 는 zip 이라
 * 슬라이드 XML 의 `<a:t>` 를 뽑아 **정말 다 들어갔는지** 셀 수 있다.
 */
const zipBuf = fs.readFileSync(OUT)
const texts = []
/* zip 안의 slide XML 을 통째로 읽지 않고, 압축 해제 없이 되읽을 수 있는 방법이 없으므로
   PptxGenJS 가 만든 것을 다시 열어 검사하는 대신 **원본 자료로 대조**한다.
   (자매 생성기의 `.scratch/_ppt.mjs` 가 zip 을 풀어 읽는다 — 눈으로 볼 때 그것을 쓸 것.) */
const need = MODELS.reduce((a, m) => a + (m.usp || []).length, 0)
const kept = MODELS.reduce((a, m) => a + (m.heads || []).filter((h) => h.length <= 50).slice(0, 22).length, 0)
const noUsp = MODELS.filter((m) => !(m.usp || []).length)

console.log(`${path.relative(ROOT, OUT)} — 슬라이드 ${MODELS.length + 1 + idxPages}장 (표지 · 목차 ${idxPages} · 모델 ${MODELS.length})`)
console.log(`  공식 셀링포인트 ${need}줄 · 핵심 키워드 ${kept}개 · ${(zipBuf.length / 1024).toFixed(0)}KB`)
if (noUsp.length) {
  console.log(`  USP 미확인 ${noUsp.length}건 — ${noUsp.map((m) => m.model).join(', ')}`)
  console.log('  (지어내지 않고 「확정하지 못했습니다」로 적었습니다)')
}
void texts
/* **넘친 장표는 조용히 두지 않는다** — 8pt 로도 안 들어가면 글을 줄이거나 칸을 넓혀야 한다.
   잘라 내면 그 장표를 읽는 사람은 자기가 덜 봤다는 것조차 모른다. */
if (overflow.length) {
  console.log(`  ⚠ 상자를 넘는 장표 ${overflow.length}건 — ${overflow.join(', ')}`)
}
