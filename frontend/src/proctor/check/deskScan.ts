// 책상 스캔 (응시자 PC 에서 실행): 휴대폰 영상으로 조명 점검 → 책상 고정 대기 → 키프레임 타일 감지 → 감지 결과 전달.
// 책상 위 감지는 응시를 막지 않는다 (불통과 없음). 감지된 물체는 응시자에게 경고로 보여 주고, 사진과 함께 감독관에게 전달한다.
// 휴대폰은 영상만 보내고, 이 모듈이 PC 가 받은 영상(video)을 분석한다. 순수 판정 함수는 envChecks.ts 를 그대로 쓴다.
import type { ObjectDetector } from '@mediapipe/tasks-vision'
import { dedupeObjects, type DetectedObject } from '../core/phoneRules.ts'
import type { ScanStage } from '../relay/protocol.ts'
import { captureSnapshot, frameLoop } from '../vision/camera.ts'
import {
  deskDetection,
  frameDifference,
  lightingVerdict,
  lumaStats,
  makeReport,
  tileRects,
  updateItem,
  type CheckItem,
  type CheckReport,
  type Verdict,
} from './envChecks.ts'
import { grabPixels, toGray } from './probes.ts'

export const DESK_SCAN_ITEMS: CheckItem[] = [
  { id: 'lighting', label: '조명', status: 'pending', detail: '' },
  { id: 'desk', label: '책상 위 (책·메모·휴대폰)', status: 'pending', detail: '' },
]

export const DESK_MS = 6000
export const DESK_INTERVAL_MS = 1500
/** 휴대폰이 고정됐다고 보는 기준: 기준 프레임과 이 정도(0~1) 이내로 이 시간 동안 같으면 고정 */
export const DESK_STILL_DIFF = 0.04
export const DESK_STILL_MS = 1500
/** 끝내 고정되지 않으면(손에 들고 있는 등) 이 시간 뒤에 그대로 시작한다 */
export const DESK_WAIT_MAX_MS = 15000
export const DESK_PROMPT = '휴대폰을 책상 전체가 한 화면에 보이는 곳에 세워 두고 움직이지 마세요'
/** 고화질 영상이 도착하기를 기다리는 최대 시간과, 충분하다고 보는 가로 해상도 */
export const SCAN_RESOLUTION_WAIT_MS = 5000
export const SCAN_MIN_WIDTH = 1200
/** 조명·고정 대기는 가벼운 픽셀 비교라 이 정도 간격이면 충분하다 */
const LIGHT_MIN_INTERVAL_MS = 100

export type DeskScanIO = {
  video: HTMLVideoElement
  detector: ObjectDetector
  onItems: (items: CheckItem[]) => void
  onPrompt: (text: string) => void
  /** 키프레임마다 찾은 물체 (화면 표시용) */
  onFound: (labels: string[]) => void
  /** 점검 사진 1장 (서버 업로드·허브 보관은 호출하는 쪽) */
  onFrame: (stage: ScanStage, image: string, objects: string[]) => void
  /** 어두울 때 한 번 호출 (휴대폰 손전등 요청). 끝나면 false 로 한 번 더 호출한다 */
  onTorch: (on: boolean) => void
  isCancelled: () => boolean
}

/** 작업 캔버스는 한 번 만들어 계속 쓴다 (호출마다 새로 만들면 메모리가 쌓인다) */
let scratchCanvases: { full: HTMLCanvasElement; tile: HTMLCanvasElement } | null = null
function scratch() {
  return (scratchCanvases ??= { full: document.createElement('canvas'), tile: document.createElement('canvas') })
}

/** 크기가 같으면 건드리지 않는다 (width 를 다시 쓰면 캔버스가 초기화되고 메모리를 다시 잡는다) */
function sizeCanvas(canvas: HTMLCanvasElement, w: number, h: number) {
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
}

/** 고해상도 프레임을 타일로 나눠 감지하고 결과를 합친다 */
export function detectTiled(video: HTMLVideoElement, detector: ObjectDetector): DetectedObject[] {
  const W = video.videoWidth
  const H = video.videoHeight
  const { full, tile } = scratch()
  sizeCanvas(full, W, H)
  const fullCtx = full.getContext('2d')
  if (!fullCtx) return []
  fullCtx.drawImage(video, 0, 0)
  const out: DetectedObject[] = []
  for (const r of tileRects(W, H)) {
    sizeCanvas(tile, r.w, r.h)
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

/** 영상 해상도가 충분히 올라올 때까지(또는 시간이 지날 때까지) 기다린다. 안 올라와도 그대로 스캔한다 */
export async function waitForScanResolution(video: HTMLVideoElement, isCancelled: () => boolean, timeoutMs = SCAN_RESOLUTION_WAIT_MS): Promise<number> {
  const begin = performance.now()
  while (!isCancelled() && video.videoWidth < SCAN_MIN_WIDTH && performance.now() - begin < timeoutMs) {
    await new Promise((r) => setTimeout(r, 200))
  }
  return video.videoWidth
}

/** 조명 → 책상 위 순서로 점검하고 결과를 돌려준다. 취소되면 null */
export async function runDeskScan(io: DeskScanIO): Promise<CheckReport | null> {
  const { video } = io
  let current = DESK_SCAN_ITEMS.map((i) => ({ ...i }))
  let stopLoop = null as (() => void) | null
  const set = (id: string, patch: Partial<CheckItem>) => {
    current = updateItem(current, id, patch)
    io.onItems(current)
  }
  const apply = (id: string, v: Verdict) => set(id, { status: v.status, detail: v.detail })
  let torchTried = false
  const loop = (onFrame: (now: number) => boolean, minIntervalMs = 0) =>
    new Promise<void>((resolve) => {
      // 취소되면 프레임 콜백이 더는 불리지 않으므로, 대기 중인 단계가 걸리지 않게 주기적으로 확인해 끝낸다
      const watch = window.setInterval(() => {
        if (!io.isCancelled()) return
        stopLoop?.()
        window.clearInterval(watch)
        resolve()
      }, 300)
      stopLoop = frameLoop(
        video,
        (now) => {
          if (io.isCancelled()) return
          if (onFrame(now)) {
            stopLoop?.()
            window.clearInterval(watch)
            resolve()
          }
        },
        { minIntervalMs },
      )
    })

  try {
    io.onItems(current)
    // 1) 조명: 어두우면 휴대폰 손전등을 켜 보고 다시 잰다
    set('lighting', { status: 'running' })
    io.onPrompt('방 조명을 켜 주세요')
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
          io.onTorch(true)
        }
        goodSince = null
        return false
      }
      goodSince ??= now
      return now - goodSince > 1000
    }, LIGHT_MIN_INTERVAL_MS)
    apply('lighting', lastV)
    if (io.isCancelled()) return null

    // 2) 책상 위: 휴대폰이 고정될 때까지 기다린 뒤, 일정 간격으로 고해상도 키프레임
    set('desk', { status: 'running' })
    io.onPrompt(DESK_PROMPT)
    const found: Record<string, number> = {}
    const waitBegin = performance.now()
    let still: Uint8Array | null = null
    let stillAt = 0
    await loop((now) => {
      const px = grabPixels(video, 32, 24)
      if (!px) return false
      const gray = toGray(px)
      if (!still || frameDifference(gray, still) > DESK_STILL_DIFF) {
        still = gray
        stillAt = now
      }
      set('desk', { detail: '휴대폰을 고정하는 중' })
      return now - stillAt > DESK_STILL_MS || now - waitBegin > DESK_WAIT_MAX_MS
    }, LIGHT_MIN_INTERVAL_MS)
    if (io.isCancelled()) return null

    io.onPrompt('좋습니다. 그대로 잠깐 유지해 주세요')
    const deskBegin = performance.now()
    let deskLast = Number.NEGATIVE_INFINITY
    await loop((now) => {
      if (now - deskLast > DESK_INTERVAL_MS) {
        deskLast = now
        keyframe(io, found)
      }
      set('desk', { detail: `${Math.max(0, (DESK_MS - (now - deskBegin)) / 1000).toFixed(0)}초 남음` })
      return now - deskBegin > DESK_MS
    })
    if (io.isCancelled()) return null
    apply('desk', deskDetection(found))
    io.onPrompt('')
    return makeReport(current)
  } finally {
    stopLoop?.()
    if (torchTried) io.onTorch(false)
  }
}

function keyframe(io: DeskScanIO, found: Record<string, number>) {
  const objs = detectTiled(io.video, io.detector)
  for (const label of new Set(objs.map((o) => o.label))) found[label] = (found[label] ?? 0) + 1
  io.onFound(objs.map((o) => `${o.label} ${(o.score * 100).toFixed(0)}%`))
  const image = captureSnapshot(io.video, 640, 0.75)
  if (!image) return
  io.onFrame('desk', image, objs.map((o) => o.label))
}
