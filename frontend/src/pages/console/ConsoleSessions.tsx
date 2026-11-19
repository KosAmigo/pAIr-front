// DESIGN.md §7-9-4 회차 목록 (ADMIN, MANAGER, PROCTOR). 회차 만들기는 ADMIN·MANAGER만
// 2026-11-19 개편 "관제 보드": 위에 단계 카드 3장(진행 중 / 예정 / 종료)이 탭 역할을 한다.
// 진행 중을 고르면 이 화면의 다크 무대에 진행 중 회차가 큰 카드로 뜬다(남은 시간, 진행 막대, 입장, 미확인 이벤트).
// 예정·종료는 표 그대로(표 안쪽은 깨끗하게).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, CalendarClock, Camera, ChevronRight, CircleAlert, Plus, Radio, Users } from 'lucide-react'
import { cx } from '../../components/cx'
import { PageHeader } from '../../components/SelfShell'
import { ButtonLink } from '../../components/ui'
import { Reveal, RevealGroup, RevealItem, Spotlight, StageSection } from '../../components/fx'
import { StatTabs } from './StatTabs'
import { companyName, enteredCount, openEventCount, participantCount, phaseOf, taskTitles, useCompanies, useSessions, useSessionsLoad, type Session, type SessionPhase } from '../../data/consoleSessions'
import { fmtHm, fmtLeft, fmtShort, useMyCompanyId, useNow } from './format'
import { canManageSessions, useAuth } from '../../auth/auth'

export default function ConsoleSessions() {
  const all = useSessions()
  const load = useSessionsLoad()
  const now = useNow(1000)
  const nav = useNavigate()
  const mine = useMyCompanyId()
  const canCreate = canManageSessions(useAuth().user?.role)
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
        {canCreate && (
          <ButtonLink to="/console/sessions/new" variant="primary">
            <Plus size={16} aria-hidden /> 회차 만들기
          </ButtonLink>
        )}
      </PageHeader>
      <div className="flex flex-col gap-6 p-8">
        {load.error && (
          <p role="alert" className="rounded-md bg-alert/8 px-4 py-3 text-[14px] text-alert">
            회차를 불러오지 못했습니다: {load.error}
          </p>
        )}
        {/* 단계 카드 3장 = 탭 */}
        <div className="flex items-end gap-4">
          <StatTabs
            id="session-phase"
            label="회차 단계"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'live', label: '진행 중', hint: '지금 응시가 열려 있는 회차', icon: Radio, n: count('live'), tone: 'alert' },
              { value: 'upcoming', label: '예정', hint: '시작 전 회차', icon: CalendarClock, n: count('upcoming') },
              { value: 'ended', label: '종료', hint: '결과를 볼 수 있는 회차', icon: CalendarCheck, n: count('ended') },
            ]}
          />
          {mine == null && (
            <label className="flex items-center gap-2 pb-1 text-[14px] text-text-muted">
              회사
              <select
                value={company}
                onChange={(e) => setCompany(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                className="h-9 rounded-md border border-line-strong bg-panel px-2 text-[14px] text-text outline-none focus:border-brand"
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

        {tab === 'live' && rows.length > 0 && <LiveBoard rows={rows} now={now} showCompany={mine == null} onOpen={(id) => nav(`/console/sessions/${id}`)} />}

        {!(tab === 'live' && rows.length > 0) && (
        <Reveal className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <CalendarClock size={28} strokeWidth={1.75} className="text-text-faint" aria-hidden />
              <p className="text-[15px] text-text-muted">{tab === 'live' ? '지금 진행 중인 회차가 없습니다.' : tab === 'upcoming' ? '예정된 회차가 없습니다.' : '끝난 회차가 없습니다.'}</p>
              {tab !== 'ended' && canCreate && (
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
              <tbody className="fx-rows">
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
        </Reveal>
        )}
      </div>
    </>
  )
}

function Row({ s, now, showCompany, onOpen }: { s: Session; now: number; showCompany: boolean; onOpen: () => void }) {
  const phase = phaseOf(s, now)
  const entered = enteredCount(s)
  return (
    <tr onClick={onOpen} className="h-14 cursor-pointer border-b border-line last:border-0 hover:bg-panel-raised">
      <td className="px-4 py-2">
        <p className="text-[15px] font-semibold text-text">
          {s.title}
          {s.canceledAt && <span className="ml-2 text-[12px] font-semibold text-alert">취소</span>}
        </p>
        {showCompany && <p className="text-[12px] text-text-muted">{companyName(s.companyId)}</p>}
      </td>
      <td className="px-4 text-text-muted">{taskTitles(s)}</td>
      <td className="tnum px-4 font-mono text-[13px] text-text-muted">
        {fmtShort(s.startsAt)} – {fmtHm(s.endsAt)}
      </td>
      <td className="tnum px-4 text-right font-mono text-[13px] text-text-muted">
        <span className="text-text">{entered}</span> / {participantCount(s)}
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

/** 진행 중 회차: 다크 무대 위 큰 카드 */
function LiveBoard({ rows, now, showCompany, onOpen }: { rows: Session[]; now: number; showCompany: boolean; onOpen: (id: string) => void }) {
  return (
    <StageSection aria-label="진행 중 회차">
      <div className="px-8 py-7">
        <p className="flex items-center gap-2 font-mono text-[12px] font-semibold tracking-[0.12em] text-stage-alert">
          <i className="rec-pulse size-2 rounded-full bg-stage-alert" aria-hidden /> LIVE NOW
        </p>
        <RevealGroup className="mt-4 grid grid-cols-2 gap-4">
          {rows.map((s) => {
            const left = Date.parse(s.endsAt) - now
            const total = Date.parse(s.endsAt) - Date.parse(s.startsAt)
            const entered = enteredCount(s)
            const open = openEventCount(s)
            return (
              <RevealItem key={s.id} className="flex">
                <Spotlight
                  as="button"
                  type="button"
                  onClick={() => onOpen(s.id)}
                  className="glass-stage flex w-full flex-col gap-4 rounded-xl p-5 text-left transition-[transform,box-shadow] duration-150 hover:-translate-y-1 hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-stage-brand)_50%,transparent),0_0_48px_color-mix(in_srgb,var(--color-stage-brand)_30%,transparent)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[18px] font-bold text-stage-text">{s.title}</p>
                      <p className="truncate text-[13px] text-stage-muted">
                        {showCompany && `${companyName(s.companyId)} │ `}
                        {taskTitles(s)}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-stage-muted" aria-hidden />
                  </div>
                  <div className="flex items-end gap-6">
                    <div>
                      <span className="label text-stage-muted">REMAINING</span>
                      <p className={cx('tnum font-mono text-[44px] leading-[48px] font-semibold', left <= 3 * 60_000 ? 'text-stage-alert' : left <= 10 * 60_000 ? 'text-stage-caution' : 'text-stage-text')}>
                        {fmtLeft(left)}
                      </p>
                    </div>
                    <div className="ml-auto flex shrink-0 gap-4 pb-1.5 text-[14px] whitespace-nowrap text-stage-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <Users size={16} aria-hidden />
                        <b className="tnum font-mono text-stage-text">{entered}</b>/{participantCount(s)}
                      </span>
                      <span className={cx('inline-flex items-center gap-1.5', open > 0 && 'text-stage-caution')}>
                        <CircleAlert size={16} aria-hidden />
                        미확인 <b className="tnum font-mono">{open}</b>
                      </span>
                      {s.proctoring && <Camera size={16} aria-label="감독 사용" />}
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-stage-raised">
                    <div
                      className="bg-brand-gradient h-full w-full origin-left rounded-full transition-transform duration-1000"
                      style={{ transform: `scaleX(${Math.min(1, Math.max(0, (total - left) / total))})` }}
                    />
                  </div>
                  <p className="tnum font-mono text-[12px] text-stage-faint">
                    {fmtShort(s.startsAt)} – {fmtHm(s.endsAt)}
                  </p>
                </Spotlight>
              </RevealItem>
            )
          })}
        </RevealGroup>
      </div>
    </StageSection>
  )
}
