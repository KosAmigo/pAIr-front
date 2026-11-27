import { Loader2 } from 'lucide-react'
import { cx } from '../../components/cx'
import { Button } from '../../components/ui'

// ── 후속 질문 ───────────────────────────
// 답변 상태는 부모가 가진다(아래 참고 패널에서 "#T03" 같은 턴 번호를 답변에 넣을 수 있게).
export function FollowUp({
  questions,
  i,
  onIndex,
  answers,
  onAnswers,
  busy,
  error,
  onDone,
}: {
  questions: string[]
  i: number
  onIndex: (i: number) => void
  answers: string[]
  onAnswers: (a: string[]) => void
  busy: boolean
  error: string | null
  onDone: (a: string[]) => void
}) {
  const last = i === questions.length - 1
  return (
    <section className="flex h-full min-h-0 flex-col bg-panel">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-4">
        <span className="label">FOLLOW-UP</span>
        <span className="text-[16px] font-semibold">후속 질문</span>
        <span className="tnum ml-auto font-mono text-[13px] text-text-muted">
          {i + 1} / {questions.length}
        </span>
      </header>
      <div className="flex gap-1 px-4 pt-3" aria-hidden>
        {questions.map((_, j) => (
          <span key={j} className={cx('h-0.5 flex-1 rounded-full', j <= i ? 'bg-brand' : 'bg-line')} />
        ))}
      </div>
      <div key={i} className="fade-in flex min-h-0 flex-1 flex-col px-6 pt-4 pb-4">
        <span className="label">QUESTION {String(i + 1).padStart(2, '0')}</span>
        <h2 className="mt-1.5 text-[18px] leading-7 font-semibold">{questions[i]}</h2>
        <p className="mt-1 text-[14px] text-text-muted">위 [내 질문] 탭과 파일 탭에서 내 질문과 제출한 파일을 볼 수 있습니다. [답변에 넣기]로 턴 번호를 근거로 붙이세요.</p>
        <label htmlFor="answer" className="sr-only">
          답변
        </label>
        <textarea
          id="answer"
          value={answers[i]}
          onChange={(e) => onAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))}
          className="mt-3 min-h-0 flex-1 resize-none rounded-md border border-line-strong bg-panel-raised p-4 text-body text-text outline-none focus:border-brand"
          placeholder="답변을 입력하세요"
        />
        {error && <p className="mt-3 text-[14px] text-alert">{error}</p>}
        <div className="mt-3 flex items-center">
          <span className="tnum font-mono text-[13px] text-text-faint">{answers[i].length} chars</span>
          {i > 0 && (
            <Button variant="ghost" className="ml-auto" onClick={() => onIndex(i - 1)}>
              이전
            </Button>
          )}
          <Button variant="primary" className={i > 0 ? 'ml-2' : 'ml-auto'} disabled={busy} onClick={() => (last ? onDone(answers) : onIndex(i + 1))}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            {last ? '완료하고 채점하기' : '다음'}
          </Button>
        </div>
      </div>
    </section>
  )
}
