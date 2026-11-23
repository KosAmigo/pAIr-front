import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/auth'
import { companyApi } from '../../company/companyApi'
import { canDelegate } from '../../company/policy'
import { useLoad } from '../../data/consoleSessions'
import { PageHeader } from '../../components/SelfShell'
import { Button, Panel } from '../../components/ui'
import { ErrorState } from '../../components/ErrorState'

export default function CompanyMembers() {
  const list = useLoad('company-members', companyApi.members)
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  async function invite(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(null); setNotice(null)
    try { await companyApi.invite(email); setNotice('감독관 초대 이메일 발송을 요청했습니다.'); setEmail(''); list.reload() }
    catch (e) { setError(e instanceof Error ? e.message : '초대를 보내지 못했습니다.') }
    finally { setBusy(false) }
  }
  async function delegate(id: number, name: string) {
    if (busy || !window.confirm(`${name}님에게 매니저 권한을 즉시 위임합니다. 본인은 감독관이 되며 두 계정 모두 다시 로그인해야 합니다. 계속하시겠습니까?`)) return
    setBusy(true); setError(null); setNotice(null)
    try {
      await companyApi.delegate(id)
      try { await logout() } catch (e) { console.error('위임 후 서버 로그아웃 실패:', e) }
      navigate('/login', { replace: true, state: { authMessage: '매니저 권한을 위임했습니다. 두 사용자 모두 다시 로그인해 주세요.' } })
    } catch (e) { setError(e instanceof Error ? e.message : '위임을 처리하지 못했습니다.'); list.reload() }
    finally { setBusy(false) }
  }
  return <>
    <PageHeader label="MEMBERS" title="회사 회원" />
    <div className="flex flex-col gap-5 p-8">
      {error && <p role="alert" className="rounded-md bg-alert/8 p-3 text-alert">{error}</p>}
      {notice && <p role="status" className="rounded-md bg-brand-dim p-3 text-text">{notice}</p>}
      <Panel label="INVITE" title="감독관 초대">
        <p className="text-sm text-text-muted">초대된 사용자는 이 회사의 감독관으로 가입합니다. 기존 계정의 회사나 역할은 변경하지 않습니다.</p>
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => void invite(event)}>
          <div className="flex flex-col gap-1"><label htmlFor="proctor-email">감독관 이메일</label><input id="proctor-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 rounded-md border border-line-strong px-3 text-text" /></div>
          <Button type="submit" variant="primary" disabled={busy}>초대 보내기</Button>
        </form>
      </Panel>
      <Panel label="MEMBERS" title="회원 목록">
        {list.error ? <ErrorState compact message={list.error} onRetry={list.reload} /> : list.loading ? <p role="status">불러오는 중입니다.</p> : list.data && <>
          <p className="text-sm text-text-muted">회사 #{list.data.companyId}</p>
          {list.data.members.length === 0 ? <p className="mt-4">회원이 없습니다.</p> : <ul className="mt-3 divide-y divide-line">{list.data.members.map((member) => <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div><p className="font-semibold text-text">{member.name} · {member.email}</p><p className="text-sm text-text-muted">{member.role} · {member.status} · 이메일 {member.emailVerified ? '인증 완료' : '인증 필요'} · 비밀번호 {member.passwordChangeRequired ? '변경 필요' : '변경 완료'}</p></div>
            {canDelegate(member) && <Button disabled={busy} onClick={() => void delegate(member.id, member.name)}>매니저 위임</Button>}
          </li>)}</ul>}
        </>}
      </Panel>
    </div>
  </>
}
