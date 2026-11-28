import { ApiError, call, getAuthHeaders } from '../api.ts'
import { authenticatedFetch, AuthRequestError, type AuthSession } from '../auth/authApi.ts'

export type CompanyMember = {
  id: number
  name: string
  email: string
  role: 'MANAGER' | 'PROCTOR'
  status: string
  emailVerified: boolean
  passwordChangeRequired: boolean
  onboardingMailStatus: string
}
export type InquiryMember = { name: string; email: string; role: string }
export type Inquiry = {
  id: number
  companyName: string
  businessNo: string
  contactName: string
  contactEmail: string
  message: string | null
  status: string
  members: InquiryMember[]
}
export type Company = { id: number; name: string; businessNo: string; contact: string; createdAt: string }
export type CompanyDetail = { company: Company; members: CompanyMember[] }
export type CompanyMembers = { companyId: number; members: CompanyMember[] }
export type Invite = { email: string; role: string; companyName: string }

async function publicRequest<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    throw new ApiError('백엔드에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.')
  }
  const text = await response.text()
  let data: unknown = null
  if (text) {
    try { data = JSON.parse(text) } catch { throw new ApiError(`서버 응답이 올바르지 않습니다 (${response.status}).`) }
  }
  if (!response.ok) {
    const error = new ApiError(typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string' ? data.message : `요청 실패 (${response.status})`)
    error.status = response.status
    throw error
  }
  return data as T
}

async function upload<T>(url: string, form: FormData): Promise<T> {
  let response: Response
  try {
    response = await authenticatedFetch(url, { method: 'POST', headers: getAuthHeaders(), body: form })
  } catch (error) {
    if (error instanceof AuthRequestError) throw error
    throw new ApiError('백엔드에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.')
  }
  const text = await response.text()
  let data: unknown = null
  if (text) {
    try { data = JSON.parse(text) } catch { throw new ApiError(`서버 응답이 올바르지 않습니다 (${response.status}).`) }
  }
  if (!response.ok) {
    const error = new ApiError(typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string' ? data.message : `요청 실패 (${response.status})`)
    error.status = response.status
    throw error
  }
  return data as T
}

export type CompanyDeletion = { companyId: number; withdrawnMembers: number; canceledSessions: number; revokedInvites: number }

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const enc = encodeURIComponent

export const companyApi = {
  submitInquiry: (form: FormData) => publicRequest<Inquiry>('/api/company-inquiries', { method: 'POST', body: form }),
  inquiries: () => call<Inquiry[]>('GET', '/api/admin/company-inquiries'),
  approve: (id: number) => call<unknown>('POST', `/api/admin/company-inquiries/${id}/approve`),
  reject: (id: number) => call<unknown>('POST', `/api/admin/company-inquiries/${id}/reject`),
  replaceMembers: (id: number, file: File) => {
    const form = new FormData()
    form.set('file', file)
    return upload<Inquiry>(`/api/admin/company-inquiries/${id}/members`, form)
  },
  companies: () => call<Company[]>('GET', '/api/admin/companies'),
  company: (id: number) => call<CompanyDetail>('GET', `/api/admin/companies/${id}`),
  replaceManager: (id: number, name: string, email: string) => call<unknown>('POST', `/api/admin/companies/${id}/manager`, { name, email }),
  /** 회사 삭제(소프트 삭제): 진행 중 회차가 있으면 409. 예정 회차 취소, 대기 초대 무효, 멤버 탈퇴 처리 */
  deleteCompany: (id: number) => call<CompanyDeletion>('DELETE', `/api/admin/companies/${id}`),
  reissue: (id: number) => call<unknown>('POST', `/api/admin/members/${id}/onboarding/reissue`),
  members: () => call<CompanyMembers>('GET', '/api/console/company/members'),
  invite: (email: string) => call<unknown>('POST', '/api/console/company/proctor-invites', { email }),
  delegate: (proctorUserId: number) => call<unknown>('POST', '/api/console/company/manager-delegation', { proctorUserId }),
  invitation: (token: string) => publicRequest<Invite>(`/api/company-invites/${enc(token)}`),
  inviteCode: (token: string) => publicRequest<unknown>(`/api/company-invites/${enc(token)}/email-verifications`, { method: 'POST' }),
  accept: (token: string, name: string, password: string, code: string) =>
    publicRequest<AuthSession>('/api/company-invites/accept', json({ token, name, password, code })),
  onboardingCode: () => call<unknown>('POST', '/api/auth/onboarding/email-verifications'),
  verifyOnboarding: (code: string) => call<unknown>('POST', '/api/auth/onboarding/email-verification', { code }),
}
