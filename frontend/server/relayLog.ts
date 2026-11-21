// 릴레이 진단 로그. 콘솔과 파일(%TEMP%\pair-relay.log)에 같이 남긴다.
// 초대 토큰·짝 코드 같은 값은 앞 6자리만 남긴다.
import { appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const RELAY_LOG_FILE = join(tmpdir(), 'pair-relay.log')

/** 비밀 값은 앞 6자리만 보인다 */
export function mask(secret: string | undefined): string {
  if (!secret) return '-'
  return `${secret.slice(0, 6)}…`
}

/** 밀리초 시각까지 적은 한 줄. 시각을 ISO 로 남겨 폰·터널 로그와 맞춰 볼 수 있게 한다 */
export function formatLine(now: Date, args: readonly unknown[]): string {
  const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  return `${now.toISOString()} ${text}`
}

export function relayLog(...args: unknown[]): void {
  const line = formatLine(new Date(), args)
  console.log(`[proctor-relay] ${line}`)
  try {
    appendFileSync(RELAY_LOG_FILE, `${line}\n`)
  } catch {
    // 파일에 못 써도 릴레이 동작은 멈추지 않는다
  }
}
