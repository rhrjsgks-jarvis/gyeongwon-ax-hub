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
  async redirects() {
    return [
      { source: '/dev/telecom', destination: '/mobile-calc', permanent: false },
      { source: '/dev/telecom/:path*', destination: '/mobile-calc', permanent: false },
    ]
  },
}

module.exports = nextConfig
