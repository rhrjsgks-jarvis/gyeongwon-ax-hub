'use client'

export default function QuizPage() {
  return (
    <div
      className="-m-4 md:-m-6"
      style={{ height: 'calc(100vh - 60px)', marginBottom: '-6rem' }}
    >
      <iframe
        src="/quiz-app.html"
        className="w-full h-full border-0"
        title="URL 퀴즈 생성기"
      />
    </div>
  )
}