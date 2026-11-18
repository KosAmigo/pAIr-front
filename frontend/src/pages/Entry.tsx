import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Building2,
  CalendarClock,
  Camera,
  Check,
  ChevronDown,
  Eye,
  FileText,
  Globe,
  Hourglass,
  ListChecks,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  Mic,
  MonitorUp,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  Timer,
  Users,
  Video,
  Wifi,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CheckMark } from '../components/CheckMark'
import { cx } from '../components/cx'
import { Button, Logo, StatusDot, type Status } from '../components/ui'
import { Aurora, Glass, GlowBorder, GradientText, Magnetic, Particles, RevealGroup, RevealItem, StageSection } from '../components/fx'
import { examInfo } from '../data/mock'
import { duration, easing, scale, springs, stagger } from '../lib/motion'

// DESIGN.md §7-6 시험 입장 (2026-11-19 개편)
// 입장 방법은 메일로 받은 응시자별 입장 링크(/entry?invite=<토큰>) 하나뿐이다.
// 상단 바 아래 따로 둔 여정 띠(단계 아이콘 4개, 넉넉한 여백) + 1–3단계는 "왼쪽 스포트라이트 + 오른쪽 내용"으로 나뉜 유리 카드.
//   1 입장권(회사, 시험, 시작 시각) │ 2 응시자 카드 + 동의 고리 │ 3 카메라 틀 + 점검 게이지.
// 4단계 대기실: 화면 전체가 스포트라이트. 원형 진행 고리 안의 큰 카운트다운, 마지막 10초는 숫자가 바뀔 때마다 톡 튄다.
// 상단 2px alert 라인은 "실전 영역" 표시로 모든 단계에 유지한다.
const STEPS: { label: string; icon: LucideIcon }[] = [
  { label: '시험 정보', icon: FileText },
  { label: '응시자 정보와 동의', icon: ShieldCheck },
  { label: '환경 점검', icon: ScanFace },
  { label: '대기실', icon: Hourglass },
]
const APPLICANT = examInfo.applicant

/** 여정 띠: 단계 노드 4개(44px, 단계 아이콘)를 잇는 선이 지난 단계까지 그라데이션으로 차오른다. 지금 노드는 맥동 고리 */
function Journey({ current, stage }: { current: number; stage?: boolean }) {
  return (
    <nav aria-label="입장 단계" className="relative z-10 flex justify-center px-8 pt-9 pb-1">
      <ol className="grid w-full max-w-[880px] grid-cols-4">
        {STEPS.map((s, i) => {
          const done = i < current
          const active = i === current
          return (
            <li key={s.label} className="relative flex flex-col items-center gap-3" aria-current={active ? 'step' : undefined}>
              {i > 0 && (
                <span aria-hidden className={cx('absolute top-[21px] right-[calc(50%+32px)] left-[calc(-50%+32px)] h-[3px] overflow-hidden rounded-full', stage ? 'bg-stage-line' : 'bg-line')}>
                  <motion.span
                    className="bg-brand-gradient block h-full origin-left"
                    initial={false}
                    animate={{ scaleX: i <= current ? 1 : 0 }}
                    transition={{ duration: duration.slow, ease: easing.expo }}
                  />
                </span>
              )}
              <span className="relative">
                {active && <span aria-hidden className={cx('rec-pulse absolute -inset-2 rounded-full border-2', stage ? 'border-stage-brand/40' : 'border-brand/35')} />}
                <motion.span
                  animate={{ scale: active ? 1.08 : 1 }}
                  transition={springs.snappy}
                  className={cx(
                    'relative flex size-11 items-center justify-center rounded-full',
                    done && 'bg-brand-gradient text-on-accent shadow-md',
                    active && (stage ? 'glow-stage bg-stage-panel text-stage-brand [--glow:var(--color-stage-brand)]' : 'glow bg-panel text-brand [--glow:var(--color-brand)]'),
                    !done && !active && (stage ? 'border border-stage-line bg-stage-panel text-stage-faint' : 'border border-line-strong bg-panel text-text-faint'),
                  )}
                >
                  {done ? <Check size={20} strokeWidth={2.5} aria-hidden /> : <s.icon size={20} strokeWidth={1.9} aria-hidden />}
                </motion.span>
              </span>
              <span className="flex flex-col items-center gap-0.5 text-center">
                <span className={cx('font-mono text-[11px] font-semibold tracking-[0.08em]', active ? (stage ? 'text-stage-brand' : 'text-brand') : stage ? 'text-stage-faint' : 'text-text-faint')}>
                  STEP {String(i + 1).padStart(2, '0')}
                </span>
                <span className={cx('text-[14px] leading-5 font-semibold whitespace-nowrap', active || done ? (stage ? 'text-stage-text' : 'text-text') : stage ? 'text-stage-muted' : 'text-text-muted')}>
                  {s.label}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** 1–3단계 카드: 왼쪽 스포트라이트(단계 그림) + 오른쪽 큰 단계 번호, 제목, 내용, 아래 버튼 줄 */
function StepCard({ no, title, aside, children, footer }: { no: number; title: string; aside: ReactNode; children: ReactNode; footer: ReactNode }) {
  return (
    <Glass className="grid w-[1040px] max-w-full overflow-hidden rounded-2xl bg-white/85! shadow-lg! lg:grid-cols-[340px_minmax(0,1fr)]">
      <StageSection className="m-3 p-6" aria-label={`${title} 요약`}>
        <div className="flex h-full flex-col">{aside}</div>
      </StageSection>
      <div className="flex min-w-0 flex-col">
        <div className="flex items-end gap-5 px-9 pt-9">
          <span className="font-mono text-[56px] leading-[52px] font-semibold tracking-[-0.04em]">
            <GradientText>{String(no).padStart(2, '0')}</GradientText>
          </span>
          <div className="pb-1">
            <p className="label">STEP {String(no).padStart(2, '0')} / 04</p>
            <h1 className="text-[28px] leading-9 font-bold tracking-[-0.02em] text-text">{title}</h1>
          </div>
        </div>
        <div className="flex-1 px-9 pt-7 pb-8">{children}</div>
        <footer className="flex items-center gap-2 border-t border-line/70 bg-panel/60 px-9 py-5">{footer}</footer>
      </div>
    </Glass>
  )
}

/** 스포트라이트 안의 "입장 링크 확인됨" 칩 */
function LinkChip({ text = '입장 링크 확인됨' }: { text?: string }) {
  return (
    <span className="glass-stage inline-flex h-8 w-fit items-center gap-2 rounded-full px-3 text-[13px] font-semibold text-stage-signal">
      <MailCheck size={15} aria-hidden /> {text}
    </span>
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

// ── 1. 시험 정보: 왼쪽 입장권 + 오른쪽 정보 타일 ─────────────
function EntryPass() {
  return (
    <>
      <LinkChip />
      <p className="label mt-6 text-stage-brand">ENTRY PASS</p>
      <p className="mt-2 text-[14px] font-semibold text-stage-muted">{examInfo.company}</p>
      <p className="mt-1 text-[20px] leading-7 font-bold tracking-[-0.01em] text-stage-text">{examInfo.title}</p>
      {/* 절취선: 양 끝이 파인 점선 */}
      <div aria-hidden className="relative -mx-6 my-6 border-t-2 border-dashed border-stage-line-strong">
        <span className="absolute -top-3 -left-3 size-6 rounded-full bg-white/90" />
        <span className="absolute -top-3 -right-3 size-6 rounded-full bg-white/90" />
      </div>
      <p className="label text-stage-faint">STARTS AT</p>
      <p className="tnum mt-1 font-mono text-[40px] leading-[44px] font-bold tracking-[-0.03em]">
        <GradientText>{examInfo.start.slice(11)}</GradientText>
      </p>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-4">
        <div>
          <p className="label text-stage-faint">DATE</p>
          <p className="tnum mt-1 font-mono text-[14px] font-semibold whitespace-nowrap text-stage-text">{examInfo.start.slice(0, 10)}</p>
        </div>
        <div>
          <p className="label text-stage-faint">DURATION</p>
          <p className="tnum mt-1 font-mono text-[14px] font-semibold text-stage-text">{examInfo.duration}</p>
        </div>
      </div>
      <p className="mt-4 text-[13px] text-stage-muted">
        {APPLICANT.name} │ <span className="font-mono">{APPLICANT.email}</span>
      </p>
      {/* 바코드 띠: 꾸밈 */}
      <div aria-hidden className="mt-auto flex h-14 items-stretch justify-between gap-[3px] pt-6 opacity-70">
        {examInfo.start
          .replace(/\D/g, '')
          .split('')
          .concat('31725846'.split(''))
          .flatMap((d, i) => [Number(d) % 3 === 0 ? 4 : 2, (Number(d) + i) % 2 ? 1 : 3])
          .map((w, i) => (
            <span key={i} className={cx('h-full rounded-[1px]', i % 2 ? 'bg-transparent' : 'bg-stage-text')} style={{ width: w }} />
          ))}
      </div>
    </>
  )
}

function InfoStep({ onNext }: { onNext: () => void }) {
  const rows: [string, string, LucideIcon, boolean?][] = [
    ['COMPANY', examInfo.company, Building2],
    ['EXAM', examInfo.title, FileText],
    ['START', examInfo.start, CalendarClock, true],
    ['DURATION', examInfo.duration, Timer, true],
    ['TASKS', examInfo.tasks, ListChecks],
    ['PROCTORING', examInfo.proctor, Eye],
  ]
  return (
    <StepCard
      no={1}
      title="시험 정보를 확인하세요"
      aside={<EntryPass />}
      footer={
        <Magnetic className="ml-auto">
          <Button variant="primary" size="lg" onClick={onNext}>
            맞습니다 <ArrowRight size={18} aria-hidden />
          </Button>
        </Magnetic>
      }
    >
      <p className="text-[15px] text-text-muted">입장 링크가 확인되었습니다. 아래 시험이 맞는지 확인하세요.</p>
      <RevealGroup as="div" className="mt-4 grid grid-cols-2 gap-3">
        {rows.map(([k, v, Icon, mono]) => (
          <RevealItem key={k} className="flex items-start gap-3 rounded-xl border border-line bg-panel px-4 py-3 shadow-sm">
            <span aria-hidden className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-dim text-brand">
              <Icon size={18} strokeWidth={1.9} />
            </span>
            <span className="min-w-0">
              <span className="label block">{k}</span>
              <span className={cx('mt-0.5 block text-[15px] leading-6 font-semibold text-text', mono && 'tnum font-mono')}>{v}</span>
            </span>
          </RevealItem>
        ))}
      </RevealGroup>
      <p className="mt-5 text-[14px] text-text-muted">
        이 시험은 <span className="font-semibold text-text">복기를 제공하지 않습니다.</span> 제출 후에는 답안을 수정할 수 없습니다.
      </p>
    </StepCard>
  )
}

// ── 2. 응시자 정보·동의: 왼쪽 응시자 카드 + 동의 고리 ──────────
const CONSENTS: { title: string; body: string; icon: LucideIcon }[] = [
  { title: '[필수] 개인정보 수집 및 이용 동의', body: '이름과 이메일을 응시자 확인과 결과 전달 목적으로 수집하며, 시험 종료 후 1년간 보관합니다.', icon: Lock },
  { title: '[필수] 감독을 위한 카메라와 화면 녹화 동의', body: '시험 중 카메라 영상과 화면이 녹화되며, 부정행위 검토 목적으로만 기업 담당자에게 제공됩니다.', icon: Video },
  { title: '[필수] AI 대화 기록 평가 활용 동의', body: '내장 AI와의 대화 전체가 AI 활용 역량 평가 근거로 사용됩니다.', icon: Bot },
]

/** 동의 고리: 동의한 수만큼 원이 그라데이션으로 찬다 */
function ConsentRing({ n, total }: { n: number; total: number }) {
  const R = 46
  const C = 2 * Math.PI * R
  return (
    <div className="relative size-[120px] shrink-0">
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="consent-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--color-stage-brand)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--color-stage-blue)' }} />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-stage-line)" strokeWidth="8" />
        <motion.circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke="url(#consent-ring)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={false}
          animate={{ strokeDashoffset: C * (1 - n / total) }}
          transition={{ duration: duration.slow, ease: easing.expo }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum font-mono text-[30px] leading-8 font-bold text-stage-text">
          {n}
          <span className="text-[16px] text-stage-faint">/{total}</span>
        </span>
        <span className="text-[12px] font-semibold text-stage-muted">동의</span>
      </div>
    </div>
  )
}

function ApplicantCard({ agreed }: { agreed: number }) {
  return (
    <>
      <LinkChip />
      <div className="mt-6 flex items-center gap-4">
        <span aria-hidden className="bg-brand-gradient inline-flex size-16 items-center justify-center rounded-2xl text-[28px] font-bold text-on-accent shadow-md">
          {APPLICANT.name.slice(1, 2)}
        </span>
        <div className="min-w-0">
          <p className="label text-stage-brand">APPLICANT</p>
          <p className="text-[22px] leading-8 font-bold text-stage-text">{APPLICANT.name}</p>
        </div>
      </div>
      <dl className="mt-5 flex flex-col gap-3">
        <div>
          <dt className="label text-stage-faint">EMAIL</dt>
          <dd className="mt-0.5 truncate font-mono text-[14px] text-stage-text">{APPLICANT.email}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[12px] leading-5 text-stage-muted">입장 링크로 확인된 정보입니다. 수정이 필요하면 기업 담당자에게 문의하세요.</p>
      <div className="mt-auto flex items-center gap-4 pt-6">
        <ConsentRing n={agreed} total={CONSENTS.length} />
        <p className="text-[13px] leading-5 break-keep text-stage-muted">필수 동의 {CONSENTS.length}개에 모두 동의해야 다음 단계로 갈 수 있습니다.</p>
      </div>
    </>
  )
}

function ConsentStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [checked, setChecked] = useState([false, false, false])
  const [open, setOpen] = useState<number | null>(null)
  const all = checked.every(Boolean)
  const agreed = checked.filter(Boolean).length
  return (
    <StepCard
      no={2}
      title="응시자 정보와 동의"
      aside={<ApplicantCard agreed={agreed} />}
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft size={18} aria-hidden /> 이전
          </Button>
          <span className="ml-auto text-[14px] text-text-muted">
            <span className="tnum font-mono font-semibold text-text">{agreed}</span> / 3 동의
          </span>
          <Button variant="primary" size="lg" disabled={!all} onClick={onNext}>
            다음 <ArrowRight size={18} aria-hidden />
          </Button>
        </>
      }
    >
      <label className={cx('flex h-16 cursor-pointer items-center gap-3 rounded-xl border-2 px-5 transition-colors duration-150', all ? 'border-brand bg-brand-dim' : 'border-line bg-panel hover:border-line-strong')}>
        <input type="checkbox" checked={all} onChange={(e) => setChecked(checked.map(() => e.target.checked))} className="sr-only" />
        <CheckMark on={all} />
        <span className="text-[17px] font-bold text-text">전체 동의</span>
        <span className="ml-auto text-[13px] text-text-muted">아래 필수 항목 3개에 한 번에 동의합니다</span>
      </label>
      <ul className="mt-3 flex flex-col gap-2">
        {CONSENTS.map((c, i) => (
          <li key={c.title} className={cx('rounded-xl border bg-panel transition-colors duration-150', checked[i] ? 'border-brand/50' : 'border-line')}>
            <div className="flex h-14 items-center gap-3 px-4">
              <label htmlFor={`consent-${i}`} className="flex flex-1 cursor-pointer items-center gap-3 text-[15px]">
                <input
                  id={`consent-${i}`}
                  type="checkbox"
                  checked={checked[i]}
                  onChange={(e) => setChecked(checked.map((v, j) => (j === i ? e.target.checked : v)))}
                  className="sr-only"
                />
                <CheckMark on={checked[i]} />
                <span aria-hidden className={cx('inline-flex size-8 items-center justify-center rounded-lg transition-colors duration-150', checked[i] ? 'bg-brand-dim text-brand' : 'bg-panel-raised text-text-muted')}>
                  <c.icon size={16} strokeWidth={1.9} />
                </span>
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
            {open === i && <p className="fade-in px-[92px] pb-3 text-[14px] leading-5 text-text-muted">{c.body}</p>}
          </li>
        ))}
      </ul>
    </StepCard>
  )
}

// ── 3. 환경 점검: 왼쪽 카메라 틀 + 점검 게이지, 오른쪽 항목이 위에서부터 하나씩 확인된다 ──
const CHECKS: { key: string; label: string; detail: string; icon: typeof Camera }[] = [
  { key: 'cam', label: '카메라', detail: 'FaceTime HD Camera', icon: Camera },
  { key: 'mic', label: '마이크', detail: '내장 마이크, 입력 감지됨', icon: Mic },
  { key: 'screen', label: '화면 공유', detail: '전체 화면 공유 필요', icon: MonitorUp },
  { key: 'browser', label: '브라우저', detail: 'Chrome 131, 지원됨', icon: Globe },
  { key: 'network', label: '네트워크', detail: '42 Mbps, 지연 18ms', icon: Wifi },
]
const RESULT: Record<string, Status> = { cam: 'ok', mic: 'ok', screen: 'check', browser: 'ok', network: 'ok' }

function CameraFrame({ states, allOk }: { states: (Status | 'run')[]; allOk: boolean }) {
  const ok = states.filter((s) => s === 'ok').length
  return (
    <>
      <p className="label text-stage-brand">CAMERA PREVIEW</p>
      {/* 카메라 미리보기 자리: 네 귀퉁이 틀 + 얼굴 안내 타원 + 훑는 빛 */}
      <div className="relative mt-3 aspect-[4/3] overflow-hidden rounded-xl border border-stage-line bg-stage-raised">
        <span aria-hidden className="env-scan pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-transparent via-stage-brand/20 to-transparent [--scan-h:220px]" />
        {(['top-3 left-3 border-t-2 border-l-2', 'top-3 right-3 border-t-2 border-r-2', 'bottom-3 left-3 border-b-2 border-l-2', 'bottom-3 right-3 border-b-2 border-r-2'] as const).map((c) => (
          <span key={c} aria-hidden className={cx('absolute size-5 rounded-[3px]', c, allOk ? 'border-stage-signal' : 'border-stage-brand')} />
        ))}
        <span aria-hidden className={cx('absolute top-1/2 left-1/2 h-[64%] w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed', allOk ? 'border-stage-signal/70' : 'border-stage-brand/50')} />
        <span className="absolute inset-x-0 bottom-3 text-center text-[12px] font-semibold text-stage-muted">얼굴이 타원 안에 오도록 앉아 주세요</span>
      </div>
      <div className="mt-auto pt-6">
        <div className="flex items-baseline justify-between">
          <p className="label text-stage-faint">CHECKS</p>
          <p className="tnum font-mono text-[22px] font-bold text-stage-text">
            {ok}
            <span className="text-[14px] text-stage-faint">/{CHECKS.length}</span>
          </p>
        </div>
        {/* 항목마다 한 칸: 정상 signal, 확인 필요 caution, 확인 중 흐림 */}
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {states.map((s, i) => (
            <span key={i} className="h-2 flex-1 overflow-hidden rounded-full bg-stage-line">
              <motion.span
                className={cx('block h-full origin-left', s === 'ok' ? 'bg-stage-signal' : s === 'check' ? 'bg-stage-caution' : 'bg-stage-line')}
                initial={false}
                animate={{ scaleX: s === 'run' ? 0 : 1 }}
                transition={{ duration: duration.normal, ease: easing.expo }}
              />
            </span>
          ))}
        </div>
        <p className={cx('mt-3 flex items-center gap-1.5 text-[13px] font-semibold', allOk ? 'text-stage-signal' : 'text-stage-muted')}>
          {allOk ? <Check size={15} strokeWidth={2.5} aria-hidden /> : <Loader2 size={15} className={cx(states.includes('run') && 'animate-spin')} aria-hidden />}
          {allOk ? '응시 준비 완료' : states.includes('run') ? '점검하는 중' : '확인이 필요한 항목이 있습니다'}
        </p>
      </div>
    </>
  )
}

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
  const states = CHECKS.map((c, i) => statusOf(c.key, i))
  const allOk = done >= CHECKS.length && states.every((s) => s === 'ok')
  return (
    <StepCard
      no={3}
      title="응시 환경을 점검합니다"
      aside={<CameraFrame states={states} allOk={allOk} />}
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
      {/* 모든 항목이 정상이 되는 순간 한 번 터진다 */}
      <Particles fire={allOk && !reduce} origin={{ x: 0.3, y: 0.55 }} />
      <ul className="flex flex-col gap-2">
        {CHECKS.map((c, i) => {
          const st = states[i]
          return (
            <motion.li
              key={c.key}
              initial={reduce ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: duration.normal, ease: easing.expo, delay: i * stagger.normal }}
              className={cx(
                'flex h-16 items-center gap-3 rounded-xl border bg-panel px-4 transition-colors duration-200',
                st === 'ok' ? 'border-signal/30' : st === 'check' ? 'border-caution/40 bg-caution/5' : 'border-line',
              )}
            >
              <span
                aria-hidden
                className={cx(
                  'inline-flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-200',
                  st === 'ok' ? 'bg-signal/10 text-signal' : st === 'check' ? 'bg-caution/12 text-caution' : 'bg-panel-raised text-text-muted',
                )}
              >
                <c.icon size={20} strokeWidth={1.75} />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="text-[15px] leading-5 font-semibold">{c.label}</span>
                <span className="truncate text-[13px] leading-5 text-text-muted">{c.detail}</span>
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
            </motion.li>
          )
        })}
      </ul>
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
    setParams({ invite: 'demo' })
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
      <span aria-hidden />
      {viaLink ? (
        <span className={cx('justify-self-end truncate text-[13px] font-medium', waiting ? 'text-stage-muted' : 'text-text-muted')}>
          {examInfo.company} │ {examInfo.title}
        </span>
      ) : (
        <span aria-hidden />
      )}
    </header>
  )
  const journey = viaLink ? <Journey current={step} stage={waiting} /> : null
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
            {journey}
            <main className="flex flex-1 justify-center px-8 py-10">{body}</main>
          </div>
        </StageSection>
      ) : (
        <>
          <Aurora variant="full" />
          {header}
          {journey}
          <main className="relative z-10 flex flex-1 justify-center px-8 py-10">{body}</main>
        </>
      )}
    </div>
  )
}
