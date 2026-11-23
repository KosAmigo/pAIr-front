// 얼굴·포즈 모델 옵션. 메인 스레드와 Worker 가 같은 옵션으로 만들어야 같은 결과가 나온다.
import type { FaceLandmarkerOptions, HandLandmarkerOptions, ObjectDetectorOptions, PoseLandmarkerOptions } from '@mediapipe/tasks-vision'
import type { Delegate } from './delegate.ts'
import { MODEL_URLS } from './visionAssets.ts'

export function faceLandmarkerOptions(delegate: Delegate): FaceLandmarkerOptions {
  return {
    baseOptions: { modelAssetPath: MODEL_URLS.face, delegate },
    runningMode: 'VIDEO',
    numFaces: 3,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  }
}

export function handLandmarkerOptions(delegate: Delegate): HandLandmarkerOptions {
  return {
    baseOptions: { modelAssetPath: MODEL_URLS.hand, delegate },
    runningMode: 'VIDEO',
    numHands: 4,
  }
}

/** 휴대폰 분석용 물체 감지 옵션 (models.ts 의 createObjectDetector 와 같은 값) */
export function objectDetectorOptions(delegate: Delegate): ObjectDetectorOptions {
  return {
    baseOptions: { modelAssetPath: MODEL_URLS.object, delegate },
    runningMode: 'VIDEO',
    scoreThreshold: 0.3,
    maxResults: 8,
    categoryAllowlist: ['cell phone', 'laptop', 'tv', 'book'],
  }
}

export function poseLandmarkerOptions(delegate: Delegate): PoseLandmarkerOptions {
  return {
    baseOptions: { modelAssetPath: MODEL_URLS.pose, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
  }
}
