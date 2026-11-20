import { lazy, Suspense } from 'react'
import { MotionConfig } from 'motion/react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import RealExam, { NewExam } from './pages/RealExam'
import Report from './pages/Report'
import Replay from './pages/Replay'
import Entry from './pages/Entry'
import Submitted from './pages/Submitted'
import Tasks from './pages/Tasks'
import History from './pages/History'
import Grader from './pages/Grader'
import GraderResult from './pages/GraderResult'
import { useAuth } from './auth/auth'
import { AuthProvider } from './auth/AuthProvider'
import RequireAuth from './auth/RequireAuth'
import Login, { Signup } from './pages/Login'
import { ConsoleShell } from './components/ConsoleShell'
import ConsoleCompanies, { ConsoleCompanyDetail } from './pages/console/ConsoleCompanies'
import ConsoleTasks from './pages/console/ConsoleTasks'
import ConsoleTaskNew from './pages/console/ConsoleTaskNew'
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
  if (loading) return null
  if (params.get('mode') !== 'live' && !user) {
    return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  }
  return <RealExam />
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
        <Routes>
          {/* 로그인 없이 */}
          <Route path="/" element={home} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/entry" element={<Entry />} />
          <Route path="/proctor/phone" element={phoneCam} />
          <Route path="/exam/:sessionId" element={<ExamRoute />} />
          <Route path="/exam/:sessionId/submitted" element={<Submitted />} />

          {/* 자가진단: 로그인한 누구나 */}
          <Route element={<RequireAuth />}>
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/history" element={<History />} />
            <Route path="/exam/new" element={<NewExam />} />
            <Route path="/report/:attemptId" element={<Report />} />
            <Route path="/replay/:attemptId" element={<Replay />} />
          </Route>

          {/* 채점 툴: 관리자 */}
          <Route element={<RequireAuth roles={['ADMIN']} />}>
            <Route path="/grader" element={<Grader />} />
            <Route path="/proctor/lab" element={proctorLab} />
            <Route path="/grader/result/:runId/:file" element={<GraderResult />} />
          </Route>

          {/* 콘솔 (DESIGN.md §7-9) */}
          <Route element={<RequireAuth roles={['ADMIN']} />}>
            <Route path="/console/tasks/:taskId/preview" element={<TaskPreview />} />
          </Route>
          <Route element={<RequireAuth roles={['ADMIN', 'MANAGER', 'PROCTOR']} />}>
            <Route path="/console" element={<ConsoleShell />}>
              <Route index element={<ConsoleHome />} />
              <Route path="sessions" element={<ConsoleSessions />} />
              <Route element={<RequireAuth roles={['ADMIN', 'MANAGER']} />}>
                <Route path="sessions/new" element={<ConsoleSessionNew />} />
              </Route>
              <Route path="sessions/:sessionId" element={<ConsoleSessionDetail />} />
              <Route path="sessions/:sessionId/attempts/:attemptId" element={<ConsoleAttempt />} />
              <Route element={<RequireAuth roles={['ADMIN']} />}>
                <Route path="tasks" element={<ConsoleTasks />} />
                <Route path="tasks/new" element={<ConsoleTaskNew />} />
                <Route path="tasks/:taskId" element={<ConsoleTaskEdit />} />
                <Route path="companies" element={<ConsoleCompanies />} />
                <Route path="companies/:companyId" element={<ConsoleCompanyDetail />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={home} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </MotionConfig>
  )
}
