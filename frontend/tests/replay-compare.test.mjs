import assert from 'node:assert/strict'
import { test } from 'node:test'
import { changeKind, changedItems, sideText } from '../src/lib/replayCompare.ts'

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
