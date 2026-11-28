import { useMemo, useState, type FormEvent, type MouseEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock, Loader2, MessageSquareWarning, Play, Sparkles, X } from 'lucide-react'
import { trackIconOf } from '../components/domainIcons'
import { motion } from 'motion/react'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { ErrorState } from '../components/ErrorState'
import { cx } from '../components/cx'
import { GlowBorder, GradientText, Magnetic, RevealGroup, RevealItem, Spotlight, StageSection } from '../components/fx'
import type { Track } from '../data/catalog'
import { resumeByTask } from '../lib/attempts'
import type { Task, TaskSummary } from '../api'
import { attemptsQuery, tasksQuery } from '../data/userQueries'
import { errorMessage } from '../data/queryKeys'
import { distance, duration, easing, springs } from '../lib/motion'
import { StartBlockedModal } from '../components/StartBlockedModal'
import { useStartAttempt } from '../exam/hooks/useStartAttempt'

// DESIGN.md §7-2a 과제 목록 — "퀘스트 보드" (2026-11-19 전면 개편)
// 위: 직군 스위치(미끄러지는 알약) + 시간 필터(전체/20/40/60분, 개수 포함). 그 아래 다크 무대에 지금 바로 풀 수 있는 추천 과제를 크게.
// 아래: 과제 카드. 목록은 GET /api/tasks, 카드에 쓰는 설명은 GET /api/tasks/{id} 로 받는다. 마감(CLOSED) 과제는 보이되 시작할 수 없다.

const TRACKS: { value: Track; label: string }[] = [
  { value: 'dev', label: '개발 직군' },
  { value: 'biz', label: '비개발 직군' },
]

/** 목록의 한 줄(상태)과 과제 정의(설명)를 합친 카드용 데이터 */
type Row = Task & { status: TaskSummary['status'] }
const isOpen = (t: Row) => t.status === 'OPEN'
const startUrl = (t: Row) => `/exam/new?task=${encodeURIComponent(t.id)}`
/** 도전 링크를 누르면 화면을 넘기기 전에 응시를 만든다(크레딧이 모자라면 그 자리에 창). href 는 새 탭 열기용으로 둔다 */
type OnStart = (taskId: string) => (e: MouseEvent) => void
const resumeUrl = (attemptId: string) => `/exam/${encodeURIComponent(attemptId)}`
const trackName = (t: Row) => (t.type === 'biz' ? '비개발' : '개발')
const TrackIcon = ({ t, ...rest }: { t: Row; size: number; strokeWidth?: number; className?: string }) => {
  const Icon = trackIconOf(t.type)
  return <Icon {...rest} aria-hidden />
}

/** 추천 과제: 이 화면의 다크 무대 */
function Featured({ t, resumeId, onStart, starting }: { t: Row; resumeId?: string; onStart: OnStart; starting: boolean }) {
  return (
    <StageSection aria-label="추천 과제">
      <div className="grid items-center gap-10 px-6 py-8 md:grid-cols-[minmax(0,1fr)_320px] md:px-12 md:py-10">
        <div>
          <span className="inline-flex items-center gap-2 font-mono text-[12px] font-semibold tracking-[0.12em] text-stage-brand">
            <Sparkles size={14} aria-hidden /> RECOMMENDED │ {trackName(t)}
          </span>
          <h2 className="mt-3 break-keep text-[28px] leading-9 font-extrabold md:text-[44px] md:leading-[52px] tracking-[-0.03em] text-stage-text">
            {t.title.split(' ').slice(0, -2).join(' ')} <GradientText>{t.title.split(' ').slice(-2).join(' ')}</GradientText>
          </h2>
          <p className="mt-3 max-w-[560px] text-[17px] leading-7 text-stage-muted">{t.description[0]}</p>
          <div className="mt-5 flex flex-wrap items-center gap-5">
            <span className="inline-flex items-center gap-1.5 font-mono text-[14px] text-stage-text">
              <Clock size={16} className="text-stage-muted" aria-hidden /> {t.minutes}분
            </span>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Magnetic>
                <Link
                  to={startUrl(t)}
                  onClick={onStart(t.id)}
                  aria-busy={starting}
                  className="btn-shimmer bg-brand-gradient inline-flex h-14 items-center gap-2 rounded-full px-8 text-[17px] font-semibold text-on-accent shadow-[0_12px_40px_-8px_rgb(108_71_255/0.7)]"
                >
                  지금 도전하기 {starting ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <ArrowRight size={18} aria-hidden />}
                </Link>
              </Magnetic>
            {resumeId && (
              <Link
                to={resumeUrl(resumeId)}
                className="inline-flex h-14 items-center gap-2 rounded-full border border-stage-line-strong px-7 text-[17px] font-semibold text-stage-text transition-colors hover:bg-stage-panel"
              >
                <Play size={18} aria-hidden /> 이어서 풀기
              </Link>
            )}
          </div>
        </div>

        {/* 오른쪽: 과제 형태 아이콘이 빛나는 고리 안에서 떠 있다 */}
        <div className="relative mx-auto hidden size-[280px] md:block" aria-hidden>
          <div className="quest-ring absolute inset-0 rounded-full border border-dashed border-stage-line-strong" />
          <div className="quest-ring-rev absolute inset-8 rounded-full border border-stage-line" />
          <div className="absolute inset-16 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--color-stage-brand)_45%,transparent),transparent_70%)] blur-xl" />
          <GlowBorder className="absolute inset-[88px] rounded-[28px]">
            <div className="flex size-full items-center justify-center rounded-[28px] bg-stage-panel">
              <TrackIcon t={t} size={48} strokeWidth={1.5} className="text-stage-brand" />
            </div>
          </GlowBorder>
          {['var(--color-stage-brand)', 'var(--color-stage-blue)'].map((c, i) => (
            <span key={c} className="quest-orbit absolute top-1/2 left-1/2 size-3 rounded-full" style={{ background: c, boxShadow: `0 0 14px ${c}`, animationDelay: `${-i * 9}s` }} />
          ))}
        </div>
      </div>
    </StageSection>
  )
}

const ISSUE_CATEGORIES = ['문제 오류', '정답·해설 오류', '조건·설명 부족', '난이도 의견', '기타'] as const
type IssueReport = { id: string; taskId: string; taskTitle: string; category: string; questionNumber: string; message: string; createdAt: string }

function TaskIssueForm({ task, onClose }: { task: Row; onClose: () => void }) {
  const [category, setCategory] = useState<(typeof ISSUE_CATEGORIES)[number]>(ISSUE_CATEGORIES[0])
  const [questionNumber, setQuestionNumber] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const reports: IssueReport[] = JSON.parse(localStorage.getItem('pair-task-issue-reports') ?? '[]')
    reports.unshift({ id: crypto.randomUUID(), taskId: task.id, taskTitle: task.title, category, questionNumber, message: message.trim(), createdAt: new Date().toISOString() })
    localStorage.setItem('pair-task-issue-reports', JSON.stringify(reports))
    setSent(true)
  }
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="issue-title" className="w-full max-w-lg rounded-2xl border border-line bg-panel p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><p className="label">TASK FEEDBACK</p><h2 id="issue-title" className="mt-1 text-xl font-bold">문제 건의하기</h2><p className="mt-1 text-sm text-text-muted">{task.title}</p></div><button type="button" onClick={onClose} aria-label="닫기" className="rounded-md p-2 text-text-muted hover:bg-panel-raised"><X size={18}/></button></div>
        {sent ? <div className="py-10 text-center"><p className="text-lg font-semibold">건의를 접수했어요</p><p className="mt-2 text-sm text-text-muted">보내주신 의견은 과제 개선에 참고할게요.</p><button type="button" onClick={onClose} className="mt-6 rounded-md bg-brand-gradient px-5 py-2.5 font-semibold text-on-accent">확인</button></div> : <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">카테고리<select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="h-11 rounded-md border border-line-strong bg-panel px-3 text-text">{ISSUE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">문항 번호 <span className="text-xs font-normal text-text-muted">선택 항목</span><input value={questionNumber} onChange={(e) => setQuestionNumber(e.target.value)} placeholder="예: 2번" className="h-11 rounded-md border border-line-strong bg-panel px-3 text-text" /></label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">건의 내용<textarea required minLength={5} maxLength={2000} rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="어떤 점을 개선하면 좋을지 적어 주세요." className="resize-y rounded-md border border-line-strong bg-panel p-3 text-text"/><span className="text-right text-xs font-normal text-text-muted">{message.length}/2000</span></label>
          <button type="submit" disabled={message.trim().length < 5} className="h-11 rounded-md bg-brand-gradient font-semibold text-on-accent disabled:opacity-40">건의 보내기</button>
        </form>}
      </section>
    </div>
  )
}

function TaskCard({ t, resumeId, onStart }: { t: Row; resumeId?: string; onStart: OnStart }) {
  const [reporting, setReporting] = useState(false)
  const open = isOpen(t)
  // 건의 버튼과 도전 링크를 함께 두기 위해 카드는 링크로 감싸지 않는다.
  const wholeLink = false
  return (
    <>
    <Spotlight
      as={wholeLink ? Link : 'div'}
      {...(wholeLink ? { to: startUrl(t), onClick: onStart(t.id) } : resumeId ? {} : { 'aria-disabled': true })}
      className={cx(
        'group flex h-full w-full flex-col rounded-xl border border-line bg-panel p-6 shadow-sm transition-[transform,box-shadow,border-color] duration-150',
        open || resumeId ? 'hover:-translate-y-1 hover:border-brand/50 hover:shadow-lg' : 'opacity-60',
      )}
    >
      <div className="flex items-start gap-4">
        <span className="bg-brand-gradient inline-flex size-14 shrink-0 items-center justify-center rounded-2xl text-on-accent shadow-[0_10px_24px_-8px_rgb(108_71_255/0.6)]">
          <TrackIcon t={t} size={26} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="label">{trackName(t)}</p>
          <h3 className="mt-0.5 text-[19px] leading-7 font-bold text-text">{t.title}</h3>
        </div>
      </div>
      <p className="mt-3 text-[15px] leading-6 text-text-muted">{t.description[0]}</p>
      <div className="mt-auto flex items-center gap-4 border-t border-line pt-4 text-[14px] text-text-muted">
        <span className="inline-flex items-center gap-1 font-mono">
          <Clock size={14} aria-hidden /> {t.minutes}m
        </span>
        <span className="ml-auto inline-flex items-center gap-4">
          {resumeId && (
            <Link to={resumeUrl(resumeId)} className="-my-1.5 inline-flex h-8 items-center gap-1 rounded-full border border-brand/40 px-3 font-semibold text-brand hover:bg-brand-dim">
              <Play size={14} aria-hidden /> 이어서 풀기
            </Link>
          )}
          {!open ? (
            <span className="font-semibold text-text-muted">마감</span>
          ) : wholeLink ? (
            <span className="inline-flex items-center gap-1 font-semibold text-brand">
              도전 <ArrowRight size={16} className="transition-transform duration-150 group-hover:translate-x-1" aria-hidden />
            </span>
          ) : (
            <Link to={startUrl(t)} onClick={onStart(t.id)} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
              도전 <ArrowRight size={16} aria-hidden />
            </Link>
          )}
          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReporting(true) }} className="inline-flex items-center gap-1 text-text-muted hover:text-brand" aria-label={`${t.title} 문제 건의하기`}><MessageSquareWarning size={15} aria-hidden /> 건의</button>
        </span>
      </div>
    </Spotlight>
    {reporting && <TaskIssueForm task={t} onClose={() => setReporting(false)} />}
    </>
  )
}

// 실제 과제 시간은 20·40·60분이다. 그 밖의 값(예: 45분)은 가장 가까운 칸으로 센다
const TIME_STEPS = [20, 40, 60] as const
type TimeFilter = 'ALL' | (typeof TIME_STEPS)[number]
const timeBucket = (m: number): (typeof TIME_STEPS)[number] => TIME_STEPS.reduce((best, x) => (Math.abs(x - m) < Math.abs(best - m) ? x : best))

/** 시간 필터: 직군 스위치와 같은 유리 알약. 칸마다 개수를 붙이고, 0개인 칸은 흐리게 둔다 */
function TimeFilterSwitch({ counts, value, onChange }: { counts: Record<TimeFilter, number>; value: TimeFilter; onChange: (v: TimeFilter) => void }) {
  const options: { value: TimeFilter; label: string }[] = [{ value: 'ALL', label: '전체' }, ...TIME_STEPS.map((m) => ({ value: m, label: `${m}분` }))]
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-text-muted">
        <Clock size={15} aria-hidden /> 시간
      </span>
      <div role="radiogroup" aria-label="시간" className="glass isolate flex w-fit gap-1 rounded-full p-1.5">
        {options.map((o) => {
          const on = o.value === value
          const n = counts[o.value]
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={cx('relative inline-flex h-9 items-center rounded-full px-4 text-[15px] font-semibold transition-colors', on ? 'text-brand' : n === 0 ? 'text-text-faint hover:text-text-muted' : 'text-text-muted hover:text-text')}
            >
              {on && <motion.span layoutId="time-pill" transition={springs.snappy} className="absolute inset-0 z-0 rounded-full bg-panel shadow-sm ring-1 ring-brand/40" />}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                {o.label}
                <span className={cx('tnum font-mono text-[12px]', on ? 'text-brand/70' : 'text-text-faint')}>{n}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function Tasks() {
  const [track, setTrack] = useState<Track>('dev')
  const [time, setTime] = useState<TimeFilter>('ALL')
  const tasksQ = useQuery(tasksQuery)
  // 응시 기록을 못 읽어도 과제 목록은 보여 준다 (이어서 풀기만 빠진다)
  const attemptsQ = useQuery(attemptsQuery(true))
  const all: Row[] | null = tasksQ.data ?? null
  const error = tasksQ.error ? errorMessage(tasksQ.error) : null
  const resume = useMemo(() => (attemptsQ.data ? resumeByTask(attemptsQ.data) : new Map<string, string>()), [attemptsQ.data])
  const retry = () => void Promise.all([tasksQ.refetch(), attemptsQ.refetch()])
  const ofTrack = (all ?? []).filter((t) => t.type === track)
  const timeCounts: Record<TimeFilter, number> = { ALL: ofTrack.length, 20: 0, 40: 0, 60: 0 }
  for (const t of ofTrack) timeCounts[timeBucket(t.minutes)]++
  const tasks = ofTrack.filter((t) => time === 'ALL' || timeBucket(t.minutes) === time)
  const featured = tasks.find(isOpen)
  const { start, startingId, blocked, close } = useStartAttempt()
  return (
    <SelfShell
      header={
        <PageHeader label="TASKS" title="과제">
          {all && <span className="font-mono text-[13px] text-text-muted">응시 가능 {all.filter(isOpen).length}개</span>}
        </PageHeader>
      }
    >
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-6 md:px-8">
        {/* 직군 스위치: 활성 칸 뒤로 그라데이션 알약이 미끄러진다. 오른쪽에 난이도·시간 필터 */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div role="tablist" aria-label="직군" className="glass isolate flex w-fit gap-1 rounded-full p-1.5">
          {TRACKS.map((tr) => {
            const on = tr.value === track
            const n = all ? all.filter((t) => t.type === tr.value).length : null
            return (
              <button
                key={tr.value}
                role="tab"
                type="button"
                aria-selected={on}
                onClick={() => setTrack(tr.value)}
                className={cx('relative inline-flex h-11 items-center gap-2 rounded-full px-6 text-[16px] font-semibold transition-colors', on ? 'text-on-accent' : 'text-text-muted hover:text-text')}
              >
                {on && <motion.span layoutId="track-pill" transition={springs.snappy} className="bg-brand-gradient absolute inset-0 z-0 rounded-full shadow-[0_8px_24px_-8px_rgb(108_71_255/0.6)]" />}
                <span className="relative z-10 inline-flex items-center gap-2">
                  {tr.label}
                  {n != null && <span className={cx('tnum font-mono text-[13px]', on ? 'text-on-accent/80' : 'text-text-faint')}>{n}</span>}
                </span>
              </button>
            )
          })}
        </div>
          <TimeFilterSwitch counts={timeCounts} value={time} onChange={setTime} />
        </div>

        {error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : !all ? (
          <p className="flex items-center gap-2 py-10 text-body text-text-muted">
            <Loader2 size={18} className="animate-spin" aria-hidden /> 불러오는 중
          </p>
        ) : (
        <div key={`${track}-${time}`} className="flex flex-col gap-8">
          {featured && (
            <motion.div initial={{ opacity: 0, y: distance.app }} animate={{ opacity: 1, y: 0 }} transition={{ duration: duration.slow, ease: easing.expo }}>
              <Featured t={featured} resumeId={resume.get(featured.id)} onStart={start} starting={startingId === featured.id} />
            </motion.div>
          )}
          <section aria-labelledby="all-h">
            <h2 id="all-h" className="mb-4 text-h2 font-semibold text-text">
              전체 과제
            </h2>
            {tasks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center text-[15px] text-text-muted">조건에 맞는 과제가 없습니다. 직군이나 시간 필터를 바꿔 보세요.</p>
            ) : (
              <RevealGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {tasks.map((t) => (
                  <RevealItem key={t.id} className="flex">
                    <TaskCard t={t} resumeId={resume.get(t.id)} onStart={start} />
                  </RevealItem>
                ))}
              </RevealGroup>
            )}
          </section>
        </div>
        )}
      </div>
      {blocked && <StartBlockedModal message={blocked.message} creditShortage={blocked.creditShortage} onClose={close} />}
    </SelfShell>
  )
}
