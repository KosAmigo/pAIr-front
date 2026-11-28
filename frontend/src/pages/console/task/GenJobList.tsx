// 만드는 중인 과제 목록 (왼쪽, 좁고 촘촘하게). 묶음(batchId)마다 머리줄 하나(직군·시간·개수·끝난 수 + 작은 진행 막대)와 접었다 펼치는 행들.
// 머리는 미니멀하게: 상태 표시 + "개발 · 60분", 회색 한 줄(절약 · 마감 · 비용), 얇은 진행 막대 하나. 상태색은 점·막대에만 쓴다.
// 펼침: 진행 중인 묶음은 펼침, 끝난 묶음은 접힘이 기본이고 사용자가 바꾼 상태는 기억한다(localStorage). 높이는 부드럽게 바뀌고 움직임 줄이기에서는 바로 바뀐다.
// 행은 한 줄: 상태 점 + 주제(한 줄 말줄임) + 짧은 상태 글. 자세한 글(세부 단계·마감·검사 요약)은 title·화면 읽기용으로만 둔다.
// 새로고침 버튼은 페이지 제목 옆(GenRefreshButton)에 있다. 자동 갱신은 뒤에서 그대로 돈다.
import { useState } from 'react'
import { Check, ChevronRight, CircleAlert, Layers, TriangleAlert, X } from 'lucide-react'
import { TRACK_ICON } from '../../../components/domainIcons'
import { cx } from '../../../components/cx'
import { canCancel, cancelErrorMessage, costLabel, fmtClock, fmtUsd, groupCost, groupJobs, jobView, taskGenApi, type JobGroup, type JobRow, type JobTone } from '../../../data/taskGen'
import { DOT } from './formConsts'
import { TRACK_TONE } from './trackTone'

const OPEN_KEY = 'pair.genGroups'
const DONE_KEY = '__done' // 맨 아래 '완료' 줄의 펼침 상태도 같은 저장소에 기억한다
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
/** 카드는 중립(흰 바탕 + 얇은 테두리). 도는 묶음만 테두리를 브랜드색으로 은은하게 구분한다. */
const CARD: Record<GroupState, string> = {
  live: 'border-brand/35 bg-white shadow-[0_6px_20px_-14px_rgb(108_71_255/0.5)]',
  failed: 'border-line bg-panel',
  done: 'border-line bg-panel',
}

export function GenJobList({
  rows,
  error,
  selected,
  onSelect,
  onChanged,
}: {
  rows: JobRow[] | null
  error: string | null
  selected: string | null
  onSelect: (jobId: string) => void
  onChanged: () => void
}) {
  const [notice, setNotice] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [opened, setOpened] = useState<OpenMap>(loadOpen)
  const groups = rows ? groupJobs(rows) : []
  // 위: 진행 중인 묶음과 단일 작업, 맨 아래: 끝난 묶음(접힘)
  const active = groups.filter((g) => !g.batchId || isLive(g))
  const finished = groups.filter((g) => g.batchId && !isLive(g))
  const hasSel = (g: JobGroup) => !!selected && g.jobs.some((j) => j.jobId === selected)
  // 선택한 작업이 접힌 곳에 있으면(사용자가 따로 바꾸기 전까지) 펼쳐서 보이게 한다
  const doneOpen = opened[DONE_KEY] ?? finished.some(hasSel)

  const remember = (next: OpenMap) => {
    setOpened(next)
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next))
    } catch {
      /* 저장이 막혀도 이번 화면에서는 동작한다 */
    }
  }
  const toggle = (g: JobGroup) => remember({ ...opened, [g.key]: !(opened[g.key] ?? (isLive(g) || hasSel(g))) })
  const toggleDone = () => remember({ ...opened, [DONE_KEY]: !doneOpen })

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

  const renderGroup = (g: JobGroup) => {
    const open = !g.batchId || (opened[g.key] ?? (isLive(g) || hasSel(g)))
    return (
      <li key={g.key} data-testid="gen-group" data-state={g.batchId ? groupState(g) : 'single'} className={cx('overflow-hidden rounded-xl border', g.batchId ? CARD[groupState(g)] : 'border-line bg-panel')}>
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
  }

  return (
    <section aria-labelledby="gen-jobs-title" className="flex min-w-0 flex-col gap-2">
      <h2 id="gen-jobs-title" className="sr-only">
        진행 목록
      </h2>

      {(notice || error) && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert/8 px-3 py-2 text-[13px] leading-5 break-keep text-text">
          <CircleAlert size={16} className="mt-0.5 shrink-0 text-alert" aria-hidden /> {notice ?? `목록을 불러오지 못했어요. ${error}`}
        </p>
      )}

      {rows === null && !error && <p className="text-[13px] text-text-muted">불러오는 중…</p>}
      {rows !== null && groups.length === 0 && <p className="rounded-lg border border-dashed border-line-strong px-3 py-4 text-[13px] text-text-muted">작업이 없어요.</p>}

      {rows !== null && groups.length > 0 && active.length === 0 && <p className="px-1 py-1 text-[13px] font-bold text-text-muted">진행 중인 작업이 없어요.</p>}

      {active.length > 0 && <ul className="flex flex-col gap-2">{active.map(renderGroup)}</ul>}

      {finished.length > 0 && (
        <div>
          <button
            type="button"
            onClick={toggleDone}
            aria-expanded={doneOpen}
            data-testid="gen-done-toggle"
            className="flex min-h-10 w-full items-center gap-1.5 rounded-lg px-2 text-left text-[13px] font-bold text-text-muted outline-none hover:bg-panel-raised/60 hover:text-text focus-visible:ring-4 focus-visible:ring-brand/30"
          >
            <ChevronRight size={14} aria-hidden className={cx('shrink-0 text-text-faint transition-transform duration-200 motion-reduce:transition-none', doneOpen && 'rotate-90')} />
            완료 <span className="tnum font-mono">{finished.length}</span>
          </button>
          <div className={cx('grid transition-[grid-template-rows] duration-[260ms] ease-out motion-reduce:transition-none', doneOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
            <div className={cx('min-h-0 overflow-hidden transition-[visibility] duration-[260ms] motion-reduce:transition-none', doneOpen ? 'visible' : 'invisible')}>
              <ul className="flex flex-col gap-2 pt-1">{finished.map(renderGroup)}</ul>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/** 묶음 머리줄(미니멀): 상태 표시(점·체크·경고) + "개발 · 60분" + 펼침 화살표, 회색 한 줄(절약 · 마감 · 비용), 얇은 진행 막대 하나.
 * 개수(진행·대기·완료·실패)는 화면 읽기용 이름으로만 전한다. */
function GroupHead({ g, open, onToggle }: { g: JobGroup; open: boolean; onToggle: () => void }) {
  const first = g.jobs[0]
  const total = g.jobs.length
  const c = g.counts
  const ended = c.DONE + c.FAILED + c.CANCELED
  const state = groupState(g)
  const name = first?.track === 'BIZ' ? '비개발' : first?.track === 'DEV' ? '개발' : '자동 생성'
  const Icon = first?.track ? TRACK_ICON[first.track] : Layers
  const tone = first?.track ? TRACK_TONE[first.track] : { tile: 'bg-panel-raised text-text-muted', ring: 'ring-line' }
  const batch = first?.mode === 'BATCH'
  const deadline = batch ? fmtClock(first?.deadlineAt) : null
  const pct = total ? ended / total : 0
  const sum = groupCost(g.jobs)
  const live = state === 'live'
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
      className="group/head flex w-full flex-col gap-1.5 px-3 py-2.5 text-left outline-none hover:bg-panel-raised/50 focus-visible:ring-4 focus-visible:ring-brand/30 focus-visible:ring-inset"
    >
      <span className="flex items-center gap-2.5">
        {/* 직군 아이콘 타일(글자 대신). 도는 묶음은 그라데이션 + 은은한 빛, 나머지는 직군 톤 */}
        <span
          aria-hidden
          title={name}
          className={cx(
            'relative inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] ring-1',
            live ? 'gen-shimmer bg-brand-gradient text-white shadow-[0_6px_16px_-6px_rgb(108_71_255/0.7)] ring-white/30' : cx(tone.tile, tone.ring),
          )}
        >
          <Icon size={16} />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[15px] leading-5 font-extrabold tracking-[-0.01em] text-text">
          {first?.minutes ? (
            <span className="shrink-0">
              <span className="tnum font-mono">{first.minutes}</span>분
            </span>
          ) : (
            <span className="truncate">{name}</span>
          )}
          {state === 'failed' && <TriangleAlert size={14} aria-hidden className="shrink-0 text-caution" />}
          {state === 'done' && <Check size={14} strokeWidth={3} aria-hidden className="shrink-0 text-signal" />}
        </span>
        <ChevronRight size={16} aria-hidden className={cx('-mr-0.5 shrink-0 text-text-faint transition-transform duration-200 group-hover/head:text-text-muted motion-reduce:transition-none', open && 'rotate-90')} />
      </span>

      <span className="tnum truncate pl-[42px] text-[12px] leading-4 font-bold text-text-muted">
        {batch ? (deadline ? `절약 · 마감 ${deadline}` : '절약') : '일반'}
        {sum !== null && (
          <span data-testid="group-cost" className="font-mono font-semibold">
            {' · '}
            {live ? '지금까지 ' : '합계 '}
            {fmtUsd(sum)}
          </span>
        )}
      </span>

      {/* 진행 막대 하나: 끝난 만큼 채운다(transform 으로만 움직임). 색 = 상태 */}
      <span aria-hidden className="ml-[42px] h-1 overflow-hidden rounded-full bg-line">
        <span
          className={cx(
            'block h-full origin-left rounded-full transition-transform duration-500 ease-out motion-reduce:transition-none',
            state === 'live' ? 'gen-shimmer bg-brand-gradient' : state === 'failed' ? 'bg-caution' : 'bg-signal',
          )}
          style={{ transform: `scaleX(${pct})` }}
        />
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
