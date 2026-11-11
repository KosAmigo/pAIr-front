package com.pair.scoring;

import java.util.List;

/**
 * 감점식 채점 기준표. 출처: docs/evaluation/채점_기준표.md
 * 5개 항목(총 100점). 각 항목은 배점에서 시작해 체크 항목에 걸릴 때마다 감점한다.
 */
public final class Rubric {

    private Rubric() {
    }

    public record Item(String key, String name, int max) {}

    /** 판정 방식: AUTO = 시스템 기록으로 판정, JUDGE = 채점 모델이 근거와 함께 판정 */
    public enum Method { AUTO, JUDGE }

    /** 적용 과제: ALL, DEV(개발), BIZ(비개발) */
    public enum Track { ALL, DEV, BIZ }

    /**
     * @param points 걸렸을 때 감점(양수). 단위 감점이면 1개당 감점.
     * @param judgeHint 채점 모델에 줄 판정 기준 설명 (JUDGE 만)
     */
    public record Check(String code, String item, Track track, Method method, int points, String label, String judgeHint) {}

    public static final List<Item> ITEMS = List.of(
            new Item("usage", "AI 활용력", 25),
            new Item("control", "AI 통제력", 15),
            new Item("reproducibility", "재현성", 15),
            new Item("delivery", "AI 결과 도출력", 30),
            new Item("potential", "성과 잠재력", 15));

    public static final List<Check> CHECKS = List.of(
            // ── AI 활용력 (25) ──
            new Check("U0", "usage", Track.ALL, Method.AUTO, 25, "AI에게 한 번도 질문하지 않음 (이 항목 0점)", null),
            new Check("U1", "usage", Track.ALL, Method.JUDGE, 4, "첫 질문에서 무엇을 하려는지(목표)를 밝히지 않음",
                    "응시자의 첫 질문(#T01)에 해결하려는 목표가 드러나지 않으면 걸림."),
            new Check("U2", "usage", Track.ALL, Method.JUDGE, 5, "필요한 코드, 로그, 자료를 붙이지 않아 AI가 추측해서 답하게 함",
                    "AI는 대화창에 붙인 내용만 볼 수 있다. 판단에 필요한 코드, 로그, 자료 수치를 붙이지 않고 질문해서 AI가 일반론이나 추측으로 답한 경우가 핵심 질문에 있으면 걸림."),
            new Check("U3", "usage", Track.ALL, Method.JUDGE, 3, "대부분의 질문에서 원하는 출력 형식이나 범위를 정하지 않음",
                    "질문의 절반 넘게 원하는 답의 형식(예: 3줄, 코드만, 표)이나 범위를 정하지 않았으면 걸림."),
            new Check("U4", "usage", Track.ALL, Method.JUDGE, 5, "큰 문제를 한 번에 통째로 맡기고 단계를 나누지 않음",
                    "\"이 과제 전부 풀어줘\"처럼 과제 전체를 한 번에 맡기고, 원인 파악, 수정, 검증 같은 단계를 나눠 진행하지 않았으면 걸림."),
            new Check("U5", "usage", Track.ALL, Method.JUDGE, 3, "막혔을 때 거의 같은 질문을 3번 이상 반복하고 전략을 바꾸지 않음",
                    "거의 같은 내용의 질문을 3번 이상 반복했으면 걸림."),
            new Check("U6", "usage", Track.ALL, Method.JUDGE, 3, "AI 답변을 받은 뒤 이어서 확인하거나 좁혀 묻는 질문이 없음",
                    "모든 질문이 서로 독립된 단발 질문이고, 앞 답변을 바탕으로 확인하거나 좁혀 묻는 질문이 한 번도 없으면 걸림. 질문이 1번뿐이어도 걸림."),
            // ── AI 통제력 (15) ──
            new Check("C0", "control", Track.ALL, Method.AUTO, 15, "AI를 쓰지 않아 AI 결과를 검증하고 통제하는 모습을 볼 수 없음 (이 항목 0점)", null),
            new Check("C1", "control", Track.ALL, Method.JUDGE, 5, "AI가 준 코드나 수치를 실행, 테스트, 자료 대조 없이 최종본에 넣음",
                    "최종본에 들어간 AI 코드나 수치를 응시자가 테스트 실행, 직접 확인 질문, 자료 대조로 검증한 흔적이 없으면 걸림. 이벤트 요약의 테스트 실행 기록도 참고한다. AI 수정 제안을 [적용]한 뒤 테스트 실행이나 확인 없이 제출했으면 걸림."),
            new Check("C2", "control", Track.ALL, Method.JUDGE, 5, "AI의 오답이나 근거 없는 수치가 최종본에 남음",
                    "AI 답변에 있던 틀린 내용이나 제공 자료에 없는 수치가 최종 파일에 그대로 남아 있으면 걸림. 비개발 과제는 문서의 수치가 자료와 맞는지 확인한다."),
            new Check("C3", "control", Track.ALL, Method.JUDGE, 3, "증상만 가리는 제안(타임아웃 늘리기, 전체 잠금 등)이나 근거 없는 주장을 따져 보지 않고 받아들임",
                    "AI가 근본 원인 대신 증상 완화책(타임아웃, 풀 크기 늘리기, 메서드 전체 synchronized 등)이나 근거 없는 주장을 냈는데 응시자가 따져 보지 않고 받아들였으면 걸림."),
            new Check("C4", "control", Track.ALL, Method.JUDGE, 2, "AI 답변의 근거나 이유를 한 번도 확인하지 않음",
                    "\"왜?\", \"근거는?\", \"확실해?\"처럼 AI 답변의 근거를 묻거나 반박한 적이 한 번도 없으면 걸림."),
            // ── 재현성 (15) ──
            new Check("R0", "reproducibility", Track.ALL, Method.AUTO, 15, "AI를 쓰지 않아 재현할 AI 작업이 없음 (이 항목 0점)", null),
            new Check("R1", "reproducibility", Track.ALL, Method.AUTO, 8, "핵심 AI 답변을 같은 요청으로 다시 실행하면 다른 해결책이 나옴 (다른 비율 × 8)", null),
            new Check("R2", "reproducibility", Track.ALL, Method.JUDGE, 2, "핵심 지시가 앞 대화 없이는 뜻이 통하지 않음",
                    "결과물에 쓰인 핵심 지시가 \"그거 다시 해줘\", \"아까 거\"처럼 앞 대화를 모르면 무엇을 원하는지 알 수 없으면 걸림."),
            new Check("R3", "reproducibility", Track.ALL, Method.JUDGE, 5, "후속 질문에서 설명한 절차가 실제 대화 기록과 다름",
                    "후속 질문 답변에서 설명한 AI 사용 절차(어떤 지시를 어떤 순서로 줬는지)가 실제 대화 기록과 다르면 걸림. 무응답도 걸림."),
            // ── AI 결과 도출력 (30) ──
            new Check("D0", "delivery", Track.DEV, Method.AUTO, 30, "제출 코드가 컴파일되지 않음 (이 항목 0점)", null),
            new Check("D1", "delivery", Track.DEV, Method.AUTO, 5, "숨은 필수 테스트 실패 (1개당)", null),
            new Check("D1", "delivery", Track.BIZ, Method.JUDGE, 5, "필수 체크리스트 미충족 (1개당)",
                    "숨은 체크리스트의 필수 항목 1~4(결론, 근거 3개, 잠식 효과, 리스크와 대응) 중 충족하지 못한 개수를 count 에 넣는다. 하나라도 미충족이면 걸림."),
            new Check("D2", "delivery", Track.DEV, Method.AUTO, 2, "엣지 케이스 누락 (숨은 선택 테스트 실패)", null),
            new Check("D2", "delivery", Track.BIZ, Method.JUDGE, 2, "설문 의향을 실제 전환율로 보정하지 않음",
                    "설문의 '바꾸겠다', '유지했을 것' 같은 의향 수치를 실제 전환율(자료의 50~60%)로 보정하지 않고 그대로 계산에 썼으면 걸림."),
            new Check("D3", "delivery", Track.DEV, Method.AUTO, 3, "수정을 확인하는 테스트를 추가하지 않음", null),
            new Check("D3", "delivery", Track.BIZ, Method.JUDGE, 3, "근거 수치에 출처(어느 자료인지)를 밝히지 않음",
                    "기획안의 근거 수치가 어느 자료(설문 요약, 매출 CSV)에서 왔는지 밝히지 않았으면 걸림."),
            new Check("D4", "delivery", Track.DEV, Method.JUDGE, 3, "NOTES.md의 원인 설명이 비어 있거나 핵심 원인과 맞지 않음",
                    "숨은 정답 설명(answer.md)의 핵심 원인 1(잠금 순서 불일치로 인한 교착)을 NOTES.md나 후속 답변에서 설명하지 못했으면 걸림. 원인 2(재고 미복구)만 쓰거나 \"타임아웃이 짧아서\", \"예외 처리가 없어서\" 같은 증상만 쓴 경우도 걸림. 코드가 맞게 고쳐졌는지와는 별개로 설명만 본다."),
            new Check("D4", "delivery", Track.BIZ, Method.JUDGE, 2, "결론과 근거가 서로 맞지 않음",
                    "근거가 가리키는 방향과 결론(찬성, 반대, 조건부)이 서로 맞지 않으면 걸림."),
            new Check("D5", "delivery", Track.ALL, Method.AUTO, 4, "첫 유효 결과가 30분을 넘김(-2) 또는 도달하지 못함(-4)", null),
            // ── 성과 잠재력 (15) ──
            new Check("P1", "potential", Track.ALL, Method.JUDGE, 5, "후속 질문 답변이 근거 없이 한두 마디에 그침",
                    "후속 질문 답변 대부분이 근거 없는 한두 마디이거나 무응답이면 걸림."),
            new Check("P2", "potential", Track.ALL, Method.JUDGE, 4, "채택하지 않은 AI 제안과 그 이유를 설명하지 못함",
                    "후속 질문에서 채택하지 않은 AI 제안과 이유를 구체적으로 말하지 못했거나, 말한 내용이 대화 기록과 맞지 않으면(없던 AI 제안을 지어냄) 걸림. 대화에 거절할 만한 AI 제안이 없었고 응시자가 그렇게 말했거나, 응시자가 스스로 검토하고 버린 대안과 이유를 구체적으로 말했으면 걸리지 않음."),
            new Check("P3", "potential", Track.ALL, Method.JUDGE, 3, "오류나 테스트 실패에서 원인을 확인하지 않고 같은 시도를 반복함",
                    "이벤트 요약과 대화에서, 실패 뒤 원인을 확인하지 않고 같은 실행이나 같은 요청을 반복한 흐름이 보이면 걸림. 실패가 없었으면 걸리지 않음."),
            new Check("P4", "potential", Track.ALL, Method.JUDGE, 3, "결과의 한계나 남은 위험을 전혀 언급하지 않음",
                    "후속 답변, NOTES.md, 기획안 어디에도 결과의 한계, 남은 위험, 추가로 확인할 것을 언급하지 않았으면 걸림."));

    public static Item item(String key) {
        return ITEMS.stream().filter(i -> i.key().equals(key)).findFirst().orElseThrow();
    }

    /** 과제 유형(dev/biz)에 적용되는 체크 항목. */
    public static List<Check> checksFor(boolean dev) {
        return CHECKS.stream().filter(c -> c.track() == Track.ALL || (dev ? c.track() == Track.DEV : c.track() == Track.BIZ)).toList();
    }

    public static int total() {
        return ITEMS.stream().mapToInt(Item::max).sum();
    }
}
