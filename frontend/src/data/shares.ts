// 리포트 공유 링크 목업 (기획_결정사항 §3, attempts.share_token_hash / shared_at). 자가진단 리포트만.
// 본인이 켜면 읽기 전용 공유 링크가 생기고, 끄면 사라진다. 다시 켜면 새 토큰이라 예전 링크는 무효.
// 목업은 같은 브라우저 저장소에 둬서 새 탭으로 연 공유 링크도 열린다(실제로는 서버가 토큰 해시를 저장한다).
import { useSyncExternalStore } from 'react'

type Share = { token: string; sharedAt: string }
const KEY = 'pair:shares'
const load = (): Record<string, Share | undefined> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(shares))
  } catch {
    // 저장소가 막혀 있으면 이 탭에서만 유지된다
  }
}
let shares: Record<string, Share | undefined> = load()
const listeners = new Set<() => void>()
const emit = () => {
  save()
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')

export const useShare = (attemptId: string) => useSyncExternalStore(subscribe, () => shares[attemptId])
export const shareLink = (s: Share) => `${location.origin}/share/${s.token}`
/** 공유 토큰으로 응시 찾기 (공유 보기 화면) */
export const attemptOfShare = (t: string) => Object.entries(shares).find(([, s]) => s?.token === t)?.[0]

export function enableShare(attemptId: string) {
  shares = { ...shares, [attemptId]: { token: token(), sharedAt: new Date().toISOString() } }
  emit()
}
export function disableShare(attemptId: string) {
  shares = { ...shares, [attemptId]: undefined }
  emit()
}
