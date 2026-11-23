// DESIGN.md §7-9-2 과제 만들기 (ADMIN). 2026-11-23 개편: ① 아이디어 → ② 확인 → ③ 생성 → ④ 검수.
// ① 위에서 아래로: 직군 → 주제(선택, 추천 방향) → 추천 받기 → 고른 내용 확인·수정 → 용도·제한 시간. 직무·난이도 칸은 없다(난이도는 AI가 정한다).
// ② 요약 카드로 한 번 확인 → ③ 생성(2초마다 상태 조회, 화면을 떠나면 조회만 멈춤) → 결과에서 ④ 검수로 간다.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleAlert, Pencil, Sparkles, type LucideIcon } from 'lucide-react'
import { cx } from '../../components/cx'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { GradientText } from '../../components/fx'
import { PageHeader } from '../../components/SelfShell'
import { Button } from '../../components/ui'
import { prefersReduced } from '../../lib/motion'
import {
  applySuggestion,
  buildGenRequest,
  FILL_FIELDS,
  FILL_LABEL,
  GEN_MINUTES,
  overwriteConflicts,
  pollJob,
  progressOf,
  startErrorMessage,
  taskGenApi,
  validateForm,
  type FillField,
  type GenMinutes,
  type GenStep,
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
import { choiceClass } from './task/choice'
import { SuggestPanel } from './task/SuggestPanel'
import { TRACK_TONE } from './task/trackTone'
import { useSuggestions } from './task/useSuggestions'

/** topicHint = ②에 적는 추천 방향(주제, 선택), topic = ④의 상황(생성 요청의 topic) */
type Form = { track: GenTrack | null; topicHint: string; topic: string; trap: string; usage: GenUsage; minutes: GenMinutes }
const EMPTY: Form = { track: null, topicHint: '', topic: '', trap: '', usage: 'SELF', minutes: 40 }
type Phase = 'idea' | 'confirm' | 'running' | 'result'
const FLOW_AT: Record<Phase, number> = { idea: 0, confirm: 1, running: 2, result: 3 }

const input =
  'w-full rounded-lg border border-line-strong bg-panel px-3.5 text-[15px] text-text outline-none transition-[border-color,box-shadow] focus:border-brand focus:shadow-[0_0_0_3px_rgb(108_71_255/0.15)]'
const TRACKS: { value: GenTrack; title: string; desc: string }[] = [
  { value: 'DEV', title: '개발', desc: '시작 코드와 공개·숨은 테스트를 만들어요' },
  { value: 'BIZ', title: '비개발', desc: 'PDF 자료, CSV와 객관식·단답형 문항을 만들어요' },
]
const USAGES: { value: GenUsage; title: string; desc: string; icon: LucideIcon }[] = [
  { value: 'SELF', title: '자가진단', desc: '누구나 자가진단에서 풀어요', icon: USAGE_ICON.SELF },
  { value: 'LIVE', title: '실전', desc: '기업 회차에만 써요', icon: USAGE_ICON.LIVE },
]

export default function ConsoleTaskNew() {
  useConsoleCrumbs(['과제 만들기'])
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
      setProgress((old) => Math.max(old, p))
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
      const { jobId } = await taskGenApi.start(buildGenRequest({ ...form, track: form.track }))
      if (ac.signal.aborted) return
      const done = await pollJob(
        jobId,
        (j) => {
          setJob(j)
          if (j.step !== lastStep.current) {
            lastStep.current = j.step
            stepT0.current = Date.now()
          }
          if (j.step === '다시 생성 중') {
            retriedRef.current = true
            setRetried(true)
          }
        },
        { signal: ac.signal },
      )
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
      <PageHeader label="NEW TASK" title="과제 만들기">
        <FlowSteps at={phase === 'result' && job?.status === 'FAILED' ? FLOW_AT.running : FLOW_AT[phase]} />
      </PageHeader>

      <div className="mx-auto w-full max-w-[960px] px-8 pt-6 pb-12">
        {phase === 'idea' && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              next()
            }}
            className="glass step-in flex flex-col gap-7 rounded-2xl bg-white/90! p-7 shadow-md!"
          >
            <Field n={1} title="직군" error={tried ? errors.track : null}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {TRACKS.map((t) => {
                  const on = form.track === t.value
                  const Icon = TRACK_ICON[t.value]
                  return (
                    <button
                      key={t.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set('track', t.value)}
                      className={cx('flex items-center gap-3 rounded-xl p-4 text-left', choiceClass(on))}
                    >
                      <span className={cx('inline-flex size-11 shrink-0 items-center justify-center rounded-xl', TRACK_TONE[t.value].tile)} aria-hidden>
                        <Icon size={22} />
                      </span>
                      <span className="min-w-0">
                        <span className={cx('block text-[16px] font-bold', on ? 'text-brand' : 'text-text')}>{t.title}</span>
                        <span className="block text-[13px] break-keep text-text-muted">{t.desc}</span>
                      </span>
                      {on && <Check size={18} strokeWidth={3} className="ml-auto shrink-0 text-brand" aria-hidden />}
                    </button>
                  )
                })}
              </div>
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
                <div className="flex flex-col gap-2">
                  <span className="text-[14px] font-bold text-text">제한 시간</span>
                  <div role="radiogroup" aria-label="제한 시간" className="flex gap-2">
                    {GEN_MINUTES.map((m) => {
                      const on = form.minutes === m
                      return (
                        <button
                          key={m}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => set('minutes', m)}
                          className={cx('inline-flex h-14 min-w-24 items-center justify-center gap-1.5 rounded-xl px-4 text-[16px] font-bold', choiceClass(on))}
                        >
                          {on && <Check size={16} strokeWidth={3} aria-hidden />}
                          <span>
                            <span className="tnum font-mono">{m}</span>분
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </Field>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-6">
              {tried && !valid && <span className="mr-auto text-[14px] font-medium text-alert">빈 칸을 채워 주세요</span>}
              <Button type="submit" variant="primary" size="lg">
                다음 <ArrowRight size={17} aria-hidden />
              </Button>
            </div>
          </form>
        )}

        {phase === 'confirm' && form.track && (
          <ConfirmCard form={{ ...form, track: form.track }} error={startError} onBack={() => setPhase('idea')} onStart={() => void submit()} />
        )}

        {phase === 'running' && form.track && (
          <div className="mx-auto max-w-[860px]">
            <GenProgress step={job?.step ?? '생성 중'} retried={retried} elapsed={elapsed} progress={progress} track={form.track} topic={form.topic.trim()} />
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

function Field({ n, title, hint, error, children }: { n: number; title: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="flex items-center gap-2 text-[16px] font-bold text-text">
        <span className="tnum inline-flex size-6 items-center justify-center rounded-full bg-panel-raised font-mono text-[12px] text-text-muted" aria-hidden>
          {n}
        </span>
        {title}
      </h2>
      {hint && <p className="-mt-1 text-[13px] text-text-muted">{hint}</p>}
      {children}
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-[13px] font-medium text-alert">
          <CircleAlert size={14} aria-hidden /> {error}
        </p>
      )}
    </section>
  )
}

/** 용도: 가로로 놓인 큰 선택 칸 두 개(아이콘 + 이름 + 한 줄 설명) */
function UsagePicker({ value, onChange }: { value: GenUsage; onChange: (v: GenUsage) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[14px] font-bold text-text">용도</span>
      <div role="radiogroup" aria-label="용도" className="flex flex-wrap gap-2">
        {USAGES.map((u) => {
          const on = value === u.value
          return (
            <button
              key={u.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(u.value)}
              className={cx('flex h-14 min-w-[210px] items-center gap-3 rounded-xl px-4 text-left', choiceClass(on))}
            >
              <u.icon size={20} aria-hidden className="shrink-0" />
              <span className="min-w-0">
                <span className="block text-[16px] leading-5 font-bold">{u.title}</span>
                <span className={cx('block text-[12px] leading-4 font-semibold break-keep', on ? 'text-brand' : 'text-text-muted')}>{u.desc}</span>
              </span>
              {on && <Check size={16} strokeWidth={3} className="ml-auto shrink-0" aria-hidden />}
            </button>
          )
        })}
      </div>
    </div>
  )
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
          <Sparkles size={18} aria-hidden /> 과제 만들기
        </Button>
      </div>
    </section>
  )
}
