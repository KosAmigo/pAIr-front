// 응시 화면의 Ctrl/⌘+F: 파일 이름과 내용에서 찾는다

export type SearchHit = {
  path: string
  /** 내용에서 찾은 자리(1부터). 파일 이름으로 찾은 결과에는 없다 */
  line?: number
  column?: number
  text?: string
}

export const MAX_HITS = 100

/** 대소문자를 가리지 않는다. 파일 이름 결과를 먼저, 그다음 내용 결과(줄마다 첫 자리)를 낸다 */
export function searchFiles(paths: string[], contents: Record<string, string>, query: string): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: SearchHit[] = paths.filter((p) => p.toLowerCase().includes(q)).map((path) => ({ path }))
  for (const path of paths) {
    if (hits.length >= MAX_HITS) break
    const lines = contents[path]?.split('\n') ?? []
    for (let i = 0; i < lines.length && hits.length < MAX_HITS; i++) {
      const at = lines[i].toLowerCase().indexOf(q)
      if (at >= 0) hits.push({ path, line: i + 1, column: at + 1, text: lines[i].trim() })
    }
  }
  return hits.slice(0, MAX_HITS)
}
