// 카메라 감독 허브 (앱 전체에서 하나).
// 입장 화면 환경 점검 → 대기실 → 응시 화면까지 화면이 바뀌어도 카메라·분석 모델·폰 연결을 그대로 이어 쓴다.
// React 는 useSyncExternalStore 로 이 상태를 읽는다 (react/useCamHub.ts).
import QRCode from 'qrcode'
import { CamOutbox } from './api/camOutbox.ts'
import { proctorApi, type EnvCheckPhotoStage } from './api/proctorApi.ts'
import { GATE_INITIAL, GRACE_MS, stepGate, type ChannelUp, type Gate, type GateState } from './core/connectionPolicy.ts'
import { toCamViolation, type CamViolation } from './core/events.ts'
import { buildPcBaseline, pcConditions, pcProfile, type PcBaseline, type PcFeatures, type PcProfileName } from './core/pcRules.ts'
import { RuleEngine } from './core/RuleEngine.ts'
import { angleDiff } from './core/stats.ts'
import type { PeerState, PhoneStatus, ScanStage, ServerMsg } from './relay/protocol.ts'
import type { SendMode } from './relay/phoneSenderCore.ts'
import { RelaySocket } from './relay/RelaySocket.ts'
import type { LinkState } from './relay/peerLink.ts'
import { PhoneSurface } from './relay/phoneSurface.ts'
import { ViewerSender, type ViewSources } from './relay/viewerSender.ts'
import { PHONE_ANALYSIS_IDLE, PhoneAnalysis, type PhoneAnalysisState } from './phoneAnalysis.ts'
import { EvidenceRecorder } from './evidenceRecorder.ts'
import { PhoneQualityController } from './core/phoneQuality.ts'
import { PHONE_DROP_MESSAGE, phoneDropEvent, phoneFramesFresh } from './core/phoneLink.ts'
import { toScreenViolation, type ScreenEventType } from './screen/screenContract.ts'
import { startScreenShare, type ScreenHandle, type ShareKind } from './screen/screenShare.ts'
import { PHONE_CAM_ENABLED, SCREEN_SHARE_ENABLED, VISION_WORKER_ENABLED } from './features.ts'
import { PC_MIN_ANALYZE_INTERVAL_MS, PHONE_MIN_ANALYZE_INTERVAL_MS } from './core/frameBudget.ts'
import type { PerfLevel } from './check/perfCheck.ts'
import { captureSnapshot, frameLoop, openCamera, stopCamera } from './vision/camera.ts'
import { forcedDelegate } from './vision/delegate.ts'
import { guardedAnalyzer } from './vision/guardedAnalyzer.ts'
import type { MainModels, VisionBackend } from './vision/visionBackend.ts'
import { createPhoneBackend } from './vision/phoneBackend.ts'
import { PhoneStepper, makeLumaReader } from './vision/phoneStepper.ts'
import { createPcBackend, forcedVision } from './vision/visionBackendFactory.ts'

const CALIBRATION_MS = 3000
/** 분석이 이 횟수만큼 연달아 실패하면 감독을 멈추고 오류로 알린다 (한두 프레임 실패는 건너뛴다) */
const MAX_ANALYSIS_FAILURES = 3
const UI_INTERVAL_MS = 500
const MAX_LOG = 50
const GATE_TICK_MS = 1000
/** 시험 종료 때 남은 이벤트·구간 업로드를 기다리는 최대 시간 */
const STOP_FLUSH_MAX_MS = 4000

function withTimeout(p: Promise<unknown> | undefined, ms: number): Promise<unknown> {
  if (!p) return Promise.resolve()
  return Promise.race([p.catch(() => undefined), new Promise((r) => setTimeout(r, ms))])
}
/** 웹캠 사진을 증거 구간 링 버퍼에 두는 간격과 크기 (이벤트 때만 일부가 올라간다) */
const PC_CLIP_FRAME_MS = 1000
const PC_CLIP_WIDTH = 400
const PC_CLIP_QUALITY = 0.55

/** 서버에 올리는 점검 사진 단계 (방·책상 사진은 올리지 않는다) */
const ENV_PHOTO_STAGE: Partial<Record<ScanStage, EnvCheckPhotoStage>> = { 'ear-left': 'EAR_LEFT', 'ear-right': 'EAR_RIGHT', wrist: 'WRIST' }

export type ScanFrame ={ source: 'pc' | 'phone'; stage: ScanStage; image: string; objects: string[]; at: number }
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
  /** 휴대폰이 연결돼 있고 최근 프레임도 오고 있는지 (페이지만 열고 카메라를 안 켠 경우·카메라가 막힌 경우를 잡는다) */
  phoneLive: boolean
  /** 휴대폰 영상 (WebRTC). 영상이 오기 전에는 null */
  phoneStream: MediaStream | null
  phoneVideo: LinkState
  /** PC 가 휴대폰 영상으로 하는 분석 상태 (보정 → 감시) */
  phoneAnalysis: PhoneAnalysisState
  scanFrames: ScanFrame[]
  /** 지금 내 영상을 보고 있는 감독관 수 (감독관이 열었을 때만 영상이 전송된다) */
  viewers: number
  /** 웹캠 트랙이 살아 있는지 (케이블 분리·다른 앱 점유로 끊기면 false) */
  webcamLive: boolean
  /** PC 화면 공유 상태 */
  screen: 'off' | 'requesting' | 'sharing' | 'error'
  screenKind: ShareKind | null
  screenError: string | null
  /** 3채널 연결 판정 (응시 중에만 갱신된다: startGate) */
  gate: Gate
  /** 사전 테스트(연습): 서버에 아무것도 보내지 않는다 */
  practice: boolean
  /** 환경 점검이 백그라운드로 잰 이 PC 의 분석 속도 등급. 아직 못 쟀으면 null (느리면 영상 밑에 경고를 띄운다) */
  perfLevel: PerfLevel | null
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
  phoneLive: false,
  phoneStream: null,
  phoneVideo: 'idle',
  phoneAnalysis: PHONE_ANALYSIS_IDLE,
  scanFrames: [],
  viewers: 0,
  webcamLive: false,
  screen: 'off',
  screenKind: null,
  screenError: null,
  gate: { status: 'ok', missing: [], graceLeftMs: GRACE_MS, newlyExpired: [] },
  practice: false,
  perfLevel: null,
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
let relay: RelaySocket | null = null
let outbox: CamOutbox | null = null
/** 감독관 실시간 영상 송신. 감독관이 열었을 때만 연결이 생긴다 */
let viewers: ViewerSender | null = null
let stopLoop: (() => void) | null = null
/** PC 웹캠 분석 백엔드 (Worker 또는 메인). 첫 감독 시작 때 만들고 시험이 끝나면 닫는다 */
let vision: VisionBackend | null = null
let visionLoading: Promise<VisionBackend> | null = null
/** PC 웹캠 분석 최소 간격. 환경 점검에서 이 PC 가 느리다고 나오면 늘린다 (setAnalysisIntervalMs) */
let analysisIntervalMs = PC_MIN_ANALYZE_INTERVAL_MS
/** Worker 분석을 쓰지 못해 메인으로 넘어간 이유 (진단용. 서버에는 보내지 않는다) */
let visionFallbackReason: string | null = null
/** stop() 할 때마다 올린다. 기다리는 사이 중지됐으면 늦게 만들어진 백엔드를 버리는 데 쓴다 */
let visionEpoch = 0
/** 감독(보정·감시) 시작 때마다 올린다. 이전 감독에서 날아가던 분석 결과를 버리는 데 쓴다 */
let monitorGen = 0
let opening: Promise<void> | null = null
/** 응시 감독이 켜져 있는 동안만 휴대폰 영상을 분석한다 (환경 점검 중에는 분석하지 않는다) */
let monitoringWanted = false
let serverOffset = 0
let activeProfile: PcProfileName = 'default'
let screenHandle: ScreenHandle | null = null
/** 시험 중 화면 공유가 끊긴 채로 있는지. 다시 시작하면 SCREEN_RESTARTED 를 남기고 내린다 */
let screenLost = false
let gateTimer: number | null = null
let gateState: GateState = GATE_INITIAL
/** 휴대폰 분석 최소 간격. 환경 점검에서 이 PC 가 느리다고 나오면 늘린다 (setPhoneAnalysisIntervalMs) */
let phoneIntervalMs = PHONE_MIN_ANALYZE_INTERVAL_MS
let phoneFallbackReason: string | null = null
/** 증거 구간: 웹캠·휴대폰 프레임 링 버퍼와 이벤트 약 5초 뒤 업로드 예약 */
const evidence = new EvidenceRecorder()
/** 환경 점검 동안만 쓰는 "영상처럼 보이는" 휴대폰 화면 (책상 스캔·미리보기). 감독 중에는 만들지 않는다 */
let phoneSurface: PhoneSurface | null = null
const phoneFrameListeners = new Set<(jpeg: ArrayBuffer) => void>()
const phoneAnalyzer = new PhoneAnalysis({
  createBackend: () =>
    createPhoneBackend({
      loadMainStep: async () => {
        const m = await import('./vision/models.ts')
        const [hand, object] = await Promise.all([m.createHandLandmarker(), m.createObjectDetector()])
        const stepper = new PhoneStepper({ hand, object }, makeLumaReader())
        return (image, ts) => stepper.step(image, ts)
      },
      delegate: forcedDelegate() ?? 'CPU',
      enabled: VISION_WORKER_ENABLED,
      force: forcedVision(),
      onFallback: (reason) => {
        phoneFallbackReason = reason instanceof Error ? reason.message : String(reason)
        console.warn('휴대폰 Worker 분석을 쓸 수 없어 메인 스레드 분석으로 전환합니다:', reason)
      },
    }),
  onState: (phoneAnalysis) => set({ phoneAnalysis }),
  onViolation: (v) => submitViolation(v),
  serverOffsetMs: () => serverOffset,
  intervalMs: () => phoneIntervalMs,
})
let phoneAnalysisOn = false
/** PC 가 마지막으로 요청한 휴대폰 화질 모드 (서버가 짝에 저장하고 휴대폰 재연결 때 다시 보내 준다) */
const phoneQuality = new PhoneQualityController()

/** 감독 중이고 휴대폰이 연결돼 있으면 분석을 시작하고, 끊기면 멈춘다. 다시 연결되면 새로 시작한다(보정부터) */
function syncPhoneAnalysis() {
  const wanted = PHONE_CAM_ENABLED && monitoringWanted && state.phone === 'connected'
  if (wanted === phoneAnalysisOn) return
  phoneAnalysisOn = wanted
  if (wanted) phoneAnalyzer.start()
  else phoneAnalyzer.stop()
}

/** 환경 점검 중 휴대폰이 연결돼 있으면 책상 스캔용 화면을 만들고, 감독이 시작되거나 끊기면 없앤다 */
function syncPhoneSurface() {
  const wanted = PHONE_CAM_ENABLED && !monitoringWanted && state.phone === 'connected'
  if (wanted && !phoneSurface) phoneSurface = new PhoneSurface()
  if (!wanted && phoneSurface) {
    phoneSurface.close()
    phoneSurface = null
    set({ phoneStream: null, phoneVideo: 'idle' })
  }
}

/** 새 연결(입장 토큰이 바뀜·연습)을 시작할 때 휴대폰 쪽 상태를 비운다 */
function resetPhoneSide() {
  phoneQuality.reset()
  phoneAnalysisOn = false
  phoneAnalyzer.stop()
  evidence.clear()
  if (phoneSurface) {
    phoneSurface.close()
    phoneSurface = null
  }
}

/** 휴대폰이 보낸 JPEG 한 장 (서버가 넘긴 최신 한 장) */
function onRelayBinary(buf: ArrayBuffer) {
  const at = Date.now()
  lastPhoneFrameAt = at
  if (!state.phoneLive) set({ phoneLive: true }) // 게이트가 안 도는 환경 점검·사전 테스트에서도 프레임이 오면 연결로 본다
  if (phoneSurface) {
    phoneSurface.draw(buf)
    if (state.phoneStream !== phoneSurface.stream) set({ phoneStream: phoneSurface.stream, phoneVideo: 'live' })
  }
  if (monitoringWanted) phoneAnalyzer.offer(buf)
  phoneFrameListeners.forEach((l) => l(buf))
}

/** 카메라 이벤트를 보관함에 넣고 화면 로그에 띄운다. 카메라 이벤트는 약 5초 뒤 앞뒤 사진 구간도 올린다 */
function submitViolation(v: CamViolation) {
  const box = outbox
  pushLog(v)
  if (!box) return
  const { clientId } = box.record(v)
  if (v.source === 'PC_CAM' || v.source === 'PHONE_CAM') evidence.schedule(clientId, Date.now(), (id, frames) => box.attachClip(id, frames))
}

/** 세 채널이 지금 연결돼 있는지. 화면 공유는 전체 화면이 아니면(창·탭) 연결로 치지 않는다 */
export function channelUp(st: CamState): ChannelUp {
  return {
    // 모델 로딩 시간과 무관하게 웹캠 트랙이 살아 있는지만 본다
    webcam: st.webcamLive,
    // 휴대폰 캠을 쓰지 않으면 이 채널은 항상 연결된 것으로 본다 (입장·시험 중 차단 조건에서 빠진다)
    phone: !PHONE_CAM_ENABLED || (st.phone === 'connected' && st.phoneLive),
    screen: !SCREEN_SHARE_ENABLED || (st.screen === 'sharing' && st.screenKind !== 'partial'),
  }
}

/** 마지막으로 휴대폰 프레임을 받은 시각(없으면 휴대폰이 연결된 시각). 프레임이 없는 "연결"을 잡는 데 쓴다 */
let lastPhoneFrameAt = 0
let gateTicks = 0
/** 보관함 재시도 간격(틱 수 = 초). 구간 업로드가 일시 오류로 실패했을 때 다음 이벤트·종료만 기다리지 않게 한다 */
const OUTBOX_RETRY_TICKS = 15

/** 프레임이 끊긴 것으로 처음 판정되는 순간에만 한 번 이벤트를 만든다 */
function checkPhoneLive(now: number) {
  const live = state.phone === 'connected' && phoneFramesFresh(lastPhoneFrameAt, now)
  if (live === state.phoneLive) return
  set({ phoneLive: live })
  if (live || state.phone !== 'connected' || !monitoringWanted || state.practice) return
  const perf = performance.now()
  const v = toCamViolation({ kind: 'phone_stale', message: PHONE_DROP_MESSAGE.phone_stale, startedAt: perf, ts: perf, durationMs: 0 }, 'PHONE_CAM', undefined, undefined, serverOffset)
  if (v) submitViolation(v)
}

function tickGate() {
  const now = Date.now()
  if (PHONE_CAM_ENABLED) checkPhoneLive(now)
  if (++gateTicks % OUTBOX_RETRY_TICKS === 0 && outbox && (outbox.pending > 0 || outbox.pendingClips > 0)) void outbox.flush()
  const { state: next, gate } = stepGate(gateState, channelUp(state), now)
  gateState = next
  const prev = state.gate
  if (prev.status !== gate.status || prev.graceLeftMs !== gate.graceLeftMs || prev.missing.join() !== gate.missing.join()) set({ gate })
}

/** 화면 공유 이벤트 기록 (종류와 시각만, 사진 없음). 사전 테스트에서는 아무것도 남기지 않는다 */
function recordScreen(type: ScreenEventType) {
  if (state.practice || !monitoringWanted) return
  const v = toScreenViolation(type, Date.now() + serverOffset)
  void outbox?.enqueue(v)
  pushLog(v)
}

/** 감독관에게 보낼 원본 영상. 죽은 웹캠·끊긴 휴대폰·멈춘 화면 공유는 null (감독관 화면에 "영상 없음") */
function viewSources(): ViewSources {
  // 휴대폰은 영상이 아니라 JPEG 프레임으로만 보내므로 감독관 실시간 화면에는 휴대폰 영상이 없다 (영상 스트리밍은 범위 밖)
  return { webcam: state.webcamLive ? stream : null, phone: null, screen: screenHandle?.stream ?? null }
}

function newViewerSender(): ViewerSender {
  return new ViewerSender((viewer, channel, signal) => relay?.send({ type: 'view-rtc', viewer, channel, signal }), viewSources)
}

function set(patch: Partial<CamState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
  viewers?.sync() // 웹캠·휴대폰·화면 공유 원본이 바뀌었으면 감독관 연결을 새 영상으로 맺는다
}

let mainModels: Promise<MainModels> | null = null
/** 메인 스레드 분석이 실제로 쓰일 때만 불러온다 (Worker 가 되면 메인에는 모델이 올라가지 않는다) */
function loadMainModels(): Promise<MainModels> {
  mainModels ??= import('./vision/models.ts')
    .then(async (m) => {
      const [face, pose, hand] = await Promise.all([m.createFaceLandmarker(), m.createPoseLandmarker(), m.createHandLandmarker()])
      return { face, pose, hand }
    })
    .catch((e: unknown) => {
      mainModels = null // 다음에 다시 시도할 수 있게 비운다
      throw e
    })
  return mainModels
}

/** PC 웹캠 분석 백엔드를 준비한다. Worker 가 안 되면 메인 스레드 분석으로 넘어간다 (VISION_WORKER_ENABLED, 주소의 &vision=) */
function getVision(): Promise<VisionBackend> {
  if (vision) return Promise.resolve(vision)
  if (visionLoading) return visionLoading
  const epoch = visionEpoch
  const loading: Promise<VisionBackend> = createPcBackend({
    loadMainModels,
    // Worker 안에서는 CPU 를 먼저 쓴다 (시험 화면과 GPU 를 다투지 않게). 실측 뒤 바꿀 수 있다
    delegate: forcedDelegate() ?? 'CPU',
    enabled: VISION_WORKER_ENABLED,
    force: forcedVision(),
    onFallback: (reason) => {
      visionFallbackReason = reason instanceof Error ? reason.message : String(reason)
      console.warn('Worker 분석을 쓸 수 없어 메인 스레드 분석으로 전환합니다:', reason)
    },
  })
    .then((backend) => {
      if (epoch !== visionEpoch) {
        backend.dispose() // 기다리는 사이 시험이 끝났다
        throw new Error('분석 준비 중에 중지되었습니다')
      }
      vision = backend
      return backend
    })
    .finally(() => {
      // 그 사이 stop() 후 새로 시작된 로딩을 지우지 않는다
      if (visionLoading === loading) visionLoading = null
    })
  visionLoading = loading
  return loading
}

/** 이 감독(gen)의 분석 한 번. 이전 감독 결과는 버리고(null), 연달아 실패하면 감독을 멈추고 알린다 */
function analyzerFor(gen: number, backend: VisionBackend, video: HTMLVideoElement) {
  return guardedAnalyzer({
    isCurrent: () => gen === monitorGen,
    analyze: (now) => backend.analyzePc(video, now),
    maxFailures: MAX_ANALYSIS_FAILURES,
    onFail: (e) => console.warn('PC 캠 분석 실패:', e),
    onGiveUp: () => {
      stopLoop?.()
      // 망가진 백엔드를 버려서, 다시 시도(재보정·재연결)할 때 새 백엔드로 시작하게 한다
      if (vision === backend) {
        vision.dispose()
        vision = null
      }
      set({ monitor: 'error', error: '카메라 분석이 반복해서 실패했습니다. 다시 시도해 주세요.' })
    },
  })
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
    // stop() 이 video 를 버린 뒤(개발 모드 StrictMode 의 이중 마운트 등) 새로 만들어진 video 에도 열려 있는 스트림을 다시 붙인다
    if (stream?.active && video.srcObject !== stream) {
      video.srcObject = stream
      video.muted = true
      video.playsInline = true
      void video.play().catch(() => undefined)
    }
    return video
  },
  stream: () => stream,
  /** 분석 백엔드 (Worker 또는 메인). openCamera 가 끝난 뒤에만 쓴다 */
  visionBackend(): VisionBackend {
    if (!vision) throw new Error('분석 모델이 아직 준비되지 않았습니다')
    return vision
  },

  /** 이 응시자의 릴레이 연결 (폰 짝 코드 발급). 같은 초대 토큰이면 다시 열지 않는다 */
  connect(invite: string) {
    if (state.invite === invite && relay) return
    relay?.close()
    viewers?.closeAll()
    viewers = newViewerSender()
    outbox = new CamOutbox(invite)
    resetPhoneSide()
    set({ ...INITIAL, invite, camera: state.camera, error: state.error, webcamLive: state.webcamLive, screen: state.screen, screenKind: state.screenKind, perfLevel: state.perfLevel })
    relay = new RelaySocket(() => ({ type: 'hello-pc', invite }), onRelayMessage, onRelayOpenChange, onRelayBinary)
    void outbox.flush()
  },

  /**
   * 사전 테스트(연습): 실전과 같은 점검 화면을 쓰되 서버에 이벤트·사진을 보내지 않는다.
   * 짝 코드는 서버가 만들고, 입장 토큰 대신 이 브라우저가 만든 연습 키를 쓴다.
   */
  connectPractice() {
    if (state.practice && relay) return
    relay?.close()
    outbox = null
    resetPhoneSide()
    const key = `practice-${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
    set({ ...INITIAL, practice: true, camera: state.camera, error: state.error, webcamLive: state.webcamLive, screen: state.screen, screenKind: state.screenKind, perfLevel: state.perfLevel })
    relay = new RelaySocket(() => ({ type: 'hello-pc', invite: key, practice: true }), onRelayMessage, onRelayOpenChange, onRelayBinary)
  },

  /** 화면 공유 시작. 동의 버튼 클릭 안에서 불러야 한다. 창·탭만 공유하면 바로 끊고 안내한다 */
  async startScreenShare() {
    if (state.screen === 'requesting') return
    set({ screen: 'requesting', screenError: null })
    try {
      screenHandle?.stop()
      const handle = await startScreenShare(() => {
        if (screenHandle !== handle) return
        screenHandle = null
        set({ screen: 'off', screenKind: null })
        if (monitoringWanted && !state.practice) screenLost = true
        recordScreen('SCREEN_STOPPED')
      })
      if (handle.kind === 'partial') {
        handle.stop()
        set({ screen: 'error', screenKind: null, screenError: '전체 화면이 아닌 창·탭만 공유했습니다. 다시 시작해서 "전체 화면"을 선택해 주세요.' })
        if (monitoringWanted && !state.practice) screenLost = true
        recordScreen('SCREEN_PARTIAL')
        return
      }
      screenHandle = handle
      set({ screen: 'sharing', screenKind: handle.kind, screenError: null })
      if (screenLost) {
        screenLost = false
        recordScreen('SCREEN_RESTARTED')
      }
    } catch (e) {
      set({ screen: 'error', screenKind: null, screenError: e instanceof Error ? e.message : String(e) })
    }
  },

  /** 이벤트 순간의 흐린 화면 한 장 (공유 중이 아니면 undefined). 4단계 서버 재확인이 쓴다 */
  blurredScreen: (): string | undefined => screenHandle?.captureBlurred(),

  /** 3채널 연결 감시 시작/중지 (응시 화면에서만 켠다). 켠 시점에 끊겨 있으면 그때부터 유예를 센다 */
  startGate() {
    if (gateTimer !== null) return
    gateState = GATE_INITIAL
    tickGate()
    gateTimer = window.setInterval(tickGate, GATE_TICK_MS)
  },
  stopGate() {
    if (gateTimer !== null) window.clearInterval(gateTimer)
    gateTimer = null
    gateState = GATE_INITIAL
    set({ gate: INITIAL.gate })
  },

  /** 끊긴 웹캠을 다시 연다 (감시 중이었으면 감시도 다시 시작) */
  async reconnectWebcam() {
    stopCamera(stream)
    stream = null
    opening = null
    set({ camera: 'off', webcamLive: false })
    await camHub.openCamera()
    if (monitoringWanted) await camHub.startMonitoring(serverOffset)
  },

  /** 카메라와 분석 모델 준비. 이미 준비됐으면 바로 끝난다 */
  openCamera(): Promise<void> {
    if (state.camera === 'ready') return Promise.resolve()
    const epoch = visionEpoch
    opening ??= (async () => {
      set({ camera: 'loading', error: null })
      try {
        const v = camHub.video()
        if (!stream || !stream.active) {
          stream = await openCamera(v, 'user')
          stream.getVideoTracks().forEach((t) => t.addEventListener('ended', () => set({ webcamLive: false })))
        }
        camHub.video() // 열리는 사이 video 가 바뀌었으면 현재 video 에 스트림을 붙인다
        set({ webcamLive: true })
        // 무거운 모델은 실전 시험에서만 내려받는다 (자가진단 화면에는 영향 없음). 기본은 Worker 에서 불러온다
        await getVision()
        set({ camera: 'ready' })
      } catch (e) {
        if (epoch !== visionEpoch) throw e // 준비하는 사이 stop() 이 불렸다: 중지된 뒤에 오류 상태를 다시 띄우지 않는다
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
    // 귀·손목 사진은 감독관이 보게 서버에 올린다 (사전 테스트는 서버에 아무것도 보내지 않는다). 실패해도 점검은 계속된다
    const photoStage = ENV_PHOTO_STAGE[stage]
    if (photoStage && state.invite && !state.practice) proctorApi.uploadEnvCheckPhoto(state.invite, photoStage, image).catch(() => {})
  },

  /** 휴대폰 송신 화질 전환 (책상 스캔 동안만 'scan') */
  setPhoneQuality(mode: SendMode) {
    const msg = phoneQuality.set(mode)
    if (msg) relay?.send(msg)
  },

  /**
   * 휴대폰 손전등 (어두운 방 점검용). 영상(WebRTC) 연결을 없애면서 휴대폰으로 가는 제어 채널도 없어졌고,
   * 운영 중계도 PC → 휴대폰 메시지를 전달하지 않는다. 지금은 아무것도 하지 않는다.
   */
  setPhoneTorch(_on: boolean) {},

  /** 휴대폰 JPEG 프레임을 받을 때마다 부른다 (환경 점검 미리보기용). 해제 함수를 돌려준다 */
  onPhoneFrame(listener: (jpeg: ArrayBuffer) => void) {
    phoneFrameListeners.add(listener)
    return () => void phoneFrameListeners.delete(listener)
  },

  /** 책상 스캔 사진 1장: 화면용으로 보관한다 */
  recordDeskPhoto(image: string, objects: string[]) {
    set({ scanFrames: [...state.scanFrames, { source: 'phone', stage: 'desk', image, objects, at: Date.now() }] })
  },

  /** 점검 사진을 비운다. stages 를 주면 그 단계의 사진만 비우고 나머지(이미 통과한 항목의 사진)는 남긴다 */
  resetCheck(stages?: ScanStage[]) {
    set({ scanFrames: stages ? state.scanFrames.filter((f) => !stages.includes(f.stage)) : [] })
  },

  /** 3초 보정 뒤 감시. serverOffsetMs 로 이벤트 시각을 서버 기준으로 맞춘다 */
  async startMonitoring(serverOffsetMs: number, profile: PcProfileName = activeProfile) {
    serverOffset = serverOffsetMs
    activeProfile = profile
    monitoringWanted = true
    syncPhoneSurface() // 감독이 시작되면 책상 스캔용 화면은 필요 없다 (감독 중 프레임은 분석 Worker 로 바로 간다)
    // 기다리는 동안(모델 내려받기 등) stop() 이나 다시 시작이 불리면 이 호출은 무효가 된다
    const gen = ++monitorGen
    syncPhoneAnalysis()
    await camHub.openCamera()
    if (gen !== monitorGen) return
    stopLoop?.()
    const v = camHub.video()
    set({ monitor: 'calibrating', calibProgress: 0, active: [] })
    let backend: VisionBackend
    try {
      backend = await getVision()
    } catch (e) {
      if (gen === monitorGen) set({ monitor: 'error', error: e instanceof Error ? e.message : String(e) })
      return
    }
    if (gen !== monitorGen) return // 기다리는 사이 다시 시작했거나 중지됐다
    backend.resetPc()
    const analyze = analyzerFor(gen, backend, v)
    const samples: PcFeatures[] = []
    const begin = performance.now()
    // 한 번에 모델 하나만 돌린다 (얼굴 3번에 포즈 1번, pcStepper.ts). Worker 에서 돌면 메인 스레드를 막지 않고,
    // 메인 스레드 분석으로 넘어간 경우에는 예전처럼 한 번에 50ms 넘게 막지 않도록 이 교대 방식이 필요하다.
    stopLoop = frameLoop(v, async (now) => {
      const f = await analyze(now)
      if (!f) return
      samples.push(f)
      set({ calibProgress: Math.min(1, (now - begin) / CALIBRATION_MS) })
      if (now - begin < CALIBRATION_MS) return
      stopLoop?.()
      const baseline = buildPcBaseline(samples)
      if (!baseline) {
        set({ monitor: 'error', error: '정면 얼굴이 충분히 잡히지 않았습니다. 화면을 정면으로 보고 혼자 앉은 상태에서 다시 시도해 주세요.' })
        return
      }
      runMonitoring(baseline, analyze, serverOffsetMs, activeProfile)
    }, { minIntervalMs: analysisIntervalMs })
  },

  /**
   * 느린 PC 에서 분석 간격을 늘린다(ms). 다음 감독(보정·감시) 시작부터 적용된다.
   * 기본 간격보다 짧게는 못 하고, 규칙의 가장 짧은 지속 시간(1초)보다 길어지지 않게 막는다.
   */
  setAnalysisIntervalMs(ms: number) {
    analysisIntervalMs = Math.min(500, Math.max(PC_MIN_ANALYZE_INTERVAL_MS, Math.round(ms)))
  },
  /** 환경 점검이 잰 분석 속도 등급을 알린다 (영상 밑 경고용) */
  setPerfLevel(level: PerfLevel | null) {
    set({ perfLevel: level })
  },

  /**
   * 이 PC 가 휴대폰 프레임 한 장을 분석하는 데 걸리는 시간(ms) 표본. 웹캠 사진 한 장을 휴대폰 분석 Worker 에 넣어 잰다.
   * 웹캠 사진에는 손이 없어 손 모델이 실제보다 가볍게 나올 수 있다. 재지 못하면 undefined.
   */
  async probePhoneAnalysis(video: HTMLVideoElement): Promise<number[] | undefined> {
    if (!PHONE_CAM_ENABLED) return undefined
    const url = captureSnapshot(video, 512, 0.5)
    if (!url) return undefined
    try {
      return await phoneAnalyzer.probe(await (await fetch(url)).arrayBuffer())
    } catch (e) {
      console.warn('휴대폰 분석 속도 측정 실패:', e)
      return undefined
    }
  },
  /** 휴대폰 분석 간격(ms). setAnalysisIntervalMs 와 같은 규칙으로 늘린다 */
  setPhoneAnalysisIntervalMs(ms: number) {
    phoneIntervalMs = Math.min(1000, Math.max(PHONE_MIN_ANALYZE_INTERVAL_MS, Math.round(ms)))
  },
  /** 지금 쓰는 휴대폰 분석 방식 (Worker 인지 메인인지). 감독을 시작하기 전에는 null */
  phoneVisionKind: (): 'worker' | 'main' | null => phoneAnalyzer.kind,
  phoneFallbackReason: (): string | null => phoneFallbackReason,

  /** 지금 쓰는 PC 분석 방식 (Worker 인지 메인 스레드인지). 감독을 시작하기 전에는 null */
  visionKind: (): 'worker' | 'main' | null => vision?.kind ?? null,
  /** Worker 를 못 써서 메인으로 넘어갔다면 그 이유. 아니면 null (진단용) */
  visionFallbackReason: (): string | null => visionFallbackReason,

  /**
   * 브라우저 이벤트(탭·창 이탈, 전체 화면 해제, 외부 붙여넣기)를 회차 감독 기록으로 보낸다.
   * 카메라 이벤트와 같은 아웃박스를 써서 네트워크가 끊겨도 잃지 않는다. 연결(connect) 전이면 버린다.
   */
  /**
   * PC 캠 기준 자세를 다시 잡는다 (자세를 바꿨거나 의자·화면 위치가 달라졌을 때).
   * 3초 보정을 처음부터 다시 하고, 진행 중이던 이상 구간과 경고 간격은 새 기준으로 초기화된다.
   */
  async recalibratePc() {
    if (!monitoringWanted || state.monitor === 'calibrating') return
    await camHub.startMonitoring(serverOffset, activeProfile)
  },

  /** 휴대폰 기준 위치를 현재 영상으로 다시 잡는다 */
  recalibratePhone() {
    if (!monitoringWanted || state.phone !== 'connected') return
    phoneAnalysisOn = true
    phoneAnalyzer.start()
  },

  recordBrowser(v: CamViolation) {
    if (!outbox || v.source !== 'BROWSER') return
    void outbox.enqueue(v)
    // 이탈 경고는 anti-cheating 경고 창이 이미 보여 주므로, 감독 패널에는 붙여넣기만 띄운다
    if (v.type === 'PASTE') pushLog(v)
  },

  /** 시험이 끝나면 카메라·폰 연결을 모두 끈다 */
  async stop() {
    monitoringWanted = false
    camHub.stopGate()
    screenHandle?.stop()
    screenHandle = null
    screenLost = false
    phoneAnalysisOn = false
    phoneQuality.reset()
    phoneAnalyzer.dispose()
    stopLoop?.()
    stopLoop = null
    monitorGen++
    visionEpoch++
    vision?.dispose()
    vision = null
    visionLoading = null
    visionFallbackReason = null
    analysisIntervalMs = PC_MIN_ANALYZE_INTERVAL_MS
    phoneIntervalMs = PHONE_MIN_ANALYZE_INTERVAL_MS
    phoneFallbackReason = null
    // 상태는 먼저 비운다. 비동기로 기다리는 사이 새로 연결(connect)해도 그 연결을 닫지 않게 한다
    // 아직 올리지 않은 증거 구간은 기다리지 않고 지금 모은 프레임으로 올린다 (동기 부분에서 프레임을 집어 두므로 바로 비워도 된다)
    const flushing = evidence.flushPending()
    evidence.clear()
    if (phoneSurface) {
      phoneSurface.close()
      phoneSurface = null
    }
    const closing = { outbox, relay, stream, video }
    viewers?.closeAll()
    viewers = null
    outbox = null
    relay = null
    stream = null
    video = null
    set({ ...INITIAL })
    // 업로드가 느려도 시험 종료(카메라·연결 정리)를 오래 붙잡지 않는다. 못 올린 이벤트는 브라우저 저장소에 남아 다음에 다시 보낸다
    await withTimeout(flushing, STOP_FLUSH_MAX_MS)
    await withTimeout(closing.outbox?.flush(), STOP_FLUSH_MAX_MS)
    closing.relay?.close()
    stopCamera(closing.stream)
    closing.video?.remove()
  },
}

function runMonitoring(baseline: PcBaseline, analyze: (now: number) => Promise<PcFeatures | null>, serverOffsetMs: number, profileName: PcProfileName) {
  const v = camHub.video()
  const profile = pcProfile(profileName)
  const engine = new RuleEngine(profile.rules)
  let lastUi = 0
  let lastClipFrame = Number.NEGATIVE_INFINITY
  set({ monitor: 'monitoring', monitoringSince: Date.now(), error: null })
  stopLoop = frameLoop(v, async (now) => {
    const f = await analyze(now)
    if (!f) return
    // 증거 구간용 웹캠 사진은 1초에 한 장만 링 버퍼에 둔다 (이벤트가 날 때만 일부가 올라간다)
    if (now - lastClipFrame >= PC_CLIP_FRAME_MS) {
      lastClipFrame = now
      const photo = captureSnapshot(v, PC_CLIP_WIDTH, PC_CLIP_QUALITY)
      if (photo && outbox) evidence.pushPc(Date.now(), photo)
    }
    for (const fired of engine.evaluate(pcConditions(f, baseline, profile.thresholds), now)) {
      const viol = toCamViolation(fired, 'PC_CAM', captureSnapshot(v), detailFor(f, baseline), serverOffsetMs)
      if (!viol) continue
      submitViolation(viol)
    }
    if (now - lastUi > UI_INTERVAL_MS) {
      lastUi = now
      set({ active: engine.active(now), bytesSent: (outbox?.bytesSent ?? 0) + (relay?.bytesSent ?? 0) })
    }
  }, { minIntervalMs: analysisIntervalMs })
}

function pushLog(v: CamViolation) {
  const shown = { ...v, snapshot: undefined }
  set({ log: [shown, ...state.log].slice(0, MAX_LOG), lastWarning: shown, lastWarningAt: Date.now() })
}

/** 릴레이가 끊기면 감독관 영상도 모두 닫는다 (서버가 감독관이 나갔다는 걸 못 알려 줄 수 있다). 다시 붙으면 서버가 아직 보는 감독관만 다시 요청한다 */
function onRelayOpenChange(open: boolean) {
  if (!open) viewers?.closeAll()
  set({ relayOpen: open, viewers: viewers?.viewerCount() ?? 0 })
  // 연결이 (다시) 맺어지면 현재 화질 모드를 알린다 (서버가 짝에 이전 모드를 들고 있을 수 있다)
  if (open) relay?.send(phoneQuality.resend())
}

function onRelayMessage(msg: ServerMsg) {
  switch (msg.type) {
    case 'paired':
      set({ phoneUrl: msg.phoneUrl })
      QRCode.toDataURL(msg.phoneUrl, { width: 220, margin: 1 })
        .then((phoneQr) => set({ phoneQr }))
        .catch(() => set({ phoneQr: null }))
      break
    case 'peer': {
      // 운영 중계는 연결 상태만 알린다. 끊김·응답 없음 이벤트는 이 PC 가 만들어 자기 보관함으로 올린다
      const drop = monitoringWanted && !state.practice ? phoneDropEvent(state.phone, msg.phone) : null
      if (msg.phone === 'connected' && state.phone !== 'connected') lastPhoneFrameAt = Date.now()
      set({ phone: msg.phone, phoneStatus: msg.phone === 'connected' ? state.phoneStatus : null, phoneLive: msg.phone === 'connected' ? state.phoneLive : false })
      if (drop) {
        const nowPerf = performance.now()
        const v = toCamViolation({ kind: drop, message: PHONE_DROP_MESSAGE[drop], startedAt: nowPerf, ts: nowPerf, durationMs: 0 }, 'PHONE_CAM', undefined, undefined, serverOffset)
        if (v) submitViolation(v)
      }
      syncPhoneAnalysis()
      syncPhoneSurface()
      break
    }
    case 'phone-status':
      set({ phoneStatus: msg.status })
      break
    case 'violation':
      // 서버가 직접 만든 이벤트(연결 끊김 등)는 서버가 이미 저장했다. 여기서는 보여 주기만 한다
      pushLog(msg.violation)
      break
    case 'viewer-request':
      viewers?.request(msg.viewer, msg.channel)
      set({ viewers: viewers?.viewerCount() ?? 0 })
      break
    case 'view-rtc':
      if (msg.viewer) void viewers?.handle(msg.viewer, msg.channel, msg.signal)
      break
    case 'viewer-gone':
      viewers?.drop(msg.viewer)
      set({ viewers: viewers?.viewerCount() ?? 0 })
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
