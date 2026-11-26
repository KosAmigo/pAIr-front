// 과제 만들기 폼이 같이 쓰는 상수 (컴포넌트와 따로 둬서 빠른 새로고침이 끊기지 않게)
import type { LucideIcon } from 'lucide-react'
import { USAGE_ICON } from '../../../components/domainIcons'
import type { GenTrack, GenUsage } from '../../../data/taskGen'

export const inputCls =
  'w-full rounded-lg border border-line-strong bg-panel px-3.5 text-[15px] text-text outline-none transition-[border-color,box-shadow] focus:border-brand focus:shadow-[0_0_0_3px_rgb(108_71_255/0.15)]'

export const TRACKS: { value: GenTrack; title: string; desc: string }[] = [
  { value: 'DEV', title: '개발', desc: '시작 코드와 공개·숨은 테스트를 만들어요' },
  { value: 'BIZ', title: '비개발', desc: 'PDF 자료, CSV와 객관식·단답형 문항을 만들어요' },
]
export const USAGES: { value: GenUsage; title: string; desc: string; icon: LucideIcon }[] = [
  { value: 'SELF', title: '자가진단', desc: '누구나 자가진단에서 풀어요', icon: USAGE_ICON.SELF },
  { value: 'LIVE', title: '실전', desc: '기업 회차에만 써요', icon: USAGE_ICON.LIVE },
]

