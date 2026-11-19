// 조건부 className 합치기. 컴포넌트 파일(ui.tsx)과 분리해야 개발 중 화면 부분 갱신(Fast Refresh)이 동작한다.
export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}
