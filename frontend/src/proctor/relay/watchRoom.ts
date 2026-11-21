// 응시자 한 명을 지금 보고 있는 감독관 모음 (순수 함수, 개발 릴레이·운영 백엔드가 같은 규칙을 쓴다).
// 감독관은 한 번에 응시자 한 명만 보고, 응시자 한 명은 동시에 MAX_VIEWERS_PER_PARTICIPANT 명까지만 볼 수 있다.
// 응시자 PC 는 감독관마다 영상을 따로 인코딩하므로 이 상한이 PC 부하의 상한이다.

/** 응시자 1명을 동시에 볼 수 있는 감독관 수 (상수 한곳) */
export const MAX_VIEWERS_PER_PARTICIPANT = 2

export type WatchRoom = readonly string[]

export const EMPTY_ROOM: WatchRoom = []

export type JoinResult = { room: WatchRoom; result: 'joined' | 'already' | 'full' }

/** 감독관 입장. 이미 들어와 있으면 그대로, 정원이 차면 거절한다 */
export function joinRoom(room: WatchRoom, viewerId: string, max = MAX_VIEWERS_PER_PARTICIPANT): JoinResult {
  if (room.includes(viewerId)) return { room, result: 'already' }
  if (room.length >= max) return { room, result: 'full' }
  return { room: [...room, viewerId], result: 'joined' }
}

export function leaveRoom(room: WatchRoom, viewerId: string): WatchRoom {
  return room.includes(viewerId) ? room.filter((v) => v !== viewerId) : room
}
