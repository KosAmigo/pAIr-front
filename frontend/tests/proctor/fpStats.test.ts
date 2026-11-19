// 오탐률 집계: 조건·기준값 버전별 분당 오탐, CSV
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runsCsv, summarize, thresholdsVersion, type FpRun } from '../../src/proctor/core/fpStats.ts'
import { PC_THRESHOLDS } from '../../src/proctor/core/pcRules.ts'

const run = (over: Partial<FpRun>): FpRun => ({
  id: 'r',
  at: '2026-11-19T06:00:00Z',
  condition: { lighting: 'normal', angle: 'front', eyewear: 'none' },
  durationSec: 120,
  counts: {},
  version: 'v-a',
  ...over,
})

describe('오탐률 집계', () => {
  it('같은 버전·조건끼리 합쳐 분당 오탐을 낸다. 규칙별로도 나눈다', () => {
    const rows = summarize([
      run({ counts: { head_turn: 2 } }),
      run({ durationSec: 60, counts: { head_turn: 1, gaze_away: 3 } }),
      run({ condition: { lighting: 'dim', angle: 'front', eyewear: 'glasses' }, counts: { no_face: 4 } }),
      run({ durationSec: 0, counts: { no_face: 9 } }), // 감시 시간 0 은 뺀다
    ])
    assert.equal(rows.length, 2)
    const dim = rows.find((r) => r.condition.lighting === 'dim')!
    assert.equal(dim.perMinute, 2)
    const normal = rows.find((r) => r.condition.lighting === 'normal')!
    assert.equal(normal.runs, 2)
    assert.equal(normal.minutes, 3)
    assert.equal(normal.falsePositives, 6)
    assert.equal(normal.perMinute, 2)
    assert.equal(normal.byRule.head_turn, 1)
    assert.equal(normal.byRule.gaze_away, 1)
  })

  it('기준값을 바꾸면 버전이 달라져 전후가 따로 묶인다', () => {
    const before = thresholdsVersion(PC_THRESHOLDS)
    const after = thresholdsVersion({ ...PC_THRESHOLDS, yawDeg: PC_THRESHOLDS.yawDeg + 5 })
    assert.notEqual(before, after)
    assert.equal(before, thresholdsVersion({ ...PC_THRESHOLDS }))
    const rows = summarize([run({ version: before, counts: { head_turn: 4 } }), run({ version: after, counts: { head_turn: 1 } })])
    assert.deepEqual(rows.map((r) => r.perMinute).sort(), [0.5, 2])
  })

  it('CSV 는 BOM, 규칙별 열, 수식 주입 방지', () => {
    const csv = runsCsv([run({ counts: { head_turn: 2 }, note: '=cmd' })], ['head_turn', 'no_face'])
    assert.ok(csv.startsWith('﻿측정 시각,기준값,조명'))
    assert.ok(csv.includes(",2,2,0,'=cmd"))
  })
})
