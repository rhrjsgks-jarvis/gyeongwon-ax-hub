/*
 * 품목별 하이엔드 USP — PowerPoint 생성기 (2026-08-31 사장님 요청)
 *
 * *"USP는 ppt로 만들어주세요"*
 *
 * **A4 카드 생성기(`build-usp-cards.mjs`)와 같은 자료를 쓴다.** 파서를 두 벌 두면
 * 한쪽만 고쳐지는 것이 이 저장소가 되풀이해 데인 일이라, 카드 생성기가 내보내는
 * `CARDS` 를 그대로 가져온다. **원본은 `docs/usp/*.md` 하나뿐이다.**
 *
 * `npm run build:usppt` 로 다시 만든다. 결과는 `tools/제품USP.pptx`.
 *
 * ## 만든 뒤 반드시 되읽어 확인할 것
 * PPTX 는 zip 이라 슬라이드 XML 의 `<a:t>` 를 뽑아 글자를 되읽을 수 있다
 * (`node .scratch/_ppt.mjs tools/제품USP.pptx`). 화면으로만 보면 **글자가 상자 밖으로
 * 넘쳐도 멀쩡해 보인다** — QR 을 되읽어 검사하는 것과 같은 이유다.
 */
import fs from 'node:fs'
import path from 'node:path'
import PptxGenJS from 'pptxgenjs'
import { CARDS } from './build-usp-cards.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'tools', '제품USP.pptx')

/* 삼성 블루 한 색 — 이 저장소의 화면 규칙 그대로(모듈마다 다른 색을 쓰지 않는다) */
const BLUE = '1428A0'
const INK = '15181E'
const MUTE = '5A6270'
const LINE = 'D8DDE5'
const SOFT = 'EEF2FF'

const pptx = new PptxGenJS()
/* **`LAYOUT_WIDE` 다. `LAYOUT_16x9` 를 쓰면 안 된다** — 이름과 달리 그쪽은
 * **10 × 5.625 inch** 이고 `LAYOUT_WIDE` 가 13.333 × 7.5 다(둘 다 16:9 비율이지만
 * 좌표 단위가 다르다).
 *
 * 처음에 16x9 를 쓰면서 아래 `W = 13.333` 으로 계산해 **x 가 10 을 넘는 것이 전부
 * 슬라이드 밖으로 나갔다** — 모델코드(x=10.33)가 안 보이고, 사양표 값 열이
 * (8.35+4.48=12.83) 통째로 안 그려지고, 긴 사양 값이 잘렸다. **증상 셋이 전부
 * 이 상수 하나 때문이었다.** 되읽기로는 글자가 다 들어가 있어 못 잡고,
 * PowerPoint 로 렌더해 눈으로 보고서야 알았다. */
pptx.layout = 'LAYOUT_WIDE'          /* 13.333 × 7.5 inch */
pptx.author = '경원영업팀'
pptx.company = '삼성전자판매'
pptx.title = '품목별 하이엔드 USP'

const W = 13.333, H = 7.5
const M = 0.5                         /* 바깥 여백 */

/* ── 표지 ────────────────────────────────────────────────────── */
{
  const s = pptx.addSlide()
  s.background = { color: BLUE }
  s.addText('품목별 하이엔드 USP', {
    x: M, y: 2.5, w: W - M * 2, h: 1.0,
    fontSize: 40, bold: true, color: 'FFFFFF', fontFace: '맑은 고딕',
  })
  s.addText(`${CARDS.length}개 품목 · 삼성닷컴 원문 기준 · 2026-08-31 조사`, {
    x: M, y: 3.5, w: W - M * 2, h: 0.5,
    fontSize: 16, color: 'BFC9F0', fontFace: '맑은 고딕',
  })
  s.addText('경원영업팀', {
    x: M, y: H - 1.0, w: W - M * 2, h: 0.4,
    fontSize: 13, color: '8FA0E0', fontFace: '맑은 고딕',
  })
}

/* ── 목차 ────────────────────────────────────────────────────── */
{
  const s = pptx.addSlide()
  s.addText('목차', { x: M, y: 0.4, w: 6, h: 0.5, fontSize: 22, bold: true, color: BLUE, fontFace: '맑은 고딕' })
  s.addShape(pptx.ShapeType.line, { x: M, y: 0.95, w: W - M * 2, h: 0, line: { color: BLUE, width: 2 } })
  /* 24개를 3단으로 — 한 단에 8개 */
  const per = Math.ceil(CARDS.length / 3)
  for (let col = 0; col < 3; col++) {
    const items = CARDS.slice(col * per, (col + 1) * per)
    s.addText(
      items.map((c, i) => ({
        text: `${String(col * per + i + 3).padStart(2, ' ')}  ${c.cat}\n`,
        options: { fontSize: 13, color: INK, breakLine: false },
      })),
      { x: M + col * ((W - M * 2) / 3), y: 1.2, w: (W - M * 2) / 3 - 0.2, h: 5.5, fontFace: '맑은 고딕', lineSpacingMultiple: 1.45 }
    )
  }
  s.addText('쪽번호는 슬라이드 순서입니다', {
    x: M, y: H - 0.6, w: 6, h: 0.3, fontSize: 10, color: MUTE, fontFace: '맑은 고딕',
  })
}

/* ── 제품 한 장씩 ────────────────────────────────────────────── */
for (const c of CARDS) {
  const s = pptx.addSlide()

  /* 머리 — 품목 · 제품명 · 모델코드 */
  s.addText(c.cat, { x: M, y: 0.3, w: 6, h: 0.3, fontSize: 12, bold: true, color: BLUE, fontFace: '맑은 고딕' })
  s.addText(c.name, {
    x: M, y: 0.58, w: W - M * 2 - 2.6, h: 0.55,
    fontSize: 24, bold: true, color: INK, fontFace: '맑은 고딕', shrinkText: true,
  })
  /* **모델코드를 부제와 한 줄에 붙인다.** 오른쪽 위에 따로 두었더니 두 번 다 안 보였다
     — 제목 상자와 겹쳐 가려진 것으로 보인다. 한 상자에 넣으면 그럴 일이 없다. */
  s.addText([
    { text: c.sub, options: { fontSize: 12, color: MUTE } },
    { text: `   ${c.model}`, options: { fontSize: 11, bold: true, color: BLUE, fontFace: 'Consolas' } },
  ], { x: M, y: 1.16, w: W - M * 2, h: 0.3, fontFace: '맑은 고딕' })
  s.addShape(pptx.ShapeType.line, { x: M, y: 1.52, w: W - M * 2, h: 0, line: { color: BLUE, width: 2.5 } })

  /* 왼쪽 — 핵심 USP (2단) */
  const UW = 8.4                       /* USP 영역 폭 */
  s.addText([
    { text: '핵심 USP', options: { fontSize: 13, bold: true, color: BLUE } },
    { text: `  ${c.usp.length}`, options: { fontSize: 10, bold: true, color: BLUE } },
  ], { x: M, y: 1.72, w: UW, h: 0.3, fontFace: '맑은 고딕' })

  const half = Math.ceil(c.usp.length / 2)
  for (let col = 0; col < 2; col++) {
    const items = c.usp.slice(col * half, (col + 1) * half)
    if (!items.length) continue
    s.addText(
      items.map((u, i) => ({
        text: `${col * half + i + 1}. ${u.h}\n`,
        /* 삼성 공식 요약(uspDescList)은 굵게 — 상담사가 그대로 읽어도 되는 문장이다 */
        options: { fontSize: 9, bold: !!u.official, color: u.official ? BLUE : INK, breakLine: false },
      })),
      {
        x: M + col * (UW / 2), y: 2.08, w: UW / 2 - 0.15, h: 4.9,
        fontFace: '맑은 고딕', lineSpacing: 13, valign: 'top',
      }
    )
  }

  /* 오른쪽 — 핵심 사양 */
  const RX = M + UW + 0.25
  const RW = W - RX - M
  s.addText('핵심 사양', { x: RX, y: 1.72, w: RW, h: 0.3, fontSize: 13, bold: true, color: BLUE, fontFace: '맑은 고딕' })
  /* **표(addTable)를 쓰지 않는다.** 두 번 만들어 봤는데 **값 열이 통째로 안 그려졌다** —
     `colW` 가 슬라이드 폭 밖으로 밀린 것으로 보인다. 되읽기로는 글자가 다 들어가 있어
     **실물을 렌더해 보고서야 알았다.**
     항목명과 값을 **한 상자 안에 두 줄로** 적으면 그 문제가 원천적으로 없다. */
  if (c.spec.length) {
    /* **값이 길면 잘린다.** 실측으로 `후면 200MP 광각 F1.4 + 50MP 망원…` 이 상자 밖으로
       나갔다. 이 자리는 **상담에서 눈으로 훑는 근거**라 문장을 다 실을 필요가 없다 —
       한 줄에 들어갈 만큼만 남기고 나머지는 원본(`docs/usp/`)에 있다. */
    const clip = (t) => (t.length > 34 ? t.slice(0, 33).trim() + '…' : t)
    /* **주의사항이 있으면 세로 자리를 내준다** — 사양이 아래까지 밀고 내려가 그 상자를
       덮었다. 주의사항은 현장에서 반박당하는 것이라 사양보다 먼저다. */
    const specH = c.warns.length ? 4.15 : 4.9
    const room = Math.floor(specH / 0.32)           /* 한 항목이 두 줄이라 대략 이만큼 */
    s.addText(
      c.spec.slice(0, room).flatMap((r) => [
        { text: `${clip(r.k)}\n`, options: { fontSize: 7.5, color: MUTE, breakLine: false } },
        { text: `${clip(r.v)}\n`, options: { fontSize: 9, color: INK, bold: true, breakLine: false } },
      ]),
      {
        x: RX, y: 2.06, w: RW, h: specH,
        fontFace: '맑은 고딕', lineSpacing: 11.5, valign: 'top',
      }
    )
  }

  /* 아래 — 상담 전 확인. **있을 때만 그린다** — 없는데 빈 상자를 두면 무언가 빠진 것처럼 보인다 */
  if (c.warns.length) {
    const wy = 6.35
    s.addShape(pptx.ShapeType.roundRect, {
      x: M, y: wy, w: W - M * 2, h: 0.72,
      fill: { color: 'FFFBEB' }, line: { color: 'FDE68A', width: 1 }, rectRadius: 0.06,
    })
    /* **제목을 왼쪽에 두고 본문을 그 오른쪽으로 밀었다** — 위아래로 두었더니 제목과
       첫 줄이 겹쳤다(상자 높이 0.72 안에 두 상자를 넣기엔 좁다). */
    s.addText('상담 전 확인', {
      x: M + 0.14, y: wy + 0.06, w: 1.1, h: 0.6,
      fontSize: 9, bold: true, color: 'B45309', fontFace: '맑은 고딕', valign: 'top',
    })
    s.addText(
      c.warns.map((w) => ({ text: `· ${w}\n`, options: { fontSize: 8.5, color: '92400E', breakLine: false } })),
      { x: M + 1.3, y: wy + 0.06, w: W - M * 2 - 1.45, h: 0.62, fontFace: '맑은 고딕', lineSpacing: 10, valign: 'top' }
    )
  }

  /* 꼬리 — 출처. 슬라이드 번호는 PowerPoint 가 아니라 우리가 적는다(자리를 못 박기 위해) */
  s.addText('삼성닷컴 원문 · 2026-08-31 조사', {
    x: M, y: H - 0.42, w: 6, h: 0.25, fontSize: 8, color: '9AA1AC', fontFace: '맑은 고딕',
  })
  s.addText(`${CARDS.indexOf(c) + 3} / ${CARDS.length + 2}`, {
    x: W - M - 1.5, y: H - 0.42, w: 1.5, h: 0.25, fontSize: 8, color: '9AA1AC', align: 'right', fontFace: '맑은 고딕',
  })
}

await pptx.writeFile({ fileName: OUT })
const kb = (fs.statSync(OUT).size / 1024).toFixed(0)
console.log(`제품 USP 발표자료 — 슬라이드 ${CARDS.length + 2}장 · ${kb}KB`)
console.log(`  ${path.relative(ROOT, OUT)}`)
console.log(`\n되읽어 확인: node .scratch/_ppt.mjs tools/제품USP.pptx`)
