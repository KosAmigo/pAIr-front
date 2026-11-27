export function fmt(sec: number) {
  const s = Math.max(0, sec)
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':')
}

export const readOnlyPath = (p: string) => p.startsWith('logs/') || p.startsWith('자료/')
export const fileName = (p: string) => p.split('/').pop() ?? p
