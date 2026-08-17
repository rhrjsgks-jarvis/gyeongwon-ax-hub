/**
 * 세일즈 코파일럿 아이콘 세트.
 *
 * **이모지를 쓰지 않는 이유** — 이모지는 OS 가 그리는 컬러 비트맵이라 ①삼성 블루와 무관한
 * 색이 튀고 ②윈도우·안드로이드·iOS 에서 모양이 제각각이며 ③크기를 키우면 뭉갠다.
 * SVG 로 그리면 색을 `currentColor` 로 앱이 통제하고 어디서나 같은 모양이 나온다.
 *
 * **그리는 규칙은 삼성 워드마크에서 가져왔다** — 완전한 기하학(정원·직선), 일정한 획 두께,
 * 넓은 카운터. 그래야 워드마크 옆에 놓았을 때 한 가족으로 보인다.
 *   · 24×24 그리드 · stroke 1.6 · round cap/join · 채우기 없음
 *   · 사선은 45° 만, 곡선은 정원 호만 — 임의 각도·베지어를 쓰지 않는다
 */
export type IconName =
  | 'home' | 'finder' | 'care' | 'compare' | 'catalog' | 'install'
  | 'warranty' | 'place' | 'quiz' | 'target' | 'dashboard'
  | 'ticket' | 'display' | 'coupon' | 'search' | 'chat' | 'qr' | 'share'
  | 'build' | 'external' | 'store' | 'book' | 'bulb' | 'link' | 'check' | 'warn' | 'chevron'
  | 'x' | 'star' | 'lock' | 'eye' | 'user' | 'doc' | 'puzzle' | 'download' | 'trash'
  | 'timer' | 'bolt' | 'printer' | 'phone' | 'ruler'

const P: Record<IconName, React.ReactNode> = {
  /* 허브 — 집 */
  home: <><path d="M4 10.5 12 4l8 6.5" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></>,
  /* 모델파인더 — 조건으로 좁힌다(깔때기). 순수 돋보기는 통합검색이 쓰므로 겹치면 안 된다 */
  finder: <><path d="M4.5 5h15l-5.8 6.8v6.4L10.3 20v-8.2L4.5 5Z" /></>,
  /* AI구독 케어 — 방패 안의 하트(지켜 준다) */
  care: <><path d="M12 3.5 5 6v6c0 4 3 6.8 7 8.5 4-1.7 7-4.5 7-8.5V6l-7-2.5Z" /><path d="M12 15c-2-1.3-3-2.5-3-3.8A1.7 1.7 0 0 1 12 10a1.7 1.7 0 0 1 3 1.2c0 1.3-1 2.5-3 3.8Z" /></>,
  /* 타사비교 — 두 판을 마주 세운다. 저울은 획이 많아 16px 에서 뭉갠다 */
  compare: <><rect x="3.5" y="5.5" width="7" height="13" rx="1.2" /><rect x="13.5" y="5.5" width="7" height="13" rx="1.2" /><path d="M12 3.5v17" /></>,
  /* 모바일 카탈로그 — 펼친 책 */
  catalog: <><path d="M12 6.5C10.5 5.2 8.5 4.7 5 5v13c3.5-.3 5.5.2 7 1.5 1.5-1.3 3.5-1.8 7-1.5V5c-3.5-.3-5.5.2-7 1.5Z" /><path d="M12 6.5v13" /></>,
  /* 설치환경 가이드 — 렌치 */
  install: <><path d="M15.5 4.5a4.5 4.5 0 0 0-5.8 5.6l-5.2 5.2a1.6 1.6 0 0 0 0 2.3l1.9 1.9a1.6 1.6 0 0 0 2.3 0l5.2-5.2a4.5 4.5 0 0 0 5.6-5.8l-2.7 2.7-2.5-.6-.6-2.5 2.8-2.6Z" /></>,
  /* AS 관련 정보 — 방패 안의 시계(기간) */
  warranty: <><path d="M12 3.5 5 6v6c0 4 3 6.8 7 8.5 4-1.7 7-4.5 7-8.5V6l-7-2.5Z" /><circle cx="12" cy="11.5" r="3.2" /><path d="M12 9.8v1.7l1.3.9" /></>,
  /* 배치 시뮬레이터 — 평면도(방과 가전) */
  place: <><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><path d="M3.5 12h6.5V4.5" /><rect x="13" y="14.5" width="4.5" height="3" rx="0.6" /></>,
  /* 레벨업 챌린지 — 체크리스트 */
  quiz: <><rect x="5" y="3.5" width="14" height="17" rx="1.6" /><path d="M8.5 9l1.5 1.5L13 7.5" /><path d="M8.5 15h7" /><path d="M15.5 9h1" /></>,
  /* URL 퀴즈 생성기 — 과녁 */
  target: <><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="3.8" /><circle cx="12" cy="12" r="0.9" /></>,
  /* 사용현황 대시보드 — 막대그래프 */
  dashboard: <><path d="M4 20h16" /><path d="M7 20v-6" /><path d="M12 20V6" /><path d="M17 20v-9" /></>,
  /* 컨시어지 — 번호표 */
  ticket: <><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v2a2 2 0 0 0 0 3v2A1.5 1.5 0 0 1 18.5 17h-13A1.5 1.5 0 0 1 4 15.5v-2a2 2 0 0 0 0-3v-2Z" /><path d="M13 7v10" /></>,
  /* 매장 전광판 — 디스플레이 */
  display: <><rect x="3.5" y="5" width="17" height="11" rx="1.5" /><path d="M9 19.5h6" /><path d="M12 16v3.5" /></>,
  /* 쿠폰 — 가운데가 잘록한 할인권. 대각선·톱니를 빼 16px 에서도 형태가 남게 한다 */
  coupon: <><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v1.9a1.8 1.8 0 0 0 0 3.2v1.9A1.5 1.5 0 0 1 18.5 17h-13A1.5 1.5 0 0 1 4 15.5v-1.9a1.8 1.8 0 0 0 0-3.2V8.5Z" /><path d="M9 11.5h6" /></>,
  /* 통합검색 */
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l4.5 4.5" /></>,
  /* 접수 포스터 — QR. 파인더 사각형 3개가 알아보게 하는 전부이므로 16px 에서도 살아남는다.
     오른쪽 아래 작은 사각 둘은 데이터 영역의 결을 흉내낸 것이라 뭉개져도 무방하다. */
  qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14.5" y="14.5" width="2" height="2" /><rect x="18" y="18" width="2" height="2" /></>,
  /* 개발자 문의 */
  chat: <><path d="M20 12.5c0 3.6-3.6 6.5-8 6.5-1 0-2-.2-2.9-.5L4.5 20l1.2-3.4A6.4 6.4 0 0 1 4 12.5C4 8.9 7.6 6 12 6s8 2.9 8 6.5Z" /></>,
  /* 공유 — 점 셋을 잇는 관례적 모양. 사선은 45°만 쓰는 규칙에 맞춰 두 선을 같은 각으로 뒀다 */
  share: <><circle cx="18" cy="5.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="18.5" r="2.5" /><path d="M8.2 10.8 15.8 6.7" /><path d="M8.2 13.2l7.6 4.1" /></>,

  /* ── 화면 표시 ──
   * 카드 안 소제목·상태 표시에 남아 있던 이모지 자리. 미니앱은 같은 그림을
   * `public/prod-symbols.js` 에서 쓴다 — 두 곳이 갈리면 허브와 도구가 다른 그림이 된다. */
  /* 구축중 — 연장(스패너) */
  build: <><path d="M14.5 3.5a4.5 4.5 0 0 0 5.4 5.9L9.7 19.6a2.6 2.6 0 1 1-3.7-3.7L16.2 5.7" /></>,
  /* 바깥으로 나가는 링크 */
  external: <><path d="M6.5 17.5 17.5 6.5" /><path d="M9.5 6.5h8v8" /></>,
  /* 매장 — 차양과 몸체 */
  store: <><path d="M4 10.5v10h16v-10" /><path d="M2.5 8 4.5 3.5h15L21.5 8a3 3 0 0 1-6 0 3 3 0 0 1-7 0 3 3 0 0 1-6 0Z" /></>,
  /* 사용 방법 — 펼친 책. catalog 와 달리 안쪽 면을 나눠 '설명서'로 읽히게 한다 */
  book: <><path d="M4 4.5h6a3 3 0 0 1 2 2.8v12a2.4 2.4 0 0 0-2-1.8H4v-13Z" /><path d="M20 4.5h-6a3 3 0 0 0-2 2.8v12a2.4 2.4 0 0 1 2-1.8h6v-13Z" /></>,
  /* 안내 — 전구 */
  bulb: <><path d="M12 2.8a6 6 0 0 0-3.5 10.9v2.3h7v-2.3A6 6 0 0 0 12 2.8Z" /><path d="M9.8 19h4.4M10.5 21.3h3" /></>,
  /* 링크 복사 */
  link: <><path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 1 0-5-5l-1.5 1.5" /><path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 1 0 5 5L12.5 16.5" /></>,
  check: <><path d="M4.5 12.5 9.5 17.5 19.5 7.5" /></>,
  warn: <><path d="M12 3.5 21.5 20H2.5L12 3.5Z" /><path d="M12 9.5v4.5" /><path d="M12 17h.01" /></>,
  /* 접힘 표시 — 펼치면 90° 돌아간다. 삼각형이라 작은 크기에서도 방향이 읽힌다 */
  chevron: <><path d="M9 5.5 16.5 12 9 18.5v-13Z" /></>,
  x: <><path d="M6 6l12 12M18 6 6 18" /></>,
  star: <><path d="M12 3.5l2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.9l6.1-.8L12 3.5Z" /></>,
  /* 잠금 — 관리자 대시보드 게이트 */
  lock: <><rect x="4.5" y="10" width="15" height="10.5" rx="1.8" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></>,
  /* 조회수 — 눈 */
  eye: <><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="3" /></>,
  /* 세션 — 사람 */
  user: <><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  doc: <><path d="M5.5 3.5h9L18.5 7.5v13h-13z" /><path d="M14 3.5v4.5h4.5" /><path d="M8.5 12.5h7M8.5 16h5" /></>,
  /* 추적 모듈 수 — 맞물리는 조각 */
  puzzle: <><path d="M9.5 3.5h5v2.2a1.8 1.8 0 1 0 3.6 0V3.5h2.4v5h-2.2a1.8 1.8 0 1 0 0 3.6h2.2v8.4h-8.4v-2.2a1.8 1.8 0 1 0-3.6 0v2.2H3.5v-8.4h2.2a1.8 1.8 0 1 0 0-3.6H3.5v-5h6Z" /></>,
  download: <><path d="M12 3.5v11" /><path d="M8 11l4 4 4-4" /><path d="M4.5 15.5v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3.5" /></>,
  trash: <><path d="M4.5 6.5h15" /><path d="M9.5 6.5V4h5v2.5" /><path d="M6.5 6.5 7.5 20.5h9l1-14" /><path d="M10.5 10v7M13.5 10v7" /></>,
  timer: <><circle cx="12" cy="13.5" r="7.5" /><path d="M12 9.5v4h3" /><path d="M9.5 2.5h5" /><path d="M12 2.5v3.5" /></>,
  bolt: <><path d="M13.5 2.5 5.5 13.5h5.5l-1 8 8-11h-5.5l1-8Z" /></>,
  /* 인쇄 — 포스터 */
  printer: <><rect x="3.5" y="8.5" width="17" height="7.5" rx="1.6" /><path d="M7 8.5V3.5h10v5" /><path d="M7 16h10v4.5H7Z" /></>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M10.6 5.3h2.8" /><path d="M10.5 18.7h3" /></>,
  /* 치수 — 삼각자 */
  ruler: <><path d="M3.5 14.5 14.5 3.5l6 6-11 11-6-6Z" /><path d="M7.5 10.5 9.5 12.5M10.5 7.5 12.5 9.5M13.5 4.5 15.5 6.5" /></>,
}

export default function Icon({
  name, size = 22, className, strokeWidth = 1.6, style,
}: {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
  style?: React.CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      /* 어떤 아이콘인지 DOM 에 남긴다 — 화면에는 보이지 않지만 "이 지면에 자물쇠가
         있는가" 같은 것을 검사가 직접 볼 수 있다(2026-08-17, 개발중 칸의 자물쇠를
         걷어내며 추가). 이름은 이미 타입으로 묶여 있어 오타가 나지 않는다. */
      data-icon={name}
      aria-hidden="true"
      focusable="false"
    >
      {P[name]}
    </svg>
  )
}
