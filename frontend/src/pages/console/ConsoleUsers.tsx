// 관리자 회원 목록 (ADMIN): 역할·이름/이메일로 거르고, 회원마다 자가진단 응시 수·평균 점수·크레딧 잔액·마지막 응시를 본다 (GET /api/admin/members).
// 기업 매니저의 "회사 회원"(/console/members)과는 다른 화면이다.
import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react'
import { cx } from '../../components/cx'
import { ErrorState } from '../../components/ErrorState'
import { PageHeader } from '../../components/SelfShell'
import { Button, Panel } from '../../components/ui'
import type { AdminMember, AdminMemberRole } from '../../consoleApi'
import { adminMembersQuery } from '../../data/adminStats'
import { errorMessage } from '../../data/queryKeys'

const ROLES: { value: AdminMemberRole; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'USER', label: '일반 회원' },
  { value: 'COMPANY', label: '기업 계정' },
  { value: 'ADMIN', label: '관리자' },
]
const ROLE_LABEL: Record<AdminMember['role'], string> = { USER: '일반', MANAGER: '매니저', PROCTOR: '감독관', ADMIN: '관리자' }
const num = (n: number) => n.toLocaleString('ko-KR')
const day = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function ConsoleUsers() {
  const [role, setRole] = useState<AdminMemberRole>('ALL')
  const [typed, setTyped] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const q = useQuery(adminMembersQuery(role, query, page))
  const data = q.data

  function search(e: FormEvent) {
    e.preventDefault()
    setQuery(typed.trim())
    setPage(0)
  }

  return (
    <>
      <PageHeader label="USERS" title="회원">
        {data && <span className="font-mono text-[13px] text-text-muted">{num(data.totalElements)}명</span>}
      </PageHeader>
      <div className="flex flex-col gap-4 p-4 md:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="역할" className="flex gap-1">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                aria-pressed={role === r.value}
                onClick={() => { setRole(r.value); setPage(0) }}
                className={cx(
                  'h-9 rounded-full border px-4 text-[14px] font-semibold transition-colors',
                  role === r.value ? 'border-brand bg-brand-dim text-brand' : 'border-line text-text-muted hover:text-text',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <form role="search" onSubmit={search} className="ml-auto flex items-center gap-2">
            <label htmlFor="member-search" className="sr-only">이름 또는 이메일</label>
            <input id="member-search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="이름 또는 이메일"
              className="h-9 w-64 rounded-md border border-line-strong bg-panel px-3 text-[14px] text-text" />
            <Button type="submit"><Search size={16} aria-hidden /> 검색</Button>
          </form>
        </div>

        <Panel label="MEMBERS" title="회원 목록" flush
          actions={q.isFetching ? <Loader2 size={16} className="animate-spin text-brand" aria-label="불러오는 중" /> : undefined}>
          {q.error ? (
            <ErrorState compact className="m-4" message={errorMessage(q.error) ?? '회원 목록을 불러오지 못했습니다.'} onRetry={() => void q.refetch()} />
          ) : !data ? (
            <p className="flex items-center gap-2 p-6 text-text-muted"><Loader2 size={18} className="animate-spin" aria-hidden /> 불러오는 중</p>
          ) : data.members.length === 0 ? (
            <p className="p-10 text-center text-[14px] text-text-muted">조건에 맞는 회원이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-[14px]">
                <thead className="bg-panel-raised text-[13px] text-text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left font-normal">회원</th>
                    <th scope="col" className="px-3 py-2 text-left font-normal">역할</th>
                    <th scope="col" className="px-3 py-2 text-left font-normal">가입일</th>
                    <th scope="col" className="px-3 py-2 text-right font-normal">자가진단</th>
                    <th scope="col" className="px-3 py-2 text-right font-normal">평균 점수</th>
                    <th scope="col" className="px-3 py-2 text-right font-normal">크레딧</th>
                    <th scope="col" className="px-4 py-2 text-right font-normal">마지막 응시</th>
                  </tr>
                </thead>
                <tbody>
                  {data.members.map((m) => (
                    <tr key={m.id} className="border-t border-line">
                      <th scope="row" className="px-4 py-2 text-left font-normal">
                        <span className="block font-semibold text-text">{m.name}</span>
                        <span className="block font-mono text-[12px] text-text-muted">{m.email}</span>
                      </th>
                      <td className="px-3 py-2">
                        <span className="text-text">{ROLE_LABEL[m.role]}</span>
                        {m.companyName && <span className="block text-[12px] text-text-muted">{m.companyName}</span>}
                        {m.status === 'PENDING' && <span className="block text-[12px] text-caution">첫 로그인 전</span>}
                      </td>
                      <td className="tnum px-3 py-2 text-text-muted">{day(m.joinedAt)}</td>
                      <td className="tnum px-3 py-2 text-right" title={`시작 ${m.selfAttempts}건 중 제출 ${m.selfSubmitted}건`}>
                        {num(m.selfAttempts)}건 <span className="text-text-muted">(제출 {num(m.selfSubmitted)})</span>
                      </td>
                      <td className="tnum px-3 py-2 text-right font-semibold">{m.averageScore == null ? '—' : `${m.averageScore.toFixed(1)}점`}</td>
                      <td className="tnum px-3 py-2 text-right">{m.creditBalance == null ? <span className="text-text-muted">—</span> : num(m.creditBalance)}</td>
                      <td className="tnum px-4 py-2 text-right text-text-muted">{day(m.lastAttemptAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {data && data.totalPages > 1 && (
          <nav aria-label="페이지" className="flex items-center justify-center gap-3">
            <Button variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={16} aria-hidden /> 이전
            </Button>
            <span className="tnum text-[14px] text-text-muted">{data.page + 1} / {data.totalPages}</span>
            <Button variant="ghost" disabled={page + 1 >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
              다음 <ChevronRight size={16} aria-hidden />
            </Button>
          </nav>
        )}
        <p className="text-[12px] text-text-muted">탈퇴한 회원은 보이지 않습니다. 자가진단 수치는 전체 기간이고 지운 응시는 빠집니다. 크레딧은 일반 회원만 씁니다.</p>
      </div>
    </>
  )
}
