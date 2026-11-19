import { useEffect } from 'react'
import { ViolationOutbox } from '../storage/ViolationOutbox.ts'

export function AntiCheatingSync() {
  useEffect(() => {
    const flush = () => void ViolationOutbox.flushAll()
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [])
  return null
}
