// DESIGN.md §7-9-5 회사 (ADMIN): 목록, 상세(회사 정보, 담당자 계정, 회차)
// 회사 상세의 회차 목록은 기존 콘솔 API에서 불러온다.
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Building2, ChevronRight, CircleAlert } from 'lucide-react'
import { cx } from '../../components/cx'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { ErrorState } from '../../components/ErrorState'
import { PageHeader } from '../../components/SelfShell'
import { CompanyAccounts, CompanyList, InquiryList } from './CompanyAdministration'
import { ConsoleHero } from './ConsoleHero'
import { consoleApi } from '../../consoleApi'
import { companyLabel, PHASE_LABEL, taskTitlesOf, useLoad, useTaskMap } from '../../data/consoleSessions'
import { fmtHm, fmtShort } from './format'
import { Loading } from './Loading'

// ── 목록 ──
export default function ConsoleCompanies() {
  return (
    <>
      <PageHeader label="COMPANIES" title="회사" />
      <div className="flex flex-col gap-6 p-8">
        <InquiryList />
        <CompanyList />
      </div>
    </>
  )
}

// ── 상세 ──
export function ConsoleCompanyDetail() {
  const { companyId } = useParams()
  const id = Number(companyId)
  if (!Number.isInteger(id) || id <= 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-32 text-center">
        <CircleAlert size={28} className="text-text-faint" aria-hidden />
        <p className="text-[15px] text-text-muted">찾을 수 없는 회사입니다.</p>
        <Link to="/console/companies" className="text-[14px] font-semibold text-brand hover:underline">
          회사 목록으로
        </Link>
      </div>
    )
  }
  return <CompanyDetail key={id} id={id} />
}

function CompanyDetail({ id }: { id: number }) {
  useConsoleCrumbs([companyLabel(id)])
  const nav = useNavigate()
  const list = useLoad(`company-sessions-${id}`, () => consoleApi.sessions(id))
  const tasks = useTaskMap()
  const sessions = [...(list.data ?? [])].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))

  return (
    <>
      {/* 2026-11-19 개편: 머리는 다크 무대 카드(ConsoleHero) */}
      <div className="px-8 pt-6">
        <ConsoleHero
          label="회사 요약"
          badge={
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-stage-raised px-2.5 text-[13px] font-semibold text-stage-muted">
              <Building2 size={14} aria-hidden /> COMPANY
            </span>
          }
          title={companyLabel(id)}
          meta={<span className="font-sans">회사 회원 및 회차 관리</span>}
          stats={list.data ? [{ label: 'SESSIONS', value: sessions.length, unit: '회' }] : []}
        />
      </div>
      <div className="grid gap-6 p-8 xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <CompanyAccounts id={id} />

        <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
          <header className="flex h-12 items-center gap-2 border-b border-line px-4">
            <span className="label">SESSIONS</span>
            <h2 className="text-[16px] font-semibold text-text">회차</h2>
            {list.data && <span className="tnum ml-auto font-mono text-[12px] text-text-muted">{sessions.length}개</span>}
          </header>
          {list.error ? (
            <ErrorState compact className="m-4" message={list.error} onRetry={list.reload} />
          ) : list.loading ? (
            <Loading text="회차를 불러오는 중" />
          ) : sessions.length === 0 ? (
            <p className="py-12 text-center text-[14px] text-text-muted">아직 연 회차가 없습니다.</p>
          ) : (
            <ol className="fx-cards relative py-2">
              {/* 회차 타임라인: 최신이 위. 세로 줄 위의 점이 단계를 보여 준다(글자도 오른쪽에 같이) */}
              <span aria-hidden className="absolute top-7 bottom-7 left-[27px] w-0.5 rounded-full bg-line" />
              {sessions.map((s) => {
                const ph = s.phase
                return (
                  <li key={s.id} className="relative">
                    <button type="button" onClick={() => nav(`/console/sessions/${s.id}`)} className="flex min-h-16 w-full items-center gap-4 px-4 py-2 text-left hover:bg-panel-raised">
                      <span aria-hidden className="relative z-10 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-panel">
                        <span className={cx('size-3 rounded-full', ph === 'LIVE' ? 'rec-pulse bg-alert' : ph === 'UPCOMING' ? 'border-2 border-info bg-panel' : 'bg-line-strong')} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-text">{s.title}</span>
                        <span className="text-[13px] text-text-muted">{taskTitlesOf(tasks.map, s.taskIds)}</span>
                      </span>
                      <span className="tnum font-mono text-[13px] text-text-muted">
                        {fmtShort(s.startsAt)} – {fmtHm(s.endsAt)}
                      </span>
                      <span className={cx('w-16 text-right text-[13px] font-semibold', ph === 'LIVE' ? 'text-alert' : ph === 'UPCOMING' ? 'text-info' : 'text-text-muted')}>{PHASE_LABEL[ph]}</span>
                      <ChevronRight size={16} className="text-text-faint" aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>
    </>
  )
}
