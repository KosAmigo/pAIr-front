export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** 각도 차이를 -180~180 범위로 */
export function angleDiff(a: number, b: number): number {
  let d = a - b
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return d
}

export interface Point {
  x: number
  y: number
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** p에서 가장 가까운 기준점까지의 거리 (기준점이 없으면 Infinity) */
export function nearestDist(p: Point, refs: Point[]): number {
  let best = Number.POSITIVE_INFINITY
  for (const r of refs) best = Math.min(best, dist(p, r))
  return best
}
