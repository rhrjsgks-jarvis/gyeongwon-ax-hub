'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

/*
 * ── 홈에서 뒤로가기를 누르면 종료할지 묻는다 ─────────────────────────────
 *
 * 2026-08-29 사장님 지시 — *"홈화면에서 뒤로가기버튼을 눌렀을경우 세일즈코파일럿을
 * 종료하시겠습니까? 라는 안내문구가 나오고 예 아니오 선택 할 수 있도록 해주세요.
 * 실수로 뒤로가기를 눌렀을수도있습니다."*
 *
 * **어떻게 가로채는가** — 허브에 서면 히스토리에 표식 칸을 하나 심는다. 뒤로가기는 그
 * 칸부터 소비하므로, 그 칸을 **지나친 순간**이 곧 "앱을 벗어나려는 것"이다.
 * 미니앱의 시트·모달을 가로채는 `back-kit.js` 와 같은 원리다.
 *
 * **"허브로 돌아온 것"과 "앱을 나가려는 것"을 가르는 것이 표식이다.**
 * popstate 만 세면 `/as → 뒤로 → 허브` 에서도 종료 창이 뜬다. 실측으로 확인했다
 * (`.scratch/_guard.mjs`) — Next 는 자기 키를 섞어 넣지만 **우리 `axGuard` 는 그대로
 * 지키고**, 뒤로 돌아와 그 칸에 서면 표식이 살아 있으며, 지나치면 사라진다:
 *
 *   허브 도착   state 없음   → 심는다
 *   표식 심음   axGuard      → 이 칸 위에 있으면 앱 안이다
 *   AS 로 이동  없음(Next)
 *   뒤로 1번    axGuard      → 표식 칸에 섰다. 묻지 않는다
 *   뒤로 2번    없음         → 지나쳤다. **여기서 묻는다**
 *
 * **표식이 있는지 보고 심으므로 칸이 쌓이지 않는다.** 허브를 몇 번 오가도 하나뿐이다.
 *
 * **「예」는 `history.back()` 이다.** 웹은 창을 스스로 닫을 수 없다(`window.close()` 는
 * 스크립트가 연 창에서만 듣는다). 표식을 지나친 시점에는 이미 앱 이전 칸에 서 있으므로,
 * 한 칸 더 물러나면 브라우저는 이전 지면으로, 설치형(standalone)은 OS 가 앱을 닫는다.
 *
 * **바깥을 눌러도 Esc 를 눌러도 「아니오」다** — 실수를 막으려고 만든 창이라 애매한
 * 조작은 안전한 쪽으로 떨어져야 한다.
 */
export default function ExitGuard() {
  const pathname = usePathname()
  const [ask, setAsk] = useState(false)
  const noRef = useRef<HTMLButtonElement>(null)

  /** 표식을 심는다 — 이미 그 칸 위면 아무것도 하지 않는다(쌓이지 않게) */
  const arm = () => {
    try {
      const st = window.history.state
      if (st && st.axGuard) return
      window.history.pushState({ ...(st || {}), axGuard: 1 }, '')
    } catch {
      /* 히스토리를 못 쓰는 환경이면 그냥 예전처럼 동작한다 — 막다가 앱을 망가뜨리지 않는다 */
    }
  }

  useEffect(() => {
    if (pathname !== '/') return
    arm()
  }, [pathname])

  useEffect(() => {
    const onPop = () => {
      if (window.location.pathname !== '/') return
      const st = window.history.state
      if (st && st.axGuard) return // 아직 표식 칸 위다 — 앱 안이다
      setAsk(true)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (!ask) return
    noRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stay() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ask])

  const stay = () => { setAsk(false); arm() }
  const leave = () => { setAsk(false); try { window.history.back() } catch { /* 갈 곳이 없으면 그대로 */ } }

  if (!ask) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ax-exit-t"
      onClick={(e) => { if (e.target === e.currentTarget) stay() }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-5"
      style={{ background: 'rgba(17,24,39,.45)' }}
    >
      <div className="w-full max-w-[320px] rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="ax-exit-t" className="text-[16px] font-bold leading-snug text-gray-900">
          세일즈 코파일럿을 종료하시겠습니까?
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-gray-500">
          실수로 뒤로가기를 누르셨을 수 있습니다.
        </p>
        <div className="mt-4 flex gap-2">
          {/* 안전한 쪽(아니오)이 먼저 손에 닿는 자리에 온다 */}
          <button
            ref={noRef}
            type="button"
            onClick={stay}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-[14px] font-semibold text-gray-700"
          >
            아니오
          </button>
          <button
            type="button"
            onClick={leave}
            className="flex-1 rounded-xl py-2.5 text-[14px] font-semibold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            예, 종료
          </button>
        </div>
      </div>
    </div>
  )
}
