import ModulePage from '@/components/ModulePage'

export const metadata = { title: '타사비교 가이드 · 경원 AX 허브' }

export default function ComparePage() {
  return (
    <ModulePage
      icon="⚖️" title="타사비교 가이드" color="#EA580C" bg="#FFF7ED"
      desc="URL 입력 → 스펙 비교표 + 고객 응대 스크립트 자동 생성"
    />
  )
}
