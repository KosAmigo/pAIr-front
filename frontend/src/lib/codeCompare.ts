import type { FileDiff } from '../api.ts'
import { diffStat, lineDiff, type DiffLine } from './edits.ts'

/** 줄 수 곱이 이보다 크면 줄 단위 비교(LCS)가 너무 무거워서 비교를 건너뛴다 */
export const MAX_DIFF_CELLS = 4_000_000

/** 화면에 그릴 줄: 같은 줄을 접은 자리는 skipped 개수를 가진 구분선이다 */
export type ViewLine = DiffLine | { kind: 'skip'; skipped: number }

export type FileChange = {
  path: string
  /** added: 앞쪽에 없고 뒤쪽에만 있음, removed: 앞쪽에만 있음, modified: 둘 다 있고 내용이 다름 */
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

/** 파일 내용 before → after 의 변경 (없는 쪽은 null) */
export function changeOf(path: string, before: string | null, after: string | null, context = 3): FileChange {
  const status = before == null ? 'added' : after == null ? 'removed' : 'modified'
  if (count(before) * count(after) > MAX_DIFF_CELLS) {
    return { path, status, add: count(after), del: count(before), lines: [], tooLarge: true }
  }
  const lines = lineDiff(before ?? '', after ?? '')
  const { add, del } = diffStat(lines)
  return { path, status, add, del, lines: collapse(lines, context), tooLarge: false }
}

/** 서버가 준 파일 한 쌍의 A → B 변경 */
export function fileChange(f: FileDiff, context = 3): FileChange {
  return changeOf(f.path, f.a, f.b, context)
}

/**
 * 원본 대비 두 풀이가 이 파일을 어떻게 바꿨는지.
 * same: 둘 다 바꿨고 내용이 같음, a: A 만 바꿈, b: B 만 바꿈, differ: 둘 다 바꿨는데 서로 다름
 */
export type EditKind = 'same' | 'a' | 'b' | 'differ'

export function editKind(f: FileDiff): EditKind {
  const changedA = f.a !== f.base
  const changedB = f.b !== f.base
  if (changedA && !changedB) return 'a'
  if (changedB && !changedA) return 'b'
  return f.a === f.b ? 'same' : 'differ'
}

/** 한 파일의 화면용 변경: 원본→A, 원본→B, A→B. 바꾸지 않은 쪽은 null */
export type FileView = { path: string; kind: EditKind; baseToA: FileChange | null; baseToB: FileChange | null; aToB: FileChange }

export function fileView(f: FileDiff, context = 3): FileView {
  const kind = editKind(f)
  return {
    path: f.path,
    kind,
    baseToA: f.a !== f.base ? changeOf(f.path, f.base, f.a, context) : null,
    baseToB: f.b !== f.base ? changeOf(f.path, f.base, f.b, context) : null,
    aToB: changeOf(f.path, f.a, f.b, context),
  }
}
