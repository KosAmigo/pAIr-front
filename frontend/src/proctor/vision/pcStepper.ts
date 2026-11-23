// PC 웹캠 감독의 한 번 분석: 얼굴 3번에 포즈 1번을 번갈아 돌려 특징값으로 바꾼다.
// 메인 스레드(MainBackend)와 Worker(visionWorker)가 같은 규칙을 쓰도록 한 곳에 둔다.
import type { FaceLandmarker, FaceLandmarkerResult, PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import type { PcFeatures } from '../core/pcRules.ts'
import { pcFeatures } from './features.ts'

export type PcModels = {
  face: Pick<FaceLandmarker, 'detectForVideo'>
  pose: Pick<PoseLandmarker, 'detectForVideo'>
}
export type PcFrameInput = Parameters<FaceLandmarker['detectForVideo']>[0]

/** 몸통은 천천히 움직여 포즈는 드물어도 된다. 4번째마다 포즈를 돌린다 */
const POSE_EVERY = 4

export class PcStepper {
  private readonly models: PcModels
  private frame = 0
  private lastFace: FaceLandmarkerResult | undefined
  private lastPose: PoseLandmarkerResult | undefined

  constructor(models: PcModels) {
    this.models = models
  }

  /** 재보정 때 교대 순서와 직전 결과를 처음 상태로 돌린다 */
  reset() {
    this.frame = 0
    this.lastFace = undefined
    this.lastPose = undefined
  }

  /** 한 번에 모델 하나만 돌리고, 돌리지 않은 쪽은 직전 결과를 그대로 쓴다 */
  step(input: PcFrameInput, now: number): PcFeatures {
    const pose = this.frame++ % POSE_EVERY === POSE_EVERY - 1 && this.lastFace !== undefined
    if (pose) this.lastPose = this.models.pose.detectForVideo(input, now)
    else this.lastFace = this.models.face.detectForVideo(input, now)
    return pcFeatures(this.lastFace!, this.lastPose)
  }
}
