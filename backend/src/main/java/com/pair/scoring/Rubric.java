package com.pair.scoring;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 재현성 / AI 결과 도출력 하위 기준과 점수 기준.
 * 출처: docs/evaluation/재현성_AI결과도출력.md, 채점 시트 기준표 탭.
 */
public final class Rubric {

    private Rubric() {
    }

    public record Criterion(String code, String item, String name, int weight, String what,
                            String a90, String a70, String a50, String a25) {}

    public static final List<Criterion> ALL = List.of(
            new Criterion("R1", "reproducibility", "지시 명세성", 35,
                    "핵심 턴의 지시에 목표, 입력 맥락, 제약, 출력 형식, 완료 조건이 담겼는가. 길이가 아니라 필요한 정보를 덮었는지 본다.",
                    "핵심 턴 대부분이 5요소를 모두 담음", "핵심 턴이 4요소를 담음",
                    "2~3요소만 담음. 의도는 보이나 조건이 빠짐", "1요소 이하, 또는 무관한 내용이 대부분인 장문"),
            new Criterion("R2", "reproducibility", "출력 안정성", 40,
                    "핵심 턴을 같은 회사, 모델, 요청 설정으로 다시 실행했을 때 같은 해결책이 나오는가.",
                    "", "", "", ""),
            new Criterion("R3", "reproducibility", "과정 일관성", 25,
                    "같은 종류의 요청에 같은 방식을 쓰는가. 후속 질문에서 설명한 절차가 실제 대화 기록과 맞는가.",
                    "요청 방식이 일관되고, 설명한 절차가 로그 순서와 일치", "대체로 일관. 설명과 로그가 1곳 어긋남",
                    "요청 방식이 매번 다르거나, 설명과 로그가 2곳 이상 어긋남", "설명한 절차가 로그와 맞지 않거나 설명하지 못함"),
            new Criterion("D1", "delivery", "요구사항 충족", 35,
                    "필수 요구사항을 만족하는가. 개발은 숨은 테스트, 비개발은 필수 항목 체크리스트.",
                    "필수 100% + 선택 대부분 충족", "필수 100% 충족",
                    "필수 일부 누락 (70% 이상 충족)", "필수 70% 미만 충족 또는 동작하지 않음"),
            new Criterion("D2", "delivery", "결과물 완성도", 20,
                    "엣지 케이스, 구조, 가독성, 실무에 바로 쓸 수 있는지.",
                    "엣지 케이스까지 처리, 구조가 명확해 바로 쓸 수 있음", "주요 경로는 탄탄하나 엣지 케이스 일부 누락",
                    "동작은 하나 구조나 가독성 문제로 손봐야 함", "실무에 쓰기 어려움"),
            new Criterion("D3", "delivery", "AI 산출물 통합력", 20,
                    "AI 출력을 골라서 맥락에 맞게 고쳐 넣었는가. AI 오답이 최종본에 남았는가. 채택률 자체로 채점하지 않는다.",
                    "AI 제안을 골라 고쳐 넣었고 AI 오류가 남지 않음", "대부분 고쳐 넣었으나 사소한 AI 오류 1개 남음",
                    "AI 출력을 거의 그대로 붙임. 오류는 일부 걸러짐", "AI 오답이 최종본에 그대로 남음"),
            new Criterion("D4", "delivery", "도출 효율", 15,
                    "첫 유효 결과까지 걸린 시간. 과제별 목표 시간 구간으로 환산. D1이 40점 미만이면 0점.",
                    "", "", "", ""),
            new Criterion("D5", "delivery", "결과 설명력", 10,
                    "결과물과 채택하지 않은 AI 제안을 자기 말로 설명하는가. 후속 질문 답변으로 본다.",
                    "결과와 버린 AI 제안을 근거와 함께 자기 말로 설명", "결과는 설명하나 버린 제안의 이유가 약함",
                    "AI 답변을 반복하는 수준의 설명", "설명하지 못함"));

    public static Criterion get(String code) {
        return ALL.stream().filter(c -> c.code().equals(code)).findFirst().orElseThrow();
    }

    public static final Map<String, String> ITEM_NAMES = new LinkedHashMap<>();

    static {
        ITEM_NAMES.put("reproducibility", "재현성");
        ITEM_NAMES.put("delivery", "AI 결과 도출력");
    }

    /** 채점 모델에 줄 점수 기준 텍스트. */
    public static String anchorsText(List<String> codes) {
        StringBuilder sb = new StringBuilder();
        for (String code : codes) {
            Criterion c = get(code);
            sb.append("### ").append(c.code()).append(" ").append(c.name()).append("\n")
              .append("무엇을 보나: ").append(c.what()).append("\n")
              .append("- 90점: ").append(c.a90()).append("\n")
              .append("- 70점: ").append(c.a70()).append("\n")
              .append("- 50점: ").append(c.a50()).append("\n")
              .append("- 25점: ").append(c.a25()).append("\n\n");
        }
        return sb.toString();
    }
}
