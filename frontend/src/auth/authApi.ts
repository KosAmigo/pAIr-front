import type { AuthUser } from './auth'

// localStorage preserves sessions across reloads, but both tokens remain accessible to injected scripts.
const KEY = 'pair.auth'

export type AuthSession = { token: string; refreshToken: string; expiresIn: number; user: AuthUser; sessionId?: string }

export class AuthRequestError extends Error {
  readonly status: number
  readonly retryAfterMs?: number

  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message)
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

export function readAuthSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<AuthSession>
    return typeof value.token === 'string' && value.user ? (value as AuthSession) : null
  } catch {
    return null
  }
}

const listeners = new Set<(session: AuthSession | null, expired: boolean) => void>()

export function subscribeAuthSession(listener: (session: AuthSession | null, expired: boolean) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function saveAuthSession(session: AuthSession | null, expired = false): void {
  if (session) localStorage.setItem(KEY, JSON.stringify(session))
  else localStorage.removeItem(KEY)
  listeners.forEach((listener) => listener(session, expired))
}

export function startAuthSession(session: AuthSession): void {
  const sessionId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  saveAuthSession({ ...session, sessionId })
}

function validateAuthSession(value: AuthSession): AuthSession {
  if (!value || typeof value.token !== 'string' || !value.token ||
      typeof value.refreshToken !== 'string' || !value.refreshToken ||
      typeof value.expiresIn !== 'number' || !Number.isFinite(value.expiresIn) || value.expiresIn <= 0 ||
      !value.user || typeof value.user.id !== 'number') {
    throw new AuthRequestError('인증 서버의 응답이 올바르지 않습니다.', 502)
  }
  return value
}

async function request<T>(path: string, method: string, body?: unknown, authenticated = false): Promise<T> {
  let response: Response
  try {
    const init: RequestInit = {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }
    response = authenticated ? await authenticatedFetch(path, init) : await fetch(path, init)
  } catch (error) {
    if (error instanceof AuthRequestError) throw error
    throw new AuthRequestError('서버에 연결할 수 없습니다. 백엔드 서버가 켜져 있는지 확인하세요.', 0)
  }

  if (!response.ok) {
    let message = `요청 실패 (${response.status})`
    try {
      const payload: unknown = await response.json()
      if (typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string') {
        message = payload.message
      }
    } catch {
      // 응답 본문이 JSON이 아닐 수 있다.
    }
    const retryAfter = response.headers.get('Retry-After')
    const seconds = retryAfter === null ? Number.NaN : Number(retryAfter)
    const date = retryAfter === null ? Number.NaN : Date.parse(retryAfter)
    const retryAfterMs = Number.isFinite(seconds) && seconds >= 0
      ? seconds * 1000
      : Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined
    throw new AuthRequestError(message, response.status, retryAfterMs)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

let refreshInFlight: Promise<AuthSession> | null = null
let lockTail: Promise<void> = Promise.resolve()

async function withAuthLock<T>(callback: () => Promise<T>): Promise<T> {
  const prior = lockTail
  let release: () => void = () => {}
  lockTail = new Promise<void>((resolve) => { release = resolve })
  await prior
  try {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return await navigator.locks.request('pair.auth.refresh', callback)
    }
    return await callback()
  } finally {
    release()
  }
}

async function refreshSession(original: AuthSession): Promise<AuthSession> {
  if (refreshInFlight) return refreshInFlight
  const pending = withAuthLock(async () => {
    const current = readAuthSession()
    if (!current || current.sessionId !== original.sessionId || current.user.id !== original.user.id) {
      throw new AuthRequestError('로그인 상태가 변경되었습니다. 다시 로그인해 주세요.', 401)
    }
    if (current.token !== original.token) return current
    if (!current.refreshToken) {
      saveAuthSession(null, true)
      throw new AuthRequestError('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.', 401)
    }
    try {
      const next = validateAuthSession(await request<AuthSession>('/api/auth/refresh', 'POST', { refreshToken: current.refreshToken }))
      const latest = readAuthSession()
      if (!latest || latest.token !== current.token || latest.sessionId !== current.sessionId) {
        throw new AuthRequestError('로그인 상태가 변경되었습니다. 다시 로그인해 주세요.', 401)
      }
      const updated = { ...next, sessionId: current.sessionId }
      saveAuthSession(updated)
      return updated
    } catch (error) {
      const latest = readAuthSession()
      if (error instanceof AuthRequestError && (error.status === 401 || error.status === 403) &&
          latest?.token === current.token && latest.sessionId === current.sessionId) {
        saveAuthSession(null, true)
      }
      throw error
    }
  })
  refreshInFlight = pending
  try {
    return await pending
  } finally {
    if (refreshInFlight === pending) refreshInFlight = null
  }
}

/** JSON, FormData 및 일반 요청처럼 본문을 재사용할 수 있는 요청에 사용한다. */
export async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const original = readAuthSession()
  const send = (token?: string) => {
    const headers = Object.fromEntries(new Headers(init.headers).entries())
    delete headers.authorization
    if (token) headers.Authorization = `Bearer ${token}`
    return fetch(path, { ...init, headers })
  }
  const response = await send(original?.token)
  if (response.status !== 401 || !original) return response
  const renewed = await refreshSession(original)
  const current = readAuthSession()
  if (!current || current.sessionId !== original.sessionId || current.token !== renewed.token) {
    throw new AuthRequestError('로그인 상태가 변경되었습니다. 다시 로그인해 주세요.', 401)
  }
  return send(renewed.token)
}

export async function logoutAuthSession(): Promise<void> {
  const original = readAuthSession()
  await withAuthLock(async () => {
    const session = readAuthSession()
    if (!session) return
    if (!original || original.sessionId !== session.sessionId || original.user.id !== session.user.id) {
      throw new AuthRequestError('로그인 상태가 변경되어 로그아웃을 완료하지 못했습니다.', 409)
    }
    saveAuthSession(null)
    if (session?.refreshToken) {
      await request<void>('/api/auth/logout', 'POST', { refreshToken: session.refreshToken })
    }
  })
}

export const authApi = {
  requestEmailVerification: (email: string) =>
    request<{ message: string }>('/api/auth/email-verifications', 'POST', { email }),
  login: async (email: string, password: string) => validateAuthSession(await request<AuthSession>('/api/auth/login', 'POST', { email, password })),
  signup: async (name: string, email: string, password: string, code: string) =>
    validateAuthSession(await request<AuthSession>('/api/auth/signup', 'POST', { name, email, password, code })),
  me: () => request<AuthUser>('/api/auth/me', 'GET', undefined, true),
}
