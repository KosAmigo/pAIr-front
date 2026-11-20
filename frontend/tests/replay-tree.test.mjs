import assert from 'node:assert/strict'
import { test } from 'node:test'
import { branchColor, layoutTree, onPathTo } from '../src/lib/replayTree.ts'

const node = (attemptId, parentAttemptId, startedAt, forkedAtTurn = null) => ({
  attemptId, parentAttemptId, forkedAtTurn, forkedFromCheckpointId: parentAttemptId ? 1 : null, status: 'DONE', startedAt,
})

test('children are placed right under their parent in start order, with main/b2/b3 labels', () => {
  // 서버는 층별로(뿌리, 자식들, 손자들) 준다. 화면은 부모 아래에 자식 줄기를 이어서 그린다.
  const rows = layoutTree([
    node('1', null, '2026-11-20T01:00:00Z'),
    node('2', '1', '2026-11-20T01:10:00Z', 3),
    node('3', '1', '2026-11-20T01:20:00Z', 5),
    node('4', '2', '2026-11-20T01:30:00Z', 3),
  ])
  assert.deepEqual(rows.map((r) => r.attemptId), ['1', '2', '4', '3'])
  assert.deepEqual(rows.map((r) => r.label), ['main', 'b2', 'b3', 'b4'])
  assert.deepEqual(rows.map((r) => r.depth), [0, 1, 2, 1])
  assert.equal(rows[2].parentAttemptId, '2')
  assert.equal(rows[2].forkedAtTurn, 3)
})

test('each row keeps the chain of lanes from the root so the graph can color passing lines', () => {
  const rows = layoutTree([node('1', null, 'a'), node('2', '1', 'b', 3), node('3', '2', 'c', 3)])
  assert.deepEqual(rows[2].path, [
    { attemptId: '1', depth: 0, branch: 1 },
    { attemptId: '2', depth: 1, branch: 2 },
    { attemptId: '3', depth: 2, branch: 3 },
  ])
})

test('a single attempt without forks is just main', () => {
  const rows = layoutTree([node('1', null, 'a')])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].label, 'main')
  assert.deepEqual(layoutTree([]), [])
})

test('branch colors cycle through five colors', () => {
  assert.deepEqual([1, 2, 5, 6, 11].map(branchColor), [1, 2, 5, 1, 1])
})

test('path to the current attempt is the root-to-current chain only', () => {
  const rows = layoutTree([node('1', null, 'a'), node('2', '1', 'b', 3), node('3', '1', 'c', 5), node('4', '2', 'd', 3)])
  assert.deepEqual([...onPathTo(rows, '4')].sort(), ['1', '2', '4'])
  assert.deepEqual([...onPathTo(rows, '3')].sort(), ['1', '3'])
})
