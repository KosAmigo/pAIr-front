// 휴대폰 환경 점검: 조명 → 방 360도 스캔 → 책상 위 스캔.
// 작은·먼 물체를 놓치지 않도록 키프레임마다 고해상도 프레임을 타일로 나눠 감지한다.
// 방 360도는 방향(자이로)을 12구간으로 나눠 구간마다 한 장씩 찍고, 한 구간이 끝나면 "조금 더 돌아 주세요"로 안내한다.
// 방에서 있으면 안 되는 물체가 잡혀도 막지 않고 경고만 남긴다 (감독관이 사진으로 확인). 책상 위에서 휴대폰이 잡히면 응시자가 장면을 보고 확인한다.
// 점검 사진은 릴레이로 PC 에 넘기고, 릴레이가 파일 서버(백엔드)에 올린다.
import { useEffect, useRef, useState } from 'react'
import type { ObjectDetector } from '@mediapipe/tasks-vision'
import { RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui'
import {
  ANGLE_SCAN,
  AngleScanTracker,
  CoverageTracker,
  SCAN,
  frameDifference,
  lightingVerdict,
  lumaStats,
  makeReport,
  scanComplete,
  scanVerdict,
  tileRects,
  type CheckItem,
  type CheckReport,
  type Verdict,
  updateItem,
} from '../check/envChecks.ts'
import { grabPixels, headingOf, setTorch, toGray } from '../check/probes.ts'
import { dedupeObjects, type DetectedObject } from '../core/phoneRules.ts'
import type { ClientMsg, ScanStage } from '../relay/protocol.ts'
import { captureSnapshot, frameLoop } from '../vision/camera.ts'
import { CheckList } from './CheckList.tsx'

type Props = {
  video: HTMLVideoElement
  stream: MediaStream
  detector: ObjectDetector
  gyro: boolean
  send: (msg: ClientMsg) => void
  onDone: (report: CheckReport) => void
}

const INITIAL: CheckItem[] = [
  { id: 'lighting', label: '조명', status: 'pending', detail: '' },
  { id: 'room', label: '방 360도 스캔 (다른 사람·기기·화면)', status: 'pending', detail: '' },
  { id: 'desk', label: '책상 위 (책·메모·휴대폰)', status: 'pending', detail: '' },
]

const DESK_MS = 6000
const DESK_INTERVAL_MS = 1500
const COVERAGE_STEP_DEG = 30
/** 휴대폰으로 감지된 장면을 확인 창에 보여 줄 최대 장수 */
const MAX_CONFIRM_SHOTS = 3

/** 방향별 확인 안내 */
const ANGLE_PROMPT = {
  hold: '이 방향을 확인하는 중입니다. 잠깐 멈춰 주세요',
  'turn-more': '이 방향은 확인했습니다. 조금 더 돌아 주세요',
  complete: '한 바퀴 확인을 마쳤습니다',
} as const

/** 고해상도 프레임을 타일로 나눠 감지하고 결과를 합친다 */
function detectTiled(video: HTMLVideoElement, detector: ObjectDetector): DetectedObject[] {
  const W = video.videoWidth
  const H = video.videoHeight
  const full = document.createElement('canvas')
  full.width = W
  full.height = H
  const fullCtx = full.getContext('2d')
  if (!fullCtx) return []
  fullCtx.drawImage(video, 0, 0)
  const tile = document.createElement('canvas')
  const out: DetectedObject[] = []
  for (const r of tileRects(W, H)) {
    tile.width = r.w
    tile.height = r.h
    tile.getContext('2d')?.drawImage(full, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h)
    for (const d of detector.detect(tile).detections) {
      const cat = d.categories[0]
      const bb = d.boundingBox
      if (!cat || !bb) continue
      out.push({
        label: cat.categoryName,
        score: cat.score,
        bright: false,
        box: { x: (r.x + bb.originX) / W, y: (r.y + bb.originY) / H, w: bb.width / W, h: bb.height / H },
      })
    }
  }
  return dedupeObjects(out)
}

export function PhoneScan({ video, stream, detector, gyro, send, onDone }: Props) {
  const [items, setItems] = useState(INITIAL)
  const [prompt, setPrompt] = useState('')
  const [coverage, setCoverage] = useState<boolean[]>([])
  const [keyframes, setKeyframes] = useState(0)
  const [last, setLast] = useState<string[]>([])
  const [report, setReport] = useState<CheckReport | null>(null)
  const [run, setRun] = useState(0)
  /** 휴대폰으로 감지된 장면: 응시자가 맞는지 확인할 때까지 기다린다 */
  const [confirm, setConfirm] = useState<{ shots: string[]; resolve: (isPhone: boolean) => void } | null>(null)
  const headingRef = useRef<number | null>(null)

  useEffect(() => {
    if (!gyro) return
    const onOrient = (e: DeviceOrientationEvent) => {
      headingRef.current = headingOf(e)
    }
    window.addEventListener('deviceorientation', onOrient)
    return () => window.removeEventListener('deviceorientation', onOrient)
  }, [gyro])

  useEffect(() => {
    let cancelled = false
    let stopLoop: (() => void) | null = null
    let current = INITIAL.map((i) => ({ ...i }))
    const set = (id: string, patch: Partial<CheckItem>) => {
      current = updateItem(current, id, patch)
      if (!cancelled) setItems(current)
    }
    const apply = (id: string, v: Verdict) => set(id, { status: v.status, detail: v.detail })

    const loop = (onFrame: (now: number) => boolean) =>
      new Promise<void>((resolve) => {
        stopLoop = frameLoop(video, (now) => {
          if (cancelled) return
          if (onFrame(now)) {
            stopLoop?.()
            resolve()
          }
        })
      })

    const keyframe = (stage: ScanStage, found: Record<string, number>, phoneShots: string[], angle?: number) => {
      const objs = detectTiled(video, detector)
      for (const label of new Set(objs.map((o) => o.label))) found[label] = (found[label] ?? 0) + 1
      setLast(objs.map((o) => `${o.label} ${(o.score * 100).toFixed(0)}%`))
      const image = captureSnapshot(video, 640, 0.75)
      if (image) {
        if (objs.some((o) => o.label === 'cell phone')) phoneShots.push(image)
        send({ type: 'scan-frame', stage, image, objects: objs.map((o) => o.label), ...(angle === undefined ? {} : { angle: Math.round(angle) }) })
      }
    }

    /** 휴대폰이 감지됐으면 응시자에게 장면을 보여 주고 맞는지 확인받는다. 아니라고 하면 경고로 낮춰 기록한다 */
    const verdictOf = async (stage: 'room' | 'desk', found: Record<string, number>, phoneShots: string[]): Promise<Verdict> => {
      // 방 360도는 물체가 잡혀도 막지 않고 경고만 남긴다 (감독관이 사진을 보고 나중에 치우도록 안내). 묻지 않는다
      if (stage === 'room' || !found['cell phone']) return scanVerdict(found, stage)
      const isPhone = await new Promise<boolean>((resolve) => setConfirm({ shots: phoneShots.slice(-MAX_CONFIRM_SHOTS), resolve }))
      setConfirm(null)
      return scanVerdict(found, stage, { phoneDismissed: !isPhone })
    }

    async function main() {
      setItems(current)
      setReport(null)
      // 1) 조명: 어두우면 손전등을 켜 보고 다시 잰다
      set('lighting', { status: 'running' })
      setPrompt('방 조명을 켜 주세요')
      let torchTried = false
      let goodSince: number | null = null
      let lastV: Verdict = { status: 'fail', detail: '' }
      await loop((now) => {
        const px = grabPixels(video)
        if (!px) return false
        lastV = lightingVerdict(lumaStats(px.data, px.width, px.height))
        set('lighting', { detail: lastV.detail })
        if (lastV.status === 'fail') {
          if (!torchTried) {
            torchTried = true
            void setTorch(stream, true)
          }
          goodSince = null
          return false
        }
        goodSince ??= now
        return now - goodSince > 1000
      })
      apply('lighting', lastV)
      if (cancelled) return

      // 2) 방 360도: 방향을 구간으로 나눠 구간마다 한 장 (방향 센서가 없으면 화면 변화로 키프레임)
      set('room', { status: 'running' })
      setPrompt('휴대폰을 들고 제자리에서 천천히 한 바퀴 돌며 방 전체를 비춰 주세요')
      const angles = new AngleScanTracker()
      const cov = new CoverageTracker()
      const roomFound: Record<string, number> = {}
      const roomPhoneShots: string[] = []
      let lastGray: Uint8Array | null = null
      let lastKeyAt = Number.NEGATIVE_INFINITY
      let lastHint: string | null = null
      let count = 0
      const begin = performance.now()
      setKeyframes(0)
      setCoverage(cov.map)
      await loop((now) => {
        const heading = gyro ? headingRef.current : null
        if (heading !== null) {
          // 방향별 확인: 구간에 잠깐 머물면 그 구간을 찍고, 끝나면 조금 더 돌라고 안내한다
          const { capture } = angles.update(heading, now)
          if (capture !== null) {
            keyframe('room', roomFound, roomPhoneShots, AngleScanTracker.angleOf(capture))
            setKeyframes(++count)
            navigator.vibrate?.(40)
          }
          setCoverage(angles.map)
          if (angles.hint !== lastHint) {
            lastHint = angles.hint
            setPrompt(ANGLE_PROMPT[angles.hint])
          }
          set('room', { detail: `${angles.doneCount}/${ANGLE_SCAN.sectors} 방향 · 사진 ${count}장` })
          return angles.complete
        }
        const px = grabPixels(video, 32, 24)
        if (!px) return false
        const gray = toGray(px)
        if ((!lastGray || frameDifference(gray, lastGray) > SCAN.keyframeDiff) && now - lastKeyAt > SCAN.keyframeMinGapMs) {
          lastGray = gray
          lastKeyAt = now
          keyframe('room', roomFound, roomPhoneShots)
          setKeyframes(++count)
        }
        set('room', { detail: `사진 ${count}장 · ${((now - begin) / 1000).toFixed(0)}초` })
        return scanComplete(count, null, now - begin)
      })
      if (cancelled) return
      apply('room', await verdictOf('room', roomFound, roomPhoneShots))
      if (cancelled) return

      // 3) 책상 위: 일정 간격으로 고해상도 키프레임
      set('desk', { status: 'running' })
      setPrompt('책상 위 전체가 보이도록 위에서 내려다보듯 천천히 비춰 주세요')
      const deskFound: Record<string, number> = {}
      const deskPhoneShots: string[] = []
      const deskBegin = performance.now()
      let deskLast = Number.NEGATIVE_INFINITY
      await loop((now) => {
        if (now - deskLast > DESK_INTERVAL_MS) {
          deskLast = now
          keyframe('desk', deskFound, deskPhoneShots)
        }
        set('desk', { detail: `${Math.max(0, (DESK_MS - (now - deskBegin)) / 1000).toFixed(0)}초 남음` })
        return now - deskBegin > DESK_MS
      })
      if (cancelled) return
      apply('desk', await verdictOf('desk', deskFound, deskPhoneShots))
      void setTorch(stream, false)
      setPrompt('')

      const r = makeReport(current)
      send({ type: 'check-report', report: r })
      if (!cancelled) setReport(r)
    }

    void main()
    return () => {
      cancelled = true
      stopLoop?.()
    }
  }, [run, video, stream, detector, gyro, send])

  return (
    <div className="flex flex-col gap-3">
      {prompt && <p className="rounded-lg bg-brand-dim px-3 py-2 text-[15px] font-semibold text-brand">{prompt}</p>}
      {items[1].status === 'running' && (
        <div className="flex items-center gap-4">
          {gyro && (
            <div className="relative size-16" aria-hidden>
              {coverage.map((c, i) => (
                <span
                  key={i}
                  className={c ? 'absolute top-1/2 left-1/2 size-2 rounded-full bg-signal' : 'absolute top-1/2 left-1/2 size-2 rounded-full bg-line'}
                  style={{ transform: `translate(-50%, -50%) rotate(${i * COVERAGE_STEP_DEG}deg) translateY(-26px)` }}
                />
              ))}
            </div>
          )}
          <span className="text-[13px] text-text-muted">
            사진 {keyframes}장{!gyro && ' (방향 센서 없음: 15초 이상 천천히 돌려 주세요)'}
          </span>
        </div>
      )}
      {last.length > 0 && !report && <p className="text-[13px] text-text-muted">방금 찾은 것: {last.join(', ')}</p>}
      {confirm && (
        <div role="alertdialog" aria-label="휴대폰 확인" className="flex flex-col gap-3 rounded-lg border border-caution/40 bg-caution/10 p-3">
          <p className="text-[15px] font-semibold">휴대폰이 감지됐습니다. 실제 휴대폰이 맞나요?</p>
          <div className="flex gap-2 overflow-x-auto">
            {confirm.shots.map((src, i) => (
              <img key={i} src={src} alt={`감지된 장면 ${i + 1}`} className="h-24 shrink-0 rounded-md border border-line" />
            ))}
          </div>
          <p className="text-[13px] leading-5 break-keep text-text-muted">휴대폰이 맞으면 치운 뒤 다시 스캔합니다. 아니라고 답하면 경고로 기록하고, 감독관이 이 사진을 확인합니다.</p>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => confirm.resolve(true)}>
              휴대폰입니다
            </Button>
            <Button variant="secondary" onClick={() => confirm.resolve(false)}>
              휴대폰이 아닙니다
            </Button>
          </div>
        </div>
      )}
      <CheckList items={items} />
      {report && (
        <div className="flex flex-wrap items-center gap-2">
          {report.passed ? (
            <Button variant="primary" onClick={() => onDone(report)}>
              다음: 휴대폰 배치
            </Button>
          ) : (
            <p role="alert" className="text-[14px] text-alert">
              통과하지 못한 항목이 있습니다. 치운 뒤 다시 스캔해 주세요.
            </p>
          )}
          <Button variant="ghost" onClick={() => setRun((n) => n + 1)}>
            <RefreshCw size={16} aria-hidden /> 다시 스캔
          </Button>
        </div>
      )}
    </div>
  )
}
