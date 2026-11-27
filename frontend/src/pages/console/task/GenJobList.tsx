// 만드는 중인 과제 목록 (왼쪽, 좁고 촘촘하게). 묶음(batchId)마다 머리줄 하나(직군·시간·개수·끝난 수 + 작은 진행 막대)와 접었다 펼치는 행들.
// 머리는 두 줄(이름·방식/마감·진행 링, 작업마다 한 칸인 막대)만 둔다.
// 펼침: 진행 중인 묶음은 펼침, 끝난 묶음은 접힘이 기본이고 사용자가 바꾼 상태는 기억한다(localStorage). 높이는 부드럽게 바뀌고 움직임 줄이기에서는 바로 바뀐다.
// 행은 한 줄: 상태 점 + 주제(한 줄 말줄임) + 짧은 상태 글. 자세한 글(세부 단계·마감·검사 요약)은 title·화면 읽기용으로만 둔다.
// 머리에는 새로고침 아이콘 버튼 하나뿐(누르면 바로 다시 불러온다, 마우스를 올리면 마지막 갱신 시각). 자동 갱신은 뒤에서 그대로 돈다.
import { useState } from 'react'
import { Check, ChevronRight, CircleAlert, Layers, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { cx } from '../../../components/cx'
import { TRACK_ICON } from '../../../components/domainIcons'
import { CountUp } from '../../../components/fx'
import { canCancel, cancelErrorMessage, costLabel, fmtClock, fmtUsd, groupCost, groupJobs, jobView, taskGenApi, type JobGroup, type JobRow, type JobTone } from '../../../data/taskGen'
import { DOT } from './formConsts'
import { TRACK_TONE } from './trackTone'

const OPEN_KEY = 'pair.genGroups'
type OpenMap = Record<string, boolean>
const loadOpen = (): OpenMap => {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') as OpenMap
  } catch {
    return {}
  }
}
const isLive = (g: JobGroup) => g.counts.QUEUED + g.counts.RUNNING > 0
/** 묶음 상태: live = 도는 중(그라데이션 테두리·빛), failed = 끝났는데 실패가 섞임(경고), done = 모두 끝남(성공 톤) */
type GroupState = 'live' | 'failed' | 'done'
const groupState = (g: Pick<JobGroup, 'counts'>): GroupState =>
  g.counts.QUEUED + g.counts.RUNNING > 0 ? 'live' : g.counts.FAILED > 0 ? 'failed' : 'done'
const CARD: Record<GroupState, string> = {
  live: 'border-transparent bg-[linear-gradient(#fff,#fff)_padding-box,linear-gradient(120deg,#8b5cf6,#6c47ff_45%,#2f5bea)_border-box] shadow-[0_10px_30px_-14px_rgb(108_71_255/0.55)]',
  failed: 'border-caution/40 bg-caution/5 shadow-sm',
  done: 'border-signal/35 bg-signal/5 shadow-sm',
}
const clock = (ms: number | null) =>
  ms === null ? '아직 못 불러왔어요' : `마지막 갱신 ${[new Date(ms).getHours(), new Date(ms).getMinutes(), new Date(ms).getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')}`

export function GenJobList({
  rows,
  error,
  selected,
  fetchedAt,
  refreshing,
  onSelect,
  onChanged,
  onRefresh,
}: {
  rows: JobRow[] | null
  error: string | null
  selected: string | null
  fetchedAt: number | null
  refreshing: boolean
  onSelect: (jobId: string) => void
  onChanged: () => void
  onRefresh: () => void
}) {
  const [notice, setNotice] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [opened, setOpened] = useState<OpenMap>(loadOpen)
  const groups = rows ? groupJobs(rows) : []

  const toggle = (g: JobGroup) => {
    const next = { ...opened, [g.key]: !(opened[g.key] ?? isLive(g)) }
    setOpened(next)
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next))
    } catch {
      /* 저장이 막혀도 이번 화면에서는 동작한다 */
    }
  }

  const cancel = async (j: JobRow) => {
    setCancelling(j.jobId)
    setNotice(null)
    try {
      await taskGenApi.cancel(j.jobId)
    } catch (e) {
      setNotice(cancelErrorMessage(e))
    } finally {
      setCancelling(null)
      onChanged()
    }
  }

  return (
    <section aria-labelledby="gen-jobs-title" className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-1">
        <h2 id="gen-jobs-title" className="text-[15px] font-extrabold tracking-[-0.01em] text-text">
          진행 목록
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="새로고침"
          title={clock(fetchedAt)}
          className="ml-auto inline-flex size-10 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 outline-none hover:bg-panel-raised hover:text-text focus-visible:ring-4 focus-visible:ring-brand/30"
        >
          <RefreshCw size={16} aria-hidden className={refreshing ? 'motion-safe:animate-spin' : undefined} />
        </button>
      </div>

      {(notice || error) && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert/8 px-3 py-2 text-[13px] leading-5 break-keep text-text">
          <CircleAlert size={16} className="mt-0.5 shrink-0 text-alert" aria-hidden /> {notice ?? `목록을 불러오지 못했어요. ${error}`}
        </p>
      )}

      {rows === null && !error && <p className="text-[13px] text-text-muted">불러오는 중…</p>}
      {rows !== null && groups.length === 0 && <p className="rounded-lg border border-dashed border-line-strong px-3 py-4 text-[13px] text-text-muted">작업이 없어요.</p>}

      <ul className="flex flex-col gap-2">
        {groups.map((g) => {
          const open = !g.batchId || (opened[g.key] ?? isLive(g))
          return (
            <li key={g.key} data-testid="gen-group" data-state={g.batchId ? groupState(g) : 'single'} className={cx('overflow-hidden rounded-xl border', g.batchId ? CARD[groupState(g)] : 'border-line bg-panel shadow-sm')}>
              {g.batchId && <GroupHead g={g} open={open} onToggle={() => toggle(g)} />}
              {/* 높이 전환: grid 행을 0fr → 1fr 로 (움직임 줄이기에서는 바로) */}
              <div className={cx('grid transition-[grid-template-rows] duration-[260ms] ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                <div className={cx('min-h-0 overflow-hidden transition-[visibility] duration-[260ms] motion-reduce:transition-none', open ? 'visible' : 'invisible')}>
                  <ul className={cx('divide-y divide-line', g.batchId && 'border-t border-line')}>
                    {g.jobs.map((j) => (
                      <li key={j.jobId} data-testid="gen-job">
                        <JobItem job={j} on={selected === j.jobId} busy={cancelling === j.jobId} onSelect={() => onSelect(j.jobId)} onCancel={() => void cancel(j)} />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** 묶음 머리줄(두 줄): 직군 타일 + 이름·분 + 방식/마감 한 줄 + 진행 링(n/m) + 펼침 화살표, 그 아래 작업마다 한 칸인 진행 막대.
 * 개수(진행·대기·완료·실패)는 화면 읽기용 이름과 칸의 색·title 로만 보인다. */
function GroupHead({ g, open, onToggle }: { g: JobGroup; open: boolean; onToggle: () => void }) {
  const first = g.jobs[0]
  const total = g.jobs.length
  const c = g.counts
  const ended = c.DONE + c.FAILED + c.CANCELED
  const state = groupState(g)
  const Icon = first?.track ? TRACK_ICON[first.track] : Layers
  const tone = first?.track ? TRACK_TONE[first.track] : { tile: 'bg-panel-raised text-text-muted', text: '', ring: '' }
  const name = first?.track === 'BIZ' ? '비개발' : first?.track === 'DEV' ? '개발' : '자동 생성'
  const batch = first?.mode === 'BATCH'
  const deadline = batch ? fmtClock(first?.deadlineAt) : null
  const pct = total ? ended / total : 0
  const sum = groupCost(g.jobs)
  const live = state === 'live'
  const R = 15
  const C = 2 * Math.PI * R
  const counts = (
    [
      ['진행', c.RUNNING],
      ['대기', c.QUEUED],
      ['완료', c.DONE],
      ['실패', c.FAILED],
    ] as const
  )
    .filter(([, n]) => n > 0)
    .map(([l, n]) => `${l} ${n}`)
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={[`자동 생성 묶음 ${name} ${total}개 중 ${ended}개 끝남`, ...counts].join(' · ')}
      className="group/head flex w-full flex-col gap-2.5 px-3 pt-3 pb-3 text-left outline-none hover:bg-white/50 focus-visible:ring-4 focus-visible:ring-brand/30 focus-visible:ring-inset"
    >
      <span className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cx(
            'relative inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] ring-1',
            state === 'live' ? 'bg-brand-gradient text-white shadow-[0_6px_16px_-6px_rgb(108_71_255/0.7)] ring-white/30' : cx(tone.tile, tone.ring),
          )}
        >
          <Icon size={17} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-[15px] leading-5 font-extrabold tracking-[-0.01em] text-text">
            <span className="truncate">{name}</span>
            {first?.minutes ? (
              <span className="shrink-0 text-[13px] font-bold text-text-muted">
                <span className="tnum font-mono">{first.minutes}</span>분
              </span>
            ) : null}
            {state === 'failed' && <TriangleAlert size={14} aria-hidden className="shrink-0 text-caution" />}
          </span>
          <span className={cx('tnum truncate text-[12px] leading-4 font-bold', batch ? 'text-info' : 'text-text-muted')}>
            {batch ? (deadline ? `절약 · 마감 ${deadline}` : '절약') : '일반'}
            {sum !== null && (
              <span data-testid="group-cost" className="font-mono font-semibold text-text-muted">
                {' · '}
                {live ? '지금까지 ' : '합계 '}
                {fmtUsd(sum)}
              </span>
            )}
          </span>
        </span>
        {/* 진행 링: 끝난 수 / 전체 */}
        <span aria-hidden className="relative inline-flex size-10 shrink-0 items-center justify-center">
          <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
            <circle cx="18" cy="18" r={R} fill="none" strokeWidth="3.5" className="stroke-line" />
            <circle
              cx="18"
              cy="18"
              r={R}
              fill="none"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct)}
              className={cx('transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none', state === 'live' ? 'stroke-brand' : state === 'failed' ? 'stroke-caution' : 'stroke-signal')}
            />
          </svg>
          {state === 'done' ? (
            <Check size={16} strokeWidth={3} className="text-signal" />
          ) : (
            <span className="tnum font-mono text-[11px] leading-none font-bold text-text">
              <CountUp value={ended} />/{total}
            </span>
          )}
        </span>
        <ChevronRight size={16} aria-hidden className={cx('-mr-0.5 shrink-0 text-text-faint transition-transform duration-200 group-hover/head:text-text-muted motion-reduce:transition-none', open && 'rotate-90')} />
      </span>

      {/* 작업마다 한 칸: 색 = 상태, 도는 칸은 빛이 지나간다. 접어도 한눈에 */}
      <span aria-hidden className="flex h-2 gap-[3px]">
        {g.jobs.map((j) => {
          const v = jobView(j)
          return (
            <span
              key={j.jobId}
              title={`${j.topic?.trim() || '주제를 정하는 중'} · ${v.label}`}
              className={cx('h-full min-w-0 flex-1 rounded-full transition-colors duration-300', v.tone === 'run' ? 'bg-brand-gradient gen-shimmer' : DOT[v.tone], v.tone === 'wait' && 'opacity-40')}
            />
          )
        })}
      </span>
    </button>
  )
}

function JobItem({ job, on, busy, onSelect, onCancel }: { job: JobRow; on: boolean; busy: boolean; onSelect: () => void; onCancel: () => void }) {
  const v = jobView(job)
  const title = job.topic?.trim() || '주제를 정하는 중'
  const tone: JobTone = v.tone
  const cost = costLabel(job)
  return (
    <div className={cx('flex items-center transition-colors duration-150', on ? 'bg-brand-dim/60' : 'hover:bg-panel-raised/60')}>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={on}
        aria-label={`${title} 자세히 보기`}
        title={[v.label, v.sub].filter(Boolean).join(' · ')}
        className="flex min-h-10 min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left outline-none focus-visible:ring-4 focus-visible:ring-brand/30 focus-visible:ring-inset"
      >
        <span aria-hidden className={cx('size-2 shrink-0 rounded-full', DOT[tone], tone === 'run' && 'motion-safe:animate-pulse')} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-text">{title}</span>
        {/* key 가 바뀌면 상태 글이 새로 들어오며 한 번 부드럽게 나타난다 */}
        <span key={v.label} role="status" className="fade-in shrink-0 text-[12px] font-bold text-text-muted">
          {v.label}
        </span>
        {cost && (
          <span data-testid="job-cost" className="tnum shrink-0 font-mono text-[12px] font-semibold text-text-faint">
            {cost}
          </span>
        )}
        {v.sub && <span className="sr-only">{v.sub}</span>}
      </button>
      {canCancel(job) && (
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label={`${title} 취소`}
          title="취소"
          className="mr-1 inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 outline-none hover:bg-alert/10 hover:text-alert focus-visible:ring-4 focus-visible:ring-brand/30 disabled:opacity-50"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  )
}
