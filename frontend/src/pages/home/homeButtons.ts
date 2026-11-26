import { canUseSelfDiagnosis, type Role } from '../../auth/auth'

/**
 * 홈 화면의 콘솔·자가진단 버튼을 누구에게 보일지.
 * 로그인 전에는 둘 다, 일반 회원(USER)은 자가진단만, 기업 계정(매니저·감독관)은 콘솔만, 관리자는 둘 다.
 */
export function homeButtons(signedIn: boolean, role: Role | undefined) {
  return {
    showConsole: !signedIn || role !== 'USER',
    showSelf: !signedIn || canUseSelfDiagnosis(role),
  }
}
