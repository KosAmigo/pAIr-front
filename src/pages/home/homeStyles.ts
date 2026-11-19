// 홈 섹션들이 함께 쓰는 클래스 (DESIGN.md §7-1)
/** 화면 그림(목업 창) 바깥 틀 */
export const mockFrame = 'relative overflow-hidden rounded-[28px] border border-line bg-panel shadow-lg'
/** 화면 그림 오른쪽 아래에 떠 있는 유리 카드 */
// 다크 무대 위에서도 흰 화면 그림과 한 몸이라 밝은 유리를 쓰고, 불투명도만 0.85로 올린다
export const floatCard = 'glass [.stage-scope_&]:bg-white/85 relative z-10 mx-6 -mt-10 rounded-2xl p-5 shadow-md md:absolute md:right-[-24px] md:-bottom-12 md:mx-0 md:mt-0 md:w-[340px]'
