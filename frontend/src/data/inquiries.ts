// 기업 도입 문의 목업 저장소 (기획_결정사항 §4, 테이블 company_inquiries).
// 기업은 자체 가입하지 않는다: 문의 → 관리자 승인(회사 등록) → 담당자 초대 메일 → 초대 링크로 가입.
// 새로 고치면 처음 상태로 돌아간다.
import { useSyncExternalStore } from 'react'
import { addManager, createCompany } from './consoleSessions'

export type InquiryStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type Inquiry = {
  id: number
  companyName: string
  businessNo: string
  contactName: string
  contactEmail: string
  message?: string
  status: InquiryStatus
  companyId?: number
  handledAt?: string
  createdAt: string
}

let inquiries: Inquiry[] = [
  {
    id: 1,
    companyName: '테스트소프트',
    businessNo: '234-56-78901',
    contactName: '박도입',
    contactEmail: 'cto@testsoft.test',
    message: '백엔드 신입 공채에 AI 활용 역량 평가를 넣고 싶습니다. 회차당 50명 정도 예상합니다.',
    status: 'PENDING',
    createdAt: '2026-11-18T15:20:00+09:00',
  },
]
let seq = 10
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useInquiries = () => useSyncExternalStore(subscribe, () => inquiries)

/** 문의 접수. 형식이 틀리면 오류 문구를 돌려준다 */
export function submitInquiry(input: Omit<Inquiry, 'id' | 'status' | 'createdAt'>): string | null {
  if (!input.companyName.trim()) return '회사 이름을 입력하세요'
  if (!/^\d{3}-\d{2}-\d{5}$/.test(input.businessNo.trim())) return '사업자등록번호는 000-00-00000 형식입니다'
  if (!input.contactName.trim()) return '담당자 이름을 입력하세요'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail.trim())) return '담당자 이메일 형식이 아닙니다'
  inquiries = [{ ...input, id: ++seq, status: 'PENDING', createdAt: new Date().toISOString() }, ...inquiries]
  emit()
  return null
}

/** 승인: 회사를 등록하고 담당자를 첫 MANAGER 로 초대한다 (목업: 초대 메일 대신 담당자로 바로 추가) */
export function approveInquiry(id: number): string | null {
  const q = inquiries.find((x) => x.id === id)
  if (!q || q.status !== 'PENDING') return '이미 처리한 문의입니다'
  const r = createCompany(q.companyName, q.businessNo)
  if (r.error || r.id == null) return r.error ?? '회사를 등록하지 못했습니다'
  addManager(r.id, q.contactName, q.contactEmail)
  inquiries = inquiries.map((x) => (x.id === id ? { ...x, status: 'APPROVED', companyId: r.id, handledAt: new Date().toISOString() } : x))
  emit()
  return null
}

export function rejectInquiry(id: number) {
  inquiries = inquiries.map((x) => (x.id === id && x.status === 'PENDING' ? { ...x, status: 'REJECTED', handledAt: new Date().toISOString() } : x))
  emit()
}
