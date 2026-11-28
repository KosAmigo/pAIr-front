import { lazy, Suspense } from 'react'
import { MotionConfig } from 'motion/react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import RealExam, { NewExam } from './pages/RealExam'
import Report from './pages/Report'
import Reports from './pages/Reports'
import Review from './pages/Review'
import ReplayRedirect from './pages/ReplayRedirect'
import Entry from './pages/Entry'
import Submitted from './pages/Submitted'
import Tasks from './pages/Tasks'
import Grader from './pages/Grader'
import GraderResult from './pages/GraderResult'
import { useAuth } from './auth/auth'
import { AuthProvider } from './auth/AuthProvider'
import RequireAuth from './auth/RequireAuth'
import { OnboardingGate } from './auth/OnboardingGate'
import Onboarding from './pages/Onboarding'
import CompanyInvite from './pages/CompanyInvite'
import CompanyMembers from './pages/console/CompanyMembers'
import Login, { Signup } from './pages/Login'
import MyPage from './pages/MyPage'
import Credits from './pages/Credits'
import { ConsoleShell } from './components/ConsoleShell'
import ConsoleCompanies, { ConsoleCompanyDetail } from './pages/console/ConsoleCompanies'
import ConsoleStats from './pages/console/ConsoleStats'
import ConsoleUsers from './pages/console/ConsoleUsers'
import ConsoleTasks from './pages/console/ConsoleTasks'
import ConsoleTaskNew from './pages/console/ConsoleTaskNew'
import ConsoleTasksGenerating from './pages/console/ConsoleTasksGenerating'
import ConsoleTaskEdit from './pages/console/ConsoleTaskEdit'
import TaskPreview from './pages/console/TaskPreview'
import ConsoleSessions from './pages/console/ConsoleSessions'
import ConsoleSessionNew from './pages/console/ConsoleSessionNew'
import ConsoleSessionDetail from './pages/console/ConsoleSessionDetail'
import ConsoleAttempt from './pages/console/ConsoleAttempt'

// 초기화면은 GSAP·Lenis를 쓰므로 따로 불러온다 (DESIGN.md §4.2)
const Home = lazy(() => import('./pages/Home'))
const home = (
  <Suspense fallback={<div className="min-h-full bg-bg" />}>
    <Home />
  </Suspense>
)

// 휴대폰 보조 캠 (실전 시험, PC 화면의 QR 로 들어온다). 분석 모델이 무거워 따로 불러온다
const PhoneCamPage = lazy(() => import('./proctor/react/PhoneCamPage.tsx'))
const phoneCam = (
  <Suspense fallback={<div className="mobile-layout min-h-full bg-bg" />}>
    <PhoneCamPage />
  </Suspense>
)

// 사전 테스트 (연습 모드, 서버 기록 없음). 공개 페이지
const PracticePage = lazy(() => import('./proctor/react/PracticePage.tsx'))
const practice = (
  <Suspense fallback={<div className="min-h-full bg-bg" />}>
    <PracticePage />
  </Suspense>
)

// 감독 오탐률 측정 (관리자). 분석 모델이 무거워 따로 불러온다
const FalsePositiveLab = lazy(() => import('./proctor/react/FalsePositiveLab.tsx'))
const proctorLab = (
  <Suspense fallback={<div className="min-h-full bg-bg" />}>
    <FalsePositiveLab />
  </Suspense>
)

// 응시 화면은 백엔드 응시만 보여 준다.
// 실전 응시(mode=live)는 로그인 없이 본다 (DESIGN.md §7-8). 자가진단 응시는 로그인 확인이 끝난 뒤 비로그인 사용자를 로그인 화면으로 보낸다.
function ExamRoute() {
  const [params] = useSearchParams()
  const { user, loading } = useAuth()
  const loc = useLocation()
  const { sessionId } = useParams()
  if (loading) return null
  if (params.get('mode') !== 'live' && !user) {
    return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  }
  // 응시 ID 가 바뀌면(/exam/A → /exam/B) 화면 상태를 처음부터 다시 만든다
  return <RealExam key={sessionId} />
}

function ConsoleHome() {
  const { user } = useAuth()
  return <Navigate to={user?.role === 'ADMIN' ? '/console/tasks' : '/console/sessions'} replace />
}

export default function App() {
  return (
    // 움직임 줄이기 설정이면 Motion 의 transform 연출을 모두 끈다 (DESIGN.md §4.4)
    <MotionConfig reducedMotion="user">
    <AuthProvider>
      <BrowserRouter>
        <OnboardingGate>
        <Routes>
          {/* 로그인 없이 */}
          <Route path="/" element={home} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/company-invite" element={<CompanyInvite />} />
          <Route path="/company-invites/accept" element={<CompanyInvite />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/entry" element={<Entry />} />
          <Route path="/proctor/phone" element={phoneCam} />
          <Route path="/practice" element={practice} />
          <Route path="/exam/:sessionId" element={<ExamRoute />} />
          <Route path="/exam/:sessionId/submitted" element={<Submitted />} />

          {/* 계정 화면과 예전 기록(리포트·복기)은 로그인한 누구나 */}
          <Route element={<RequireAuth />}>
            <Route path="/mypage" element={<MyPage />} />
            <Route path="/exam/new" element={<NewExam />} />
            <Route path="/report/:attemptId" element={<Report />} />
            <Route path="/replay/:attemptId" element={<ReplayRedirect />} />
          </Route>

          {/* 자가진단·크레딧: 일반 회원과 관리자만. 기업 계정은 콘솔로 보낸다 */}
          <Route element={<RequireAuth roles={['USER', 'ADMIN']} deniedMessage="기업 계정은 자가진단과 크레딧을 이용할 수 없습니다" />}>
            <Route path="/credits" element={<Credits />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/review" element={<Review />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/history" element={<Navigate to="/review" replace />} />
          </Route>

          {/* 채점 툴: 관리자 */}
          <Route element={<RequireAuth roles={['ADMIN']} />}>
            <Route path="/proctor/lab" element={proctorLab} />
            {/* 채점 툴은 콘솔 셸(왼쪽 메뉴 + 상단 바) 안에서 보인다. 주소는 그대로 */}
            <Route element={<ConsoleShell />}>
              <Route path="/grader" element={<Grader />} />
              <Route path="/grader/result/:runId/:file" element={<GraderResult />} />
            </Route>
          </Route>

          {/* 콘솔 (DESIGN.md §7-9) */}
          <Route element={<RequireAuth roles={['ADMIN']} />}>
            <Route path="/console/tasks/:taskId/preview" element={<TaskPreview />} />
          </Route>
          <Route element={<RequireAuth roles={['ADMIN', 'MANAGER', 'PROCTOR']} />}>
            <Route path="/console" element={<ConsoleShell />}>
              <Route index element={<ConsoleHome />} />
              <Route path="sessions" element={<ConsoleSessions />} />
              <Route element={<RequireAuth roles={['MANAGER']} deniedRedirect="/console/sessions" deniedMessage="회차 생성 권한이 없습니다" />}>
                <Route path="sessions/new" element={<ConsoleSessionNew />} />
              </Route>
              <Route element={<RequireAuth roles={['MANAGER']} />}>
                <Route path="members" element={<CompanyMembers />} />
              </Route>
              <Route path="sessions/:sessionId" element={<ConsoleSessionDetail />} />
              <Route path="sessions/:sessionId/attempts/:attemptId" element={<ConsoleAttempt />} />
              <Route element={<RequireAuth roles={['ADMIN']} />}>
                <Route path="tasks" element={<ConsoleTasks />} />
                <Route path="tasks/new" element={<ConsoleTaskNew />} />
                <Route path="tasks/generating" element={<ConsoleTasksGenerating />} />
                <Route path="tasks/:taskId" element={<ConsoleTaskEdit />} />
                <Route path="companies" element={<ConsoleCompanies />} />
                <Route path="companies/:companyId" element={<ConsoleCompanyDetail />} />
                <Route path="users" element={<ConsoleUsers />} />
                <Route path="stats" element={<ConsoleStats />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={home} />
        </Routes>
        </OnboardingGate>
      </BrowserRouter>
    </AuthProvider>
    </MotionConfig>
  )
}
