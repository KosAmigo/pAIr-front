import { createContext, useContext } from 'react'

/** 다크 무대(StageSection) 안인지. 안에서는 부품이 stage 톤으로 바뀐다 (DESIGN.md §3.6). */
export const StageContext = createContext(false)
export const useOnStage = () => useContext(StageContext)
