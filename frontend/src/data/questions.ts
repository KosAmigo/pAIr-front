// 응시 화면 문항(객관식·복수 선택·단답형) 타입, API 호출, 자동 저장 로직. 화면(React) 코드는 components/questions 에 있다.
// 백엔드 API: pAIr-back 문항 채점 (GET/PUT /api/attempts/{id}/questions...). 모양을 바꾸지 말 것.
import { call } from '../api.ts'

export type QuestionType = 'SINGLE' | 'MULTI' | 'SHORT'

export type Choice = { id: number; seq: number; content: string }

/** 내 답. 객관식은 choiceIds, 단답형은 text */
export type Answer = { choiceIds: number[] } | { text: string }

export type Question = {
  id: number
  seq: number
  type: QuestionType
  content: string
  points: number
  choices: Choice[]
  answer: Answer | null
}

/** 리포트의 문항 점수 한 줄 */
export type QuestionResultItem = {
  seq: number
  type: QuestionType
  content: string
  points: number
  score: number
  yourAnswer: string | null
  correctAnswer: string | null
  correct: boolean
}

/** 리포트의 문항 점수 묶음. 6개 역량 100점과는 따로 센다 */
export type QuestionResults = { score: number; max: number; items: QuestionResultItem[] }

export const SHORT_MAX_CHARS = 200
export const TEXT_DEBOUNCE_MS = 800

export const questionTypeLabel: Record<QuestionType, string> = { SINGLE: '객관식', MULTI: '복수 선택', SHORT: '단답형' }

const enc = encodeURIComponent

export const questionsApi = {
  list: (attemptId: string) => call<Question[]>('GET', `/api/attempts/${enc(attemptId)}/questions`),
  save: (attemptId: string, questionId: number, answer: Answer) =>
    call<unknown>('PUT', `/api/attempts/${enc(attemptId)}/questions/${questionId}/answer`, answer),
}

export function isAnswered(a: Answer | null | undefined): boolean {
  if (!a) return false
  return 'choiceIds' in a ? a.choiceIds.length > 0 : a.text.trim().length > 0
}

export function answeredCount(questions: Question[]): number {
  return questions.filter((q) => isAnswered(q.answer)).length
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** 저장 실패를 쉬운 말로. 409 는 제출 후라 더는 못 고친다는 뜻이라 따로 처리한다 */
export function saveErrorMessage(e: unknown): string {
  const status = (e as { status?: number }).status
  if (status === 403) return '내 응시가 아니라서 저장할 수 없습니다.'
  if (status === 400) return '답 형식이 올바르지 않습니다.'
  return '저장하지 못했습니다. 다시 시도해 주세요.'
}

export type AnswerSaverOptions = {
  save: (questionId: number, answer: Answer) => Promise<unknown>
  /** 문항별 저장 상태가 바뀔 때 */
  onState: (questionId: number, state: SaveState, error?: string) => void
  /** 서버가 409(제출 후라 못 고침)를 돌려줬을 때 */
  onLocked: () => void
  debounceMs?: number
}

/**
 * 문항별 자동 저장. 객관식은 고르는 즉시, 단답형은 입력이 멈추고 debounceMs 뒤에 보낸다.
 * 같은 문항의 저장은 한 번에 하나만 보내고, 그동안 새 답이 오면 끝난 뒤 마지막 답만 다시 보낸다.
 */
export function createAnswerSaver(opts: AnswerSaverOptions) {
  const wait = opts.debounceMs ?? TEXT_DEBOUNCE_MS
  type Slot = { timer: ReturnType<typeof setTimeout> | null; pending: Answer | null; failed: Answer | null; running: Promise<void> | null }
  const slots = new Map<number, Slot>()
  const slot = (id: number): Slot => {
    let s = slots.get(id)
    if (!s) slots.set(id, (s = { timer: null, pending: null, failed: null, running: null }))
    return s
  }

  const run = (id: number): Promise<void> => {
    const s = slot(id)
    if (s.running) return s.running
    if (!s.pending) return Promise.resolve()
    const p = send(id).finally(() => {
      s.running = null
    })
    s.running = p
    return p
  }

  const send = async (id: number) => {
    const s = slot(id)
    // 보내는 동안 새 답이 쌓이면(타이머가 없을 때) 이어서 마지막 답을 보낸다
    while (s.pending && !s.timer) {
      const answer: Answer = s.pending
      s.pending = null
      opts.onState(id, 'saving')
      try {
        await opts.save(id, answer)
        s.failed = null
        if (!s.pending && !s.timer) opts.onState(id, 'saved')
      } catch (e) {
        if ((e as { status?: number }).status === 409) {
          s.pending = null
          opts.onLocked()
        } else if (!s.pending && !s.timer) {
          s.failed = answer
          opts.onState(id, 'error', saveErrorMessage(e))
        }
      }
    }
  }

  const queue = (id: number, answer: Answer, delay: number) => {
    const s = slot(id)
    if (s.timer) clearTimeout(s.timer)
    s.pending = answer
    s.failed = null
    if (delay <= 0) {
      s.timer = null
      void run(id)
      return
    }
    s.timer = setTimeout(() => {
      s.timer = null
      void run(id)
    }, delay)
  }

  return {
    /** 객관식: 바로 저장 */
    choose(id: number, choiceIds: number[]) {
      queue(id, { choiceIds }, 0)
    },
    /** 단답형: 입력이 멈추면 저장 */
    type(id: number, text: string) {
      queue(id, { text }, wait)
    },
    /** 실패한 답을 다시 보낸다 */
    retry(id: number) {
      const s = slot(id)
      if (!s.failed) return
      queue(id, s.failed, 0)
    },
    /** 기다리는 입력을 지금 보내고, 보내는 중인 것까지 끝나기를 기다린다 (제출 직전 등) */
    async flush() {
      const all: Promise<void>[] = []
      for (const [id, s] of slots) {
        if (s.timer) {
          clearTimeout(s.timer)
          s.timer = null
        }
        all.push(run(id))
      }
      await Promise.all(all)
      // 보내는 동안 새로 쌓인 답이 있으면 한 번 더
      if ([...slots.values()].some((s) => s.pending)) await this.flush()
    },
    /** 화면을 떠날 때. 기다리던 입력은 마지막으로 한 번 보낸다 */
    dispose() {
      void this.flush()
    },
  }
}
