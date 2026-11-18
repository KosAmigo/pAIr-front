// 콘솔 화면 공용 도우미: 시각 표기, 난이도 색, 토스트
import { useEffect, useState } from 'react'
import { useAuth, isCompanyRole } from '../../auth/auth'
import { useCompanies } from '../../data/consoleSessions'

/** 잠깐 떴다 사라지는 알림. show(text) 로 띄운다 */
export function useToast() {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    if (!text) return
    const t = window.setTimeout(() => setText(null), 2400)
    return () => window.clearTimeout(t)
  }, [text])
  const node = text ? (
    <div role="status" className="fade-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md border border-line bg-panel px-4 py-2 text-[14px] text-text shadow-modal">
      {text}
    </div>
  ) : null
  return { show: setText, node }
}

export const fmtTime = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export const LEVEL_CLS: Record<string, string> = {
  초급: 'bg-signal/10 text-signal',
  중급: 'bg-info/10 text-info',
  고급: 'bg-branch-5/10 text-branch-5',
}

/** 지금 시각 (ms). every 밀리초마다 다시 그린다 */
export function useNow(every = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), every)
    return () => window.clearInterval(t)
  }, [every])
  return now
}

const p2 = (n: number) => String(n).padStart(2, '0')
/** 11.21 14:00 */
export const fmtShort = (iso: string) => {
  const d = new Date(iso)
  return `${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}
/** 14:00 */
export const fmtHm = (iso: string) => {
  const d = new Date(iso)
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`
}
/** 남은 시간 00:35:12 */
export const fmtLeft = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`
}
/** 12초 전, 3분 전 */
export const fmtAgo = (iso: string | undefined, now: number) => {
  if (!iso) return '—'
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000))
  return s < 60 ? `${s}초 전` : s < 3600 ? `${Math.floor(s / 60)}분 전` : `${Math.floor(s / 3600)}시간 전`
}

/** 지금 계정이 볼 수 있는 회사 (기업 담당자는 자기 회사만) */
export function useMyCompanyId(): number | null {
  const { user } = useAuth()
  const companies = useCompanies()
  if (!isCompanyRole(user?.role)) return null
  return companies.find((c) => c.name === user.companyName)?.id ?? -1
}

