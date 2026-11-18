// DESIGN.md §7-9-4 회차 목록 (ADMIN, COMPANY)
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, Camera, ChevronRight, Plus } from 'lucide-react'
import { cx } from '../../components/cx'
import { PageHeader } from '../../components/SelfShell'
import { ButtonLink, Tabs } from '../../components/ui'
import { companyName, phaseOf, useCompanies, useSessions, type Session, type SessionPhase } from '../../data/consoleSessions'
import { fmtHm, fmtLeft, fmtShort, useMyCompanyId, useNow } from './format'

export default function ConsoleSessions() {
  const all = useSessions()
  const now = useNow(1000)
  const nav = useNavigate()
  const mine = useMyCompanyId()
  const companies = useCompanies()
  const [company, setCompany] = useState<number | 'ALL'>('ALL')
  const visible = all.filter((s) => (mine != null ? s.companyId === mine : company === 'ALL' || s.companyId === company))
  const count = (p: SessionPhase) => visible.filter((s) => phaseOf(s, now) === p).length
  const [tab, setTab] = useState<SessionPhase>(() => (count('live') ? 'live' : 'upcoming'))
  const rows = visible
    .filter((s) => phaseOf(s, now) === tab)
    .sort((a, b) => (tab === 'ended' ? Date.parse(b.startsAt) - Date.parse(a.startsAt) : Date.parse(a.startsAt) - Date.parse(b.startsAt)))

  return (
    <>
      <PageHeader label="SESSIONS" title="시험 회차">
        <ButtonLink to="/console/sessions/new" variant="primary">
          <Plus size={16} aria-hidden /> 회차 만들기
        </ButtonLink>
      </PageHeader>
      <div className="p-8">
        <div className="flex flex-wrap items-end gap-4 border-b border-line">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'live', label: <>진행 중 <Count n={count('live')} live /></> },
              { value: 'upcoming', label: <>예정 <Count n={count('upcoming')} /></> },
              { value: 'ended', label: <>종료 <Count n={count('ended')} /></> },
            ]}
          />
          {mine == null && (
            <label className="ml-auto flex items-center gap-2 pb-2 text-[14px] text-text-muted">
              회사
              <select
                value={company}
                onChange={(e) => setCompany(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                className="h-8 rounded-md border border-line-strong bg-panel px-2 text-[14px] text-text outline-none focus:border-brand"
              >
                <option value="ALL">전체</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-line bg-panel shadow-sm">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <CalendarClock size={28} strokeWidth={1.75} className="text-text-faint" aria-hidden />
              <p className="text-[15px] text-text-muted">{tab === 'live' ? '지금 진행 중인 회차가 없습니다.' : tab === 'upcoming' ? '예정된 회차가 없습니다.' : '끝난 회차가 없습니다.'}</p>
              {tab !== 'ended' && (
                <ButtonLink to="/console/sessions/new" variant="primary" size="sm">
                  <Plus size={14} aria-hidden /> 회차 만들기
                </ButtonLink>
              )}
            </div>
          ) : (
            <table className="w-full text-[14px]">
              <thead>
                <tr className="h-10 border-b border-line text-left">
                  {['회차', '과제', '일시', '대상자', '감독', '상태', ''].map((h, i) => (
                    <th key={i} className={cx('px-4 text-[13px] font-semibold text-text-muted', i === 3 && 'text-right')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <Row
                    key={s.id}
                    s={s}
                    now={now}
                    showCompany={mine == null}
                    onOpen={() => nav(`/console/sessions/${s.id}`)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

function Row({ s, now, showCompany, onOpen }: { s: Session; now: number; showCompany: boolean; onOpen: () => void }) {
  const phase = phaseOf(s, now)
  const entered = s.participants.filter((p) => p.enteredAt).length
  return (
    <tr onClick={onOpen} className="h-14 cursor-pointer border-b border-line last:border-0 hover:bg-panel-raised">
      <td className="px-4 py-2">
        <p className="text-[15px] font-semibold text-text">{s.title}</p>
        {showCompany && <p className="text-[12px] text-text-muted">{companyName(s.companyId)}</p>}
      </td>
      <td className="px-4 text-text-muted">{s.taskTitle}</td>
      <td className="tnum px-4 font-mono text-[13px] text-text-muted">
        {fmtShort(s.startsAt)} – {fmtHm(s.endsAt)}
      </td>
      <td className="tnum px-4 text-right font-mono text-[13px] text-text-muted">
        <span className="text-text">{entered}</span> / {s.participants.length}
      </td>
      <td className="px-4 text-text-muted">{s.proctoring ? <Camera size={16} aria-label="감독 사용" /> : <span aria-label="감독 안 함">—</span>}</td>
      <td className="px-4">
        {phase === 'live' ? (
          <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-alert">
            <i className="rec-pulse size-2 rounded-full bg-alert" aria-hidden />
            진행 중
            <span className="tnum font-mono text-[13px] font-normal text-text-muted">{fmtLeft(Date.parse(s.endsAt) - now)}</span>
          </span>
        ) : phase === 'upcoming' ? (
          <span className="text-[14px] text-info">예정</span>
        ) : (
          <span className="text-[14px] text-text-muted">종료</span>
        )}
      </td>
      <td className="w-10 px-2">
        <ChevronRight size={16} className="text-text-faint" aria-hidden />
      </td>
    </tr>
  )
}

function Count({ n, live }: { n: number; live?: boolean }) {
  return <span className={cx('tnum ml-1 rounded-sm px-1.5 font-mono text-[12px]', live && n > 0 ? 'bg-alert/10 text-alert' : 'bg-panel-raised text-text-muted')}>{n}</span>
}
