// 과제 요구사항(문자열 목록)을 '만들 기능 + 매개변수 + 예시'로 읽어 낸다 (DESIGN.md §6.16 요구사항 표시).
// 생성기가 쓰는 줄 모양(DB는 그대로 문자열 목록):
//   만들 기능: `Class.method(Type name, …): Return` — 무엇을 돌려주는지 한 문장
//   - 매개변수이름: 뜻(짧은 명사구)          ← 바로 아래 여러 줄
//   input → expected                         ← 예시 (값 그대로)
// 예전 과제는 예시 줄만 있다. 백틱이 없거나 '—' 대신 '-' 인 변형도 받는다. 읽지 못한 줄은 other 로 남겨 글로 보인다.
// 원문 값·순서는 바꾸지 않는다.

export type ReqParam = { name: string; meaning: string }
export type ReqFeature = { signature: string; summary: string; params: ReqParam[] }
export type ReqExample = { input: string; expected: string }
export type ParsedRequirements = { features: ReqFeature[]; examples: ReqExample[]; other: string[] }

const FEATURE = /^만들\s*기능\s*[:：]\s*(.+)$/s
const PARAM = /^[-•*·]\s*`?([^`:：\s][^`:：]*?)`?\s*[:：]\s*(.+)$/

/** '만들 기능:' 뒤 글 → 시그니처와 설명 한 문장 */
function splitFeature(rest: string): { signature: string; summary: string } {
  const r = rest.trim()
  // 백틱으로 감싼 시그니처가 있으면 그 안쪽이 시그니처
  const m = /^`([^`]+)`\s*(.*)$/s.exec(r)
  if (m) return { signature: m[1].trim(), summary: m[2].replace(/^[—–\-:：]\s*/, '').trim() }
  // 백틱이 없으면 첫 구분자(' — ', ' - ') 앞이 시그니처. 시그니처 안에 괄호가 있으면 괄호가 닫힌 뒤의 구분자만 본다
  let depth = 0
  for (let i = 0; i < r.length; i++) {
    const c = r[i]
    if (c === '(' || c === '[' || c === '<') depth++
    else if (c === ')' || c === ']' || c === '>') depth = Math.max(0, depth - 1)
    else if (depth === 0) {
      const tail = r.slice(i)
      const s = /^\s+[—–-]\s+|^\s*—\s*/.exec(tail)
      if (s && i > 0) return { signature: r.slice(0, i).trim(), summary: r.slice(i + s[0].length).trim() }
    }
  }
  return { signature: r.replace(/^`|`$/g, ''), summary: '' }
}

function splitExample(item: string): ReqExample | null {
  const i = item.indexOf(' → ') >= 0 ? item.indexOf(' → ') : item.indexOf('→')
  if (i < 0) return null
  const len = item.startsWith(' → ', i) ? 3 : 1
  const input = item.slice(0, i).trim()
  const expected = item.slice(i + len).trim()
  return input && expected ? { input, expected } : null
}

export function parseRequirements(lines: readonly string[] | null | undefined): ParsedRequirements {
  const out: ParsedRequirements = { features: [], examples: [], other: [] }
  let cur: ReqFeature | null = null
  for (const raw of lines ?? []) {
    const item = (raw ?? '').trim()
    if (!item) continue
    // 예시: '→' 가 있는 항목은 줄바꿈이 들어 있어도 한 항목이다 (기능 줄이 아닐 때)
    const ex = !FEATURE.test(item) ? splitExample(item) : null
    if (ex) {
      out.examples.push(ex)
      cur = null
      continue
    }
    // 한 항목 안에 줄바꿈이 있으면 줄마다 본다 (기능 + 매개변수가 한 항목으로 올 수 있다)
    for (const line of item.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
      const f = FEATURE.exec(line)
      if (f) {
        cur = { ...splitFeature(f[1]), params: [] }
        out.features.push(cur)
        continue
      }
      const p = cur ? PARAM.exec(line) : null
      if (cur && p) {
        cur.params.push({ name: p[1].trim(), meaning: p[2].trim() })
        continue
      }
      const e = splitExample(line)
      if (e) {
        out.examples.push(e)
        cur = null
        continue
      }
      cur = null
      out.other.push(line)
    }
  }
  return out
}

/** 하나라도 읽었으면 true. 아니면(그냥 글만) 화면은 예전처럼 번호 목록으로 보여 준다 */
export const hasStructure = (p: ParsedRequirements): boolean => p.features.length > 0 || p.examples.length > 0

export type CallPart = { kind: 'call' | 'text'; text: string }

// '을 호출한 뒤' 같은 연결 말(호출 사이 글이 이것뿐이면 줄인다)
const GLUE = /^[\s,을를은는이가와과에서]*(?:호출(?:한|하고|하면|해서)?|실행(?:한|하고)?|한)?\s*(?:뒤에?|후에?|다음에?|이후에?|하고)?[\s,]*$/

/**
 * 예시 입력을 '호출 한 줄씩'으로 나눈다. 식별자( … ) 모양(따옴표·괄호 균형 고려)을 호출로 보고,
 * 호출 앞뒤·사이의 글은 연결 말이면 줄이고 그 밖의 글은 text 로 남긴다. 호출이 없으면 원문 한 칸.
 */
export function splitCalls(input: string): CallPart[] {
  const s = input.trim()
  const parts: CallPart[] = []
  const callRe = /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\(/g
  let last = 0
  let found = false
  let m: RegExpExecArray | null
  while ((m = callRe.exec(s)) !== null) {
    if (m.index < last) continue
    // 여는 괄호부터 짝이 맞는 닫는 괄호까지 (따옴표 안의 괄호는 무시)
    let depth = 0
    let quote: string | null = null
    let end = -1
    for (let i = m.index + m[0].length - 1; i < s.length; i++) {
      const c = s[i]
      if (quote) {
        if (c === '\\') i++
        else if (c === quote) quote = null
      } else if (c === '"' || c === "'") quote = c
      else if (c === '(') depth++
      else if (c === ')') {
        depth--
        if (depth === 0) {
          end = i + 1
          break
        }
      }
    }
    if (end < 0) return [{ kind: 'text', text: s }] // 괄호가 안 닫힘 → 원문 그대로
    const between = s.slice(last, m.index).trim()
    if (between && !GLUE.test(between)) parts.push({ kind: 'text', text: between })
    parts.push({ kind: 'call', text: s.slice(m.index, end) })
    found = true
    last = end
    callRe.lastIndex = end
  }
  if (!found) return [{ kind: 'text', text: s }]
  const tail = s.slice(last).trim()
  if (tail && !GLUE.test(tail)) parts.push({ kind: 'text', text: tail })
  return parts
}

/** 시그니처에서 메서드 이름을 찾아 앞·이름·뒤로 나눈다 (이름 강조용). 못 찾으면 이름 없이 통째로 */
export function splitSignature(sig: string): { before: string; name: string; after: string } {
  const m = /([A-Za-z_$][\w$]*)\s*\(/.exec(sig)
  if (!m) return { before: sig, name: '', after: '' }
  return { before: sig.slice(0, m.index), name: m[1], after: sig.slice(m.index + m[1].length) }
}
