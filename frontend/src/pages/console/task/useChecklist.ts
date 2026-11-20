// 검수 체크리스트 상태. 이 브라우저(localStorage)에만 남고, 저장이 막혀 있어도 화면에서는 체크된다.
import { useState } from 'react'
import { checklistDone, readChecklist, writeChecklist, type Checklist } from '../../../data/taskBoard'

export function useChecklist(code: string) {
  const [list, setList] = useState<Checklist>(() => readChecklist(code))
  const [saved, setSaved] = useState(true)
  const toggle = (key: keyof Checklist) =>
    setList((l) => {
      const next = { ...l, [key]: !l[key] }
      setSaved(writeChecklist(code, next))
      return next
    })
  return { list, toggle, saved, done: checklistDone(list) }
}
