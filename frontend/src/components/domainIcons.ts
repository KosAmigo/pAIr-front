// 서비스 전체에서 쓰는 개념 아이콘. 이 개념은 어느 화면이든 여기 있는 아이콘만 쓴다 (화면마다 따로 고르지 않는다).
// 과제 = 쌓인 문서, 개발 = </>, 비개발 = 문서, 자가진단 = 확인된 사람, 실전 = 회사 건물.
import { Building2, Code2, FileStack, FileText, UserRoundCheck, type LucideIcon } from 'lucide-react'

/** 과제 */
export const TaskIcon: LucideIcon = FileStack

/** 직군: 개발 / 비개발 */
export const TRACK_ICON = { DEV: Code2, BIZ: FileText } as const satisfies Record<'DEV' | 'BIZ', LucideIcon>

/** 용도: 자가진단 / 실전 */
export const USAGE_ICON = { SELF: UserRoundCheck, LIVE: Building2 } as const satisfies Record<'SELF' | 'LIVE', LucideIcon>

/** 소문자 직군('dev' | 'biz')을 쓰는 곳(자가진단 과제 목록)용 */
export const trackIconOf = (type: 'dev' | 'biz'): LucideIcon => TRACK_ICON[type === 'biz' ? 'BIZ' : 'DEV']
