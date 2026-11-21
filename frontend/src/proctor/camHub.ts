// 카메라 감독 허브 (앱 전체에서 하나).
// 입장 화면 환경 점검 → 대기실 → 응시 화면까지 화면이 바뀌어도 카메라·분석 모델·폰 연결을 그대로 이어 쓴다.
// React 는 useSyncExternalStore 로 이 상태를 읽는다 (react/useCamHub.ts).
import type { FaceLandmarker, FaceLandmarkerResult, HandLandmarker, PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import QRCode from 'qrcode'
import { CamOutbox } from './api/camOutbox.ts'
import { proctorApi } from './api/proctorApi.ts'
import { GATE_INITIAL, GRACE_MS, stepGate, type ChannelUp, type Gate, type GateState } from './core/connectionPolicy.ts'
import { toCamViolation, type CamViolation } from './core/events.ts'
import { buildPcBaseline, pcConditions, pcProfile, type PcBaseline, type PcFeatures, type PcProfileName } from './core/pcRules.ts'
import { RuleEngine } from './core/RuleEngine.ts'
import { angleDiff } from './core/stats.ts'
import type { PeerState, PhoneStatus, ScanStage, ServerMsg } from './relay/protocol.ts'
import type { VideoMode } from './relay/rtcSignal.ts'
import { RelaySocket } from './relay/RelaySocket.ts'
import { PcLink, type LinkState } from './relay/peerLink.ts'
import { ViewerSender, type ViewSources } from './relay/viewerSender.ts'
import { PHONE_ANALYSIS_IDLE, PhoneAnalysis, type PhoneAnalysisState } from './phoneAnalysis.ts'
import { SCREEN_EVENTS_ACCEPTED, toScreenViolation, type ScreenEventType } from './screen/screenContract.ts'
import { startScreenShare, type ScreenHandle, type ShareKind } from './screen/screenShare.ts'
import { PHONE_CAM_ENABLED, SCREEN_SHARE_ENABLED } from './features.ts'
import { PC_MIN_ANALYZE_INTERVAL_MS } from './core/frameBudget.ts'
import { captureSnapshot, frameLoop, openCamera, stopCamera } from './vision/camera.ts'
import { pcFeatures } from './vision/features.ts'

const CALIBRATION_MS = 3000
const UI_INTERVAL_MS = 500
const MAX_LOG = 50
const GATE_TICK_MS = 1000
/** 이벤트 순간 사진용으로 메모리에만 두는 흐린 화면을 이 간격으로 갱신한다 (저장·전송 아님) */
const BLUR_REFRESH_MS = 10_000

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
let link: PcLink | null = null
/** 감독관 실시간 영상 송신. 감독관이 열었을 때만 연결이 생긴다 */
let viewers: ViewerSender | null = null
let stopLoop: (() => void) | null = null
let opening: Promise<void> | null = null
/** 응시 감독이 켜져 있는 동안만 휴대폰 영상을 분석한다 (환경 점검 중에는 분석하지 않는다) */
let monitoringWanted = false
let serverOffset = 0
let activeProfile: PcProfileName = 'default'
let screenHandle: ScreenHandle | null = null
let lastBlur: string | undefined
let lastBlurAt = 0
let gateTimer: number | null = null
let gateState: GateState = GATE_INITIAL
/** 지금 분석 중인 휴대폰 영상 (같은 영상이면 다시 시작하지 않는다) */
let analyzedStream: MediaStream | null = null
const phoneAnalyzer = new PhoneAnalysis({
  onState: (phoneAnalysis) => set({ phoneAnalysis }),
  onViolation: (v) => {
    void outbox?.enqueue(v)
    pushLog(v)
  },
  serverOffsetMs: () => serverOffset,
})

/** 감독 중이고 휴대폰 영상이 있으면 분석을 시작하고, 영상이 없어지면 멈춘다. 영상이 바뀌면 새 영상으로 다시 시작한다 */
function syncPhoneAnalysis() {
  const wanted = monitoringWanted ? state.phoneStream : null
  if (wanted === analyzedStream) return
  analyzedStream = wanted
  if (wanted) void phoneAnalyzer.start(wanted)
  else phoneAnalyzer.stop()
}

/** 세 채널이 지금 연결돼 있는지. 화면 공유는 전체 화면이 아니면(창·탭) 연결로 치지 않는다 */
export function channelUp(st: CamState): ChannelUp {
  return {
    // 모델 로딩 시간과 무관하게 웹캠 트랙이 살아 있는지만 본다
    webcam: st.webcamLive,
    // 휴대폰 캠을 쓰지 않으면 이 채널은 항상 연결된 것으로 본다 (입장·시험 중 차단 조건에서 빠진다)
    phone: !PHONE_CAM_ENABLED || st.phone === 'connected',
    screen: !SCREEN_SHARE_ENABLED || (st.screen === 'sharing' && st.screenKind !== 'partial'),
  }
}

function tickGate() {
  const now = Date.now()
  const { state: next, gate } = stepGate(gateState, channelUp(state), now)
  gateState = next
  if (screenHandle && now - lastBlurAt > BLUR_REFRESH_MS) refreshBlur()
  const prev = state.gate
  if (prev.status !== gate.status || prev.graceLeftMs !== gate.graceLeftMs || prev.missing.join() !== gate.missing.join()) set({ gate })
}

function refreshBlur() {
  lastBlurAt = Date.now()
  if (SCREEN_EVENTS_ACCEPTED) lastBlur = screenHandle?.captureBlurred()
}

/** 화면 공유 이벤트 기록. 서버가 SCREEN 을 받기 전(SCREEN_EVENTS_ACCEPTED=false)에는 화면 로그에만 남긴다. 사전 테스트에서는 아무것도 남기지 않는다 */
function recordScreen(type: ScreenEventType) {
  if (state.practice || !monitoringWanted) return
  const v = toScreenViolation(type, Date.now() + serverOffset, lastBlur)
  if (SCREEN_EVENTS_ACCEPTED) void outbox?.enqueue(v)
  pushLog(v)
}

/** 감독관에게 보낼 원본 영상. 죽은 웹캠·끊긴 휴대폰·멈춘 화면 공유는 null (감독관 화면에 "영상 없음") */
function viewSources(): ViewSources {
  return { webcam: state.webcamLive ? stream : null, phone: state.phoneStream, screen: screenHandle?.stream ?? null }
}

function newViewerSender(): ViewerSender {
  return new ViewerSender((viewer, channel, signal) => relay?.send({ type: 'view-rtc', viewer, channel, signal }), viewSources)
}

function set(patch: Partial<CamState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
  viewers?.sync() // 웹캠·휴대폰·화면 공유 원본이 바뀌었으면 감독관 연결을 새 영상으로 맺는다
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
    link?.close()
    link = new PcLink(
      (signal) => relay?.send({ type: 'rtc', signal }),
      (phoneVideo, phoneStream) => {
        set({ phoneVideo, phoneStream })
        syncPhoneAnalysis()
      },
    )
    viewers?.closeAll()
    viewers = newViewerSender()
    outbox = new CamOutbox(invite)
    analyzedStream = null
    phoneAnalyzer.stop()
    set({ ...INITIAL, invite, camera: state.camera, error: state.error, webcamLive: state.webcamLive, screen: state.screen, screenKind: state.screenKind })
    syncPhoneAnalysis()
    relay = new RelaySocket(() => ({ type: 'hello-pc', invite }), onRelayMessage, onRelayOpenChange)
    void outbox.flush()
  },

  /**
   * 사전 테스트(연습): 실전과 같은 점검 화면을 쓰되 서버에 이벤트·사진을 보내지 않는다.
   * 짝 코드는 서버가 만들고, 입장 토큰 대신 이 브라우저가 만든 연습 키를 쓴다.
   */
  connectPractice() {
    if (state.practice && relay) return
    relay?.close()
    link?.close()
    link = new PcLink(
      (signal) => relay?.send({ type: 'rtc', signal }),
      (phoneVideo, phoneStream) => {
        set({ phoneVideo, phoneStream })
        syncPhoneAnalysis()
      },
    )
    outbox = null
    analyzedStream = null
    phoneAnalyzer.stop()
    const key = `practice-${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
    set({ ...INITIAL, practice: true, camera: state.camera, error: state.error, webcamLive: state.webcamLive, screen: state.screen, screenKind: state.screenKind })
    relay = new RelaySocket(() => ({ type: 'hello-pc', invite: key, practice: true }), onRelayMessage, onRelayOpenChange)
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
        lastBlur = undefined
        set({ screen: 'off', screenKind: null })
        recordScreen('SCREEN_STOPPED')
      })
      if (handle.kind === 'partial') {
        handle.stop()
        set({ screen: 'error', screenKind: null, screenError: '전체 화면이 아닌 창·탭만 공유했습니다. 다시 시작해서 "전체 화면"을 선택해 주세요.' })
        recordScreen('SCREEN_PARTIAL')
        return
      }
      screenHandle = handle
      lastBlurAt = 0
      set({ screen: 'sharing', screenKind: handle.kind, screenError: null })
      refreshBlur()
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
    opening ??= (async () => {
      set({ camera: 'loading', error: null })
      try {
        const v = camHub.video()
        if (!stream || !stream.active) {
          stream = await openCamera(v, 'user')
          stream.getVideoTracks().forEach((t) => t.addEventListener('ended', () => set({ webcamLive: false })))
        }
        set({ webcamLive: true })
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

  /** 휴대폰 송신 화질 전환 (책상 스캔 동안만 'scan') */
  setPhoneQuality(mode: VideoMode) {
    link?.setQuality(mode)
  },

  /** 휴대폰 손전등 (어두운 방 점검용) */
  setPhoneTorch(on: boolean) {
    link?.setTorch(on)
  },

  /** 책상 스캔 사진 1장: 화면용으로 보관하고 파일 서버(백엔드 env-scan)에 올린다. 업로드가 실패해도 점검은 계속된다 */
  recordDeskPhoto(image: string, objects: string[]) {
    set({ scanFrames: [...state.scanFrames, { source: 'phone', stage: 'desk', image, objects, at: Date.now() }] })
    if (!state.invite) return
    proctorApi.uploadEnvScan(state.invite, { stage: 'DESK', objects: objects.slice(0, 12), image }).catch((e: unknown) => {
      console.warn('점검 사진 업로드 실패:', e instanceof Error ? e.message : e)
    })
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
    syncPhoneAnalysis()
    await camHub.openCamera()
    stopLoop?.()
    const v = camHub.video()
    const m = models!
    set({ monitor: 'calibrating', calibProgress: 0, active: [] })
    const samples: PcFeatures[] = []
    const lastPose: { current?: PoseLandmarkerResult } = {}
    const lastFace: { current?: FaceLandmarkerResult } = {}
    let frame = 0
    const begin = performance.now()
    const analyze = (now: number) => {
      // 한 번에 모델 하나만 돌린다: 얼굴 3번에 포즈 1번. 얼굴(약 30ms)과 포즈(약 20ms)를 같은 작업에서 연달아 돌리면
      // 한 번에 50ms 넘게 메인 스레드를 막아 입력(채팅 타이핑 등)이 끊긴다. 몸통은 천천히 움직여 포즈는 드물어도 된다.
      // 모델을 돌리지 않은 쪽은 직전 결과를 그대로 쓴다 (프레임 사이 간격은 100ms 라 규칙의 지속 시간·끊김 이어 붙이기에 영향이 없다)
      if (frame++ % 4 === 3 && lastFace.current) lastPose.current = m.pose.detectForVideo(v, now)
      else lastFace.current = m.face.detectForVideo(v, now)
      return pcFeatures(lastFace.current, lastPose.current)
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
      runMonitoring(baseline, analyze, serverOffsetMs, activeProfile)
    }, { minIntervalMs: PC_MIN_ANALYZE_INTERVAL_MS })
  },

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
    const current = state.phoneStream
    if (!monitoringWanted || !current) return
    analyzedStream = current
    void phoneAnalyzer.start(current)
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
    lastBlur = undefined
    analyzedStream = null
    phoneAnalyzer.dispose()
    stopLoop?.()
    stopLoop = null
    // 상태는 먼저 비운다. 비동기로 기다리는 사이 새로 연결(connect)해도 그 연결을 닫지 않게 한다
    const closing = { outbox, relay, link, stream, video }
    viewers?.closeAll()
    viewers = null
    outbox = null
    relay = null
    link = null
    stream = null
    video = null
    set({ ...INITIAL })
    await closing.outbox?.flush()
    closing.relay?.close()
    closing.link?.close()
    stopCamera(closing.stream)
    closing.video?.remove()
  },
}

function runMonitoring(baseline: PcBaseline, analyze: (now: number) => PcFeatures, serverOffsetMs: number, profileName: PcProfileName) {
  const v = camHub.video()
  const profile = pcProfile(profileName)
  const engine = new RuleEngine(profile.rules)
  let lastUi = 0
  set({ monitor: 'monitoring', monitoringSince: Date.now(), error: null })
  stopLoop = frameLoop(v, (now) => {
    const f = analyze(now)
    for (const fired of engine.evaluate(pcConditions(f, baseline, profile.thresholds), now)) {
      const viol = toCamViolation(fired, 'PC_CAM', captureSnapshot(v), detailFor(f, baseline), serverOffsetMs)
      if (!viol) continue
      void outbox?.enqueue(viol)
      pushLog(viol)
    }
    if (now - lastUi > UI_INTERVAL_MS) {
      lastUi = now
      set({ active: engine.active(now), bytesSent: (outbox?.bytesSent ?? 0) + (relay?.bytesSent ?? 0) })
    }
  }, { minIntervalMs: PC_MIN_ANALYZE_INTERVAL_MS })
}

function pushLog(v: CamViolation) {
  const shown = { ...v, snapshot: undefined }
  set({ log: [shown, ...state.log].slice(0, MAX_LOG), lastWarning: shown, lastWarningAt: Date.now() })
}

/** 릴레이가 끊기면 감독관 영상도 모두 닫는다 (서버가 감독관이 나갔다는 걸 못 알려 줄 수 있다). 다시 붙으면 서버가 아직 보는 감독관만 다시 요청한다 */
function onRelayOpenChange(open: boolean) {
  if (!open) viewers?.closeAll()
  set({ relayOpen: open, viewers: viewers?.viewerCount() ?? 0 })
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
      // 폰이 새로 붙으면 영상을 보내 달라고 요청한다. 끊기면 영상 연결도 닫는다
      if (msg.phone === 'connected' && state.phone !== 'connected') link?.request()
      if (msg.phone === 'disconnected') link?.close()
      set({ phone: msg.phone, phoneStatus: msg.phone === 'connected' ? state.phoneStatus : null })
      break
    case 'phone-status':
      set({ phoneStatus: msg.status })
      break
    case 'violation':
      // 서버가 직접 만든 이벤트(연결 끊김 등)는 서버가 이미 저장했다. 여기서는 보여 주기만 한다
      pushLog(msg.violation)
      break
    case 'phone-alert':
      // 휴대폰이 알려 온 이벤트(감독 화면 이탈)는 PC 가 저장한다
      if (msg.violation.source !== 'PHONE_CAM') break
      void outbox?.enqueue(msg.violation)
      pushLog(msg.violation)
      break
    case 'rtc':
      void link?.handle(msg.signal)
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
