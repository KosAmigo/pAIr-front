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

/**
 * 아이폰 사파리는 GPU delegate 로 모델을 여러 번 돌리면 WebGL 메모리가 쌓여 탭이 메모리 부족으로 죽는다
 * ("이 페이지에 문제가 반복적으로 발생했습니다"). 아이폰은 CPU 로 시작한다.
 * 주소 끝에 &delegate=gpu 또는 &delegate=cpu 를 붙이면 기기와 상관없이 그 쪽으로 고정한다 (비교 시험용).
 */
function forcedDelegate(): 'GPU' | 'CPU' | null {
  const choice = new URLSearchParams(location.search).get('delegate')
  if (choice === 'gpu') return 'GPU'
  if (choice === 'cpu') return 'CPU'
  const ua = navigator.userAgent
  const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  return isIos ? 'CPU' : null
}

/** GPU로 먼저 시도하고, 안 되는 기기(일부 폰)는 CPU로 */
async function withDelegate<T>(create: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  const forced = forcedDelegate()
  if (forced) return create(forced)
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

let scanDetector: Promise<ObjectDetector> | null = null

/**
 * 환경 점검 스캔용: 사람까지 찾고, 타일로 잘라 정지 이미지 단위로 돌린다.
 * 다시 점검할 때마다 모델을 새로 받지 않도록 한 번 만든 감지기를 재사용한다 (닫지 않는다).
 * 만들기에 실패하면 다음 호출에서 다시 시도할 수 있게 비워 둔다.
 */
export function createScanDetector(): Promise<ObjectDetector> {
  scanDetector ??= getFileset()
    .then((fs) =>
      withDelegate((delegate) =>
        ObjectDetector.createFromOptions(fs, {
          baseOptions: { modelAssetPath: URLS.object, delegate },
          runningMode: 'IMAGE',
          scoreThreshold: 0.4,
          maxResults: 10,
          categoryAllowlist: ['person', ...OBJECT_LABELS],
        }),
      ),
    )
    .catch((e) => {
      scanDetector = null
      throw e
    })
  return scanDetector
}
