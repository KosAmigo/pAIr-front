import { CircleCheck } from 'lucide-react'
import { ButtonLink, Logo } from '../components/ui'
import { examInfo } from '../data/mock'

// DESIGN.md §7 제출 완료 안내
export default function Submitted() {
  return (
    <div className="flex min-h-full flex-col border-t-2 border-alert">
      <header className="flex h-14 items-center border-b border-line px-8">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center p-12">
        <section className="step-in w-[560px] rounded-md border border-line bg-panel">
          <header className="flex h-10 items-center border-b border-line px-4">
            <span className="label">SUBMISSION</span>
          </header>
          <div className="flex flex-col items-center px-10 py-12 text-center">
            <CircleCheck size={40} strokeWidth={1.75} className="text-signal" aria-hidden />
            <h1 className="mt-4 text-[24px] leading-8 font-bold">제출이 완료되었습니다</h1>
            <dl className="mt-8 grid w-full grid-cols-[120px_1fr] gap-y-3 rounded-md border border-line bg-panel-raised p-4 text-left">
              <dt className="label self-center">SUBMITTED AT</dt>
              <dd className="tnum font-mono text-[15px]">2026.11.10 16:00:00</dd>
              <dt className="label self-center">SEAT NO.</dt>
              <dd className="font-mono text-[15px]">{examInfo.seat}</dd>
              <dt className="label self-center">EXAM</dt>
              <dd className="text-[15px]">{examInfo.title}</dd>
            </dl>
            <p className="mt-6 text-[16px] leading-6 text-text-muted">
              결과는 기업을 통해 안내됩니다.
              <br />이 시험은 복기를 제공하지 않습니다.
            </p>
            <ButtonLink to="/" variant="secondary" className="mt-8">
              처음으로
            </ButtonLink>
          </div>
        </section>
      </main>
    </div>
  )
}
