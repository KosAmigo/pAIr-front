import { Smartphone } from 'lucide-react'
import { StatusDot } from '../../components/ui'
import { useCamHub } from './useCamHub.ts'

/** 휴대폰 보조 캠 연결: QR 과 연결 상태 */
export function PhonePairCard() {
  const { phone, phoneQr, phoneUrl, phoneStatus, relayOpen } = useCamHub()
  const connected = phone === 'connected'
  return (
    <section className="rounded-xl border border-line bg-panel p-4" aria-labelledby="phone-pair-title">
      <div className="flex items-center gap-2">
        <Smartphone size={18} className="text-brand" aria-hidden />
        <h3 id="phone-pair-title" className="text-[15px] font-semibold">
          휴대폰 보조 카메라
        </h3>
        <span className="ml-auto">
          <StatusDot status={connected ? 'ok' : phone === 'stale' ? 'check' : 'down'} label={connected ? '연결됨' : phone === 'stale' ? '응답 없음' : '미연결'} />
        </span>
      </div>
      {connected ? (
        <p className="mt-2 text-[13px] text-text-muted">
          {phoneStatus?.calibrated ? '감시 중' : '휴대폰에서 점검을 진행해 주세요'}
          {phoneStatus && ` · ${phoneStatus.fps} FPS · 손 ${phoneStatus.handCount}개`}
        </p>
      ) : (
        <div className="mt-3 flex items-start gap-4">
          <div className="flex size-[132px] shrink-0 items-center justify-center rounded-lg border border-line bg-white p-1.5">
            {phoneQr ? <img src={phoneQr} alt="휴대폰 연결 QR 코드" className="size-full" /> : <span className="text-[12px] text-text-muted">{relayOpen ? 'QR 만드는 중' : '서버 연결 중'}</span>}
          </div>
          <div className="min-w-0 text-[13px] leading-5 text-text-muted">
            <p className="break-keep">휴대폰 카메라로 QR 을 찍어 주세요. 휴대폰은 옆이나 뒤에 세워 두 손·키보드·시험 화면이 함께 보이게 놓습니다.</p>
            <p className="mt-1 break-keep">영상은 전송되지 않고 휴대폰 안에서만 분석됩니다.</p>
            {phoneUrl && (
              <details className="mt-2">
                <summary className="cursor-pointer font-medium text-text">QR 이 안 열리면 주소 직접 입력</summary>
                <p className="mt-1 font-mono text-[12px] break-all">{phoneUrl}</p>
              </details>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
