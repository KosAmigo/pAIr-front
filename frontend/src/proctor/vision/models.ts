// MediaPipe 모델 로더. 모든 분석은 브라우저 안에서만 돈다.
import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  ObjectDetector,
  PoseLandmarker,
} from '@mediapipe/tasks-vision'
import { OBJECT_LABELS } from '../core/phoneRules.ts'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
const MODEL = 'https://storage.googleapis.com/mediapipe-models'
const URLS = {
  face: `${MODEL}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
  pose: `${MODEL}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
  hand: `${MODEL}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
  object: `${MODEL}/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`,
}

type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
let fileset: Promise<WasmFileset> | null = null
function getFileset() {
  fileset ??= FilesetResolver.forVisionTasks(WASM_URL)
  return fileset
}

/** GPU로 먼저 시도하고, 안 되는 기기(일부 폰)는 CPU로 */
async function withDelegate<T>(create: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  try {
    return await create('GPU')
  } catch (e) {
    console.warn('GPU delegate 실패, CPU로 재시도', e)
    return create('CPU')
  }
}

export async function createFaceLandmarker() {
  const fs = await getFileset()
  return withDelegate((delegate) =>
    FaceLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath: URLS.face, delegate },
      runningMode: 'VIDEO',
      numFaces: 3,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    }),
  )
}

export async function createPoseLandmarker() {
  const fs = await getFileset()
  return withDelegate((delegate) =>
    PoseLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath: URLS.pose, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    }),
  )
}

export async function createHandLandmarker() {
  const fs = await getFileset()
  return withDelegate((delegate) =>
    HandLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath: URLS.hand, delegate },
      runningMode: 'VIDEO',
      numHands: 4,
    }),
  )
}

export async function createObjectDetector() {
  const fs = await getFileset()
  return withDelegate((delegate) =>
    ObjectDetector.createFromOptions(fs, {
      baseOptions: { modelAssetPath: URLS.object, delegate },
      runningMode: 'VIDEO',
      scoreThreshold: 0.3,
      maxResults: 8,
      categoryAllowlist: OBJECT_LABELS,
    }),
  )
}

/** 환경 점검 스캔용: 사람까지 찾고, 타일로 잘라 정지 이미지 단위로 돌린다 */
export async function createScanDetector() {
  const fs = await getFileset()
  return withDelegate((delegate) =>
    ObjectDetector.createFromOptions(fs, {
      baseOptions: { modelAssetPath: URLS.object, delegate },
      runningMode: 'IMAGE',
      scoreThreshold: 0.4,
      maxResults: 10,
      categoryAllowlist: ['person', ...OBJECT_LABELS],
    }),
  )
}
