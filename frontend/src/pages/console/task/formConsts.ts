// 과제 만들기 폼이 같이 쓰는 상수 (컴포넌트와 따로 둬서 빠른 새로고침이 끊기지 않게)
import type { LucideIcon } from 'lucide-react'
import { USAGE_ICON } from '../../../components/domainIcons'
import { type BatchHours, type GenTrack, type GenUsage, type JobTone } from '../../../data/taskGen'

/** 배치 마감 선택지(화면은 이 목록만 읽는다). 기본값은 data/taskGen.ts 의 DEFAULT_BATCH_HOURS(3). 값이 바뀌면 BatchHours 타입도 같이 고친다 */
export const DEADLINE_OPTIONS: readonly { hours: BatchHours; name: string; hint: string }[] = [
  { hours: 3, name: '보통 · 추천', hint: '비용은 바로 생성의 약 40%예요. 3시간 안에 끝나요' },
  { hours: 6, name: '여유', hint: '6시간 안에 끝나요' },
  { hours: 12, name: '넉넉히', hint: '12시간 안에 끝나요' },
  { hours: 24, name: '하루', hint: '24시간 안에 끝나요' },
]

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


/** 작업 상태 알약 색 */
export const TONE: Record<JobTone, string> = {
  wait: 'bg-panel-raised text-text-muted',
  run: 'bg-brand-dim text-brand',
  batch: 'bg-info/12 text-info',
  done: 'bg-signal/12 text-signal',
  warn: 'bg-caution/12 text-caution',
  fail: 'bg-alert/12 text-alert',
  cancel: 'bg-text/8 text-text-muted',
}

/** 과제 만들기 왼쪽 유리 폼 카드 껍데기 */
export const GEN_CARD = 'glass step-in flex flex-col gap-7 rounded-2xl bg-white/90! p-7 shadow-md!'

/** 목록 행의 상태 점 색 */
export const DOT: Record<JobTone, string> = {
  wait: 'bg-text-faint',
  run: 'bg-brand',
  batch: 'bg-info',
  done: 'bg-signal',
  warn: 'bg-caution',
  fail: 'bg-alert',
  cancel: 'bg-line-strong',
}
