import ModulePage from '@/components/ModulePage'

export const metadata = { title: 'AX 현황 대시보드 · 경원 AX 허브' }

export default function AdminPage() {
  return (
    <ModulePage
      icon="📊" title="AX 현황 대시보드" color="#475569" bg="#F8FAFC"
      desc="모듈별 사용 현황 · 팀 AI 활용도 통계" status="building"
    />
  )
}
