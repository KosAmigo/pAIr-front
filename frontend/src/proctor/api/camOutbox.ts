// 카메라 감독 이벤트 아웃박스. 네트워크가 끊겨도 이벤트를 잃지 않도록 브라우저 저장소에 쌓았다가 보낸다.
// 네트워크 오류·5xx 는 다시 보내고, 4xx(시험 시간 밖 등)는 다시 보내도 같으므로 버린다.
import type { CamViolation } from '../core/events.ts'
import { ProctorApiError, proctorApi, type ClipFrameRequest, type ProctorEventRequest } from './proctorApi.ts'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Sender = (invite: string, event: ProctorEventRequest) => Promise<unknown>
type ClipSender = (invite: string, clientId: string, frames: ClipFrameRequest[]) => Promise<unknown>
type PendingClip = { clientId: string; frames: ClipFrameRequest[] }

const PREFIX = 'pair:cam-outbox:'
/** 사진이 붙은 이벤트는 20KB 안팎이라 이 정도면 저장소 한도(보통 5MB) 안에 든다 */
export const MAX_PHOTO_ITEMS = 100
/**
 * 아직 못 올린 증거 구간 상한. 구간 하나가 수백 KB 라 브라우저 저장소(5MB)에 못 두고 메모리에만 둔다.
 * 넘으면 가장 오래된 구간부터 버린다 (이벤트 자체와 대표 사진은 남는다).
 */
export const MAX_PENDING_CLIPS = 8
/** 사진 없는 이벤트는 작아서(수백 바이트) 훨씬 많이 쌓아 둔다. 이 수도 넘으면 그때만 가장 오래된 이벤트를 버린다 */
export const MAX_EVENT_ITEMS = 1000

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // 사생활 보호 모드 등
  }
}

function newClientId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function toRequest(v: CamViolation): ProctorEventRequest {
  return {
    type: v.type,
    source: v.source,
    startedAt: new Date(v.startedAt).toISOString(),
    durationMs: Math.max(0, v.durationMs),
    detail: v.detail,
    snapshot: v.snapshot,
    clientId: newClientId(),
  }
}

/**
 * 아웃박스가 넘칠 때의 정리. 사진이 붙은 건이 MAX_PHOTO_ITEMS 를 넘으면 가장 오래된 것부터 "사진만" 버리고 이벤트는 남긴다
 * (이벤트가 사라지면 감독관이 이상 자체를 모르게 되지만, 사진이 없으면 사진 없음으로 표시된다).
 * 이벤트 수가 MAX_EVENT_ITEMS 를 넘는 극단적인 경우에만 가장 오래된 이벤트를 버린다.
 */
export function trimOutbox(items: ProctorEventRequest[]): ProctorEventRequest[] {
  let photos = items.filter((e) => e.snapshot).length
  let dropped = 0
  const trimmed = items.map((e) => {
    if (photos > MAX_PHOTO_ITEMS && e.snapshot) {
      photos--
      dropped++
      return { ...e, snapshot: undefined }
    }
    return e
  })
  if (dropped > 0) console.warn(`감독 이벤트 보관함이 가득 차 오래된 사진 ${dropped}장을 버립니다 (이벤트는 남깁니다).`)
  if (trimmed.length <= MAX_EVENT_ITEMS) return trimmed
  console.warn(`감독 이벤트 보관함이 가득 차 오래된 이벤트 ${trimmed.length - MAX_EVENT_ITEMS}건을 버립니다.`)
  return trimmed.slice(trimmed.length - MAX_EVENT_ITEMS)
}

export class CamOutbox {
  private readonly key: string
  private readonly invite: string
  private readonly storage: StorageLike | null
  private readonly send: Sender
  private readonly sendClip: ClipSender
  private clips: PendingClip[] = []
  private memory: ProctorEventRequest[] = []
  private flushing: Promise<void> | null = null
  /** 보낸 바이트 (데이터 절감 지표용) */
  bytesSent = 0

  constructor(invite: string, send: Sender = proctorApi.recordEvent, storage: StorageLike | null = defaultStorage(), sendClip: ClipSender = proctorApi.uploadClip) {
    this.invite = invite
    this.sendClip = sendClip
    this.key = PREFIX + invite
    this.send = send
    this.storage = storage
    this.memory = this.load()
  }

  get pending(): number {
    return this.memory.length
  }

  get pendingClips(): number {
    return this.clips.length
  }

  enqueue(v: CamViolation) {
    return this.record(v).done
  }

  /** enqueue 와 같지만, 나중에 증거 구간을 같은 이벤트에 붙일 수 있도록 clientId 를 돌려준다 */
  record(v: CamViolation): { clientId: string; done: Promise<void> } {
    const req = toRequest(v)
    this.memory = trimOutbox([...this.memory, req])
    this.save()
    return { clientId: req.clientId as string, done: this.flush() }
  }

  /** 이벤트 앞뒤 사진 구간을 올릴 목록에 넣는다. 이벤트가 서버에 저장된 뒤에만 보낸다 (이벤트 → 구간 순서) */
  attachClip(clientId: string, frames: ClipFrameRequest[]): Promise<void> {
    if (frames.length === 0) return Promise.resolve()
    this.clips = [...this.clips, { clientId, frames }].slice(-MAX_PENDING_CLIPS)
    return this.flush()
  }

  /** 하나씩 순서대로 보낸다. 이미 보내는 중이면 그 작업을 기다린다 */
  flush(): Promise<void> {
    this.flushing ??= this.drain().finally(() => {
      this.flushing = null
    })
    return this.flushing
  }

  private async drain() {
    while (this.memory.length) {
      const head = this.memory[0]
      try {
        await this.send(this.invite, head)
        this.bytesSent += JSON.stringify(head).length
      } catch (e) {
        if (e instanceof ProctorApiError && !e.retryable) {
          console.warn('감독 이벤트를 서버가 거절해 버립니다:', e.message)
        } else {
          return // 다음 기회에 다시
        }
      }
      this.memory = this.memory.slice(1)
      this.save()
    }
    await this.drainClips()
  }

  /** 이벤트가 모두 올라간 뒤 구간을 하나씩 보낸다. 네트워크 오류면 남겨 두고, 서버가 거절(4xx)하면 버린다 */
  private async drainClips() {
    while (this.clips.length && this.memory.length === 0) {
      const head = this.clips[0]
      try {
        await this.sendClip(this.invite, head.clientId, head.frames)
        this.bytesSent += head.frames.reduce((n, f) => n + f.image.length, 0)
      } catch (e) {
        if (e instanceof ProctorApiError && !e.retryable) console.warn('증거 구간을 서버가 거절해 버립니다:', e.message)
        else return
      }
      this.clips = this.clips.slice(1)
    }
  }

  private load(): ProctorEventRequest[] {
    try {
      const raw = this.storage?.getItem(this.key)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? (parsed as ProctorEventRequest[]) : []
    } catch {
      return []
    }
  }

  private save() {
    try {
      if (this.memory.length) this.storage?.setItem(this.key, JSON.stringify(this.memory))
      else this.storage?.removeItem(this.key)
    } catch {
      // 저장소가 가득 차면 사진을 빼고라도 남긴다
      try {
        this.storage?.setItem(this.key, JSON.stringify(this.memory.map((e) => ({ ...e, snapshot: undefined }))))
      } catch {
        /* 메모리에만 남는다 */
      }
    }
  }
}
