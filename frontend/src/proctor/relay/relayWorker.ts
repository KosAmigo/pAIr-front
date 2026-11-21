// 폰 릴레이 전용 Web Worker 진입점. 로직은 relayWorkerCore.ts 에 있다.
import { createRelayWorker, type MainToWorker, type WorkerToMain } from './relayWorkerCore.ts'
import { RelaySocket } from './RelaySocket.ts'

const scope = self as unknown as { postMessage(m: WorkerToMain): void; onmessage: ((e: MessageEvent<MainToWorker>) => void) | null }

const handle = createRelayWorker({
  createSocket: (hello, onMessage, onOpenChange) => new RelaySocket(hello, onMessage, onOpenChange),
  post: (m) => scope.postMessage(m),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as number),
})

scope.onmessage = (e) => handle(e.data)
