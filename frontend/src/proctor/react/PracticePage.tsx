// 사전 테스트 (연습 모드): 실제 시험과 같은 점검 화면(웹캠·휴대폰·PC 화면 공유)을 돌려 본다.
// 입장 토큰도 서버 기록도 없다. 이벤트·사진·점검 결과를 서버로 보내지 않는다 (camHub.connectPractice).
import { useEffect, useState } from 'react'
import { Button, StatusDot } from '../../components/ui'
import { camHub, channelUp } from '../camHub.ts'
import { CHANNEL_LABEL, CHANNELS, allUp } from '../core/connectionPolicy.ts'
import EnvCheckPanel, { EnvAside, type EnvCheckResult } from './EnvCheckPanel.tsx'
import { PHONE_CAM_ENABLED, SCREEN_SHARE_ENABLED } from '../features.ts'
import { ScreenShareCard } from './ScreenShareCard.tsx'
import { useCamHub } from './useCamHub.ts'

export default function PracticePage() {
  const hub = useCamHub()
  const [passed, setPassed] = useState<EnvCheckResult | null>(null)

  useEffect(() => {
    camHub.connectPractice()
    return () => {
      void camHub.stop()
    }
  }, [])

  const up = channelUp(hub)
  const ready = allUp(up)

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1040px] flex-col gap-4 px-6 py-8">
      <header>
        <p className="label text-brand">PRACTICE</p>
        <h1 className="text-h2 font-semibold">사전 테스트</h1>
        <p className="mt-1 text-[14px] leading-6 break-keep text-text-muted">
          실제 시험과 같은 점검을 미리 해 봅니다. 연습이라 서버에는 아무 기록도 남지 않고 사진도 보내지 않습니다. 웹캠을 연결해 보세요.
        </p>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-5">
        <div className="min-w-0">
          <EnvCheckPanel withAside={false} onPassed={setPassed} />
        </div>
        <aside className="flex flex-col gap-3">
          <EnvAside />
          {SCREEN_SHARE_ENABLED && <ScreenShareCard />}
        </aside>
      </div>
      <section className="rounded-xl border border-line bg-panel p-4" aria-label="연결 상태">
        <h2 className="text-[15px] font-semibold">연결 상태</h2>
        <ul className="mt-2 flex flex-wrap gap-4">
          {CHANNELS.filter((c) => c === 'webcam' || (c === 'phone' ? PHONE_CAM_ENABLED : SCREEN_SHARE_ENABLED)).map((c) => (
            <li key={c}>
              <StatusDot status={up[c] ? 'ok' : 'down'} label={`${CHANNEL_LABEL[c]} ${up[c] ? '연결됨' : '미연결'}`} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] text-text-muted">
          {ready && passed ? '사전 테스트를 통과했습니다. 실제 시험에서도 웹캠이 연결돼 있어야 시작할 수 있고, 시험 중 15초 넘게 끊기면 화면이 막힙니다.' : '웹캠이 연결되고 점검을 통과하면 실제 시험을 준비할 수 있습니다.'}
        </p>
        {passed && (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => window.location.assign('/')}>
            연습 끝내기
          </Button>
        )}
      </section>
    </div>
  )
}
