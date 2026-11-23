// 어떤 백엔드를 쓸지 정한다: Worker 가 켜져 있고 되면 Worker, 아니면 메인 스레드.
import type { Delegate } from './delegate.ts'
import { FallbackBackend, MainBackend, type MainModels, type VisionBackend } from './visionBackend.ts'
import { WorkerBackend, defaultMakeWorker, type WorkerLike, type WorkerOptions } from './workerBackend.ts'

export type VisionForce = 'main' | 'worker' | null

/** 주소 끝에 &vision=main 또는 &vision=worker 를 붙이면 그 방식으로 고정한다 (비교 시험용) */
export function forcedVision(): VisionForce {
  const v = new URLSearchParams(location.search).get('vision')
  return v === 'main' || v === 'worker' ? v : null
}

export type CreatePcBackendOptions = {
  /** 메인 스레드 분석에 쓰는 모델을 불러오는 방법. 메인 분석이 실제로 쓰일 때(꺼져 있거나 Worker 가 안 될 때)만 불린다 */
  loadMainModels: () => Promise<MainModels>
  delegate: Delegate
  /** features.ts 의 VISION_WORKER_ENABLED */
  enabled: boolean
  force: VisionForce
  onFallback: (reason: unknown) => void
  /** 테스트용: Worker 를 만드는 방법 */
  makeWorker?: () => WorkerLike
  /** 테스트용: 초기화·분석 제한 시간 */
  workerOptions?: WorkerOptions
}

export async function createPcBackend(opts: CreatePcBackendOptions): Promise<VisionBackend> {
  const main = () => new MainBackend(opts.loadMainModels)
  const wantWorker = opts.force === 'worker' || (opts.force !== 'main' && opts.enabled)
  const makeWorker = opts.makeWorker ?? (typeof Worker !== 'undefined' ? defaultMakeWorker : null)
  if (!wantWorker || !makeWorker) return main()
  try {
    const worker = await WorkerBackend.create(makeWorker, opts.delegate, opts.workerOptions)
    // 시험용으로 Worker 를 강제한 경우에는 실패를 숨기지 않도록 대체하지 않는다
    return opts.force === 'worker' ? worker : new FallbackBackend(worker, main, opts.onFallback)
  } catch (e) {
    if (opts.force === 'worker') throw e // 시험용 고정: 실패를 메인으로 숨기지 않는다
    opts.onFallback(e)
    return main()
  }
}
