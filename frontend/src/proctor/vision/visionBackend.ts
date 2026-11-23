// 카메라 분석(감독 루프·환경 점검)을 어디서 돌리는지(메인 스레드 / Web Worker)를 감추는 경계.
// 구현이 둘이라서 의미가 있다: MainBackend(기존 방식)와 WorkerBackend. Worker 가 안 되면 FallbackBackend 가 메인으로 넘어간다.
import type { PcFeatures } from '../core/pcRules.ts'
import { EnvStepper, type EnvFrameInfo, type EnvModels, type EnvNeeds } from './envStepper.ts'
import { PcStepper, type PcModels } from './pcStepper.ts'

/** 이 백엔드는 더 못 쓴다는 오류 (Worker 가 죽었거나 응답이 없음). 프레임 하나의 일시적 실패와 구분해서 폴백 전환 조건으로 쓴다 */
export class BackendFatalError extends Error {}

export interface VisionBackend {
  readonly kind: 'worker' | 'main'
  /** 감독 루프: 지금 영상 프레임 하나를 분석한다. 겹쳐 불려도 백엔드가 순서를 지킨다. 백엔드를 더 못 쓰게 되면 BackendFatalError 를 던진다 */
  analyzePc(video: HTMLVideoElement, now: number): Promise<PcFeatures>
  /** 재보정 때 얼굴·포즈 교대 순서와 직전 결과를 비운다 */
  resetPc(): void
  /** 환경 점검: 이 단계에 필요한 모델만 돌려 요약값을 돌려준다 */
  analyzeEnv(video: HTMLVideoElement, now: number, needs: EnvNeeds): Promise<EnvFrameInfo>
  /** 환경 점검 단계가 바뀔 때 포즈 교대 순서와 직전 포즈 결과를 비운다 */
  resetEnv(): void
  dispose(): void
}

/** 메인 스레드 분석에 쓰는 모델. 손 모델은 환경 점검 손목 단계에서만 쓴다 */
export type MainModels = PcModels & Required<Pick<EnvModels, 'hand'>>

/**
 * 메인 스레드에서 동기로 돌리는 기존 방식. 모델은 처음 쓸 때 불러온다(loadModels).
 * Worker 가 잘 돌면 이 경로는 쓰이지 않아서 메인에 모델이 올라가지 않는다. 모델은 앱이 갖고 있어서 여기서 닫지 않는다.
 */
export class MainBackend implements VisionBackend {
  readonly kind = 'main' as const
  private readonly loadModels: () => Promise<MainModels>
  private steppers: Promise<{ pc: PcStepper; env: EnvStepper }> | null = null

  constructor(loadModels: () => Promise<MainModels>) {
    this.loadModels = loadModels
  }

  async analyzePc(video: HTMLVideoElement, now: number): Promise<PcFeatures> {
    return (await this.ready()).pc.step(video, now)
  }

  async analyzeEnv(video: HTMLVideoElement, now: number, needs: EnvNeeds): Promise<EnvFrameInfo> {
    return (await this.ready()).env.step(video, now, needs)
  }

  resetPc() {
    void this.steppers?.then((s) => s.pc.reset())
  }

  resetEnv() {
    void this.steppers?.then((s) => s.env.reset())
  }

  dispose() {}

  private ready() {
    this.steppers ??= this.loadModels().then(
      (models) => ({ pc: new PcStepper(models), env: new EnvStepper(models) }),
      (e: unknown) => {
        this.steppers = null // 다음 호출에서 다시 불러오게 한다
        throw e
      },
    )
    return this.steppers
  }
}

/**
 * 기본 백엔드를 더 못 쓰게 되면(BackendFatalError: Worker 사망·응답 없음) 한 번만 대체 백엔드로 갈아탄다.
 * 프레임 하나의 일시적 실패는 갈아타지 않고 그대로 던진다 (호출한 쪽이 건너뛰거나 연속 실패로 센다).
 * 대체 백엔드까지 실패하면 그 오류를 그대로 던진다.
 */
export class FallbackBackend implements VisionBackend {
  private current: VisionBackend
  private readonly makeFallback: () => VisionBackend
  private readonly onFallback: (reason: unknown) => void
  private fellBack = false
  private disposed = false

  constructor(primary: VisionBackend, makeFallback: () => VisionBackend, onFallback: (reason: unknown) => void) {
    this.current = primary
    this.makeFallback = makeFallback
    this.onFallback = onFallback
  }

  get kind(): 'worker' | 'main' {
    return this.current.kind
  }

  analyzePc(video: HTMLVideoElement, now: number): Promise<PcFeatures> {
    return this.run((b) => b.analyzePc(video, now))
  }

  analyzeEnv(video: HTMLVideoElement, now: number, needs: EnvNeeds): Promise<EnvFrameInfo> {
    return this.run((b) => b.analyzeEnv(video, now, needs))
  }

  resetPc() {
    this.current.resetPc()
  }

  resetEnv() {
    this.current.resetEnv()
  }

  dispose() {
    this.disposed = true
    this.current.dispose()
  }

  private async run<T>(call: (b: VisionBackend) => Promise<T>): Promise<T> {
    try {
      return await call(this.current)
    } catch (e) {
      if (!(e instanceof BackendFatalError) || this.fellBack || this.disposed) throw e
      this.fellBack = true
      this.current.dispose()
      this.current = this.makeFallback()
      this.onFallback(e)
      return call(this.current)
    }
  }
}
