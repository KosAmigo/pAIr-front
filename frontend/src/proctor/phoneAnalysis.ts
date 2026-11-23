// 휴대폰 프레임 분석 (응시자 PC 에서 실행).
// 휴대폰은 영상이 아니라 JPEG 프레임을 서버 중계로 보낸다(변화가 있을 때와 5초마다). 이 클래스는 받은 프레임을
// 별도 분석 Worker(PhoneVisionBackend)로 분석하고, 3초 보정으로 기준 위치를 잡은 뒤 규칙 엔진으로 감시한다.
//
// 프레임이 드문 점을 다룬다: 변화가 없으면 휴대폰이 프레임을 안 보내므로, 규칙 판정은 프레임 도착이 아니라
// 시계(tick)로 돌리고 그 시점의 "마지막으로 분석한 상태"를 쓴다. 그렇지 않으면 정지 화면에서 지속 시간 규칙이
// 프레임 사이 빈틈(graceMs)에 끊겨 영영 경고하지 못한다.
import { jpegToDataUrl } from './core/jpegData.ts'
import { toCamViolation, type CamViolation } from './core/events.ts'
import { PHONE_MIN_ANALYZE_INTERVAL_MS } from './core/frameBudget.ts'
import {
  PHONE_RULES,
  dedupeObjects,
  phoneConditions,
  resolvePhoneBaseline,
  type PhoneBaseline,
  type PhoneFeatures,
} from './core/phoneRules.ts'
import { RuleEngine } from './core/RuleEngine.ts'
import type { PhoneVisionBackend } from './vision/phoneBackend.ts'

const CALIBRATION_MS = 3000
const UI_INTERVAL_MS = 300
/** 규칙 판정 시계 간격 */
const TICK_MS = 250
/** 마지막 분석이 이보다 오래됐으면 낡은 상태로 보고 판정하지 않는다 (연결 끊김은 서버의 peer 메시지가 알린다) */
export const STALE_FEATURE_MS = 20_000
const MAX_FAILURES = 3
const NO_HANDS_MESSAGE = '휴대폰 영상에서 손이 보이지 않습니다. 두 손이 키보드 위에 보이도록 휴대폰 위치를 조정한 뒤 다시 시도해 주세요.'

export type PhoneAnalysisStatus = 'idle' | 'loading' | 'calibrating' | 'monitoring' | 'error'

export type PhoneAnalysisState = {
  status: PhoneAnalysisStatus
  calibProgress: number
  /** 초당 분석한 프레임 수 */
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

type Options = {
  /** 분석 백엔드(별도 Worker 또는 메인 폴백)를 만든다. 처음 start 할 때 한 번 불린다 */
  createBackend: () => Promise<PhoneVisionBackend>
  onState: (state: PhoneAnalysisState) => void
  onViolation: (v: CamViolation) => void
  /** 이벤트 시각을 서버 기준으로 맞출 값 (시험 중 바뀔 수 있어 호출 때마다 읽는다) */
  serverOffsetMs: () => number
  /** 분석 최소 간격(ms). 환경 점검에서 느린 PC 로 나오면 늘어난다 */
  intervalMs?: () => number
  /** false 면 규칙 판정 시계를 직접(tick) 돌린다 (테스트) */
  autoTick?: boolean
  now?: () => number
}

type Frame = { jpeg: ArrayBuffer; at: number }

export class PhoneAnalysis {
  private readonly opts: Options
  private readonly intervalMs: () => number
  private readonly now: () => number
  private backend: PhoneVisionBackend | null = null
  private backendLoading: Promise<PhoneVisionBackend> | null = null
  private ticker: ReturnType<typeof setInterval> | null = null
  private pumpTimer: ReturnType<typeof setTimeout> | null = null
  /** start/stop 이 불릴 때마다 올라간다. 오래된 비동기 작업이 새 상태를 덮어쓰지 못하게 한다 */
  private generation = 0
  private state: PhoneAnalysisState = PHONE_ANALYSIS_IDLE

  private pending: Frame | null = null
  private inFlight = false
  private lastRunAt = Number.NEGATIVE_INFINITY
  private failures = 0
  private latest: { features: PhoneFeatures; at: number } | null = null
  private lastJpeg: ArrayBuffer | null = null
  private recentRuns: number[] = []

  private calibStart: number | null = null
  private samples: PhoneFeatures[] = []
  private baseline: PhoneBaseline | null = null
  private engine: RuleEngine | null = null
  private lastUi = 0

  constructor(opts: Options) {
    this.opts = opts
    this.intervalMs = opts.intervalMs ?? (() => PHONE_MIN_ANALYZE_INTERVAL_MS)
    this.now = opts.now ?? (() => performance.now())
  }

  /** 지금 쓰는 분석 방식 (Worker 인지 메인인지). 시작 전에는 null */
  get kind(): 'worker' | 'main' | null {
    return this.backend?.kind ?? null
  }

  /**
   * 환경 점검용: 같은 프레임을 n 번 분석해 1회 시간(ms)을 잰다. 처음 한 번은 워밍업이라 뺀다.
   * 감독(start)과 따로 쓰는 용도라 상태를 바꾸지 않는다.
   */
  async probe(jpeg: ArrayBuffer, n = 6): Promise<number[]> {
    const backend = await this.ensureBackend()
    const times: number[] = []
    for (let i = 0; i <= n; i++) {
      const started = this.now()
      await backend.analyze(jpeg, started)
      if (i > 0) times.push(this.now() - started)
    }
    return times
  }

  /** 보정 → 감시를 (다시) 시작한다. 모델·Worker 는 처음 한 번만 준비한다 */
  start(): void {
    this.reset()
    const gen = ++this.generation
    this.emit({ ...PHONE_ANALYSIS_IDLE, status: 'loading' })
    this.ensureBackend().then(
      () => {
        if (gen !== this.generation) return
        this.emit({ status: 'calibrating', calibProgress: 0, error: null })
        if (this.opts.autoTick !== false) this.ticker = setInterval(() => this.tick(this.now()), TICK_MS)
        this.pump()
      },
      (e: unknown) => {
        if (gen === this.generation) this.emit({ status: 'error', error: e instanceof Error ? e.message : String(e) })
      },
    )
  }

  /** 분석을 멈춘다 (Worker 는 다음 시작을 위해 남긴다) */
  stop(): void {
    this.generation++
    this.reset()
    this.emit(PHONE_ANALYSIS_IDLE)
  }

  /** 모두 정리하고 Worker 도 끈다 (시험 종료) */
  dispose(): void {
    this.stop()
    this.backend?.dispose()
    this.backend = null
    this.backendLoading = null
  }

  /** 휴대폰이 보낸 JPEG 한 장. 분석 중이면 최신 한 장만 남기고 이어서 분석한다 (프레임을 쌓지 않는다) */
  offer(jpeg: ArrayBuffer, at: number = this.now()): void {
    if (this.state.status === 'idle' || this.state.status === 'error') return
    this.pending = { jpeg, at }
    this.pump()
  }

  /** 규칙 판정 시계 한 번 (자동으로 돈다. 테스트에서는 직접 부른다) */
  tick(now: number): void {
    const latest = this.latest
    if (!latest) return
    if (this.state.status === 'calibrating') return this.calibrateStep(now, latest.features)
    if (this.state.status !== 'monitoring' || !this.baseline || !this.engine) return
    if (now - latest.at > STALE_FEATURE_MS) return
    const f = latest.features
    const seen = dedupeObjects(f.objects)
    for (const fired of this.engine.evaluate(phoneConditions(f, this.baseline), now)) {
      const snapshot = this.lastJpeg ? jpegToDataUrl(this.lastJpeg) : undefined
      const v = toCamViolation(
        fired,
        'PHONE_CAM',
        snapshot,
        { hands: f.hands.length, objects: seen.map((o) => `${o.label}${o.bright ? '(켜짐)' : ''}`).join(',') },
        this.opts.serverOffsetMs(),
      )
      if (!v) continue
      if (fired.kind === 'extra_screen' && seen.some((o) => o.bright)) v.message += ' (켜진 화면)'
      this.opts.onViolation(v)
    }
    if (now - this.lastUi > UI_INTERVAL_MS) {
      this.lastUi = now
      this.emit({ fps: this.recentRuns.length, handCount: f.hands.length, objects: seen.map((o) => o.label) })
    }
  }

  private calibrateStep(now: number, f: PhoneFeatures) {
    this.calibStart ??= now
    this.samples.push(f)
    const progress = Math.min(1, (now - this.calibStart) / CALIBRATION_MS)
    if (progress < 1) {
      this.emit({ calibProgress: progress })
      return
    }
    const baseline = resolvePhoneBaseline(this.samples)
    if (!baseline) {
      this.emit({ status: 'error', calibProgress: 1, error: NO_HANDS_MESSAGE })
      return
    }
    this.baseline = baseline
    this.engine = new RuleEngine(PHONE_RULES)
    this.emit({ status: 'monitoring', calibProgress: 1, error: null })
  }

  private reset() {
    if (this.ticker !== null) clearInterval(this.ticker)
    this.ticker = null
    if (this.pumpTimer !== null) clearTimeout(this.pumpTimer)
    this.pumpTimer = null
    this.pending = null
    this.latest = null
    this.lastJpeg = null
    this.failures = 0
    this.samples = []
    this.calibStart = null
    this.baseline = null
    this.engine = null
    this.recentRuns = []
    this.lastRunAt = Number.NEGATIVE_INFINITY
  }

  private ensureBackend(): Promise<PhoneVisionBackend> {
    if (this.backend) return Promise.resolve(this.backend)
    this.backendLoading ??= this.opts.createBackend().then(
      (b) => (this.backend = b),
      (e: unknown) => {
        this.backendLoading = null // 다음 시작에서 다시 시도한다
        throw e
      },
    )
    return this.backendLoading
  }

  private emit(patch: Partial<PhoneAnalysisState>) {
    this.state = { ...this.state, ...patch }
    this.opts.onState(this.state)
  }

  /** 분석이 비어 있고 최소 간격이 지났으면 대기 중인 최신 프레임을 분석한다. 아니면 간격이 지난 뒤로 미룬다 */
  private pump() {
    const backend = this.backend
    const gen = this.generation
    if (!backend || this.inFlight || !this.pending || this.state.status === 'loading') return
    const wait = this.lastRunAt + this.intervalMs() - this.now()
    if (wait > 0) {
      this.pumpTimer ??= setTimeout(() => {
        this.pumpTimer = null
        this.pump()
      }, wait)
      return
    }
    const frame = this.pending
    this.pending = null
    this.inFlight = true
    this.lastRunAt = this.now()
    backend
      .analyze(frame.jpeg, frame.at)
      .then((features) => {
        if (gen !== this.generation) return
        this.failures = 0
        this.latest = { features, at: this.now() }
        this.lastJpeg = frame.jpeg
        const t = this.now()
        this.recentRuns = [...this.recentRuns.filter((x) => t - x < 1000), t]
      })
      .catch((e: unknown) => {
        if (gen !== this.generation) return
        console.warn('휴대폰 프레임 분석 실패:', e)
        if (++this.failures >= MAX_FAILURES) {
          this.emit({ status: 'error', error: '휴대폰 분석이 반복해서 실패했습니다. 다시 시도해 주세요.' })
          this.pending = null
        }
      })
      .finally(() => {
        this.inFlight = false
        if (gen === this.generation) this.pump()
      })
  }
}
