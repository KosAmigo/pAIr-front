// 선택형 칸(직군·용도·제한 시간·추천 카드)의 공통 모양.
// 안 고른 칸은 옅은 회색 바탕 + 분명한 테두리, 고른 칸은 브랜드색 바탕·2px 테두리·브랜드색 글자.
// 테두리는 항상 2px 라서 고르면 크기가 흔들리지 않는다.
export const CHOICE_BASE =
  'border-2 transition-[border-color,background-color,color,box-shadow] duration-150 outline-none focus-visible:ring-4 focus-visible:ring-brand/30'
export const CHOICE_OFF = 'border-line-strong bg-panel-raised text-text hover:border-brand/60 hover:bg-brand-dim focus-visible:border-brand'
export const CHOICE_ON = 'border-brand bg-brand-dim text-brand'

export const choiceClass = (on: boolean) => `${CHOICE_BASE} ${on ? CHOICE_ON : CHOICE_OFF}`
