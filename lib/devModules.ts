/*
 * 개발중인 서비스 목록 — **여기 한 곳에서만 적는다.**
 *
 * 허브 메인(`app/page.tsx`)의 「개발중」 그룹과 사이드바 최하단 「개발중인 서비스」
 * (`app/dev/page.tsx`)가 같은 것을 보여준다. 두 곳에 각각 적으면 반드시 어긋나고,
 * 어긋난 쪽을 본 상담사가 없는 도구를 찾게 된다 — 이 저장소가 허브 카드 개수·앱 버전·
 * 비교표 값에서 반복해서 데인 종류다.
 */
export type DevModule = {
  href: string
  icon: string
  title: string
  desc: string
  color: string
  bg: string
  updated: string
  status: 'dev'
}

export const DEV_MODULES: DevModule[] = [
  {
    /*
     * 2026-08-17 사용자 요청으로 「제품 상담 도구」에서 내렸다 — 도면 인식·3D 를 아직
     * 다듬는 중이다. 사이드바·하단탭에서도 함께 뺐고, `/place` 페이지 자체를 같은
     * 자물쇠(`DevGate`)로 감쌌다 — 목록만 잠그면 주소를 아는 사람은 그냥 들어간다.
     */
    href: '/place',
    icon: 'place',
    title: '가전 배치 시뮬레이터',
    desc: '구매할 가전을 고르면 도면에 맞춰 배치를 추천 — 이격거리·간섭·방 이탈까지 판정(카탈로그 실측 70개 사이즈)',
    color: '#1428A0',
    bg: '#EEF2FF',
    updated: '2026.08',
    status: 'dev',
  },
  {
    /*
     * 이 저장소가 아니라 **별도 배포**다. `next.config.js` 의 rewrites 가 요청을 넘긴다.
     * 끝에 슬래시를 붙이지 않는다 — 308 이 무한히 오간다(그 커밋 메시지 참조).
     *
     * **접속 코드는 뺐다**(2026-08-17 사용자 결정: *"허브 비번만으로 확인할 수 있게,
     * 접속 코드는 로컬에서만"*). 이 허브 쪽 잠금(`DevGate`)이 이미 문을 지키므로 두
     * 겹은 상담 중에 걸리적거리기만 한다.
     * **다만 실제로 끄는 것은 저쪽 앱의 일이다** — 이 저장소에는 그 코드를 검사하는
     * 자리가 없다(`SALES_APP_PASSCODE` 는 telecom-plan-app 의 환경변수다).
     * 그 배포에서 값을 비우거나 검사를 끄지 않으면 화면은 계속 코드를 묻는다.
     */
    href: '/dev/telecom/index.html',
    icon: 'phone',
    title: '통신 요금제 상담 도구',
    desc: '3사 요금제 349건·부가서비스 542건·결합 27건·단말 출고가·제휴카드 40장 — 월납부금액과 할부기간 총액까지 계산',
    color: '#1428A0',
    bg: '#EEF2FF',
    updated: '2026.08',
    status: 'dev',
  },
]
