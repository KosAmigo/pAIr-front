import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dotColumn, labelEvery, laneDots, maxCheckpointTurn, stageCols, stageGap } from '../src/lib/branchDots.ts'

const cp = (turnNo, id = turnNo) => ({ checkpointId: id, turnNo, label: null, createdAt: '2026-11-20T00:00:00Z' })

test('the stage keeps at least six columns and leaves room after the last fork and the last question', () => {
  assert.equal(stageCols(1, 0), 6)
  assert.equal(stageCols(7, 3), 9)
  assert.equal(stageCols(3, 20), 21)
})

test('the column gap stays 72 up to twelve columns, then shrinks but never below 44', () => {
  assert.equal(stageGap(6), 72)
  assert.equal(stageGap(12), 72)
  assert.equal(stageGap(18), 48)
  assert.equal(stageGap(41), 44)
})

test('turn names are thinned out only when the columns are narrow', () => {
  assert.equal(labelEvery(72), 1)
  assert.equal(labelEvery(44), 2)
})

test('a lane shows dots only for its own questions, in turn order', () => {
  // 질문 3 에서 갈라진 갈래는 앞 대화(1~2)를 복사해 갔을 뿐이라, 3 이후의 질문만 점이 된다
  assert.deepEqual(laneDots(3, [cp(5), cp(3), cp(1)]).map((c) => c.turnNo), [3, 5])
  assert.deepEqual(laneDots(1, [cp(3), cp(1)]).map((c) => c.turnNo), [1, 3])
  assert.deepEqual(laneDots(3, []), [])
})

test('the latest checkpoint turn across lanes', () => {
  assert.equal(maxCheckpointTurn({}), 0)
  assert.equal(maxCheckpointTurn({ a: [cp(1), cp(9)], b: [cp(5)] }), 9)
})

test('only a fork that starts at question 1 shifts its first dot to the T02 column; the root lane keeps T01', () => {
  assert.equal(dotColumn(1, false, 1), 1) // 뿌리 갈래: 선이 T01 에서 시작한다
  assert.equal(dotColumn(1, false, 3), 3)
  assert.equal(dotColumn(1, true, 1), 2) // 질문 1에서 갈라진 갈래: 선이 T02 에서 시작한다
  assert.equal(dotColumn(1, true, 3), 3)
  assert.equal(dotColumn(3, true, 3), 3) // 질문 3에서 갈라진 갈래: 갈라진 칸 그대로
})
