import type { AuthUser } from './auth'

// 로그인 토큰을 저장하고 회원가입·로그인·세션 확인·로그아웃 API를 호출한다.
const KEY = 'pair.auth'

export type AuthSession = { token: string; user: AuthUser }
export class AuthRequestError extends Error {
  readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.status = status
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
}

async function request<T>(path: string, method: string, body?: unknown, token?: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new AuthRequestError('서버에 연결할 수 없습니다. 백엔드 서버가 켜져 있는지 확인하세요.', 0)
  }

  if (!response.ok) {
    let message = `요청 실패 (${response.status})`
    try {
      message = ((await response.json()) as { message?: string }).message ?? message
    } catch {
      // 응답 본문이 JSON이 아닐 수 있다.
    }
    throw new AuthRequestError(message, response.status)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const authApi = {
  /** 이메일과 비밀번호로 로그인해 토큰과 회원 정보를 받는다. */
  login: (email: string, password: string) => request<AuthSession>('/api/auth/login', 'POST', { email, password }),
  /** 일반 회원 계정을 만들고 즉시 로그인 토큰을 발급받는다. */
  signup: (name: string, email: string, password: string) => request<AuthSession>('/api/auth/signup', 'POST', { name, email, password }),
  /** 저장된 bearer 토큰의 유효성과 최신 회원 정보를 서버에서 확인한다. */
  me: (token: string) => request<AuthUser>('/api/auth/me', 'GET', undefined, token),
  /** 서버 세션을 폐기해 현재 토큰을 무효화한다. */
  logout: (token: string) => request<void>('/api/auth/logout', 'POST', undefined, token),
}
