import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Exam from './pages/Exam'
import RealExam, { NewExam } from './pages/RealExam'
import Report from './pages/Report'
import Replay from './pages/Replay'
import Entry from './pages/Entry'
import Submitted from './pages/Submitted'
import Tasks from './pages/Tasks'
import History from './pages/History'
import Grader from './pages/Grader'
import GraderResult from './pages/GraderResult'
import { isRealAttempt } from './api'
import { AntiCheatingSync } from './anti-cheating'

// 초기화면은 GSAP·Lenis를 쓰므로 따로 불러온다 (DESIGN.md §4.2)
const Home = lazy(() => import('./pages/Home'))
const home = (
  <Suspense fallback={<div className="min-h-full bg-bg" />}>
    <Home />
  </Suspense>
)

// 실제 응시 ID(att-...)는 백엔드에 연결된 응시 화면, 그 밖의 ID는 기존 목업 화면
function ExamRoute() {
  const { sessionId } = useParams()
  return isRealAttempt(sessionId) ? <RealExam /> : <Exam />
}

export default function App() {
  return (
    <BrowserRouter>
      <AntiCheatingSync />
      <Routes>
        <Route path="/" element={home} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/history" element={<History />} />
        <Route path="/exam/new" element={<NewExam />} />
        <Route path="/exam/:sessionId" element={<ExamRoute />} />
        <Route path="/exam/:sessionId/submitted" element={<Submitted />} />
        <Route path="/report/:attemptId" element={<Report />} />
        <Route path="/replay/:taskId" element={<Replay />} />
        <Route path="/entry" element={<Entry />} />
        <Route path="/grader" element={<Grader />} />
        <Route path="/grader/result/:runId/:file" element={<GraderResult />} />
        <Route path="*" element={home} />
      </Routes>
    </BrowserRouter>
  )
}
