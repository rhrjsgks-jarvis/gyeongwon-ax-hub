'use client'

import { useEffect, useRef, useState } from 'react'
import { logEvent, logOnce, LogModule, LogAction } from '@/lib/logEvent'

/* 미니앱이 보내오는 값은 바깥에서 들어오는 값이다 — 아는 이름만 받는다 */
const ALLOWED_MODULE = new Set<string>([
  'finder', 'as', 'care', 'test', 'compare', 'quiz', 'hub',
  'install', 'installcost', 'place', 'poster', 'ownCompare',
])
const ALLOWED_ACTION = new Set<string>([
  'page_view', 'search', 'result_open', 'generate', 'tab_switch',
  /* 단계 — 상담이 어디까지 갔는지(도면·축척·배치·3D·저장). 세션당 한 번씩만 쌓인다 */
  'step',
])

/*
 * **미니앱이 보내는 사용 로그를 대신 기록한다**(2026-08-20 사장님 요청 — 점별 로그).
 *
 * 미니앱은 iframe 안이라 `logEvent` 를 직접 못 부른다. `share-kit.js` 의 `AX_LOG` 가
 * `postMessage` 로 알리고 여기서 받아 적는다.
 *
 * **모듈 이름은 미니앱이 말하는 대로 믿지 않는다** — 오타나 옛 이름이 오면 집계에
 * 없는 항목이 생겨 "안 쓰는 모듈"처럼 보인다. 아는 이름만 받는다.
 */
function useMiniAppLogs() {
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      /* **우리 출처만 받는다.** 미니앱은 같은 도메인 iframe 이라 origin 이 우리 것이다 —
         다른 창이 postMessage 로 로그를 밀어 넣는 길을 잠근다. 화이트리스트가 피해를
         로그 오염으로 한정하고 있었지만, 문 자체를 잠그는 편이 맞다(2026-08-30). */
      if (e.origin !== window.location.origin) return
      const d = e.data as { sk?: string; module?: string; action?: string; extra?: string; once?: boolean }
      if (!d || d.sk !== 'log') return
      if (!d.module || !d.action) return
      if (!ALLOWED_MODULE.has(d.module) || !ALLOWED_ACTION.has(d.action)) return
      const extra = typeof d.extra === 'string' && d.extra ? d.extra.slice(0, 120) : undefined
      if (d.once) logOnce(d.module as LogModule, d.action as LogAction, extra)
      else logEvent(d.module as LogModule, d.action as LogAction, extra)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])
}

export default function IframeModule({
  src, title, className, style,
}: {
  src: string
  title: string
  className?: string
  style?: React.CSSProperties
}) {
  useMiniAppLogs()
  const [loaded, setLoaded] = useState(false)
  const ref = useRef<HTMLIFrameElement>(null)

  // 허브 통합검색의 딥링크(/finder?q=..., /install?cat=...)는 Next 라우트에 붙는 쿼리라
  // 그대로 두면 iframe 안의 정적 앱까지 전달되지 않는다. 최초 렌더 시 현재 쿼리스트링을
  // iframe src에 합쳐 넘겨, 모듈이 자기 파라미터를 읽고 해당 화면을 바로 열 수 있게 한다.
  // 서버 렌더 HTML에는 쿼리가 없고, hydration은 속성 불일치를 DOM에 반영하지 않으므로
  // 마운트 후 ref로 직접 src를 교체한다(딥링크로 들어온 경우에만 한 번 더 로드됨).
  useEffect(() => {
    const qs = typeof window === 'undefined' ? '' : window.location.search.slice(1)
    if (!qs || !ref.current) return
    const next = src + (src.includes('?') ? '&' : '?') + qs
    if (!ref.current.src.endsWith(next)) {
      setLoaded(false)
      ref.current.src = next
    }
  }, [src])

  useEffect(() => {
    // 로컬 정적 파일은 로딩이 아주 빨라, React가 onLoad 리스너를 붙이기 전에 브라우저의
    // load 이벤트가 이미 끝나버리는 경우가 실제로 발생한다(그 경우 onLoad는 영원히 호출되지
    // 않아 스피너가 멈추지 않는다). 이벤트에만 의존하지 않고 같은 출처인 contentDocument의
    // readyState를 직접 짧은 간격으로 확인해 놓치지 않도록 한다.
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = () => {
      if (ref.current?.contentDocument?.readyState === 'complete') {
        setLoaded(true)
      } else {
        timer = setTimeout(check, 100)
      }
    }
    check()
    return () => clearTimeout(timer)
  }, [])

  /*
   * **하단 탭바 높이를 미니앱에 알려 준다** (2026-08-30 전수조사).
   *
   * 미니앱 iframe 은 탭바 아래까지 차는데(`-6rem` 마진), 그 안의 `position:fixed;bottom:0`
   * 요소 — 케어의 정보바(`.btm`, AS 번호가 적혀 있다) · 레벨업의 **제출 버튼**(`#submitWrap`)
   * — 이 폰에서 탭바에 덮였다. iframe 안에서는 탭바 높이를 알 수 없고 앱마다 다르며
   * PC 에는 없다(share-kit 이 전화 팝업을 가운데로 옮기며 적어 둔 그 제약).
   * 그래서 **아는 쪽(부모)이 재서 알려 준다** — back-kit 이 받아 `--ax-tabbar` 변수로 깔고,
   * 미니앱 CSS 가 `bottom: var(--ax-tabbar, 0px)` 로 쓴다.
   *
   * display:none 인 요소는 ResizeObserver 관찰에서 빠지므로 resize 도 같이 듣는다
   * (telecom 래퍼가 실측으로 확인한 함정 — 초기 호출조차 0회였다).
   */
  useEffect(() => {
    const send = () => {
      const nav = document.querySelector<HTMLElement>('nav[data-tabbar]')
      const h = nav && getComputedStyle(nav).display !== 'none' ? nav.offsetHeight : 0
      try { ref.current?.contentWindow?.postMessage({ sk: 'tabbar', h }, window.location.origin) } catch { /* 아직 못 받는 상태면 다음 기회에 */ }
    }
    send()
    const t = setInterval(send, 1000)          // 미니앱이 늦게 뜨는 경우 — 받는 쪽은 멱등이다
    window.addEventListener('resize', send)
    return () => { clearInterval(t); window.removeEventListener('resize', send) }
  }, [])

  return (
    <div className={`relative ${className || ''}`} style={style}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
          <div
            className="w-8 h-8 rounded-full animate-spin"
            style={{ border: '3px solid #E5E7EB', borderTopColor: 'var(--color-primary)' }}
          />
        </div>
      )}
      <iframe
        ref={ref}
        src={src}
        title={title}
        onLoad={() => setLoaded(true)}
        className="w-full h-full border-0"
        suppressHydrationWarning
      />
    </div>
  )
}
