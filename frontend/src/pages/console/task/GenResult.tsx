// AI 과제 생성 결과 (과제 만들기 ③ → ④). 통과면 입자 한 번 + 빛나는 테두리, 검사 표, 주인공 버튼 "검수하러 가기".
// 확인 실패여도 과제는 검수 전으로 저장돼 있다. 생성 자체가 실패(FAILED)하면 이유와 다시 시도.
import { motion } from 'motion/react'
import { ArrowRight, CircleAlert, PartyPopper, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import { cx } from '../../../components/cx'
import { GlowBorder, Magnetic, Particles } from '../../../components/fx'
import { Button, ButtonLink } from '../../../components/ui'
import { springs } from '../../../lib/motion'
import { allChecksOk, fmtElapsed, type TaskGenJob } from '../../../data/taskGen'
import { CheckTable } from './CheckTable'

export function GenResult({ job, elapsed, onRetry, onNew }: { job: TaskGenJob; elapsed: number; onRetry: () => void; onNew: () => void }) {
  if (job.status === 'FAILED') {
    return (
      <section role="alert" className="rounded-2xl border border-alert/30 bg-panel p-8 shadow-md">
        <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-alert/10 text-alert" aria-hidden>
          <CircleAlert size={26} />
        </span>
        <h2 className="mt-4 text-[22px] font-extrabold text-text">과제를 만들지 못했어요</h2>
        <p className="mt-1 text-[14px] text-text-muted">저장된 것은 없어요. 이유를 확인하고 다시 시도하세요.</p>
        <p className="mt-4 rounded-lg bg-alert/8 px-4 py-3 text-[14px] leading-6 break-words text-text">{job.error ?? '알 수 없는 오류'}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onNew}>
            <Plus size={16} aria-hidden /> 처음부터 다시
          </Button>
          <Button variant="primary" onClick={onRetry}>
            <RefreshCw size={16} aria-hidden /> 같은 내용으로 다시 시도
          </Button>
        </div>
      </section>
    )
  }

  const ok = allChecksOk(job)
  const failed = job.checks.filter((c) => !c.ok).length
  const href = job.taskCode ? `/console/tasks/${encodeURIComponent(job.taskCode)}` : '/console/tasks'
  return (
    <>
      <Particles fire={ok} origin={{ x: 0.55, y: 0.3 }} />
      <GlowBorder active={ok} className="rounded-2xl">
        <section className="rounded-2xl border border-line bg-panel p-8 shadow-md">
          <div className="flex flex-wrap items-start gap-4">
            <motion.span
              initial={{ scale: 0.5, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={springs.gentle}
              className={cx('inline-flex size-14 items-center justify-center rounded-2xl', ok ? 'bg-brand-gradient text-on-accent shadow-[0_12px_28px_-10px_rgb(108_71_255/0.8)]' : 'bg-caution/12 text-caution')}
              aria-hidden
            >
              {ok ? <PartyPopper size={28} /> : <TriangleAlert size={28} />}
            </motion.span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[24px] leading-8 font-extrabold tracking-[-0.02em] break-keep text-text">
                {ok ? '과제를 만들었어요! 자동 확인도 모두 통과했어요' : `자동 확인에서 ${failed}개가 걸렸어요`}
              </h2>
              <p className="mt-1 text-[15px] break-keep text-text-muted">
                {ok
                  ? '검수 전 상태로 저장했어요. 이제 사람이 확인하고 공개하면 돼요.'
                  : '그래도 검수 전으로 저장했어요(어디에도 안 보여요). 빨간 줄을 확인하고 고쳐 쓰거나 숨겨 두세요.'}
              </p>
              <p className="tnum mt-2 flex flex-wrap gap-x-3 font-mono text-[12px] text-text-muted">
                {job.taskCode && <span>{job.taskCode}</span>}
                <span>걸린 시간 {fmtElapsed(elapsed)}</span>
              </p>
            </div>
          </div>

          <div className="mt-6">
            <CheckTable checks={job.checks} />
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-6">
            <p className="mr-auto text-[14px] font-medium text-text-muted">다음 할 일: 내용을 읽어 보고 체크리스트를 채운 뒤 공개하세요.</p>
            <Button variant="ghost" onClick={onNew}>
              <Plus size={16} aria-hidden /> 하나 더 만들기
            </Button>
            <Magnetic>
              <ButtonLink to={href} variant="primary" size="lg" className="h-12 rounded-full px-6 text-[16px]">
                검수하러 가기 <ArrowRight size={18} aria-hidden />
              </ButtonLink>
            </Magnetic>
          </div>
        </section>
      </GlowBorder>
    </>
  )
}
