// AI 답변 속 파일 수정 제안(```edit 블록)을 나누고, 바뀐 줄을 계산한다.
// 블록 규칙은 백엔드 EditProposals.java 와 같아야 한다.

export type Segment = { kind: 'text'; text: string } | { kind: 'edit'; index: number; path: string }

const BLOCK = /```edit[ \t]+path=(\S+)[ \t]*\r?\n([\s\S]*?)\r?\n```/g

/** 답변을 일반 글과 수정 제안 자리로 나눈다. index 는 백엔드 제안 번호와 같다. */
export function splitReply(text: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(BLOCK)) {
    const at = m.index ?? 0
    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) })
    out.push({ kind: 'edit', index: i++, path: m[1] })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
    .map((s) => (s.kind === 'text' ? { ...s, text: s.text.replace(/^\n+|\n+$/g, '') } : s))
    .filter((s) => s.kind === 'edit' || s.text.length > 0)
}

export type DiffLine = { kind: 'same' | 'del' | 'add'; text: string }

/** 줄 단위 차이 (LCS). 수정 제안 한 쌍(SEARCH → REPLACE) 정도의 크기를 가정한다. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before === '' ? [] : before.replace(/\r\n/g, '\n').split('\n')
  const b = after === '' ? [] : after.replace(/\r\n/g, '\n').split('\n')
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i].trimEnd() === b[j].trimEnd() ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i].trimEnd() === b[j].trimEnd()) {
      out.push({ kind: 'same', text: b[j] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: 'del', text: a[i++] })
    } else {
      out.push({ kind: 'add', text: b[j++] })
    }
  }
  while (i < n) out.push({ kind: 'del', text: a[i++] })
  while (j < m) out.push({ kind: 'add', text: b[j++] })
  return out
}

export function diffStat(lines: DiffLine[]) {
  return { add: lines.filter((l) => l.kind === 'add').length, del: lines.filter((l) => l.kind === 'del').length }
}
