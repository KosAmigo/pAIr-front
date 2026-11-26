// DESIGN.md §7-8 로그인, 회원가입 (2026-11-19 개편: 반반 쇼케이스)
// 왼쪽 절반은 다크 무대: 큰 문장 + 역량 육각형 미리보기 + 떠 있는 유리 칩. 오른쪽 절반은 오로라 위 유리 폼 카드(GlowBorder).
// 로그인과 일반 회원가입은 백엔드 인증 API(/api/auth)에 연결한다.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Building2, Check, Eye, EyeOff, GitBranch, ShieldCheck, Sparkles, TriangleAlert, User } from 'lucide-react'
import { CheckMark } from '../components/CheckMark'
import { cx } from '../components/cx'
import { Button, Logo } from '../components/ui'
import { Aurora, Glass, GlowBorder, GradientText, Reveal, StageSection } from '../components/fx'
import { StatHex } from '../components/dashboard/StatHex'
import { STATS } from '../data/dashboard'
import { homeFor, useAuth } from '../auth/auth'
import { AuthRequestError } from '../auth/authApi'
import { needsOnboarding } from '../company/policy'
import { companyApi } from '../company/companyApi'

const inputCls =
  'h-11 w-full rounded-sm border border-line-strong bg-panel px-3 text-[16px] text-text outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-text-faint focus:border-brand focus:shadow-[0_0_0_3px_rgb(108_71_255/0.15)]'

// 쇼케이스 육각형은 실제 점수가 아니라 장식이다: 항목(채점 기준 상수)마다 배점의 3/4 을 채운 모양만 보여 준다
const DEMO_STATS = STATS.map((st) => ({ key: st.key, name: st.name, score: Math.round(st.max * 0.75), max: st.max, color: st.color }))
const DEMO_TOTAL = DEMO_STATS.reduce((n, st) => n + st.score, 0)
const CHIPS = [
  { icon: Sparkles, text: 'AI 질문 전체 분석', cls: 'top-[16%] right-[8%]', delay: '0s' },
  { icon: GitBranch, text: '복기 분기로 다시 풀기', cls: 'bottom-[22%] left-[6%]', delay: '-2s' },
  { icon: ShieldCheck, text: '감점 근거 대화 표시', cls: 'bottom-[9%] right-[12%]', delay: '-4s' },
]

function AuthLayout({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  const [active, setActive] = useState<string | null>(null)
  return (
    <div className="auth-layout grid min-h-full grid-cols-1 lg:grid-cols-2">
      {/* 왼쪽: 다크 무대 쇼케이스 */}
      <StageSection shape="inset" className="hidden rounded-none! border-0! shadow-none! lg:block" aria-label="pAIr 소개">
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
          {/* 육각형은 문장 바로 아래에 둔다(mt-auto 로 바닥에 붙이면 회원가입처럼 폼이 길 때 아래로 밀려 잘렸다) */}
          <div className="relative mt-6 flex justify-center" aria-hidden>
            <StatHex stats={DEMO_STATS} total={DEMO_TOTAL} active={active} onActive={setActive} size={400} />
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
      <div className="relative isolate flex items-center justify-center overflow-hidden px-4 py-8 sm:px-8 lg:px-10 lg:py-16">
        <Aurora variant="full" />
        <div className="relative z-10 w-full max-w-[440px]">
          <Reveal>
            <GlowBorder className="rounded-2xl">
              <Glass className="rounded-2xl bg-white/85! p-6 shadow-lg! sm:p-10">
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
      {hint && <p id={`${id}-hint`} className="text-[13px] text-text-muted">{hint}</p>}
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
  const { user, signedIn, loading, login } = useAuth()
  const location = useLocation()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(() =>
    (location.state as { logoutError?: boolean } | null)?.logoutError ? '로그아웃 서버 연결에 실패했습니다. 이 브라우저에서는 로그아웃했습니다.' : null,
  )
  const authMessage = (location.state as { authMessage?: string } | null)?.authMessage
  const [submitting, setSubmitting] = useState(false)

  if (loading) return null
  if (signedIn && user) return <Navigate to={needsOnboarding(user) ? '/onboarding' : next ?? homeFor(user.role)} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const u = await login(email, password)
      nav(needsOnboarding(u) ? '/onboarding' : next ?? homeFor(u.role), { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="로그인"
      footer={
        <>
          계정이 없나요?{' '}
          <Link to={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="ml-1.5 font-semibold text-brand hover:underline">
            회원가입
          </Link>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {authMessage && <p role="status" className="mt-6 rounded-md bg-brand-dim px-3 py-2.5 text-[14px] text-text">{authMessage}</p>}
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <Field id="email" label="이메일">
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required className={inputCls} />
        </Field>
        <Field id="password" label="비밀번호">
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="mt-2 w-full" disabled={submitting}>
          {submitting ? '로그인 중…' : '로그인'}
        </Button>
      </form>
    </AuthLayout>
  )
}

type Kind = 'user' | 'company'

export function Signup() {
  const { user, signedIn, loading, signup, requestEmailVerification } = useAuth()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const next = safeNext(params.get('next'))
  const kind: Kind = params.get('type') === 'company' ? 'company' : 'user'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null)
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null)
  const [requestingCode, setRequestingCode] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (cooldownUntil === null) return
    const interval = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= cooldownUntil) window.clearInterval(interval)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [cooldownUntil])

  if (loading) return null
  if (signedIn && user) return <Navigate to={needsOnboarding(user) ? '/onboarding' : next ?? homeFor(user.role)} replace />

  const isCompany = kind === 'company'
  const rules = [
    { ok: password.length >= 8, text: '8자 이상' },
    { ok: new TextEncoder().encode(password).length <= 72, text: '72바이트 이하' },
    { ok: password.length > 0 && password === confirm, text: '비밀번호 확인과 같음' },
  ]
  const valid = name.trim() && email.trim() && rules.every((r) => r.ok) && agree
  const normalizedEmail = email.trim()
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  const verificationRequested = verificationEmail === normalizedEmail && normalizedEmail.length > 0
  const codeReady = verificationRequested && code.length === 6
  const cooldownSeconds = cooldownUntil === null ? 0 : Math.max(0, Math.ceil((cooldownUntil - now) / 1000))

  const pick = (k: Kind) => {
    const p = new URLSearchParams(params)
    if (k === 'company') p.set('type', 'company')
    else p.delete('type')
    setParams(p, { replace: true })
    setError(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid || !codeReady) return
    setError(null)
    setSubmitting(true)
    try {
      await signup(name, normalizedEmail, password, code)
      nav(next ?? '/tasks', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : '회원가입에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const requestCode = async () => {
    if (!validEmail || requestingCode || cooldownSeconds > 0) return
    setError(null)
    setVerificationEmail(null)
    setVerificationMessage(null)
    setCode('')
    setRequestingCode(true)
    try {
      const response = await requestEmailVerification(normalizedEmail)
      setVerificationEmail(normalizedEmail)
      setVerificationMessage(response.message)
      const requestedAt = Date.now()
      setNow(requestedAt)
      setCooldownUntil(requestedAt + 60_000)
    } catch (e) {
      if (e instanceof AuthRequestError && e.status === 429) {
        const requestedAt = Date.now()
        setNow(requestedAt)
        setCooldownUntil(requestedAt + (e.retryAfterMs ?? 60_000))
      }
      setError(e instanceof Error ? e.message : '인증 코드를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setRequestingCode(false)
    }
  }

  const changeEmail = (value: string) => {
    if (value.trim() !== normalizedEmail) {
      setVerificationEmail(null)
      setVerificationMessage(null)
      setCode('')
      setCooldownUntil(null)
      setNow(0)
      setError(null)
    }
    setEmail(value)
  }

  if (isCompany) return <CompanyInquiry onBack={() => pick('user')} />

  return (
    <AuthLayout
      title="회원가입"
      footer={
        <>
          이미 계정이 있나요?{' '}
          <Link to="/login" className="ml-1.5 font-semibold text-brand hover:underline">
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="email" type="email" value={email} onChange={(e) => changeEmail(e.target.value)} autoComplete="email" required disabled={requestingCode} className={cx(inputCls, 'min-w-0 flex-1 disabled:cursor-not-allowed disabled:bg-panel-raised')} />
            <Button type="button" variant="secondary" size="md" className="w-full shrink-0 sm:w-auto" onClick={requestCode} disabled={!validEmail || requestingCode || cooldownSeconds > 0}>
              {requestingCode ? '발송 중…' : cooldownSeconds > 0 ? `재요청 ${cooldownSeconds}초` : verificationRequested ? '인증 코드 재요청' : '인증 코드 발송'}
            </Button>
          </div>
          {verificationRequested && verificationMessage && <p role="status" className="text-[13px] text-signal">{verificationMessage}</p>}
          {!verificationRequested && cooldownSeconds > 0 && <p role="status" className="text-[13px] text-text-muted">{cooldownSeconds}초 후 인증 코드를 다시 요청할 수 있습니다.</p>}
        </Field>
        <Field id="code" label="인증 코드" hint={verificationRequested ? '이메일로 받은 숫자 6자리를 입력해 주세요.' : '이메일 인증 코드를 먼저 요청해 주세요.'}>
          <input
            id="code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            aria-describedby="code-hint"
            required
            disabled={!verificationRequested || requestingCode || submitting}
            className={cx(inputCls, 'disabled:cursor-not-allowed disabled:bg-panel-raised disabled:text-text-faint')}
          />
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
        <label className={cx('flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-[14px] text-text transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40', agree ? 'border-brand/50 bg-brand-dim' : 'border-line bg-panel hover:border-line-strong')}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="sr-only" />
          <CheckMark on={agree} />
          서비스 이용약관과 개인정보 처리방침에 동의합니다
        </label>
        <Button type="submit" variant="primary" size="lg" className="mt-2 w-full" disabled={!valid || !codeReady || submitting || requestingCode}>
          {submitting ? '가입 중…' : '가입하기'}
        </Button>
      </form>
    </AuthLayout>
  )
}

/**
 * 기업 도입 문의 (기획_결정사항 §4, company_inquiries). 기업 회원은 자체 가입하지 않는다:
 * 문의 → 관리자 승인(회사 등록) → 담당자에게 초대 메일 → 초대 링크로 계정을 만든다.
 * 문의와 회원 명단은 서버에서 최종 검증한다.
 */
function CompanyInquiry({ onBack }: { onBack: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await companyApi.submitInquiry(new FormData(event.currentTarget))
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '문의를 제출하지 못했습니다.')
    } finally { setBusy(false) }
  }
  return (
    <AuthLayout
      title="기업 도입 문의"
      footer={
        <button type="button" onClick={onBack} className="font-semibold text-brand hover:underline">
          일반 회원가입으로
        </button>
      }
    >
      <p className="mt-2 text-[14px] leading-6 text-text-muted">사업자 번호는 필수이며 진위 확인은 하지 않습니다. 매니저는 정확히 1명이어야 합니다. 감독관은 선택 사항입니다.</p>
      <a href="/api/company-inquiries/members-template.xlsx" download className="mt-3 inline-block text-sm font-semibold text-brand underline">회원 명단 엑셀 양식 내려받기</a>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {done ? <p role="status" className="mt-6 text-text">문의가 접수되었습니다. 관리자 확인 후 안내해 드립니다.</p> : (
        <form className="mt-5 flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <Field id="companyName" label="회사명"><input id="companyName" name="companyName" required className={inputCls} /></Field>
          <Field id="businessNo" label="사업자 번호"><input id="businessNo" name="businessNo" required className={inputCls} /></Field>
          <Field id="contactName" label="담당자 이름"><input id="contactName" name="contactName" required className={inputCls} /></Field>
          <Field id="contactEmail" label="담당자 이메일"><input id="contactEmail" name="contactEmail" type="email" required className={inputCls} /></Field>
          <Field id="members" label="회원 명단 (엑셀 또는 CSV)" hint="엑셀 양식에 적어 올리세요. CSV 는 열: 회원명,회원이메일,역할 (MANAGER 또는 PROCTOR)">
            <input id="members" name="members" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="text-sm text-text" />
          </Field>
          <Field id="inquiryMessage" label="문의 내용 (선택)"><textarea id="inquiryMessage" name="message" rows={3} className={`${inputCls} h-auto py-2`} /></Field>
          <Button type="submit" variant="primary" size="lg" disabled={busy}>{busy ? '제출 중…' : '문의 제출'}</Button>
        </form>
      )}
    </AuthLayout>
  )
}
