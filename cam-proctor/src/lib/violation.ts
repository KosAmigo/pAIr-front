import type { Fired } from '../rules/RuleEngine'
import type { Source, Violation } from '../shared/protocol'
import { captureSnapshot } from './camera'

let seq = 0

/** 규칙 엔진의 경고를 전송용 이벤트로. performance.now() 기준 시각을 epoch ms로 바꾼다. */
export function toViolation(
  f: Fired,
  source: Source,
  video: HTMLVideoElement | null,
  detail?: Violation['detail'],
): Violation {
  const offset = Date.now() - performance.now()
  const ts = Math.round(f.ts + offset)
  return {
    id: `${source}-${ts}-${seq++}`,
    source,
    kind: f.kind,
    message: f.message,
    startedAt: Math.round(f.startedAt + offset),
    ts,
    durationMs: Math.round(f.durationMs),
    detail,
    snapshot: video ? captureSnapshot(video) : undefined,
  }
}

/** 영상 스트리밍을 했다면 썼을 양 (720p 기준 1.5Mbps로 가정) */
export const VIDEO_BYTES_PER_SEC = (1.5 * 1_000_000) / 8

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
