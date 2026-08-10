'use client'

import { useEffect, useState } from 'react'
import { drawQR } from '@/lib/qr'

/**
 * QR 을 브라우저에서 직접 그려 `<img>` 로 내놓는다.
 *
 * **왜 외부 API 를 안 쓰나** — 예전에는 `api.qrserver.com` 에 이미지를 요청했는데,
 * ①그 서버가 죽으면 QR 이 통째로 안 나오고 ②매장 와이파이가 불안하면 빈칸이 되며
 * ③공유하려는 주소가 남의 서버 로그에 남는다. 지금은 `lib/qr.ts` 가 오프라인에서 그린다
 * (서비스워커 캐시로 도는 매장 환경과도 맞는다).
 *
 * **캔버스가 아니라 `<img>` 로 내놓는 이유** — 기존 스타일(`rounded`·`border`)이 그대로 먹고,
 * 휴대폰에서 길게 눌러 저장·공유가 된다. 매장에서 실제로 그렇게 쓴다.
 *
 * 그리기는 `document` 가 필요해 `useEffect` 에서 한다. 그래서 SSR 첫 페인트에는 QR 이 없고,
 * 그 사이에는 **같은 className 의 빈 상자**를 둔다 — 안 그러면 QR 이 뜰 때 옆 글자가 밀린다.
 */
export default function QRCode({
  text,
  className,
  alt = 'QR코드',
  scale = 8,
}: {
  text: string
  className?: string
  alt?: string
  /** 모듈 하나의 픽셀 크기. 화면 표시 크기의 2~3배로 두어야 고해상도 화면에서 또렷하다. */
  scale?: number
}) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    try {
      setSrc(drawQR(text, scale, 4).toDataURL('image/png'))
    } catch (e) {
      // 조용히 삼키지 않는다 — 빈칸이 뜨면 원인을 알 수 있어야 한다.
      // (버전 1~10 범위를 넘는 긴 주소가 들어온 경우가 대부분이다)
      console.error('QR 생성 실패:', text, e)
      setSrc('')
    }
  }, [text, scale])

  return src
    ? <img src={src} alt={alt} className={className} />
    : <div className={className} aria-hidden />
}
