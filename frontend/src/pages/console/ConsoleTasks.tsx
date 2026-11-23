// DESIGN.md §7-9-1 과제 목록 (ADMIN). 2026-11-23 정리: 자가진단 → 실전 → 검수 전 순서.
// 위 스포트라이트 = 세 칸 요약(누르면 그 탭) + "과제 만들기" 주인공 버튼. 아래 = 알약 탭(오른쪽에 검색) + 직군 하위 거르기 + 카드 그리드.
// 데이터는 백엔드 /api/console/tasks. 새 칸(track, summary, generated …)은 없을 수 있어 옵셔널로 다룬다.
import { useMemo, useState } from 'react'
import { FileClock, FilePlus2, Search, X, type LucideIcon } from 'lucide-react'
import { cx } from '../../components/cx'
import { ErrorState } from '../../components/ErrorState'
import { CountUp, GradientText, Magnetic, RevealGroup, RevealItem, StageSection } from '../../components/fx'
import { ButtonLink } from '../../components/ui'
import { loadTasks, useTaskList } from '../../data/consoleTasks'
import { countTabs, filterTasks, firstTab, TAB_HINT, TAB_LABEL, TAB_ORDER, trackOf, type TaskTab, type TrackFilter } from '../../data/taskBoard'
import { PillTabs } from './ConsoleHero'
import { TRACK_ICON, USAGE_ICON } from '../../components/domainIcons'
import { TaskCard, TaskCardSkeleton } from './task/TaskCard'

const TAB_ICON: Record<TaskTab, LucideIcon> = { draft: FileClock, public: USAGE_ICON.SELF, private: USAGE_ICON.LIVE }
const TAB_TONE: Record<TaskTab, { num: string; icon: string }> = {
  draft: { num: 'text-stage-caution', icon: 'bg-stage-caution/12 text-stage-caution' },
  public: { num: 'text-stage-brand', icon: 'bg-stage-brand/12 text-stage-brand' },
  private: { num: 'text-stage-text', icon: 'bg-stage-text/8 text-stage-text' },
}
const TABS = TAB_ORDER

export default function ConsoleTasks() {
  const { list, error } = useTaskList()
  const all = useMemo(() => list ?? [], [list])
  const counts = useMemo(() => countTabs(all), [all])
  // 사용자가 탭을 고르기 전에는 자가진단부터 연다 (검수 전이 있으면 탭에 개수 배지가 눈에 띄게 뜬다)
  const [picked, setPicked] = useState<TaskTab | null>(null)
  const tab = picked ?? (list ? firstTab(counts) : 'draft')
  const [track, setTrack] = useState<TrackFilter>('ALL')
  const [q, setQ] = useState('')

  const rows = useMemo(() => filterTasks(all, { tab, track, q }), [all, tab, track, q])
  // 직군 칸의 개수: 지금 상태 탭(과 검색어) 안에서 센다
  const trackCounts = useMemo(() => {
    const inTab = filterTasks(all, { tab, track: 'ALL', q })
    return { ALL: inTab.length, DEV: inTab.filter((t) => trackOf(t) === 'DEV').length, BIZ: inTab.filter((t) => trackOf(t) === 'BIZ').length }
  }, [all, tab, q])
  const filtered = track !== 'ALL' || q.trim() !== ''

  return (
    <>
      <div className="flex flex-col gap-6 px-8 pt-6 pb-12">
        <Summary counts={counts} loading={list == null} tab={tab} onTab={setPicked} />

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <PillTabs
              id="task-tabs"
              label="과제 상태"
              value={tab}
              onChange={setPicked}
              tabs={TABS.map((v) => ({
                value: v,
                hint: TAB_HINT[v],
                label: (
                  <>
                    {TAB_LABEL[v]}
                                        {v === 'draft' && counts.draft > 0 ? (
                      <span className="tnum inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-caution px-1.5 font-mono text-[13px] font-bold text-on-accent ">{counts.draft}</span>
                    ) : (
                      <span className="tnum font-mono text-[13px] opacity-80">{counts[v]}</span>
                    )}
                  </>
                ),
              }))}
            />
            <label className="relative ml-auto w-full sm:w-[320px]">
              <span className="sr-only">과제 검색</span>
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-faint" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="제목, 한 줄 소개, 주제로 찾기"
                className="h-11 w-full rounded-full border border-line-strong bg-panel pr-9 pl-10 text-[14px] outline-none focus:border-brand focus:shadow-[0_0_0_3px_rgb(108_71_255/0.15)]"
              />
              {q && (
                <button type="button" aria-label="검색어 지우기" title="검색어 지우기" onClick={() => setQ('')} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-text-faint hover:text-text">
                  <X size={14} aria-hidden />
                </button>
              )}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <div role="radiogroup" aria-label="직군" className="flex w-fit gap-0.5 rounded-full bg-panel-raised p-0.5">
              {(
                [
                  ['ALL', '전체'],
                  ['DEV', '개발'],
                  ['BIZ', '비개발'],
                ] as const
              ).map(([v, l]) => {
                const Icon = v === 'ALL' ? null : TRACK_ICON[v]
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={track === v}
                    onClick={() => setTrack(v)}
                    className={cx('inline-flex h-7 items-center gap-1 rounded-full px-3 text-[13px] font-semibold transition-colors', track === v ? 'bg-white text-text shadow-sm' : 'text-text-muted hover:text-text')}
                  >
                    {Icon && <Icon size={13} aria-hidden />}
                    {l}
                    <span className="tnum font-mono text-[12px] font-medium opacity-70">{trackCounts[v]}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {error && list == null ? (
          <ErrorState message={error} onRetry={() => void loadTasks()} />
        ) : list == null ? (
          <ul aria-label="과제를 불러오는 중" className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
            {[0, 1, 2].map((i) => (
              <TaskCardSkeleton key={i} />
            ))}
          </ul>
        ) : (
          <>
            {error && <ErrorState compact message={error} onRetry={() => void loadTasks()} />}
            {rows.length === 0 ? (
              <Empty tab={tab} filtered={filtered} total={all.length} onClear={() => (setTrack('ALL'), setQ(''))} />
            ) : (
              <RevealGroup as="ul" key={`${tab}-${track}`} className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
                {rows.map((t) => (
                  <RevealItem key={t.id} as="li" className="flex">
                    <TaskCard task={t} />
                  </RevealItem>
                ))}
              </RevealGroup>
            )}
          </>
        )}
      </div>

    </>
  )
}

/** 이 화면의 스포트라이트: 세 칸 요약(크게) + 다음에 할 일 문장 + 주인공 버튼 */
function Summary({ counts, loading, tab, onTab }: { counts: Record<TaskTab, number>; loading: boolean; tab: TaskTab; onTab: (t: TaskTab) => void }) {
  const next = loading
    ? '과제를 불러오는 중이에요.'
    : counts.draft > 0
      ? `검수 전 과제 ${counts.draft}개가 사람의 확인을 기다려요. 확인하고 공개하세요.`
      : '검수할 과제가 없어요. 새 과제를 만들어 보세요.'
  return (
    <StageSection aria-label="과제 요약" className="px-8 py-7">
      <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
        <div className="min-w-[260px] flex-1">
          <p className="label text-stage-brand">TASK STUDIO</p>
          <h1 className="mt-1 text-[30px] leading-10 font-extrabold tracking-[-0.03em] break-keep text-stage-text">
            과제를 만들고, <GradientText>검수</GradientText>하고, 내보내요
          </h1>
          <p className="mt-2 text-[15px] font-medium break-keep text-stage-muted" aria-live="polite">
            {next}
          </p>
          <Magnetic className="mt-5 inline-block">
            <ButtonLink to="/console/tasks/new" variant="primary" size="lg" className="h-12 rounded-full px-6 text-[16px] shadow-[0_12px_32px_-12px_rgb(108_71_255/0.7)]">
              <FilePlus2 size={18} aria-hidden /> 과제 만들기
            </ButtonLink>
          </Magnetic>
        </div>
        <div role="group" aria-label="상태별 과제 수" className="grid w-full grid-cols-3 gap-3 lg:w-auto">
          {TABS.map((v) => {
            const Icon = TAB_ICON[v]
            const on = tab === v
            return (
              <button
                key={v}
                type="button"
                onClick={() => onTab(v)}
                aria-pressed={on}
                className={cx(
                  'glass-stage flex min-w-[150px] flex-col gap-2 rounded-2xl border px-5 py-4 text-left transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:shadow-md',
                  on ? 'border-stage-line-strong shadow-md ring-2 ring-stage-brand/40' : 'border-stage-line',
                )}
              >
                <span className="flex items-center gap-2">
                  <span className={cx('inline-flex size-8 items-center justify-center rounded-lg', TAB_TONE[v].icon)}>
                    <Icon size={17} aria-hidden className={v === 'draft' && counts.draft > 0 ? 'rec-pulse' : undefined} />
                  </span>
                  <span className="text-[14px] font-bold text-stage-text">{TAB_LABEL[v]}</span>
                </span>
                <span className="flex items-baseline gap-1">
                  {loading ? (
                    <span className="font-mono text-[40px] leading-[48px] font-semibold text-stage-faint">-</span>
                  ) : (
                    <CountUp value={counts[v]} className={cx('font-mono text-[40px] leading-[48px] font-semibold', counts[v] > 0 ? TAB_TONE[v].num : 'text-stage-faint')} />
                  )}
                  <span className="text-[13px] font-medium text-stage-muted">개</span>
                </span>
                <span className="text-[12px] leading-4 break-keep text-stage-muted">{v === 'public' ? '누구나 풀 수 있어요' : v === 'private' ? '회차에만 써요' : '검수를 기다려요'}</span>
              </button>
            )
          })}
        </div>
      </div>
    </StageSection>
  )
}

function Empty({ tab, filtered, total, onClear }: { tab: TaskTab; filtered: boolean; total: number; onClear: () => void }) {
  const Icon = TAB_ICON[tab]
  const text = filtered
    ? '조건에 맞는 과제가 없어요. 직군이나 검색어를 바꿔 보세요.'
    : total === 0
      ? '아직 과제가 하나도 없어요. AI에게 첫 과제를 맡겨 볼까요?'
      : tab === 'draft'
        ? '검수할 과제가 없어요. 모두 확인했어요!'
        : tab === 'public'
          ? '아직 자가진단 과제가 없어요. 검수 전 과제를 확인하고 올려 보세요.'
          : '아직 실전 과제가 없어요. 회차에 쓸 과제를 만들어 보세요.'
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line-strong bg-panel/70 px-6 py-16 text-center">
      <span className="relative inline-flex size-16 items-center justify-center rounded-2xl bg-brand-dim text-brand">
        <span aria-hidden className="absolute inset-0 rounded-2xl bg-brand/10 blur-xl" />
        <Icon size={28} strokeWidth={1.75} aria-hidden className="relative" />
      </span>
      <p className="max-w-[420px] text-[16px] font-semibold break-keep text-text">{text}</p>
      {filtered ? (
        <button type="button" onClick={onClear} className="text-[14px] font-semibold text-brand hover:underline">
          거르기 풀기
        </button>
      ) : (
        <ButtonLink to="/console/tasks/new" variant="primary">
          <FilePlus2 size={16} aria-hidden /> 과제 만들기
        </ButtonLink>
      )}
    </div>
  )
}
