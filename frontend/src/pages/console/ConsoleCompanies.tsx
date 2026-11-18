// DESIGN.md §7-9-5 회사 (ADMIN): 목록 + 등록 모달, 상세(회사 정보, 담당자 계정, 회차)
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Building2, Check, ChevronRight, CircleAlert, Inbox, Plus, UserPlus, X } from 'lucide-react'
import { cx } from '../../components/cx'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { PageHeader } from '../../components/SelfShell'
import { Button } from '../../components/ui'
import { Reveal } from '../../components/fx'
import { ConsoleHero, HeroSep } from './ConsoleHero'
import { approveInquiry, rejectInquiry, useInquiries } from '../../data/inquiries'
import {
  addManager,
  createCompany,
  phaseOf,
  removeManager,
  updateCompany,
  useCompanies,
  taskTitles,
  useSessions,
  type Company,
  type Manager,
} from '../../data/consoleSessions'
import { ConfirmModal, Modal, RowMenu } from './common'
import { fmtHm, fmtShort, fmtTime, useToast } from './format'

const input =
  'h-10 w-full rounded-sm border border-line-strong bg-panel px-3 text-[15px] text-text outline-none placeholder:text-text-faint focus:border-brand focus:shadow-[0_0_0_3px_rgb(108_71_255/0.15)]'

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-semibold text-text">
        {label}
      </label>
      {children}
      {hint && <p className="text-[12px] text-text-muted">{hint}</p>}
    </div>
  )
}
function ErrorLine({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="mt-3 flex items-center gap-1.5 text-[13px] text-alert">
      <CircleAlert size={14} aria-hidden /> {text}
    </p>
  ) : null
}

// ── 목록 ──
export default function ConsoleCompanies() {
  const companies = useCompanies()
  const sessions = useSessions()
  const nav = useNavigate()
  const [adding, setAdding] = useState(false)

  return (
    <>
      <PageHeader label="COMPANIES" title="회사">
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden /> 회사 등록
        </Button>
      </PageHeader>
      <div className="px-8 pt-6">
        <InquiryInbox />
      </div>
      <div className="p-8">
        <Reveal className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
          {companies.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <Building2 size={28} strokeWidth={1.75} className="text-text-faint" aria-hidden />
              <p className="text-[15px] text-text-muted">등록된 회사가 없습니다.</p>
            </div>
          ) : (
            <table className="w-full text-[14px]">
              <thead>
                <tr className="h-10 border-b border-line text-left">
                  {['회사', '사업자등록번호', '담당자', '회차', '등록 시각', ''].map((h, i) => (
                    <th key={i} className={cx('px-4 text-[13px] font-semibold text-text-muted', (i === 2 || i === 3) && 'text-right')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="fx-rows">
                {companies.map((c) => {
                  const mine = sessions.filter((s) => s.companyId === c.id)
                  const live = mine.filter((s) => phaseOf(s) === 'live').length
                  return (
                    <tr key={c.id} onClick={() => nav(`/console/companies/${c.id}`)} className="h-14 cursor-pointer border-b border-line last:border-0 hover:bg-panel-raised">
                      <td className="px-4">
                        <span className="flex items-center gap-3">
                          <span className="inline-flex size-9 items-center justify-center rounded-md bg-brand-dim text-[15px] font-bold text-brand">{c.name.slice(0, 1)}</span>
                          <span className="text-[15px] font-semibold text-text">{c.name}</span>
                        </span>
                      </td>
                      <td className="tnum px-4 font-mono text-[13px] text-text-muted">{c.businessNo ?? '—'}</td>
                      <td className="tnum px-4 text-right font-mono text-[13px] text-text">{c.managers.length}</td>
                      <td className="tnum px-4 text-right font-mono text-[13px] text-text">
                        {mine.length}
                        {live > 0 && <span className="ml-2 rounded-sm bg-alert/10 px-1.5 py-0.5 font-sans text-[12px] font-semibold text-alert">진행 중 {live}</span>}
                      </td>
                      <td className="tnum px-4 font-mono text-[13px] text-text-muted">{fmtTime(c.createdAt)}</td>
                      <td className="w-10 px-2">
                        <ChevronRight size={16} className="text-text-faint" aria-hidden />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Reveal>
      </div>
      {adding && <AddCompanyModal onClose={() => setAdding(false)} onDone={(id) => nav(`/console/companies/${id}`)} />}
    </>
  )
}

function AddCompanyModal({ onClose, onDone }: { onClose: () => void; onDone: (id: number) => void }) {
  const [name, setName] = useState('')
  const [bno, setBno] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = () => {
    const r = createCompany(name, bno)
    if (r.error) return setError(r.error)
    onDone(r.id!)
  }
  return (
    <Modal
      title="회사 등록"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" onClick={submit}>
            등록
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field id="co-name" label="회사 이름">
          <input id="co-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={input} />
        </Field>
        <Field id="co-bno" label="사업자등록번호 (선택)" hint="000-00-00000">
          <input id="co-bno" value={bno} onChange={(e) => setBno(e.target.value)} placeholder="123-45-67890" className={cx(input, 'tnum font-mono')} />
        </Field>
        <button type="submit" hidden />
      </form>
      <ErrorLine text={error} />
    </Modal>
  )
}

// ── 상세 ──
export function ConsoleCompanyDetail() {
  const { companyId } = useParams()
  const c = useCompanies().find((x) => String(x.id) === companyId)
  if (!c) {
    return (
      <div className="flex flex-col items-center gap-3 py-32 text-center">
        <CircleAlert size={28} className="text-text-faint" aria-hidden />
        <p className="text-[15px] text-text-muted">찾을 수 없는 회사입니다.</p>
        <Link to="/console/companies" className="text-[14px] font-semibold text-brand hover:underline">
          회사 목록으로
        </Link>
      </div>
    )
  }
  return <CompanyDetail key={c.id} c={c} />
}

function CompanyDetail({ c }: { c: Company }) {
  useConsoleCrumbs([c.name])
  const nav = useNavigate()
  const toast = useToast()
  const sessions = useSessions()
    .filter((s) => s.companyId === c.id)
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
  const [name, setName] = useState(c.name)
  const [bno, setBno] = useState(c.businessNo ?? '')
  const [infoError, setInfoError] = useState<string | null>(null)
  const dirty = name !== c.name || bno !== (c.businessNo ?? '')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Manager | null>(null)

  return (
    <>
      {/* 2026-11-19 개편: 머리는 다크 무대 카드(ConsoleHero) */}
      <div className="px-8 pt-6">
        <ConsoleHero
          label="회사 요약"
          badge={
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-stage-raised px-2.5 text-[13px] font-semibold text-stage-muted">
              <Building2 size={14} aria-hidden /> COMPANY
            </span>
          }
          title={c.name}
          meta={
            <>
              <span>{c.businessNo || '사업자번호 없음'}</span>
              <HeroSep />
              <span>등록 {fmtTime(c.createdAt)}</span>
            </>
          }
          stats={[
            { label: 'MANAGERS', value: c.managers.length, unit: '명' },
            { label: 'SESSIONS', value: sessions.length, unit: '회' },
          ]}
        />
      </div>
      <div className="grid gap-6 p-8 xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <section className="flex h-fit flex-col gap-4 rounded-xl border border-line bg-panel p-5 shadow-sm">
          <p className="label">INFO</p>
          <Field id="d-name" label="회사 이름">
            <input id="d-name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
          </Field>
          <Field id="d-bno" label="사업자등록번호" hint="000-00-00000 (선택)">
            <input id="d-bno" value={bno} onChange={(e) => setBno(e.target.value)} className={cx(input, 'tnum font-mono')} />
          </Field>
          <p className="tnum font-mono text-[12px] text-text-faint">등록 {fmtTime(c.createdAt)}</p>
          <ErrorLine text={infoError} />
          <Button
            variant="primary"
            disabled={!dirty}
            onClick={() => {
              const err = updateCompany(c.id, { name, businessNo: bno })
              setInfoError(err)
              if (!err) toast.show('회사 정보를 저장했습니다')
            }}
          >
            저장
          </Button>
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          <section className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
            <header className="flex h-12 items-center gap-2 border-b border-line px-4">
              <span className="label">MANAGERS</span>
              <h2 className="text-[16px] font-semibold text-text">담당자 계정</h2>
              <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
                <UserPlus size={14} aria-hidden /> 담당자 추가
              </Button>
            </header>
            {c.managers.length === 0 ? (
              <p className="py-12 text-center text-[14px] text-text-muted">담당자가 없습니다. 담당자가 있어야 이 회사가 회차를 열 수 있습니다.</p>
            ) : (
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="h-9 border-b border-line text-left">
                    {['이름', '이메일', '만든 시각', ''].map((h) => (
                      <th key={h} className="px-4 text-[13px] font-semibold text-text-muted">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="fx-rows">
                  {c.managers.map((m) => (
                    <tr key={m.id} className="h-12 border-b border-line last:border-0">
                      <td className="px-4 font-medium text-text">{m.name}</td>
                      <td className="px-4 font-mono text-[13px] text-text-muted">{m.email}</td>
                      <td className="tnum px-4 font-mono text-[13px] text-text-muted">{fmtTime(m.createdAt)}</td>
                      <td className="w-12 px-2">
                        <RowMenu
                          label={`${m.name} 메뉴`}
                          items={[
                            { text: '비밀번호 재설정 메일', onClick: () => toast.show(`${m.email}로 재설정 메일을 보냈습니다 (목업)`) },
                            { text: '계정 삭제', danger: true, onClick: () => setRemoving(m) },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
            <header className="flex h-12 items-center gap-2 border-b border-line px-4">
              <span className="label">SESSIONS</span>
              <h2 className="text-[16px] font-semibold text-text">회차</h2>
              <span className="tnum ml-auto font-mono text-[12px] text-text-muted">{sessions.length}개</span>
            </header>
            {sessions.length === 0 ? (
              <p className="py-12 text-center text-[14px] text-text-muted">아직 연 회차가 없습니다.</p>
            ) : (
              <ul>
                {sessions.map((s) => {
                  const ph = phaseOf(s)
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => nav(`/console/sessions/${s.id}`)}
                        className="flex h-14 w-full items-center gap-4 border-b border-line px-4 text-left last:border-0 hover:bg-panel-raised"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-text">{s.title}</span>
                          <span className="text-[13px] text-text-muted">{taskTitles(s)}</span>
                        </span>
                        <span className="tnum font-mono text-[13px] text-text-muted">
                          {fmtShort(s.startsAt)} – {fmtHm(s.endsAt)}
                        </span>
                        <span className={cx('w-16 text-right text-[13px] font-semibold', ph === 'live' ? 'text-alert' : ph === 'upcoming' ? 'text-info' : 'text-text-muted')}>
                          {ph === 'live' ? '진행 중' : ph === 'upcoming' ? '예정' : '종료'}
                        </span>
                        <ChevronRight size={16} className="text-text-faint" aria-hidden />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {adding && <AddManagerModal companyId={c.id} onClose={() => setAdding(false)} onDone={(email) => toast.show(`${email}로 임시 비밀번호 안내 메일을 보냈습니다 (목업)`)} />}
      {removing && (
        <ConfirmModal
          title="담당자 계정을 삭제할까요?"
          danger
          confirm="삭제"
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            removeManager(c.id, removing.id)
            setRemoving(null)
            toast.show('담당자 계정을 삭제했습니다')
          }}
          body={`${removing.name}(${removing.email})은 더 이상 콘솔에 로그인할 수 없습니다. 이 사람이 만든 회차와 결과는 그대로 남습니다.`}
        />
      )}
      {toast.node}
    </>
  )
}

function AddManagerModal({ companyId, onClose, onDone }: { companyId: number; onClose: () => void; onDone: (email: string) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = () => {
    const err = addManager(companyId, name, email)
    if (err) return setError(err)
    onDone(email.trim().toLowerCase())
    onClose()
  }
  return (
    <Modal
      title="담당자 추가"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" onClick={submit}>
            추가하고 메일 보내기
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field id="m-name" label="이름">
          <input id="m-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={50} className={input} />
        </Field>
        <Field id="m-email" label="이메일" hint="이 주소로 임시 비밀번호 안내 메일이 갑니다. 로그인하면 비밀번호를 바꾸게 합니다.">
          <input id="m-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={cx(input, 'font-mono text-[14px]')} />
        </Field>
        <button type="submit" hidden />
      </form>
      <ErrorLine text={error} />
    </Modal>
  )
}

/**
 * 도입 문의 받은편지함 (기획_결정사항 §4, company_inquiries). 승인하면 회사를 등록하고 담당자를 첫 MANAGER 로 초대한다.
 * 처리한 문의는 기록으로 아래에 흐리게 남는다.
 */
function InquiryInbox() {
  const list = useInquiries()
  const toast = useToast()
  const pending = list.filter((q) => q.status === 'PENDING')
  const handled = list.filter((q) => q.status !== 'PENDING').slice(0, 3)
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm" aria-label="도입 문의">
      <header className="flex h-12 items-center gap-2 border-b border-line bg-[linear-gradient(120deg,var(--color-brand-dim),transparent_70%)] px-4">
        <Inbox size={16} className="text-brand" aria-hidden />
        <span className="label">INQUIRIES</span>
        <span className="text-[15px] font-semibold text-text">도입 문의</span>
        <span className={cx('tnum ml-1 rounded-full px-2 font-mono text-[12px] font-semibold', pending.length ? 'bg-caution/12 text-caution' : 'bg-panel-raised text-text-muted')}>{pending.length}</span>
        <span className="ml-auto text-[13px] text-text-muted">승인하면 회사를 등록하고 담당자에게 초대 메일을 보냅니다</span>
      </header>
      {pending.length === 0 && handled.length === 0 && <p className="px-4 py-6 text-center text-[14px] text-text-muted">새 문의가 없습니다.</p>}
      <ul className="fx-cards divide-y divide-line">
        {[...pending, ...handled].map((q) => (
          <li key={q.id} className={cx('flex items-start gap-4 px-4 py-3', q.status !== 'PENDING' && 'opacity-60')}>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-text">
                {q.companyName}
                <span className="tnum font-mono text-[12px] font-normal text-text-muted">{q.businessNo}</span>
              </p>
              <p className="text-[13px] text-text-muted">
                {q.contactName} │ <span className="font-mono">{q.contactEmail}</span> │ {fmtTime(q.createdAt)}
              </p>
              {q.message && <p className="mt-1 text-[14px] leading-6 text-text">{q.message}</p>}
            </div>
            {q.status === 'PENDING' ? (
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="ghost" onClick={() => rejectInquiry(q.id)}>
                  <X size={14} aria-hidden /> 거절
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    const err = approveInquiry(q.id)
                    toast.show(err ?? `회사 등록 완료: ${q.companyName}. 담당자 초대 메일을 ${q.contactEmail} 주소로 보냈습니다`)
                  }}
                >
                  <Check size={14} aria-hidden /> 승인
                </Button>
              </div>
            ) : (
              <span className={cx('shrink-0 text-[13px] font-semibold', q.status === 'APPROVED' ? 'text-signal' : 'text-text-muted')}>{q.status === 'APPROVED' ? '승인됨' : '거절됨'}</span>
            )}
          </li>
        ))}
      </ul>
      {toast.node}
    </section>
  )
}
