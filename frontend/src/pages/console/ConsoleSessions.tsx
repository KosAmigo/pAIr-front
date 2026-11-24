// DESIGN.md §7-9-4 회차 목록 (ADMIN, MANAGER, PROCTOR). 회차 만들기는 MANAGER만
// 2026-11-19 개편 "관제 보드": 위에 단계 카드 3장(진행 중 / 예정 / 종료)이 탭 역할을 한다.
// 진행 중을 고르면 이 화면의 다크 무대에 진행 중 회차가 큰 카드로 뜬다(남은 시간, 진행 막대, 입장, 미확인 이벤트).
// 예정·종료는 표 그대로(표 안쪽은 깨끗하게). 회차는 백엔드에서 불러오고 30초마다 다시 부른다(단계는 백엔드 phase).
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, CalendarClock, Camera, ChevronRight, CircleAlert, Plus, Radio, Users, type LucideIcon } from 'lucide-react'
import { cx } from '../../components/cx'
import { Select } from '../../components/Select'
import { ButtonLink } from '../../components/ui'
import { CountUp, GradientText, Magnetic, Reveal, RevealGroup, RevealItem, Spotlight, StageSection } from '../../components/fx'
import { PillTabs } from './ConsoleHero'
import { companyLabel, taskTitlesOf, useLoad, useTaskMap } from '../../data/consoleSessions'
import { consoleApi, type ConsoleTaskSummary, type SessionSummary } from '../../consoleApi'
import { ErrorState } from '../../components/ErrorState'
import { fmtHm, fmtLeft, fmtShort, useMyCompanyId, useNow } from './format'
import { Loading } from './Loading'
import { canCreateSessions, useAuth } from '../../auth/auth'

type Tab = 'live' | 'upcoming' | 'ended'
/** 취소한 회차는 종료 칸에 함께 보인다 */
const tabOf = (s: SessionSummary): Tab => (s.phase === 'LIVE' ? 'live' : s.phase === 'UPCOMING' ? 'upcoming' : 'ended')

export default function ConsoleSessions() {
  const list = useLoad('console-sessions', () => consoleApi.sessions(), 30_000)
  const tasks = useTaskMap()
  const all = list.data ?? []
  const now = useNow(1000)
  const nav = useNavigate()
  const mine = useMyCompanyId()
  const canCreate = canCreateSessions(useAuth().user?.role)
  const companyIds = [...new Set(all.map((s) => s.companyId))].sort((a, b) => a - b)
  const [company, setCompany] = useState<number | 'ALL'>('ALL')
  const visible = all.filter((s) => mine != null || company === 'ALL' || s.companyId === company)
  const count = (p: Tab) => visible.filter((s) => tabOf(s) === p).length
  const [picked, setTab] = useState<Tab | null>(null)
  // 새로 시작한 회차(진행 중 개수가 늘어남)가 생기면 "진행 중" 탭으로 옮긴다.
  // 안 그러면 예정·종료 탭을 눌러 둔 채 카드 숫자만 늘고 아래 표에는 시작된 회차가 보이지 않는다
  const liveCount = count('live')
  const [prevLive, setPrevLive] = useState(liveCount)
  if (liveCount !== prevLive) {
    setPrevLive(liveCount)
    if (liveCount > prevLive) setTab('live')
  }
  const tab: Tab = picked ?? (liveCount ? 'live' : 'upcoming')
  const rows = visible
    .filter((s) => tabOf(s) === tab)
    .sort((a, b) => (tab === 'ended' ? Date.parse(b.startsAt) - Date.parse(a.startsAt) : Date.parse(a.startsAt) - Date.parse(b.startsAt)))

  const ph: { value: Tab; label: string; hint: string; icon: LucideIcon; tone: { num: string; icon: string }; sub: string }[] = [
    { value: 'live', label: '진행 중', hint: '지금 응시가 열려 있는 회차', icon: Radio, tone: { num: 'text-stage-alert', icon: 'bg-stage-alert/12 text-stage-alert' }, sub: '지금 응시 중' },
    { value: 'upcoming', label: '예정', hint: '시작 전 회차', icon: CalendarClock, tone: { num: 'text-stage-brand', icon: 'bg-stage-brand/12 text-stage-brand' }, sub: '시작 전' },
    { value: 'ended', label: '종료', hint: '결과를 볼 수 있는 회차', icon: CalendarCheck, tone: { num: 'text-stage-text', icon: 'bg-stage-text/8 text-stage-text' }, sub: '결과 확인' },
  ]
  const loading = list.data == null && !list.error
  const next = loading
    ? '회차를 불러오는 중이에요.'
    : liveCount > 0
      ? `지금 ${liveCount}개 회차가 진행 중이에요. 응시 현황을 확인하세요.`
      : canCreate
        ? '진행 중인 회차가 없어요. 새 회차를 만들어 대상자에게 입장 링크를 보내세요.'
        : '진행 중인 회차가 없어요.'

  return (
    <>
      <div className="flex flex-col gap-6 px-8 pt-6 pb-12">
        <StageSection aria-label="회차 요약" className="px-8 py-7">
          <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
            <div className="min-w-[260px] flex-1">
              <p className="label text-stage-brand">SESSIONS</p>
              <h1 className="mt-1 text-[30px] leading-10 font-extrabold tracking-[-0.03em] break-keep text-stage-text">
                시험 <GradientText>회차</GradientText>를 관리해요
              </h1>
              <p className="mt-2 text-[15px] font-medium break-keep text-stage-muted" aria-live="polite">
                {next}
              </p>
              {canCreate && (
                <Magnetic className="mt-5 inline-block">
                  <ButtonLink to="/console/sessions/new" variant="primary" size="lg" className="h-12 rounded-full px-6 text-[16px] shadow-[0_12px_32px_-12px_rgb(108_71_255/0.7)]">
                    <Plus size={18} aria-hidden /> 회차 만들기
                  </ButtonLink>
                </Magnetic>
              )}
            </div>
            <div role="group" aria-label="단계별 회차 수" className="grid w-full grid-cols-3 gap-3 lg:w-auto">
              {ph.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTab(t.value)}
                  aria-pressed={tab === t.value}
                  title={t.hint}
                  className={cx(
                    'glass-stage flex min-w-[150px] flex-col gap-2 rounded-2xl border px-5 py-4 text-left transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:shadow-md',
                    tab === t.value ? 'border-stage-line-strong shadow-md ring-2 ring-stage-brand/40' : 'border-stage-line',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className={cx('inline-flex size-8 items-center justify-center rounded-lg', t.tone.icon)}>
                      <t.icon size={17} aria-hidden className={t.value === 'live' && count('live') > 0 ? 'rec-pulse' : undefined} />
                    </span>
                    <span className="text-[14px] font-bold text-stage-text">{t.label}</span>
                  </span>
                  <span className="flex items-baseline gap-1">
                    {loading ? (
                      <span className="font-mono text-[40px] leading-[48px] font-semibold text-stage-faint">-</span>
                    ) : (
                      <CountUp value={count(t.value)} className={cx('font-mono text-[40px] leading-[48px] font-semibold', count(t.value) > 0 ? t.tone.num : 'text-stage-faint')} />
                    )}
                    <span className="text-[13px] font-medium text-stage-muted">개</span>
                  </span>
                  <span className="text-[12px] leading-4 break-keep text-stage-muted">{t.sub}</span>
                </button>
              ))}
            </div>
          </div>
        </StageSection>

        <div className="flex flex-wrap items-center gap-3">
          <PillTabs
            id="session-tabs"
            label="회차 단계"
            value={tab}
            onChange={setTab}
            tabs={ph.map((t) => ({
              value: t.value,
              hint: t.hint,
              label: (
                <>
                  {t.label}
                  <span className="tnum font-mono text-[13px] opacity-80">{count(t.value)}</span>
                </>
              ),
            }))}
          />
          {mine == null && (
            <div className="ml-auto flex items-center gap-2 text-[14px] text-text-muted">
              회사
              <Select
                value={company}
                onChange={setCompany}
                ariaLabel="회사"
                options={[{ value: 'ALL', label: '전체' }, ...companyIds.map((id) => ({ value: id, label: companyLabel(id) }))]}
                className="min-w-32"
              />
            </div>
          )}
        </div>

        {list.error && !list.data && <ErrorState message={list.error} onRetry={list.reload} />}
        {list.error && list.data && <ErrorState compact message={list.error} onRetry={list.reload} />}
        {list.loading && <Loading text="회차를 불러오는 중" />}

        {tab === 'live' && rows.length > 0 && <LiveBoard rows={rows} now={now} tasks={tasks.map} showCompany={mine == null} onOpen={(id) => nav(`/console/sessions/${id}`)} />}

        {list.data && !(tab === 'live' && rows.length > 0) && (
        <Reveal className="overflow-hidden rounded-2xl border border-line bg-panel shadow-sm">
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
                    tasks={tasks.map}
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

function Row({ s, now, tasks, showCompany, onOpen }: { s: SessionSummary; now: number; tasks: Map<string, ConsoleTaskSummary>; showCompany: boolean; onOpen: () => void }) {
  const phase = s.phase
  return (
    <tr onClick={onOpen} className="h-14 cursor-pointer border-b border-line last:border-0 hover:bg-panel-raised">
      <td className="px-4 py-2">
        <p className="text-[15px] font-semibold text-text">{s.title}</p>
        {showCompany && <p className="text-[12px] text-text-muted">{companyLabel(s.companyId)}</p>}
      </td>
      <td className="px-4 text-text-muted">{taskTitlesOf(tasks, s.taskIds)}</td>
      <td className="tnum px-4 font-mono text-[13px] text-text-muted">
        {fmtShort(s.startsAt)} – {fmtHm(s.endsAt)}
      </td>
      <td className="tnum px-4 text-right font-mono text-[13px] text-text-muted">
        <span className="text-text">{s.entered}</span> / {s.participants}
      </td>
      <td className="px-4 text-text-muted">{s.proctoring ? <Camera size={16} aria-label="감독 사용" /> : <span aria-label="감독 안 함">—</span>}</td>
      <td className="px-4">
        {phase === 'LIVE' ? (
          <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-alert">
            <i className="rec-pulse size-2 rounded-full bg-alert" aria-hidden />
            진행 중
            <span className="tnum font-mono text-[13px] font-normal text-text-muted">{fmtLeft(Date.parse(s.endsAt) - now)}</span>
          </span>
        ) : phase === 'UPCOMING' ? (
          <span className="text-[14px] text-info">예정</span>
        ) : phase === 'CANCELED' ? (
          <span className="text-[14px] text-text-faint">취소됨</span>
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
function LiveBoard({ rows, now, tasks, showCompany, onOpen }: { rows: SessionSummary[]; now: number; tasks: Map<string, ConsoleTaskSummary>; showCompany: boolean; onOpen: (id: number) => void }) {
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
            const open = s.unreviewedEvents
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
                        {showCompany && `${companyLabel(s.companyId)} │ `}
                        {taskTitlesOf(tasks, s.taskIds)}
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
                        <b className="tnum font-mono text-stage-text">{s.entered}</b>/{s.participants}
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
