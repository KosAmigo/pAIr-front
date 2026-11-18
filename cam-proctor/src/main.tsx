import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PcExam } from './pc/PcExam'
import { PhoneCam } from './phone/PhoneCam'
import './styles.css'

const isPhone = new URLSearchParams(location.search).get('role') === 'phone'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isPhone ? <PhoneCam /> : <PcExam />}</StrictMode>,
)
