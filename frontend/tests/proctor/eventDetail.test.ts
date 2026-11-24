import { describe, expect, it } from './expect.ts'
import { describeEvent, durationText } from '../../src/pages/console/eventDetail.ts'

const d = (o: unknown) => JSON.stringify(o)

describe('describeEvent (카메라 이벤트 세부 문장)', () => {
  it('시선이 기준을 넘은 방향을 퍼센트와 기준으로 말한다', () => {
    expect(describeEvent('GAZE_AWAY', d({ faceCount: 1, yaw: 23, pitch: -4, gazeX: 0.31, gazeY: 0.05 }))).toEqual(['시선이 오른쪽으로 31% 치우침 (기준 45% 넘으면 경고)'])
    expect(describeEvent('GAZE_AWAY', d({ faceCount: 1, gazeX: 0.5, gazeY: 0.05 }))).toEqual(['시선이 오른쪽으로 50% 치우침 (기준 45% 넘으면 경고)'])
    expect(describeEvent('GAZE_AWAY', d({ gazeX: -0.62 }))).toEqual(['시선이 왼쪽으로 62% 치우침 (기준 45% 넘으면 경고)'])
    expect(describeEvent('GAZE_AWAY', d({ gazeX: 0.1, gazeY: 0.6 }))).toEqual(['시선이 아래로 60% 치우침 (기준 45% 넘으면 경고)'])
  })

  it('기준에 못 미쳐도 시선 이벤트면 좌우 값을 말한다 (기준 보정 차이)', () => {
    expect(describeEvent('GAZE_AWAY', d({ gazeX: 0.31 }))).toEqual(['시선이 오른쪽으로 31% 치우침 (기준 45% 넘으면 경고)'])
  })

  it('고개 좌우는 방향 없이 "좌우로"만 쓴다', () => {
    expect(describeEvent('HEAD_TURN', d({ yaw: 23 }))).toEqual(['고개를 좌우로 23° 돌림 (기준 25° 넘으면 경고)'])
    expect(describeEvent('HEAD_TURN', d({ yaw: -31.6 }))).toEqual(['고개를 좌우로 32° 돌림 (기준 25° 넘으면 경고)'])
  })

  it('고개 숙임은 아래로, 반대면 위로 쓴다', () => {
    expect(describeEvent('HEAD_DOWN', d({ pitch: 30 }))).toEqual(['고개를 아래로 30° 숙임 (기준 25° 넘으면 경고)'])
    expect(describeEvent('HEAD_DOWN', d({ pitch: -22 }))).toEqual(['고개를 위로 22° 듦 (기준 20° 넘으면 경고)'])
  })

  it('얼굴 수와 얼굴 없음', () => {
    expect(describeEvent('MULTI_FACE', d({ faceCount: 2 }))).toEqual(['감지된 얼굴 2명'])
    expect(describeEvent('NO_FACE', d({ faceCount: 0 }))).toEqual(['화면에서 얼굴이 감지되지 않음'])
  })

  it('서버가 남기는 연결 끊김은 시간 문장으로 바꾼다', () => {
    expect(describeEvent('CONNECTION_LOST', d({ gapSeconds: 200 }))).toEqual(['연결이 3분 20초 동안 끊겨 있었음'])
    expect(describeEvent('CONNECTION_LOST', d({ gapSeconds: 45 }))).toEqual(['연결이 45초 동안 끊겨 있었음'])
    expect(durationText(120)).toBe('2분')
  })

  it('모르는 키·종류, 깨진 JSON, 값 없음은 아무것도 보여 주지 않는다', () => {
    expect(describeEvent('TORSO_SHIFT', d({ faceCount: 1, yaw: 3, pitch: 1, gazeX: 0.1, gazeY: 0 }))).toEqual([])
    expect(describeEvent('HEAD_TURN', d({ secret: 'x' }))).toEqual([])
    expect(describeEvent('HEAD_TURN', '{깨짐')).toEqual([])
    expect(describeEvent('HEAD_TURN', null)).toEqual([])
    expect(describeEvent('PASTE', d({ length: 120 }))).toEqual([])
  })
})
