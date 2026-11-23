// 환경 점검의 한 번 분석: 단계에 필요한 모델만 돌려 "얼굴 수·얼굴 상자·고개 좌우·어깨 보임·손 수"로 줄인다.
// 메인 스레드(MainBackend)와 Worker(visionWorker)가 같은 규칙을 쓰도록 한 곳에 둔다.
import type {
  FaceLandmarker,
  FaceLandmarkerResult,
  HandLandmarker,
  HandLandmarkerResult,
  PoseLandmarker,
  PoseLandmarkerResult,
} from '@mediapipe/tasks-vision'
import type { Box } from '../core/phoneRules.ts'
import { headPoseFromMatrix, shouldersFromPose } from './features.ts'
import type { PcFrameInput } from './pcStepper.ts'

/** 이 단계에 필요한 모델 (조명·위치: 얼굴+포즈, 귀: 얼굴, 손목: 손) */
export type EnvNeeds = { face?: boolean; pose?: boolean; hand?: boolean }

export type EnvFrameInfo = { faceCount: number; box?: Box; yaw?: number; shouldersVisible: boolean; handCount: number }

export type EnvModels = {
  face: Pick<FaceLandmarker, 'detectForVideo'>
  pose: Pick<PoseLandmarker, 'detectForVideo'>
  /** 손목 단계에서만 쓰므로 없을 수 있다 */
  hand?: Pick<HandLandmarker, 'detectForVideo'>
}

const EMPTY_FACE = { faceLandmarks: [], facialTransformationMatrixes: undefined } as unknown as FaceLandmarkerResult
const EMPTY_HANDS = { landmarks: [] } as unknown as HandLandmarkerResult

/** 포즈는 두 번에 한 번만 돌린다 (몸통은 천천히 움직인다) */
const POSE_EVERY = 2

export class EnvStepper {
  private readonly models: EnvModels
  private frame = 0
  private lastPose: PoseLandmarkerResult | undefined

  constructor(models: EnvModels) {
    this.models = models
  }

  /** 단계가 바뀔 때 포즈 교대 순서와 직전 포즈 결과를 비운다 */
  reset() {
    this.frame = 0
    this.lastPose = undefined
  }

  step(input: PcFrameInput, now: number, needs: EnvNeeds): EnvFrameInfo {
    const face = needs.face ? this.models.face.detectForVideo(input, now) : EMPTY_FACE
    if (needs.pose && this.frame++ % POSE_EVERY === 0) this.lastPose = this.models.pose.detectForVideo(input, now)
    let hands = EMPTY_HANDS
    if (needs.hand) {
      if (!this.models.hand) throw new Error('손 모델이 준비되지 않았습니다')
      hands = this.models.hand.detectForVideo(input, now)
    }
    const lm = face.faceLandmarks[0]
    let box: Box | undefined
    if (lm) {
      const xs = lm.map((p) => p.x)
      const ys = lm.map((p) => p.y)
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      box = { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
    }
    const m = face.facialTransformationMatrixes?.[0]
    return {
      faceCount: face.faceLandmarks.length,
      box,
      yaw: m ? headPoseFromMatrix(m.data).yaw : undefined,
      shouldersVisible: !!shouldersFromPose(this.lastPose),
      handCount: hands.landmarks.length,
    }
  }
}
