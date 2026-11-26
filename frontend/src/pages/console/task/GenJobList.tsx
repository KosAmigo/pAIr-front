// 진행 목록: 지금 대기·진행 중인 과제 생성 작업과 최근 끝난 작업. 묶음(batchId)별로 묶어 보여 준다.
// 행: 주제·직군·시간 / 상태(대기 n번째, 진행 단계, 배치 대기·마감, 완료·실패·취소) / 끝나면 "검수하기", 대기면 "취소".
// 행이 생기고 사라질 때만 부드럽게 움직이고, 움직임 줄이기에서는 움직이지 않는다.
import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CircleAlert, Layers, X } from 'lucide-react'
import { cx } from '../../../components/cx'
import { TRACK_ICON } from '../../../components/domainIcons'
import { ButtonLink } from '../../../components/ui'
import { canCancel, cancelErrorMessage, groupJobs, groupSummary, jobView, reviewHref, taskGenApi, type JobRow, type JobTone } from '../../../data/taskGen'
import { distance, duration, easing, useShouldAnimate } from '../../../lib/motion'

const TONE: Record<JobTone, string> = {
  wait: 'bg-panel-raised text-text-muted',
  run: 'bg-brand-dim text-brand',
  batch: 'bg-info/12 text-info',
  done: 'bg-signal/12 text-signal',
  warn: 'bg-caution/12 text-caution',
  fail: 'bg-alert/12 text-alert',
  cancel: 'bg-text/8 text-text-muted',
}

export function GenJobList({ rows, error, onChanged }: { rows: JobRow[] | null; error: string | null; onChanged: () => void }) {
  const animate = useShouldAnimate({ essential: true })
  const [notice, setNotice] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const groups = rows ? groupJobs(rows) : []

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

  const enter = animate ? { opacity: 0, y: distance.app / 2 } : false
  const t = { duration: duration.normal, ease: easing.standard }

  return (
    <section aria-labelledby="gen-jobs-title" className="mx-auto mt-8 w-full max-w-[960px]">
      <div className="flex items-baseline gap-3">
        <h2 id="gen-jobs-title" className="text-[18px] font-extrabold tracking-[-0.01em] text-text">
          진행 목록
        </h2>
        <p className="text-[13px] text-text-muted">3초마다 새로 불러와요. 페이지를 나갔다 와도 이어서 보여요.</p>
      </div>

      {(notice || error) && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-alert/30 bg-alert/8 px-4 py-3 text-[14px] leading-6 break-keep text-text">
          <CircleAlert size={18} className="mt-0.5 shrink-0 text-alert" aria-hidden /> {notice ?? `목록을 불러오지 못했어요. ${error}`}
        </p>
      )}

      {rows === null && !error && <p className="mt-4 text-[14px] text-text-muted">불러오는 중…</p>}
      {rows !== null && groups.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-line-strong px-5 py-6 text-[14px] text-text-muted">지금 진행 중이거나 최근에 끝난 작업이 없어요.</p>
      )}

      <ul className="mt-4 flex flex-col gap-4">
        <AnimatePresence initial={false}>
          {groups.map((g) => (
            <motion.li
              key={g.key}
              layout={animate ? 'position' : false}
              initial={enter}
              animate={{ opacity: 1, y: 0 }}
              exit={animate ? { opacity: 0 } : undefined}
              transition={t}
              className="overflow-hidden rounded-2xl border border-line bg-panel shadow-sm"
            >
              {g.batchId && (
                <div className="flex items-center gap-2 border-b border-line bg-panel-raised px-5 py-2.5 text-[13px] font-semibold text-text-muted">
                  <Layers size={14} aria-hidden />
                  <span>자동 생성 묶음</span>
                  <span className="tnum ml-auto">{groupSummary(g)}</span>
                </div>
              )}
              <ul className="divide-y divide-line">
                <AnimatePresence initial={false}>
                  {g.jobs.map((j) => (
                    <motion.li key={j.jobId} data-testid="gen-job" initial={enter} animate={{ opacity: 1, y: 0 }} exit={animate ? { opacity: 0 } : undefined} transition={t}>
                      <JobItem job={j} busy={cancelling === j.jobId} onCancel={() => void cancel(j)} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  )
}

function JobItem({ job, busy, onCancel }: { job: JobRow; busy: boolean; onCancel: () => void }) {
  const v = jobView(job)
  const Icon = job.track ? TRACK_ICON[job.track] : null
  const title = job.topic?.trim() || '주제를 정하는 중'
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
        {Icon && (
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-panel-raised text-text-muted" aria-hidden>
            <Icon size={18} />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[15px] leading-6 font-bold break-keep text-text">{title}</p>
          <p className="text-[12px] text-text-muted">
            {job.track === 'BIZ' ? '비개발' : job.track === 'DEV' ? '개발' : ''}
            {job.minutes ? (
              <>
                {job.track ? ' · ' : ''}
                <span className="tnum font-mono">{job.minutes}</span>분
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-col items-start gap-1 sm:items-end">
        {/* key 가 바뀌면 상태 글이 새로 들어오며 한 번 부드럽게 나타난다 */}
        <span key={v.label} role="status" className={cx('fade-in inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold', TONE[v.tone])}>
          {v.tone === 'run' && <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-current" />}
          {v.label}
        </span>
        {v.sub && <span className="tnum max-w-[320px] text-[12px] break-keep text-text-muted">{v.sub}</span>}
      </div>

      <div className="flex min-w-[88px] justify-end">
        {job.status === 'DONE' && job.taskCode && (
          <ButtonLink to={reviewHref(job.taskCode)} variant="primary" size="sm" aria-label={`${title} 검수하기`}>
            검수하기 <ArrowRight size={14} aria-hidden />
          </ButtonLink>
        )}
        {canCancel(job) && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label={`${title} 취소`}
            className="inline-flex h-10 items-center gap-1 rounded-lg border border-line-strong px-3 text-[13px] font-semibold text-text-muted transition-colors duration-150 outline-none hover:border-alert/50 hover:text-alert focus-visible:ring-4 focus-visible:ring-brand/30 disabled:opacity-50"
          >
            <X size={14} aria-hidden /> 취소
          </button>
        )}
      </div>
    </div>
  )
}
