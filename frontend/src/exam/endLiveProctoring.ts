import { camHub } from '../proctor/camHub.ts'
import { clearLiveExam } from '../proctor/liveExam.ts'

/** 실전 시험이 끝나면 카메라·휴대폰 연결을 끄고 실전 맥락을 지운다 */
export async function endLiveProctoring() {
  clearLiveExam()
  await camHub.stop()
}
