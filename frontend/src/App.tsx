import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Exam from './pages/Exam'
import RealExam, { NewExam } from './pages/RealExam'
import Report from './pages/Report'
import Replay from './pages/Replay'
import Entry from './pages/Entry'
import Submitted from './pages/Submitted'
import { isRealAttempt } from './api'

// 실제 응시 ID(att-...)는 백엔드에 연결된 응시 화면, 그 밖의 ID는 기존 목업 화면
function ExamRoute() {
  const { sessionId } = useParams()
  return isRealAttempt(sessionId) ? <RealExam /> : <Exam />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/exam/new" element={<NewExam />} />
        <Route path="/exam/:sessionId" element={<ExamRoute />} />
        <Route path="/exam/:sessionId/submitted" element={<Submitted />} />
        <Route path="/report/:attemptId" element={<Report />} />
        <Route path="/replay/:taskId" element={<Replay />} />
        <Route path="/entry" element={<Entry />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  )
}
