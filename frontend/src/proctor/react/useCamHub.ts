import { useSyncExternalStore } from 'react'
import { camHub, type CamState } from '../camHub.ts'

/** 카메라 감독 허브 상태 구독 */
export function useCamHub(): CamState {
  return useSyncExternalStore(camHub.subscribe, camHub.getState, camHub.getState)
}
