import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Camera, Check, ChevronDown, Globe, Loader2, Mail, MailCheck, Mic, MonitorUp, RefreshCw, Users, Wifi } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cx } from '../components/cx'
import { Button, Logo, StatusDot, type Status } from '../components/ui'
import { Aurora, Glass, GlowBorder, GradientText, Magnetic, RevealGroup, RevealItem, StageSection } from '../components/fx'
import { examInfo } from '../data/mock'
import { duration, easing, scale, springs } from '../lib/motion'

// DESIGN.md §7-6 시험 입장 + §6.10 Stepper (2026-11-19 개편)
// 입장 방법은 메일로 받은 응시자별 입장 링크(/entry?invite=<토큰>) 하나뿐이다.
// 1–3단계: 오로라 위 유리 카드, 단계를 넘기면 카드가 진행 방향으로 밀려 바뀐다. 위에는 갈라지는 선 모양의 여정 막대.
// 4단계 대기실: 화면 전체가 다크 무대. 원형 진행 고리 안의 큰 카운트다운, 마지막 10초는 숫자가 바뀔 때마다 톡 튄다.
// 상단 2px alert 라인은 "실전 영역" 표시로 모든 단계에 유지한다.
const STEPS = ['시험 정보', '응시자 정보와 동의', '환경 점검', '대기실']

/** 여정 막대: 노드 4개를 잇는 선이 현재 단계까지 그라데이션으로 차오른다 */
function Journey({ current, stage }: { current: number; stage?: boolean }) {
  return (
    <ol className="relative flex w-[560px] items-start justify-between" aria-label="입장 단계">
      <span aria-hidden className={cx('absolute top-[15px] right-[40px] left-[40px] h-[3px] rounded-full', stage ? 'bg-stage-line' : 'bg-line')} />
      <motion.span
        aria-hidden
        className="bg-brand-gradient absolute top-[15px] left-[40px] h-[3px] origin-left rounded-full"
        style={{ width: 'calc(100% - 80px)' }}
        initial={false}
        animate={{ scaleX: current / (STEPS.length - 1) }}
        transition={{ duration: duration.slow, ease: easing.expo }}
      />
      {STEPS.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={s} className="relative z-10 flex w-20 flex-col items-center gap-1.5" aria-current={active ? 'step' : undefined}>
            <motion.span
              animate={{ scale: active ? 1.12 : 1 }}
              transition={springs.snappy}
              className={cx(
                'flex size-8 items-center justify-center rounded-full font-mono text-[13px] font-semibold',
                done && 'bg-brand-gradient text-on-accent',
                active && (stage ? 'glow-stage bg-stage-panel text-stage-brand [--glow:var(--color-stage-brand)]' : 'glow bg-panel text-brand [--glow:var(--color-brand)]'),
                !done && !active && (stage ? 'border border-stage-line bg-stage-panel text-stage-muted' : 'border border-line-strong bg-panel text-text-muted'),
              )}
            >
              {done ? <Check size={16} strokeWidth={2.5} aria-hidden /> : i + 1}
            </motion.span>
            <span className={cx('text-center text-[13px] leading-4 font-medium whitespace-nowrap', stage ? (active || done ? 'text-stage-text' : 'text-stage-muted') : active || done ? 'text-text' : 'text-text-muted')}>{s}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** 1–3단계 카드: 큰 단계 번호 + 제목 + 내용 + 아래 버튼 줄 */
function StepCard({ no, title, children, footer }: { no: number; title: string; children: ReactNode; footer: ReactNode }) {
  return (
    <Glass className="w-[760px] overflow-hidden rounded-2xl bg-white/85! shadow-lg!">
      <div className="flex items-end gap-5 px-10 pt-9">
        <span className="font-mono text-[56px] leading-[52px] font-semibold tracking-[-0.04em]">
          <GradientText>{String(no).padStart(2, '0')}</GradientText>
        </span>
        <div className="pb-1">
          <p className="label">STEP {String(no).padStart(2, '0')} / 04</p>
          <h1 className="text-[28px] leading-9 font-bold tracking-[-0.02em] text-text">{title}</h1>
        </div>
      </div>
      <div className="px-10 pt-7 pb-8">{children}</div>
      <footer className="flex items-center gap-2 border-t border-line/70 bg-panel/60 px-10 py-5">{footer}</footer>
    </Glass>
  )
}

function LinkNotice({ text }: { text: string }) {
  return (
    <div className="mb-5 flex items-center gap-2 rounded-lg border border-info/25 bg-info/8 px-4 py-2.5 text-[14px] text-text">
      <MailCheck size={18} strokeWidth={1.75} className="shrink-0 text-info" aria-hidden />
      {text}
    </div>
  )
}

// ── 링크 없이 들어온 경우 ───────────────────
function NoLink({ onDemo }: { onDemo: () => void }) {
  return (
    <Glass className="w-[640px] rounded-2xl bg-white/85! p-12 text-center shadow-lg!">
      <GlowBorder className="mx-auto w-fit rounded-3xl">
        <span className="bg-brand-gradient flex size-24 items-center justify-center rounded-3xl text-on-accent shadow-[0_16px_40px_-10px_rgb(108_71_255/0.6)]">
          <Mail size={44} strokeWidth={1.5} aria-hidden />
        </span>
      </GlowBorder>
      <h1 className="mt-8 text-[30px] leading-10 font-bold tracking-[-0.02em] text-text">
        메일의 <GradientText>입장 링크</GradientText>로 들어와 주세요
      </h1>
      <p className="mt-4 text-[16px] leading-7 text-text-muted">
        실전 시험은 응시자마다 따로 보내 드린 입장 링크로만 입장할 수 있습니다.
        <br />
        시험 안내 메일의 <span className="font-semibold text-text">시험 입장하기</span> 버튼을 눌러 주세요. 시작 30분 전부터 입장할 수 있습니다.
      </p>
      <p className="mt-3 text-[14px] text-text-muted">메일을 받지 못했다면 시험을 안내한 기업 담당자에게 문의하세요.</p>
      <div className="mt-8 flex items-center justify-center gap-3 border-t border-line/70 pt-6">
        <span className="text-[14px] text-text-muted">프로토타입에서는 데모 링크로 입장할 수 있습니다.</span>
        <Button variant="secondary" onClick={onDemo}>
          데모 링크로 입장 <ArrowRight size={18} aria-hidden />
        </Button>
      </div>
    </Glass>
  )
}

// ── 1. 시험 정보: 정보 타일 2×3 ─────────────
function InfoStep({ onNext }: { onNext: () => void }) {
  const rows: [string, string, boolean?][] = [
    ['COMPANY', examInfo.company],
    ['EXAM', examInfo.title],
    ['START', examInfo.start, true],
    ['DURATION', examInfo.duration, true],
    ['TASKS', examInfo.tasks],
    ['PROCTORING', examInfo.proctor],
  ]
  return (
    <StepCard
      no={1}
      title="시험 정보를 확인하세요"
      footer={
        <Magnetic className="ml-auto">
          <Button variant="primary" size="lg" onClick={onNext}>
            맞습니다 <ArrowRight size={18} aria-hidden />
          </Button>
        </Magnetic>
      }
    >
      <LinkNotice text="입장 링크가 확인되었습니다. 아래 시험이 맞는지 확인하세요." />
      <RevealGroup as="div" className="grid grid-cols-2 gap-3">
        {rows.map(([k, v, mono]) => (
          <RevealItem key={k} className="rounded-xl border border-line bg-panel px-4 py-3 shadow-sm">
            <p className="label">{k}</p>
            <p className={cx('mt-1 text-[16px] font-semibold text-text', mono && 'tnum font-mono')}>{v}</p>
          </RevealItem>
        ))}
      </RevealGroup>
      <p className="mt-5 text-[14px] text-text-muted">
        이 시험은 <span className="font-semibold text-text">복기를 제공하지 않습니다.</span> 제출 후에는 답안을 수정할 수 없습니다.
      </p>
    </StepCard>
  )
}

// ── 2. 응시자 정보·동의: 동의 카드 ──────────
const CONSENTS = [
  { title: '[필수] 개인정보 수집 및 이용 동의', body: '이름, 이메일, 수험번호를 응시자 확인과 결과 전달 목적으로 수집하며, 시험 종료 후 1년간 보관합니다.' },
  { title: '[필수] 감독을 위한 카메라와 화면 녹화 동의', body: '시험 중 카메라 영상과 화면이 녹화되며, 부정행위 검토 목적으로만 기업 담당자에게 제공됩니다.' },
  { title: '[필수] AI 대화 기록 평가 활용 동의', body: '내장 AI와의 대화 전체가 AI 활용 역량 평가 근거로 사용됩니다.' },
]

function Field({ id, label, ...rest }: { id: string; label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-text-muted">
        {label}
      </label>
      <input
        id={id}
        className="h-11 rounded-lg border border-line bg-panel-raised px-3 text-[16px] text-text-muted outline-none read-only:cursor-default focus:border-brand"
        {...rest}
      />
    </div>
  )
}

/** 체크 상자: 켜지면 브랜드 그라데이션으로 채워지고 체크가 튀어나온다 */
function CheckMark({ on }: { on: boolean }) {
  return (
    <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-150', on ? 'bg-brand-gradient border-transparent' : 'border-line-strong bg-panel')} aria-hidden>
      <AnimatePresence>
        {on && (
          <motion.span key="c" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={springs.snappy} className="text-on-accent">
            <Check size={16} strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

function ConsentStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [checked, setChecked] = useState([false, false, false])
  const [open, setOpen] = useState<number | null>(null)
  const all = checked.every(Boolean)
  return (
    <StepCard
      no={2}
      title="응시자 정보와 동의"
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft size={18} aria-hidden /> 이전
          </Button>
          <span className="ml-auto text-[14px] text-text-muted">
            <span className="tnum font-mono font-semibold text-text">{checked.filter(Boolean).length}</span> / 3 동의
          </span>
          <Button variant="primary" size="lg" disabled={!all} onClick={onNext}>
            다음 <ArrowRight size={18} aria-hidden />
          </Button>
        </>
      }
    >
      <LinkNotice text="입장 링크로 확인된 응시자 정보입니다. 수정이 필요하면 기업 담당자에게 문의하세요." />
      <div className="grid grid-cols-3 gap-3">
        <Field id="name" label="이름" defaultValue="김지원" readOnly />
        <Field id="email" label="이메일" type="email" defaultValue="jiwon.kim@example.com" readOnly />
        <Field id="seat" label="수험번호" defaultValue={examInfo.seat} readOnly className="h-11 rounded-lg border border-line bg-panel-raised px-3 font-mono text-[16px] text-text-muted outline-none focus:border-brand" />
      </div>

      <label className={cx('mt-6 flex h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 transition-colors duration-150', all ? 'border-brand bg-brand-dim' : 'border-line bg-panel hover:border-line-strong')}>
        <input type="checkbox" checked={all} onChange={(e) => setChecked(checked.map(() => e.target.checked))} className="sr-only" />
        <CheckMark on={all} />
        <span className="text-[16px] font-bold text-text">전체 동의</span>
      </label>
      <ul className="mt-2 flex flex-col gap-2">
        {CONSENTS.map((c, i) => (
          <li key={c.title} className={cx('rounded-xl border bg-panel transition-colors duration-150', checked[i] ? 'border-brand/50' : 'border-line')}>
            <div className="flex h-12 items-center gap-3 px-4">
              <label htmlFor={`consent-${i}`} className="flex flex-1 cursor-pointer items-center gap-3 text-[15px]">
                <input
                  id={`consent-${i}`}
                  type="checkbox"
                  checked={checked[i]}
                  onChange={(e) => setChecked(checked.map((v, j) => (j === i ? e.target.checked : v)))}
                  className="sr-only"
                />
                <CheckMark on={checked[i]} />
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
            {open === i && <p className="fade-in px-[52px] pb-3 text-[14px] leading-5 text-text-muted">{c.body}</p>}
          </li>
        ))}
      </ul>
    </StepCard>
  )
}

// ── 3. 환경 점검: 항목이 위에서부터 하나씩 확인된다 ──
const CHECKS: { key: string; label: string; detail: string; icon: typeof Camera }[] = [
  { key: 'cam', label: '카메라', detail: 'FaceTime HD Camera', icon: Camera },
  { key: 'mic', label: '마이크', detail: '내장 마이크, 입력 감지됨', icon: Mic },
  { key: 'screen', label: '화면 공유', detail: '전체 화면 공유 필요', icon: MonitorUp },
  { key: 'browser', label: '브라우저', detail: 'Chrome 131, 지원됨', icon: Globe },
  { key: 'network', label: '네트워크', detail: '42 Mbps, 지연 18ms', icon: Wifi },
]
const RESULT: Record<string, Status> = { cam: 'ok', mic: 'ok', screen: 'check', browser: 'ok', network: 'ok' }

function EnvStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const reduce = useReducedMotion()
  // 확인이 끝난 항목 수. 움직임 줄이기면 처음부터 다 끝난 상태
  const [done, setDone] = useState(reduce ? CHECKS.length : 0)
  const [fixed, setFixed] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (done >= CHECKS.length) return
    const t = window.setTimeout(() => setDone((d) => d + 1), 420)
    return () => window.clearTimeout(t)
  }, [done])
  const statusOf = (k: string, i: number): Status | 'run' => (i >= done ? 'run' : fixed[k] ? 'ok' : RESULT[k])
  const allOk = done >= CHECKS.length && CHECKS.every((c, i) => statusOf(c.key, i) === 'ok')
  return (
    <StepCard
      no={3}
      title="응시 환경을 점검합니다"
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft size={18} aria-hidden /> 이전
          </Button>
          <span className="ml-auto text-[14px] text-text-muted">{done < CHECKS.length ? '점검하는 중' : allOk ? '모든 항목 정상' : '확인이 필요한 항목이 있습니다'}</span>
          <Button variant="primary" size="lg" disabled={!allOk} onClick={onNext}>
            대기실 입장 <ArrowRight size={18} aria-hidden />
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[260px_1fr] gap-5">
        {/* 카메라 미리보기 자리: 훑는 빛이 위아래로 지나간다 */}
        <div className="relative flex aspect-[3/4] flex-col items-center justify-center gap-2 self-start overflow-hidden rounded-xl border border-line bg-panel-sunken">
          <span aria-hidden className="env-scan pointer-events-none absolute inset-x-0 top-0 h-16 [--scan-h:360px] bg-gradient-to-b from-transparent via-brand/15 to-transparent" />
          <Camera size={28} strokeWidth={1.5} className="text-text-faint" aria-hidden />
          <span className="label">CAMERA PREVIEW</span>
        </div>
        <ul className="flex flex-col gap-2">
          {CHECKS.map((c, i) => {
            const st = statusOf(c.key, i)
            return (
              <li key={c.key} className={cx('flex h-14 items-center gap-3 rounded-xl border bg-panel px-4 transition-colors duration-200', st === 'ok' ? 'border-signal/30' : st === 'check' ? 'border-caution/40' : 'border-line')}>
                <c.icon size={20} strokeWidth={1.75} className="text-text-muted" aria-hidden />
                <div className="flex min-w-0 flex-col">
                  <span className="text-[15px] leading-5 font-semibold">{c.label}</span>
                  <span className="truncate text-[13px] leading-4 text-text-muted">{c.detail}</span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {st === 'run' ? (
                    <span className="inline-flex items-center gap-1.5 text-[14px] text-text-muted">
                      <Loader2 size={16} className="animate-spin text-brand" aria-hidden /> 확인 중
                    </span>
                  ) : (
                    <motion.span initial={reduce ? false : { scale: scale.press, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springs.snappy}>
                      <StatusDot status={st} />
                    </motion.span>
                  )}
                  {st === 'check' && (
                    <Button size="sm" variant="secondary" onClick={() => setFixed({ ...fixed, [c.key]: true })}>
                      <RefreshCw size={16} aria-hidden /> 공유 시작
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </StepCard>
  )
}

// ── 4. 대기실: 다크 무대 ─────────────────────
const TOTAL_WAIT = 4 * 60 + 32

function WaitingRoom({ onStart }: { onStart: () => void }) {
  const reduce = useReducedMotion()
  const [left, setLeft] = useState(TOTAL_WAIT)
  useEffect(() => {
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [])
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  const R = 150
  const C = 2 * Math.PI * R
  const urgent = left <= 10
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-3">
        <span className="glass-stage inline-flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-semibold text-stage-text">
          <i className="size-2 rounded-full bg-stage-signal" aria-hidden /> 카메라 정상
        </span>
        <span className="glass-stage inline-flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-semibold text-stage-text">
          <i className="size-2 rounded-full bg-stage-signal" aria-hidden /> 화면 공유 정상
        </span>
        <span className="glass-stage inline-flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-semibold text-stage-text">
          <Users size={14} className="text-stage-brand" aria-hidden /> 응시자 128명 대기 중
        </span>
      </div>

      {/* 원형 진행 고리 + 카운트다운 */}
      <div className="relative mt-10 size-[360px]">
        <svg viewBox="0 0 360 360" className="absolute inset-0 -rotate-90" aria-hidden>
          <defs>
            <linearGradient id="wait-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--color-stage-brand)' }} />
              <stop offset="100%" style={{ stopColor: 'var(--color-stage-blue)' }} />
            </linearGradient>
          </defs>
          <circle cx="180" cy="180" r={R} fill="none" stroke="var(--color-stage-line)" strokeWidth="6" />
          <circle
            cx="180"
            cy="180"
            r={R}
            fill="none"
            stroke="url(#wait-ring)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (left / TOTAL_WAIT)}
            style={{ transition: 'stroke-dashoffset 1s linear', filter: 'drop-shadow(0 0 12px color-mix(in srgb, var(--color-stage-brand) 70%, transparent))' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="label text-stage-muted">STARTS IN</span>
          <motion.div
            key={urgent ? left : 'calm'}
            initial={urgent && !reduce ? { scale: scale.pop } : false}
            animate={{ scale: 1 }}
            transition={{ duration: duration.fast }}
            className={cx('tnum font-mono text-[96px] leading-[100px] font-semibold tracking-[-0.04em]', urgent ? 'text-stage-caution' : 'text-stage-text')}
            style={{ textShadow: '0 0 40px color-mix(in srgb, var(--color-stage-brand) 55%, transparent)' }}
            role="timer"
            aria-live="off"
          >
            {mm}:{ss}
          </motion.div>
          <span className="tnum mt-1 font-mono text-[14px] text-stage-muted">시작 {examInfo.start}</span>
        </div>
      </div>

      <RevealGroup className="mt-10 grid w-[880px] grid-cols-4 gap-3">
        {['시험이 시작되면 응시 화면으로 자동 이동합니다.', '브라우저 탭을 벗어나면 이탈로 기록됩니다.', '외부 AI와 검색은 쓸 수 없고, 내장 AI만 쓸 수 있습니다.', '카메라에 얼굴이 계속 보이도록 유지하세요.'].map((t, i) => (
          <RevealItem key={t} className="glass-stage rounded-xl px-4 py-4">
            <span className="font-mono text-[13px] font-semibold text-stage-brand">{String(i + 1).padStart(2, '0')}</span>
            <p className="mt-1 text-[14px] leading-6 text-stage-text">{t}</p>
          </RevealItem>
        ))}
      </RevealGroup>

      <div className="mt-10 flex items-center gap-4">
        <span className="text-[14px] text-stage-muted">프로토타입에서는 바로 시작할 수 있습니다.</span>
        <Magnetic>
          <Button variant="primary" size="lg" onClick={onStart}>
            바로 시작 <ArrowRight size={18} aria-hidden />
          </Button>
        </Magnetic>
      </div>
    </div>
  )
}

export default function Entry() {
  // 입장 링크: /entry?invite=<응시자별 토큰>. 토큰이 없으면 링크 안내만 보여 준다.
  const [params, setParams] = useSearchParams()
  const viaLink = params.has('invite')
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const navigate = useNavigate()
  const next = () => {
    setDir(1)
    setStep((s) => s + 1)
  }
  const back = () => {
    setDir(-1)
    setStep((s) => s - 1)
  }
  const enterByDemoLink = () => {
    setParams({ invite: examInfo.seat })
    setStep(0)
  }
  const waiting = viaLink && step === 3
  const header = (
    <header className={cx('relative z-20 grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-6 px-8', waiting ? 'border-b border-stage-line' : 'glass rounded-none! border-0! border-b! border-line/70! shadow-none!')}>
      <div className="flex items-center gap-4">
        <Logo className={waiting ? 'text-stage-text!' : undefined} />
        <span className={cx('glow inline-flex h-[22px] items-center rounded-sm px-1.5 font-mono text-[12px] font-semibold tracking-[0.08em]', waiting ? 'bg-stage-alert/15 text-stage-alert [--glow:var(--color-stage-alert)]' : 'bg-alert/12 text-alert [--glow:var(--color-alert)]')}>
          LIVE EXAM
        </span>
      </div>
      {viaLink ? <Journey current={step} stage={waiting} /> : <span aria-hidden />}
      <span aria-hidden />
    </header>
  )
  const body = (
    <AnimatePresence mode="wait" custom={dir}>
      <motion.div
        key={viaLink ? step : 'no-link'}
        custom={dir}
        initial={{ opacity: 0, x: dir * 48 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: dir * -48 }}
        transition={{ duration: duration.normal, ease: easing.standard }}
      >
        {!viaLink && <NoLink onDemo={enterByDemoLink} />}
        {viaLink && step === 0 && <InfoStep onNext={next} />}
        {viaLink && step === 1 && <ConsentStep onNext={next} onBack={back} />}
        {viaLink && step === 2 && <EnvStep onNext={next} onBack={back} />}
        {waiting && <WaitingRoom onStart={() => navigate('/exam/live-k7q2mx?mode=live')} />}
      </motion.div>
    </AnimatePresence>
  )
  return (
    <div className={cx('relative isolate flex min-h-full flex-col overflow-x-clip border-t-2', waiting ? 'border-stage-alert' : 'border-alert')}>
      {waiting ? (
        <StageSection shape="inset" className="flex min-h-full flex-1 flex-col rounded-none! border-0! shadow-none!" aria-label="대기실">
          <div className="flex min-h-full flex-col">
            {header}
            <main className="flex flex-1 justify-center px-8 py-12">{body}</main>
          </div>
        </StageSection>
      ) : (
        <>
          <Aurora variant="full" />
          {header}
          <main className="relative z-10 flex flex-1 justify-center px-8 py-12">{body}</main>
        </>
      )}
    </div>
  )
}
