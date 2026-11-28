import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { companyApi, type CompanyMember, type Inquiry } from '../../company/companyApi'
import { useLoad } from '../../data/consoleSessions'
import { Button, Panel } from '../../components/ui'
import { ErrorState } from '../../components/ErrorState'
import { ConfirmModal } from './common'

const input = 'h-10 rounded-md border border-line-strong bg-panel px-3 text-text'
const errorText = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했습니다.'

export function InquiryList() {
  const list = useLoad('company-inquiries', companyApi.inquiries)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  async function act(action: () => Promise<unknown>) {
    if (busy) return
    setBusy(true); setError(null); setNotice(null)
    try { await action(); setNotice('처리되었습니다.'); list.reload() } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  return <section className="rounded-xl border border-line bg-panel p-5">
    <h2 className="text-lg font-bold text-text">도입 문의</h2>
    {error && <p role="alert" className="mt-3 text-alert">{error}</p>}
    {notice && <p role="status" className="mt-3 text-text">{notice}</p>}
    {list.error ? <ErrorState compact message={list.error} onRetry={list.reload} /> : list.loading ? <p role="status">불러오는 중입니다.</p> : list.data?.length === 0 ? <p className="mt-4 text-text-muted">문의가 없습니다.</p> :
      <ul className="mt-3 divide-y divide-line">{list.data?.map((inquiry) => <InquiryRow key={inquiry.id} inquiry={inquiry} busy={busy} act={act} />)}</ul>}
  </section>
}

function InquiryRow({ inquiry, busy, act }: { inquiry: Inquiry; busy: boolean; act: (action: () => Promise<unknown>) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null)
  const pending = inquiry.status === 'PENDING'
  return <li className="flex flex-col gap-2 py-4">
    <h3 className="font-bold text-text">{inquiry.companyName} · {inquiry.status}</h3>
    <p className="text-sm text-text-muted">사업자 번호 {inquiry.businessNo} (진위 미확인) · {inquiry.contactName} · {inquiry.contactEmail}</p>
    {inquiry.message && <p className="text-sm text-text">{inquiry.message}</p>}
    <ul className="text-sm text-text-muted">{inquiry.members?.map((member, index) => <li key={`${member.email}-${index}`}>{member.name} · {member.email} · {member.role}</li>)}</ul>
    {pending && <div className="flex flex-wrap items-center gap-2">
      <Button disabled={busy} variant="primary" onClick={() => { if (window.confirm('이 문의를 승인하시겠습니까?')) void act(() => companyApi.approve(inquiry.id)) }}>승인</Button>
      <Button disabled={busy} onClick={() => { if (window.confirm('이 문의를 거절하시겠습니까?')) void act(() => companyApi.reject(inquiry.id)) }}>거절</Button>
      <label htmlFor={`inquiry-file-${inquiry.id}`} className="text-sm text-text">명단 교체</label>
      <input id={`inquiry-file-${inquiry.id}`} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="max-w-56 text-sm" />
      <Button disabled={busy || !file} onClick={() => { if (file) void act(() => companyApi.replaceMembers(inquiry.id, file)) }}>명단 교체</Button>
    </div>}
  </li>
}

export function CompanyList() {
  const list = useLoad('admin-companies', companyApi.companies)
  return <section className="rounded-xl border border-line bg-panel p-5">
    <h2 className="text-lg font-bold text-text">회사 목록</h2>
    {list.error ? <ErrorState compact message={list.error} onRetry={list.reload} /> : list.loading ? <p role="status">불러오는 중입니다.</p> : list.data?.length === 0 ? <p className="mt-4 text-text-muted">등록된 회사가 없습니다.</p> :
      <ul className="mt-3 divide-y divide-line">{list.data?.map((company) => <li key={company.id} className="py-3"><Link className="font-semibold text-brand hover:underline" to={`/console/companies/${company.id}`}>{company.name}</Link></li>)}</ul>}
  </section>
}

export function MemberRows({ members, reissue, busy }: { members: CompanyMember[]; reissue?: (id: number) => void; busy: boolean }) {
  return <ul className="divide-y divide-line">{members.map((member) => <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
    <div><p className="font-semibold text-text">{member.name} · {member.email}</p>
      <p className="text-sm text-text-muted">{member.role} · {member.status} · 이메일 {member.emailVerified ? '인증 완료' : '인증 필요'} · 비밀번호 {member.passwordChangeRequired ? '변경 필요' : '변경 완료'} · 메일 {member.onboardingMailStatus}</p></div>
    {reissue && (!member.emailVerified || member.passwordChangeRequired) && <Button disabled={busy} onClick={() => reissue(member.id)}>온보딩 재발급</Button>}
  </li>)}</ul>
}

export function CompanyAccounts({ id }: { id: number }) {
  const detail = useLoad(`admin-company-${id}`, () => companyApi.company(id))
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  async function act(action: () => Promise<unknown>, text: string) {
    if (busy) return
    setBusy(true); setError(null); setNotice(null)
    try { await action(); setNotice(text); detail.reload() } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  function replace(event: FormEvent) {
    event.preventDefault()
    if (window.confirm('기존 매니저를 탈퇴 처리하고 새 매니저 계정을 생성합니다. 계속하시겠습니까?')) {
      void act(() => companyApi.replaceManager(id, name, email), '새 매니저 계정이 생성되었습니다. 활성화를 완료해야 이용할 수 있습니다.')
    }
  }
  return <Panel label="MEMBERS" title="회사 정보 · 회원">
    {error && <p role="alert" className="text-alert">{error}</p>}
    {notice && <p role="status" className="text-text">{notice}</p>}
    {detail.error ? <ErrorState compact message={detail.error} onRetry={detail.reload} /> : detail.loading ? <p role="status">불러오는 중입니다.</p> : detail.data && <>
      <p className="text-text">{detail.data.company.name} · 사업자 번호 {detail.data.company.businessNo} (진위 미확인)</p>
      {detail.data.members.length === 0 ? <p className="mt-3 text-text-muted">회원이 없습니다.</p> : <MemberRows members={detail.data.members} busy={busy} reissue={(memberId) => {
        if (window.confirm('임시 비밀번호와 인증 상태를 재발급하고 기존 세션을 무효화합니다. 계속하시겠습니까?')) void act(() => companyApi.reissue(memberId), '온보딩 정보 재발급을 요청했습니다.')
      }} />}
      <form className="mt-5 flex flex-col gap-2" onSubmit={replace}>
        <h3 className="font-semibold text-text">매니저 교체</h3>
        <p className="text-sm text-text-muted">기존 매니저는 탈퇴 처리되고 새 계정이 생성됩니다.</p>
        <label htmlFor="manager-name">새 매니저 이름</label><input id="manager-name" className={input} required value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="manager-email">새 매니저 이메일</label><input id="manager-email" type="email" className={input} required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" disabled={busy}>매니저 교체</Button>
      </form>
      <DeleteCompany id={id} name={detail.data.company.name} />
    </>}
  </Panel>
}

/** 회사 삭제: 회사 이름을 그대로 입력해야 누를 수 있다. 기록은 남고 멤버는 탈퇴 처리되어 같은 이메일로 다시 가입할 수 있다 */
function DeleteCompany({ id, name }: { id: number; name: string }) {
  const nav = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  function close() {
    if (busy) return
    setOpen(false); setTyped(''); setError(null)
  }
  async function remove() {
    if (busy || typed.trim() !== name) return
    setBusy(true); setError(null)
    try {
      await companyApi.deleteCompany(id)
      await queryClient.invalidateQueries({ queryKey: ['admin-companies'] })
      nav('/console/companies', { replace: true })
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }
  return <div className="mt-6 flex flex-col gap-2 border-t border-line pt-5">
    <h3 className="font-semibold text-text">회사 삭제</h3>
    <p className="text-sm text-text-muted">진행 중인 회차가 있으면 삭제할 수 없습니다. 예정 회차는 취소되고(대상자에게 안내 메일), 회원은 모두 탈퇴 처리됩니다. 끝난 회차의 결과와 감독 기록은 남습니다.</p>
    <Button variant="danger" onClick={() => setOpen(true)}>회사 삭제</Button>
    {open && (
      <ConfirmModal
        title="회사를 삭제할까요?"
        danger
        confirm={busy ? '삭제하는 중' : '회사 삭제'}
        disabled={busy || typed.trim() !== name}
        onClose={close}
        onConfirm={() => void remove()}
        body={<div className="flex flex-col gap-3">
          <p className="text-text-muted">되돌릴 수 없습니다. 회원은 같은 이메일로 개인 회원이나 다른 회사 계정으로 다시 가입할 수 있습니다.</p>
          <label htmlFor="delete-company-name" className="text-sm text-text">확인을 위해 회사 이름 <b>{name}</b> 을 입력해 주세요.</label>
          <input id="delete-company-name" className={input} autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          {error && <p role="alert" className="text-alert">{error}</p>}
        </div>}
      />
    )}
  </div>
}
