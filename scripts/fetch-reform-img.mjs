/*
 * 인테리어핏 시공 사진을 우리 저장소로 받는다 → `public/reform-img/`
 *
 * **왜 옮기는가** — 설치가이드 규격도를 옮긴 것과 같은 이유다(CLAUDE.md):
 *  ① **공유가 화면을 그대로 찍는데**(html2canvas) 다른 도메인 이미지는 그 서버가 CORS 를
 *     허용해야 캔버스에 들어간다. 안 되면 고객에게 나가는 그림에서 사진 자리가 빈다.
 *  ② **매장 전파가 약해도 열려야 한다** — 서비스워커는 우리 도메인 것만 캐시할 수 있다.
 *  ③ 삼성닷컴이 경로를 바꾸면 사진이 통째로 사라진다.
 *
 * **robots** — `images.samsung.com` 은 허용이다(이 저장소가 `install-img` 로 이미 쓰고 있다).
 *
 * **받지 못한 것은 손대지 않는다** — 실패한 항목은 원본 주소 그대로 두고 보고한다.
 * 없는 파일을 가리키게 만들면 화면에서 사진이 **조용히** 사라진다.
 *
 *   node scripts/fetch-reform-img.mjs
 *
 * **로컬 세션에서 돌릴 것** — 클라우드 세션은 프록시가 images.samsung.com 을 막는다.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'public/reform-img')
const SRC = path.join(ROOT, 'scripts/fixtures/reform-images.json')

if (!fs.existsSync(SRC)) {
  console.error('scripts/fixtures/reform-images.json 이 없다 — 먼저 목록을 만들 것')
  process.exit(1)
}
fs.mkdirSync(OUT, { recursive: true })

const list = JSON.parse(fs.readFileSync(SRC, 'utf8'))
const all = []
for (const g of Object.values(list.groups)) for (const r of g) all.push(r)

let got = 0, skip = 0
const failed = []
for (const it of all) {
  const dest = path.join(OUT, it.file)
  if (fs.existsSync(dest)) { skip++; continue }
  try {
    const r = await fetch(it.url, {
      headers: {
        /* **Referer 를 붙인다** — 이 저장소가 도면 수집에서 배운 것: 핫링크 차단은
           지면 주소를 Referer 로 주면 200 으로 온다. */
        Referer: 'https://www.samsung.com/sec/samsung-care-plus/ce/reform/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    })
    if (!r.ok) { failed.push([it.file, 'HTTP ' + r.status]); continue }
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length < 2000) { failed.push([it.file, '너무 작다 ' + buf.length + 'B']); continue }
    fs.writeFileSync(dest, buf)
    got++
  } catch (e) {
    failed.push([it.file, String(e).slice(0, 50)])
  }
  await new Promise((r) => setTimeout(r, 120))
}

const kb = fs.readdirSync(OUT).reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0) / 1024
console.log(`받음 ${got} · 이미 있던 것 ${skip} · 실패 ${failed.length} · 합계 ${fs.readdirSync(OUT).length}장 ${kb.toFixed(0)}KB`)
if (failed.length) {
  console.log('\n★ 받지 못한 것 — 원본 주소를 그대로 두고 화면에서는 빼야 한다:')
  failed.forEach((f) => console.log('  ' + f[0] + ' — ' + f[1]))
}
