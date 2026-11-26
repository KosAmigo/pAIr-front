import { authApi, ensureAuthSessionKey, readAuthSession, AuthRequestError, AuthSessionExpiredError } from './authApi.ts'

export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < 8 || password.length > 72 || new TextEncoder().encode(password).length > 72) {
    return '새 비밀번호는 8~72자이면서 UTF-8 기준 72바이트 이하여야 합니다.'
  }
  if (password !== confirmation) return '새 비밀번호 확인이 일치하지 않습니다.'
  return null
}

/** 이름은 앞뒤 공백을 빼고 1~50자 (서버 SignupRequest·ProfileUpdateRequest 와 같은 기준) */
export function validateName(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return '이름을 입력해 주세요.'
  if (trimmed.length > 50) return '이름은 50자 이하여야 합니다.'
  return null
}

export function accountErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return '요청을 처리하지 못했습니다. 다시 시도해 주세요.'
  if (!(error instanceof AuthRequestError) || error.message !== `요청 실패 (${error.status})`) return error.message
  switch (error.status) {
    case 400: return '입력 정보를 확인해 주세요.'
    case 401: return '현재 비밀번호를 확인해 주세요.'
    case 403: return '관리자 계정은 탈퇴할 수 없습니다.'
    case 409: return '기업에 취소되지 않은 예정 또는 진행 중인 회차가 있어 탈퇴할 수 없습니다.'
    default: return error.message
  }
}

// 401은 현재 비밀번호 오류일 수도 있으므로 별도 인증 조회로만 세션 만료를 판별한다.
export async function accountMutation(token: string, operation: (token: string) => Promise<void>, clearSession: () => void): Promise<void> {
  const original = await ensureAuthSessionKey()
  try {
    await operation(token)
  } catch (error) {
    if (!(error instanceof AuthRequestError) || error.status !== 401) throw error
    try {
      await authApi.me(token)
    } catch (verificationError) {
      if (verificationError instanceof AuthRequestError && verificationError.status === 401) {
        clearSession()
        throw new AuthSessionExpiredError()
      }
      const detail = verificationError instanceof Error ? verificationError.message : '알 수 없는 오류'
      throw new AuthRequestError(`${error.message} 로그인 상태를 확인하지 못했습니다: ${detail}`, error.status)
    }
    const current = readAuthSession()
    if (original?.sessionKey && current?.sessionKey === original.sessionKey && current.token !== token) {
      await operation(current.token)
      clearSession()
      return
    }
    throw error
  }
  clearSession()
}
