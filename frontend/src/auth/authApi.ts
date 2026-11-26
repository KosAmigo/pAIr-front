import type { AuthUser } from './auth'

// 로그인 토큰을 저장하고 회원가입·로그인·세션 확인·로그아웃 API를 호출한다.
const KEY = 'pair.auth'

export type AuthSession = { token: string; refreshToken?: string; expiresIn?: number; sessionKey?: string; user: AuthUser }

export function newAuthSession(session: AuthSession): AuthSession {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const sessionKey = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return { ...session, sessionKey }
}
export class AuthRequestError extends Error {
  readonly status: number
  readonly retryAfterMs?: number

  constructor(
    message: string,
    status: number,
    retryAfterMs?: number,
  ) {
    super(message)
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

export class AuthSessionExpiredError extends AuthRequestError {
  constructor() {
    super('로그인이 만료되었습니다. 다시 로그인해 주세요.', 401)
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

export function saveAuthSession(session: AuthSession | null) {
  if (session) localStorage.setItem(KEY, JSON.stringify(session))
  else localStorage.removeItem(KEY)
  listeners.forEach((listener) => listener())
}

const listeners = new Set<() => void>()

export function subscribeAuthSession(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

let refreshInFlight: Promise<AuthSession> | null = null

async function withRefreshLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('pair.auth.refresh', operation)
  }
  return operation()
}

export async function ensureAuthSessionKey(): Promise<AuthSession | null> {
  const session = readAuthSession()
  if (!session?.refreshToken || session.sessionKey) return session
  return withRefreshLock(async () => {
    const current = readAuthSession()
    if (!current || current.token !== session.token || !current.refreshToken || current.sessionKey) return current
    const migrated = newAuthSession(current)
    saveAuthSession(migrated)
    return migrated
  })
}

async function refreshSession(failedSession: AuthSession): Promise<AuthSession> {
  if (refreshInFlight) {
    const refreshed = await refreshInFlight
    if (failedSession.sessionKey && refreshed.sessionKey === failedSession.sessionKey &&
        readAuthSession()?.token === refreshed.token) return refreshed
    throw new AuthSessionExpiredError()
  }
  const pending = withRefreshLock(async () => {
    const current = readAuthSession()
    if (!current) throw new AuthSessionExpiredError()
    if (failedSession.sessionKey && current.sessionKey !== failedSession.sessionKey) throw new AuthSessionExpiredError()
    if (current.token !== failedSession.token || current.refreshToken !== failedSession.refreshToken) {
      if (failedSession.sessionKey && current.sessionKey === failedSession.sessionKey) return current
      throw new AuthSessionExpiredError()
    }
    if (!current.refreshToken) {
      saveAuthSession(null)
      throw new AuthSessionExpiredError()
    }

    let response: Response
    try {
      response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      })
    } catch {
      throw new AuthRequestError('서버에 연결할 수 없습니다. 로그인 상태를 갱신하지 못했습니다.', 0)
    }
    if (!response.ok) {
      if (response.status === 401) {
        const latest = readAuthSession()
        if (latest?.refreshToken === current.refreshToken && latest.sessionKey === current.sessionKey) saveAuthSession(null)
        throw new AuthSessionExpiredError()
      }
      throw new AuthRequestError(`로그인 상태를 갱신하지 못했습니다 (${response.status}).`, response.status)
    }
    let next: unknown
    try {
      next = await response.json()
    } catch {
      throw new AuthRequestError('로그인 갱신 응답이 올바르지 않습니다.', 0)
    }
    if (typeof next !== 'object' || next === null ||
        !('token' in next) || typeof next.token !== 'string' || !next.token ||
        !('refreshToken' in next) || typeof next.refreshToken !== 'string' || !next.refreshToken ||
        !('user' in next) || typeof next.user !== 'object' || next.user === null) {
      throw new AuthRequestError('로그인 갱신 응답이 올바르지 않습니다.', 0)
    }
    const latest = readAuthSession()
    if (!latest || latest.refreshToken !== current.refreshToken || latest.sessionKey !== current.sessionKey) throw new AuthSessionExpiredError()
    const updated: AuthSession = { ...latest, token: next.token, refreshToken: next.refreshToken }
    if ('expiresIn' in next && typeof next.expiresIn === 'number') updated.expiresIn = next.expiresIn
    saveAuthSession(updated)
    return updated
  })
  refreshInFlight = pending
  try {
    return await pending
  } finally {
    if (refreshInFlight === pending) refreshInFlight = null
  }
}

/** Retries a protected request once after refreshing the session that sent it. */
export async function authenticatedFetch(path: string, init: RequestInit, token?: string): Promise<Response> {
  const initial = await ensureAuthSessionKey()
  const sentToken = token ?? initial?.token
  const send = (accessToken?: string) => {
    const headers = new Headers(init.headers)
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    return fetch(path, { ...init, headers })
  }
  const response = await fetch(path, init)
  if (response.status !== 401 || !sentToken) return response
  const current = readAuthSession()
  if (!initial || !current || initial.token !== sentToken) return response
  if (initial.sessionKey && current.sessionKey !== initial.sessionKey) return response
  if (current.token !== sentToken && (!initial.sessionKey || current.sessionKey !== initial.sessionKey)) return response
  const next = await refreshSession(initial)
  const retry = await send(next.token)
  if (path === '/api/auth/me' && retry.status === 401) {
    const latest = readAuthSession()
    if (latest?.token === next.token && latest.sessionKey === next.sessionKey) saveAuthSession(null)
  }
  return retry
}

async function request<T>(path: string, method: string, body?: unknown, token?: string): Promise<T> {
  let response: Response
  try {
    const init = {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }
    response = path === '/api/auth/me' ? await authenticatedFetch(path, init, token) : await fetch(path, init)
  } catch (error) {
    if (error instanceof AuthRequestError) throw error
    throw new AuthRequestError('서버에 연결할 수 없습니다. 백엔드 서버가 켜져 있는지 확인하세요.', 0)
  }

  if (!response.ok) {
    let message = `요청 실패 (${response.status})`
    let payload: unknown
    try {
      payload = await response.json()
      if (typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string') {
        message = payload.message
      }
    } catch {
      // 응답 본문이 JSON이 아닐 수 있다.
    }
    const retryAfter = response.headers.get('Retry-After')
    const retryAfterSeconds = retryAfter === null ? Number.NaN : Number(retryAfter)
    const retryAfterDate = retryAfter === null ? Number.NaN : Date.parse(retryAfter)
    const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
      ? retryAfterSeconds * 1000
      : Number.isFinite(retryAfterDate)
        ? Math.max(0, retryAfterDate - Date.now())
        : undefined
    throw new AuthRequestError(message, response.status, retryAfterMs)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const authApi = {
  /** 이메일로 6자리 인증 코드를 발송한다. */
  requestEmailVerification: (email: string) =>
    request<{ message: string }>('/api/auth/email-verifications', 'POST', { email }),
  /** 이메일과 비밀번호로 로그인해 토큰과 회원 정보를 받는다. */
  login: (email: string, password: string) => request<AuthSession>('/api/auth/login', 'POST', { email, password }),
  /** 일반 회원 계정을 만들고 즉시 로그인 토큰을 발급받는다. */
  signup: (name: string, email: string, password: string, code: string) =>
    request<AuthSession>('/api/auth/signup', 'POST', { name, email, password, code }),
  /** 저장된 bearer 토큰의 유효성과 최신 회원 정보를 서버에서 확인한다. */
  me: (token: string) => request<AuthUser>('/api/auth/me', 'GET', undefined, token),
  /** 내 정보 수정: 이름만 바꾼다. 바뀐 회원 정보를 돌려받는다. */
  updateName: (token: string, name: string) => request<AuthUser>('/api/auth/me', 'PATCH', { name }, token),
  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    request<void>('/api/auth/password', 'PATCH', { currentPassword, newPassword }, token),
  withdraw: (token: string, currentPassword: string) =>
    request<void>('/api/auth/withdrawal', 'POST', { currentPassword }, token),
  /** 서버 세션을 폐기해 현재 토큰을 무효화한다. */
  logout: (refreshToken: string) => request<void>('/api/auth/logout', 'POST', { refreshToken }),
}

export async function logoutSession(): Promise<void> {
  const original = await ensureAuthSessionKey()
  let refreshError: unknown
  if (refreshInFlight) {
    try {
      await refreshInFlight
    } catch (error) {
      if (!(error instanceof AuthSessionExpiredError)) refreshError = error
    }
  }
  await withRefreshLock(async () => {
    const session = readAuthSession()
    if (!session || !original ||
        (original.sessionKey ? session.sessionKey !== original.sessionKey : session.token !== original.token)) return
    saveAuthSession(null)
    if (session?.refreshToken) await authApi.logout(session.refreshToken)
  })
  if (refreshError) throw refreshError
}
