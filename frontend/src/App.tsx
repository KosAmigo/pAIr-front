import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Exam from './pages/Exam'
import Report from './pages/Report'
import Replay from './pages/Replay'
import Entry from './pages/Entry'
import Submitted from './pages/Submitted'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/exam/:sessionId" element={<Exam />} />
        <Route path="/exam/:sessionId/submitted" element={<Submitted />} />
        <Route path="/report/:attemptId" element={<Report />} />
        <Route path="/replay/:taskId" element={<Replay />} />
        <Route path="/entry" element={<Entry />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  )
}
