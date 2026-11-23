// MediaPipe 모델 로더. 모든 분석은 브라우저 안에서만 돈다.
import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  ObjectDetector,
  PoseLandmarker,
} from '@mediapipe/tasks-vision'
import { OBJECT_LABELS } from '../core/phoneRules.ts'
import { forcedDelegate, type Delegate } from './delegate.ts'
import { faceLandmarkerOptions, handLandmarkerOptions, poseLandmarkerOptions } from './modelOptions.ts'
import { MODEL_URLS as URLS, WASM_URL } from './visionAssets.ts'

type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
let fileset: Promise<WasmFileset> | null = null
function getFileset() {
  fileset ??= FilesetResolver.forVisionTasks(WASM_URL)
  return fileset
}

/** GPU로 먼저 시도하고, 안 되는 기기(일부 폰)는 CPU로. 아이폰·주소 지정은 delegate.ts 의 forcedDelegate 를 따른다 */
async function withDelegate<T>(create: (delegate: Delegate) => Promise<T>): Promise<T> {
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
    FaceLandmarker.createFromOptions(fs, faceLandmarkerOptions(delegate)),
  )
}

export async function createPoseLandmarker() {
  const fs = await getFileset()
  return withDelegate((delegate) =>
    PoseLandmarker.createFromOptions(fs, poseLandmarkerOptions(delegate)),
  )
}

export async function createHandLandmarker() {
  const fs = await getFileset()
  return withDelegate((delegate) =>
    HandLandmarker.createFromOptions(fs, handLandmarkerOptions(delegate)),
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
