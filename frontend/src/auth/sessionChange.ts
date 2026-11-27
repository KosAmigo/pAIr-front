// 세션의 사용자가 바뀌었는지 판단한다. 이전 사용자가 있었고 지금과 다르면(로그아웃·탈퇴·만료·계정 전환) true.
// 처음 로딩(null → 사용자)과 같은 사용자의 정보 갱신은 false 라서 캐시를 지키지 않아도 된다.
export function userChanged(previousId: number | null, currentId: number | null): boolean {
  return previousId !== null && previousId !== currentId
}
