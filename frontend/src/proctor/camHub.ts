// 카메라 감독 허브 (앱 전체에서 하나).
// 입장 화면 환경 점검 → 대기실 → 응시 화면까지 화면이 바뀌어도 카메라·분석 모델·폰 연결을 그대로 이어 쓴다.
// React 는 useSyncExternalStore 로 이 상태를 읽는다 (react/useCamHub.ts).
import type { FaceLandmarker, HandLandmarker, PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import QRCode from 'qrcode'
import { CamOutbox } from './api/camOutbox.ts'
import type { CheckReport } from './check/envChecks.ts'
import { toCamViolation, type CamViolation } from './core/events.ts'
import { PC_RULES, buildPcBaseline, pcConditions, type PcBaseline, type PcFeatures } from './core/pcRules.ts'
import { RuleEngine } from './core/RuleEngine.ts'
import { angleDiff } from './core/stats.ts'
import type { PeerState, PhoneStatus, ScanStage, ServerMsg } from './relay/protocol.ts'
import { RelaySocket } from './relay/RelaySocket.ts'
import { captureSnapshot, frameLoop, openCamera, stopCamera } from './vision/camera.ts'
import { pcFeatures } from './vision/features.ts'

const CALIBRATION_MS = 3000
const UI_INTERVAL_MS = 200
const MAX_LOG = 50

export type ScanFrame = { source: 'pc' | 'phone'; stage: ScanStage; image: string; objects: string[]; at: number }
export type CamModels = { face: FaceLandmarker; pose: PoseLandmarker; hand: HandLandmarker }
export type ActiveRule = { kind: string; message: string; heldMs: number; durationMs: number }

export type CamState = {
  invite: string | null
  camera: 'off' | 'loading' | 'ready' | 'error'
  error: string | null
  relayOpen: boolean
  phone: PeerState
  phoneUrl: string | null
  phoneQr: string | null
  phoneStatus: PhoneStatus | null
  phoneReport: CheckReport | null
  scanFrames: ScanFrame[]
  monitor: 'idle' | 'calibrating' | 'monitoring' | 'error'
  calibProgress: number
  active: ActiveRule[]
  /** 최근 경고 (화면 표시용, 사진 없이) */
  log: CamViolation[]
  lastWarning: CamViolation | null
  /** 마지막 경고를 받은 내 시각 (알림을 몇 초만 보여 주려고) */
  lastWarningAt: number
  monitoringSince: number | null
  bytesSent: number
}

const INITIAL: CamState = {
  invite: null,
  camera: 'off',
  error: null,
  relayOpen: false,
  phone: 'disconnected',
  phoneUrl: null,
  phoneQr: null,
  phoneStatus: null,
  phoneReport: null,
  scanFrames: [],
  monitor: 'idle',
  calibProgress: 0,
  active: [],
  log: [],
  lastWarning: null,
  lastWarningAt: 0,
  monitoringSince: null,
  bytesSent: 0,
}

let state: CamState = INITIAL
const listeners = new Set<() => void>()
let video: HTMLVideoElement | null = null
let stream: MediaStream | null = null
let models: CamModels | null = null
let relay: RelaySocket | null = null
let outbox: CamOutbox | null = null
let stopLoop: (() => void) | null = null
let opening: Promise<void> | null = null

function set(patch: Partial<CamState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const camHub = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  getState: () => state,

  /** 분석용 숨은 video. 화면에 보이지 않아도 프레임이 돌도록 문서에 붙여 둔다 (display:none 은 멈출 수 있음) */
  video(): HTMLVideoElement {
    if (!video) {
      video = document.createElement('video')
      video.setAttribute('aria-hidden', 'true')
      Object.assign(video.style, { position: 'fixed', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none', left: '0', top: '0' })
      document.body.appendChild(video)
    }
    return video
  },
  stream: () => stream,
  models: () => models,

  /** 이 응시자의 릴레이 연결 (폰 짝 코드 발급). 같은 초대 토큰이면 다시 열지 않는다 */
  connect(invite: string) {
    if (state.invite === invite && relay) return
    relay?.close()
    outbox = new CamOutbox(invite)
    set({ ...INITIAL, invite, camera: state.camera, error: state.error })
    relay = new RelaySocket(() => ({ type: 'hello-pc', invite }), onRelayMessage, (open) => set({ relayOpen: open }))
    void outbox.flush()
  },

  /** 카메라와 분석 모델 준비. 이미 준비됐으면 바로 끝난다 */
  openCamera(): Promise<void> {
    if (state.camera === 'ready') return Promise.resolve()
    opening ??= (async () => {
      set({ camera: 'loading', error: null })
      try {
        const v = camHub.video()
        if (!stream || !stream.active) stream = await openCamera(v, 'user')
        if (!models) {
          // 무거운 모델은 실전 시험에서만 내려받는다 (자가진단 화면에는 영향 없음)
          const m = await import('./vision/models.ts')
          const [face, pose, hand] = await Promise.all([m.createFaceLandmarker(), m.createPoseLandmarker(), m.createHandLandmarker()])
          models = { face, pose, hand }
        }
        set({ camera: 'ready' })
      } catch (e) {
        set({ camera: 'error', error: e instanceof Error ? e.message : String(e) })
        throw e
      } finally {
        opening = null
      }
    })()
    return opening
  },

  addPcFrame(stage: ScanStage, image: string) {
    set({ scanFrames: [...state.scanFrames, { source: 'pc', stage, image, objects: [], at: Date.now() }] })
  },

  resetCheck() {
    set({ scanFrames: [], phoneReport: null })
  },

  /** 3초 보정 뒤 감시. serverOffsetMs 로 이벤트 시각을 서버 기준으로 맞춘다 */
  async startMonitoring(serverOffsetMs: number) {
    await camHub.openCamera()
    stopLoop?.()
    const v = camHub.video()
    const m = models!
    set({ monitor: 'calibrating', calibProgress: 0, active: [] })
    const samples: PcFeatures[] = []
    const lastPose: { current?: PoseLandmarkerResult } = {}
    let frame = 0
    const begin = performance.now()
    const analyze = (now: number) => {
      const faceRes = m.face.detectForVideo(v, now)
      // 몸통은 천천히 움직이므로 포즈는 2프레임에 한 번
      if (frame++ % 2 === 0) lastPose.current = m.pose.detectForVideo(v, now)
      return pcFeatures(faceRes, lastPose.current)
    }
    stopLoop = frameLoop(v, (now) => {
      samples.push(analyze(now))
      set({ calibProgress: Math.min(1, (now - begin) / CALIBRATION_MS) })
      if (now - begin < CALIBRATION_MS) return
      stopLoop?.()
      const baseline = buildPcBaseline(samples)
      if (!baseline) {
        set({ monitor: 'error', error: '정면 얼굴이 충분히 잡히지 않았습니다. 화면을 정면으로 보고 혼자 앉은 상태에서 다시 시도해 주세요.' })
        return
      }
      runMonitoring(baseline, analyze, serverOffsetMs)
    })
  },

  /** 시험이 끝나면 카메라·폰 연결을 모두 끈다 */
  async stop() {
    stopLoop?.()
    stopLoop = null
    await outbox?.flush()
    relay?.close()
    relay = null
    stopCamera(stream)
    stream = null
    video?.remove()
    video = null
    set({ ...INITIAL })
  },
}

function runMonitoring(baseline: PcBaseline, analyze: (now: number) => PcFeatures, serverOffsetMs: number) {
  const v = camHub.video()
  const engine = new RuleEngine(PC_RULES)
  let lastUi = 0
  set({ monitor: 'monitoring', monitoringSince: Date.now(), error: null })
  stopLoop = frameLoop(v, (now) => {
    const f = analyze(now)
    for (const fired of engine.evaluate(pcConditions(f, baseline), now)) {
      const viol = toCamViolation(fired, 'PC_CAM', captureSnapshot(v), detailFor(f, baseline), serverOffsetMs)
      if (!viol) continue
      void outbox?.enqueue(viol)
      pushLog(viol)
    }
    if (now - lastUi > UI_INTERVAL_MS) {
      lastUi = now
      set({ active: engine.active(now), bytesSent: (outbox?.bytesSent ?? 0) + (relay?.bytesSent ?? 0) })
    }
  })
}

function pushLog(v: CamViolation) {
  const shown = { ...v, snapshot: undefined }
  set({ log: [shown, ...state.log].slice(0, MAX_LOG), lastWarning: shown, lastWarningAt: Date.now() })
}

function onRelayMessage(msg: ServerMsg) {
  switch (msg.type) {
    case 'paired':
      set({ phoneUrl: msg.phoneUrl })
      QRCode.toDataURL(msg.phoneUrl, { width: 220, margin: 1 })
        .then((phoneQr) => set({ phoneQr }))
        .catch(() => set({ phoneQr: null }))
      break
    case 'peer':
      set({ phone: msg.phone, phoneStatus: msg.phone === 'connected' ? state.phoneStatus : null })
      break
    case 'phone-status':
      set({ phoneStatus: msg.status })
      break
    case 'violation':
      // 폰 경고는 릴레이 서버가 이미 저장했다. 여기서는 보여 주기만 한다
      pushLog(msg.violation)
      break
    case 'scan-frame':
      set({ scanFrames: [...state.scanFrames, { source: 'phone', stage: msg.stage, image: msg.image, objects: msg.objects, at: Date.now() }] })
      break
    case 'check-report':
      set({ phoneReport: msg.report })
      break
    case 'error':
      set({ error: msg.message })
      break
    default:
      break
  }
}

function detailFor(f: PcFeatures, b: PcBaseline): CamViolation['detail'] {
  const d: NonNullable<CamViolation['detail']> = { faceCount: f.faceCount }
  if (f.yaw !== undefined) d.yaw = Math.round(angleDiff(f.yaw, b.yaw))
  if (f.pitch !== undefined) d.pitch = Math.round(angleDiff(f.pitch, b.pitch))
  if (f.gazeX !== undefined) d.gazeX = +(f.gazeX - b.gazeX).toFixed(2)
  if (f.gazeY !== undefined) d.gazeY = +(f.gazeY - b.gazeY).toFixed(2)
  return d
}
