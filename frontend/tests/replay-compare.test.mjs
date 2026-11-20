import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collapse, fileChange } from '../src/lib/codeCompare.ts'
import { changeKind, changedItems, commonPrefixLength, shortTurns, sideText } from '../src/lib/replayCompare.ts'

const side = (status, deducted = 0, reason = null) => ({ status, deducted, reason, evidence: [] })
const check = (code, a, b, changed) => ({ code, label: code, method: 'JUDGE', points: 3, a, b, changed })

test('less deduction in B is an improvement, more is worse, same deduction with another status is just changed', () => {
  assert.equal(changeKind(check('C1', side('DEDUCTED', 3), side('PASSED'), true)), 'improved')
  assert.equal(changeKind(check('C2', side('PASSED'), side('DEDUCTED', 2), true)), 'worsened')
  assert.equal(changeKind(check('C3', side('PASSED'), side('SKIPPED'), true)), 'changed')
  // 한쪽 리포트에 없는 체크는 감점 0 으로 본다
  assert.equal(changeKind(check('C4', null, side('DEDUCTED', 1), true)), 'worsened')
})

test('a side is described by status and deduction', () => {
  assert.equal(sideText(side('DEDUCTED', 3)), '감점 −3')
  assert.equal(sideText(side('PASSED')), '통과')
  assert.equal(sideText(side('SPLIT', 2)), '판정 엇갈림 −2')
  assert.equal(sideText(null), '없음')
})

test('only items with a changed check or a different score are kept, with improvements listed first', () => {
  const items = [
    { key: 'same', name: '같음', max: 10, a: 5, b: 5, checks: [check('X', side('PASSED'), side('PASSED'), false)] },
    {
      key: 'control', name: '통제', max: 20, a: 12, b: 18,
      checks: [
        check('C2', side('PASSED'), side('DEDUCTED', 2), true),
        check('C1', side('DEDUCTED', 3), side('PASSED'), true),
        check('C9', side('PASSED'), side('PASSED'), false),
      ],
    },
    { key: 'scoreOnly', name: '점수만', max: 10, a: 4, b: 6, checks: [] },
  ]
  const out = changedItems(items)
  assert.deepEqual(out.map((i) => i.key), ['control', 'scoreOnly'])
  assert.deepEqual(out[0].checks.map((c) => c.code), ['C1', 'C2'])
})

test('turn labels are shortened inside sentences', () => {
  assert.equal(shortTurns('#T03'), 'T3')
  assert.equal(shortTurns('#T10 에서 #T05 로'), 'T10 에서 T5 로')
  assert.equal(shortTurns('RUN 2회'), 'RUN 2회')
})

test('the shared start of two conversations is counted until the first difference', () => {
  const t = (turn, role, text) => ({ turn, role, text, time: '' })
  const a = [t(1, 'user', 'q1'), t(2, 'ai', 'a1'), t(3, 'user', '버그 고쳐줘'), t(4, 'ai', '락 순서를 바꾸세요')]
  const b = [t(1, 'user', 'q1'), t(2, 'ai', 'a1'), t(3, 'user', '정렬해서 고치는 방법은?')]
  assert.equal(commonPrefixLength(a, b), 2)
  assert.equal(commonPrefixLength(a, a), 4)
  assert.equal(commonPrefixLength(a, []), 0)
  assert.equal(commonPrefixLength([t(1, 'user', 'x')], [t(1, 'user', 'y')]), 0)
})

test('unchanged lines far from a change are folded into a skip marker', () => {
  const same = (t) => ({ kind: 'same', text: t })
  const lines = [...Array.from({ length: 10 }, (_, i) => same(`a${i}`)), { kind: 'add', text: 'new' }, ...Array.from({ length: 10 }, (_, i) => same(`b${i}`))]
  const out = collapse(lines, 2)
  assert.deepEqual(out.map((l) => l.kind), ['skip', 'same', 'same', 'add', 'same', 'same', 'skip'])
  assert.equal(out[0].skipped, 8)
  assert.equal(out[6].skipped, 8)
  assert.deepEqual(collapse([same('x'), same('y')], 3), [{ kind: 'skip', skipped: 2 }])
})

test('a file pair becomes added, removed or modified with line counts', () => {
  const m = fileChange({ path: 'A.java', a: 'x\ny\nz', b: 'x\nY\nz\nw' })
  assert.equal(m.status, 'modified')
  assert.deepEqual([m.add, m.del], [2, 1])
  assert.equal(fileChange({ path: 'N.java', a: null, b: 'class N {}\n' }).status, 'added')
  assert.equal(fileChange({ path: 'N.java', a: null, b: 'l1\nl2' }).add, 2)
  const r = fileChange({ path: 'O.java', a: 'old', b: null })
  assert.deepEqual([r.status, r.add, r.del], ['removed', 0, 1])
})

test('very large files skip the line comparison', () => {
  const big = Array.from({ length: 2500 }, (_, i) => `line ${i}`).join('\n')
  const other = Array.from({ length: 2500 }, (_, i) => `row ${i}`).join('\n')
  const c = fileChange({ path: 'Big.java', a: big, b: other })
  assert.equal(c.tooLarge, true)
  assert.deepEqual(c.lines, [])
})
