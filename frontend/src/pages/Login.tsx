// DESIGN.md §7-8 로그인, 회원가입
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Building2, Check, Eye, EyeOff, TriangleAlert, User } from 'lucide-react'
import { cx } from '../components/cx'
import { Button, Logo } from '../components/ui'
import { ACCOUNTS, homeFor, useAuth } from '../auth/auth'
import { addManager, createCompany, getCompanies } from '../data/consoleSessions'

const inputCls =
  'h-11 w-full rounded-sm border border-line-strong bg-panel px-3 text-[16px] text-text outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-text-faint focus:border-brand focus:shadow-[0_0_0_3px_rgb(108_71_255/0.15)]'

function AuthLayout({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-bg px-4 py-16">
      <div aria-hidden className="absolute -top-40 left-1/2 size-[720px] -translate-x-1/2 rounded-full bg-brand/12 blur-[120px]" />
      <div className="relative w-full max-w-[420px]">
        <div className="mb-8 flex justify-center">
          <Logo className="text-[20px]" />
        </div>
        <div className="rounded-lg border border-line bg-panel p-10 shadow-md">
          <h1 className="text-h1 font-bold text-text">{title}</h1>
          {children}
        </div>
        <div className="mt-6 text-center text-[14px] text-text-muted">{footer}</div>
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
const BIZ_NO = /^\d{3}-\d{2}-\d{5}$/

/** 숫자만 받아 000-00-00000 모양으로 */
function formatBizNo(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 10)
  return [d.slice(0, 3), d.slice(3, 5), d.slice(5)].filter(Boolean).join('-')
}

export function Signup() {
  const { user, signedIn, signup } = useAuth()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const next = safeNext(params.get('next'))
  const kind: Kind = params.get('type') === 'company' ? 'company' : 'user'
  const [companyName, setCompanyName] = useState('')
  const [bizNo, setBizNo] = useState('')
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
  // 이미 등록된 사업자등록번호면 그 회사의 담당자로 들어간다
  const joining = isCompany && BIZ_NO.test(bizNo) ? getCompanies().find((c) => c.businessNo === bizNo) : undefined
  const companyOk = !isCompany || (BIZ_NO.test(bizNo) && (joining || companyName.trim()))
  const valid = companyOk && name.trim() && email.trim() && rules.every((r) => r.ok) && agree

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
    if (!isCompany) {
      const r = signup(name, email, password)
      if (r.error) return setError(r.error)
      return nav(next ?? '/tasks', { replace: true })
    }
    // 기업 회원 (목업): 회사를 찾거나 새로 등록하고, 그 회사의 담당자로 넣은 뒤 가입한다
    if (ACCOUNTS.some((a) => a.email === email.trim().toLowerCase())) return setError('이미 가입된 이메일입니다')
    let company = joining
    if (!company) {
      const c = createCompany(companyName, bizNo)
      if (c.error) return setError(c.error)
      company = getCompanies().find((x) => x.id === c.id)!
    }
    const m = addManager(company.id, name, email)
    if (m) return setError(m)
    const r = signup(name, email, password, company.name)
    if (r.error) return setError(r.error)
    nav('/console/sessions', { replace: true })
  }

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
            ['company', Building2, '기업 회원', '시험 회차, 감독'],
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
        {isCompany && (
          <fieldset className="flex flex-col gap-4 rounded-md border border-line bg-panel-sunken p-4">
            <legend className="px-1 text-[14px] font-bold text-text">회사 정보</legend>
            <Field
              id="bizno"
              label="사업자등록번호"
              hint={joining ? `이미 등록된 회사입니다. ${joining.name}의 담당자로 추가됩니다.` : '숫자 10자리. 같은 회사의 다른 담당자도 같은 번호로 가입합니다.'}
            >
              <input
                id="bizno"
                value={bizNo}
                onChange={(e) => setBizNo(formatBizNo(e.target.value))}
                inputMode="numeric"
                placeholder="000-00-00000"
                required
                className={cx(inputCls, 'tnum font-mono')}
              />
            </Field>
            <Field id="company" label="회사 이름">
              <input
                id="company"
                value={joining ? joining.name : companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={!!joining}
                autoComplete="organization"
                required
                maxLength={100}
                className={cx(inputCls, 'disabled:bg-panel-raised disabled:text-text-muted')}
              />
            </Field>
          </fieldset>
        )}
        <Field id="name" label={isCompany ? '담당자 이름' : '이름'}>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={50} className={inputCls} />
        </Field>
        <Field id="email" label={isCompany ? '회사 이메일' : '이메일'} hint={isCompany ? '시험 회차 안내와 결과 알림을 받는 주소입니다.' : undefined}>
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
          {isCompany ? '기업 회원으로 가입하기' : '가입하기'}
        </Button>
      </form>
    </AuthLayout>
  )
}
