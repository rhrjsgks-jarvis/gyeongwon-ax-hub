'use client'

import AppsScriptCalc from '@/components/AppsScriptCalc'

/*
 * 구독계산기 — 「구독계산기」 섹션 (2026-11-02 사장님 지시: *"구독과 통신계산기 사이에 [구독계산기]
 * 신설해서 해당웹앱 통신향계산기처럼 연결 … 구동방식은 통신향계산기와 통일"*).
 *
 * **이 저장소가 아니라 Apps Script 웹앱이다** — 원본은 `~/MX/구독계산기`(소스·문서), 구독가는
 * `~/rental`(삼성닷컴 구독가 자동수집기)이 매월 모아 Drive 폴더 `구독계산기_데이터` 로 넣는다.
 * 옮겨 적지 않는 이유는 휴대폰계산기와 같다 — 계산 엔진·구독가가 두 벌이 되면 어긋난다.
 *
 * 저쪽 `doGet` 이 `setXFrameOptionsMode(ALLOWALL)` 이라 iframe 이 된다(소스 확인).
 * 주소는 `~/rental/config/deploy.json` 의 `webappUrl` 과 같다 — 배포 id 가 박힌 exec 주소라
 * 「새 버전」으로 올리는 한 그대로이고, 「새 배포」를 만들면 `lib/calcApps.ts` 한 곳을 바꾼다.
 * 허브·사이드바에서는 새 창으로 열린다 — 이 화면은 검색 결과·옛 링크로 곧장 왔을 때 쓰인다.
 */
export default function SubsCalcPage() {
  return <AppsScriptCalc route="/subs-calc" />
}
