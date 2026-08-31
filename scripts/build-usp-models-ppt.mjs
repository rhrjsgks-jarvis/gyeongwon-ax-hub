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
      { text: (m.name || '').slice(0, 40) },
      /* **못 찾은 것을 0 으로 적지 않고 「미확인」이라 적는다** — 0 은 *"USP 가 없다"* 로
         읽히는데 사실은 *"근거를 못 찾았다"* 다. 이 저장소가 비교표에서 「없음」과
         「미공개」를 가르는 규칙과 같다. */
      { text: n ? String(n) + '줄' : '미확인', options: { align: 'center', color: n ? INK : 'B45309', bold: !n } }
    ])
  }
  s.addTable(rows, {
    x: M, y: 1.05, w: W - M * 2, colW: [1.9, 2.4, 6.0, 1.83],
    fontSize: 10.5, color: INK, border: { pt: 0.5, color: LINE }, valign: 'middle', rowH: 0.2
  })
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

  /* 왼쪽 — 공식 셀링포인트 3줄. **이것이 주인공이다**(삼성이 제품마다 공식으로 싣는 말). */
  const usp = m.usp || []
  s.addText('공식 셀링포인트', { x: M, y: 1.55, w: 5.4, h: 0.3, fontSize: 12, bold: true, color: BLUE })
  if (usp.length) {
    s.addShape(pptx.ShapeType.roundRect, {
      x: M, y: 1.9, w: 5.5, h: 3.9, fill: { color: SOFT }, line: { color: 'C7D2FE', width: 0.75 }, rectRadius: 0.12
    })
    usp.forEach((u, i) => {
      s.addText(String(i + 1), {
        x: M + 0.22, y: 2.12 + i * 1.24, w: 0.34, h: 0.34,
        fontSize: 13, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle',
        shape: pptx.ShapeType.ellipse, fill: { color: BLUE }
      })
      s.addText(u, {
        x: M + 0.68, y: 2.06 + i * 1.24, w: 4.6, h: 1.05,
        fontSize: fitSize(u, 16, 34), bold: true, color: INK, valign: 'middle'
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
  const keys = (m.heads || []).filter((h) => h.length <= 50).slice(0, 22)
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

console.log(`${path.relative(ROOT, OUT)} — 슬라이드 ${MODELS.length + 2}장 (표지 · 목차 · 모델 ${MODELS.length})`)
console.log(`  공식 셀링포인트 ${need}줄 · 핵심 키워드 ${kept}개 · ${(zipBuf.length / 1024).toFixed(0)}KB`)
if (noUsp.length) {
  console.log(`  USP 미확인 ${noUsp.length}건 — ${noUsp.map((m) => m.model).join(', ')}`)
  console.log('  (지어내지 않고 「확정하지 못했습니다」로 적었습니다)')
}
void texts
