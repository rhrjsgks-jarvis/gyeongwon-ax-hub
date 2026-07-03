'use client'

export default function ComparePage() {
  return (
    <div
      className="-m-4 md:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    >
      <iframe
        src="/compare-app.html"
        className="w-full h-full border-0"
        title="타사비교 세일즈가이드"
      />
    </div>
  )
}