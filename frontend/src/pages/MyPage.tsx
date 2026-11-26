import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, type AuthUser } from '../auth/auth'
import { accountErrorMessage, validateName, validateNewPassword } from '../auth/account'
import { AuthSessionExpiredError } from '../auth/authApi'
import { ErrorState } from '../components/ErrorState'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { Button, Panel } from '../components/ui'

const inputClass = 'h-11 w-full rounded-sm border border-line-strong bg-panel px-3 text-[16px] text-text outline-none focus:border-brand focus:shadow-[0_0_0_3px_rgb(108_71_255/0.15)]'
const roleLabels = { MANAGER: '담당자', PROCTOR: '감독관', ADMIN: '관리자' } as const

function PasswordField({ id, label, value, onChange, autoComplete, describedBy, errorId, inputRef }: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  describedBy?: string
  errorId?: string
  inputRef?: Ref<HTMLInputElement>
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-semibold text-text">{label}</label>
      <input ref={inputRef} id={id} type="password" value={value} onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete} required aria-invalid={errorId ? true : undefined}
        aria-describedby={[describedBy, errorId].filter(Boolean).join(' ') || undefined} className={inputClass} />
    </div>
  )
}

export default function MyPage() {
  const { getProfile, updateName, changePassword, withdraw } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [withdrawalPassword, setWithdrawalPassword] = useState('')
  const [confirmWithdrawal, setConfirmWithdrawal] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null)
  const [pending, setPending] = useState<'name' | 'password' | 'withdrawal' | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSaved, setNameSaved] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const withdrawalInputRef = useRef<HTMLInputElement>(null)
  const withdrawalButtonRef = useRef<HTMLButtonElement>(null)
  const openedWithdrawalRef = useRef(false)

  useEffect(() => {
    if (confirmWithdrawal) {
      openedWithdrawalRef.current = true
      withdrawalInputRef.current?.focus()
    } else if (openedWithdrawalRef.current) {
      withdrawalButtonRef.current?.focus()
      openedWithdrawalRef.current = false
    }
  }, [confirmWithdrawal])

  useEffect(() => {
    let active = true
    getProfile().then((user) => {
      if (active) setProfile(user)
    }).catch((error: unknown) => {
      if (!active) return
      if (error instanceof AuthSessionExpiredError) {
        navigate('/login', { replace: true, state: { authMessage: error.message } })
      } else {
        setLoadError(error instanceof Error ? error.message : '회원 정보를 불러오지 못했습니다.')
      }
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [getProfile, navigate, attempt])

  const handleError = (error: unknown, setError: (message: string) => void) => {
    if (error instanceof AuthSessionExpiredError) {
      navigate('/login', { replace: true, state: { authMessage: error.message } })
    } else {
      setError(accountErrorMessage(error))
    }
  }

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus()
  }, [editingName])

  const startNameEdit = () => {
    setNameDraft(profile?.name ?? '')
    setNameError(null)
    setNameSaved(false)
    setEditingName(true)
  }

  const submitName = async (event: FormEvent) => {
    event.preventDefault()
    const error = validateName(nameDraft)
    if (error) {
      setNameError(error)
      return
    }
    if (nameDraft.trim() === profile?.name) {
      setEditingName(false)
      return
    }
    setNameError(null)
    setPending('name')
    try {
      const user = await updateName(nameDraft)
      setProfile(user)
      setEditingName(false)
      setNameSaved(true)
    } catch (error) {
      handleError(error, setNameError)
    } finally {
      setPending(null)
    }
  }

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault()
    const error = validateNewPassword(newPassword, confirmation)
    if (error) {
      setPasswordError(error)
      return
    }
    setPasswordError(null)
    setPending('password')
    try {
      await changePassword(currentPassword, newPassword)
      navigate('/login', { replace: true, state: { authMessage: '비밀번호가 변경되었습니다. 다시 로그인해 주세요.' } })
    } catch (error) {
      handleError(error, setPasswordError)
    } finally {
      setPending(null)
    }
  }

  const submitWithdrawal = async (event: FormEvent) => {
    event.preventDefault()
    setWithdrawalError(null)
    setPending('withdrawal')
    try {
      await withdraw(withdrawalPassword)
      navigate('/login', { replace: true, state: { authMessage: '회원 탈퇴가 완료되었습니다.' } })
    } catch (error) {
      handleError(error, setWithdrawalError)
    } finally {
      setPending(null)
    }
  }

  return (
    <SelfShell header={<PageHeader label="ACCOUNT" title="마이페이지" />}>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-4 py-8 sm:px-8">
        {loading ? <p role="status" className="text-text-muted">회원 정보를 불러오는 중입니다…</p> : loadError ? (
          <ErrorState message={loadError} onRetry={() => { setLoading(true); setLoadError(null); setAttempt((value) => value + 1) }} />
        ) : profile && (
          <>
            <Panel label="PROFILE" title="기본 정보">
              <dl className="grid gap-4 text-[15px] sm:grid-cols-2">
                <div>
                  <dt className="text-text-muted">{editingName ? <label htmlFor="profile-name">이름</label> : '이름'}</dt>
                  <dd className="mt-1">
                    {editingName ? (
                      <form onSubmit={submitName} className="flex flex-col gap-2">
                        <input ref={nameInputRef} id="profile-name" value={nameDraft} maxLength={50} autoComplete="name"
                          onChange={(event) => setNameDraft(event.target.value)}
                          aria-invalid={nameError ? true : undefined} aria-describedby={nameError ? 'name-error' : undefined}
                          className={inputClass} />
                        {nameError && <p id="name-error" role="alert" className="text-[14px] text-alert">{nameError}</p>}
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" variant="primary" disabled={pending !== null}>{pending === 'name' ? '저장 중…' : '저장'}</Button>
                          <Button disabled={pending !== null} onClick={() => { setEditingName(false); setNameError(null) }}>취소</Button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-text">{profile.name}</span>
                        <Button size="sm" disabled={pending !== null} onClick={startNameEdit}>이름 변경</Button>
                      </div>
                    )}
                  </dd>
                </div>
                <div><dt className="text-text-muted">이메일</dt><dd className="mt-1 break-all font-semibold text-text">{profile.email}</dd></div>
                {profile.role !== 'USER' && <div><dt className="text-text-muted">역할</dt><dd className="mt-1 text-text">{roleLabels[profile.role]}</dd></div>}
                {profile.companyName != null && <div><dt className="text-text-muted">기업명</dt><dd className="mt-1 text-text">{profile.companyName}</dd></div>}
              </dl>
              {nameSaved && <p role="status" className="mt-4 text-[14px] text-text">이름을 변경했습니다.</p>}
              <p className="mt-4 text-[13px] text-text-muted">이메일은 로그인 아이디라 변경할 수 없습니다.</p>
            </Panel>

            <Panel label="SECURITY" title="비밀번호 변경">
              <p className="mb-4 text-[14px] text-text-muted">변경하면 모든 기기에서 로그아웃되며 다시 로그인해야 합니다.</p>
              <form onSubmit={submitPassword} className="flex flex-col gap-4">
                <PasswordField id="current-password" label="현재 비밀번호" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" errorId={passwordError ? 'password-error' : undefined} />
                <PasswordField id="new-password" label="새 비밀번호" value={newPassword} onChange={setNewPassword} autoComplete="new-password" describedBy="password-hint" errorId={passwordError ? 'password-error' : undefined} />
                <p id="password-hint" className="text-[13px] text-text-muted">8~72자, UTF-8 기준 72바이트 이하</p>
                <PasswordField id="confirm-password" label="새 비밀번호 확인" value={confirmation} onChange={setConfirmation} autoComplete="new-password" errorId={passwordError ? 'password-error' : undefined} />
                {passwordError && <p id="password-error" role="alert" className="text-[14px] text-alert">{passwordError}</p>}
                <Button type="submit" variant="primary" disabled={pending !== null} className="self-start">
                  {pending === 'password' ? '변경 중…' : '비밀번호 변경'}
                </Button>
              </form>
            </Panel>

            <Panel label="ACCOUNT" title="회원 탈퇴">
              {profile.role === 'ADMIN' ? (
                <p className="text-[14px] text-text-muted">관리자 계정은 탈퇴할 수 없습니다.</p>
              ) : confirmWithdrawal ? (
                <form id="withdrawal-confirmation" onSubmit={submitWithdrawal} className="flex flex-col gap-4">
                  <p className="text-[14px] leading-6 text-text">
                    탈퇴하면 계정 정보는 익명 처리됩니다. 응시·채점 기록, 크레딧 원장, 기업 초대 및 실전 응시자 정보는 보존됩니다.
                    탈퇴를 진행하시겠습니까?
                  </p>
                  <PasswordField inputRef={withdrawalInputRef} id="withdrawal-password" label="탈퇴 확인 비밀번호" value={withdrawalPassword} onChange={setWithdrawalPassword} autoComplete="current-password" errorId={withdrawalError ? 'withdrawal-error' : undefined} />
                  {withdrawalError && <p id="withdrawal-error" role="alert" className="text-[14px] text-alert">{withdrawalError}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="danger" disabled={pending !== null}>{pending === 'withdrawal' ? '탈퇴 처리 중…' : '탈퇴 최종 확인'}</Button>
                    <Button disabled={pending !== null} onClick={() => { setConfirmWithdrawal(false); setWithdrawalPassword(''); setWithdrawalError(null) }}>취소</Button>
                  </div>
                </form>
              ) : (
                <div>
                  <p className="mb-4 text-[14px] text-text-muted">탈퇴 전 비밀번호와 보존되는 정보를 확인합니다.
                    {(profile.role === 'MANAGER' || profile.role === 'PROCTOR') && ' 소속 기업에 취소되지 않은 예정·진행 중 회차가 있으면 탈퇴할 수 없습니다.'}
                  </p>
                  <Button ref={withdrawalButtonRef} variant="danger" disabled={pending !== null} onClick={() => setConfirmWithdrawal(true)}>회원 탈퇴</Button>
                </div>
              )}
            </Panel>
          </>
        )}
      </div>
    </SelfShell>
  )
}
