// 서버 추론 감독의 입장 점검 (PC 는 분석하지 않는다).
// 장치·브라우저 점검(카메라·모니터·소음)은 PC 에서, 키보드·마우스·두 손 인식은 서버 판정 결과로 체크리스트를 보여 준다.
// 업로드 지연·손실도 재서 느린 연결이면 조치를 안내한다.
import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui'
import { camHub } from '../camHub.ts'
import { audioVerdict, cameraVerdict, makeReport, rendererVerdict, screensVerdict, updateItem, type CheckItem, type Verdict } from '../check/envChecks.ts'
import { audioProbe, isAutomated, isChromium, screenInfo, webglRenderer } from '../check/probes.ts'
import { checkItemsFrom, checkPassed, linkVerdict } from '../core/visionContract.ts'
import { CAN_SKIP_CHECKS, clearChecksSkipped, markChecksSkipped } from '../testSkip.ts'
import { CheckList } from './CheckList.tsx'
import { useCamHub } from './useCamHub.ts'
import type { EnvCheckResult } from './EnvCheckPanel.tsx'

const PC_ITEMS: CheckItem[] = [
  { id: 'browser', label: '브라우저', status: 'pending', detail: '' },
  { id: 'graphics', label: '원격 접속·가상 머신', status: 'pending', detail: '' },
  { id: 'screens', label: '모니터', status: 'pending', detail: '' },
  { id: 'camera', label: '카메라 (가상 카메라 여부)', status: 'pending', detail: '' },
  { id: 'audio', label: '이어폰·헤드셋 연결 / 주변 소음', status: 'pending', detail: '' },
  { id: 'link', label: '서버 연결 (업로드 지연)', status: 'pending', detail: '' },
]

type Props = {
  onPassed: (r: EnvCheckResult) => void
  onProgress?: (r: EnvCheckResult) => void
  finishLabel?: string
  allowSkip?: boolean
}

export default function ServerEnvCheck({ onPassed, onProgress, finishLabel = '점검 결과 저장', allowSkip = true }: Props) {
  const hub = useCamHub()
  const [items, setItems] = useState(PC_ITEMS)
  const [run, setRun] = useState(0)

  // 장치·연결 점검 (한 번)
  useEffect(() => {
    let cancelled = false
    const set = (id: string, patch: Partial<CheckItem>) => {
      if (!cancelled) setItems((cur) => updateItem(cur, id, patch))
    }
    const apply = (id: string, v: Verdict) => set(id, { status: v.status, detail: v.detail })
    void (async () => {
      setItems(PC_ITEMS)
      try {
        await camHub.openCamera()
      } catch {
        return // 오류 문구는 허브 상태로 보여 준다
      }
      if (cancelled) return
      apply(
        'browser',
        isAutomated()
          ? { status: 'fail', detail: '자동화 도구로 제어되는 브라우저입니다.' }
          : isChromium()
            ? { status: 'pass', detail: 'Chromium 계열' }
            : { status: 'warn', detail: 'Chrome·Edge 를 권장합니다 (모니터 확인 기능).' },
      )
      apply('graphics', rendererVerdict(webglRenderer()))
      set('screens', { status: 'running', detail: '확인 중 (권한 창이 뜨면 허용해 주세요)' })
      const sc = await screenInfo()
      apply('screens', screensVerdict(sc.count, sc.isExtended))
      apply('camera', cameraVerdict(camHub.stream()?.getVideoTracks()[0]?.label ?? ''))
      set('audio', { status: 'running', detail: '마이크로 2초간 확인 중 (조용히 해 주세요)' })
      const audio = await audioProbe()
      const av = audioVerdict(audio.labels)
      const noisy = audio.noiseDb !== null && audio.noiseDb > -35
      apply('audio', { status: av.status === 'pass' && noisy ? 'warn' : av.status, detail: av.detail + (noisy ? ' · 주변이 시끄럽습니다' : '') })
      if (cancelled) return
      set('link', { status: 'running', detail: '서버와 주고받는 속도를 재는 중입니다' })
      apply('link', linkVerdict(await camHub.probeLink()))
    })()
    return () => {
      cancelled = true
    }
  }, [run])

  // 서버가 판정한 통과(모든 항목이 연속으로 참, 두 손 인식)만 인정한다. 서버가 보낸 항목 id 는 점검 JSON 의 phone_* 로 들어간다
  const phoneItems: CheckItem[] = checkItemsFrom(hub.visionCheck, hub.phone === 'connected')
  const phoneDone = hub.phone === 'connected' && checkPassed(hub.visionCheck)
  const pcDone = items.every((i) => i.status !== 'pending' && i.status !== 'running')
  const result: EnvCheckResult | null = pcDone && phoneDone ? { pc: makeReport(items), phone: makeReport(phoneItems) } : null

  const onProgressRef = useRef(onProgress)
  const resultRef = useRef(result)
  useEffect(() => {
    onProgressRef.current = onProgress
    resultRef.current = result
  })
  // 매 렌더마다 올리지 않도록 항목 상태가 바뀔 때만 알린다
  const progressKey = items.map((i) => i.status).join() + (result ? "|done" : "") + phoneItems.map((i) => i.status).join()
  useEffect(() => {
    onProgressRef.current?.(resultRef.current ?? { pc: makeReport(items), phone: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressKey])

  const passed = result?.pc.passed
  const skipAll = () => {
    markChecksSkipped()
    onPassed({ pc: makeReport(items.map((i) => ({ ...i, status: 'pass' as const, detail: '테스트용으로 건너뜀' }))), phone: null })
  }

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="server-env-check">
      {hub.camera === 'error' && (
        <div role="alert" className="flex items-center gap-3 rounded-lg border border-alert/40 bg-alert/10 px-3 py-2 text-[14px] text-alert">
          <span className="min-w-0 flex-1 break-keep">{hub.error}</span>
          <Button size="sm" variant="secondary" onClick={() => setRun((n) => n + 1)}>
            <RefreshCw size={16} aria-hidden /> 다시 시도
          </Button>
        </div>
      )}
      <CheckList items={items} />
      <h3 className="mt-1 text-[14px] font-semibold text-text">휴대폰 카메라 (서버 판정)</h3>
      <p className="text-[13px] leading-5 break-keep text-text-muted">
        휴대폰 영상은 화면에 표시되지 않습니다. 키보드와 마우스 위에 두 손을 올려 두면 인식 결과가 아래에 표시됩니다. 두 손이 모두 인식되어야 통과합니다.
      </p>
      <CheckList items={phoneItems} />
      {CAN_SKIP_CHECKS && allowSkip && (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-line-strong px-3 py-2">
          <span className="text-[13px] text-text-muted">테스트용: 모든 점검을 통과한 것으로 처리합니다.</span>
          <Button variant="secondary" size="sm" className="ml-auto shrink-0" onClick={skipAll}>
            점검 건너뛰기
          </Button>
        </div>
      )}
      {result && (
        <div className="flex items-center gap-3 border-t border-line pt-3">
          <p className={passed ? 'text-[14px] text-text' : 'text-[14px] text-alert'} role={passed ? undefined : 'alert'}>
            {passed ? '점검을 통과했습니다.' : '통과하지 못한 항목이 있습니다. 조치 후 다시 점검하거나, 이대로 저장하고 입장할 수 있습니다 (감독 기록에 남습니다).'}
          </p>
          <Button
            variant={passed ? 'primary' : 'secondary'}
            className="ml-auto"
            onClick={() => {
              clearChecksSkipped()
              onPassed(result)
            }}
          >
            {finishLabel}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRun((n) => n + 1)}>
            <RefreshCw size={16} aria-hidden /> 다시 점검
          </Button>
        </div>
      )}
    </div>
  )
}
