// 휴대폰 환경 점검: 조명 → 방 360도 스캔 → 책상 위 스캔.
// 작은·먼 물체를 놓치지 않도록 키프레임마다 고해상도 프레임을 타일로 나눠 감지한다.
// 점검 사진은 릴레이로 PC 에 넘기기만 하고 서버에 저장하지 않는다 (PC 가 정밀 분석).
import { useEffect, useRef, useState } from 'react'
import type { ObjectDetector } from '@mediapipe/tasks-vision'
import { RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui'
import {
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

    const keyframe = (stage: ScanStage, found: Record<string, number>) => {
      const objs = detectTiled(video, detector)
      for (const label of new Set(objs.map((o) => o.label))) found[label] = (found[label] ?? 0) + 1
      setLast(objs.map((o) => `${o.label} ${(o.score * 100).toFixed(0)}%`))
      const image = captureSnapshot(video, 640, 0.75)
      if (image) send({ type: 'scan-frame', stage, image, objects: objs.map((o) => o.label) })
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

      // 2) 방 360도: 자이로로 돈 범위를, 화면 변화로 키프레임을 잡는다
      set('room', { status: 'running' })
      setPrompt('휴대폰을 들고 제자리에서 천천히 한 바퀴 돌며 방 전체를 비춰 주세요')
      const cov = new CoverageTracker()
      const roomFound: Record<string, number> = {}
      let lastGray: Uint8Array | null = null
      let lastKeyAt = Number.NEGATIVE_INFINITY
      let count = 0
      const begin = performance.now()
      setKeyframes(0)
      setCoverage(cov.map)
      await loop((now) => {
        if (gyro && headingRef.current !== null) {
          cov.add(headingRef.current)
          setCoverage(cov.map)
        }
        const px = grabPixels(video, 32, 24)
        if (!px) return false
        const gray = toGray(px)
        if ((!lastGray || frameDifference(gray, lastGray) > SCAN.keyframeDiff) && now - lastKeyAt > SCAN.keyframeMinGapMs) {
          lastGray = gray
          lastKeyAt = now
          keyframe('room', roomFound)
          setKeyframes(++count)
        }
        const covered = gyro && headingRef.current !== null ? cov.covered : null
        set('room', {
          detail: covered !== null ? `${covered}/${cov.bins} 방향 · 사진 ${count}장` : `사진 ${count}장 · ${((now - begin) / 1000).toFixed(0)}초`,
        })
        return scanComplete(count, covered, now - begin)
      })
      apply('room', scanVerdict(roomFound, 'room'))
      if (cancelled) return

      // 3) 책상 위: 일정 간격으로 고해상도 키프레임
      set('desk', { status: 'running' })
      setPrompt('책상 위 전체가 보이도록 위에서 내려다보듯 천천히 비춰 주세요')
      const deskFound: Record<string, number> = {}
      const deskBegin = performance.now()
      let deskLast = Number.NEGATIVE_INFINITY
      await loop((now) => {
        if (now - deskLast > DESK_INTERVAL_MS) {
          deskLast = now
          keyframe('desk', deskFound)
        }
        set('desk', { detail: `${Math.max(0, (DESK_MS - (now - deskBegin)) / 1000).toFixed(0)}초 남음` })
        return now - deskBegin > DESK_MS
      })
      apply('desk', scanVerdict(deskFound, 'desk'))
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
