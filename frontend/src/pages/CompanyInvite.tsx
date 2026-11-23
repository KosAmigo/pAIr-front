import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, homeFor } from '../auth/auth'
import { validateNewPassword } from '../auth/account'
import { companyApi, type Invite } from '../company/companyApi'
import { needsOnboarding } from '../company/policy'
import { Button } from '../components/ui'

const input = 'h-11 w-full rounded-md border border-line-strong bg-panel px-3 text-text'
export default function CompanyInvite() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  return <InviteForm key={token} token={token} />
}

function InviteForm({ token }: { token: string }) {
  const [invite, setInvite] = useState<Invite | null>(null)
  const [loading, setLoading] = useState(!!token)
  const [error, setError] = useState<string | null>(token ? null : '초대 토큰이 없습니다.')
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [code, setCode] = useState('')
  const { acceptInvitation, signedIn } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    let active = true
    if (!token) return
    companyApi.invitation(token).then((value) => {
      if (active) {
        if (value.role !== 'PROCTOR') setError('감독관 초대가 아닙니다.')
        else setInvite(value)
      }
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : '초대를 확인하지 못했습니다.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])
  async function run(operation: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(null); setNotice(null)
    try { await operation() } catch (e) { setError(e instanceof Error ? e.message : '요청을 처리하지 못했습니다.') } finally { setBusy(false) }
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    const invalid = validateNewPassword(password, confirmation)
    if (invalid) { setError(invalid); return }
    void run(async () => {
      const user = await acceptInvitation(token, name, password, code)
      navigate(needsOnboarding(user) ? '/onboarding' : homeFor(user.role), { replace: true })
    })
  }
  return <main className="mx-auto max-w-xl p-8">
    <h1 className="text-2xl font-bold text-text">감독관 초대 수락</h1>
    {loading && <p role="status" className="mt-4">초대를 확인하고 있습니다.</p>}
    {error && <p role="alert" className="mt-4 rounded-md bg-alert/8 p-3 text-alert">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-md bg-brand-dim p-3 text-text">{notice}</p>}
    {signedIn ? <p className="mt-4">초대 가입을 진행하려면 먼저 로그아웃해 주세요.</p> : invite && <section className="mt-5 rounded-xl border border-line bg-panel p-5">
      <p className="text-text">회사: {invite.companyName} · 역할: 감독관</p><p className="mt-1 text-text-muted">초대 이메일: {invite.email}</p>
      <Button className="mt-4" disabled={busy} onClick={() => void run(async () => { await companyApi.inviteCode(token); setNotice('초대 이메일로 인증 코드를 발송했습니다.') })}>인증 코드 발송</Button>
      <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
        <label htmlFor="invite-name">이름</label><input id="invite-name" className={input} required value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="invite-code">인증 코드</label><input id="invite-code" className={input} required pattern="[0-9]{6}" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
        <label htmlFor="invite-password">비밀번호</label><input id="invite-password" type="password" autoComplete="new-password" className={input} required value={password} onChange={(e) => setPassword(e.target.value)} />
        <label htmlFor="invite-confirm">비밀번호 확인</label><input id="invite-confirm" type="password" autoComplete="new-password" className={input} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        <Button type="submit" variant="primary" disabled={busy}>가입하기</Button>
      </form>
    </section>}
    <Link to="/login" className="mt-5 inline-block text-brand underline">로그인</Link>
  </main>
}
