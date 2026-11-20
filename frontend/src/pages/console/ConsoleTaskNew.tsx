// DESIGN.md §7-9-2 AI로 과제 만들기 (ADMIN).
// 폼 → 만드는 중(2초마다 상태 조회) → 결과(검수 전으로 저장됨 / 확인 실패 / 생성 실패).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, CircleAlert, ClipboardCheck, Loader2, Lock, Plus, RefreshCw, Sparkles, X } from 'lucide-react'
import { cx } from '../../components/cx'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { PageHeader } from '../../components/SelfShell'
import { Button, ButtonLink } from '../../components/ui'
import {
  allChecksOk,
  pollJob,
  startErrorMessage,
  stepStates,
  taskGenApi,
  validateForm,
  type GenDifficulty,
  type GenMinutes,
  type GenTrack,
  type GenUsage,
  type TaskGenJob,
  type TaskGenRequest,
} from '../../data/taskGen'

const input = 'h-10 rounded-sm border border-line-strong bg-panel px-3 text-[15px] text-text outline-none focus:border-brand focus:shadow-[0_0_0_3px_rgb(108_71_255/0.15)]'
const choice = (on: boolean) => cx('rounded-lg border px-4 py-3 text-left transition-colors', on ? 'border-brand bg-brand-dim' : 'border-line hover:border-line-strong')

const DIFFICULTIES: GenDifficulty[] = ['초급', '중급', '고급']
const USAGES: { value: GenUsage; title: string; desc: string }[] = [
  { value: 'SELF', title: '공개 문제 (자가진단)', desc: '누구나 자가진단에서 풀어 볼 수 있어요.' },
  { value: 'LIVE', title: '비공개 문제 (실전 시험)', desc: '실전 시험에만 쓰고, 자가진단에는 절대 보이지 않아요.' },
]

type Phase = { kind: 'form' } | { kind: 'running' } | { kind: 'result'; job: TaskGenJob }

export default function ConsoleTaskNew() {
  useConsoleCrumbs(['AI로 만들기'])
  const [form, setForm] = useState<TaskGenRequest>({ track: 'DEV', jobRole: '', difficulty: '중급', topic: '', trap: '', usage: 'SELF', minutes: 60 })
  const [tried, setTried] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })
  const [startError, setStartError] = useState<string | null>(null)
  const [job, setJob] = useState<TaskGenJob | null>(null)
  const [retried, setRetried] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const abort = useRef<AbortController | null>(null)

  // 화면을 떠나면 조회를 멈춘다
  useEffect(() => () => abort.current?.abort(), [])

  // 경과 시간 (만드는 중일 때만 1초마다)
  const running = phase.kind === 'running'
  useEffect(() => {
    if (!running) return
    const t0 = Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000)
    return () => clearInterval(t)
  }, [running])

  const errors = validateForm(form)
  const set = <K extends keyof TaskGenRequest>(k: K, v: TaskGenRequest[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    setTried(true)
    if (running || Object.keys(errors).length > 0) return
    setStartError(null)
    setJob(null)
    setRetried(false)
    setElapsed(0)
    setPhase({ kind: 'running' })
    const ac = new AbortController()
    abort.current = ac
    try {
      const { jobId } = await taskGenApi.start({ ...form, jobRole: form.jobRole.trim(), topic: form.topic.trim(), trap: form.trap.trim() })
      if (ac.signal.aborted) return
      const done = await pollJob(
        jobId,
        (j) => {
          setJob(j)
          if (j.step === '다시 생성 중') setRetried(true)
        },
        { signal: ac.signal },
      )
      setPhase({ kind: 'result', job: done })
    } catch (e) {
      if (ac.signal.aborted) return
      setStartError(startErrorMessage(e))
      setPhase({ kind: 'form' })
    }
  }

  const backToForm = (clear: boolean) => {
    abort.current?.abort()
    if (clear) {
      setForm((f) => ({ ...f, jobRole: '', topic: '', trap: '' }))
      setTried(false)
    }
    setStartError(null)
    setPhase({ kind: 'form' })
  }

  return (
    <>
      <PageHeader label="NEW TASK" title="AI로 과제 만들기" />
      <div className="mx-auto max-w-[760px] p-8">
        {phase.kind === 'form' && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
            className="glass flex flex-col gap-7 rounded-2xl bg-white/90! p-8 shadow-md!"
          >
            {startError && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert/8 px-4 py-3 text-[14px] leading-6 text-text">
                <CircleAlert size={18} className="mt-0.5 shrink-0 text-alert" aria-hidden /> {startError}
              </p>
            )}
            <Section title="직군" error={tried ? errors.track : null}>
              <div className="grid grid-cols-2 gap-2">
                {(['DEV', 'BIZ'] as GenTrack[]).map((t) => (
                  <button key={t} type="button" aria-pressed={form.track === t} onClick={() => set('track', t)} className={choice(form.track === t)}>
                    <span className="flex items-center gap-2 text-[15px] font-semibold text-text">
                      {t === 'DEV' ? '개발' : '비개발'}
                      {t === 'BIZ' && <span className="rounded-sm bg-caution/10 px-1.5 text-[12px] font-semibold text-caution">준비 중</span>}
                    </span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="직무" error={tried ? errors.jobRole : null}>
              <input aria-label="직무" value={form.jobRole} onChange={(e) => set('jobRole', e.target.value)} maxLength={50} placeholder="예: 백엔드" className={cx(input, 'w-full')} />
            </Section>

            <Section title="난이도">
              <div className="grid grid-cols-3 gap-2">
                {DIFFICULTIES.map((d) => (
                  <button key={d} type="button" aria-pressed={form.difficulty === d} onClick={() => set('difficulty', d)} className={choice(form.difficulty === d)}>
                    <span className="text-[15px] font-semibold text-text">{d}</span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="주제" error={tried ? errors.topic : null}>
              <input aria-label="주제" value={form.topic} onChange={(e) => set('topic', e.target.value)} maxLength={100} placeholder="예: 쿠폰 할인 계산" className={cx(input, 'w-full')} />
            </Section>

            <Section title="함정" error={tried ? errors.trap : null}>
              <p className="-mt-1 text-[13px] text-text-muted">응시자가 AI 답을 그대로 믿으면 빠지는 지점을 적으세요.</p>
              <textarea
                aria-label="함정"
                value={form.trap}
                onChange={(e) => set('trap', e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="예: 쿠폰 두 장을 겹치면 할인이 중복 적용됨"
                className="rounded-sm border border-line-strong bg-panel px-3 py-2 text-[15px] leading-6 text-text outline-none focus:border-brand focus:shadow-[0_0_0_3px_rgb(108_71_255/0.15)]"
              />
            </Section>

            <Section title="용도">
              <div className="grid grid-cols-2 gap-2">
                {USAGES.map((u) => (
                  <button key={u.value} type="button" aria-pressed={form.usage === u.value} onClick={() => set('usage', u.value)} className={choice(form.usage === u.value)}>
                    <span className="flex items-center gap-1.5 text-[15px] font-semibold text-text">
                      {u.value === 'LIVE' && <Lock size={14} aria-hidden />}
                      {u.title}
                    </span>
                    <span className="mt-1 block text-[13px] leading-5 text-text-muted">{u.desc}</span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="제한 시간">
              <div className="flex gap-2">
                {([40, 60] as GenMinutes[]).map((m) => (
                  <button key={m} type="button" aria-pressed={form.minutes === m} onClick={() => set('minutes', m)} className={cx(choice(form.minutes === m), 'tnum min-w-24 text-center font-mono text-[15px] font-semibold text-text')}>
                    {m}분
                  </button>
                ))}
              </div>
            </Section>

            <div className="flex items-center justify-end gap-3 border-t border-line pt-6">
              <span className="text-[13px] text-text-muted">보통 40~70초 걸려요</span>
              <Button type="submit" variant="primary" size="lg">
                <Sparkles size={16} aria-hidden /> 과제 만들기
              </Button>
            </div>
          </form>
        )}

        {phase.kind === 'running' && <Running job={job} retried={retried} elapsed={elapsed} />}

        {phase.kind === 'result' && <Result job={phase.job} onRetry={() => void submit()} onNew={() => backToForm(true)} />}
      </div>
    </>
  )
}

function Running({ job, retried, elapsed }: { job: TaskGenJob | null; retried: boolean; elapsed: number }) {
  const steps = stepStates(job?.step ?? '생성 중', retried)
  return (
    <section aria-live="polite" className="glass rounded-2xl bg-white/90! p-8 shadow-md!">
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-bold text-text">과제를 만드는 중이에요</h2>
        <span className="tnum font-mono text-[14px] text-text-muted">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
        </span>
      </div>
      <p className="mt-1 text-[14px] text-text-muted">보통 40~70초 걸려요. 이 화면을 떠나면 진행 확인이 멈춰요.</p>
      <ol className="mt-6 flex flex-col gap-3">
        {steps.map(({ step, state }) => (
          <li key={step} className="flex items-center gap-3">
            <span
              className={cx(
                'flex size-7 shrink-0 items-center justify-center rounded-full',
                state === 'done' && 'bg-signal text-on-accent',
                state === 'active' && 'bg-brand-dim text-brand',
                state === 'todo' && 'border-2 border-line-strong',
              )}
              aria-hidden
            >
              {state === 'done' && <Check size={16} strokeWidth={3} />}
              {state === 'active' && <Loader2 size={16} className="animate-spin" />}
            </span>
            <span className={cx('text-[15px]', state === 'active' ? 'font-bold text-text' : state === 'done' ? 'font-semibold text-text' : 'font-medium text-text-faint')}>
              {step}
              <span className="sr-only">{state === 'done' ? ' (끝남)' : state === 'active' ? ' (진행 중)' : ' (대기)'}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Result({ job, onRetry, onNew }: { job: TaskGenJob; onRetry: () => void; onNew: () => void }) {
  if (job.status === 'FAILED') {
    return (
      <section role="alert" className="glass rounded-2xl bg-white/90! p-8 shadow-md!">
        <h2 className="flex items-center gap-2 text-[18px] font-bold text-text">
          <CircleAlert size={20} className="text-alert" aria-hidden /> 과제를 만들지 못했어요
        </h2>
        <p className="mt-3 rounded-md bg-panel-sunken px-3 py-2 text-[14px] leading-6 break-words text-text">{job.error ?? '알 수 없는 오류'}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onNew}>
            <Plus size={16} aria-hidden /> 새 과제 만들기
          </Button>
          <Button variant="primary" onClick={onRetry}>
            <RefreshCw size={16} aria-hidden /> 다시 시도
          </Button>
        </div>
      </section>
    )
  }
  const ok = allChecksOk(job)
  return (
    <section className="glass rounded-2xl bg-white/90! p-8 shadow-md!">
      <h2 className="flex items-center gap-2 text-[18px] font-bold text-text">
        {ok ? <ClipboardCheck size={20} className="text-signal" aria-hidden /> : <CircleAlert size={20} className="text-caution" aria-hidden />}
        {ok ? '과제를 만들었어요' : '자동 확인을 통과하지 못한 항목이 있어요'}
      </h2>
      <p className="mt-2 text-[14px] leading-6 text-text-muted">
        {ok ? '검수 전 상태로 저장됐어요. 검수 후 공개하세요.' : '자동 확인을 통과하지 못했지만 검수 전으로 저장했어요. 고쳐서 쓰거나 지우세요.'}
      </p>
      {job.taskCode && <p className="mt-1 font-mono text-[12px] text-text-muted">{job.taskCode}</p>}
      <ul aria-label="자동 확인 결과" className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line">
        {job.checks.map((c) => (
          <li key={c.name} className={cx('flex items-start gap-3 px-4 py-2.5 text-[14px]', !c.ok && 'bg-alert/8')}>
            {c.ok ? (
              <Check size={16} strokeWidth={3} className="mt-0.5 shrink-0 text-signal" aria-label="통과" />
            ) : (
              <X size={16} strokeWidth={3} className="mt-0.5 shrink-0 text-alert" aria-label="실패" />
            )}
            <span className={cx('font-semibold', c.ok ? 'text-text' : 'text-alert')}>{c.name}</span>
            <span className={cx('min-w-0 flex-1 text-right text-[13px] break-words', c.ok ? 'text-text-muted' : 'text-alert')}>{c.detail}</span>
          </li>
        ))}
        {job.checks.length === 0 && <li className="px-4 py-4 text-center text-[14px] text-text-muted">확인 결과가 없어요.</li>}
      </ul>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onNew}>
          <Plus size={16} aria-hidden /> 새 과제 만들기
        </Button>
        <ButtonLink to={job.taskCode ? `/console/tasks/${encodeURIComponent(job.taskCode)}` : '/console/tasks'} variant="primary">
          과제 콘솔에서 검수하기
        </ButtonLink>
      </div>
    </section>
  )
}

function Section({ title, error, children }: { title: string; error?: string | null; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[16px] font-semibold text-text">{title}</h2>
      {children}
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-[13px] text-alert">
          <CircleAlert size={14} aria-hidden /> {error}
        </p>
      )}
    </section>
  )
}
