// 회차 AI 비용 표시 형식 (AiCostCard)

/** 달러 금액: 1달러 미만은 소수 넷째 자리까지, 그 이상은 둘째 자리까지 */
export function fmtUsd(usd: number): string {
  return usd < 1 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

/** 토큰 수: 1만 이상은 "12.3만", 그 아래는 천 단위 쉼표 */
export function fmtTokens(n: number): string {
  return n >= 10_000 ? `${(n / 10_000).toFixed(1)}만` : n.toLocaleString('ko-KR')
}
