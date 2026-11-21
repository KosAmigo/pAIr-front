// 휴대폰 영상 분석 (응시자 PC 에서 실행).
// 휴대폰은 영상만 보내고, PC 가 받은 영상(phoneStream)에서 손·물체를 분석해 규칙 엔진에 넣는다.
// 3초 보정으로 기준 위치를 잡은 뒤 감시하며, 영상이 바뀌면(재연결) 루프를 멈추고 새 영상으로 다시 시작한다.
import type { HandLandmarker, ObjectDetector, ObjectDetectorResult } from '@mediapipe/tasks-vision'
import { toCamViolation, type CamViolation } from './core/events.ts'
import { PHONE_MIN_ANALYZE_INTERVAL_MS } from './core/frameBudget.ts'
import {
  PHONE_RULES,
  dedupeObjects,
  phoneConditions,
  resolvePhoneBaseline,
  type DetectedObject,
  type PhoneFeatures,
} from './core/phoneRules.ts'
import { RuleEngine } from './core/RuleEngine.ts'
import { FpsMeter, attachHiddenVideo, captureSnapshot, frameLoop } from './vision/camera.ts'
import { detectedObjects, phoneFeatures } from './vision/features.ts'

const CALIBRATION_MS = 3000
/** 무거운 물체 감지는 이 간격으로만 돌리고 결과를 재사용한다 */
const OBJECT_INTERVAL_MS = 500
const UI_INTERVAL_MS = 300
const LUMA_W = 64
const LUMA_H = 48
const NO_HANDS_MESSAGE = '휴대폰 영상에서 손이 보이지 않습니다. 두 손이 키보드 위에 보이도록 휴대폰 위치를 조정한 뒤 다시 시도해 주세요.'

export type PhoneAnalysisStatus = 'idle' | 'loading' | 'calibrating' | 'monitoring' | 'error'

export type PhoneAnalysisState = {
  status: PhoneAnalysisStatus
  calibProgress: number
  fps: number
  handCount: number
  objects: string[]
  error: string | null
}

export const PHONE_ANALYSIS_IDLE: PhoneAnalysisState = {
  status: 'idle',
  calibProgress: 0,
  fps: 0,
  handCount: 0,
  objects: [],
  error: null,
}

type Models = { hand: HandLandmarker; object: ObjectDetector }

type Options = {
  onState: (state: PhoneAnalysisState) => void
  onViolation: (v: CamViolation) => void
  /** 이벤트 시각을 서버 기준으로 맞출 값 (시험 중 바뀔 수 있어 호출 때마다 읽는다) */
  serverOffsetMs: () => number
}

export class PhoneAnalysis {
  private readonly opts: Options
  private releaseVideo: (() => void) | null = null
  private models: Models | null = null
  private modelsLoading: Promise<Models> | null = null
  private stopLoop: (() => void) | null = null
  /** start/stop 이 불릴 때마다 올라간다. 오래된 비동기 작업이 새 상태를 덮어쓰지 못하게 한다 */
  private generation = 0
  private state: PhoneAnalysisState = PHONE_ANALYSIS_IDLE

  constructor(opts: Options) {
    this.opts = opts
  }

  /** 이 영상으로 보정 → 감시를 시작한다. 이미 돌고 있으면 먼저 멈춘다 */
  async start(stream: MediaStream): Promise<void> {
    this.halt()
    const gen = ++this.generation
    this.emit({ ...PHONE_ANALYSIS_IDLE, status: 'loading' })
    try {
      const [models, video] = await Promise.all([this.loadModels(), this.attach(gen, stream)])
      if (gen !== this.generation) return
      this.calibrate(gen, video, models)
    } catch (e) {
      if (gen !== this.generation) return
      this.emit({ ...PHONE_ANALYSIS_IDLE, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  }

  /** 루프와 숨은 영상을 정리한다 (모델은 다음 시작을 위해 남긴다) */
  stop() {
    this.generation++
    this.halt()
    this.emit(PHONE_ANALYSIS_IDLE)
  }

  /** 모두 정리하고 모델도 닫는다 (시험 종료) */
  dispose() {
    this.stop()
    this.models?.hand.close()
    this.models?.object.close()
    this.models = null
    this.modelsLoading = null
  }

  private halt() {
    this.stopLoop?.()
    this.stopLoop = null
    this.releaseVideo?.()
    this.releaseVideo = null
  }

  private emit(patch: Partial<PhoneAnalysisState>) {
    this.state = { ...this.state, ...patch }
    this.opts.onState(this.state)
  }

  private async attach(gen: number, stream: MediaStream): Promise<HTMLVideoElement> {
    const { video, release } = await attachHiddenVideo(stream)
    if (gen !== this.generation) release() // 기다리는 사이 멈췄거나 새 영상으로 바뀜
    else this.releaseVideo = release
    return video
  }

  private loadModels(): Promise<Models> {
    if (this.models) return Promise.resolve(this.models)
    this.modelsLoading ??= (async () => {
      const m = await import('./vision/models.ts')
      const hand = await m.createHandLandmarker()
      const object = await m.createObjectDetector()
      this.models = { hand, object }
      return this.models
    })().finally(() => {
      this.modelsLoading = null
    })
    return this.modelsLoading
  }

  /** 한 프레임 분석. 손은 매번, 무거운 물체 감지는 OBJECT_INTERVAL_MS 마다 */
  private makeAnalyzer(video: HTMLVideoElement, m: Models) {
    const luma = document.createElement('canvas')
    luma.width = LUMA_W
    luma.height = LUMA_H
    const lumaCtx = luma.getContext('2d', { willReadFrequently: true })
    let lastObjAt = Number.NEGATIVE_INFINITY
    let objects: DetectedObject[] = []
    let objRes: ObjectDetectorResult | undefined
    return (now: number): PhoneFeatures => {
      const handRes = m.hand.detectForVideo(video, now)
      if (now - lastObjAt >= OBJECT_INTERVAL_MS && lumaCtx) {
        lastObjAt = now
        objRes = m.object.detectForVideo(video, now)
        lumaCtx.drawImage(video, 0, 0, LUMA_W, LUMA_H)
        const img = lumaCtx.getImageData(0, 0, LUMA_W, LUMA_H)
        // R 채널 자리에 밝기를 넣어 둔다 (켜진 화면 판별용)
        for (let i = 0; i < img.data.length; i += 4) img.data[i] = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
        objects = detectedObjects(objRes, video.videoWidth, video.videoHeight, { data: img.data, w: LUMA_W, h: LUMA_H })
      }
      return phoneFeatures(handRes, objects)
    }
  }

  private calibrate(gen: number, video: HTMLVideoElement, models: Models) {
    this.emit({ status: 'calibrating', calibProgress: 0, error: null })
    const analyze = this.makeAnalyzer(video, models)
    const samples: PhoneFeatures[] = []
    const begin = performance.now()
    this.stopLoop = frameLoop(
      video,
      (now) => {
        if (gen !== this.generation) return
        samples.push(analyze(now))
        this.emit({ calibProgress: Math.min(1, (now - begin) / CALIBRATION_MS) })
        if (now - begin < CALIBRATION_MS) return
        this.stopLoop?.()
        const baseline = resolvePhoneBaseline(samples)
        if (!baseline) {
          this.emit({ status: 'error', error: NO_HANDS_MESSAGE })
          return
        }
        this.monitor(gen, video, analyze, baseline)
      },
      { minIntervalMs: PHONE_MIN_ANALYZE_INTERVAL_MS },
    )
  }

  private monitor(gen: number, video: HTMLVideoElement, analyze: (now: number) => PhoneFeatures, baseline: NonNullable<ReturnType<typeof resolvePhoneBaseline>>) {
    const engine = new RuleEngine(PHONE_RULES)
    const fps = new FpsMeter()
    let lastUi = 0
    this.emit({ status: 'monitoring', calibProgress: 1, error: null })
    this.stopLoop = frameLoop(
      video,
      (now) => {
        if (gen !== this.generation) return
        fps.tick(now)
        const f = analyze(now)
        const seen = dedupeObjects(f.objects)
        for (const fired of engine.evaluate(phoneConditions(f, baseline), now)) {
          const v = toCamViolation(
            fired,
            'PHONE_CAM',
            captureSnapshot(video),
            { hands: f.hands.length, objects: seen.map((o) => `${o.label}${o.bright ? '(켜짐)' : ''}`).join(',') },
            this.opts.serverOffsetMs(),
          )
          if (!v) continue
          if (fired.kind === 'extra_screen' && seen.some((o) => o.bright)) v.message += ' (켜진 화면)'
          this.opts.onViolation(v)
        }
        if (now - lastUi > UI_INTERVAL_MS) {
          lastUi = now
          this.emit({ fps: fps.fps, handCount: f.hands.length, objects: seen.map((o) => o.label) })
        }
      },
      { minIntervalMs: PHONE_MIN_ANALYZE_INTERVAL_MS },
    )
  }
}
