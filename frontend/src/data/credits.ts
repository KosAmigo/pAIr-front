// 크레딧 설정값 (기획_결정사항 §3, 테이블 credit_ledger). 자가진단만 쓴다(실전 응시는 크레딧을 쓰지 않는다).
// 쓰는 양: 가입 30, 응시 시작 10(채점 1회 포함), 롤백 5, AI 채팅 한 턴 1.
// 잔액·차감 API 가 아직 백엔드에 없어 잔액은 보여 주지 않고(준비 중), 응시·채팅도 막지 않는다.

export const CREDIT_COST = { SIGNUP: 30, ATTEMPT_START: 10, ROLLBACK: 5, CHAT_TURN: 1 } as const
