// 분석을 Web Worker 에서 돌리는 백엔드. 프레임은 ImageBitmap 으로 넘기고(복사 없음), 작은 요약값만 돌려받는다.
import type { PcFeatures } from '../core/pcRules.ts'
import type { Delegate } from './delegate.ts'
import type { EnvFrameInfo, EnvNeeds } from './envStepper.ts'
import { BackendFatalError, type VisionBackend } from './visionBackend.ts'
import type { FromWorker, ToWorker } from './workerProtocol.ts'

/** 테스트에서 가짜 Worker 를 끼울 수 있게 필요한 부분만 적은 모양 */
export type WorkerLike = {
  postMessage(msg: unknown, transfer?: Transferable[]): void
  terminate(): void
  onmessage: ((e: MessageEvent) => void) | null
  onerror: ((e: ErrorEvent) => void) | null
}

/** 모델 두 개를 CDN 에서 받아 올리는 시간까지 넉넉히 */
export const WORKER_INIT_TIMEOUT_MS = 30_000
/**
 * 분석 한 번이 이 시간 안에 안 돌아오면 Worker 가 멈춘 것으로 보고 백엔드를 닫는다.
 * 이게 없으면 Worker 가 응답 없이 멈췄을 때 감독이 화면에는 "감시 중"으로 보이면서 조용히 꺼진다.
 * (환경 점검의 손 모델처럼 처음 쓸 때 불러오는 모델도 이 안에 들어와야 한다)
 */
export const WORKER_ANALYZE_TIMEOUT_MS = 10_000

export type WorkerOptions = { initTimeoutMs?: number; analyzeTimeoutMs?: number }

export function defaultMakeWorker(): WorkerLike {
  return new Worker(new URL('./visionWorker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike
}

type Pending = { resolve: (v: never) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }

export class WorkerBackend implements VisionBackend {
  readonly kind = 'worker' as const
  private readonly worker: WorkerLike
  private readonly analyzeTimeoutMs: number
  private readonly pending = new Map<number, Pending>()
  /** 요청(분석·재설정)을 한 줄로 세운다: 비트맵 생성 순서가 뒤바뀌거나 재설정이 옛 분석을 앞지르지 않게 */
  private chain: Promise<unknown> = Promise.resolve()
  private seq = 0
  private closed = false

  private constructor(worker: WorkerLike, analyzeTimeoutMs: number) {
    this.worker = worker
    this.analyzeTimeoutMs = analyzeTimeoutMs
  }

  /** Worker 를 띄우고 모델이 준비될 때까지 기다린다. 실패하거나 시간이 지나면 Worker 를 끄고 거절한다 */
  static create(makeWorker: () => WorkerLike, delegate: Delegate, opts: WorkerOptions = {}): Promise<WorkerBackend> {
    const initTimeoutMs = opts.initTimeoutMs ?? WORKER_INIT_TIMEOUT_MS
    return new Promise((resolve, reject) => {
      let worker: WorkerLike
      try {
        worker = makeWorker()
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
        return
      }
      const backend = new WorkerBackend(worker, opts.analyzeTimeoutMs ?? WORKER_ANALYZE_TIMEOUT_MS)
      let timer: ReturnType<typeof setTimeout> | undefined
      const fail = (e: Error) => {
        clearTimeout(timer)
        worker.terminate()
        reject(e)
      }
      timer = setTimeout(() => fail(new Error(`Worker 초기화 시간 초과 (${initTimeoutMs}ms)`)), initTimeoutMs)
      worker.onerror = (e) => fail(new Error(`Worker 오류: ${e.message || '로딩 실패'}`))
      worker.onmessage = (ev) => {
        const m = ev.data as FromWorker
        if (m.t === 'ready') {
          clearTimeout(timer)
          worker.onmessage = (e2) => backend.onMessage(e2.data as FromWorker)
          worker.onerror = (e2) => backend.kill(new BackendFatalError(`Worker 오류: ${e2.message || '실행 중 중단'}`))
          resolve(backend)
        } else if (m.t === 'error') {
          fail(new Error(m.message))
        }
      }
      worker.postMessage({ t: 'init', delegate } satisfies ToWorker)
    })
  }

  analyzePc(video: HTMLVideoElement, now: number): Promise<PcFeatures> {
    return this.enqueue(() => this.roundTrip<PcFeatures>(video, (id, bitmap) => ({ t: 'pc', id, ts: now, bitmap })))
  }

  analyzeEnv(video: HTMLVideoElement, now: number, needs: EnvNeeds): Promise<EnvFrameInfo> {
    return this.enqueue(() => this.roundTrip<EnvFrameInfo>(video, (id, bitmap) => ({ t: 'env', id, ts: now, bitmap, needs })))
  }

  resetPc() {
    this.enqueueSignal({ t: 'pc-reset' })
  }

  resetEnv() {
    this.enqueueSignal({ t: 'env-reset' })
  }

  dispose() {
    this.kill(new BackendFatalError('Worker 분석이 종료되었습니다'))
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job)
    this.chain = run.catch(() => undefined)
    return run
  }

  private enqueueSignal(msg: ToWorker) {
    this.chain = this.chain.then(() => {
      if (this.closed) return
      try {
        this.worker.postMessage(msg)
      } catch (e) {
        this.kill(new BackendFatalError(`Worker 에 보낼 수 없습니다: ${e instanceof Error ? e.message : String(e)}`))
      }
    })
  }

  private async roundTrip<T>(video: HTMLVideoElement, build: (id: number, bitmap: ImageBitmap) => ToWorker): Promise<T> {
    if (this.closed) throw new BackendFatalError('Worker 분석이 종료되었습니다')
    const bitmap = await createImageBitmap(video)
    if (this.closed) {
      bitmap.close()
      throw new BackendFatalError('Worker 분석이 종료되었습니다')
    }
    const id = ++this.seq
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => this.kill(new BackendFatalError(`Worker 분석 응답 없음 (${this.analyzeTimeoutMs}ms)`)),
        this.analyzeTimeoutMs,
      )
      this.pending.set(id, { resolve: resolve as (v: never) => void, reject, timer })
      try {
        this.worker.postMessage(build(id, bitmap), [bitmap])
      } catch (e) {
        // 보내지 못했으면 비트맵 소유권이 아직 이쪽에 있다 (DataCloneError, 이미 끝난 Worker)
        this.pending.delete(id)
        clearTimeout(timer)
        bitmap.close()
        const err = new BackendFatalError(`Worker 에 보낼 수 없습니다: ${e instanceof Error ? e.message : String(e)}`)
        reject(err)
        this.kill(err)
      }
    })
  }

  private onMessage(m: FromWorker) {
    if (m.t === 'pc') {
      this.take(m.id)?.resolve(m.features as never)
    } else if (m.t === 'env') {
      this.take(m.id)?.resolve(m.frame as never)
    } else if (m.t === 'error') {
      if (m.id === undefined) {
        this.kill(new BackendFatalError(m.message))
        return
      }
      // 프레임 하나의 오류: 백엔드는 계속 쓸 수 있다
      this.take(m.id)?.reject(new Error(m.message))
    }
  }

  private take(id: number): Pending | undefined {
    const p = this.pending.get(id)
    if (!p) return undefined
    this.pending.delete(id)
    clearTimeout(p.timer)
    return p
  }

  /** 이 백엔드를 닫는다: Worker 를 끄고 기다리던 분석을 모두 거절한다. 이후 호출도 바로 거절된다 */
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
