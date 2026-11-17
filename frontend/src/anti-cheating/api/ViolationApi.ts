import type { AntiCheatingConfig, EventHistory, SessionSummary, Violation } from '../core/types.ts'

export interface ViolationApiPort {
  startSession(sessionId: string, config: AntiCheatingConfig): Promise<SessionSummary>
  getSession(sessionId: string): Promise<SessionSummary>
  getEvents(sessionId: string): Promise<EventHistory>
  saveViolation(sessionId: string, violation: Violation): Promise<SessionSummary>
  finishSession(sessionId: string): Promise<SessionSummary>
}

export class ViolationApi implements ViolationApiPort {
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response
    try {
      response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new Error('부정행위 감지 서버에 연결할 수 없습니다.')
    }
    const text = await response.text()
    const payload = text ? JSON.parse(text) : null
    if (!response.ok) throw new Error(payload?.message ?? `감지 기록 요청 실패 (${response.status})`)
    return payload as T
  }

  startSession(sessionId: string, config: AntiCheatingConfig) {
    return this.request<SessionSummary>('POST', '/api/anti-cheating/sessions', { sessionId, settings: config })
  }
  getSession(sessionId: string) {
    return this.request<SessionSummary>('GET', `/api/anti-cheating/sessions/${encodeURIComponent(sessionId)}`)
  }
  getEvents(sessionId: string) {
    return this.request<EventHistory>('GET', `/api/anti-cheating/sessions/${encodeURIComponent(sessionId)}/events`)
  }
  saveViolation(sessionId: string, violation: Violation) {
    return this.request<SessionSummary>('POST', `/api/anti-cheating/sessions/${encodeURIComponent(sessionId)}/violations`, violation)
  }
  finishSession(sessionId: string) {
    return this.request<SessionSummary>('POST', `/api/anti-cheating/sessions/${encodeURIComponent(sessionId)}/finish`)
  }
}
