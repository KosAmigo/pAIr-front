// DESIGN.md §7-8 로그인, 회원가입
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Eye, EyeOff, TriangleAlert } from 'lucide-react'
import { cx } from '../components/cx'
import { Button, Logo } from '../components/ui'
import { homeFor, useAuth } from '../auth/auth'

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

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-medium text-text">
        {label}
      </label>
      {children}
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

export function Signup() {
  const { user, signedIn, signup } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (signedIn && user) return <Navigate to={next ?? homeFor(user.role)} replace />

  const rules = [
    { ok: password.length >= 8, text: '8자 이상' },
    { ok: password.length > 0 && password === confirm, text: '비밀번호 확인과 같음' },
  ]
  const valid = name.trim() && email.trim() && rules.every((r) => r.ok) && agree

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    const r = signup(name, email, password)
    if (r.error) return setError(r.error)
    nav(next ?? '/tasks', { replace: true })
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
          <p className="mt-3 text-[13px]">기업 담당자 계정은 pAIr 관리자가 만들어 드립니다.</p>
        </>
      }
    >
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
