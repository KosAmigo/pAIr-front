// 카메라 감독 이벤트 아웃박스. 네트워크가 끊겨도 이벤트를 잃지 않도록 브라우저 저장소에 쌓았다가 보낸다.
// 네트워크 오류·5xx 는 다시 보내고, 4xx(시험 시간 밖 등)는 다시 보내도 같으므로 버린다.
import type { CamViolation } from '../core/events.ts'
import { ProctorApiError, proctorApi, type ProctorEventRequest } from './proctorApi.ts'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Sender = (invite: string, event: ProctorEventRequest) => Promise<unknown>

const PREFIX = 'pair:cam-outbox:'
/** 사진이 붙은 이벤트는 20KB 안팎이라 이 정도면 저장소 한도(보통 5MB) 안에 든다 */
const MAX_ITEMS = 100

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

export class CamOutbox {
  private readonly key: string
  private readonly invite: string
  private readonly storage: StorageLike | null
  private readonly send: Sender
  private memory: ProctorEventRequest[] = []
  private flushing: Promise<void> | null = null
  /** 보낸 바이트 (데이터 절감 지표용) */
  bytesSent = 0

  constructor(invite: string, send: Sender = proctorApi.recordEvent, storage: StorageLike | null = defaultStorage()) {
    this.invite = invite
    this.key = PREFIX + invite
    this.send = send
    this.storage = storage
    this.memory = this.load()
  }

  get pending(): number {
    return this.memory.length
  }

  enqueue(v: CamViolation) {
    const next = [...this.memory, toRequest(v)]
    // 넘치면 가장 오래된 것부터 버린다 (최근 이벤트가 더 중요)
    this.memory = next.length > MAX_ITEMS ? next.slice(next.length - MAX_ITEMS) : next
    this.save()
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
