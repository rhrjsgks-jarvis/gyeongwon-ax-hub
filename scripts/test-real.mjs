/*
 * 실제 분양 도면 회귀 검사 — `npm run test:real`
 *
 * 합성 코퍼스(`test-plans.mjs`)는 "이런 표기 유형에서 안 깨진다"까지만 보증한다.
 * 실제로 상담에서 터진 문제는 전부 진짜 도면에서 나왔다:
 *   · 축척 기준으로 창틀 조각(32×21px)이 뽑힘
 *   · 기준 벽이 벽면이 아니라 창 구간만 잡힘
 *   · 세대 전체가 방 하나로 잡혀 "거실 51.9㎡"
 * 전부 사용자가 매장에서 손으로 찾아 준 것들이라, 그 확인을 여기가 대신한다.
 *
 * **한 장 한 장의 정답을 적지 않는다.** 도면에 치수가 인쇄된 것이 8%뿐이라 손으로 잰
 * 기대값을 채울 수 없고, 앱이 내놓은 값을 적으면 검사가 아무것도 지키지 못한다.
 * 대신 **여러 장을 훑어 품질 지표가 나빠지지 않았는지**를 본다. 지표와 기준선은
 * 2026-08-09 실측값이며, 고칠 때마다 이 숫자가 좋아지는지로 확인하면 된다.
 *
 * 도면 이미지는 `public/plans/` 에 이미 있다(색인과 함께 배포되는 것들).
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'public');

let ok = true;
const fail = (m) => { console.log('ERROR:', m); ok = false; };
const pass = (m) => console.log('OK:', m);

const idxPath = path.join(root, 'plan-index.json');
if (!fs.existsSync(idxPath)) {
  console.log('SKIP: plan-index.json 이 없습니다 — npm run build:plans 로 만듭니다');
  process.exit(0);
}
const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
const all = (idx.complexes || []).flatMap((c) => c.plans.map((p) => ({ ...p, c: c.complex })));
const have = all.filter((p) => fs.existsSync(path.join(root, p.file)));
if (have.length < 10) {
  console.log(`SKIP: 도면 이미지가 ${have.length}장뿐입니다 — 이 검사는 이미지를 가진 로컬에서만 돕니다`);
  process.exit(0);
}

let browser;
try {
  ({ chromium });
  browser = await chromium.launch();
} catch (e) {
  console.log('SKIP: playwright 를 쓸 수 없습니다 —', String(e).slice(0, 80));
  process.exit(0);
}

const srv = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(f).toLowerCase();
    res.writeHead(200, { 'Content-Type': ext === '.html' ? 'text/html' : ext === '.json' ? 'application/json' : 'image/jpeg' });
    res.end(d);
  });
});
await new Promise((r) => srv.listen(4630, r));

/*
 * 표본은 **파일 이름의 해시 순**으로 뽑는다.
 *
 * 예전에는 목록을 일정 간격으로 훑었는데(`i += step`), 그러면 **도면을 한 장 추가할 때마다
 * 표본 30장이 통째로 밀린다.** 실제로 홍천 2장을 넣었더니 개구부 비율 중앙값이
 * 20.1% → 23.0% 로 뛰었다 — 인식이 나빠진 것이 아니라 다른 30장을 본 것이다.
 * 기준선이 표본에 묶여 있으면 이 검사는 코퍼스가 자랄 때마다 거짓으로 깨진다.
 *
 * 해시 순은 단지가 골고루 섞이면서(무작위처럼 흩어진다) **결정적**이고, 코퍼스가 자라도
 * 기존 표본이 거의 그대로 남는다. 무작위(Math.random)와 달리 실행할 때마다 같다.
 */
const N = +process.env.REAL_N || 30;
const hash = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++){ x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
const sample = have.slice().sort((a, b) => hash(a.file) - hash(b.file)).slice(0, N);

const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto('http://localhost:4630/place-app.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

const rows = [];
for (const s of sample) {
  const r = await page.evaluate(async (p0) => {
    const P = window.__place;
    const area = (poly) => { let a = 0; for (let i = 0; i < poly.length; i++){ const [x1,y1]=poly[i],[x2,y2]=poly[(i+1)%poly.length]; a += x1*y2-x2*y1; } return Math.abs(a)/2; };
    try {
      await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('load')), 9000);
        P.useImage('/' + p0.file, () => { clearTimeout(t); res(); }); });
      await new Promise((res) => setTimeout(res, 1800));
    } catch { return { err: 'load' }; }
    const d = P.state.draft;
    const cands = P.state.roomCands || [];
    const planA = P.state.imgW * P.state.imgH;
    if (!d) return { auto: false, cands: cands.length };
    const xs = d.map((q) => q[0]), ys = d.map((q) => q[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const out = {
      auto: true, cands: cands.length,
      pct: area(d) / planA * 100,
      short: Math.min(w, h) / Math.min(P.state.imgW, P.state.imgH) * 100,
      roomW: w,
    };
    // 개구부가 둘레에서 차지하는 비율 — 벽이 마스크에서 사라지면 닫기가 그 자리를 메우고
    // 그 구간이 개구부로 보고된다. 그래서 이 비율이 곧 "부분 누락" 지표다.
    const E = P.state.draftEdges;
    if (E && E.length) {
      const len = (e) => Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
      const per = E.reduce((a, e) => a + len(e), 0);
      if (per > 0) out.openPct = E.filter((e) => e.open).reduce((a, e) => a + len(e), 0) / per * 100;
    }
    // 기준 벽까지 밀어 본다 — 벽면 전체를 덮는지가 축척 정확도를 좌우한다
    const okBtn = [...document.querySelectorAll('#draftbar button')].find((x) => x.textContent.trim() === '이 공간 확정');
    if (okBtn) {
      okBtn.click();
      await new Promise((res) => setTimeout(res, 350));
      const nb = document.querySelector('#sheet .modal-actions button.primary');
      if (nb) nb.click();
      await new Promise((res) => setTimeout(res, 450));
      const m = P.state.measureSeg;
      if (m) {
        out.segH = Math.abs(m.x2 - m.x1) > Math.abs(m.y2 - m.y1);
        out.cover = Math.abs(m.x2 - m.x1) / Math.max(1, w);
        /*
         * **기준 벽이 건물 폭에서 차지하는 비율.** 화면은 "침실1 가로가 몇 mm 입니까?"
         * 라고 묻는데 부각된 것이 세대 전체 폭이면 사용자가 3,300 을 넣는 순간 축척이
         * 통째로 틀어진다 — 위 `cover`(벽/방 가로)로는 안 잡힌다. 방 자체가 세대 전체면
         * 벽이 그 방을 100% 덮어 완벽해 보이기 때문이다.
         */
        const bx = (P.state.baseInfo || {}).bbox;
        const S = (P.state.baseMask || {}).S || 1;
        const bw = bx ? (bx.x1 - bx.x0) / S : P.state.imgW;
        out.span = Math.abs(m.x2 - m.x1) / Math.max(1, bw);
        /*
         * **세대 폭을 골랐을 때 화면이 그 사실을 말하는가.** 벽을 그렇게 고른 것 자체는
         * 사고가 아니다 — 사용자가 12,000 이라고 답하면 축척은 정확하다. 사고는 그 벽을
         * 두고 "침실1 가로는 보통 3,000~3,600mm" 라고 안내하는 것이다.
         */
        const bar = document.getElementById('draftbar');
        out.barText = (bar.textContent || '').replace(/\s+/g, ' ').trim();
        out.warnsWide = /세대 전체 폭/.test(out.barText);
        out.hintsRoom = /보통 [\d,]+~[\d,]+mm/.test(out.barText);
        out.prefill = +((document.getElementById('wl') || {}).value || 0);
      }
    }
    /*
     * **도면 전체 인식이 건물의 몇 할을 덮는가** (2026-08-13 신설).
     *
     * 공간 '개수'는 품질이 아니다 — 인식이 실패해 근사 사각형이 잘게 잡히면 개수만 늘고
     * 실제로는 나빠진다(디에트르 84 에서 8곳이 잡혔는데 그중 하나가 4.1㎡ 짜리 가짜였다).
     * 그래서 넓이로 잰다. 넓이 비는 축척과 무관하므로 임의의 mm/px 를 넣고 잰다.
     * **마지막에 잰다** — detectAllRooms 가 공간을 등록해 위 지표들을 흔들기 때문이다.
     */
    try {
      P.state.mmPerPx = 10; P.state.scaled = true;
      P.detectAllRooms();
      let sum = 0;
      for (const rm of (P.state.rooms || [])) sum += P.roomArea(rm) / 100;   // mm² → 이미지 px²
      const bx2 = (P.state.baseInfo || {}).bbox, S2 = (P.state.baseMask || {}).S || 1;
      const bA = bx2 ? ((bx2.x1 - bx2.x0) / S2) * ((bx2.y1 - bx2.y0) / S2) : P.state.imgW * P.state.imgH;
      if (bA > 0) { out.cover2 = sum / bA * 100; out.spaces = (P.state.rooms || []).length; }
    } catch (_) {}
    return out;
  }, s);
  rows.push({ ...s, ...r });
}
await browser.close();
srv.close();

const auto = rows.filter((r) => r.auto);
const rate = auto.length / rows.length;
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

console.log(`실제 도면 ${rows.length}장 (보유 ${have.length}장 중 고르게 추출)\n`);

/*
 * 기준선은 2026-08-09 실측값에서 여유를 둔 것이다. 목표가 아니라 **하한**이므로,
 * 인식을 개선하면 여기 숫자를 함께 올려 다시 못 내려가게 할 것.
 */
if (rate < 0.80) fail(`자동 인식 성공률 ${Math.round(rate*100)}% — 실측 기준 90%, 하한 80%`);
else pass(`자동 인식 ${auto.length}/${rows.length}장 (${Math.round(rate*100)}%)`);

// 축척 기준 방이 조각이면 안 된다 — 창틀(32×21px)이 뽑히던 사고
const slivers = auto.filter((r) => r.pct < 3 || r.short < 8);
if (slivers.length) {
  fail(`축척 기준으로 조각을 골랐다 ${slivers.length}장 — ${slivers.slice(0,3).map((r)=>`${r.c} ${r.type}(${r.pct.toFixed(1)}%)`).join(', ')}`);
} else pass(`축척 기준 방이 전부 방다움 (넓이 ${med(auto.map((r)=>r.pct)).toFixed(1)}% · 짧은변 ${med(auto.map((r)=>r.short)).toFixed(1)}%)`);

// 기준 벽은 가로여야 하고, 벽면 전체를 덮어야 한다(창 조각만 잡히던 사고)
const withSeg = auto.filter((r) => r.cover != null);
const vertical = withSeg.filter((r) => !r.segH);
if (vertical.length) fail(`기준 벽이 세로인 도면 ${vertical.length}장 — 가로여야 한다`);
else if (withSeg.length) {
  const mc = med(withSeg.map((r) => r.cover));
  const short = withSeg.filter((r) => r.cover < 0.5);
  if (mc < 0.9) fail(`기준 벽이 방 가로를 덮는 비율 중앙값 ${mc.toFixed(2)} — 실측 1.00, 하한 0.90`);
  else if (short.length > withSeg.length * 0.15) {
    fail(`벽면의 절반도 못 덮는 도면이 ${short.length}/${withSeg.length}장 — 조각만 잡고 있다`);
  } else pass(`기준 벽 전부 가로 · 방 가로를 덮는 비율 중앙값 ${mc.toFixed(2)}`);
}

/*
 * ── 기준 벽이 세대 폭인가 (2026-08-13 신설) ──
 *
 * *"침실1 가로가 몇 mm 입니까?"* 라고 물으면서 세대 전체 폭을 부각하던 문제다. 사용자가
 * 안내대로 3,300 을 넣으면 도면이 두세 배로 줄어 이후 판정이 전부 거짓이 된다
 * (사용자 보고: 원주 푸르지오 85A · 안양자이 50-2). **위 `cover` 로는 안 잡힌다** —
 * 방 자체가 세대 전체면 벽이 그 방을 100% 덮어 지표가 오히려 완벽해 보인다.
 *
 * 실측(`.scratch/scale-truth.mjs`, 54장) — 중앙값 0.36 이 정상이고 0.8 이상이 사고다.
 * 고치기 전 4장(7%) → "침실은 세대 폭을 가로지르지 않는다"를 넣은 뒤 2장(4%).
 *
 * **"한 장도 없어야 한다"는 못 지킨다 — 지켜서도 안 된다.** 30장 표본에서는 0 이었지만
 * 150장으로 넓히니 6장이 나왔다(춘천 레이크시티 144A 등). 그리고 벽을 그렇게 고른 것
 * 자체는 사고가 아니다 — 사용자가 12,000 이라고 답하면 축척은 정확하다.
 *
 * **진짜 사고는 그 벽을 두고 "침실1 가로는 보통 3,000~3,600mm" 라고 안내하는 것이다.**
 * 안내대로 3,300 을 넣으면 축척이 3.6배 틀어지고 이후 판정이 전부 거짓이 된다.
 * 그래서 검사도 "고르지 마라"가 아니라 **"골랐으면 사실대로 말하라"** 로 둔다:
 * 세대 폭이면 방 이름·예시 치수를 빼고, 미리 채워 둔 값도 지운다.
 */
{
  const withSpan = auto.filter((r) => r.span != null);
  if (withSpan.length) {
    const wide = withSpan.filter((r) => r.span >= 0.8);
    const silent = wide.filter((r) => !r.warnsWide);
    const misled = wide.filter((r) => r.hintsRoom || r.prefill > 0);
    if (silent.length) {
      fail(`기준 벽이 세대 폭인데 화면이 말하지 않는다 ${silent.length}장`
        + ` : ${silent.slice(0, 3).map((r) => `${r.c} ${r.type}(${r.span.toFixed(2)})`).join(', ')}`);
    } else if (misled.length) {
      fail(`세대 폭 벽에 방 예시 치수나 미리 채운 값이 남아 있다 ${misled.length}장`
        + ` — 그대로 확정하면 축척이 통째로 틀어진다: ${misled.slice(0, 3).map((r) => `${r.c} ${r.type}`).join(', ')}`);
    } else {
      pass(`기준 벽 — 건물 폭 대비 중앙값 ${med(withSpan.map((r) => r.span)).toFixed(2)}`
        + (wide.length ? ` · 세대 폭 ${wide.length}장은 화면이 그 사실을 밝힌다` : ' · 세대 폭 없음'));
    }
  }
}

/*
 * 개구부가 둘레에서 차지하는 비율 — **부분 누락 지표**다.
 * 벽이 마스크에서 사라지면 닫기가 그 자리를 메우고, 그 구간은 개구부로 보고된다.
 * 그래서 이 비율이 치솟으면 화면에서 "어디는 벽으로 잡고 어디는 안 잡는" 것처럼 보인다
 * (2026-08-10 사용자가 실제로 이 증상을 보고했다).
 *
 * 방 하나에 문 900mm + 창 1,800mm 면 둘레 14m 기준 19% 안팎이 정상이다.
 *
 * **코퍼스 중앙값에 상한을 거는 방식은 버렸다.** 원래 "상한 22%"였는데, 그 22% 는
 * 옛 순차 표본 30장에서 나온 수치였다. 도면 2장을 코퍼스에 넣자 표본이 통째로 밀리며
 * 20.1% → 23.0% 가 됐다 — 인식은 한 줄도 안 바뀌었는데 검사가 깨졌다.
 * 안정 표본으로 다시 재 보니 정상 코드 26.3% · 버그 코드(옛 폴백) 28.2% 로 **1.9pt** 차이라,
 * 애초에 코퍼스 중앙값은 이 버그를 가리기에 너무 무딘 자였다(옛 3.9pt 차이는 표본 운이었다).
 *
 * 지금은 **도면마다 짝지어 비교한다.** 커밋된 기준선(open-ratio.json)에 도면별 값을 두고
 * 도면별 증감의 중앙값을 본다. 모든 도면이 같은 방향으로 2pt 나빠지는 종류의 회귀는
 * 짝비교에서 또렷하게 드러나고, 표본이 바뀌어도 흔들리지 않는다.
 * 기준선을 다시 만들려면 `REAL_BASELINE=write npm run test:real`.
 */
const BASE_FILE = path.join(__dirname, 'fixtures', 'plans-real', 'open-ratio.json');
const withOpen = auto.filter((r) => r.openPct != null);
if (process.env.REAL_BASELINE === 'write') {
  const out = {};
  for (const r of withOpen) out[r.file] = +r.openPct.toFixed(2);
  fs.mkdirSync(path.dirname(BASE_FILE), { recursive: true });
  fs.writeFileSync(BASE_FILE, JSON.stringify(out, null, 1) + '\n');
  console.log(`기준선 ${Object.keys(out).length}장을 새로 썼습니다 → ${path.relative(process.cwd(), BASE_FILE)}`);
} else if (withOpen.length) {
  const mo = med(withOpen.map((r) => r.openPct));
  const base = fs.existsSync(BASE_FILE) ? JSON.parse(fs.readFileSync(BASE_FILE, 'utf8')) : null;
  if (!base) {
    console.log(`NOTE: 개구부 기준선이 없습니다 — REAL_BASELINE=write 로 만드세요 (지금 중앙값 ${mo.toFixed(1)}%)`);
  } else {
    const paired = withOpen.filter((r) => base[r.file] != null);
    const fresh = withOpen.length - paired.length;
    if (!paired.length) {
      console.log(`NOTE: 기준선과 겹치는 도면이 없습니다 (새 도면 ${fresh}장) — REAL_BASELINE=write 로 갱신하세요`);
    } else {
      const d = med(paired.map((r) => r.openPct - base[r.file]));
      const worse = paired.filter((r) => r.openPct - base[r.file] > 5);
      if (d > 1.0)
        fail(`개구부 길이비율이 도면마다 중앙 ${d > 0 ? '+' : ''}${d.toFixed(1)}pt 나빠졌다 (${paired.length}장 짝비교, 허용 +1.0pt) — 벽이 개구부로 새고 있다`);
      else if (worse.length > paired.length * 0.2)
        fail(`5pt 넘게 나빠진 도면이 ${worse.length}/${paired.length}장 — ${worse.slice(0,3).map((r)=>`${r.c} ${r.type}`).join(', ')}`);
      else
        pass(`개구부 길이비율 중앙값 ${mo.toFixed(1)}% · 기준선 대비 ${d > 0 ? '+' : ''}${d.toFixed(1)}pt (${paired.length}장 짝비교${fresh ? ` · 새 도면 ${fresh}장` : ''})`);
    }
  }
}

// 세대 전체가 방 하나로 잡히는 비율 — 지금은 못 고치지만 나빠지는 것은 막는다
const huge = auto.filter((r) => r.pct > 35);
const hr = huge.length / Math.max(1, auto.length);
if (hr > 0.40) fail(`세대 전체가 방 하나로 잡힌 것 ${Math.round(hr*100)}% — 실측 24%, 상한 40%`);
else console.log(`NOTE: 세대 전체로 잡힌 것 ${huge.length}/${auto.length}장 (${Math.round(hr*100)}%) — 알려진 한계, 화면이 경고로 알린다`);

console.log(`NOTE: 후보 방 개수 중앙값 ${med(auto.map((r)=>r.cands))}`);

/*
 * ── 도면 전체 인식이 건물을 얼마나 덮는가 (2026-08-13 신설) ──
 *
 * 3D 와 배치 판정이 이 결과 위에 선다 — 덮지 못한 곳에는 가전을 놓을 수 없다.
 * 개수로는 품질을 못 잰다(가짜 사각형이 개수를 늘린다). 넓이로 잰다.
 *
 * **이건 큰 퇴행을 잡는 넓은 그물이지 특정 고침의 가드가 아니다.** `sheetBoxAt` 이 벽
 * 조각을 도면으로 오인하던 것을 고쳤을 때 이 표본 30장에서는 63.3% → 64.9%(1.6pt)로
 * 조금 움직였고, 다른 표본 24장에서는 63.3% → 67.8%(4.5pt)였다 — 표본에 따라 흔들려
 * 문턱을 그 사이에 두면 거짓으로 깨진다. 그 고침을 지키는 날카로운 가드는 위의
 * '기준 벽이 세대 폭인가' 쪽이다. 여기서는 인식이 통째로 무너지는 것을 본다.
 * 하한 **55%** — 개선하면 함께 올려 다시 못 내려가게 할 것.
 */
{
  const cv = auto.filter((r) => r.cover2 != null).map((r) => r.cover2);
  if (cv.length) {
    const mc2 = med(cv);
    if (mc2 < 55) fail(`도면 전체 인식이 건물의 ${mc2.toFixed(0)}% 만 덮는다 — 하한 55%`);
    else pass(`도면 전체 인식 덮는 비율 중앙값 ${mc2.toFixed(1)}% · 공간 수 중앙값 ${med(auto.filter((r)=>r.spaces!=null).map((r)=>r.spaces))}`);
  }
}
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
