// DESIGN.md §7-9-1 검수 대기 탭 (2026-11-19 개편): 이 화면의 스포트라이트.
// 초안마다 "AI 생성 → 사람 검수 → 공개" 3단계 진행 줄을 보여 주고, 지금 단계(검수)를 caution 으로 짚는다.
import { Link } from 'react-router-dom'
import { ArrowRight, Check, FileCode2, ListChecks } from 'lucide-react'
import { cx } from '../../components/cx'
import { GradientText, StageSection } from '../../components/fx'
import { ButtonLink } from '../../components/ui'
import { KindTile, LevelPips } from '../../components/taskKind'
import { kindName, type CTask } from '../../data/consoleTasks'
import { RowMenu } from './common'
import { fmtTime } from './format'

type MenuItem = { text: string; onClick: () => void; danger?: boolean }

const STEPS = ['AI 생성', '사람 검수', '공개'] as const

function Steps() {
  return (
    <ol className="flex items-center" aria-label="진행 단계: AI 생성 완료, 사람 검수 중, 공개 전">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center">
          {i > 0 && <span aria-hidden className={cx('h-0.5 w-8', i === 1 ? 'bg-stage-signal' : 'bg-stage-line')} />}
          <span className="flex flex-col items-center gap-1">
            <span
              aria-hidden
              className={cx(
                'inline-flex size-6 items-center justify-center rounded-full border-2',
                i === 0 && 'border-stage-signal bg-stage-signal text-white',
                i === 1 && 'border-stage-caution bg-stage-panel',
                i === 2 && 'border-stage-line bg-stage-panel',
              )}
            >
              {i === 0 ? <Check size={13} strokeWidth={3} /> : i === 1 ? <i className="rec-pulse size-2 rounded-full bg-stage-caution" /> : null}
            </span>
            <span className={cx('text-[11px] font-semibold whitespace-nowrap', i === 0 ? 'text-stage-signal' : i === 1 ? 'text-stage-caution' : 'text-stage-faint')}>{s}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

export function ReviewQueue({ tasks, menuFor }: { tasks: CTask[]; menuFor: (t: CTask) => MenuItem[] }) {
  const visible = (t: CTask) => t.questions.filter((x) => x.stage === 'TASK').length
  return (
    <StageSection aria-label="검수 대기열" className="p-6">
      <div className="relative z-10">
        <header className="flex flex-wrap items-end gap-x-4 gap-y-1">
          <div>
            <p className="label text-stage-brand">REVIEW QUEUE</p>
            <h2 className="mt-1 text-[22px] font-bold tracking-tight text-stage-text">
              사람의 확인을 기다리는 초안 <GradientText>{tasks.length}개</GradientText>
            </h2>
          </div>
          <p className="ml-auto text-[13px] text-stage-muted">검수가 끝난 초안만 공개할 수 있습니다. 공개하면 자가진단과 회차 만들기에 나옵니다.</p>
        </header>

        <ol className="fx-cards mt-5 flex flex-col gap-3">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="glass-stage grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-4 rounded-lg border border-stage-line p-4 transition-shadow hover:shadow-md lg:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
            >
              <KindTile kind={t.category} size={48} vivid />
              <div className="min-w-0">
                <Link to={`/console/tasks/${t.id}`} className="block truncate text-[17px] font-semibold text-stage-text hover:text-stage-brand">
                  {t.title}
                </Link>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-stage-muted">
                  <span className="font-mono text-[12px] text-stage-faint">{t.code}</span>
                  <span>
                    {t.track === 'DEV' ? '개발' : '비개발'} │ {kindName(t.category)}
                  </span>
                  <LevelPips level={t.difficulty} stage />
                  <span className="tnum font-mono">{t.minutes}분</span>
                  <span className="inline-flex items-center gap-1">
                    <FileCode2 size={13} aria-hidden /> <span className="tnum font-mono">{t.files.length}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ListChecks size={13} aria-hidden /> <span className="tnum font-mono">{visible(t)}</span>
                  </span>
                  <span className="tnum font-mono text-[12px] text-stage-faint">수정 {fmtTime(t.updatedAt)}</span>
                </p>
              </div>
              <div className="col-span-2 lg:col-span-1">
                <Steps />
              </div>
              <div className="col-span-2 flex items-center justify-end gap-1 lg:col-span-1">
                <ButtonLink to={`/console/tasks/${t.id}`} variant="primary" size="sm">
                  검수하기 <ArrowRight size={15} aria-hidden />
                </ButtonLink>
                <RowMenu label={`${t.title} 메뉴`} items={menuFor(t)} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </StageSection>
  )
}
