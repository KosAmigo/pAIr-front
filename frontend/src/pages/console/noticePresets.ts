// 감독관이 응시자에게 보내는 경고 메시지의 준비된 문구와 입력 검사.

/** 서버(NoticeService.MAX_LENGTH)와 같은 한도 */
export const NOTICE_MAX = 500

export const NOTICE_PRESETS: readonly string[] = [
  '시선이 화면 밖으로 자주 벗어납니다. 화면을 바라보고 시험을 진행해 주세요.',
  '고개를 자주 돌리고 있습니다. 정면을 바라봐 주세요.',
  '카메라에 얼굴이 보이지 않습니다. 카메라 앞으로 와 주세요.',
  '다른 사람이 화면에 보입니다. 혼자 시험을 진행해 주세요.',
]

/** 보낼 문구로 쓸 수 있으면 다듬은 문구, 아니면 null */
export function normalizeNotice(text: string): string | null {
  const t = text.trim()
  return t.length === 0 || t.length > NOTICE_MAX ? null : t
}
