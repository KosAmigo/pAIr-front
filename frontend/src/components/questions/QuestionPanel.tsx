import { Check, Loader2, Lock, TriangleAlert } from 'lucide-react'
import { cx } from '../cx'
import { SHORT_MAX_CHARS, questionTypeLabel, type Question } from '../../data/questions'
import type { QuestionsState } from './useQuestions'

// 응시 화면 왼쪽 사이드 패널의 "문항" 탭. 문항이 있는 과제(비개발)에만 나온다. 집중 무대라 움직임 없이 차분하게(DESIGN.md §7-3).
// 근거 문서는 보여 주지 않는다. 문서를 고르는 것도 평가 대상이다.

function SaveBadge({ state, error, onRetry }: { state?: { state: string; error?: string }; error?: string; onRetry: () => void }) {
  const s = state?.state
  if (s === 'saving')
    return (
      <span role="status" className="inline-flex items-center gap-1 text-[13px] font-medium text-text-muted">
        <Loader2 size={13} className="animate-spin" aria-hidden /> 저장 중
      </span>
    )
  if (s === 'saved')
    return (
      <span role="status" className="inline-flex items-center gap-1 text-[13px] font-medium text-signal">
        <Check size={13} aria-hidden /> 저장됨
      </span>
    )
  if (s === 'error')
    return (
      <span role="alert" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-alert" title={error}>
        <TriangleAlert size={13} aria-hidden /> 저장 실패
        <button type="button" onClick={onRetry} className="rounded-sm underline underline-offset-2 hover:text-text">
          다시 시도
        </button>
      </span>
    )
  return null
}

function ChoiceRow({ q, c, checked, readOnly, onToggle }: { q: Question; c: Question['choices'][number]; checked: boolean; readOnly: boolean; onToggle: () => void }) {
  const multi = q.type === 'MULTI'
  return (
    <label
      className={cx(
        'flex cursor-pointer items-start gap-2.5 rounded-sm border px-3 py-2 text-[15px] leading-6 transition-colors duration-[120ms]',
        checked ? 'border-brand bg-brand-dim' : 'border-line bg-panel-sunken hover:border-line-strong',
        readOnly && 'cursor-default opacity-80 hover:border-line',
      )}
    >
      <input
        type={multi ? 'checkbox' : 'radio'}
        name={`q-${q.id}`}
        checked={checked}
        disabled={readOnly}
        onChange={onToggle}
        className="mt-1.5 size-4 shrink-0 accent-[var(--color-brand)]"
      />
      <span className="min-w-0 break-words whitespace-pre-wrap text-text">{c.content}</span>
    </label>
  )
}

function QuestionCard({ q, state, readOnly, onChoose, onType, onRetry }: {
  q: Question
  state?: { state: string; error?: string }
  readOnly: boolean
  onChoose: (ids: number[]) => void
  onType: (text: string) => void
  onRetry: () => void
}) {
  const picked = q.answer && 'choiceIds' in q.answer ? q.answer.choiceIds : []
  const text = q.answer && 'text' in q.answer ? q.answer.text : ''
  const toggle = (id: number) => {
    if (q.type === 'SINGLE') onChoose([id])
    else onChoose(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])
  }
  return (
    <li className="rounded-md border border-line bg-panel-raised/40 p-3" aria-labelledby={`q-${q.id}-title`}>
      <div className="flex items-center gap-2">
        <span className="tnum font-mono text-[13px] text-text-faint">Q{String(q.seq).padStart(2, '0')}</span>
        <span className="inline-flex h-[22px] items-center rounded-sm bg-info/12 px-1.5 text-[13px] font-semibold text-info">{questionTypeLabel[q.type]}</span>
        <span className="tnum ml-auto font-mono text-[13px] text-text-muted">{q.points}점</span>
      </div>
      <p id={`q-${q.id}-title`} className="mt-2 text-[15px] leading-6 font-medium break-words whitespace-pre-wrap text-text">
        {q.content}
      </p>
      {q.type === 'MULTI' && <p className="mt-1 text-[13px] font-medium text-text-muted">모두 고르세요.</p>}
      <div className="mt-2.5">
        {q.type === 'SHORT' ? (
          <input
            type="text"
            value={text}
            maxLength={SHORT_MAX_CHARS}
            readOnly={readOnly}
            aria-label={`${q.seq}번 문항 답`}
            placeholder="답을 입력하세요"
            onChange={(e) => onType(e.target.value)}
            className="h-10 w-full rounded-sm border border-line bg-panel-sunken px-3 text-[15px] text-text outline-none placeholder:text-text-faint focus:border-brand read-only:text-text-muted"
          />
        ) : (
          <div role={q.type === 'SINGLE' ? 'radiogroup' : 'group'} aria-labelledby={`q-${q.id}-title`} className="flex flex-col gap-1.5">
            {[...q.choices]
              .sort((a, b) => a.seq - b.seq)
              .map((c) => (
                <ChoiceRow key={c.id} q={q} c={c} checked={picked.includes(c.id)} readOnly={readOnly} onToggle={() => toggle(c.id)} />
              ))}
          </div>
        )}
      </div>
      <div className="mt-2 flex h-5 items-center">
        <SaveBadge state={state} error={state?.error} onRetry={onRetry} />
      </div>
    </li>
  )
}

export function QuestionPanel({ qs }: { qs: QuestionsState }) {
  return (
    <div className="fade-in flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="tnum text-[15px] font-semibold text-text" aria-live="polite">
          {qs.answered}/{qs.questions.length} 문항 답함
        </span>
        {qs.readOnly && (
          <span className="ml-auto flex items-center gap-1 font-mono text-[12px] text-text-faint">
            <Lock size={12} aria-hidden /> READ ONLY
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {qs.load === 'error' ? (
          <div role="alert" className="rounded-md border border-alert/40 bg-alert/10 p-3 text-[14px] text-alert">
            문항을 불러오지 못했습니다.
            <button type="button" onClick={qs.reload} className="ml-2 underline underline-offset-2 hover:text-text">
              다시 불러오기
            </button>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {qs.questions.map((q) => (
              <QuestionCard
                key={q.id}
                q={q}
                state={qs.states[q.id]}
                readOnly={qs.readOnly}
                onChoose={(ids) => qs.choose(q.id, ids)}
                onType={(t) => qs.type(q.id, t)}
                onRetry={() => qs.retry(q.id)}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
