// DESIGN.md §7-8 로그인, 회원가입 (2026-11-19 개편: 반반 쇼케이스)
// 왼쪽 절반은 다크 무대: 큰 문장 + 역량 육각형 미리보기 + 떠 있는 유리 칩. 오른쪽 절반은 오로라 위 유리 폼 카드(GlowBorder).
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Building2, Check, Eye, EyeOff, GitBranch, ShieldCheck, Sparkles, TriangleAlert, User } from 'lucide-react'
import { cx } from '../components/cx'
import { Button, Logo } from '../components/ui'
import { Aurora, Glass, GlowBorder, GradientText, Reveal, StageSection } from '../components/fx'
import { StatHex } from '../components/dashboard/StatHex'
import { STAT_HISTORY, STATS, total } from '../data/dashboard'
import { homeFor, useAuth } from '../auth/auth'
import { submitInquiry } from '../data/inquiries'

const inputCls =
  'h-11 w-full rounded-sm border border-line-strong bg-panel px-3 text-[16px] text-text outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-text-faint focus:border-brand focus:shadow-[0_0_0_3px_rgb(108_71_255/0.15)]'

const DEMO = STAT_HISTORY[STAT_HISTORY.length - 1].scores
const DEMO_STATS = STATS.map((st) => ({ key: st.key, name: st.name, score: DEMO[st.key], max: st.max, color: st.color }))
const CHIPS = [
  { icon: Sparkles, text: 'AI 질문 18턴 분석', cls: 'top-[16%] right-[8%]', delay: '0s' },
  { icon: GitBranch, text: '복기 분기 b2 +16', cls: 'bottom-[22%] left-[6%]', delay: '-2s' },
  { icon: ShieldCheck, text: '감점 근거 대화 #T07', cls: 'bottom-[9%] right-[12%]', delay: '-4s' },
]

function AuthLayout({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  const [active, setActive] = useState<string | null>(null)
  return (
    <div className="grid min-h-full grid-cols-2">
      {/* 왼쪽: 다크 무대 쇼케이스 */}
      <StageSection shape="inset" className="rounded-none! border-0! shadow-none!" aria-label="pAIr 소개">
        <div className="relative flex h-full min-h-[720px] flex-col px-14 py-12">
          <Logo className="text-[20px] text-stage-text!" />
          <Reveal className="mt-16">
            <p className="text-[44px] leading-[54px] font-extrabold tracking-[-0.03em] text-stage-text">
              AI와 일하는 실력,
              <br />
              <GradientText>숫자로 증명</GradientText>하세요
            </p>
            <p className="mt-4 max-w-[440px] text-[17px] leading-7 text-stage-muted">풀이 과정 전체를 6가지 역량으로 채점하고, 아쉬웠던 순간으로 돌아가 다시 풀어 볼 수 있습니다.</p>
          </Reveal>
          <div className="relative mt-auto flex justify-center" aria-hidden>
            <StatHex stats={DEMO_STATS} total={total(DEMO)} active={active} onActive={setActive} size={400} />
            {CHIPS.map((c) => (
              <span key={c.text} className={`auth-float glass-stage absolute inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold text-stage-text ${c.cls}`} style={{ animationDelay: c.delay }}>
                <c.icon size={14} className="text-stage-brand" />
                {c.text}
              </span>
            ))}
          </div>
        </div>
      </StageSection>

      {/* 오른쪽: 폼 */}
      <div className="relative isolate flex items-center justify-center overflow-hidden px-10 py-16">
        <Aurora variant="full" />
        <div className="relative z-10 w-full max-w-[440px]">
          <Reveal>
            <GlowBorder className="rounded-2xl">
              <Glass className="rounded-2xl bg-white/85! p-10 shadow-lg!">
                <h1 className="text-[28px] leading-9 font-bold tracking-[-0.02em] text-text">{title}</h1>
                {children}
              </Glass>
            </GlowBorder>
          </Reveal>
          <div className="mt-6 text-center text-[14px] text-text-muted">{footer}</div>
        </div>
      </div>
    </div>
  )
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-semibold text-text">
        {label}
      </label>
      {children}
      {hint && <p className="text-[13px] text-text-muted">{hint}</p>}
    </div>
  )
}

function PasswordInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        className={cx(inputCls, 'pr-11')}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}
        title={show ? '비밀번호 숨기기' : '비밀번호 보기'}
        className="absolute inset-y-0 right-1 my-auto inline-flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-panel-raised hover:text-text"
      >
        {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  )
}

function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="mt-6 flex items-center gap-2 rounded-md bg-alert/8 px-3 py-2.5 text-[14px] text-alert">
      <TriangleAlert size={16} className="shrink-0" aria-hidden />
      {children}
    </div>
  )
}

/** next 는 같은 사이트 안 경로만 받는다 (외부 주소로 보내지 않기) */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

export default function Login() {
  const { user, signedIn, login } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  if (signedIn && user) return <Navigate to={next ?? homeFor(user.role)} replace />

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const u = login(email, password)
    if (!u) return setError(true)
    nav(next ?? homeFor(u.role), { replace: true })
  }

  return (
    <AuthLayout
      title="로그인"
      footer={
        <>
          계정이 없나요?{' '}
          <Link to={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand hover:underline">
            회원가입
          </Link>
        </>
      }
    >
      {error && <ErrorBanner>이메일 또는 비밀번호가 맞지 않습니다</ErrorBanner>}
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <Field id="email" label="이메일">
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required className={inputCls} />
        </Field>
        <Field id="password" label="비밀번호">
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="mt-2 w-full">
          로그인
        </Button>
      </form>
      <p className="mt-6 rounded-md border border-dashed border-caution/60 px-3 py-2 font-mono text-[12px] leading-5 text-text-muted">
        백엔드 인증 전이라 로그인하지 않아도 관리자 목업 계정으로 들어갑니다. 다른 권한을 시험할 때만 로그인하세요.
        <br />
        목업 계정 (비밀번호 pair1234)
        <br />
        admin@pair.test │ hr@example-tech.test │ a@pair.test
      </p>
    </AuthLayout>
  )
}

type Kind = 'user' | 'company'

export function Signup() {
  const { user, signedIn, signup } = useAuth()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const next = safeNext(params.get('next'))
  const kind: Kind = params.get('type') === 'company' ? 'company' : 'user'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (signedIn && user) return <Navigate to={next ?? homeFor(user.role)} replace />

  const isCompany = kind === 'company'
  const rules = [
    { ok: password.length >= 8, text: '8자 이상' },
    { ok: password.length > 0 && password === confirm, text: '비밀번호 확인과 같음' },
  ]
  const valid = name.trim() && email.trim() && rules.every((r) => r.ok) && agree

  const pick = (k: Kind) => {
    const p = new URLSearchParams(params)
    if (k === 'company') p.set('type', 'company')
    else p.delete('type')
    setParams(p, { replace: true })
    setError(null)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    const r = signup(name, email, password)
    if (r.error) return setError(r.error)
    nav(next ?? '/tasks', { replace: true })
  }

  if (isCompany) return <CompanyInquiry onBack={() => pick('user')} />

  return (
    <AuthLayout
      title="회원가입"
      footer={
        <>
          이미 계정이 있나요?{' '}
          <Link to="/login" className="font-semibold text-brand hover:underline">
            로그인
          </Link>
        </>
      }
    >
      {/* 회원 종류 */}
      <div role="radiogroup" aria-label="회원 종류" className="mt-6 grid grid-cols-2 gap-2">
        {(
          [
            ['user', User, '일반 회원', '자가진단, 시험 응시'],
            ['company', Building2, '기업 도입 문의', '승인 후 담당자 초대'],
          ] as const
        ).map(([k, Icon, label, sub]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => pick(k)}
            className={cx(
              'flex flex-col items-start gap-1 rounded-md border px-4 py-3 text-left transition-[border-color,background-color,box-shadow] duration-150',
              kind === k ? 'border-brand bg-brand-dim shadow-[0_0_0_3px_rgb(108_71_255/0.12)]' : 'border-line-strong bg-panel hover:border-text-muted',
            )}
          >
            <span className={cx('inline-flex items-center gap-1.5 text-[15px] font-bold', kind === k ? 'text-brand' : 'text-text')}>
              <Icon size={16} aria-hidden /> {label}
            </span>
            <span className="text-[13px] text-text-muted">{sub}</span>
          </button>
        ))}
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <Field id="name" label="이름">
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={50} className={inputCls} />
        </Field>
        <Field id="email" label="이메일">
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className={inputCls} />
        </Field>
        <Field id="password" label="비밀번호">
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" />
        </Field>
        <Field id="confirm" label="비밀번호 확인">
          <PasswordInput id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </Field>
        <ul className="flex gap-4 text-[13px]" aria-label="비밀번호 조건">
          {rules.map((r) => (
            <li key={r.text} className={cx('flex items-center gap-1', r.ok ? 'text-signal' : 'text-text-muted')}>
              <Check size={14} aria-hidden className={r.ok ? '' : 'opacity-40'} />
              {r.text}
            </li>
          ))}
        </ul>
        <label className="flex items-start gap-2 text-[14px] text-text">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 size-4 accent-[var(--color-brand)]" />
          서비스 이용약관과 개인정보 처리방침에 동의합니다
        </label>
        <Button type="submit" variant="primary" size="lg" className="mt-2 w-full" disabled={!valid}>
          가입하기
        </Button>
      </form>
    </AuthLayout>
  )
}

/**
 * 기업 도입 문의 (기획_결정사항 §4, company_inquiries). 기업 회원은 자체 가입하지 않는다:
 * 문의 → 관리자 승인(회사 등록) → 담당자에게 초대 메일 → 초대 링크로 계정을 만든다.
 */
function CompanyInquiry({ onBack }: { onBack: () => void }) {
  const [f, setF] = useState({ companyName: '', businessNo: '', contactName: '', contactEmail: '', message: '' })
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  return (
    <AuthLayout
      title={done ? '문의를 받았습니다' : '기업 도입 문의'}
      footer={
        <button type="button" onClick={onBack} className="font-semibold text-brand hover:underline">
          일반 회원가입으로
        </button>
      }
    >
      {done ? (
        <div className="mt-6 flex flex-col gap-4 text-[15px] leading-7 text-text-muted">
          <p className="flex items-center gap-2 font-semibold text-signal">
            <Check size={18} aria-hidden /> 접수 완료
          </p>
          <p>
            관리자가 확인하고 승인하면 <span className="font-semibold text-text">{f.contactEmail}</span>로 담당자 초대 메일을 보냅니다. 메일의 초대 링크로 계정을 만들면 콘솔에서 시험 회차를 열 수 있습니다.
          </p>
          <Link to="/" className="font-semibold text-brand hover:underline">
            처음으로
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-2 text-[14px] leading-6 text-text-muted">기업 계정은 직접 가입하지 않습니다. 문의를 남기면 관리자가 승인한 뒤 담당자에게 초대 메일을 보냅니다.</p>
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              const err = submitInquiry({ ...f, message: f.message.trim() || undefined })
              setError(err)
              if (!err) setDone(true)
            }}
          >
            <Field id="iq-company" label="회사 이름">
              <input id="iq-company" value={f.companyName} onChange={set('companyName')} autoComplete="organization" required maxLength={100} className={inputCls} />
            </Field>
            <Field id="iq-bno" label="사업자등록번호" hint="000-00-00000">
              <input id="iq-bno" value={f.businessNo} onChange={set('businessNo')} required maxLength={20} className={cx(inputCls, 'tnum font-mono')} />
            </Field>
            <Field id="iq-name" label="담당자 이름">
              <input id="iq-name" value={f.contactName} onChange={set('contactName')} autoComplete="name" required maxLength={50} className={inputCls} />
            </Field>
            <Field id="iq-email" label="담당자 이메일" hint="승인되면 이 주소로 초대 메일이 갑니다.">
              <input id="iq-email" type="email" value={f.contactEmail} onChange={set('contactEmail')} autoComplete="email" required className={inputCls} />
            </Field>
            <Field id="iq-msg" label="문의 내용 (선택)">
              <textarea id="iq-msg" rows={3} value={f.message} onChange={set('message')} className={cx(inputCls, 'h-auto py-2 leading-6')} />
            </Field>
            <Button type="submit" variant="primary" size="lg" className="mt-2 w-full">
              문의 보내기
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  )
}
