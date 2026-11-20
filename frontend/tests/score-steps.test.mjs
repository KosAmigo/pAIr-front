import assert from 'node:assert/strict'
import { test } from 'node:test'
import { biggestMover, buildScoreSteps, itemChanges } from '../src/lib/scoreSteps.ts'

const side = (status, deducted = 0) => ({ status, deducted, reason: null, evidence: [] })
const check = (code, a, b, changed = true) => ({ code, label: `체크 ${code}`, method: 'JUDGE', points: 5, a, b, changed })
const item = (key, name, a, b, checks) => ({ key, name, max: 20, a, b, checks })

const compare = {
  a: 'A',
  b: 'B',
  items: [
    item('usage', '활용', 10, 13, [check('U1', side('DEDUCTED', 3), side('PASSED')), check('U2', side('PASSED'), side('PASSED'), false)]),
    item('control', '통제', 12, 9, [check('C1', side('PASSED'), side('DEDUCTED', 3))]),
    item('delivery', '도출', 20, 30, [check('V1', side('DEDUCTED', 10), side('PASSED')), check('V9', side('PASSED'), side('SKIPPED'))]),
  ],
}

test('steps list improvements first (biggest first), then worsened ones, and the sum equals B - A', () => {
  const r = buildScoreSteps(compare, 60, 70)
  assert.deepEqual(r.steps.map((s) => s.code), ['V1', 'U1', 'C1'])
  assert.deepEqual(r.steps.map((s) => s.delta), [10, 3, -3])
  assert.deepEqual(r.steps.map((s) => s.kind), ['up', 'up', 'down'])
  assert.equal(r.rest, 0)
  assert.equal(r.steps.reduce((n, s) => n + s.delta, 0), 70 - 60)
})

test('each step starts where the previous one ended, from A to B', () => {
  const r = buildScoreSteps(compare, 60, 70)
  assert.equal(r.steps[0].from, 60)
  for (let i = 1; i < r.steps.length; i++) assert.equal(r.steps[i].from, r.steps[i - 1].to)
  assert.equal(r.steps.at(-1).to, 70)
})

test('checks whose status changed but not the deduction are not steps', () => {
  const r = buildScoreSteps(compare, 60, 70)
  assert.ok(!r.steps.some((s) => s.code === 'V9' || s.code === 'U2'))
})

test('when the steps do not reach B, a grey rest row closes the gap (sum still equals B - A)', () => {
  const r = buildScoreSteps(compare, 60, 75)
  assert.equal(r.rest, 5)
  const last = r.steps.at(-1)
  assert.equal(last.kind, 'rest')
  assert.equal(last.label, '기타 차이')
  assert.equal(last.to, 75)
  assert.equal(r.steps.reduce((n, s) => n + s.delta, 0), 15)
  // 반대로 초과하면 음수 기타 차이
  assert.equal(buildScoreSteps(compare, 60, 66).rest, -4)
})

test('a check that exists on one side only counts the missing side as zero deduction', () => {
  const r = buildScoreSteps({ a: 'A', b: 'B', items: [item('x', 'X', 5, 2, [check('N1', null, side('DEDUCTED', 3))])] }, 50, 47)
  assert.deepEqual(r.steps.map((s) => [s.code, s.delta]), [['N1', -3]])
})

test('no changed check and equal totals gives no rows', () => {
  const r = buildScoreSteps({ a: 'A', b: 'B', items: [item('x', 'X', 5, 5, [check('Z', side('PASSED'), side('PASSED'), false)])] }, 80, 80)
  assert.deepEqual(r.steps, [])
  assert.equal(r.rest, 0)
})

test('item changes are sorted by size and the biggest mover follows the direction of the total', () => {
  const ch = itemChanges(compare.items)
  assert.deepEqual(ch.map((c) => [c.key, c.diff]), [['delivery', 10], ['usage', 3], ['control', -3]])
  assert.equal(biggestMover(ch, 10).key, 'delivery')
  assert.equal(biggestMover(ch, -4).key, 'control')
  assert.equal(biggestMover(itemChanges([item('x', 'X', 5, 5, [])]), 0), null)
})
