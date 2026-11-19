// 정밀 분석: 일반 물체 감지 모델(COCO)에 없는 메모지·이어폰·스마트워치 등을
// 글로 지정해 찾는 open-vocabulary 모델(OWL-ViT)로 점검 사진만 다시 본다.
// 무거운 모델이라 실시간이 아니라 점검 사진 몇 장에만, 성능이 좋은 PC 브라우저에서 돌린다.
// 결과는 "확정"이 아니라 사람이 확인할 "검토 필요" 표시로만 쓴다.
import type { ScanStage } from '../relay/protocol.ts'

export interface DeepQuery {
  query: string
  ko: string
}

export const DEEP_QUERIES: Record<'room' | 'ear' | 'wrist', DeepQuery[]> = {
  room: [
    { query: 'a sticky note', ko: '메모지' },
    { query: 'a sheet of paper with handwriting', ko: '필기된 종이' },
    { query: 'an open book', ko: '책' },
    { query: 'a smartphone', ko: '휴대폰' },
    { query: 'a tablet computer', ko: '태블릿' },
    { query: 'a computer monitor', ko: '모니터' },
    { query: 'a wireless earbud', ko: '무선 이어폰' },
    { query: 'headphones', ko: '헤드폰' },
  ],
  ear: [
    { query: 'a wireless earbud in an ear', ko: '무선 이어폰' },
    { query: 'an earphone', ko: '이어폰' },
    { query: 'headphones', ko: '헤드폰' },
  ],
  wrist: [
    { query: 'a smartwatch', ko: '스마트워치' },
    { query: 'a wristwatch', ko: '손목시계' },
    { query: 'writing on a hand', ko: '손에 쓴 글씨' },
  ],
}

export function queriesFor(stage: ScanStage): DeepQuery[] {
  if (stage === 'ear-left' || stage === 'ear-right') return DEEP_QUERIES.ear
  if (stage === 'wrist') return DEEP_QUERIES.wrist
  return DEEP_QUERIES.room
}

export interface DeepFinding {
  label: string
  score: number
  /** 0~1 */
  box: { xmin: number; ymin: number; xmax: number; ymax: number }
}

export const DEEP_THRESHOLD = 0.12
export const DEEP_MODEL = { id: 'onnx-community/owlvit-base-patch32-ONNX', dtype: 'q8' as 'q8' | 'q4' | 'fp16' }

type Detector = (
  image: string,
  labels: string[],
  opts: { threshold: number; percentage: boolean },
) => Promise<{ label: string; score: number; box: DeepFinding['box'] }[]>

let detector: Promise<Detector> | null = null

export function loadDeepDetector(onProgress?: (ratio: number) => void, model = DEEP_MODEL): Promise<Detector> {
  detector ??= (async () => {
    const { pipeline } = await import('@huggingface/transformers')
    const files = new Map<string, { loaded: number; total: number }>()
    const p = await pipeline('zero-shot-object-detection', model.id, {
      device: 'wasm',
      dtype: model.dtype,
      progress_callback: (e: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (e.status === 'progress' && e.file && e.total) {
          files.set(e.file, { loaded: e.loaded ?? 0, total: e.total })
          let loaded = 0
          let total = 0
          for (const f of files.values()) {
            loaded += f.loaded
            total += f.total
          }
          onProgress?.(total ? loaded / total : 0)
        }
      },
    })
    return p as unknown as Detector
  })()
  detector.catch(() => {
    detector = null
  })
  return detector
}

/** 같은 라벨은 가장 높은 점수 하나만 남긴다 */
export async function deepScan(imageUrl: string, stage: ScanStage): Promise<DeepFinding[]> {
  const d = await loadDeepDetector()
  const qs = queriesFor(stage)
  const out = await d(imageUrl, qs.map((q) => q.query), { threshold: DEEP_THRESHOLD, percentage: true })
  const best = new Map<string, DeepFinding>()
  for (const r of out) {
    const ko = qs.find((q) => q.query === r.label)?.ko ?? r.label
    const prev = best.get(ko)
    if (!prev || r.score > prev.score) best.set(ko, { label: ko, score: r.score, box: r.box })
  }
  return [...best.values()].sort((a, b) => b.score - a.score)
}
