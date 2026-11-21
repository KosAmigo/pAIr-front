// 실전 응시 화면의 카메라 감독 패널 (왼쪽 아래 고정).
// 3초 보정 → 감시. 경고가 확정되면 이벤트 1건 + 사진 1장만 서버로 보낸다 (영상은 보내지 않음).
import { useEffect, useState } from 'react'
import { Camera, ChevronDown, ChevronUp, RefreshCw, TriangleAlert } from 'lucide-react'
import { cx } from '../../components/cx'
import { Button, StatusDot } from '../../components/ui'
import { camHub } from '../camHub.ts'
import { checksSkipped } from '../testSkip.ts'
import { VIDEO_BYTES_PER_SEC, formatBytes } from '../core/events.ts'
import type { LiveExam } from '../liveExam.ts'
import { CamPreview } from './CamPreview.tsx'
import { ConnectionGate } from './ConnectionGate.tsx'
import { PhonePairCard } from './PhonePairCard.tsx'
import { PHONE_CAM_ENABLED } from '../features.ts'
import { useCamHub } from './useCamHub.ts'

const TOAST_MS = 4000
const RECENT_WARNINGS = 5

/** 경고가 어느 감지에서 나왔는지 (휴대폰 경고도 PC 에서 같이 보이게) */
function sourceLabel(source: string): string {
  if (source === 'PC_CAM') return '노트북 캠'
  if (source === 'PHONE_CAM') return '휴대폰 캠'
  return '브라우저'
}

export default function CamMonitor({ live }: { live: LiveExam }) {
  const hub = useCamHub()
  const [open, setOpen] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  // 응시 화면에 들어오면 (새로 고침 뒤에도) 카메라를 다시 켜고 보정부터 시작한다
  const skipped = checksSkipped()
  useEffect(() => {
    if (skipped) return
    camHub.connect(live.invite)
    if (camHub.getState().monitor !== 'monitoring') {
      camHub.startMonitoring(live.serverOffsetMs).catch(() => undefined)
    }
  }, [live.invite, live.serverOffsetMs, skipped])

  // 응시 중 3채널 연결 감시 (15초 넘게 끊기면 응시 화면을 막는다)
  useEffect(() => {
    if (skipped) return
    camHub.startGate()
    return () => camHub.stopGate()
  }, [skipped])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // 테스트용 점검 건너뛰기를 한 응시에서는 카메라 감독 패널과 오류 창을 띄우지 않는다
  if (skipped) return null

  const w = hub.lastWarning
  const toast = w && now - hub.lastWarningAt < TOAST_MS ? `${w.message} (${sourceLabel(w.source)})` : null
  const elapsedSec = hub.monitoringSince ? (now - hub.monitoringSince) / 1000 : 0
  const cams = hub.phone === 'connected' ? 2 : 1
  const videoEquiv = elapsedSec * VIDEO_BYTES_PER_SEC * cams
  const sent = hub.bytesSent + (hub.phoneStatus?.bytesSent ?? 0)
  const failed = hub.monitor === 'error' || hub.camera === 'error'
  const statusText =
    hub.camera === 'loading' ? '카메라 준비 중' : hub.monitor === 'calibrating' ? '기준 자세 잡는 중' : hub.monitor === 'monitoring' ? '감독 중' : failed ? '확인 필요' : '대기'

  return (
    <>
      <ConnectionGate />
      <section
        aria-label="카메라 감독"
        className="fixed bottom-4 left-4 z-40 w-[280px] overflow-hidden rounded-xl border border-line bg-panel shadow-modal"
      >
        <header className="flex h-10 items-center gap-2 border-b border-line px-3">
          <Camera size={16} className="text-brand" aria-hidden />
          <span className="text-[13px] font-semibold">카메라 감독</span>
          <span className="ml-auto">
            <StatusDot status={hub.monitor === 'monitoring' ? 'ok' : failed ? 'down' : 'check'} label={statusText} />
          </span>
          <button
            type="button"
            className="ml-1 inline-flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-panel-raised"
            aria-label={open ? '감독 패널 접기' : '감독 패널 펼치기'}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <ChevronDown size={16} aria-hidden /> : <ChevronUp size={16} aria-hidden />}
          </button>
        </header>
        {open && (
          <div className="flex flex-col gap-2 p-3">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-panel-raised">
              <CamPreview />
              {hub.monitor === 'calibrating' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 px-4 text-center text-[13px] font-semibold text-white">
                  화면을 정면으로 보고 바르게 앉아 주세요
                  <span className="h-1.5 w-full overflow-hidden rounded-full bg-white/30">
                    <span className="block h-full origin-left bg-white" style={{ transform: `scaleX(${hub.calibProgress})` }} />
                  </span>
                </div>
              )}
            </div>
            {failed && (
              <div role="alert" className="flex flex-col gap-2 rounded-lg border border-alert/40 bg-alert/10 p-2 text-[13px] text-alert">
                {hub.error}
                <Button size="sm" variant="secondary" onClick={() => void camHub.startMonitoring(live.serverOffsetMs).catch(() => undefined)}>
                  <RefreshCw size={14} aria-hidden /> 다시 시도
                </Button>
              </div>
            )}
            {hub.monitor === 'monitoring' && hub.active.length > 0 && (
              <ul className="flex flex-wrap gap-1" aria-label="지금 이어지는 이상 상태">
                {hub.active.map((a) => (
                  <li key={a.kind} className="rounded-sm bg-caution/12 px-1.5 py-0.5 text-[12px] font-medium text-caution">
                    {a.message} {(a.heldMs / 1000).toFixed(1)}/{(a.durationMs / 1000).toFixed(1)}초
                  </li>
                ))}
              </ul>
            )}
            {hub.log.length > 0 && (
              <ul className="flex flex-col gap-1" aria-label="최근 경고">
                {hub.log.slice(0, RECENT_WARNINGS).map((v) => (
                  <li key={v.id} className="flex items-baseline gap-1.5 text-[12px] leading-4">
                    <span className="tnum shrink-0 text-text-faint">{new Date(v.ts).toLocaleTimeString('ko-KR', { hour12: false })}</span>
                    <span className="shrink-0 rounded-sm bg-panel-raised px-1 font-medium text-text-muted">{sourceLabel(v.source)}</span>
                    <span className="min-w-0 break-keep text-text">{v.message}</span>
                  </li>
                ))}
              </ul>
            )}
            {!PHONE_CAM_ENABLED ? null : hub.phone !== 'connected' ? (
              <PhonePairCard />
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-[12px] text-text-muted">
                  휴대폰 보조 캠 연결됨
                  {hub.phoneAnalysis.status === 'monitoring' ? ' · 감시 중' : hub.phoneAnalysis.status === 'calibrating' ? ' · 기준 위치 잡는 중' : ''}
                </p>
                {hub.phoneAnalysis.status === 'error' && (
                  <div role="alert" className="flex flex-col gap-2 rounded-lg border border-alert/40 bg-alert/10 p-2 text-[13px] text-alert">
                    {hub.phoneAnalysis.error}
                    <Button size="sm" variant="secondary" onClick={() => camHub.recalibratePhone()}>
                      <RefreshCw size={14} aria-hidden /> 휴대폰 기준 다시 잡기
                    </Button>
                  </div>
                )}
              </div>
            )}
            {hub.monitor === 'monitoring' && (
              <p className="text-[12px] text-text-muted">
                전송 {formatBytes(sent)} · 영상이었다면 약 {formatBytes(Math.round(videoEquiv))}
                {videoEquiv > 0 && ` (${((1 - sent / videoEquiv) * 100).toFixed(1)}% 절감)`}
              </p>
            )}
            <p className="text-[12px] text-text-faint">영상은 이 브라우저 안에서만 분석되고 전송되지 않습니다.</p>
          </div>
        )}
      </section>
      {toast && (
        <div role="alert" className={cx('fade-in fixed top-14 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-md border border-caution/40 bg-panel-raised px-4 py-2 text-[14px] shadow-modal')}>
          <TriangleAlert size={16} className="text-caution" aria-hidden />
          {toast}
        </div>
      )}
    </>
  )
}
