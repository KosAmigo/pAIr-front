import { Smartphone } from 'lucide-react'
import { StatusDot } from '../../components/ui'
import { PhoneVideo } from './PhoneVideo.tsx'
import { ServerCheckCard } from './ServerCheckCard.tsx'
import { useCamHub } from './useCamHub.ts'

/**
 * 개발 서버는 자체 서명 HTTPS 라서 휴대폰에서 "안전하지 않음" 경고 화면이 먼저 열린다.
 * 개발 서버이거나 VITE_SHOW_CERT_NOTICE=true 로 빌드했을 때만 안내한다 (정식 인증서를 쓰는 배포에서는 경고가 없다).
 */
const SHOW_CERT_NOTICE = import.meta.env.DEV || import.meta.env.VITE_SHOW_CERT_NOTICE === 'true'

/** 휴대폰 보조 캠 연결: QR 과 연결 상태 */
export function PhonePairCard() {
  const { phone, phoneQr, phoneAnalysis, relayOpen, serverMode } = useCamHub()
  const connected = phone === 'connected'
  const analysisText =
    phoneAnalysis.status === 'monitoring'
      ? `감시 중 · ${phoneAnalysis.fps} FPS · 손 ${phoneAnalysis.handCount}개`
      : phoneAnalysis.status === 'calibrating' || phoneAnalysis.status === 'loading'
        ? '기준 위치 잡는 중'
        : phoneAnalysis.status === 'error'
          ? (phoneAnalysis.error ?? '확인 필요')
          : '이 화면의 안내를 따라 주세요'
  return (
    <section className="rounded-xl border border-line bg-panel p-4" aria-labelledby="phone-pair-title">
      <div className="flex items-center gap-2">
        <Smartphone size={18} className="text-brand" aria-hidden />
        <h3 id="phone-pair-title" className="text-[15px] font-semibold">
          휴대폰 보조 카메라
        </h3>
        <span className="ml-auto">
          <StatusDot status={connected ? 'ok' : phone === 'stale' ? 'check' : 'down'} label={connected ? '연결됨' : phone === 'stale' ? '응답 없음' : '미연결'} />
        </span>
      </div>
      {connected ? (
        serverMode ? (
          // 서버 모드: 휴대폰 영상은 보여 주지 않고 서버 판정 체크리스트만 보여 준다
          <ServerCheckCard />
        ) : (
          <>
            <p className="mt-2 text-[13px] text-text-muted">{analysisText}</p>
            <PhoneVideo />
          </>
        )
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-[132px] shrink-0 items-center justify-center rounded-lg border border-line bg-white p-1.5">
              {phoneQr ? <img src={phoneQr} alt="휴대폰 연결 QR 코드" className="size-full" /> : <span className="text-[12px] text-text-muted">{relayOpen ? 'QR 만드는 중' : '서버 연결 중'}</span>}
            </div>
            <p className="min-w-0 text-[14px] leading-6 font-semibold break-keep text-text">휴대폰 카메라로 QR 코드를 찍어 주세요.</p>
          </div>
          <div className="text-[13px] leading-5 text-text-muted">
            <p className="break-keep">휴대폰은 옆이나 뒤에 세워 두 손·키보드·시험 화면이 함께 보이게 놓습니다.</p>
            <p className="mt-1 break-keep">같은 와이파이가 아니어도 연결됩니다. {serverMode ? '휴대폰 영상은 화면에 표시되지 않습니다.' : '사진은 서버가 저장하지 않고 PC 로만 넘겨 줍니다.'}</p>
          </div>
          {SHOW_CERT_NOTICE && (
            <div role="note" className="rounded-lg border border-caution/40 bg-caution/10 px-3 py-2.5 text-[13px] leading-5 text-text">
              <p className="font-semibold">&quot;안전하지 않음&quot; 화면이 나오면</p>
              <p className="mt-1 break-keep">보안 경고 화면이 먼저 열릴 수 있습니다. 아래 순서로 계속 진행해 주세요.</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 break-keep">
                <li>
                  안드로이드(크롬): <b>고급</b> → <b>안전하지 않음으로 이동</b>
                </li>
                <li>
                  아이폰(사파리): <b>세부사항 보기</b> → <b>이 웹 사이트 방문</b>
                </li>
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
