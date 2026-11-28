// 검수 상세 탭 내용: 개요, 파일, 문항, 자동 확인 결과. (자료 PDF 는 PdfViewer)
// 파일·문항 API 는 백엔드에 아직 없을 수 있어(404) "준비 중"을 보여 준다.
import { useState, type ReactNode } from 'react'
import { BookOpenCheck, Check, CircleAlert, ChevronDown, EyeOff, FileText, Hammer, Loader2, Lock } from 'lucide-react'
import { cx } from '../../../components/cx'
import { ErrorState } from '../../../components/ErrorState'
import { levelLabel } from '../../../components/taskKind'
import type { ConsoleTaskDetail } from '../../../consoleApi'
import { RequirementsView } from '../../../components/RequirementsView'
import type { GenReport } from '../../../data/taskGen'
import { useGenReport, useTaskFiles, useTaskQuestions, type Load } from '../../../data/taskReview'
import { questionTypeLabel } from '../../../data/questions'
import { CheckReport } from './CheckReport'
import { GenStats } from './GenStats'
import { Collapse } from './Collapse'
import { FileTree } from './FileTree'
import { parseRequirements } from '../../../data/requirements'

type Definition = ConsoleTaskDetail['definition']

// ── 공통 ──
export function Card({ title, label, children, className }: { title: string; label?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-panel p-6 shadow-sm', className)}>
      {label && <p className="label">{label}</p>}
      <h2 className="mb-3 text-[17px] font-bold text-text">{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

function Empty({ text = '아직 내용이 없어요.' }: { text?: string }) {
  return (
    <p className="inline-flex items-center gap-1.5 text-[14px] text-text-faint">
      <CircleAlert size={14} aria-hidden /> {text}
    </p>
  )
}

/** 로딩·오류·없음(404) 상태를 같은 모양으로 */
function Loaded<T>({ load, missing, children }: { load: Load<T> & { reload: () => void }; missing: ReactNode; children: (data: T) => ReactNode }) {
  if (load.state === 'loading')
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-[14px] text-text-muted">
        <Loader2 size={18} className="animate-spin text-brand" aria-hidden /> 불러오는 중
      </p>
    )
  if (load.state === 'error') return <ErrorState message={load.message} onRetry={load.reload} />
  if (load.state === 'missing')
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-panel/70 px-6 py-14 text-center text-[14px] break-keep text-text-muted">
        <Hammer size={22} className="text-text-faint" aria-hidden />
        {missing}
      </div>
    )
  return <>{children(load.data)}</>
}

// ── 개요 ──
// 2×2 격자: [과제 설명 | 요구사항(만들 기능)] / [후속 질문 | 예시]. 참고 사항(고정 문구)은 응시 화면에만 보인다. 좁으면 한 열.
export function OverviewTab({ definition: d }: { definition: Definition }) {
  const parsed = parseRequirements(d.requirements)
  const noFeatures = parsed.features.length === 0 && parsed.other.length === 0
  const noExamples = parsed.examples.length === 0 && parsed.tables.length === 0 && !parsed.common
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="과제 설명" label="DESCRIPTION">
        {d.description.length === 0 ? (
          <Empty />
        ) : (
          d.description.map((p, i) => (
            <p key={i} className="text-[15px] leading-7 break-keep text-text">
              {p}
            </p>
          ))
        )}
      </Card>
      <Card title="요구사항" label="REQUIREMENTS">
        {noFeatures ? <Empty /> : <RequirementsView lines={d.requirements} part="features" />}
      </Card>
      <Card title="후속 질문" label="FOLLOW-UPS">
        {d.followUps.length === 0 ? (
          <Empty />
        ) : (
          <ol className="flex list-decimal flex-col gap-1.5 pl-5">
            {d.followUps.map((t, i) => (
              <li key={i} className="text-[15px] leading-6 break-keep text-text">
                {t}
              </li>
            ))}
          </ol>
        )}
      </Card>
      <Card title="예시" label="EXAMPLES">
        {noExamples ? <Empty /> : <RequirementsView lines={d.requirements} part="examples" />}
      </Card>
    </div>
  )
}

// ── 파일 ──
export function FilesTab({ code, definition: d }: { code: string; definition: Definition }) {
  const files = useTaskFiles(code)
  const [chosen, setChosen] = useState<string | null>(null)
  return (
    <Loaded
      load={files}
      missing={
        <>
          파일 내용을 보여 줄 관리자 API(<code className="font-mono text-[13px]">GET /api/console/tasks/{'{code}'}/files</code>)가 아직 서버에 없어요.
          <span>
            처음 여는 파일 <code className="font-mono text-[13px] text-text">{d.openFile}</code>
            {d.editableFile && (
              <>
                , 고칠 수 있는 파일 <code className="font-mono text-[13px] text-text">{d.editableFile}</code>
              </>
            )}
          </span>
        </>
      }
    >
      {(list) => {
        if (list.length === 0) return <Empty text="파일이 없어요." />
        const sorted = [...list].sort((a, b) => Number(a.visibility === 'HIDDEN') - Number(b.visibility === 'HIDDEN') || a.path.localeCompare(b.path))
        const cur = sorted.find((f) => f.path === chosen) ?? sorted.find((f) => f.path === d.openFile) ?? sorted[0]
        return (
          <div className="grid h-[68vh] min-h-0 grid-cols-1 overflow-hidden rounded-2xl border border-line bg-panel shadow-sm md:grid-cols-[300px_minmax(0,1fr)]">
            <FileTree files={sorted} current={cur.path} openFile={d.openFile} onPick={setChosen} />
            <div className="flex min-h-0 flex-col">
              <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
                <span className="truncate font-mono text-[13px] font-semibold text-text">{cur.path}</span>
                {cur.visibility === 'HIDDEN' && (
                  <span className="inline-flex items-center gap-1 rounded-sm bg-panel-raised px-1.5 text-[12px] font-semibold text-text-muted">
                    <EyeOff size={12} aria-hidden /> 응시자에게 숨김
                  </span>
                )}
                {cur.readOnly && (
                  <span className="inline-flex items-center gap-1 rounded-sm bg-panel-raised px-1.5 text-[12px] font-semibold text-text-muted">
                    <Lock size={12} aria-hidden /> 읽기 전용
                  </span>
                )}
              </div>
              <pre className="min-h-0 flex-1 overflow-auto bg-panel-sunken p-4 font-mono text-[13px] leading-[22px] text-text">{cur.content ?? '(내용 없음: PDF 같은 파일은 자료 탭에서 보세요)'}</pre>
            </div>
          </div>
        )
      }}
    </Loaded>
  )
}

// ── 문항 ──
export function QuestionsTab({ code }: { code: string }) {
  const qs = useTaskQuestions(code)
  return (
    <Loaded load={qs} missing={<>문항과 정답을 보여 줄 관리자 API(<code className="font-mono text-[13px]">GET /api/console/tasks/{'{code}'}/questions</code>)가 아직 서버에 없어요. 응시자로 보기에서 문항 화면은 볼 수 있어요.</>}>
      {(list) =>
        list.length === 0 ? (
          <Empty text="문항이 없어요." />
        ) : (
          <ol className="fx-cards flex flex-col gap-3">
            {[...list]
              .sort((a, b) => a.seq - b.seq)
              .map((q) => (
                <li key={q.id} className="rounded-2xl border border-line bg-panel p-5 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tnum font-mono text-[14px] font-semibold text-brand">Q{q.seq}</span>
                    <span className="rounded-sm bg-panel-raised px-1.5 py-0.5 text-[12px] font-semibold text-text-muted">{questionTypeLabel[q.type]}</span>
                    <span className="tnum ml-auto font-mono text-[13px] text-text-muted">{q.points}점</span>
                  </div>
                  <p className="mt-2 text-[15px] leading-7 break-keep text-text">{q.content}</p>
                  {q.type === 'SHORT' ? (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-text-muted">인정 답안</span>
                      {q.answers.map((a) => (
                        <span key={a} className="rounded-full border border-signal/40 bg-signal/8 px-2.5 py-0.5 text-[14px] font-semibold text-signal">
                          {a}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {[...q.choices]
                        .sort((a, b) => a.seq - b.seq)
                        .map((c) => (
                          <li key={c.id} className={cx('flex items-start gap-2.5 rounded-lg border px-3 py-2 text-[14px] leading-6 break-keep', c.correct ? 'border-signal/50 bg-signal/6 font-semibold text-text' : 'border-line text-text-muted')}>
                            <span className={cx('tnum mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[12px]', c.correct ? 'bg-signal text-on-accent' : 'bg-panel-raised')}>
                              {c.correct ? <Check size={12} strokeWidth={3.5} aria-label="정답" /> : c.seq}
                            </span>
                            {c.content}
                          </li>
                        ))}
                    </ul>
                  )}
                  {q.sources.length > 0 && (
                    <p className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3 text-[13px] text-text-muted">
                      <BookOpenCheck size={14} aria-hidden /> 근거
                      {q.sources.map((s) => (
                        <span key={`${s.path}${s.pages}`} className="inline-flex items-center gap-1 rounded-sm bg-panel-raised px-1.5 py-0.5">
                          <FileText size={12} aria-hidden />
                          {s.path.split('/').pop()} <span className="tnum font-mono">{s.pages}쪽</span>
                        </span>
                      ))}
                      {q.sources.length < 2 && <span className="font-semibold text-caution">근거 문서가 2개보다 적어요</span>}
                    </p>
                  )}
                </li>
              ))}
          </ol>
        )
      }
    </Loaded>
  )
}

// ── 자동 확인 결과 ──

/** 모델·단계별 횟수·시간·토큰 자세히: 처음엔 접혀 있다 */
function GenDetails({ r }: { r: GenReport }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-text-muted transition-colors hover:bg-panel-raised hover:text-text">
        <ChevronDown size={15} aria-hidden className={cx('transition-transform duration-300 motion-reduce:transition-none', open && 'rotate-180')} />
        생성 기록 자세히
      </button>
      <Collapse open={open}>
        <div className="pt-2">
          <GenStats r={r} />
        </div>
      </Collapse>
    </div>
  )
}

export function GenReportTab({ code }: { code: string }) {
  const report = useGenReport(code)
  return (
    <Loaded load={report} missing={<>AI로 만든 과제가 아니거나, 생성 기록(_gen/report.json)이 없어요.</>}>
      {(r) => {
        return (
          <div className="flex flex-col gap-4">
            {r.retryError && (
              <p className="rounded-xl border border-caution/30 bg-caution/8 px-4 py-3 text-[14px] leading-6 break-keep text-text">
                <b className="font-bold text-caution">첫 시도에서 걸린 점 </b>
                {r.retryError}
              </p>
            )}
            <CheckReport r={r} />
            <GenDetails r={r} />
            {r.form && (
              <Card title="만들 때 넣은 내용" label="INPUT">
                <dl className="grid grid-cols-1 gap-2 text-[14px] sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-6">
                  {(
                    [
                      ['직무', r.form.jobRole],
                      ['주제', r.form.topic],
                      ['함정', r.form.trap],
                      ['난이도', levelLabel(r.form.difficulty)],
                    ] as const
                  )
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="font-semibold text-text-muted">{k}</dt>
                        <dd className="break-keep text-text">{v}</dd>
                      </div>
                    ))}
                </dl>
              </Card>
            )}
          </div>
        )
      }}
    </Loaded>
  )
}
