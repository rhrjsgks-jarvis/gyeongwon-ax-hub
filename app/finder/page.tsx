import ModulePage from '@/components/ModulePage'

export const metadata = { title: '모델파인더 · 경원 AX 허브' }

export default function FinderPage() {
  return (
    <ModulePage
      icon="🔍" title="모델파인더" color="#1428A0" bg="#EEF2FF"
      desc="키워드 한 줄로 CE·MX 전 제품(200종+) 검색"
    />
  )
}
