// 관리자 통계 화면 데이터: 기간(한국 시간 날짜)별 회원·응시·AI 비용·결제 묶음 (GET /api/admin/stats)
import { keepPreviousData } from '@tanstack/react-query'
import { consoleApi, type AdminMemberRole } from '../consoleApi'
import { freshOnMount, queryKeys } from './queryKeys'

/** 관리자 통계 쿼리. 기간이 바뀌면 키가 바뀌어 새로 받는다 */
export const adminStatsQuery = (from: string, to: string) => ({
  queryKey: queryKeys.adminStats(from, to),
  queryFn: () => consoleApi.adminStats(from, to),
  ...freshOnMount,
})

/** 관리자 회원 목록 쿼리. 페이지를 넘기는 동안 이전 페이지를 그대로 보여 준다 */
export const adminMembersQuery = (role: AdminMemberRole, q: string, page: number) => ({
  queryKey: queryKeys.adminMembers(role, q, page),
  queryFn: () => consoleApi.adminMembers(role, q, page),
  ...freshOnMount,
  placeholderData: keepPreviousData,
})

/** 브라우저 현지 날짜를 YYYY-MM-DD 로 (관리자는 한국에서 보므로 서버의 한국 시간 날짜와 같다) */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 오늘까지 최근 days 일 */
export function lastDays(days: number, today = new Date()): { from: string; to: string } {
  const from = new Date(today)
  from.setDate(today.getDate() - (days - 1))
  return { from: isoDate(from), to: isoDate(today) }
}
