'use client'

import { useEffect, useRef, useState } from 'react'

export default function IframeModule({
  src, title, className, style,
}: {
  src: string
  title: string
  className?: string
  style?: React.CSSProperties
}) {
  const [loaded, setLoaded] = useState(false)
  const ref = useRef<HTMLIFrameElement>(null)

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
      />
    </div>
  )
}
