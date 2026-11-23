// 직군 강조색: 개발 = branch-2(파랑), 비개발 = comp-6(청록). 상태 색(검수 전 caution, 자가진단 brand, 실전 text)과 섞지 않는다.
import type { Track } from '../../../data/taskBoard'

export const TRACK_TONE: Record<Track, { tile: string; text: string; ring: string }> = {
  DEV: { tile: 'bg-branch-2/10 text-branch-2', text: 'text-branch-2', ring: 'ring-branch-2/25' },
  BIZ: { tile: 'bg-comp-6/10 text-comp-6', text: 'text-comp-6', ring: 'ring-comp-6/25' },
}
