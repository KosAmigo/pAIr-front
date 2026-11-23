// 휴대폰 프레임 분석을 어디서 돌리는지(별도 Worker / 메인 스레드) 감추는 경계.
// 웹캠 분석 Worker(visionWorker.ts)와 따로 둔다: 한쪽이 느려지거나 죽어도 다른 쪽에 번지지 않게.
// 웹캠 쪽(VisionBackend)과 같은 구조: Worker 백엔드와 메인 백엔드를 Fallback 이 묶는다.
import type { PhoneFeatures } from '../core/phoneRules.ts'
import type { Delegate } from './delegate.ts'
import { BackendFatalError } from './visionBackend.ts'

export interface PhoneVisionBackend {
  readonly kind: 'worker' | 'main'
  /** 휴대폰이 보낸 JPEG 한 장 → 손·물체·밝기 요약. 백엔드를 더 못 쓰게 되면 BackendFatalError */
  analyze(jpeg: ArrayBuffer, now: number): Promise<PhoneFeatures>
  dispose(): void
}

export type PhoneToWorker = { t: 'init'; delegate: Delegate } | { t: 'frame'; id: number; ts: number; jpeg: ArrayBuffer }
export type PhoneFromWorker =
  | { t: 'ready'; delegate: Delegate; loadMs: number }
  | { t: 'frame'; id: number; features: PhoneFeatures; ms: number }
  | { t: 'error'; id?: number; message: string }

export type PhoneWorkerLike = {
  postMessage(msg: unknown, transfer?: Transferable[]): void
  terminate(): void
  onmessage: ((e: MessageEvent) => void) | null
  onerror: ((e: ErrorEvent) => void) | null
}

export const PHONE_WORKER_INIT_TIMEOUT_MS = 30_000
export const PHONE_WORKER_ANALYZE_TIMEOUT_MS = 10_000
export type PhoneWorkerOptions = { initTimeoutMs?: number; analyzeTimeoutMs?: number }

export function defaultMakePhoneWorker(): PhoneWorkerLike {
  return new Worker(new URL('./phoneWorker.ts', import.meta.url), { type: 'module' }) as unknown as PhoneWorkerLike
}

type Pending = { resolve: (f: PhoneFeatures) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }

export class PhoneWorkerBackend implements PhoneVisionBackend {
  readonly kind = 'worker' as const
  private readonly worker: PhoneWorkerLike
  private readonly analyzeTimeoutMs: number
  private readonly pending = new Map<number, Pending>()
  private seq = 0
  private closed = false

  private constructor(worker: PhoneWorkerLike, analyzeTimeoutMs: number) {
    this.worker = worker
    this.analyzeTimeoutMs = analyzeTimeoutMs
  }

  static create(makeWorker: () => PhoneWorkerLike, delegate: Delegate, opts: PhoneWorkerOptions = {}): Promise<PhoneWorkerBackend> {
    const initTimeoutMs = opts.initTimeoutMs ?? PHONE_WORKER_INIT_TIMEOUT_MS
    return new Promise((resolve, reject) => {
      let worker: PhoneWorkerLike
      try {
        worker = makeWorker()
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
        return
      }
      const backend = new PhoneWorkerBackend(worker, opts.analyzeTimeoutMs ?? PHONE_WORKER_ANALYZE_TIMEOUT_MS)
      let timer: ReturnType<typeof setTimeout> | undefined
      const fail = (e: Error) => {
        clearTimeout(timer)
        worker.terminate()
        reject(e)
      }
      timer = setTimeout(() => fail(new Error(`휴대폰 분석 Worker 초기화 시간 초과 (${initTimeoutMs}ms)`)), initTimeoutMs)
      worker.onerror = (e) => fail(new Error(`휴대폰 분석 Worker 오류: ${e.message || '로딩 실패'}`))
      worker.onmessage = (ev) => {
        const m = ev.data as PhoneFromWorker
        if (m.t === 'ready') {
          clearTimeout(timer)
          worker.onmessage = (e2) => backend.onMessage(e2.data as PhoneFromWorker)
          worker.onerror = (e2) => backend.kill(new BackendFatalError(`휴대폰 분석 Worker 오류: ${e2.message || '실행 중 중단'}`))
          resolve(backend)
        } else if (m.t === 'error') {
          fail(new Error(m.message))
        }
      }
      worker.postMessage({ t: 'init', delegate } satisfies PhoneToWorker)
    })
  }

  analyze(jpeg: ArrayBuffer, now: number): Promise<PhoneFeatures> {
    if (this.closed) return Promise.reject(new BackendFatalError('휴대폰 분석 Worker 가 종료되었습니다'))
    const id = ++this.seq
    return new Promise<PhoneFeatures>((resolve, reject) => {
      const timer = setTimeout(() => this.kill(new BackendFatalError(`휴대폰 분석 응답 없음 (${this.analyzeTimeoutMs}ms)`)), this.analyzeTimeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        // 호출한 쪽이 같은 프레임을 링 버퍼에도 보관하므로 복사해서 넘긴다 (14KB 안팎이라 비용이 작다)
        this.worker.postMessage({ t: 'frame', id, ts: now, jpeg } satisfies PhoneToWorker)
      } catch (e) {
        this.pending.delete(id)
        clearTimeout(timer)
        const err = new BackendFatalError(`휴대폰 분석 Worker 에 보낼 수 없습니다: ${e instanceof Error ? e.message : String(e)}`)
        reject(err)
        this.kill(err)
      }
    })
  }

  dispose() {
    this.kill(new BackendFatalError('휴대폰 분석 Worker 가 종료되었습니다'))
  }

  private onMessage(m: PhoneFromWorker) {
    if (m.t === 'frame') {
      this.take(m.id)?.resolve(m.features)
    } else if (m.t === 'error') {
      if (m.id === undefined) this.kill(new BackendFatalError(m.message))
      else this.take(m.id)?.reject(new Error(m.message)) // 프레임 하나의 오류: 백엔드는 계속 쓴다
    }
  }

  private take(id: number): Pending | undefined {
    const p = this.pending.get(id)
    if (!p) return undefined
    this.pending.delete(id)
    clearTimeout(p.timer)
    return p
  }

  private kill(e: Error) {
    if (!this.closed) {
      this.closed = true
      this.worker.terminate()
    }
    const all = [...this.pending.values()]
    this.pending.clear()
    all.forEach((p) => {
      clearTimeout(p.timer)
      p.reject(e)
    })
  }
}

type MainStep = (image: ImageBitmap, ts: number) => PhoneFeatures

/** 메인 스레드에서 분석하는 폴백. 모델은 처음 쓸 때 불러온다 (Worker 가 잘 돌면 쓰이지 않는다) */
export class PhoneMainBackend implements PhoneVisionBackend {
  readonly kind = 'main' as const
  private readonly load: () => Promise<MainStep>
  private step: Promise<MainStep> | null = null

  constructor(load: () => Promise<MainStep>) {
    this.load = load
  }

  async analyze(jpeg: ArrayBuffer, now: number): Promise<PhoneFeatures> {
    this.step ??= this.load().catch((e: unknown) => {
      this.step = null
      throw e
    })
    const step = await this.step
    const bitmap = await createImageBitmap(new Blob([jpeg], { type: 'image/jpeg' }))
    try {
      return step(bitmap, now)
    } finally {
      bitmap.close()
    }
  }

  dispose() {}
}

/** 기본 백엔드를 더 못 쓰게 되면(BackendFatalError) 한 번만 대체 백엔드로 갈아탄다. 프레임 하나의 일시적 실패는 그대로 던진다 */
export class FallbackPhoneBackend implements PhoneVisionBackend {
  private current: PhoneVisionBackend
  private readonly makeFallback: () => PhoneVisionBackend
  private readonly onFallback: (reason: unknown) => void
  private fellBack = false
  private disposed = false

  constructor(primary: PhoneVisionBackend, makeFallback: () => PhoneVisionBackend, onFallback: (reason: unknown) => void) {
    this.current = primary
    this.makeFallback = makeFallback
    this.onFallback = onFallback
  }

  get kind(): 'worker' | 'main' {
    return this.current.kind
  }

  async analyze(jpeg: ArrayBuffer, now: number): Promise<PhoneFeatures> {
    try {
      return await this.current.analyze(jpeg, now)
    } catch (e) {
      if (!(e instanceof BackendFatalError) || this.fellBack || this.disposed) throw e
      this.fellBack = true
      this.current.dispose()
      this.current = this.makeFallback()
      this.onFallback(e)
      return this.current.analyze(jpeg, now)
    }
  }

  dispose() {
    this.disposed = true
    this.current.dispose()
  }
}

export type CreatePhoneBackendOptions = {
  /** 메인 스레드 분석 단계 함수를 만든다 (Worker 가 안 될 때만 불린다) */
  loadMainStep: () => Promise<MainStep>
  delegate: Delegate
  enabled: boolean
  force: 'main' | 'worker' | null
  onFallback: (reason: unknown) => void
  makeWorker?: () => PhoneWorkerLike
  workerOptions?: PhoneWorkerOptions
}

export async function createPhoneBackend(opts: CreatePhoneBackendOptions): Promise<PhoneVisionBackend> {
  const main = () => new PhoneMainBackend(opts.loadMainStep)
  const wantWorker = opts.force === 'worker' || (opts.force !== 'main' && opts.enabled)
  const makeWorker = opts.makeWorker ?? (typeof Worker !== 'undefined' ? defaultMakePhoneWorker : null)
  if (!wantWorker || !makeWorker) return main()
  try {
    const worker = await PhoneWorkerBackend.create(makeWorker, opts.delegate, opts.workerOptions)
    return opts.force === 'worker' ? worker : new FallbackPhoneBackend(worker, main, opts.onFallback)
  } catch (e) {
    if (opts.force === 'worker') throw e
    opts.onFallback(e)
    return main()
  }
}
