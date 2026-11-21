// 폰 페이지가 쓰는 릴레이 연결. 가능하면 Web Worker 안에서 돌려 메인 스레드가 막혀도 연결·heartbeat 가 유지되게 한다.
// 워커를 못 쓰면(생성 실패) 같은 인터페이스로 메인 스레드의 RelaySocket 을 쓴다.
import type { ClientMsg, RelayHealth, ServerMsg } from './protocol.ts'
import { RelaySocket } from './RelaySocket.ts'
import type { MainToWorker, WorkerToMain } from './relayWorkerCore.ts'

export interface PhoneRelay {
  send(msg: ClientMsg): void
  close(): void
  /** 지금까지 보낸 바이트 수 (근사치) */
  readonly bytesSent: number
  health(maxTimerLagMs: number): RelayHealth
}

const EMPTY_HEALTH: RelayHealth = { reconnects: 0, lastCloseAt: 0, lastCloseCode: 0, maxTimerLagMs: 0 }

class WorkerPhoneRelay implements PhoneRelay {
  bytesSent = 0
  private latest: RelayHealth = EMPTY_HEALTH
  private readonly worker: Worker

  constructor(worker: Worker, pairCode: string, onMessage: (m: ServerMsg) => void, onOpenChange: (open: boolean) => void) {
    this.worker = worker
    worker.onmessage = (e: MessageEvent<WorkerToMain>) => {
      const m = e.data
      if (m.kind === 'msg') onMessage(m.msg)
      else if (m.kind === 'open') onOpenChange(m.open)
      else this.latest = m.health
    }
    this.post({ kind: 'init', pairCode })
  }

  private post(m: MainToWorker) {
    this.worker.postMessage(m)
  }

  send(msg: ClientMsg) {
    this.bytesSent += JSON.stringify(msg).length
    this.post({ kind: 'send', msg })
  }

  health(maxTimerLagMs: number): RelayHealth {
    return { ...this.latest, maxTimerLagMs }
  }

  close() {
    this.post({ kind: 'close' })
    this.worker.terminate()
  }
}

export function createPhoneRelay(pairCode: string, onMessage: (m: ServerMsg) => void, onOpenChange?: (open: boolean) => void): PhoneRelay {
  try {
    const worker = new Worker(new URL('./relayWorker.ts', import.meta.url), { type: 'module' })
    return new WorkerPhoneRelay(worker, pairCode, onMessage, onOpenChange ?? (() => undefined))
  } catch {
    return new RelaySocket(() => ({ type: 'hello-phone', pairCode }), onMessage, onOpenChange)
  }
}
