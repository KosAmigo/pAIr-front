import assert from 'node:assert/strict'
import { test } from 'node:test'
import { topHabits } from '../src/lib/habits.ts'

const chk = (code, deducted, itemKey = 'usage') => ({ itemKey, code, label: `라벨 ${code}`, deducted })
const att = (id, checks, taskId = 't1') => ({ id, taskId, checks })

test('habits are counted by code, ordered by hits then by points lost, top 3 only', () => {
  const list = [
    att('1', [chk('U1', 3), chk('C1', 4, 'control'), chk('V1', 10, 'delivery')]),
    att('2', [chk('U1', 3), chk('C1', 4, 'control')]),
    att('3', [chk('U1', 3), chk('P1', 1, 'potential')]),
    att('4', [chk('D1', 2, 'decomposition')]),
  ]
  const top = topHabits(list)
  assert.deepEqual(top.map((h) => h.code), ['U1', 'C1', 'V1'])
  assert.deepEqual(top.map((h) => h.hits), [3, 2, 1])
  assert.deepEqual(top.map((h) => h.sum), [9, 8, 10])
  assert.ok(top.every((h) => h.of === 4))
  assert.equal(top[0].itemKey, 'usage')
})

test('checks with no deduction are ignored and no deduction at all gives an empty list', () => {
  assert.deepEqual(topHabits([att('1', [chk('U1', 0), chk('C1', 0)])]), [])
  assert.deepEqual(topHabits([]), [])
})

test('the latest attempt that hit the habit is remembered for the review link', () => {
  const top = topHabits([att('old', [chk('U1', 3)], 'ta'), att('mid', [chk('X', 1)], 'tb'), att('new', [chk('U1', 3)], 'tc')])
  assert.equal(top[0].code, 'U1')
  assert.equal(top[0].latestAttemptId, 'new')
  assert.equal(top[0].latestTaskId, 'tc')
})

test('ties on hits fall back to points lost, then to code order', () => {
  const top = topHabits([att('1', [chk('B1', 2), chk('A1', 2), chk('Z1', 5)])])
  assert.deepEqual(top.map((h) => h.code), ['Z1', 'A1', 'B1'])
})
