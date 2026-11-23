// MediaPipe 모델·wasm 주소. 메인 스레드(models.ts)와 Worker(visionWorker.ts)가 같이 쓴다.
// 패키지 버전을 올리면 아래 모듈용 로더 파일명이 그대로인지 다시 확인한다 (0단계 스파이크는 1.2.3 에서 확인).
export const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
const MODEL = 'https://storage.googleapis.com/mediapipe-models'

export const MODEL_URLS = {
  face: `${MODEL}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
  pose: `${MODEL}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
  hand: `${MODEL}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
  object: `${MODEL}/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`,
}

/**
 * 모듈 Worker 용 wasm 로더. 기본 로더(FilesetResolver.forVisionTasks)는 모듈 Worker 에서
 * "ModuleFactory not set." 으로 실패한다 (Worker_분리_설계.md 10장).
 *
 * 한 Worker 에서 모델을 둘 이상 만들 때는 모델마다 다른 instance 이름을 줘야 한다.
 * 같은 주소를 두 번 import 하면 브라우저가 캐시된 모듈을 돌려줘서 로더가 다시 실행되지 않고,
 * 두 번째 모델이 "ModuleFactory not set." 으로 실패한다.
 */
export function moduleFileset(instance: string) {
  return {
    wasmLoaderPath: `${WASM_URL}/vision_wasm_module_internal.js?instance=${encodeURIComponent(instance)}`,
    wasmBinaryPath: `${WASM_URL}/vision_wasm_module_internal.wasm`,
  }
}
