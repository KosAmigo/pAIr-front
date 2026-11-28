// 만드는 중인 과제 목록 (왼쪽, 좁고 촘촘하게). 묶음 없이 작업 하나마다 카드 하나.
// 위: 진행 중(대기·진행) 작업, 맨 아래: '완료 N' 접힘 줄 안에 끝난 작업(완료·실패·취소). 작업이 끝나는 대로 하나씩 아래로 내려간다.
// 완료 줄의 펼침은 localStorage 에 기억하고(선택한 작업이 안에 있으면 펼친 채 보인다), 높이는 부드럽게 바뀌며 움직임 줄이기에서는 바로 바뀐다.
// 카드: 직군 아이콘 타일 + 주제 한 줄 + 정보 한 줄(분 · 방식 · 상태 · 비용) + 진행 중이면 얇은 진행 막대 + 취소 버튼(가능할 때).
// 새로고침 버튼은 페이지 제목 옆(GenRefreshButton)에 있다. 자동 갱신은 뒤에서 그대로 돈다.
import { useState } from 'react'
import { Check, ChevronRight, CircleAlert, Layers, ListChecks, X } from 'lucide-react'
import { TRACK_ICON } from '../../../components/domainIcons'
import { cx } from '../../../components/cx'
import { canCancel, cancelErrorMessage, costLabel, fmtClock, fmtUsd, groupCost, jobView, taskGenApi, toGenStep, type JobRow } from '../../../data/taskGen'

const DONE_KEY = 'pair.genDoneOpen'
const loadDoneOpen = (): boolean | null => {
  try {
    const v = localStorage.getItem(DONE_KEY)
    return v === null ? null : v === 'true'
  } catch {
    return null
  }
}
const isLive = (j: Pick<JobRow, 'status'>) => j.status === 'QUEUED' || j.status === 'RUNNING'
const at = (j: JobRow) => (j.createdAt ? Date.parse(j.createdAt) || 0 : 0)

/** 카드 상태: live = 대기·진행(그라데이션 테두리), failed = 실패(주황), done = 완료·취소 */
type CardState = 'live' | 'failed' | 'done'
const cardState = (j: Pick<JobRow, 'status'>): CardState => (isLive(j) ? 'live' : j.status === 'FAILED' ? 'failed' : 'done')

/** 카드: 불투명 흰 바탕 + 또렷한 테두리 + 짧고 선명한 그림자에 은은한 그림자를 겹친다. 고른 작업은 CARD_SELECTED(ring 2px, 레이아웃이 밀리지 않음). */
const LIFT = 'shadow-[0_1px_2px_rgb(15_23_42/0.1),0_8px_18px_-10px_rgb(15_23_42/0.18)]'
const CARD: Record<CardState, string> = {
  live: 'border-transparent bg-[linear-gradient(#fff,#fff)_padding-box,linear-gradient(120deg,#8b5cf6,#6c47ff_45%,#2f5bea)_border-box] shadow-[0_1px_2px_rgb(15_23_42/0.1),0_8px_18px_-10px_rgb(108_71_255/0.4)]',
  failed: `border-caution/60 bg-white ${LIFT} hover:border-caution`,
  done: `border-line-strong bg-white ${LIFT} hover:border-brand/50`,
}
const CARD_SELECTED = 'ring-2 ring-brand ring-offset-1 ring-offset-white'

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
  const [doneChoice, setDoneChoice] = useState<boolean | null>(loadDoneOpen)
  const all = rows ?? []
  // 진행 중은 먼저 만든 순서(= 대기 순서), 끝난 것은 최근에 만든 것이 위
  const active = all.filter(isLive).sort((a, b) => at(a) - at(b))
  const finished = all.filter((j) => !isLive(j)).sort((a, b) => at(b) - at(a))
  // 선택한 작업이 접힌 곳에 있으면(사용자가 따로 바꾸기 전까지) 펼쳐서 보이게 한다
  const doneOpen = doneChoice ?? finished.some((j) => j.jobId === selected)
  const sum = groupCost(active)

  const toggleDone = () => {
    const next = !doneOpen
    setDoneChoice(next)
    try {
      localStorage.setItem(DONE_KEY, String(next))
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

  const renderJob = (j: JobRow) => <JobCard key={j.jobId} job={j} on={selected === j.jobId} busy={cancelling === j.jobId} onSelect={() => onSelect(j.jobId)} onCancel={() => void cancel(j)} />

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
      {rows !== null && all.length === 0 && <p className="rounded-lg border border-dashed border-line-strong px-3 py-4 text-[13px] text-text-muted">작업이 없어요.</p>}

      {rows !== null && all.length > 0 && active.length === 0 && <p className="px-1 py-1 text-[13px] font-bold text-text-muted">진행 중인 작업이 없어요.</p>}

      {active.length > 0 && (
        <p data-testid="gen-summary" className="tnum px-1 text-[12px] leading-4 font-bold text-text-muted">
          진행 중 <span className="font-mono">{active.length}</span>
          {sum !== null && <span className="font-mono font-semibold"> · 지금까지 {fmtUsd(sum)}</span>}
        </p>
      )}

      {/* 선택 ring 이 잘리지 않게 위 목록도 3px 여백을 둔다 */}
      {active.length > 0 && <ul className="flex flex-col gap-2 py-[3px]">{active.map(renderJob)}</ul>}

      {finished.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 border-t border-line pt-4">
          <button
            type="button"
            onClick={toggleDone}
            aria-expanded={doneOpen}
            data-testid="gen-done-toggle"
            className={cx(
              'group/done flex h-11 w-full items-center gap-2 rounded-xl border px-3 text-left text-[14px] font-extrabold outline-none',
              'transition-[background-color,border-color,box-shadow,color] duration-200 motion-reduce:transition-none',
              'focus-visible:ring-4 focus-visible:ring-brand/30',
              doneOpen
                ? 'border-brand/30 bg-brand-dim/60 text-text shadow-[0_6px_18px_-12px_rgb(108_71_255/0.55)]'
                : 'border-line bg-white text-text-muted shadow-sm hover:border-brand/40 hover:bg-brand-dim/40 hover:text-text hover:shadow-[0_8px_22px_-14px_rgb(108_71_255/0.6)]',
            )}
          >
            <span aria-hidden className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand-dim text-brand ring-1 ring-brand/25">
              <ListChecks size={14} />
            </span>
            <span className="flex-1">완료</span>
            <span className="tnum inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-gradient px-1.5 font-mono text-[11px] leading-none font-bold text-white">{finished.length}</span>
            <ChevronRight size={16} aria-hidden className={cx('-mr-0.5 shrink-0 text-text-faint transition-transform duration-200 group-hover/done:text-brand motion-reduce:transition-none', doneOpen && 'rotate-90 text-brand')} />
          </button>
          <div className={cx('grid transition-[grid-template-rows] duration-[260ms] ease-out motion-reduce:transition-none', doneOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
            <div className={cx('-mx-[3px] min-h-0 overflow-hidden px-[3px] transition-[visibility] duration-[260ms] motion-reduce:transition-none', doneOpen ? 'visible' : 'invisible')}>
              <ul className="flex flex-col gap-2 py-[3px]">{finished.map(renderJob)}</ul>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/** 진행 막대 채움(0~1): 생성 → 확인 → 저장 3단계 기준. 대기·절약 모드 대기는 채움 없이 빛만 지나간다 */
const STEP_PCT = { '생성 중': 0.34, '다시 생성 중': 0.34, '확인 중': 0.67, '저장 중': 0.92 } as const

/** 작업 카드 한 장: [직군 아이콘 타일] 주제 / 분 · 방식 · 상태 · 비용 / (진행 중이면) 얇은 진행 막대 / 취소 */
function JobCard({ job, on, busy, onSelect, onCancel }: { job: JobRow; on: boolean; busy: boolean; onSelect: () => void; onCancel: () => void }) {
  const v = jobView(job)
  const title = job.topic?.trim() || '주제를 정하는 중'
  const cost = costLabel(job)
  const state = cardState(job)
  const running = job.status === 'RUNNING' && !job.waitingBatch
  const Icon = job.track ? TRACK_ICON[job.track] : Layers
  const trackName = job.track === 'BIZ' ? '비개발' : job.track === 'DEV' ? '개발' : '자동 생성'
  const batch = job.mode === 'BATCH'
  const deadline = batch ? fmtClock(job.deadlineAt) : null
  const pct = running ? STEP_PCT[toGenStep(job.step, job.step === '다시 생성 중')] : 0
  return (
    <li data-testid="gen-job" data-state={state} className={cx('overflow-hidden rounded-xl border transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none', CARD[state], on && CARD_SELECTED)}>
      <div className="flex items-start">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={on}
          aria-current={on ? 'true' : undefined}
          aria-label={`${title} 자세히 보기`}
          title={[trackName, v.label, v.sub].filter(Boolean).join(' · ')}
          className="flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-2.5 text-left outline-none hover:bg-panel-raised/40 focus-visible:ring-4 focus-visible:ring-brand/30 focus-visible:ring-inset"
        >
          <span className="flex items-center gap-2.5">
            {/* 직군 아이콘 타일(글자 대신): 도는 작업은 그라데이션 + 빛, 실패는 주황, 나머지는 브랜드 틴트 */}
            <span
              aria-hidden
              className={cx(
                'relative inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] ring-1',
                running
                  ? 'gen-shimmer bg-brand-gradient text-white shadow-[0_6px_16px_-6px_rgb(108_71_255/0.7)] ring-white/30'
                  : state === 'failed'
                    ? 'bg-caution/10 text-caution ring-caution/30'
                    : 'bg-brand-dim text-brand shadow-[0_4px_12px_-6px_rgb(108_71_255/0.5)] ring-brand/30',
              )}
            >
              <Icon size={16} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] leading-5 font-extrabold tracking-[-0.01em] text-text">{title}</span>
          </span>

          <span className="tnum flex min-w-0 items-center gap-1 pl-[42px] text-[12px] leading-4 font-bold text-text-muted">
            <span className="min-w-0 truncate">
              {job.minutes ? (
                <>
                  <span className="font-mono">{job.minutes}</span>분 ·{' '}
                </>
              ) : null}
              {batch ? (deadline ? `절약 마감 ${deadline}` : '절약') : '일반'}
            </span>
            <span aria-hidden>·</span>
            {/* key 가 바뀌면 상태 글이 새로 들어오며 한 번 부드럽게 나타난다 */}
            <span key={v.label} role="status" className={cx('fade-in inline-flex shrink-0 items-center gap-1', state === 'failed' && 'text-caution')}>
              {job.status === 'DONE' && (
                <span aria-hidden className="inline-flex size-3.5 items-center justify-center rounded-full bg-brand-gradient text-white">
                  <Check size={9} strokeWidth={3.5} />
                </span>
              )}
              {v.label}
            </span>
            {cost && (
              <>
                <span aria-hidden>·</span>
                <span data-testid="job-cost" className="shrink-0 font-mono font-semibold text-text-faint">
                  {cost}
                </span>
              </>
            )}
          </span>
          {v.sub && <span className="sr-only">{v.sub}</span>}

          {/* 진행 막대: 진행 중에만. 단계 기준으로 채우고(transform 으로만 움직임), 대기·절약 모드 대기는 빛만 지나간다 */}
          {state === 'live' && (
            <span aria-hidden className="ml-[42px] h-1 overflow-hidden rounded-full bg-line-strong/50">
              <span
                className={cx(
                  'gen-shimmer block h-full origin-left rounded-full bg-brand-gradient transition-transform duration-500 ease-out motion-reduce:transition-none',
                  !running && 'opacity-40',
                )}
                style={{ transform: `scaleX(${running ? pct : 1})` }}
              />
            </span>
          )}
        </button>
        {canCancel(job) && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label={`${title} 취소`}
            title="취소"
            className="mt-0.5 mr-1 inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 outline-none hover:bg-alert/10 hover:text-alert focus-visible:ring-4 focus-visible:ring-brand/30 disabled:opacity-50"
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </div>
    </li>
  )
}
