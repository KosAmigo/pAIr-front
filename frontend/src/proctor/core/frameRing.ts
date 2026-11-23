// 시간 기준 프레임 링 버퍼. 웹캠·휴대폰 프레임을 잠깐 들고 있다가, 이벤트가 나면 앞 8초·뒤 4초만 골라 낸다.
// 연속 업로드는 하지 않는다. 이 버퍼는 브라우저 메모리에만 있고 이벤트 때만 일부가 서버로 간다.

/** 이벤트 앞 / 뒤 시간(ms). 백엔드 증거 구간 계약(offsetMs -8000~4000) */
export const CLIP_BEFORE_MS = 8000
export const CLIP_AFTER_MS = 4000
/** 이벤트 약 5초 뒤에 올린다 (뒤 4초 수집이 끝난 직후) */
export const CLIP_UPLOAD_DELAY_MS = 5000
/** 한 채널(웹캠 또는 휴대폰)이 한 이벤트에 낼 수 있는 최대 장수. 두 채널 합쳐 24장(백엔드 상한) */
export const MAX_FRAMES_PER_SOURCE = 12
/** 링에 두는 시간: 앞 8초 + 업로드 지연 5초 + 여유 1초 */
export const RING_RETAIN_MS = CLIP_BEFORE_MS + CLIP_UPLOAD_DELAY_MS + 1000
const SLOT_MS = 1000

export type RingEntry<T> = { at: number; data: T }
export type ClipPick<T> = { offsetMs: number; data: T }

export class FrameRing<T> {
  private frames: RingEntry<T>[] = []
  private readonly retainMs: number
  private readonly maxFrames: number

  constructor(opts: { retainMs?: number; maxFrames?: number } = {}) {
    this.retainMs = opts.retainMs ?? RING_RETAIN_MS
    this.maxFrames = opts.maxFrames ?? 60
  }

  get size(): number {
    return this.frames.length
  }

  /** at: 프레임 시각(epoch ms) */
  push(at: number, data: T): void {
    this.frames.push({ at, data })
    const cutoff = at - this.retainMs
    let drop = 0
    while (drop < this.frames.length && this.frames[drop].at < cutoff) drop++
    if (this.frames.length - drop > this.maxFrames) drop = this.frames.length - this.maxFrames
    if (drop > 0) this.frames = this.frames.slice(drop)
  }

  clear(): void {
    this.frames = []
  }

  /**
   * anchor(이벤트 시각) 기준 [-8초, +4초] 구간에서 1초 칸마다 가장 늦은 프레임 하나씩 (최대 12장).
   * 칸이 비어 있으면(변화가 없어 휴대폰이 프레임을 안 보낸 때 등) 건너뛴다.
   */
  select(anchor: number): ClipPick<T>[] {
    const bySlot = new Map<number, RingEntry<T>>()
    for (const f of this.frames) {
      const off = f.at - anchor
      if (off < -CLIP_BEFORE_MS || off > CLIP_AFTER_MS) continue
      const slot = Math.min(MAX_FRAMES_PER_SOURCE - 1, Math.floor((off + CLIP_BEFORE_MS) / SLOT_MS))
      const prev = bySlot.get(slot)
      if (!prev || f.at >= prev.at) bySlot.set(slot, f)
    }
    return [...bySlot.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, f]) => ({ offsetMs: Math.round(f.at - anchor), data: f.data }))
  }
}
