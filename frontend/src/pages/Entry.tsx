import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  Eye,
  FileText,
  Hourglass,
  ListChecks,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  ScanFace,
  ShieldCheck,
  Timer,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CheckMark } from '../components/CheckMark'
import { cx } from '../components/cx'
import { Button, Logo } from '../components/ui'
import { Aurora, Glass, GlowBorder, GradientText, Magnetic, RevealGroup, RevealItem, StageSection } from '../components/fx'
import { duration, easing, scale, springs } from '../lib/motion'
import { enterFullscreen, useFullscreen } from '../lib/fullscreen'
import { proctorApi, serverOffsetFrom, type EntryInfo } from '../proctor/api/proctorApi.ts'
import { camHub, channelUp } from '../proctor/camHub.ts'
import { CHANNEL_LABEL, allUp, missingChannels } from '../proctor/core/connectionPolicy.ts'
import { ScreenShareCard } from '../proctor/react/ScreenShareCard.tsx'
import { saveLiveExam } from '../proctor/liveExam.ts'
import { checksSkipped } from '../proctor/testSkip.ts'
import { PHONE_CAM_ENABLED, SCREEN_SHARE_ENABLED } from '../proctor/features.ts'
import { useCamHub } from '../proctor/react/useCamHub.ts'
import { useEnvProgressUpload } from '../proctor/react/useEnvProgressUpload.ts'
import NoticeBanner from '../proctor/react/NoticeBanner.tsx'
import type { EnvCheckResult } from '../proctor/react/EnvCheckPanel.tsx'

// 환경 점검은 분석 모델이 무거워 실전 입장 링크로 들어왔을 때만 불러온다
const EnvCheckPanel = lazy(() => import('../proctor/react/EnvCheckPanel.tsx'))
const EnvAside = lazy(() => import('../proctor/react/EnvCheckPanel.tsx').then((m) => ({ default: m.EnvAside })))

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
/** 화면에 보이는 시험 정보. 입장 API(proctorApi.entry)로 받은 값으로 채운다 */
type ExamView = { company: string; title: string; start: string; duration: string; tasks: string; proctor: string; applicant: { name: string; email: string } }

const pad = (n: number) => String(n).padStart(2, '0')
/** 응시자 PC 의 현지 시각으로 "2026.12.01 15:00" */
function fmtStart(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toView(info: EntryInfo): ExamView {
  const minutes = Math.round((Date.parse(info.endsAt) - Date.parse(info.startsAt)) / 60000)
  const n = info.taskIds.length
  return {
    company: info.companyName ?? '',
    title: info.sessionTitle,
    start: fmtStart(info.startsAt),
    duration: `${minutes}분`,
    tasks: `과제 ${n}개${n > 1 ? ' (자유롭게 오가며 풀기)' : ''} + 과제마다 후속 질문`,
    proctor: info.proctoring ? '카메라(노트북), 브라우저 이탈 감지' : '브라우저 이탈 감지',
    applicant: { name: info.name, email: info.email },
  }
}

/** 여정 띠: 단계 노드 4개(44px, 단계 아이콘)를 잇는 선이 지난 단계까지 그라데이션으로 차오른다. 지금 노드는 맥동 고리 */
function Journey({ current, stage }: { current: number; stage?: boolean }) {
  return (
    <nav aria-label="입장 단계" className="relative z-10 flex justify-center px-8 pt-[clamp(12px,3.5vh,36px)] pb-1">
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
function NoLink() {
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
    </Glass>
  )
}

// ── 1. 시험 정보: 왼쪽 입장권 + 오른쪽 정보 타일 ─────────────
function EntryPass({ view }: { view: ExamView }) {
  return (
    <>
      <LinkChip />
      <p className="label mt-6 text-stage-brand">ENTRY PASS</p>
      <p className="mt-2 text-[14px] font-semibold text-stage-muted">{view.company}</p>
      <p className="mt-1 text-[20px] leading-7 font-bold tracking-[-0.01em] text-stage-text">{view.title}</p>
      {/* 절취선: 양 끝이 파인 점선 */}
      <div aria-hidden className="relative -mx-6 my-6 border-t-2 border-dashed border-stage-line-strong">
        <span className="absolute -top-3 -left-3 size-6 rounded-full bg-white/90" />
        <span className="absolute -top-3 -right-3 size-6 rounded-full bg-white/90" />
      </div>
      <p className="label text-stage-faint">STARTS AT</p>
      <p className="tnum mt-1 font-mono text-[40px] leading-[44px] font-bold tracking-[-0.03em]">
        <GradientText>{view.start.slice(11)}</GradientText>
      </p>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-4">
        <div>
          <p className="label text-stage-faint">DATE</p>
          <p className="tnum mt-1 font-mono text-[14px] font-semibold whitespace-nowrap text-stage-text">{view.start.slice(0, 10)}</p>
        </div>
        <div>
          <p className="label text-stage-faint">DURATION</p>
          <p className="tnum mt-1 font-mono text-[14px] font-semibold text-stage-text">{view.duration}</p>
        </div>
      </div>
      <p className="mt-4 text-[13px] text-stage-muted">
        {view.applicant.name} │ <span className="font-mono">{view.applicant.email}</span>
      </p>
      {/* 바코드 띠: 꾸밈 */}
      <div aria-hidden className="mt-auto flex h-14 items-stretch justify-between gap-[3px] pt-6 opacity-70">
        {view.start
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

function InfoStep({ view, onNext }: { view: ExamView; onNext: () => void }) {
  const rows: [string, string, LucideIcon, boolean?][] = [
    ['COMPANY', view.company, Building2],
    ['EXAM', view.title, FileText],
    ['START', view.start, CalendarClock, true],
    ['DURATION', view.duration, Timer, true],
    ['TASKS', view.tasks, ListChecks],
    ['PROCTORING', view.proctor, Eye],
  ]
  return (
    <StepCard
      no={1}
      title="시험 정보를 확인하세요"
      aside={<EntryPass view={view} />}
      footer={
        <Magnetic className="ml-auto">
          <Button variant="primary" size="lg" onClick={onNext}>
            맞습니다 <ArrowRight size={18} aria-hidden />
          </Button>
        </Magnetic>
      }
    >
      <p className="text-[15px] text-text-muted">입장 링크가 확인되었습니다. 아래 시험이 맞는지 확인하세요.</p>
      <p className="mt-2 rounded-lg border border-caution/40 bg-caution/10 px-3 py-2 text-[14px] leading-6 break-keep text-text">
        시험 중 창이 닫히거나 연결이 끊겨도 5분 안에는 같은 링크로 다시 들어올 수 있습니다. 5분이 지나면 링크가 만료되어 입장할 수 없고, 끊긴 기록은 감독 기록에 남습니다. 시작하기 전에 네트워크와 기기를 확인해 주세요.
      </p>
      <p className="mt-2 rounded-lg border border-line bg-panel-raised px-3 py-2 text-[14px] leading-6 break-keep text-text">
        시험 종료 시각은 모든 응시자가 같습니다. 늦게 시작하면 그만큼 시험 시간이 줄어드니, 시작 시각에 맞춰 입장해 주세요.
      </p>
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
  { title: '[필수] 카메라 감독 동의', body: '시험 중 노트북·휴대폰 카메라 영상은 이 브라우저 안에서만 분석하며 연속으로 녹화하거나 저장하지 않습니다. 이상이 감지되면 그 순간 앞 8초·뒤 4초 사이의 사진(최대 24장)만 부정행위 검토 목적으로 기업 담당자에게 제공합니다. 사진은 시험 종료 7일 뒤 삭제하며, 기업 담당자는 삭제 2일 전부터 7일씩 최대 2번 보관을 연장할 수 있어 최대 21일까지 보관될 수 있습니다. 얼굴로 신원을 식별하지 않습니다.', icon: Video },
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

function ApplicantCard({ view, agreed }: { view: ExamView; agreed: number }) {
  return (
    <>
      <LinkChip />
      <div className="mt-6 flex items-center gap-4">
        <span aria-hidden className="bg-brand-gradient inline-flex size-16 items-center justify-center rounded-2xl text-[28px] font-bold text-on-accent shadow-md">
          {view.applicant.name.slice(1, 2)}
        </span>
        <div className="min-w-0">
          <p className="label text-stage-brand">APPLICANT</p>
          <p className="text-[22px] leading-8 font-bold text-stage-text">{view.applicant.name}</p>
        </div>
      </div>
      <dl className="mt-5 flex flex-col gap-3">
        <div>
          <dt className="label text-stage-faint">EMAIL</dt>
          <dd className="mt-0.5 truncate font-mono text-[14px] text-stage-text">{view.applicant.email}</dd>
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

function ConsentStep({ view, busy, error, onNext, onBack }: { view: ExamView; busy?: boolean; error?: string | null; onNext: () => void; onBack: () => void }) {
  const [checked, setChecked] = useState([false, false, false])
  const [open, setOpen] = useState<number | null>(null)
  const all = checked.every(Boolean)
  const agreed = checked.filter(Boolean).length
  return (
    <StepCard
      no={2}
      title="응시자 정보와 동의"
      aside={<ApplicantCard view={view} agreed={agreed} />}
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft size={18} aria-hidden /> 이전
          </Button>
          <span className="ml-auto text-[14px] text-text-muted">
            <span className="tnum font-mono font-semibold text-text">{agreed}</span> / 3 동의
          </span>
          <Button variant="primary" size="lg" disabled={!all || busy} onClick={onNext}>
            {busy && <Loader2 size={18} className="animate-spin" aria-hidden />} 다음 <ArrowRight size={18} aria-hidden />
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-alert/40 bg-alert/10 px-3 py-2 text-[14px] text-alert">
          {error}
        </p>
      )}
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

// ── 3. 환경 점검 (실제 입장 링크): 왼쪽 카메라, 오른쪽 실제 점검 목록 ──
function LiveEnvStep({ invite, onNext, onBack }: { invite: string; onNext: () => void; onBack: () => void }) {
  const [saving, setSaving] = useState(false)
  const uploadProgress = useEnvProgressUpload(invite)
  const [error, setError] = useState<string | null>(null)
  const save = async (r: EnvCheckResult) => {
    // 버튼을 누른 직후여야 전체 화면이 허용된다 (대기실 → 시험 화면까지 이어진다)
    enterFullscreen()
    // 웹캠이 연결돼야 다음으로 간다 (휴대폰 캠·화면 공유는 꺼져 있어 요구하지 않는다) (테스트용 "점검 건너뛰기"를 고른 응시는 예외)
    const missing = checksSkipped() ? [] : missingChannels(channelUp(camHub.getState()))
    if (missing.length) {
      setError(`${missing.map((c) => CHANNEL_LABEL[c]).join(', ')} 연결이 필요합니다. 연결한 뒤 다시 눌러 주세요.`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      // 점검 결과(휴대폰 결과·검토 필요 표시 포함)를 동의와 함께 저장한다. 사진은 저장하지 않는다
      await proctorApi.consent(invite, r)
      onNext()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  const loading = <p className="text-[14px] text-stage-muted">점검 화면을 불러오는 중입니다</p>
  return (
    <StepCard
      no={3}
      title="응시 환경을 점검합니다"
      aside={
        <>
          <p className="label mb-3 text-stage-brand">CAMERA</p>
          <Suspense fallback={loading}>
            <EnvAside />
          </Suspense>
          {SCREEN_SHARE_ENABLED && (
            <div className="mt-3">
              <ScreenShareCard />
            </div>
          )}
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft size={18} aria-hidden /> 이전
          </Button>
          <span className="ml-auto text-[14px] text-text-muted">{saving ? '점검 결과를 저장하는 중' : '응시 환경은 AI 모델이 판단하므로 오류가 표시될 수 있습니다. 환경이 올바르게 갖춰졌다면 "점검 결과 저장"을 눌러 대기실로 입장하고 시험에 응시해 주세요.'}</span>
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-alert/40 bg-alert/10 px-3 py-2 text-[14px] text-alert">
          {error}
        </p>
      )}
      <Suspense fallback={loading}>
        <EnvCheckPanel withAside={false} onPassed={(r) => void save(r)} onProgress={uploadProgress} />
      </Suspense>
    </StepCard>
  )
}

// ── 4. 대기실: 다크 무대 ─────────────────────
const START_RETRY_MS = 1000
const TIP_INTERVAL_MS = 5000
type WaitTip = { text: string; proctoringOnly?: boolean }
const WAIT_TIPS: WaitTip[] = [
  { text: '시험이 시작되면 응시 화면으로 자동 이동합니다. 이 화면을 닫지 마세요.' },
  { text: '시험 중 창이 닫히거나 연결이 끊겨도 5분 안에는 같은 링크로 다시 들어올 수 있습니다. 5분이 지나면 링크가 만료되고, 끊긴 기록은 감독 기록에 남습니다.' },
  { text: '시험 중에는 전체 화면을 유지해 주세요.', proctoringOnly: true },
  { text: '다른 탭이나 창으로 이동하거나 창 전환 키(Alt+Tab, Win 키)를 누르면 이탈로 기록됩니다.', proctoringOnly: true },
  { text: '외부 AI와 검색은 쓸 수 없고, 시험 화면의 내장 AI만 쓸 수 있습니다.' },
  { text: '카메라에 얼굴이 계속 보이도록 유지하세요.', proctoringOnly: true },
  { text: '외부에서 복사한 내용을 붙여 넣으면 기록됩니다.', proctoringOnly: true },
  { text: '종료 시각이 되면 작업한 내용이 자동으로 제출됩니다.' },
  { text: '제출하면 파일과 AI 대화가 잠기고, 이어서 후속 질문 3개에 답합니다.' },
  { text: '시험 화면에 들어가면 각 영역을 설명하는 안내가 나옵니다. 위쪽 도움말(?) 버튼으로 다시 볼 수 있습니다.' },
]

/** 대기실 안내 문구: 일정 간격으로 하나씩 바꿔 보여 준다 */
function RotatingTips({ proctoring }: { proctoring: boolean }) {
  const reduce = useReducedMotion()
  const tips = WAIT_TIPS.filter((t) => proctoring || !t.proctoringOnly)
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setIndex((i) => (i + 1) % tips.length), TIP_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [tips.length])
  const tip = tips[index % tips.length]
  return (
    <div className="glass-stage mt-[clamp(12px,3vh,40px)] flex min-h-[84px] w-[880px] items-center gap-5 rounded-xl px-6 py-4" role="status" aria-live="off">
      <span className="tnum shrink-0 font-mono text-[13px] font-semibold text-stage-brand">
        TIP {String(index + 1).padStart(2, '0')} / {String(tips.length).padStart(2, '0')}
      </span>
      <div className="relative min-h-[28px] flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={index}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={{ duration: duration.normal, ease: easing.standard }}
            className="text-[16px] leading-7 break-keep text-stage-text"
          >
            {tip.text}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="flex shrink-0 gap-1.5" aria-hidden>
        {tips.map((t, i) => (
          <i key={t.text} className={cx('size-1.5 rounded-full transition-colors', i === index ? 'bg-stage-brand' : 'bg-stage-line')} />
        ))}
      </div>
    </div>
  )
}

function StageChip({ children }: { children: ReactNode }) {
  return <span className="glass-stage inline-flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-semibold text-stage-text">{children}</span>
}

function Dot({ ok }: { ok: boolean }) {
  return <i className={cx('size-2 rounded-full', ok ? 'bg-stage-signal' : 'bg-stage-caution')} aria-hidden />
}

/** 대기실 화면: 원형 진행 고리 + 카운트다운. 시각 계산은 감싸는 쪽(데모·실전)이 한다 */
function WaitingStage({ view, left, total, chips, footer, proctoring }: { view: ExamView; left: number; total: number; chips: ReactNode; footer: ReactNode; proctoring: boolean }) {
  const reduce = useReducedMotion()
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  const R = 150
  const C = 2 * Math.PI * R
  const urgent = left <= 10
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-3">{chips}</div>

      {/* 원형 진행 고리 + 카운트다운 */}
      <div className="relative mt-[clamp(12px,3vh,40px)] size-[clamp(220px,40vh,360px)]">
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
            strokeDashoffset={C * Math.min(1, left / Math.max(1, total))}
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
            className={cx('tnum font-mono text-[clamp(56px,10.5vh,96px)] leading-none font-semibold tracking-[-0.04em]', urgent ? 'text-stage-caution' : 'text-stage-text')}
            style={{ textShadow: '0 0 40px color-mix(in srgb, var(--color-stage-brand) 55%, transparent)' }}
            role="timer"
            aria-live="off"
          >
            {mm}:{ss}
          </motion.div>
          <span className="tnum mt-1 font-mono text-[14px] text-stage-muted">시작 {view.start}</span>
        </div>
      </div>

      <RotatingTips proctoring={proctoring} />

      <div className="mt-[clamp(12px,3vh,40px)] flex items-center gap-4">{footer}</div>
    </div>
  )
}

const secondsUntil = (atMs: number, offsetMs: number) => Math.max(0, Math.ceil((atMs - (Date.now() + offsetMs)) / 1000))

/**
 * 실제 대기실: 서버 시각 기준으로 시작 시각까지 센다. 시작 시각이 되면 시작 API 를 부르고 응시 화면으로 간다.
 * PC 시계가 서버보다 빨라 "아직 시작 시각이 아닙니다"가 오면 1초 뒤 다시 부른다 (판단은 서버만 한다).
 */
function LiveWaitingRoom({ invite, info, offsetMs, view }: { invite: string; info: EntryInfo; offsetMs: number; view: ExamView }) {
  const navigate = useNavigate()
  const cam = useCamHub()
  const startsAt = Date.parse(info.startsAt)
  const [left, setLeft] = useState(() => secondsUntil(startsAt, offsetMs))
  const [total] = useState(() => Math.max(60, secondsUntil(startsAt, offsetMs)))
  const [error, setError] = useState<string | null>(null)
  const starting = useRef(false)
  const fullscreen = useFullscreen()
  // 감독 회차는 세 채널이 모두 연결돼야 응시를 시작한다 (대기실에서 끊기면 다시 연결할 때까지 기다린다)
  // (테스트용 "점검 건너뛰기"를 고른 응시는 카메라 없이 시험 화면을 확인하려는 것이라 예외)
  const channelsReady = !info.proctoring || checksSkipped() || allUp(channelUp(cam))

  useEffect(() => {
    if (info.startedAt) return // 같은 탭에서 이어 들어온 경우: 이미 입장해 있다
    proctorApi.enter(invite).catch((e: Error) => setError(e.message))
  }, [invite, info.startedAt])

  // 새로 고침하거나 링크로 다시 들어오면(이미 시작한 응시자는 바로 이 대기실로 온다) 웹캠 연결이 사라진다.
  // 웹캠은 환경 점검 화면과 응시 화면에서만 열리므로, 여기서도 다시 열어 둔다. 그래야 "웹캠이 연결되면 시작합니다"에서 멈추지 않는다.
  // 실패하면 허브가 오류를 갖고 있고, 아래에서 "웹캠 다시 연결"로 다시 시도할 수 있다.
  useEffect(() => {
    if (!info.proctoring || checksSkipped()) return
    camHub.openCamera().catch(() => undefined)
  }, [info.proctoring])

  useEffect(() => {
    const id = window.setInterval(() => setLeft(secondsUntil(startsAt, offsetMs)), 250)
    return () => window.clearInterval(id)
  }, [startsAt, offsetMs])

  useEffect(() => {
    if (left > 0 || !channelsReady || starting.current) return
    starting.current = true
    let alive = true
    let retryTimer: number | undefined
    const tryStart = async () => {
      try {
        const next = await proctorApi.start(invite)
        if (!alive) return
        const first = next.taskIds.map((t) => next.attempts[t]).find(Boolean)
        if (!first) throw new Error('응시를 만들지 못했습니다. 기업 담당자에게 문의해 주세요.')
        saveLiveExam({
          invite,
          title: next.sessionTitle,
          startsAt: next.startsAt,
          endsAt: next.endsAt,
          proctoring: next.proctoring,
          attempts: next.attempts,
          serverOffsetMs: offsetMs,
        })
        navigate(`/exam/${encodeURIComponent(first)}?mode=live`, { replace: true })
      } catch (e) {
        if (!alive) return
        const message = e instanceof Error ? e.message : String(e)
        if (message.includes('아직 시작 시각이 아닙니다')) retryTimer = window.setTimeout(() => void tryStart(), START_RETRY_MS)
        else setError(message)
      }
    }
    void tryStart()
    return () => {
      alive = false
      window.clearTimeout(retryTimer)
      // 효과가 정리된 뒤 다시 돌면(개발 StrictMode 의 이중 실행, 연결 상태 변화) 시작을 다시 시도해야 한다.
      // 여기서 풀지 않으면 첫 요청의 결과는 버려지고 두 번째 실행은 "이미 시작함"으로 건너뛰어 영영 멈춘다.
      // 서버는 두 번 불러도 응시를 한 번만 만든다(대상자 행 잠금).
      starting.current = false
    }
  }, [left, invite, offsetMs, navigate, channelsReady])

  const chips = info.proctoring ? (
    <>
      <StageChip>
        <Dot ok={cam.camera === 'ready'} /> 카메라 {cam.camera === 'ready' ? '정상' : '확인 필요'}
      </StageChip>
      {PHONE_CAM_ENABLED && (
        <StageChip>
          <Dot ok={cam.phone === 'connected'} /> 휴대폰 캠 {cam.phone === 'connected' ? '연결됨' : '미연결'}
        </StageChip>
      )}
      {SCREEN_SHARE_ENABLED && (
        <StageChip>
          <Dot ok={cam.screen === 'sharing'} /> 화면 공유 {cam.screen === 'sharing' ? '공유 중' : '미연결'}
        </StageChip>
      )}
    </>
  ) : (
    <StageChip>
      <Dot ok /> 입장 완료
    </StageChip>
  )
  const camError = info.proctoring && !checksSkipped() && cam.camera === 'error' ? (cam.error ?? '웹캠을 열지 못했습니다.') : null
  const footer = error || camError ? (
    <div className="flex flex-col items-center gap-2">
      <p role="alert" className="text-[14px] text-stage-alert">
        {error ?? camError}
      </p>
      {!error && camError && (
        <Button variant="ghost" size="sm" className="border border-stage-line text-stage-text!" onClick={() => void camHub.reconnectWebcam().catch(() => undefined)}>
          웹캠 다시 연결
        </Button>
      )}
    </div>
  ) : (
    <span className="text-[14px] text-stage-muted">{left <= 0 && !channelsReady ? '웹캠이 연결되면 시험을 시작합니다.' : left > 0 ? '시작 시각이 되면 자동으로 시작합니다. 이 화면을 닫지 마세요.' : '시험을 시작하는 중입니다'}</span>
  )
  const extras = (
    <>
      {info.proctoring && !fullscreen && (
        <Button variant="ghost" size="sm" className="border border-stage-line text-stage-text!" onClick={enterFullscreen}>
          전체 화면 켜기
        </Button>
      )}
      {SCREEN_SHARE_ENABLED && info.proctoring && cam.screen !== 'sharing' && (
        <div className="w-full max-w-[420px] text-text">
          <ScreenShareCard compact />
        </div>
      )}
    </>
  )
  return (
    <>
      <WaitingStage view={view} left={left} total={total} chips={chips} footer={<>{footer}{extras}</>} proctoring={info.proctoring} />
    </>
  )
}

// ── 실제 입장 링크: 입장 정보 불러오기 ──
type LiveEntry = { status: 'loading' | 'ok' | 'error'; info?: EntryInfo; offsetMs: number; error?: string }

function useLiveEntry(invite: string | null): LiveEntry {
  const [state, setState] = useState<LiveEntry>({ status: 'loading', offsetMs: 0 })
  useEffect(() => {
    if (!invite) return
    let alive = true
    const requestedAt = Date.now()
    proctorApi
      .entry(invite)
      .then((info) => {
        if (!alive) return
        const offsetMs = serverOffsetFrom(info.serverNow, requestedAt)
        setState({ status: 'ok', info, offsetMs })
      })
      .catch((e: Error) => {
        if (alive) setState({ status: 'error', offsetMs: 0, error: e.message })
      })
    return () => {
      alive = false
    }
  }, [invite])
  return state
}

function EntryNotice({ title, body }: { title: string; body: string }) {
  return (
    <Glass className="w-[640px] rounded-2xl bg-white/85! p-12 text-center shadow-lg!">
      <h1 className="text-[26px] leading-9 font-bold tracking-[-0.02em] text-text">{title}</h1>
      <p className="mt-4 text-[16px] leading-7 break-keep text-text-muted">{body}</p>
    </Glass>
  )
}

function noticeFor(live: LiveEntry): ReactNode {
  const info = live.info
  if (live.status === 'loading') return <EntryNotice title="입장 링크를 확인하는 중입니다" body="잠시만 기다려 주세요." />
  if (live.status === 'error') return <EntryNotice title="입장할 수 없습니다" body={`${live.error ?? ''} 메일의 입장 링크를 다시 확인하거나 기업 담당자에게 문의하세요.`} />
  if (info?.submittedAt) return <EntryNotice title="이미 제출한 시험입니다" body="결과는 기업에서 직접 안내합니다. 수고하셨습니다." />
  if (info?.phase === 'ENDED') return <EntryNotice title="시험 시간이 끝났습니다" body="종료 시각이 지나 더 이상 입장할 수 없습니다." />
  // 시험 중 연결이 끊긴 뒤 유예(5분) 안에 돌아오지 못한 경우
  if (info?.linkExpired) {
    return <EntryNotice title="입장 링크가 만료되었습니다" body="시험 중 연결이 끊긴 뒤 유예 시간(5분) 안에 돌아오지 못해 이 링크로는 더 이상 입장할 수 없습니다. 이 기록은 감독 기록에 남았습니다. 기업 담당자에게 문의해 주세요." />
  }
  return null
}

export default function Entry() {
  // 입장 링크: /entry?invite=<응시자별 토큰>. 토큰이 없으면 링크 안내만 보여 준다
  const [params] = useSearchParams()
  const invite = params.get('invite')
  const viaLink = invite !== null
  const live = useLiveEntry(viaLink ? invite : null)
  const info = live.info
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [consentBusy, setConsentBusy] = useState(false)
  const [consentError, setConsentError] = useState<string | null>(null)
  const view = info ? toView(info) : null

  // 실전 입장: 카메라 허브를 이 응시자로 연결해 휴대폰 QR 을 미리 받아 둔다
  useEffect(() => {
    if (invite && info?.proctoring) camHub.connect(invite)
  }, [invite, info?.proctoring])

  const go = (to: number) => {
    setDir(to > step ? 1 : -1)
    setStep(to)
  }
  const next = () => go(step + 1)
  const back = () => go(step - 1)
  /** 동의 다음: 감독 회차면 환경 점검으로, 아니면 동의만 저장하고 대기실로 */
  const afterConsent = async () => {
    if (!invite || !info || info.proctoring) return next()
    setConsentBusy(true)
    setConsentError(null)
    try {
      await proctorApi.consent(invite, { proctoring: false })
      go(3)
    } catch (e) {
      setConsentError(e instanceof Error ? e.message : String(e))
    } finally {
      setConsentBusy(false)
    }
  }

  // 이미 시작한 응시자가 링크로 다시 들어오면 바로 대기실 → 시작(중복 생성 없음) → 응시 화면
  const resumed = !!info?.startedAt && !info.submittedAt && info.phase === 'LIVE' && !info.linkExpired
  const shownStep = resumed ? 3 : step
  const notice = viaLink ? noticeFor(live) : null
  // 입장 정보(info)를 받은 뒤에만 단계를 보여 준다
  const showSteps = viaLink && !notice && !!view
  const waiting = showSteps && shownStep === 3

  const header = (
    <header className={cx('relative z-20 grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-6 px-8', waiting ? 'border-b border-stage-line' : 'glass rounded-none! border-0! border-b! border-line/70! shadow-none!')}>
      <div className="flex items-center gap-4">
        <Logo className={waiting ? 'text-stage-text!' : undefined} />
        <span className={cx('glow inline-flex h-[22px] items-center rounded-sm px-1.5 font-mono text-[12px] font-semibold tracking-[0.08em]', waiting ? 'bg-stage-alert/15 text-stage-alert [--glow:var(--color-stage-alert)]' : 'bg-alert/12 text-alert [--glow:var(--color-alert)]')}>
          LIVE EXAM
        </span>
      </div>
      <span aria-hidden />
      {showSteps && view ? (
        <span className={cx('justify-self-end truncate text-[13px] font-medium', waiting ? 'text-stage-muted' : 'text-text-muted')}>
          {view.company ? `${view.company} │ ` : ''}
          {view.title}
        </span>
      ) : (
        <span aria-hidden />
      )}
    </header>
  )
  const journey = showSteps ? <Journey current={shownStep} stage={waiting} /> : null
  const stepBody = invite && info && view && (
    <>
      {shownStep === 0 && <InfoStep view={view} onNext={next} />}
      {shownStep === 1 && <ConsentStep view={view} busy={consentBusy} error={consentError} onNext={() => void afterConsent()} onBack={back} />}
      {shownStep === 2 && <LiveEnvStep invite={invite} onNext={next} onBack={back} />}
      {shownStep === 3 && <LiveWaitingRoom invite={invite} info={info} offsetMs={live.offsetMs} view={view} />}
    </>
  )
  const body = (
    <AnimatePresence mode="wait" custom={dir}>
      <motion.div
        key={!viaLink ? 'no-link' : notice ? 'notice' : shownStep}
        custom={dir}
        initial={{ opacity: 0, x: dir * 48 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: dir * -48 }}
        transition={{ duration: duration.normal, ease: easing.standard }}
      >
        {!viaLink && <NoLink />}
        {notice}
        {showSteps && stepBody}
      </motion.div>
    </AnimatePresence>
  )
  return (
    <div className="relative isolate flex min-h-full flex-col overflow-x-clip">
      <NoticeBanner invite={viaLink ? invite : null} />
      {waiting ? (
        <StageSection shape="inset" className="flex min-h-full flex-1 flex-col rounded-none! border-0! shadow-none!" aria-label="대기실">
          <div className="flex min-h-full flex-col">
            {header}
            {journey}
            <main className="flex flex-1 justify-center px-8 py-[clamp(12px,3.5vh,40px)]">{body}</main>
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
