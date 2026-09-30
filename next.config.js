/** @type {import('next').NextConfig} */

/**
 * 통신향 상담기는 **폐기했다**(2026-09-16 사장님 지시 — 통신향 · 자급제 비교계산기로 대체).
 * 예전에는 별도 배포(telecom-plan-app)로 요청을 넘기는 rewrite 가 여기 있었고, 2026-09-14 에
 * 닫으며 껐다가 이번에 상수·주석까지 걷어냈다. 되살리지 말 것 — 대체 도구는
 * `app/mobile-calc/page.tsx` 가 Apps Script 웹앱을 iframe 으로 안는다(rewrite 가 필요 없다).
 *
 * 옛 주소 `/dev/telecom` 은 남아 있을 수 있다(상담사 즐겨찾기 · 공유된 링크) — 404 대신
 * 대체 도구로 넘긴다. 영구(308) 로 두지 않는 이유는 브라우저가 그 답을 캐시해 나중에
 * 그 주소를 다른 용도로 쓰지 못하게 되기 때문이다.
 */
const nextConfig = {
  /*
   * **배포 빌드가 떼어낸 미니앱 자료(/_split/*)는 영원히 캐시한다**(2026-09-26).
   * 파일 이름에 내용 해시가 들어 있어 내용이 바뀌면 이름이 바뀐다 — 굳을 걱정이 없다
   * (scripts/minify-inline.mjs 의 splitBlocks). 이 헤더가 없으면 Vercel 기본값
   * (max-age=0, must-revalidate)이라 재방문마다 304 확인 왕복이 붙어 **분리하기 전보다
   * 17% 느려졌다**(실측). 해시 파일명 · 이 헤더 · 서비스워커 규칙은 셋이 함께여야 한다.
   */
  async headers() {
    return [
      { source: '/_split/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ]
  },
  async redirects() {
    return [
      { source: '/dev/telecom', destination: '/mobile-calc', permanent: false },
      { source: '/dev/telecom/:path*', destination: '/mobile-calc', permanent: false },
    ]
  },
}

module.exports = nextConfig
