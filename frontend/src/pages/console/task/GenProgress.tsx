// AI 과제 생성 진행 (과제 만들기 ③ 생성). 이 화면의 스포트라이트(DESIGN.md §7-9 연출).
// 큰 경과 시간 + 진행 막대(BranchLine, 빛이 흐름) + 단계 줄(지금 단계는 도는 고리, 끝난 단계는 체크가 튐) + 지금 하는 일 문장.
import { AnimatePresence, motion } from 'motion/react'
import { Check, FileCode2, PackageCheck, RefreshCw, ScanSearch, type LucideIcon } from 'lucide-react'
import { cx } from '../../../components/cx'
import { BranchLine, GlowBorder, StageSection } from '../../../components/fx'
import { duration, easing, springs } from '../../../lib/motion'
import { fmtElapsed, stepNarration, stepStates, type GenStep, type GenTrack } from '../../../data/taskGen'

const ICON: Record<GenStep, LucideIcon> = { '생성 중': FileCode2, '확인 중': ScanSearch, '다시 생성 중': RefreshCw, '저장 중': PackageCheck }
const SUB: Record<GenStep, string> = { '생성 중': 'AI가 초안을 써요', '확인 중': '자동으로 검사해요', '다시 생성 중': '걸린 곳을 고쳐요', '저장 중': '검수 전으로 저장해요' }

export function GenProgress({
  step,
  detail,
  retried,
  elapsed,
  progress,
  track,
  topic,
}: {
  step: GenStep | null
  /** 백엔드 세부 단계 글을 사람 말로 바꾼 것 (예: 설계도 작성 중) */
  detail?: string | null
  retried: boolean
  elapsed: number
  progress: number
  track: GenTrack
  topic: string
}) {
  const steps = stepStates(step ?? '생성 중', retried)
  const say = stepNarration(step, track)
  return (
    <StageSection aria-label="과제 생성 진행" className="p-0">
      <GlowBorder className="rounded-xl">
        <div className="flex flex-col gap-6 px-8 py-8" aria-live="polite">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-0 flex-1">
              <p className="label text-stage-brand">GENERATING</p>
              <h2 className="mt-1 text-[24px] leading-8 font-extrabold tracking-[-0.02em] break-keep text-stage-text">「{topic}」 과제를 만들고 있어요</h2>
            </div>
            <div className="text-right">
              <p className="label text-stage-muted">ELAPSED</p>
              <p className="tnum font-mono text-[40px] leading-[44px] font-semibold text-stage-text" role="timer" aria-label={`경과 ${fmtElapsed(elapsed)}`}>
                {fmtElapsed(elapsed)}
              </p>
            </div>
          </div>

          <div>
            <BranchLine progress={progress} loading branches={retried ? [0.45] : []} />
            <div className="mt-1 flex justify-between text-[12px] font-medium text-stage-muted">
              <span>보통 40~70초 걸려요</span>
              <span className="tnum font-mono">{Math.round(progress * 100)}%</span>
            </div>
          </div>

          <ol className="grid gap-3" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
            {steps.map(({ step: s, state }) => {
              const Icon = ICON[s]
              return (
                <li
                  key={s}
                  className={cx(
                    'glass-stage flex flex-col items-center gap-2 rounded-xl border px-2 py-4 text-center transition-colors',
                    state === 'active' ? 'border-stage-line-strong shadow-md' : 'border-stage-line',
                  )}
                >
                  <span className="relative inline-flex size-12 items-center justify-center" aria-hidden>
                    {state === 'active' && (
                      <>
                        <span className="absolute inset-0 animate-spin rounded-full border-2 border-stage-line border-t-stage-brand border-r-stage-blue" />
                        <span className="rec-pulse absolute inset-1.5 rounded-full bg-stage-brand/10" />
                      </>
                    )}
                    <AnimatePresence mode="wait" initial={false}>
                      {state === 'done' ? (
                        <motion.span
                          key="done"
                          initial={{ scale: 0.4, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={springs.gentle}
                          className="inline-flex size-10 items-center justify-center rounded-full bg-stage-signal text-on-accent"
                        >
                          <Check size={20} strokeWidth={3} />
                        </motion.span>
                      ) : (
                        <motion.span key="icon" exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: duration.fast }} className={state === 'active' ? 'text-stage-brand' : 'text-stage-faint'}>
                          <Icon size={22} strokeWidth={1.9} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                  <span className={cx('text-[14px]', state === 'todo' ? 'font-semibold text-stage-faint' : 'font-bold text-stage-text')}>
                    {s}
                    <span className="sr-only">{state === 'done' ? ' (끝남)' : state === 'active' ? ' (진행 중)' : ' (대기)'}</span>
                  </span>
                  <span className="hidden text-[12px] text-stage-muted sm:block">{SUB[s]}</span>
                </li>
              )
            })}
          </ol>

          <div className="flex items-center gap-3 rounded-xl border border-stage-line bg-stage-raised/70 px-4 py-3">
            <span className="rec-pulse size-2 shrink-0 rounded-full bg-stage-brand" aria-hidden />
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={say}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: duration.normal, ease: easing.standard }}
                className="text-[15px] font-semibold break-keep text-stage-text"
              >
                {say}
              </motion.p>
            </AnimatePresence>
          </div>
          {detail && (
            <p className="-mt-3 pl-9 text-[13px] font-medium text-stage-muted" data-testid="gen-detail">
              {detail}
            </p>
          )}
          <p className="text-[13px] text-stage-muted">이 화면을 떠나면 진행 확인이 멈춰요. 만들기는 서버에서 계속되고, 끝나면 과제 목록의 검수 전에 나와요.</p>
        </div>
      </GlowBorder>
    </StageSection>
  )
}
