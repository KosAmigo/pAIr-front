// DESIGN.md §7-9-2 AI로 과제 만들기 (ADMIN). 2026-11-20 개편: ① 아이디어 → ② 확인 → ③ 생성 → ④ 검수.
// ① 직군을 고르고 AI 추천을 받거나 직접 적는다(오른쪽 스포트라이트 미리보기가 바로 따라온다).
// ② 요약 카드로 한 번 확인 → ③ 생성(2초마다 상태 조회, 화면을 떠나면 조회만 멈춤) → 결과에서 ④ 검수로 간다.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, BarChart3, Check, CircleAlert, Code2, Globe2, Lock, Pencil, Sparkles } from 'lucide-react'
import { cx } from '../../components/cx'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { GradientText, StageSection } from '../../components/fx'
import { LevelPips } from '../../components/taskKind'
import { PageHeader } from '../../components/SelfShell'
import { Button } from '../../components/ui'
import { prefersReduced } from '../../lib/motion'
import {
  applySuggestion,
  FILL_FIELDS,
  FILL_LABEL,
  overwriteConflicts,
  pollJob,
  progressOf,
  startErrorMessage,
  taskGenApi,
  validateForm,
  type FillField,
  type GenDifficulty,
  type GenMinutes,
  type GenStep,
  type GenTrack,
  type GenUsage,
  type Suggestion,
  type TaskGenJob,
} from '../../data/taskGen'
import { ConfirmModal } from './common'
import { HeroSep } from './ConsoleHero'
import { FlowSteps } from './task/FlowSteps'
import { GenProgress } from './task/GenProgress'
import { GenResult } from './task/GenResult'
import { SuggestPanel } from './task/SuggestPanel'
import { TRACK_TONE } from './task/trackTone'

type Form = { track: GenTrack | null; jobRole: string; difficulty: GenDifficulty; topic: string; trap: string; usage: GenUsage; minutes: GenMinutes }
const EMPTY: Form = { track: null, jobRole: '', difficulty: '중급', topic: '', trap: '', usage: 'SELF', minutes: 60 }
type Phase = 'idea' | 'confirm' | 'running' | 'result'
const FLOW_AT: Record<Phase, number> = { idea: 0, confirm: 1, running: 2, result: 3 }

const input =
  'w-full rounded-lg border border-line-strong bg-panel px-3.5 text-[15px] text-text outline-none transition-[border-color,box-shadow] focus:border-brand focus:shadow-[0_0_0_3px_rgb(108_71_255/0.15)]'
const DIFFICULTIES: GenDifficulty[] = ['초급', '중급', '고급']
const TRACKS: { value: GenTrack; title: string; desc: string; icon: typeof Code2 }[] = [
  { value: 'DEV', title: '개발', desc: '시작 코드와 공개·숨은 테스트를 만들어요', icon: Code2 },
  { value: 'BIZ', title: '비개발', desc: 'PDF 자료, CSV와 객관식·단답형 문항을 만들어요', icon: BarChart3 },
]
const USAGES: { value: GenUsage; title: string; sub: string; desc: string; icon: typeof Lock }[] = [
  { value: 'SELF', title: '공개 문제', sub: '자가진단', desc: '공개하면 누구나 자가진단에서 풀어 볼 수 있어요.', icon: Globe2 },
  { value: 'LIVE', title: '비공개 문제', sub: '실전 시험', desc: '실전 시험 회차에만 쓰고, 자가진단에는 절대 안 보여요. 문제가 새지 않아요.', icon: Lock },
]

export default function ConsoleTaskNew() {
  useConsoleCrumbs(['AI로 만들기'])
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
      if (k === 'difficulty') {
        timers.current.push(window.setTimeout(() => set('difficulty', target.difficulty), start))
        return
      }
      const text = target[k]
      const n = Math.min(text.length, 24) // 아무리 길어도 24번에 나눠 쓴다
      for (let j = 1; j <= n; j++) {
        const upto = j === n ? text.length : Math.round((text.length * j) / n)
        timers.current.push(window.setTimeout(() => set(k, text.slice(0, upto)), start + j * 22))
      }
    })
  }
  const pick = (s: Suggestion) => {
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
      const req = { ...form, track: form.track, jobRole: form.jobRole.trim(), topic: form.topic.trim(), trap: form.trap.trim() }
      const { jobId } = await taskGenApi.start(req)
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


  return (
    <>
      <PageHeader label="NEW TASK" title="AI로 과제 만들기">
        <FlowSteps at={phase === 'result' && job?.status === 'FAILED' ? FLOW_AT.running : FLOW_AT[phase]} />
      </PageHeader>

      <div className="mx-auto w-full max-w-[1240px] px-8 pt-6 pb-12">
        {phase === 'idea' && (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
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
                    return (
                      <button
                        key={t.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set('track', t.value)}
                        className={cx(
                          'flex items-center gap-3 rounded-xl border p-4 text-left transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5',
                          on ? 'border-brand bg-brand-dim ring-2 ring-brand/20' : 'border-line bg-panel hover:border-line-strong hover:shadow-md',
                        )}
                      >
                        <span className={cx('inline-flex size-11 shrink-0 items-center justify-center rounded-xl', TRACK_TONE[t.value].tile)} aria-hidden>
                          <t.icon size={22} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[16px] font-bold text-text">{t.title}</span>
                          <span className="block text-[13px] break-keep text-text-muted">{t.desc}</span>
                        </span>
                        {on && <Check size={18} strokeWidth={3} className="ml-auto shrink-0 text-brand" aria-hidden />}
                      </button>
                    )
                  })}
                </div>
              </Field>

              <SuggestPanel key={form.track ?? 'none'} track={form.track} jobRole={form.jobRole} difficulty={form.difficulty} onPick={pick} />

              <Field n={2} title="직무" error={tried ? errors.jobRole : null}>
                <input
                  aria-label="직무"
                  value={form.jobRole}
                  onChange={(e) => set('jobRole', e.target.value)}
                  maxLength={50}
                  placeholder={form.track === 'BIZ' ? '예: 서비스 기획자' : '예: 백엔드'}
                  className={cx(input, 'h-11', flashing.has('jobRole') && 'fill-flash')}
                />
              </Field>

              <Field n={3} title="난이도">
                <div className={cx('grid grid-cols-3 gap-2 rounded-xl', flashing.has('difficulty') && 'fill-flash')}>
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={form.difficulty === d}
                      onClick={() => set('difficulty', d)}
                      className={cx(
                        'flex h-12 items-center justify-center rounded-xl border transition-colors',
                        form.difficulty === d ? 'border-brand bg-brand-dim' : 'border-line bg-panel hover:border-line-strong',
                      )}
                    >
                      <LevelPips level={d} />
                    </button>
                  ))}
                </div>
              </Field>

              <Field n={4} title="주제" error={tried ? errors.topic : null}>
                <input
                  aria-label="주제"
                  value={form.topic}
                  onChange={(e) => set('topic', e.target.value)}
                  maxLength={100}
                  placeholder={form.track === 'BIZ' ? '예: 요금제 개편안 손익 비교' : '예: 쿠폰 할인 계산'}
                  className={cx(input, 'h-11', flashing.has('topic') && 'fill-flash')}
                />
              </Field>

              <Field n={5} title="함정" hint="응시자가 AI 답을 그대로 믿으면 빠지는 지점을 적으세요." error={tried ? errors.trap : null}>
                <textarea
                  aria-label="함정"
                  value={form.trap}
                  onChange={(e) => set('trap', e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="예: 쿠폰 두 장을 겹치면 할인이 중복 적용됨"
                  className={cx(input, 'py-2.5 leading-6', flashing.has('trap') && 'fill-flash')}
                />
              </Field>

              <Field n={6} title="용도">
                <UsagePicker value={form.usage} onChange={(v) => set('usage', v)} />
              </Field>

              <Field n={7} title="제한 시간">
                <div className="flex gap-2">
                  {([40, 60] as GenMinutes[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={form.minutes === m}
                      onClick={() => set('minutes', m)}
                      className={cx(
                        'h-11 min-w-24 rounded-xl border px-4 text-[15px] font-semibold transition-colors',
                        form.minutes === m ? 'border-brand bg-brand-dim text-text' : 'border-line bg-panel text-text-muted hover:border-line-strong',
                      )}
                    >
                      <span className="tnum font-mono">{m}</span>분
                    </button>
                  ))}
                </div>
              </Field>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-6">
                {tried && !valid && <span className="mr-auto text-[14px] font-medium text-alert">빈 칸을 채워 주세요</span>}
                <Button type="submit" variant="primary" size="lg">
                  다음: 확인하기 <ArrowRight size={17} aria-hidden />
                </Button>
              </div>
            </form>

            <aside className="lg:sticky lg:top-6">
              <LivePreview form={form} />
            </aside>
          </div>
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

function UsagePicker({ value, onChange }: { value: GenUsage; onChange: (v: GenUsage) => void }) {
  return (
    <div role="radiogroup" aria-label="용도" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {USAGES.map((u) => {
        const on = value === u.value
        const live = u.value === 'LIVE'
        return (
          <button
            key={u.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(u.value)}
            className={cx(
              'relative flex flex-col gap-2 overflow-hidden rounded-2xl border p-5 text-left transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5',
              on ? (live ? 'border-text bg-text/5 ring-2 ring-text/15' : 'border-brand bg-brand-dim ring-2 ring-brand/20') : 'border-line bg-panel hover:border-line-strong hover:shadow-md',
            )}
          >
            <span className="flex items-center gap-3">
              <span className={cx('inline-flex size-11 items-center justify-center rounded-xl', live ? 'bg-text text-on-accent' : 'bg-brand-gradient text-on-accent')} aria-hidden>
                <u.icon size={21} />
              </span>
              <span>
                <span className="block text-[17px] font-extrabold text-text">{u.title}</span>
                <span className="block text-[13px] font-semibold text-text-muted">{u.sub}</span>
              </span>
              <span
                aria-hidden
                className={cx('ml-auto inline-flex size-5 items-center justify-center rounded-full border-2', on ? (live ? 'border-text bg-text text-on-accent' : 'border-brand bg-brand text-on-accent') : 'border-line-strong')}
              >
                {on && <Check size={12} strokeWidth={3.5} />}
              </span>
            </span>
            <span className="text-[14px] leading-[22px] break-keep text-text-muted">{u.desc}</span>
            {live && (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-text/8 px-2.5 py-1 text-[12px] font-bold text-text">
                <Lock size={12} aria-hidden /> 자가진단에 절대 안 보임
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** 오른쪽 스포트라이트: 입력한 내용이 카드로 바로 보인다 */
function LivePreview({ form }: { form: Form }) {
  const items: [string, boolean][] = [
    ['직군', !!form.track],
    ['직무', !!form.jobRole.trim()],
    ['주제', !!form.topic.trim()],
    ['함정', !!form.trap.trim()],
  ]
  const done = items.filter(([, ok]) => ok).length
  const T = form.track ? TRACKS.find((t) => t.value === form.track) : null
  return (
    <StageSection aria-label="만들 과제 미리보기" className="p-6">
      <p className="label text-stage-brand">PREVIEW</p>
      <p className="mt-1 text-[14px] font-semibold text-stage-muted">이런 과제를 만들어요</p>
      <div className="glass-stage mt-4 rounded-2xl border border-stage-line p-5">
        <div className="flex items-center gap-3">
          {T && form.track ? (
            <span className={cx('inline-flex size-11 items-center justify-center rounded-xl', TRACK_TONE[form.track].tile)} aria-hidden>
              <T.icon size={22} />
            </span>
          ) : (
            <span className="inline-flex size-11 items-center justify-center rounded-xl border border-dashed border-stage-line-strong" aria-hidden />
          )}
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-stage-muted">
              {T?.title ?? '직군'}
              {form.jobRole.trim() && (
                <>
                  <HeroSep />
                  <span className="truncate">{form.jobRole.trim()}</span>
                </>
              )}
            </span>
            <span className="block text-[13px] font-semibold text-stage-text">{form.usage === 'LIVE' ? '비공개 문제' : '공개 문제'}</span>
          </span>
        </div>
        <p className={cx('mt-4 text-[19px] leading-7 font-extrabold break-keep', form.topic.trim() ? 'text-stage-text' : 'text-stage-faint')}>{form.topic.trim() || '주제를 적거나 추천을 고르세요'}</p>
        <div className="mt-3 flex items-center gap-3">
          <LevelPips level={form.difficulty} stage />
          <span className="text-[13px] text-stage-muted">
            <span className="tnum font-mono">{form.minutes}</span>분
          </span>
        </div>
        {form.trap.trim() && (
          <p className="mt-4 rounded-lg bg-stage-raised px-3 py-2 text-[13px] leading-5 break-keep text-stage-text">
            <b className="font-bold">함정 </b>
            {form.trap.trim()}
          </p>
        )}
      </div>
      <div className="mt-5">
        <p className="flex items-baseline justify-between text-[13px] font-semibold text-stage-muted">
          채운 칸
          <span className="tnum font-mono text-stage-text">
            {done} / {items.length}
          </span>
        </p>
        <ul className="mt-2 grid grid-cols-2 gap-1.5">
          {items.map(([name, ok]) => (
            <li key={name} className={cx('flex items-center gap-1.5 text-[13px] font-semibold', ok ? 'text-stage-signal' : 'text-stage-faint')}>
              <span className={cx('inline-flex size-4 items-center justify-center rounded-full', ok ? 'bg-stage-signal text-on-accent' : 'border border-stage-line-strong')} aria-hidden>
                {ok && <Check size={10} strokeWidth={3.5} />}
              </span>
              {name}
              <span className="sr-only">{ok ? ' 채움' : ' 비어 있음'}</span>
            </li>
          ))}
        </ul>
      </div>
    </StageSection>
  )
}

/** ② 확인: 만들기 전에 한 번 보는 요약 카드 */
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
  const rows: [string, ReactNode][] = [
    ['직군', TRACKS.find((t) => t.value === form.track)?.title],
    ['직무', form.jobRole.trim()],
    ['난이도', <LevelPips key="l" level={form.difficulty} />],
    ['제한 시간', <span key="m"><span className="tnum font-mono">{form.minutes}</span>분</span>],
    [
      '용도',
      form.usage === 'LIVE' ? (
        <span key="u" className="inline-flex items-center gap-1.5 font-semibold">
          <Lock size={14} aria-hidden /> 비공개 문제 (실전 시험, 자가진단에 안 보임)
        </span>
      ) : (
        <span key="u" className="inline-flex items-center gap-1.5 font-semibold">
          <Globe2 size={14} aria-hidden /> 공개 문제 (자가진단)
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
        <p className="text-[13px] font-semibold text-text-muted">주제</p>
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
