import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Globe,
  Mail,
  MailCheck,
  Mic,
  MonitorUp,
  RefreshCw,
  Wifi,
} from 'lucide-react'
import { Button, cx, Logo, Sep, StatusDot, type Status } from '../components/ui'
import { examInfo } from '../data/mock'

// DESIGN.md §7-6 시험 입장 + §6.10 Stepper
// 입장 방법은 두 가지: 입장 코드 입력, 또는 메일로 받은 개인별 입장 링크
const stepsFor = (viaLink: boolean) => [viaLink ? '메일 링크' : '입장 코드', '시험 정보', '응시자 정보와 동의', '환경 점검', '대기실']

function Stepper({ current, viaLink }: { current: number; viaLink: boolean }) {
  const STEPS = stepsFor(viaLink)
  return (
    <ol className="flex items-center" aria-label="입장 단계">
      {STEPS.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={s} className="flex items-center">
            <div className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
              <span
                className={cx(
                  'flex size-6 items-center justify-center rounded-full font-mono text-[13px] font-semibold transition-colors duration-[240ms]',
                  done && 'bg-signal text-bg',
                  active && 'border border-signal text-signal',
                  !done && !active && 'border border-line-strong text-text-muted',
                )}
              >
                {done ? <Check size={16} strokeWidth={2.5} aria-hidden /> : i + 1}
              </span>
              <span className={cx('text-[14px] font-medium', active || done ? 'text-text' : 'text-text-muted')}>{s}</span>
            </div>
            {i < STEPS.length - 1 && (
              <span className={cx('mx-3 h-px w-12', i < current ? 'bg-signal' : 'bg-line')} aria-hidden />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function StepPanel({
  label,
  title,
  children,
  footer,
}: {
  label: string
  title: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <section className="step-in w-[640px] rounded-md border border-line bg-panel">
      <header className="flex h-10 items-center gap-3 border-b border-line px-4">
        <span className="label">{label}</span>
      </header>
      <div className="p-8">
        <h1 className="text-h1 font-bold">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
      <footer className="flex items-center gap-2 border-t border-line px-8 py-4">{footer}</footer>
    </section>
  )
}

function LinkNotice({ text }: { text: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-info/30 bg-info/10 px-3 py-2 text-[14px] text-text">
      <MailCheck size={18} strokeWidth={1.75} className="shrink-0 text-info" aria-hidden />
      {text}
    </div>
  )
}

// ── 1. 입장 코드 ────────────────────────────
function CodeStep({ onNext, onLink }: { onNext: () => void; onLink: () => void }) {
  const [chars, setChars] = useState<string[]>(Array(6).fill(''))
  const [error, setError] = useState(false)
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const full = chars.every(Boolean)

  const set = (i: number, v: string) => {
    const c = v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-1)
    const next = [...chars]
    next[i] = c
    setChars(next)
    setError(false)
    if (c && i < 5) refs.current[i + 1]?.focus()
  }
  const submit = () => {
    if (chars.join('') === examInfo.code) onNext()
    else setError(true)
  }

  return (
    <StepPanel
      label="STEP 01 / 05"
      title="입장 코드를 입력하세요"
      footer={
        <>
          <button
            type="button"
            className="font-mono text-[13px] text-text-muted underline-offset-4 hover:text-text hover:underline"
            onClick={() => {
              setChars(examInfo.code.split(''))
              setError(false)
            }}
          >
            데모 입장 코드 채우기 ({examInfo.code})
          </button>
          <Button variant="primary" size="lg" className="ml-auto" disabled={!full} onClick={submit}>
            확인 <ArrowRight size={18} aria-hidden />
          </Button>
        </>
      }
    >
      <label htmlFor="code-0" className="mb-2 block text-[14px] font-medium text-text-muted">
        기업에서 받은 6자리 입장 코드
      </label>
      <div className="flex gap-2" onPaste={(e) => {
        const p = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6)
        if (p) {
          e.preventDefault()
          setChars(p.padEnd(6, ' ').split('').map((c) => c.trim()))
        }
      }}>
        {chars.map((c, i) => (
          <input
            key={i}
            id={`code-${i}`}
            ref={(el) => {
              refs.current[i] = el
            }}
            value={c}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !c && i > 0) refs.current[i - 1]?.focus()
              if (e.key === 'Enter' && full) submit()
            }}
            aria-label={`입장 코드 ${i + 1}번째 자리`}
            maxLength={2}
            className={cx(
              'h-14 w-12 rounded-sm border bg-panel-raised text-center font-mono text-[24px] font-semibold uppercase text-text outline-none transition-colors duration-[120ms]',
              error ? 'border-alert' : 'border-line-strong focus:border-signal',
            )}
          />
        ))}
      </div>
      {error ? (
        <p className="mt-2 text-[14px] text-alert" role="alert">
          유효하지 않은 입장 코드입니다. 영문과 숫자를 다시 확인하세요.
        </p>
      ) : (
        <p className="mt-2 text-[14px] text-text-muted">입장 코드는 시험 안내 메일에 있습니다. 시작 30분 전부터 입장할 수 있습니다.</p>
      )}

      <div className="mt-8 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        <span className="label">OR</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="mt-6 flex items-center gap-4 rounded-md border border-line bg-panel-raised p-4">
        <Mail size={22} strokeWidth={1.75} className="shrink-0 text-info" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">메일로 입장 링크를 받으셨나요?</p>
          <p className="mt-0.5 text-[14px] text-text-muted">메일의 입장 링크를 누르면 코드 입력 없이 바로 입장하고, 응시자 정보도 자동으로 채워집니다.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onLink}>
          링크로 입장 (데모)
        </Button>
      </div>
    </StepPanel>
  )
}

// ── 2. 시험 정보 ────────────────────────────
function InfoStep({ onNext, onBack, viaLink }: { onNext: () => void; onBack: () => void; viaLink: boolean }) {
  const rows: [string, string, boolean?][] = [
    ['COMPANY', examInfo.company],
    ['EXAM', examInfo.title],
    ['START', examInfo.start, true],
    ['DURATION', examInfo.duration, true],
    ['TASKS', examInfo.tasks],
    ['PROCTORING', examInfo.proctor],
  ]
  return (
    <StepPanel
      label="STEP 02 / 05"
      title="시험 정보를 확인하세요"
      footer={
        <>
          {!viaLink && (
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft size={18} aria-hidden /> 이전
            </Button>
          )}
          <Button variant="primary" size="lg" className="ml-auto" onClick={onNext}>
            맞습니다 <ArrowRight size={18} aria-hidden />
          </Button>
        </>
      }
    >
      {viaLink && <LinkNotice text="메일 입장 링크가 확인되었습니다. 아래 시험이 맞는지 확인하세요." />}
      <dl className="divide-y divide-line rounded-md border border-line">
        {rows.map(([k, v, mono]) => (
          <div key={k} className="grid grid-cols-[140px_1fr] items-center px-4 py-3">
            <dt className="label">{k}</dt>
            <dd className={cx('text-[15px] text-text', mono && 'tnum font-mono')}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[14px] text-text-muted">
        이 시험은 <span className="text-text">복기를 제공하지 않습니다.</span> 제출 후에는 답안을 수정할 수 없습니다.
      </p>
    </StepPanel>
  )
}

// ── 3. 응시자 정보·동의 ─────────────────────
const CONSENTS = [
  {
    title: '[필수] 개인정보 수집 및 이용 동의',
    body: '이름, 이메일, 수험번호를 응시자 확인과 결과 전달 목적으로 수집하며, 시험 종료 후 1년간 보관합니다.',
  },
  {
    title: '[필수] 감독을 위한 카메라와 화면 녹화 동의',
    body: '시험 중 카메라 영상과 화면이 녹화되며, 부정행위 검토 목적으로만 기업 담당자에게 제공됩니다.',
  },
  {
    title: '[필수] AI 대화 기록 평가 활용 동의',
    body: '내장 AI와의 대화 전체가 AI 활용 역량 평가 근거로 사용됩니다.',
  },
]

function Field({ id, label, ...rest }: { id: string; label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[14px] font-medium text-text-muted">
        {label}
      </label>
      <input
        id={id}
        className="h-10 rounded-sm border border-line-strong bg-panel-raised px-3 text-[16px] text-text outline-none transition-colors duration-[120ms] placeholder:text-text-faint read-only:border-line read-only:text-text-muted focus:border-signal"
        {...rest}
      />
    </div>
  )
}

function ConsentStep({ onNext, onBack, viaLink }: { onNext: () => void; onBack: () => void; viaLink: boolean }) {
  const [checked, setChecked] = useState([false, false, false])
  const [open, setOpen] = useState<number | null>(null)
  const all = checked.every(Boolean)
  return (
    <StepPanel
      label="STEP 03 / 05"
      title="응시자 정보와 동의"
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft size={18} aria-hidden /> 이전
          </Button>
          <Button variant="primary" size="lg" className="ml-auto" disabled={!all} onClick={onNext}>
            다음 <ArrowRight size={18} aria-hidden />
          </Button>
        </>
      }
    >
      {viaLink && <LinkNotice text="메일 링크로 확인된 응시자 정보입니다. 수정이 필요하면 기업 담당자에게 문의하세요." />}
      <div className="grid grid-cols-2 gap-4">
        <Field id="name" label="이름" defaultValue="김지원" readOnly={viaLink} />
        <Field id="email" label="이메일" type="email" defaultValue="jiwon.kim@example.com" readOnly={viaLink} />
        <div className="col-span-2">
          <Field id="seat" label="수험번호" defaultValue={examInfo.seat} readOnly={viaLink} className="h-10 w-full rounded-sm border border-line-strong bg-panel-raised px-3 font-mono text-[16px] text-text outline-none read-only:border-line read-only:text-text-muted focus:border-signal" />
        </div>
      </div>

      <div className="mt-6 rounded-md border border-line">
        <label className="flex h-11 cursor-pointer items-center gap-3 border-b border-line px-4">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setChecked(checked.map(() => e.target.checked))}
            className="size-4 accent-[var(--color-signal)]"
          />
          <span className="text-[15px] font-semibold">전체 동의</span>
        </label>
        {CONSENTS.map((c, i) => (
          <div key={c.title} className="border-b border-line last:border-b-0">
            <div className="flex h-11 items-center gap-3 px-4">
              <input
                id={`consent-${i}`}
                type="checkbox"
                checked={checked[i]}
                onChange={(e) => setChecked(checked.map((v, j) => (j === i ? e.target.checked : v)))}
                className="size-4 accent-[var(--color-signal)]"
              />
              <label htmlFor={`consent-${i}`} className="flex-1 cursor-pointer text-[15px]">
                {c.title}
              </label>
              <button
                type="button"
                aria-expanded={open === i}
                aria-label={`${c.title} 내용 보기`}
                onClick={() => setOpen(open === i ? null : i)}
                className="inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-panel-raised hover:text-text"
              >
                <ChevronDown size={18} className={cx('transition-transform duration-[180ms]', open === i && 'rotate-180')} aria-hidden />
              </button>
            </div>
            {open === i && <p className="fade-in px-11 pb-3 text-[14px] leading-5 text-text-muted">{c.body}</p>}
          </div>
        ))}
      </div>
    </StepPanel>
  )
}

// ── 4. 환경 점검 ────────────────────────────
const CHECKS: { key: string; label: string; detail: string; icon: typeof Camera }[] = [
  { key: 'cam', label: '카메라', detail: 'FaceTime HD Camera', icon: Camera },
  { key: 'mic', label: '마이크', detail: '내장 마이크, 입력 감지됨', icon: Mic },
  { key: 'screen', label: '화면 공유', detail: '전체 화면 공유 필요', icon: MonitorUp },
  { key: 'browser', label: '브라우저', detail: 'Chrome 131, 지원됨', icon: Globe },
  { key: 'network', label: '네트워크', detail: '42 Mbps, 지연 18ms', icon: Wifi },
]

function EnvStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [status, setStatus] = useState<Record<string, Status>>({
    cam: 'ok',
    mic: 'ok',
    screen: 'check',
    browser: 'ok',
    network: 'ok',
  })
  const allOk = Object.values(status).every((s) => s === 'ok')
  return (
    <StepPanel
      label="STEP 04 / 05"
      title="응시 환경을 점검합니다"
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft size={18} aria-hidden /> 이전
          </Button>
          <span className="ml-auto text-[14px] text-text-muted">{allOk ? '모든 항목 정상' : '확인이 필요한 항목이 있습니다'}</span>
          <Button variant="primary" size="lg" disabled={!allOk} onClick={onNext}>
            대기실 입장 <ArrowRight size={18} aria-hidden />
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[240px_1fr] gap-4">
        <div className="flex aspect-video flex-col items-center justify-center gap-2 self-start rounded-md border border-line bg-panel-sunken">
          <Camera size={24} strokeWidth={1.75} className="text-text-faint" aria-hidden />
          <span className="label">CAMERA PREVIEW</span>
        </div>
        <ul className="divide-y divide-line rounded-md border border-line">
          {CHECKS.map((c) => (
            <li key={c.key} className="flex h-12 items-center gap-3 px-3">
              <c.icon size={18} strokeWidth={1.75} className="text-text-muted" aria-hidden />
              <div className="flex min-w-0 flex-col">
                <span className="text-[15px] leading-5 font-medium">{c.label}</span>
                <span className="truncate text-[13px] leading-4 text-text-muted">{c.detail}</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <StatusDot status={status[c.key]} />
                {status[c.key] !== 'ok' && (
                  <Button size="sm" variant="secondary" onClick={() => setStatus({ ...status, [c.key]: 'ok' })}>
                    <RefreshCw size={16} aria-hidden /> 공유 시작
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </StepPanel>
  )
}

// ── 5. 대기실 ───────────────────────────────
function WaitingRoom({ onStart }: { onStart: () => void }) {
  const [left, setLeft] = useState(4 * 60 + 32)
  useEffect(() => {
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [])
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  return (
    <section className="step-in w-[640px] rounded-md border border-line bg-panel">
      <header className="flex h-10 items-center gap-3 border-b border-line px-4">
        <span className="label">STEP 05 / 05</span>
        <span className="ml-auto flex items-center gap-4">
          <StatusDot status="ok" label="카메라" />
          <StatusDot status="ok" label="화면 공유" />
        </span>
      </header>
      <div className="flex flex-col items-center px-8 pt-10 pb-8">
        <span className="label">STARTS IN</span>
        <div className="tnum mt-2 font-mono text-display font-semibold text-text" role="timer" aria-live="off">
          {mm}:{ss}
        </div>
        <p className="mt-2 flex items-center gap-3 font-mono text-[14px] text-text-muted">
          <span>시작 {examInfo.start}</span>
          <Sep />
          <span>응시자 128명 대기 중</span>
        </p>
      </div>
      <div className="border-t border-line px-8 py-6">
        <h2 className="text-h3 font-semibold">유의사항</h2>
        <ul className="mt-3 flex flex-col gap-2 text-[15px] leading-6 text-text-muted">
          {[
            '시험이 시작되면 응시 화면으로 자동 이동합니다.',
            '브라우저 탭을 벗어나면 이탈로 기록됩니다.',
            '외부 AI와 검색은 사용할 수 없으며, 내장 AI만 사용할 수 있습니다.',
            '카메라에 얼굴이 계속 보이도록 유지하세요.',
          ].map((t, i) => (
            <li key={t} className="flex gap-3">
              <span className="font-mono text-[13px] leading-6 text-text-faint">{String(i + 1).padStart(2, '0')}</span>
              {t}
            </li>
          ))}
        </ul>
      </div>
      <footer className="flex items-center border-t border-line px-8 py-4">
        <span className="text-[14px] text-text-muted">프로토타입에서는 바로 시작할 수 있습니다.</span>
        <Button variant="primary" size="lg" className="ml-auto" onClick={onStart}>
          바로 시작 <ArrowRight size={18} aria-hidden />
        </Button>
      </footer>
    </section>
  )
}

export default function Entry() {
  // 메일 링크 입장: /entry?invite=<응시자별 토큰>. 코드 입력 단계를 건너뛴다.
  const [params, setParams] = useSearchParams()
  const viaLink = params.has('invite')
  const [step, setStep] = useState(viaLink ? 1 : 0)
  const navigate = useNavigate()
  const next = () => setStep((s) => s + 1)
  const back = () => setStep((s) => s - 1)
  const enterByLink = () => {
    setParams({ invite: examInfo.seat })
    setStep(1)
  }
  return (
    <div className="flex min-h-full flex-col border-t-2 border-alert">
      <header className="flex h-14 shrink-0 items-center gap-6 border-b border-line px-8">
        <Logo />
        <span className="inline-flex h-[22px] items-center rounded-sm bg-alert/12 px-1.5 font-mono text-[12px] font-semibold tracking-[0.08em] text-alert">
          LIVE EXAM
        </span>
        <div className="ml-auto">
          <Stepper current={step} viaLink={viaLink} />
        </div>
      </header>
      <main className="flex flex-1 justify-center px-8 py-12">
        <div key={step}>
          {step === 0 && <CodeStep onNext={next} onLink={enterByLink} />}
          {step === 1 && <InfoStep onNext={next} onBack={back} viaLink={viaLink} />}
          {step === 2 && <ConsentStep onNext={next} onBack={back} viaLink={viaLink} />}
          {step === 3 && <EnvStep onNext={next} onBack={back} />}
          {step === 4 && <WaitingRoom onStart={() => navigate('/exam/live-k7q2mx?mode=live')} />}
        </div>
      </main>
    </div>
  )
}
