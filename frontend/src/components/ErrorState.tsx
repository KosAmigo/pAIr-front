import { RefreshCw, ServerCrash, TriangleAlert } from 'lucide-react'
import { cx } from './cx'
import { Button } from './ui'

/** 서버가 꺼져 있거나 닿지 않을 때의 응답인지 (502·503·504, 네트워크 실패) */
const isDown = (msg: string) => /\((502|503|504)\)|Failed to fetch|NetworkError/i.test(msg)

/**
 * 불러오기 실패 상태 (채점 툴 등 백엔드가 필요한 화면).
 * 큰 카드: alert 아이콘 칸 + 쉬운 말 제목 + 원래 오류(mono) + 다시 시도. compact 는 상자 안에 들어가는 한 줄 띠.
 */
export function ErrorState({ message, onRetry, compact, className }: { message: string; onRetry?: () => void; compact?: boolean; className?: string }) {
  const down = isDown(message)
  const title = down ? '서버에 연결하지 못했습니다' : '불러오지 못했습니다'
  const hint = down ? '백엔드 서버가 꺼져 있거나 응답하지 않습니다. 서버를 켠 뒤 다시 시도하세요.' : '잠시 뒤 다시 시도하세요. 계속되면 아래 오류 내용을 팀에 알려 주세요.'
  const Icon = down ? ServerCrash : TriangleAlert
  if (compact) {
    return (
      <div role="alert" className={cx('flex items-center gap-3 rounded-lg border border-alert/30 bg-alert/8 px-4 py-2.5', className)}>
        <Icon size={18} className="shrink-0 text-alert" aria-hidden />
        <p className="min-w-0 flex-1 text-[14px] text-text">
          <span className="font-semibold">{title}</span> <span className="font-mono text-[12px] text-text-muted">{message}</span>
        </p>
        {onRetry && (
          <Button size="sm" variant="ghost" onClick={onRetry}>
            <RefreshCw size={14} aria-hidden /> 다시 시도
          </Button>
        )}
      </div>
    )
  }
  return (
    <div role="alert" className={cx('mx-auto flex max-w-[560px] flex-col items-center rounded-2xl border border-line bg-panel px-10 py-12 text-center shadow-md', className)}>
      <span className="relative flex size-16 items-center justify-center">
        <span aria-hidden className="rec-pulse absolute inset-0 rounded-2xl bg-alert/12" />
        <Icon size={30} strokeWidth={1.75} className="relative text-alert" aria-hidden />
      </span>
      <h2 className="mt-5 text-[22px] leading-8 font-bold text-text">{title}</h2>
      <p className="mt-2 text-[15px] leading-6 break-keep text-text-muted">{hint}</p>
      <p className="mt-4 rounded-md bg-panel-sunken px-3 py-1.5 font-mono text-[12px] text-text-muted">{message}</p>
      {onRetry && (
        <Button variant="primary" className="mt-6" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden /> 다시 시도
        </Button>
      )}
    </div>
  )
}
