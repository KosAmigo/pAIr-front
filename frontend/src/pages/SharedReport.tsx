// 리포트 공유 보기 (기획_결정사항 §3). 로그인 없이 링크로 들어온 사람이 그 리포트만 읽기 전용으로 본다.
// 공유를 끄거나 다시 켜면(새 토큰) 이 링크는 더 이상 열리지 않는다.
import { Link, useParams } from 'react-router-dom'
import { Eye, Link2Off } from 'lucide-react'
import { Logo } from '../components/ui'
import { Aurora } from '../components/fx'
import { attemptOfShare } from '../data/shares'
import { MockReportContent } from './Report'

export default function SharedReport() {
  const { token = '' } = useParams()
  const attemptId = attemptOfShare(token)
  return (
    <div className="relative isolate flex min-h-full flex-col">
      <Aurora variant="band" className="h-[360px]" />
      <header className="glass relative z-20 flex h-14 shrink-0 items-center gap-3 rounded-none! border-0! border-b! border-line/70! px-8 shadow-none!">
        <Logo />
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-brand-dim px-2.5 text-[13px] font-semibold text-brand">
          <Eye size={14} aria-hidden /> 공유된 리포트 (읽기 전용)
        </span>
      </header>
      <main className="relative z-10 flex-1">
        {attemptId ? (
          <MockReportContent readOnly />
        ) : (
          <div className="flex flex-col items-center gap-3 py-32 text-center">
            <Link2Off size={28} className="text-text-faint" aria-hidden />
            <p className="text-[16px] font-semibold text-text">열 수 없는 공유 링크입니다</p>
            <p className="text-[14px] text-text-muted">공유가 꺼졌거나 새 링크로 바뀌었습니다. 리포트 주인에게 새 링크를 받으세요.</p>
            <Link to="/" className="mt-2 text-[14px] font-semibold text-brand hover:underline">
              pAIr 알아보기
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
