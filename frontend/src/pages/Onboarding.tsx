import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/auth'
import { validateNewPassword } from '../auth/account'
import { needsOnboarding } from '../company/policy'
import { companyApi } from '../company/companyApi'
import { Button } from '../components/ui'

const input = 'h-11 w-full rounded-md border border-line-strong bg-panel px-3 text-text'

export default function Onboarding() {
  const { user, loading, logout, refreshProfile, changePassword } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (loading) return <p role="status">로그인 확인 중입니다.</p>
  if (!user) return <Navigate to="/login" replace />
  if (!needsOnboarding(user)) return <Navigate to="/console/sessions" replace />

  async function run(operation: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try { await operation() } catch (e) { setError(e instanceof Error ? e.message : '요청을 처리하지 못했습니다.') } finally { setBusy(false) }
  }
  function verify(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      await companyApi.verifyOnboarding(code)
      const profile = await refreshProfile()
      if (!profile.emailVerified) throw new Error('인증 상태를 확인하지 못했습니다. 다시 시도해 주세요.')
      setNotice('이메일 인증이 완료되었습니다.')
    })
  }
  function change(event: FormEvent) {
    event.preventDefault()
    const invalid = validateNewPassword(password, confirmation)
    if (invalid) { setError(invalid); return }
    void run(async () => {
      await changePassword(current, password)
      navigate('/login', { replace: true, state: { authMessage: '비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.' } })
    })
  }
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold text-text">기업 계정 활성화</h1>
      <p className="mt-3 text-text-muted">이메일 인증과 비밀번호 변경을 모두 완료해야 합니다. 다른 페이지로 이동하면 로그아웃됩니다.</p>
      {error && <p role="alert" className="mt-4 rounded-md bg-alert/8 p-3 text-alert">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-md bg-brand-dim p-3 text-text">{notice}</p>}
      <section className="mt-6 rounded-xl border border-line bg-panel p-5">
        <h2 className="font-bold text-text">이메일 인증</h2>
        <p className="mt-2 text-sm text-text-muted">{user.email} · {user.emailVerified ? '인증 완료' : '인증 필요'}</p>
        {!user.emailVerified && <>
          <Button className="mt-4" disabled={busy} onClick={() => void run(async () => { await companyApi.onboardingCode(); setNotice('인증 코드를 발송했습니다.') })}>인증 코드 발송</Button>
          <form onSubmit={verify} className="mt-4 flex flex-col gap-2">
            <label htmlFor="onboarding-code">인증 코드</label>
            <input id="onboarding-code" className={input} inputMode="numeric" pattern="[0-9]{6}" value={code} onChange={(e) => setCode(e.target.value)} required />
            <Button type="submit" disabled={busy}>인증 확인</Button>
          </form>
        </>}
      </section>
      {user.passwordChangeRequired !== false && <section className="mt-4 rounded-xl border border-line bg-panel p-5">
        <h2 className="font-bold text-text">비밀번호 변경</h2>
        <form onSubmit={change} className="mt-4 flex flex-col gap-3">
          <label htmlFor="old-password">임시 비밀번호</label><input id="old-password" type="password" autoComplete="current-password" className={input} required value={current} onChange={(e) => setCurrent(e.target.value)} />
          <label htmlFor="new-password">새 비밀번호</label><input id="new-password" type="password" autoComplete="new-password" className={input} required value={password} onChange={(e) => setPassword(e.target.value)} />
          <label htmlFor="confirm-password">새 비밀번호 확인</label><input id="confirm-password" type="password" autoComplete="new-password" className={input} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
          <Button type="submit" variant="primary" disabled={busy || !user.emailVerified}>변경 후 다시 로그인</Button>
        </form>
      </section>}
      <Button className="mt-5" disabled={busy} onClick={() => void run(async () => { await logout(); navigate('/login', { replace: true }) })}>로그아웃</Button>
    </main>
  )
}
