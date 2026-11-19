// 과제 형태 키 → 아이콘 (자가진단 과제 목록과 콘솔이 같이 쓴다)
import { BarChart3, Bug, ClipboardCheck, FileText, FlaskConical, MessageSquareText, Search, Wrench, type LucideIcon } from 'lucide-react'

export const KIND_ICON: Record<string, LucideIcon> = {
  incident: Bug,
  feature: Wrench,
  refactor: FlaskConical,
  testing: ClipboardCheck,
  planning: FileText,
  data: BarChart3,
  research: Search,
  cs: MessageSquareText,
}
