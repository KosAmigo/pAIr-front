import { useState } from 'react'
import { Monitor } from 'lucide-react'
import { Button, StatusDot } from '../../components/ui'
import { camHub } from '../camHub.ts'
import { SCREEN_CONSENT_LINES } from '../screen/screenShare.ts'
import { useCamHub } from './useCamHub.ts'

/** PC 화면 공유: 동의 문구를 읽고 체크해야 공유를 시작할 수 있다 (화면 영상은 저장·분석하지 않는다) */
export function ScreenShareCard({ compact = false }: { compact?: boolean }) {
  const { screen, screenError } = useCamHub()
  const [agreed, setAgreed] = useState(false)
  const sharing = screen === 'sharing'
  return (
    <section className="rounded-xl border border-line bg-panel p-4" aria-labelledby="screen-share-title">
      <div className="flex items-center gap-2">
        <Monitor size={18} className="text-brand" aria-hidden />
        <h3 id="screen-share-title" className="text-[15px] font-semibold">
          PC 화면 공유
        </h3>
        <span className="ml-auto">
          <StatusDot status={sharing ? 'ok' : screen === 'error' ? 'down' : 'check'} label={sharing ? '공유 중' : screen === 'requesting' ? '선택 중' : '미연결'} />
        </span>
      </div>
      {sharing ? (
        <p className="mt-2 text-[13px] text-text-muted">전체 화면을 공유하고 있습니다. 시험이 끝날 때까지 공유를 멈추지 마세요.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {!compact && (
            <ul className="list-disc space-y-1 pl-5 text-[13px] leading-5 break-keep text-text-muted">
              {SCREEN_CONSENT_LINES.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
          <label className="flex items-start gap-2 text-[13px] leading-5 text-text">
            <input type="checkbox" className="mt-0.5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span className="break-keep">위 내용을 확인했고 PC 화면 공유에 동의합니다.</span>
          </label>
          {screenError && (
            <p role="alert" className="text-[13px] text-alert">
              {screenError}
            </p>
          )}
          <Button variant="primary" size="sm" disabled={!agreed || screen === 'requesting'} onClick={() => void camHub.startScreenShare()}>
            화면 공유 시작
          </Button>
        </div>
      )}
    </section>
  )
}
