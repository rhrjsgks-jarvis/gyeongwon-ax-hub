/** @type {import('next').NextConfig} */

/**
 * 통신 상담 도구를 /dev/telecom 아래로 이어 붙인다
 * ---------------------------------------------------------------------------
 * 그 앱은 이 저장소가 아니라 별도 저장소·별도 배포다(telecom-plan-app).
 * 여기로 포팅하지 않은 이유는 **계산 엔진이 두 벌이 되기 때문**이다 —
 * 두 벌이면 반드시 어긋나고, 어긋난 쪽 숫자가 손님에게 읽힌다.
 *
 * 그래서 화면·API 를 옮기지 않고 요청만 넘긴다. 저쪽을 로컬에서 고치고 push 하면
 * 그대로 반영된다.
 *
 * 주소는 브랜치 별칭이라 저쪽이 새로 배포돼도 그대로다.
 * 바꿔야 하면 환경변수 TELECOM_APP_URL 로 덮을 수 있다.
 *
 * 로그인은 **저쪽 앱이** 한다(SALES_APP_PASSCODE). 이 허브의 admin 비번과 별개다.
 *
 * 끝에 슬래시를 붙이지 않는다. Next 는 trailingSlash 기본값이 false 라 '/dev/telecom/' 을
 * '/dev/telecom' 으로 되돌리는데, 거기에 리디렉션을 더 붙이면 **무한 루프**가 된다
 * (실제로 308 이 오갔다). 그래서 링크를 '/dev/telecom/index.html' 로 두고
 * 저쪽 앱도 홈 링크를 './' 대신 'index.html' 로 쓴다.
 */
const TELECOM_APP_URL =
  process.env.TELECOM_APP_URL ||
  'https://telecom-plan-app-git-master-rhrjsgks-4872s-projects.vercel.app'

const nextConfig = {
  /*
   * **통신향 상담기는 닫아 두었다**(2026-09-14 사장님 지시 — 통신향 자급제 비교계산기로
   * 추후 업데이트 예정). rewrite 를 살려 두면 /dev/telecom/index.html 로 저쪽 앱이
   * 그대로 열리므로 함께 껐다. 다시 열 때 아래 한 줄을 되살리고 lib/devModules.ts 의
   * CLOSED_DEV_MODULES 항목을 DEV_MODULES 로 되돌린다.
   *
   *   { source: '/dev/telecom/:path*', destination: `${TELECOM_APP_URL}/:path*` },
   */
  async rewrites() {
    return []
  },
}

module.exports = nextConfig
