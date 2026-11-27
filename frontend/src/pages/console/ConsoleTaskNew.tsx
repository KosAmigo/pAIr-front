// DESIGN.md §7-9-2 과제 만들기 (ADMIN). 2026-11-26: 탭 두 개 = 자동 생성(기본, 여러 개 한 번에) / 직접 만들기(아래 흐름). 탭은 주소(?tab=manual)에 남는다.
// 직접 만들기 2026-11-23 개편: ① 아이디어 → ② 확인 → ③ 생성 → ④ 검수.
// ① 위에서 아래로: 직군 → 주제(선택, 추천 방향) → 추천 받기 → 고른 내용 확인·수정 → 용도·제한 시간. 직무·난이도 칸은 없다(난이도는 AI가 정한다).
// ② 요약 카드로 한 번 확인 → ③ 생성(2초마다 상태 조회, 화면을 떠나면 조회만 멈춤) → 결과에서 ④ 검수로 간다.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CircleAlert, FilePlus2, Pencil } from 'lucide-react'
import { cx } from '../../components/cx'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { GradientText } from '../../components/fx'
import { PageHeader } from '../../components/SelfShell'
import { Button, Tabs } from '../../components/ui'
import { prefersReduced } from '../../lib/motion'
import {
  applySuggestion,
  buildGenRequest,
  pickedCompetencies,
  FILL_FIELDS,
  FILL_LABEL,
  DEFAULT_BATCH_HOURS,
  overwriteConflicts,
  pollJob,
  progressOf,
  advanceProgress,
  startErrorMessage,
  taskGenApi,
  validateForm,
  type FillField,
  type BatchHours,
  type GenMinutes,
  type GenMode,
  type GenStep,
  toGenStep,
  genDetail,
  type GenTrack,
  type GenUsage,
  type Suggestion,
  type TaskGenJob,
} from '../../data/taskGen'
import { ConfirmModal } from './common'
import { FlowSteps } from './task/FlowSteps'
import { GenProgress } from './task/GenProgress'
import { GenResult } from './task/GenResult'
import { TRACK_ICON, USAGE_ICON } from '../../components/domainIcons'
import { AutoGenPanel } from './task/AutoGenPanel'
import { GEN_CARD, inputCls, TRACKS } from './task/formConsts'
import { Field, MinutesPicker, ModePicker, TrackPicker, UsagePicker } from './task/formParts'
import { GenFrame, GenSummary, type SummaryRow } from './task/GenFrame'
import { GeneratingButton } from './task/GenActionButtons'
import { SuggestPanel } from './task/SuggestPanel'
import { refreshGenJobs } from './task/useGenJobs'
import { useSuggestions } from './task/useSuggestions'
import { generatingHref } from '../../data/taskGenJobs'

/** topicHint = ②에 적는 추천 방향(주제, 선택), topic = ④의 상황(생성 요청의 topic) */
type Form = { track: GenTrack | null; topicHint: string; topic: string; trap: string; usage: GenUsage; minutes: GenMinutes; mode: GenMode; batchDeadlineHours: BatchHours }
const EMPTY: Form = { track: null, topicHint: '', topic: '', trap: '', usage: 'SELF', minutes: 40, mode: 'NOW', batchDeadlineHours: DEFAULT_BATCH_HOURS }
type Phase = 'idea' | 'confirm' | 'running' | 'result'
const FLOW_AT: Record<Phase, number> = { idea: 0, confirm: 1, running: 2, result: 3 }

const input = inputCls

/** 직접 만들기 탭 */
function ManualGen({ onStarted }: { onStarted: () => void }) {
  const [form, setForm] = useState<Form>(EMPTY)
  const [tried, setTried] = useState(false)
  const [phase, setPhase] = useState<Phase>('idea')
  const [startError, setStartError] = useState<string | null>(null)
  const [job, setJob] = useState<TaskGenJob | null>(null)
  const [retried, setRetried] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  // 진행 막대. 다시 생성 단계가 끼어들면 전체 길이가 늘어 비율이 줄 수 있어, 뒤로 가지 않게 큰 값만 남긴다
  const [progress, setProgress] = useState(0)
  const [pending, setPending] = useState<{ s: Suggestion; fields: FillField[] } | null>(null)
  const [flashing, setFlashing] = useState<Set<FillField>>(new Set())
  const sug = useSuggestions()
  const hintRef = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const t0 = useRef(0)
  const stepT0 = useRef(0)
  const lastStep = useRef<GenStep | null>(null)
  const retriedRef = useRef(false)
  const timers = useRef<number[]>([])

  // 화면을 떠나면 조회와 채우기 연출을 멈춘다
  useEffect(
    () => () => {
      abort.current?.abort()
      timers.current.forEach((t) => window.clearTimeout(t))
    },
    [],
  )

  // 경과 시간 (만드는 중일 때만)
  const running = phase === 'running'
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      const now = Date.now()
      setElapsed(Math.floor((now - t0.current) / 1000))
      const p = progressOf(lastStep.current ?? '생성 중', retriedRef.current, (now - stepT0.current) / 1000)
      setProgress((old) => advanceProgress(old, p))
    }, 500)
    return () => clearInterval(t)
  }, [running])

  const errors = validateForm(form)
  const valid = Object.keys(errors).length === 0
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  // ── AI 추천 채우기: 칸마다 차례로 글자가 써지고 반짝인다 ──
  const flash = (k: FillField) => {
    setFlashing((s) => new Set(s).add(k))
    timers.current.push(
      window.setTimeout(
        () =>
          setFlashing((s) => {
            const n = new Set(s)
            n.delete(k)
            return n
          }),
        900,
      ),
    )
  }
  const fill = (s: Suggestion) => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    const target = applySuggestion(form, s)
    if (prefersReduced()) {
      setForm((f) => applySuggestion(f, s))
      FILL_FIELDS.forEach(flash)
      return
    }
    FILL_FIELDS.forEach((k, i) => {
      const start = i * 220
      timers.current.push(window.setTimeout(() => flash(k), start))
      const text = target[k]
      const n = Math.min(text.length, 24) // 아무리 길어도 24번에 나눠 쓴다
      for (let j = 1; j <= n; j++) {
        const upto = j === n ? text.length : Math.round((text.length * j) / n)
        timers.current.push(window.setTimeout(() => set(k, text.slice(0, upto)), start + j * 22))
      }
    })
  }
  const pick = (s: Suggestion) => {
    if (!form.track) return
    sug.pick(form.track, s)
    const fields = overwriteConflicts(form, s)
    if (fields.length > 0) setPending({ s, fields })
    else fill(s)
  }

  const next = () => {
    setTried(true)
    if (!valid) return
    setStartError(null)
    setPhase('confirm')
  }

  const submit = async () => {
    if (running || !valid || !form.track) return
    setStartError(null)
    setJob(null)
    setRetried(false)
    setElapsed(0)
    setProgress(0)
    retriedRef.current = false
    t0.current = Date.now()
    stepT0.current = Date.now()
    lastStep.current = '생성 중'
    setPhase('running')
    const ac = new AbortController()
    abort.current = ac
    try {
      const { jobId } = await taskGenApi.start(buildGenRequest({ ...form, track: form.track }, pickedCompetencies(form, sug.store[form.track])))
      if (ac.signal.aborted) return
      onStarted()
      const done = await pollJob(
        jobId,
        (j) => {
          setJob(j)
          if (j.step === '다시 생성 중') {
            retriedRef.current = true
            setRetried(true)
          }
          const next = toGenStep(j.step, retriedRef.current, lastStep.current)
          if (next !== lastStep.current) {
            lastStep.current = next
            stepT0.current = Date.now()
          }
        },
        { signal: ac.signal },
      )
      onStarted()
      if (done.status === 'CANCELED') {
        setStartError('이 작업은 취소됐어요. 다시 만들려면 아래 버튼을 눌러 주세요.')
        setPhase('confirm')
        return
      }
      setElapsed(Math.floor((Date.now() - t0.current) / 1000))
      setJob(done)
      setPhase('result')
    } catch (e) {
      if (ac.signal.aborted) return
      setStartError(startErrorMessage(e))
      setPhase('confirm')
    }
  }

  const restart = () => {
    abort.current?.abort()
    setForm((f) => ({ ...EMPTY, track: f.track, usage: f.usage, minutes: f.minutes }))
    setTried(false)
    setStartError(null)
    setJob(null)
    setPhase('idea')
  }

  const track = form.track
  const trackState = track ? sug.store[track] : undefined

  return (
    <>
      <div className="mx-auto mb-5 w-full max-w-[1180px]">
        <FlowSteps at={phase === 'result' && job?.status === 'FAILED' ? FLOW_AT.running : FLOW_AT[phase]} />
      </div>

      <div className="mx-auto w-full max-w-[1180px]">
        {phase === 'idea' && (
          <GenFrame aside={<GenSummary rows={manualSummary(form)} />}>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              next()
            }}
            className={GEN_CARD}
          >
            <Field n={1} title="직군" error={tried ? errors.track : null}>
              <TrackPicker value={form.track} onChange={(v) => set('track', v)} />
            </Field>

            <Field n={2} title="주제 (선택)" hint="비워 두면 AI가 다양하게 추천해요">
              <input
                ref={hintRef}
                aria-label="주제"
                value={form.topicHint}
                onChange={(e) => set('topicHint', e.target.value)}
                maxLength={100}
                placeholder="예: 쿠폰 할인 계산, 요금제 개편안 손익 비교"
                className={cx(input, 'h-11')}
              />
            </Field>

            <Field n={3} title="추천 받기">
              <SuggestPanel
                track={track}
                topic={form.topicHint}
                state={trackState}
                loading={sug.loading !== null && sug.loading === track}
                error={sug.error && sug.error.track === track ? sug.error.text : null}
                onAsk={() => track && void sug.ask(track, form.topicHint)}
                onPick={pick}
                onAcceptTopic={() => track && sug.accept(track)}
                onFixTopic={() => hintRef.current?.focus()}
              />
            </Field>

            <Field n={4} title="상황과 함정" hint="추천을 고르면 채워져요. 직접 적거나 고쳐도 돼요." error={tried ? (errors.topic ?? errors.trap) : null}>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-text-muted">상황</span>
                <textarea
                  aria-label="상황"
                  value={form.topic}
                  onChange={(e) => set('topic', e.target.value)}
                  rows={2}
                  maxLength={100}
                  placeholder={form.track === 'BIZ' ? '예: 요금제 개편안 손익 비교' : '예: 쿠폰 할인 계산'}
                  className={cx(input, 'py-2.5 leading-6', flashing.has('topic') && 'fill-flash')}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-text-muted">함정 · 응시자가 AI 답을 그대로 믿으면 빠지는 지점</span>
                <textarea
                  aria-label="함정"
                  value={form.trap}
                  onChange={(e) => set('trap', e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="예: 쿠폰 두 장을 겹치면 할인이 중복 적용됨"
                  className={cx(input, 'py-2.5 leading-6', flashing.has('trap') && 'fill-flash')}
                />
              </label>
            </Field>

            <Field n={5} title="용도와 제한 시간">
              <div className="flex flex-wrap items-start gap-x-10 gap-y-5">
                <UsagePicker value={form.usage} onChange={(v) => set('usage', v)} />
                <MinutesPicker value={form.minutes} onChange={(v) => set('minutes', v)} />
              </div>
            </Field>

            <Field n={6} title="방식">
              <ModePicker mode={form.mode} hours={form.batchDeadlineHours} onMode={(m) => set('mode', m)} onHours={(h) => set('batchDeadlineHours', h)} />
            </Field>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-6">
              {tried && !valid && <span className="mr-auto text-[14px] font-medium text-alert">빈 칸을 채워 주세요</span>}
              <Button type="submit" variant="primary" size="lg">
                다음 <ArrowRight size={17} aria-hidden />
              </Button>
            </div>
          </form>
          </GenFrame>
        )}

        {phase === 'confirm' && form.track && (
          <ConfirmCard form={{ ...form, track: form.track }} error={startError} onBack={() => setPhase('idea')} onStart={() => void submit()} />
        )}

        {phase === 'running' && form.track && (
          <div className="mx-auto max-w-[860px]">
            <GenProgress step={toGenStep(job?.step ?? null, retried)} detail={job?.status === 'QUEUED' ? (job.queuePosition ? `대기 ${job.queuePosition}번째` : '대기 중') : genDetail(job?.step ?? null, form.track)} retried={retried} elapsed={elapsed} progress={progress} track={form.track} topic={form.topic.trim()} />
          </div>
        )}

        {phase === 'result' && job && (
          <div className="mx-auto max-w-[860px]">
            <GenResult job={job} elapsed={elapsed} onRetry={() => void submit()} onNew={restart} />
          </div>
        )}
      </div>

      {pending && (
        <ConfirmModal
          title="적어 둔 내용을 바꿀까요?"
          confirm="추천으로 바꾸기"
          onClose={() => setPending(null)}
          onConfirm={() => {
            const p = pending
            setPending(null)
            fill(p.s)
          }}
          body={<>이미 적은 {pending.fields.map((f) => FILL_LABEL[f]).join(', ')} 칸이 추천 내용으로 바뀌어요.</>}
        />
      )}
    </>
  )
}

/** 오른쪽 요약: 고른 값. 비어 있으면 '아직 안 골랐어요' */
function manualSummary(f: Form): SummaryRow[] {
  const track = TRACKS.find((t) => t.value === f.track)?.title ?? null
  return [
    { label: '직군', value: track },
    { label: '상황', value: f.topic.trim() || null },
    { label: '함정', value: f.trap.trim() || null },
    { label: '용도', value: f.usage === 'LIVE' ? '실전' : '자가진단' },
    { label: '제한 시간', value: `${f.minutes}분` },
    { label: '방식', value: f.mode === 'BATCH' ? `배치 · 마감 ${f.batchDeadlineHours}시간` : '바로 만들기' },
  ]
}

/** ② 확인: 만들기 전에 한 번 보는 요약 카드 (주제·함정·직군·용도·시간) */
function ConfirmCard({
  form,
  error,
  onBack,
  onStart,
}: {
  form: Form & { track: GenTrack }
  error: string | null
  onBack: () => void
  onStart: () => void
}) {
  const TrackIcon = TRACK_ICON[form.track]
  const rows: [string, ReactNode][] = [
    [
      '직군',
      <span key="t" className="inline-flex items-center gap-1.5 font-semibold">
        <TrackIcon size={14} aria-hidden /> {TRACKS.find((t) => t.value === form.track)?.title}
      </span>,
    ],
    ['제한 시간', <span key="m"><span className="tnum font-mono">{form.minutes}</span>분</span>],
    ['방식', <span key="mo">{form.mode === 'BATCH' ? <>배치 · 마감 <span className="tnum font-mono">{form.batchDeadlineHours}</span>시간</> : '바로 만들기'}</span>],
    [
      '용도',
      form.usage === 'LIVE' ? (
        <span key="u" className="inline-flex items-center gap-1.5 font-semibold">
          <USAGE_ICON.LIVE size={14} aria-hidden /> 실전 (기업 회차에만 씀)
        </span>
      ) : (
        <span key="u" className="inline-flex items-center gap-1.5 font-semibold">
          <USAGE_ICON.SELF size={14} aria-hidden /> 자가진단 (누구나 자가진단에서 풂)
        </span>
      ),
    ],
  ]
  return (
    <section className="step-in mx-auto max-w-[760px] rounded-2xl border border-line bg-panel p-8 shadow-md">
      <p className="label text-brand">CONFIRM</p>
      <h2 className="mt-1 text-[24px] leading-8 font-extrabold tracking-[-0.02em] break-keep text-text">
        이대로 <GradientText>만들까요?</GradientText>
      </h2>
      <p className="mt-1 text-[14px] text-text-muted">만들기는 보통 40~70초 걸려요. 끝나면 검수 전 상태로 저장돼 어디에도 보이지 않아요.</p>

      {error && (
        <p role="alert" className="mt-5 flex items-start gap-2 rounded-lg border border-alert/30 bg-alert/8 px-4 py-3 text-[14px] leading-6 break-keep text-text">
          <CircleAlert size={18} className="mt-0.5 shrink-0 text-alert" aria-hidden /> {error}
        </p>
      )}

      <div className="mt-6 rounded-xl bg-[linear-gradient(135deg,rgb(139_92_246/0.07),transparent_60%)] p-5 ring-1 ring-line">
        <p className="text-[13px] font-semibold text-text-muted">상황</p>
        <p className="mt-0.5 text-[20px] leading-7 font-extrabold break-keep text-text">{form.topic.trim()}</p>
        <p className="mt-4 text-[13px] font-semibold text-text-muted">함정</p>
        <p className="mt-0.5 text-[15px] leading-6 break-keep text-text">{form.trap.trim()}</p>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className={cx('flex items-center gap-3 border-b border-line pb-2.5 text-[15px]', k === '용도' && 'sm:col-span-2')}>
            <dt className="w-20 shrink-0 text-[13px] font-semibold text-text-muted">{k}</dt>
            <dd className="text-text">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-7 flex flex-wrap items-center justify-end gap-3">
        <Button variant="ghost" onClick={onBack} className="mr-auto">
          <ArrowLeft size={16} aria-hidden /> <Pencil size={14} aria-hidden /> 고치기
        </Button>
        <Button variant="primary" size="lg" onClick={onStart} className="h-12 rounded-full px-6 text-[16px]">
          <FilePlus2 size={18} aria-hidden /> 과제 만들기
        </Button>
      </div>
    </section>
  )
}

type Tab = 'auto' | 'manual'
const TABS: { value: Tab; label: string }[] = [
  { value: 'auto', label: '자동 생성' },
  { value: 'manual', label: '직접 만들기' },
]

/** 과제 만들기: 탭(자동 생성 / 직접 만들기). 탭은 ?tab=manual 로 주소에 남는다(자동 생성은 주소에 안 적는다).
 *  만드는 중인 작업의 진행 목록은 '만드는 중인 과제' 페이지에 있다(제목 오른쪽 버튼). */
export default function ConsoleTaskNew() {
  useConsoleCrumbs(['과제 만들기'])
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const tab: Tab = params.get('tab') === 'manual' ? 'manual' : 'auto'
  const setTab = (v: Tab) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (v === 'manual') n.set('tab', 'manual')
        else n.delete('tab')
        return n
      },
      { replace: true },
    )

  return (
    <>
      <PageHeader label="NEW TASK" title="과제 만들기">
        <GeneratingButton size="md" />
      </PageHeader>
      {/* 탭은 폼과 같은 폭(1180px) 안에서 가운데 */}
      <div className="mx-auto flex w-full max-w-[1180px] justify-center border-b border-line/70 px-8 pt-4">
        <Tabs tabs={TABS} value={tab} onChange={setTab} className="gap-10" />
      </div>
      <div className="px-8 pt-6 pb-12">
        <div role="tabpanel" aria-label={TABS.find((t) => t.value === tab)?.label}>
          {tab === 'auto' ? (
            <AutoGenPanel onStarted={(jobIds) => { refreshGenJobs(); nav(generatingHref(jobIds[0])) }} />
          ) : (
            <ManualGen onStarted={refreshGenJobs} />
          )}
        </div>
      </div>
    </>
  )
}
