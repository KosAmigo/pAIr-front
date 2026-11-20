import type { FileDiff } from '../api.ts'
import { diffStat, lineDiff, type DiffLine } from './edits.ts'

/** 줄 수 곱이 이보다 크면 줄 단위 비교(LCS)가 너무 무거워서 비교를 건너뛴다 */
export const MAX_DIFF_CELLS = 4_000_000

/** 화면에 그릴 줄: 같은 줄을 접은 자리는 skipped 개수를 가진 구분선이다 */
export type ViewLine = DiffLine | { kind: 'skip'; skipped: number }

export type FileChange = {
  path: string
  /** added: B 에만 있음, removed: A 에만 있음, modified: 둘 다 있고 내용이 다름 */
  status: 'added' | 'removed' | 'modified'
  add: number
  del: number
  lines: ViewLine[]
  /** 파일이 너무 커서 줄 단위 비교를 하지 않았다 */
  tooLarge: boolean
}

const count = (s: string | null) => (s == null || s === '' ? 0 : s.split('\n').length)

/** 바뀐 줄과 그 앞뒤 context 줄만 남기고, 같은 줄이 길게 이어지면 "N줄 생략" 으로 접는다 */
export function collapse(lines: DiffLine[], context = 3): ViewLine[] {
  const keep = new Array<boolean>(lines.length).fill(false)
  lines.forEach((l, i) => {
    if (l.kind === 'same') return
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true
  })
  const out: ViewLine[] = []
  let skipped = 0
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped > 0) out.push({ kind: 'skip', skipped })
      skipped = 0
      out.push(l)
    } else {
      skipped++
    }
  })
  if (skipped > 0) out.push({ kind: 'skip', skipped })
  return out
}

/** 서버가 준 파일 한 쌍을 화면용 변경 내용으로 바꾼다 (A → B) */
export function fileChange(f: FileDiff, context = 3): FileChange {
  const status = f.a == null ? 'added' : f.b == null ? 'removed' : 'modified'
  if (count(f.a) * count(f.b) > MAX_DIFF_CELLS) {
    return { path: f.path, status, add: count(f.b), del: count(f.a), lines: [], tooLarge: true }
  }
  const lines = lineDiff(f.a ?? '', f.b ?? '')
  const { add, del } = diffStat(lines)
  return { path: f.path, status, add, del, lines: collapse(lines, context), tooLarge: false }
}
