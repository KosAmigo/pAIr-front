// DESIGN.md §7-9-3 응시자로 보기. 응시 화면(집중 무대)과 같은 틀로 과제를 띄우되, 맨 위 띠로 미리보기임을 알린다.
// 응시를 만들지 않으므로 기록이 남지 않는다. 문항은 눌러 볼 수 있지만 저장하지 않고, AI 대화와 제출은 막는다.
// 데이터: 과제 정의(/api/console/tasks/{id}), 자료 PDF·파일·문항(관리자 API, 없으면 안내).
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Bot, Eye, FileCode2, FileText, ListChecks, Loader2, X } from 'lucide-react'
import { cx } from '../../components/cx'
import { ErrorState } from '../../components/ErrorState'
import { QuestionPanel } from '../../components/questions/QuestionPanel'
import type { QuestionsState } from '../../components/questions/useQuestions'
import { Button, Logo, ModeBadge, Sep } from '../../components/ui'
import type { ConsoleTaskDetail } from '../../consoleApi'
import { useTaskDetail } from '../../data/consoleTasks'
import { answeredCount, type Question } from '../../data/questions'
import { toCandidateQuestion, trackOf } from '../../data/taskBoard'
import { useTaskFiles, useTaskQuestions } from '../../data/taskReview'
import { PdfViewer } from './task/PdfViewer'

export default function TaskPreview() {
  const { taskId } = useParams()
  const { detail, error, reload } = useTaskDetail(taskId)
  return (
    <div className="focus-stage fade-in flex h-full flex-col bg-bg">
      <div role="note" className="flex h-8 shrink-0 items-center gap-2.5 bg-info px-4 text-[13px] font-semibold text-on-accent">
        <Eye size={14} aria-hidden />
        미리보기
        <span className="inline-block h-3 w-px bg-on-accent/50" aria-hidden />
        응시 기록이 남지 않아요. 문항 답은 저장되지 않고, AI 대화와 제출은 막혀 있어요.
        <button type="button" onClick={() => window.close()} className="ml-auto inline-flex items-center gap-1 rounded-sm px-2 py-0.5 hover:bg-on-accent/15">
          <X size={14} aria-hidden /> 닫기
        </button>
      </div>
      {error ? (
        <div className="p-8">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : !detail || !taskId ? (
        <p className="flex items-center justify-center gap-2 py-32 text-[14px] text-text-muted">
          <Loader2 size={18} className="animate-spin text-brand" aria-hidden /> 과제를 불러오는 중
        </p>
      ) : (
        <ExamLike code={taskId} detail={detail} />
      )}
    </div>
  )
}

type Side = 'task' | 'questions'

function ExamLike({ code, detail }: { code: string; detail: ConsoleTaskDetail }) {
  const { summary: s, definition: d } = detail
  const biz = trackOf(s) === 'BIZ'
  const qs = usePreviewQuestions(code, biz)
  const hasQuestions = qs.questions.length > 0
  const [side, setSide] = useState<Side>('task')
  const live = s.usage === 'LIVE'

  return (
    <>
      {/* 응시 화면 6.7 Status Bar 와 같은 모양 */}
      <header className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-panel px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          <span className="h-4 w-px bg-line" aria-hidden />
          <span className="truncate text-[15px] font-semibold">{s.title}</span>
          <ModeBadge mode={live ? 'live' : 'self'} />
        </div>
        <div className="flex items-baseline gap-2 px-2" aria-label={`제한 시간 ${s.minutes}분`}>
          <span className="label">REMAINING</span>
          <span className="tnum font-mono text-[21px] leading-7 font-semibold">{String(s.minutes).padStart(2, '0')}:00</span>
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button variant="primary" size="sm" disabled title="미리보기에서는 제출할 수 없어요">
            제출
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: `${side === 'questions' ? 380 : 320}px minmax(0,1fr) 340px` }}>
        <aside className="flex min-h-0 flex-col border-r border-line bg-panel">
          <div role="tablist" aria-label="왼쪽 패널" className="flex h-10 shrink-0 items-stretch gap-4 border-b border-line px-4">
            {(
              [
                ['task', 'TASK'],
                ...(biz ? [['questions', 'QUESTIONS'] as const] : []),
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={side === v}
                onClick={() => setSide(v)}
                className={cx('label relative inline-flex items-center gap-1.5', side === v ? 'text-text!' : 'hover:text-text')}
              >
                {l}
                {v === 'questions' && hasQuestions && (
                  <span className="tnum font-mono text-[11px]">
                    {qs.answered}/{qs.questions.length}
                  </span>
                )}
                {side === v && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />}
              </button>
            ))}
          </div>
          {side === 'questions' ? (
            qs.load === 'ready' && !hasQuestions ? (
              <p className="p-4 text-[14px] break-keep text-text-muted">
                {qs.missing ? '문항을 불러올 관리자 API가 아직 서버에 없어요. 과제를 공개한 뒤 자가진단 응시에서 볼 수 있어요.' : '이 과제에는 문항이 없어요.'}
              </p>
            ) : (
              <QuestionPanel qs={qs} />
            )
          ) : (
            <div className="fade-in min-h-0 flex-1 overflow-auto p-4">
              <span className="label">{biz ? 'BIZ' : 'DEV'} TASK</span>
              <h2 className="mt-1 text-[16px] font-semibold">{s.title}</h2>
              {d.description.map((p, i) => (
                <p key={i} className="mt-3 text-[15px] leading-6 break-keep text-text">
                  {p}
                </p>
              ))}
              <h3 className="label mt-6">REQUIREMENTS</h3>
              <ol className="mt-2 space-y-2">
                {d.requirements.map((r, i) => (
                  <li key={i} className="flex gap-2 text-[15px] leading-6 break-keep">
                    <span className="font-mono text-[13px] leading-6 text-text-faint">{String(i + 1).padStart(2, '0')}</span>
                    {r}
                  </li>
                ))}
              </ol>
              {hasQuestions && (
                <button
                  type="button"
                  onClick={() => setSide('questions')}
                  className="mt-6 flex w-full items-center justify-between rounded-md border border-line bg-panel-raised/40 px-3 py-2.5 text-left text-[15px] font-semibold text-text hover:border-line-strong"
                >
                  <span className="inline-flex items-center gap-2">
                    <ListChecks size={16} aria-hidden /> 문항 풀기
                  </span>
                  <span className="tnum font-mono text-[13px] font-normal text-text-muted">
                    {qs.answered}/{qs.questions.length}
                  </span>
                </button>
              )}
              {d.notes.length > 0 && (
                <>
                  <h3 className="label mt-6">NOTES</h3>
                  <ul className="mt-2 space-y-2">
                    {d.notes.map((n, i) => (
                      <li key={i} className="border-l-2 border-caution pl-3 text-[14px] leading-5 break-keep text-text-muted">
                        {n}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col">
          {biz ? (
            <div className="min-h-0 flex-1 p-3">
              <PdfViewer code={code} height="h-full" />
            </div>
          ) : (
            <CodeView code={code} openFile={d.openFile} />
          )}
        </main>

        <aside className="flex min-h-0 flex-col border-l border-line bg-panel">
          <header className="flex h-10 shrink-0 items-center border-b border-line px-4">
            <span className="label">AI ASSISTANT</span>
          </header>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-info/10 text-info" aria-hidden>
              <Bot size={20} />
            </span>
            <p className="text-[14px] leading-6 break-keep text-text-muted">응시자는 여기서 AI와 대화하며 풀어요. 미리보기에서는 대화할 수 없어요.</p>
          </div>
          <div className="border-t border-line p-3">
            <div className="flex h-10 items-center rounded-md border border-line bg-panel-raised px-3 text-[14px] text-text-faint">메시지 입력 (미리보기에서는 막힘)</div>
          </div>
        </aside>
      </div>
    </>
  )
}

/** 개발 과제: 응시자에게 보이는 파일만 탐색기 + 내용으로. 파일 API 가 없으면 처음 여는 파일 이름만 */
function CodeView({ code, openFile }: { code: string; openFile: string }) {
  const files = useTaskFiles(code)
  const visible = files.state === 'ready' ? files.data.filter((f) => f.visibility === 'VISIBLE') : []
  const [chosen, setChosen] = useState<string | null>(null)
  const cur = visible.find((f) => f.path === chosen) ?? visible.find((f) => f.path === openFile) ?? visible[0]
  if (files.state === 'loading')
    return (
      <p className="flex flex-1 items-center justify-center gap-2 text-[14px] text-text-muted">
        <Loader2 size={18} className="animate-spin text-brand" aria-hidden /> 파일을 불러오는 중
      </p>
    )
  if (!cur)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-[14px] break-keep text-text-muted">
        <FileCode2 size={22} className="text-text-faint" aria-hidden />
        <span>
          응시자는 <code className="font-mono text-text">{openFile}</code> 파일을 열고 시작해요.
        </span>
        <span>{files.state === 'missing' ? '파일 내용을 보여 줄 관리자 API가 아직 서버에 없어요.' : '보여 줄 파일이 없어요.'}</span>
      </div>
    )
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="파일 탐색기" className="min-h-0 overflow-auto border-r border-line bg-panel py-2">
        {visible.map((f) => (
          <button
            key={f.path}
            type="button"
            onClick={() => setChosen(f.path)}
            className={cx('flex w-full items-center gap-2 px-3 py-1 text-left font-mono text-[13px]', f.path === cur.path ? 'bg-brand-dim text-text' : 'text-text-muted hover:bg-panel-raised')}
          >
            <FileText size={14} className="shrink-0" aria-hidden />
            <span className="truncate">{f.path}</span>
          </button>
        ))}
      </nav>
      <div className="flex min-h-0 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-panel px-4 font-mono text-[13px] text-text">
          {cur.path}
          {cur.readOnly && (
            <>
              <Sep />
              <span className="font-sans text-[12px] text-text-muted">읽기 전용</span>
            </>
          )}
        </div>
        <pre className="min-h-0 flex-1 overflow-auto bg-panel-sunken p-4 font-mono text-[14px] leading-[22px] text-text">{cur.content}</pre>
      </div>
    </div>
  )
}

/** 응시 화면 QuestionPanel 에 넘길 상태. 답은 화면에만 두고 서버에 저장하지 않는다 */
function usePreviewQuestions(code: string, enabled: boolean): QuestionsState & { missing: boolean } {
  const load = useTaskQuestions(code, enabled)
  const base = useMemo<Question[]>(() => (load.state === 'ready' ? load.data.map(toCandidateQuestion).sort((a, b) => a.seq - b.seq) : []), [load])
  const [answers, setAnswers] = useState<Record<number, Question['answer']>>({})
  const questions = base.map((q) => ({ ...q, answer: answers[q.id] ?? null }))
  return {
    questions,
    load: !enabled || load.state === 'ready' || load.state === 'missing' ? 'ready' : load.state === 'error' ? 'error' : 'loading',
    states: {},
    readOnly: false,
    answered: answeredCount(questions),
    choose: (id: number, choiceIds: number[]) => setAnswers((a) => ({ ...a, [id]: { choiceIds } })),
    type: (id: number, text: string) => setAnswers((a) => ({ ...a, [id]: { text } })),
    retry: () => {},
    flush: async () => {},
    reload: load.reload,
    missing: load.state === 'missing',
  }
}
