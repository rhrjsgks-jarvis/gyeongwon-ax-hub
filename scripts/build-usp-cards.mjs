/*
 * 품목별 하이엔드 USP — A4 한 장짜리 카드 생성기 (2026-08-31 사장님 요청)
 *
 * *"USP 요약해서 각 제품별로 A4용지 한장씩으로 만들어주세요"*
 * → 범위는 **품목별 대표 1장씩**(사장님 선택). 108개 제품 전부는 108장이라 인쇄가 어렵다.
 * → 담는 것은 **핵심 USP · 핵심 사양 · 주의사항** 셋(사장님 선택. 판매가는 뺐다 — 수시로 바뀐다).
 * → 결과물은 **자립형 HTML 하나**(사장님 선택). 메일로 보내도 그 PC 에서 바로 인쇄된다.
 *
 * 원본은 `docs/usp/*.md` 6종이고 이 스크립트는 **거기서만 읽는다.** 손으로 옮겨 적지
 * 않는 이유는 이 저장소가 되풀이해 데인 것 그대로다 — 두 곳에 적으면 한쪽만 고쳐진다.
 * `npm run build:uspcards` 로 다시 만든다.
 *
 * ## 자립성이 취향이 아니라 기능 요구사항이다
 * 시험지 출력기와 같다 — 받는 사람 PC 에는 우리 저장소도 서버도 없다. 바깥 것을 하나라도
 * 부르면 **그 환경에서만 조용히 반쪽이 된다.** 그래서 `assertSelfContained` 가 막는다.
 * 특히 이 저장소는 **전산PC 에서 Vercel 이 안 열린다**(2026-08-31 사장님 확인)는 제약이
 * 있어, 파일 한 장으로 도는 것이 더 중요하다.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'docs', 'usp')
const OUT = path.join(ROOT, 'tools', '제품USP카드.html')

/* ── 품목 20개와 그 대표 모델 ─────────────────────────────────────
 * **모델코드로 지목한다** — 절 제목은 문서마다 형식이 달라(`## 냉장고 — 4도어` vs
 * `## 1-1. 울트라 — 최상위`) 제목으로 찾으면 문서를 고칠 때마다 깨진다.
 * 모델코드는 그 제품의 유일한 이름이라 안 흔들린다.
 *
 * 고른 기준은 **갈래별 최상위**다. 같은 품목에 갈래가 여럿이면(냉장고 4도어·양문형·
 * 키친핏…) 그중 최상위 하나만 싣고, 나머지는 `docs/usp/` 원본에 있다. */
const PICKS = [
  ['TV',          'KMR85RH95AFXKR', 'Micro RGB — TV 최상위'],
  ['프로젝터',      'SP-LPDU9SAXXKR', 'The Premiere — 4K 초단초점 최상위'],
  ['사운드바',      'HW-Q990H/KR',    '11.1.4ch — 사운드바 최상위'],
  ['오디오',        'JBL4312GBLK',    'JBL 4312G — 스피커 최상위'],
  ['냉장고',        'RM90H91B1W',     '4도어 프리스탠딩 — 패밀리허브'],
  ['김치냉장고',    'RK80F58B1A',     '스탠드형 4도어 — 최상위'],
  ['세탁기',        'WF90F25ADS',     'Bespoke AI 세탁기 25kg'],
  ['세탁건조기(콤보)', 'WD99F25AHR',  'Infinite AI 콤보 25/18kg'],
  ['통돌이 세탁기', 'WA80F19SKB',     'AI 통버블 19kg'],
  ['식기세척기',    'DW99F79E1UHCS',  'Infinite AI 빌트인 14인용'],
  ['에어컨',        'AF90H25D36WRT',  '무풍콤보 갤러리 프로 — 최상위'],
  ['벽걸이 에어컨', 'AR80H07D21WT',   '무풍콤보 프로 벽걸이'],
  ['공기청정기',    'AP90H10198UDD',  '스탠드형 최상위'],
  ['로봇청소기',    'VR90F01SAG98CS', 'AI 스팀 울트라'],
  ['무선청소기',    'VS90F40CSK',     '비스포크 AI 제트 울트라'],
  ['스마트폰',      'SM-S948N',       '갤럭시 S26 울트라 — 바형 최상위'],
  ['태블릿',        'SM-X936N',       '갤럭시 탭 S11 울트라'],
  ['워치',          'SM-L715N',       '갤럭시 워치 울트라2'],
  ['버즈',          'SM-R640N',       '갤럭시 버즈4 프로'],
  ['노트북',        'NT960UJH-XC94Y', '갤럭시 북6 울트라'],
  ['모니터',        'LS55CG970NKXKR', '오디세이 Ark 2세대 G9'],
  ['인덕션',        'CC99H84JAD',     'Infinite Line 후드일체형'],
  ['오븐',          'NV75T9879CD',    'Infinite Line 빌트인 75L'],
  ['전자레인지',    'MG23T5018CC',    'Bespoke 23L 그릴 프라이'],
]

/* ── 사양표에서 A4 에 실을 것만 고른다 ────────────────────────────
 * 원본은 한 제품에 30~66행이라 그대로 넣으면 글자가 6pt 가 되어 매장에서 못 읽는다.
 * **상담에서 실제로 묻는 것**만 남긴다. 순서도 이 목록 순서를 따른다. */
const SPEC_WANT = [
  /크기|치수|가로.*세로|폭.*높이/, /중량|무게/, /전체 용량|총 용량|용량\(/, /냉장실/, /냉동실/,
  /세탁 용량|건조 용량/, /인용/, /화면\s*크기|화면크기|디스플레이 크기|스크린/, /해상도/,
  /주사율|화면 재생|재생률/, /밝기|니트/, /패널|디스플레이 타입/,
  /냉방|난방|적용 면적|청정 면적|사용 면적/, /에너지소비효율|효율등급/, /소비\s*전력|소비전력/,
  /소음/, /흡입력/, /배터리|사용 시간|주행 시간/, /충전/, /컴프레서|모터/,
  /프로세서|AP|칩셋|CPU/, /메모리|RAM/, /저장|스토리지/, /카메라|화소/,
  /채널|출력|앰프|스피커 구성/, /화구|버너/, /정격 전압|전원/,
]

/* 설명글은 **첫 문장 + 조금**까지만. 원문이 6줄짜리인 것이 있어(TV Vision AI) 그대로
   실으면 A4 를 넘긴다 — 실측으로 TV 카드만 12px 넘쳤다. 상담사가 읽어 줄 문장은 굵은
   **헤드라인**이고 설명은 근거 확인용이라 이 길이면 족하다.
   **원본 문서는 손대지 않는다** — 근거는 그대로 두고 카드에 실을 때만 줄인다. */
const DESC_MAX = 150
function clipDesc(d) {
  const t = String(d || '').trim()
  if (t.length <= DESC_MAX) return t
  /* 문장 끝에서 자른다 — 낱말 가운데서 끊기면 읽다 걸린다 */
  const cut = t.slice(0, DESC_MAX)
  const dot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('다 '), cut.lastIndexOf('요 '))
  return (dot > 60 ? cut.slice(0, dot + 1) : cut).trim() + '…'
}

/* ── 이 저장소가 이미 아는 함정 ────────────────────────────────
 * USP 헤드라인에 **같은 말이 두 번 반복되는 것**이 있다:
 *   `평소엔 효율적으로… 하이브리드 쿨링 평소엔 효율적으로… 하이브리드 쿨링`
 * 삼성닷컴 지면이 제목을 두 벌(pc-ver/mo-ver) 담는 데서 온 찌꺼기다. 원본 문서는
 * 근거라 손대지 않고 **카드에 실을 때만** 접는다. */
function dedupeHead(h) {
  const t = h.trim()
  if (t.length < 8) return t
  const half = Math.floor(t.length / 2)
  for (let n = half; n >= 6; n--) {
    const a = t.slice(0, n).trim(), b = t.slice(t.length - n).trim()
    if (a === b && t.slice(n).trim().startsWith(a.slice(0, 4))) return a
  }
  /* 정확히 절반으로 갈라 같으면 반만 쓴다 */
  if (t.length % 2 === 0 && t.slice(0, half).trim() === t.slice(half).trim()) return t.slice(0, half).trim()
  return t
}

/* ── 원본 파싱 ──────────────────────────────────────────────────
 * **문서마다 구조가 다르다**(에이전트 6명이 각자 썼다). `##`/`###` 를 둘 다 절로 보되
 * **같거나 상위 수준에서만 끊는다** — 아무 헤딩에서나 끊으면 `## 제품` 절이 바로 아래
 * `### 핵심 USP` 에서 끝나 본문이 통째로 빈다(실제로 5개 문서가 그렇게 0 이 나왔다). */
function parseDoc(file) {
  const lines = fs.readFileSync(path.join(SRC, file), 'utf8').split('\n')
  const heads = []
  /* **`#` 1수준까지 받는다** — 에어컨 문서는 갈래를 `# 2. 에어컨 — 벽걸이` 로 적는다.
     `##` 부터만 보다가 벽걸이·공기청정기·청소기 4장이 통째로 비었다(빌드가 「얇다」로
     잡아 줘서 알았다 — 그 표시가 없었으면 빈 A4 4장이 그대로 인쇄됐다). */
  lines.forEach((L, i) => { const m = L.match(/^(#{1,4}) +(.+)$/); if (m) heads.push({ i, lv: m[1].length, t: m[2].trim() }) })
  const out = []
  for (let h = 0; h < heads.length; h++) {
    let end = lines.length
    for (let n = h + 1; n < heads.length; n++) if (heads[n].lv <= heads[h].lv) { end = heads[n].i; break }
    const txt = lines.slice(heads[h].i + 1, end).join('\n')
    const mm = txt.match(/^\*\*대표\s*모델[^*]*\*\*:\s*`?([A-Za-z0-9\-\/]{5,})`?\s*[—–-]?\s*(.*)$/m)
    if (!mm) continue

    const official = (() => {
      const b = txt.match(/uspDescList[^\n]*\n((?:- .+\n?)+)/)
      return b ? b[1].trim().split('\n').map(s => s.replace(/^-\s*/, '').trim()) : []
    })()

    /* **USP 가 두 곳에 나뉘어 있는 문서가 있다**(2026-08-31 사장님 지적으로 발견).
       모바일·노트북 문서는 `### 핵심 USP` 에 3개(삼성 공식 요약)만 두고 나머지를
       `**PDP 가 함께 내세우는 것**` 불릿으로 따로 적었다. 앞엣것만 보다가 그 두 문서의
       카드가 3줄뿐이었다 — **원본에는 있는데 카드가 못 담고 있었다.** 둘 다 본다. */
    const usps = []
    const uspLines = (txt.split(/^#{1,4} +핵심 USP/m)[1] || '').split('\n')
    for (let n = 0; n < uspLines.length; n++) {
      const L = uspLines[n]
      if (/^#{1,4} /.test(L)) break
      const m = L.match(/^\d+\.\s*\*\*(.+?)\*\*/)
      if (m) usps.push(dedupeHead(m[1]))
    }
    /* `**PDP 가 함께 내세우는 것**` 같은 덧붙임 블록의 불릿 — 굵게 표시된 앞머리가 키워드다 */
    for (const blk of txt.split(/\*\*(?:PDP 가 함께 내세우는 것|그 밖에 내세우는 것|추가 셀링포인트)\*\*/).slice(1)) {
      for (const L of blk.split('\n')) {
        if (/^#{1,4} /.test(L)) break
        const m = L.match(/^\s*[-*]\s*\*\*(.+?)\*\*/) || L.match(/^\s*[-*]\s+(.{4,60}?)(?:\s*[—–]|\.\s|$)/)
        if (m) usps.push(dedupeHead(m[1].replace(/\*\*/g, '').trim()))
      }
    }

    const specs = []
    for (const L of (txt.split(/^#{1,4} +뒷받침 사양/m)[1] || '').split('\n')) {
      if (/^#{1,4} /.test(L)) break
      const c = L.split('|').map(s => s.trim()).filter((s, i, a) => i > 0 && i < a.length - 1)
      if (c.length < 2 || /^-+$/.test(c[0]) || /^(묶음|항목|구분)$/.test(c[0])) continue
      const row = c.length >= 3 ? { k: c[1], v: c[2] } : { k: c[0], v: c[1] }
      if (row.k && row.v && row.v !== '-') specs.push(row)
    }

    const warns = (txt.split(/^#{1,4} +(?:확인 못 한 것|읽을 때 주의|주의|검증 필요)/m)[1] || '')
      .split('\n').filter(L => /^[-*] /.test(L)).map(L => L.replace(/^[-*]\s*/, '').replace(/\*\*/g, '').trim())

    out.push({
      file, title: heads[h].t, model: mm[1], name: mm[2].replace(/\*\*/g, '').replace(/`/g, '').trim(),
      src: (txt.match(/^\*\*출처\*\*:\s*(\S+)/m) || [])[1] || '',
      official, usps, specs, warns,
    })
  }
  return out
}

const ALL = []
for (const f of fs.readdirSync(SRC).filter(x => x.endsWith('.md'))) ALL.push(...parseDoc(f))

/* 주의사항이 아래를 얼마나 먹는지에 따라 USP 자리가 정해진다(실측). */
const warnBudget = (n) => (n >= 3 ? 20 : n >= 1 ? 24 : 28)

/* ── 카드 하나로 줄이기 ────────────────────────────────────────── */
function toCard([cat, model, sub]) {
  /* 같은 모델이 두 절에 나오면(TV 문서는 `## 갈래` 와 `### 모델` 이 겹친다)
     **내용이 많은 쪽**을 쓴다 */
  const cands = ALL.filter(s => s.model === model)
  if (!cands.length) throw new Error(`카드 원본을 못 찾았다: ${cat} / ${model}`)
  const s = cands.sort((a, b) => (b.usps.length + b.specs.length) - (a.usps.length + a.specs.length))[0]

  /* USP — **설명은 빼고 키워드(헤드라인)만 많이 담는다**(2026-08-31 사장님 지시:
     *"USP 내용이 더 많이 들어가야 합니다. USP 설명은 빠져도 됩니다"*).
     설명을 빼면 한 줄이 되므로 2단으로 세 배 넘게 들어간다.

     **삼성 공식 요약(uspDescList)을 앞에 둔다** — 삼성이 제품마다 스스로 뽑은 3줄이라
     상담사가 그대로 읽어도 되는 문장이고, 카드에서 배지로 구분한다. */
  const seen = new Set()
  const usp = []
  const key = (t) => t.replace(/\s+/g, '').slice(0, 12)
  const add = (t, official) => {
    const h = dedupeHead(String(t || '').trim()).replace(/[.,·]\s*$/, '')
    if (h.length < 4 || h.length > 46) return          /* 너무 짧으면 뜻이 없고, 너무 길면 문장이다 */
    if (seen.has(key(h))) return
    seen.add(key(h)); usp.push({ h, official })
  }
  for (const o of s.official) add(o, true)
  for (const u of s.usps) add(u, false)

  /* 사양 — 상담에서 묻는 것만, 목록 순서대로. 같은 항목이 두 번 오면 첫 번째만. */
  const spec = [], used = new Set()
  for (const re of SPEC_WANT) {
    for (const r of s.specs) {
      if (used.has(r.k) || !re.test(r.k)) continue
      used.add(r.k); spec.push(r); break
    }
  }
  /* 12행이 안 차면 남은 것으로 채운다 — 빈 자리를 두는 것보다 낫다 */
  for (const r of s.specs) { if (spec.length >= 12) break; if (!used.has(r.k)) { used.add(r.k); spec.push(r) } }

  return {
    cat, sub, model: s.model, name: s.name, src: s.src,
    /* **USP 상한은 아래 칸이 얼마나 먹느냐에 달렸다** — 28 로 고정했더니 주의 3줄이
       붙은 스마트폰만 63px 넘쳤다(인덕션은 USP 28·주의 0 이라 딱 맞았다).
       **주의사항을 줄이는 선택지는 없다** — 현장에서 반박당하는 것이라 이 카드에서
       가장 값어치 있는 부분이다. USP 쪽이 양보한다.
       실측 기준: 주의 없으면 28 · 1~2줄이면 24 · 3줄이면 20. */
    usp: usp.slice(0, warnBudget(s.warns.length)), spec: spec.slice(0, 12), warns: s.warns.slice(0, 3),
  }
}

const CARDS = PICKS.map(toCard)

/* ── HTML ──────────────────────────────────────────────────────
 * **A4 한 장에 한 제품.** `@page` 여백만 믿으면 인쇄창에서 여백을 "없음"으로 고르는
 * 순간 무시돼 잘리므로, 카드 자신이 `padding` 으로 여백을 만든다(시험지 출력기와 같다).
 * 이모지를 쓰지 않는다 — OS 마다 모양이 다르다. 색은 삼성 블루 한 색.
 */
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const cardHtml = (c, i) => `
<section class="page" data-cat="${esc(c.cat)}">
  <div class="sheet">
    <header class="hd">
      <div class="cat">${esc(c.cat)}</div>
      <h1>${esc(c.name)}</h1>
      <div class="sub">${esc(c.sub)}</div>
      <div class="code">${esc(c.model)}</div>
    </header>

    <h2>핵심 USP <span class="cnt">${c.usp.length}</span></h2>
    <ol class="usp">
      ${c.usp.map((u) => `<li${u.official ? ' class="off"' : ''}>${esc(u.h)}</li>`).join('')}
    </ol>

    <h2>핵심 사양</h2>
    <table class="spec">
      ${c.spec.map((r) => `<tr><th>${esc(r.k)}</th><td>${esc(r.v)}</td></tr>`).join('')}
    </table>

    ${c.warns.length ? `<h2 class="w">상담 전 확인</h2>
    <ul class="warn">${c.warns.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}

    <footer class="ft">
      <span>삼성닷컴 원문 · 2026-08-31 조사</span>
      <span class="no">${i + 1} / ${CARDS.length}</span>
    </footer>
  </div>
</section>`

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>제품 USP 카드 — 경원영업팀</title>
<style>
  /* 폰트를 바깥에서 받지 않는다 — 메일로 받은 PC 가 인터넷이 느리면 그동안 화면이 빈다.
     OS 기본 한글 글꼴이면 인쇄 품질에 충분하다. */
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root { --blue: #1428A0; --ink: #15181E; --mute: #5A6270; --line: #D8DDE5; }
  body {
    font-family: "Malgun Gothic", "맑은 고딕", -apple-system, "Apple SD Gothic Neo", sans-serif;
    color: var(--ink); background: #E9ECF1; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  /* 화면에서 고르는 막대 — 인쇄에는 안 나온다 */
  .bar { position: sticky; top: 0; z-index: 9; background: var(--blue); color: #fff; padding: 10px 14px; }
  .bar h1 { font-size: 14px; font-weight: 800; }
  .bar p { font-size: 11px; color: rgba(255,255,255,.72); margin-top: 2px; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
  .chip { border: 0; border-radius: 999px; padding: 3px 9px; font-size: 11px; cursor: pointer;
          font-family: inherit; background: rgba(255,255,255,.18); color: #fff; }
  .chip.on { background: #fff; color: var(--blue); font-weight: 700; }
  .acts { display: flex; gap: 6px; margin-top: 8px; }
  .btn { border: 0; border-radius: 7px; padding: 5px 11px; font-size: 11.5px; font-weight: 700;
         cursor: pointer; font-family: inherit; background: #fff; color: var(--blue); }

  /* A4 — 210 × 297mm. 여백은 시트가 만든다(인쇄창 여백 설정에 안 흔들린다) */
  .page { display: flex; justify-content: center; padding: 14px 0; }
  .sheet {
    width: 210mm; min-height: 297mm; background: #fff; padding: 18mm 16mm 14mm;
    box-shadow: 0 1px 6px rgba(0,0,0,.14); display: flex; flex-direction: column;
  }

  .hd { border-bottom: 2.5px solid var(--blue); padding-bottom: 9px; margin-bottom: 13px; }
  .cat { color: var(--blue); font-size: 12px; font-weight: 800; letter-spacing: .4px; }
  .hd h1 { font-size: 21px; font-weight: 800; letter-spacing: -.5px; margin-top: 2px; line-height: 1.3; }
  .hd .sub { font-size: 12.5px; color: var(--mute); margin-top: 3px; }
  .hd .code { font-size: 11.5px; color: var(--blue); font-weight: 700; margin-top: 5px;
              font-family: Consolas, "D2Coding", monospace; }

  h2 { font-size: 12.5px; font-weight: 800; color: var(--blue); margin: 13px 0 7px;
       padding-bottom: 3px; border-bottom: 1px solid var(--line); }
  h2.w { color: #B45309; border-color: #FDE68A; }

  /* **설명을 빼고 키워드만 2단으로** — 설명이 있던 때는 5개가 한계였는데 28개가 들어간다
     (2026-08-31 사장님 지시). 단 사이 경계선을 두어 어느 단을 읽는지 눈이 안 헤맨다. */
  .usp {
    list-style: none; counter-reset: n;
    column-count: 2; column-gap: 14px; column-rule: 1px solid #EEF0F4;
  }
  .usp li {
    padding: 3.2px 0 3.2px 19px; position: relative; font-size: 11.5px; font-weight: 600;
    line-height: 1.4; break-inside: avoid;
  }
  .usp li::before {
    content: counter(n); counter-increment: n; position: absolute; left: 0; top: 4px;
    width: 14px; height: 14px; border-radius: 50%; background: #E8ECF7; color: var(--blue);
    font-size: 8.5px; font-weight: 700; text-align: center; line-height: 14px;
  }
  /* 삼성 공식 요약(uspDescList)은 표시를 달리한다 — 상담사가 그대로 읽어도 되는 문장이다 */
  .usp li.off { color: var(--blue); font-weight: 700; }
  .usp li.off::before { background: var(--blue); color: #fff; }
  .cnt {
    font-size: 9.5px; font-weight: 700; color: var(--blue); background: #EEF2FF;
    border-radius: 999px; padding: 1px 6px; margin-left: 5px; vertical-align: 1px;
  }

  .spec { width: 100%; border-collapse: collapse; }
  .spec tr { border-bottom: 1px solid #F0F2F5; }
  .spec th { text-align: left; font-size: 11px; color: var(--mute); font-weight: 600;
             padding: 4px 8px 4px 0; width: 34%; vertical-align: top; }
  .spec td { font-size: 11.5px; padding: 4px 0; font-weight: 600; }

  .warn { list-style: none; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 7px; padding: 8px 11px; }
  .warn li { font-size: 10.5px; color: #92400E; padding-left: 11px; position: relative; line-height: 1.55; }
  .warn li + li { margin-top: 4px; }
  .warn li::before { content: "·"; position: absolute; left: 2px; font-weight: 700; }

  .ft { margin-top: auto; padding-top: 9px; border-top: 1px solid var(--line);
        display: flex; justify-content: space-between; font-size: 10px; color: #9AA1AC; }

  @page { size: A4; margin: 0; }
  @media print {
    body { background: #fff; }
    .bar { display: none; }
    .page { padding: 0; page-break-after: always; break-after: page; }
    .page:last-of-type { page-break-after: auto; break-after: auto; }
    .sheet { box-shadow: none; width: 210mm; min-height: 297mm; }
    .page[hidden] { display: none; }
  }
</style>
</head>
<body>

<div class="bar">
  <h1>제품 USP 카드 — 경원영업팀</h1>
  <p>품목별 하이엔드 ${CARDS.length}장 · 삼성닷컴 원문 기준 · A4 한 장에 한 제품</p>
  <div class="chips" id="chips"></div>
  <div class="acts">
    <button class="btn" onclick="window.print()">인쇄 / PDF 저장</button>
    <button class="btn" id="all">전체 선택</button>
  </div>
</div>

${CARDS.map(cardHtml).join('\n')}

<script>
  /* 품목을 골라 그것만 인쇄한다 — 24장을 늘 다 뽑을 일은 없다.
     hidden 속성으로 감추면 인쇄에서도 빠진다(위 @media print 규칙). */
  var CATS = ${JSON.stringify(CARDS.map(c => c.cat))};
  var on = {};
  CATS.forEach(function (c) { on[c] = true; });

  function draw() {
    document.getElementById('chips').innerHTML = CATS.map(function (c) {
      return '<button class="chip' + (on[c] ? ' on' : '') + '" data-c="' + c + '">' + c + '</button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (b) {
      b.onclick = function () { on[b.dataset.c] = !on[b.dataset.c]; draw(); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('.page'), function (p) {
      p.hidden = !on[p.dataset.cat];
    });
  }
  document.getElementById('all').onclick = function () {
    var every = CATS.every(function (c) { return on[c]; });
    CATS.forEach(function (c) { on[c] = !every; });
    draw();
  };
  draw();
</script>
</body>
</html>
`

/* ── 자립성 검사 — 시험지 출력기와 같은 규칙 ────────────────────
 * 바깥 것을 하나라도 부르면 **메일로 받은 PC 에서만 조용히 반쪽이 된다.**
 * 나중에 누가 CDN 폰트를 틀에 넣어도 여기서 막힌다. */
function assertSelfContained(h) {
  const bad = [
    [/https?:\/\/(?!www\.samsung\.com)/g, '외부 주소'],
    [/<link[^>]+href=/gi, '외부 스타일시트'],
    [/<script[^>]+src=/gi, '외부 스크립트'],
    [/@import/g, 'CSS @import'],
    [/\bfetch\s*\(/g, 'fetch'],
    [/XMLHttpRequest/g, 'XHR'],
  ]
  for (const [re, what] of bad) {
    const m = h.match(re)
    if (m) throw new Error(`자립성 위반 — ${what} ${m.length}건: ${m.slice(0, 3).join(' , ')}`)
  }
}
assertSelfContained(html)

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, html)

const kb = (fs.statSync(OUT).size / 1024).toFixed(0)
console.log(`제품 USP 카드 — ${CARDS.length}장 · ${kb}KB`)
console.log(`  ${path.relative(ROOT, OUT)}`)
let thin = 0
for (const c of CARDS) {
  const flag = c.usp.length < 3 || c.spec.length < 5 ? '  ← 얇다' : ''
  if (flag) thin++
  console.log(`  ${c.cat.padEnd(14)} USP ${c.usp.length} · 사양 ${String(c.spec.length).padStart(2)} · 주의 ${c.warns.length}${flag}`)
}
if (thin) console.log(`\n※ 내용이 얇은 카드 ${thin}장 — 원문에 그만큼밖에 없다(지어내지 않는다)`)
