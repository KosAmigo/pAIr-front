import { RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui'
import { camHub } from '../camHub.ts'
import { CHANNEL_LABEL } from '../core/connectionPolicy.ts'
import { PhonePairCard } from './PhonePairCard.tsx'
import { ScreenShareCard } from './ScreenShareCard.tsx'
import { useCamHub } from './useCamHub.ts'

/** 응시 중 채널이 15초 넘게 끊기면 응시 화면을 덮는다. 세 채널이 모두 돌아오면 자동으로 사라진다 */
export function ConnectionGate() {
  const hub = useCamHub()
  const { gate } = hub
  if (gate.status === 'ok') return null
  if (gate.status === 'grace') {
    return (
      <div role="status" className="fixed top-14 left-1/2 z-[85] -translate-x-1/2 rounded-md border border-caution/40 bg-panel-raised px-4 py-2 text-[14px] shadow-modal">
        {gate.missing.map((c) => CHANNEL_LABEL[c]).join('·')} 연결이 끊겼습니다. {Math.ceil(gate.graceLeftMs / 1000)}초 안에 다시 연결해 주세요.
      </div>
    )
  }
  return (
    <div role="alertdialog" aria-modal="true" aria-label="연결 필요" className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-bg/95 p-4">
      <section className="flex w-full max-w-[480px] flex-col gap-3 rounded-lg border border-alert/50 bg-panel p-6 shadow-modal">
        <h2 className="text-h2 font-semibold">연결이 끊겨 시험이 일시 중지되었습니다</h2>
        <p className="text-[15px] leading-6 break-keep text-text-muted">
          웹캠·휴대폰 캠·PC 화면 공유가 모두 연결되면 이어서 응시할 수 있습니다. 끊긴 항목: <b>{gate.missing.map((c) => CHANNEL_LABEL[c]).join(', ')}</b>
        </p>
        {gate.missing.includes('webcam') && (
          <Button variant="secondary" size="sm" onClick={() => void camHub.reconnectWebcam().catch(() => undefined)}>
            <RefreshCw size={14} aria-hidden /> 웹캠 다시 연결
          </Button>
        )}
        {gate.missing.includes('phone') && <PhonePairCard />}
        {gate.missing.includes('screen') && <ScreenShareCard compact />}
      </section>
    </div>
  )
}
