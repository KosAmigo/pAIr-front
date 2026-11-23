// AI 추천 받기 상태. 직군별로 받은 목록과 고른 카드를 이 화면 안에서 보관한다(직군을 바꿔도 그대로).
// 규칙(다시 추천, 주제 바뀜, 주제 확인)은 data/taskGen.ts 의 순수 함수에 있다 (테스트 있음).
import { useRef, useState } from 'react'
import {
  acceptTopicCheck,
  excludeFor,
  pickSuggestion,
  recordSuggestions,
  suggestErrorMessage,
  suggestRequest,
  taskGenApi,
  type GenTrack,
  type SuggestStore,
  type Suggestion,
} from '../../../data/taskGen'

export function useSuggestions() {
  const [store, setStore] = useState<SuggestStore>({})
  const [loading, setLoading] = useState<GenTrack | null>(null)
  const [error, setError] = useState<{ track: GenTrack; text: string } | null>(null)
  const seq = useRef(0)

  /** 추천 받기 / 다시 추천. 주제가 앞서와 같으면 앞서 받은 상황을 빼고, 달라졌으면 새로 받는다 */
  const ask = async (track: GenTrack, topic: string) => {
    if (loading) return
    const my = ++seq.current
    setLoading(track)
    setError(null)
    try {
      const res = await taskGenApi.suggest(suggestRequest({ track, topic }, excludeFor(store[track], topic)))
      if (my !== seq.current) return
      setStore((s) => recordSuggestions(s, track, topic, res))
    } catch (e) {
      if (my === seq.current) setError({ track, text: suggestErrorMessage(e) })
    } finally {
      if (my === seq.current) setLoading(null)
    }
  }

  return {
    store,
    loading,
    error,
    ask,
    pick: (track: GenTrack, s: Suggestion) => setStore((st) => pickSuggestion(st, track, s.situation)),
    accept: (track: GenTrack) => setStore((st) => acceptTopicCheck(st, track)),
  }
}
