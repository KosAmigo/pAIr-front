import { checkItemsFrom } from '../core/visionContract.ts'
import { CheckList } from './CheckList.tsx'
import { useCamHub } from './useCamHub.ts'

/** 서버 추론 감독의 입장 점검 체크리스트. 영상 없이 서버가 돌려준 판정 결과만 보여 준다 */
export function ServerCheckCard() {
  const { phone, visionCheck } = useCamHub()
  const items = checkItemsFrom(visionCheck, phone === 'connected')
  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="server-check-card">
      <p className="text-[13px] leading-5 break-keep text-text-muted">
        휴대폰 영상은 화면에 표시되지 않습니다. 아래 항목이 모두 인식될 때까지 키보드와 마우스 위에 두 손을 올리고 기다려 주세요.
      </p>
      <CheckList items={items} />
    </div>
  )
}
