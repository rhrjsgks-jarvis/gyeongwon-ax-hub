'use client'

import { useEffect, useState } from 'react'

/*
 * 통신향 상담기 — **허브 껍데기 안에서** 연다 (2026-08-30 사장님 지시)
 * ---------------------------------------------------------------------------
 * 사장님 지시: *"요금제 어플 로그인시 세일즈코파일럿 하단 네비게이션이 사라져서
 * 사라지지않게되어야합니다."*
 *
 * 그전에는 `next.config.js` 의 rewrite 가 `/dev/telecom/*` 을 저쪽 배포로 통째로
 * 넘겼다. rewrite 는 **응답을 그대로 흘려보내는 것**이라 이 저장소의 layout 이
 * 아예 그려지지 않는다 — 그래서 도구에 들어가는 순간 하단 탭바가 사라졌다.
 *
 * 옮겨 오지는 않는다. 계산 엔진이 두 벌이 되면 반드시 어긋나고, 어긋난 쪽 숫자가
 * 손님에게 읽힌다(`next.config.js` 머리말 참조). 그래서 **껍데기만 우리 것을 씌운다.**
 *
 * rewrite 와 부딪히지 않는다: `rewrites()` 가 배열이면 Next 는 **파일 라우트를 먼저**
 * 보므로, 정확히 `/dev/telecom` 은 이 페이지가 받고 그 아래 경로는 rewrite 가 받는다.
 *
 * ---------------------------------------------------------------------------
 * 왜 iframe 이 여기서 안전한가
 * ---------------------------------------------------------------------------
 * 주소가 `/dev/telecom/index.html` 이라 **브라우저가 보기에는 우리 도메인**이다
 * (rewrite 가 서버에서 대신 받아 온다). 그래서
 *
 *   · 저쪽 앱의 `X-Frame-Options: SAMEORIGIN` 에 걸리지 않는다
 *   · 로그인 쿠키(`SameSite=Strict`)도 그대로 실린다 — 남의 도메인이 아니다
 *   · 저쪽 화면 안의 링크는 상대경로라 iframe 안에서만 움직인다
 *
 * `sandbox` 는 걸지 않는다. 같은 도메인이라 걸면 저쪽 자기 기능(sessionStorage ·
 * 폼 전송 · 스크립트)이 막힌다. 우리가 만든 앱이지 바깥에서 받아 온 문서가 아니다.
 */

/**
 * 하단 탭바를 **재서** 그만큼만 비운다.
 *
 * 처음에는 다른 화면들처럼 `pb-24`(96px)를 그대로 썼는데, 탭바 실측이 45px 이라
 * **51px 이 영영 빈 채로 남았다.** 보통 화면에서 pb-24 는 «스크롤 끝 여백» 이라
 * 남아도 티가 안 나지만, 이 칸은 뷰포트에 붙어 있어서(fixed) 그 자리가 고정으로
 * 죽는다 — 폰에서 6% 를 버리고, 무엇보다 고장처럼 보인다.
 *
 * 숫자를 여기 다시 적어 두면 탭바가 바뀌는 날 조용히 어긋난다. 그래서 잰다.
 * 탭바는 `lg` 에서 숨으므로 그때는 0 이 되고, 폰에서는 처음부터 보이므로 첫 측정이
 * 곧 맞는 값이다.
 *
 * **ResizeObserver 만으로는 부족하다.** display:none 인 요소는 상자가 없어서 관찰
 * 대상에서 아예 빠지고, 다시 보이게 되어도 콜백이 오지 않았다(실측: 초기 호출조차
 * 0회). 그래서 `resize` 를 같이 듣는다 — 폭이 lg 를 넘나드는 순간이 바로 그것이다.
 * **둘 중 하나를 지우지 말 것.** 관찰자는 탭바 «내용» 이 바뀌는 경우를, resize 는
 * 탭바가 나타나고 사라지는 경우를 맡는다.
 */
function useTabbarHeight() {
  const [h, setH] = useState<number | null>(null) // null = 아직 못 쟀다

  useEffect(() => {
    const el = document.querySelector<HTMLElement>('nav[data-tabbar]')
    if (!el) {
      // 탭바를 못 찾았으면 **비우지 않는다.** 없는 것을 피하느라 화면을 깎는 것보다
      // 낫다 — 정말 없으면 가릴 것도 없다.
      setH(0)
      return
    }
    const read = () => {
      // display:none 이면 rect 가 0 이다. lg 에서 탭바가 숨는 경우가 그것이다.
      setH(el.getBoundingClientRect().height)
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    window.addEventListener('resize', read)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', read)
    }
  }, [])

  return h
}

export default function TelecomToolPage() {
  const tabbar = useTabbarHeight()

  return (
    <div
      className="fixed left-0 right-0 top-[60px] lg:left-56"
      style={{
        // 재기 전에는 다른 화면들과 같은 값(6rem)으로 둔다. 0 으로 두면 첫 그림에서
        // 도구 아래가 탭바에 가렸다가 튀어 오른다.
        bottom: `calc(${tabbar === null ? '6rem' : `${tabbar}px`} + env(safe-area-inset-bottom))`,
      }}
    >
      <iframe
        src="/dev/telecom/index.html"
        title="통신향 상담기"
        className="block w-full h-full border-0"
      />
    </div>
  )
}
