'use client'

export default function FinderPage() {
  return (
    <div
      className="-m-4 md:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    >
      <iframe
        src="/finder-app.html"
        className="w-full h-full border-0"
        title="모델파인더 — 키워드 제품 검색"
      />
    </div>
  )
}