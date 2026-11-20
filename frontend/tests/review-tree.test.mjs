import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assignSlot, commonAncestor, divergeTurn, groupByTask, layoutLanes, pickDefaults, resolveSelection, routeIds, SPARK_MAX } from '../src/lib/reviewTree.ts'

const att = (id, taskId, startedAt, total = null, status = 'DONE') => ({ id, taskId, taskTitle: `과제 ${taskId}`, taskType: 'dev', startedAt, status, total })
const score = (total) => (total == null ? null : { total, max: 100, items: [] })
const node = (attemptId, parentAttemptId, startedAt, forkedAtTurn, total) => ({
  attemptId, parentAttemptId, forkedAtTurn, forkedFromCheckpointId: parentAttemptId ? 1 : null, status: 'DONE', startedAt, score: score(total),
})

test('attempts are grouped by task, newest task first, with count, best and spark scores', () => {
  const groups = groupByTask([
    att('a1', 't1', '2026-11-10T01:00:00Z', 60),
    att('a2', 't1', '2026-11-12T01:00:00Z', 80),
    att('a3', 't1', '2026-11-13T01:00:00Z', null, 'SOLVING'),
    att('b1', 't2', '2026-11-20T01:00:00Z', 50),
  ])
  assert.deepEqual(groups.map((g) => g.taskId), ['t2', 't1'])
  const g = groups[1]
  assert.equal(g.count, 3)
  assert.equal(g.best, 80)
  assert.deepEqual(g.scores, [60, 80])
  assert.equal(g.newestId, 'a3')
  assert.equal(g.newestScoredId, 'a2')
  assert.equal(g.title, '과제 t1')
})

test('spark keeps only the latest scored attempts and a task with no score has no best', () => {
  const many = Array.from({ length: 9 }, (_, i) => att(`x${i}`, 't', `2026-11-0${i + 1}T00:00:00Z`, 10 + i))
  assert.equal(groupByTask(many)[0].scores.length, SPARK_MAX)
  assert.equal(groupByTask(many)[0].scores.at(-1), 18)
  const none = groupByTask([att('n', 't', '2026-11-01T00:00:00Z', null, 'ERROR')])
  assert.equal(none[0].best, null)
  assert.equal(none[0].newestScoredId, null)
})

// 1(뿌리) - 2(T3) - 4(T6)
//   +- 3(T5)
const nodes = () => [
  node('1', null, '2026-11-12T01:00:00Z', null, 65),
  node('2', '1', '2026-11-13T01:00:00Z', 3, 81),
  node('3', '1', '2026-11-14T01:00:00Z', 5, 50),
  node('4', '2', '2026-11-15T01:00:00Z', 6, 94),
]

test('layout gives one lane per attempt with fork turn, parent lane, delta and names', () => {
  const { lanes, lastFork } = layoutLanes(nodes())
  assert.deepEqual(lanes.map((l) => l.attemptId), ['1', '2', '4', '3'])
  assert.deepEqual(lanes.map((l) => l.lane), [0, 1, 2, 3])
  assert.deepEqual(lanes.map((l) => l.startTurn), [1, 3, 6, 5])
  assert.deepEqual(lanes.map((l) => l.parentLane), [null, 0, 1, 0])
  assert.deepEqual(lanes.map((l) => l.delta), [null, 16, 13, -15])
  assert.deepEqual(lanes.map((l) => l.name), ['처음 풀이', '갈래 2', '갈래 3', '갈래 4'])
  assert.equal(lastFork, 6)
})

test('delta is null when either side has no score, and several roots get their own root index', () => {
  const { lanes } = layoutLanes([node('1', null, 'a', null, 60), node('2', '1', 'b', 2, null), node('9', null, 'c', null, 70)])
  assert.equal(lanes.find((l) => l.attemptId === '2').delta, null)
  assert.deepEqual(lanes.map((l) => l.root), [0, 0, 1])
})

test('common ancestor and A-B route: lanes below the shared ancestor on both sides', () => {
  const { lanes } = layoutLanes(nodes())
  assert.equal(commonAncestor(lanes, '4', '3'), '1')
  assert.equal(commonAncestor(lanes, '4', '2'), '2') // 자기 자신도 조상
  assert.deepEqual([...routeIds(lanes, '4', '3')].sort(), ['2', '3', '4'])
  assert.deepEqual([...routeIds(lanes, '4', '2')].sort(), ['4'])
  assert.equal(commonAncestor(lanes, '4', 'nope'), null)
})

test('the diverge turn is the earliest fork below the common ancestor', () => {
  const { lanes } = layoutLanes(nodes())
  assert.equal(divergeTurn(lanes, '4', '3'), 3) // 2번이 T3, 3번이 T5 에서 갈라짐 -> 먼저 갈라진 T3
  assert.equal(divergeTurn(lanes, '4', '2'), 6)
  assert.equal(divergeTurn(lanes, '1', '1'), null)
})

test('defaults: B is the newest scored attempt, A its parent; falls back to the next newest scored', () => {
  assert.deepEqual(pickDefaults(layoutLanes(nodes()).lanes), { a: '2', b: '4' })
  // 부모가 채점 전이면 그다음으로 최근 채점 응시
  const unscoredParent = layoutLanes([node('1', null, '2026-11-12T00:00:00Z', null, 65), node('2', '1', '2026-11-13T00:00:00Z', 3, null), node('3', '2', '2026-11-14T00:00:00Z', 4, 90)])
  assert.deepEqual(pickDefaults(unscoredParent.lanes), { a: '1', b: '3' })
})

test('defaults: one scored attempt fills only A, none fills nothing', () => {
  assert.deepEqual(pickDefaults(layoutLanes([node('1', null, 'a', null, 65)]).lanes), { a: '1', b: null })
  assert.deepEqual(pickDefaults(layoutLanes([node('1', null, 'a', null, null)]).lanes), { a: null, b: null })
  assert.deepEqual(pickDefaults([]), { a: null, b: null })
})

test('picking fills the current slot then hands over; the same attempt cannot take both slots', () => {
  let r = assignSlot({ a: '1', b: '2' }, 'a', '3')
  assert.deepEqual(r, { sel: { a: '3', b: '2' }, slot: 'b' })
  r = assignSlot(r.sel, r.slot, '3') // B 슬롯인데 A 와 같은 응시
  assert.deepEqual(r, { sel: { a: '3', b: '2' }, slot: 'b' })
})

test('the address picks are kept when valid and filled in by the default rules when partial or wrong', () => {
  const { lanes } = layoutLanes(nodes())
  assert.deepEqual(resolveSelection(lanes, '3', '4'), { a: '3', b: '4' })
  assert.deepEqual(resolveSelection(lanes, null, '4'), { a: '2', b: '4' }) // B 의 부모
  assert.deepEqual(resolveSelection(lanes, null, '3'), { a: '1', b: '3' })
  assert.deepEqual(resolveSelection(lanes, '1', null), { a: '1', b: '4' }) // 가장 최근 다른 응시
  assert.deepEqual(resolveSelection(lanes, 'nope', 'gone'), { a: '2', b: '4' })
  assert.deepEqual(resolveSelection(lanes, '4', '4'), { a: '2', b: '4' })
  assert.deepEqual(resolveSelection(layoutLanes([node('1', null, 'a', null, 65)]).lanes, null, '1'), { a: '1', b: null })
})
