package com.pair.scoring;

import java.util.List;

/**
 * 감점식 채점 기준표. 출처: docs/evaluation/채점_기준표.md
 * 6개 항목(총 100점). 각 항목은 배점에서 시작해 체크 항목에 걸릴 때마다 감점한다.
 * 2026-11-12: 재현성을 빼고 문제 분해력, 위임 판단력을 넣었다 (docs/evaluation/새_평가기준_초안.md).
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
            new Item("usage", "AI 활용력", 20),
            new Item("control", "AI 통제력", 15),
            new Item("decomposition", "문제 분해력", 10),
            new Item("delegation", "위임 판단력", 10),
            new Item("delivery", "AI 결과 도출력", 30),
            new Item("potential", "성과 잠재력", 15));

    public static final List<Check> CHECKS = List.of(
            // ── AI 활용력 (20) ──
            new Check("U0", "usage", Track.ALL, Method.AUTO, 20, "AI에게 한 번도 질문하지 않음 (이 항목 0점)", null),
            new Check("U1", "usage", Track.ALL, Method.JUDGE, 4, "첫 질문에서 무엇을 하려는지(목표)를 밝히지 않음",
                    "응시자의 첫 질문(#T01)에 해결하려는 목표가 드러나지 않으면 걸림."),
            new Check("U2", "usage", Track.ALL, Method.JUDGE, 5, "필요한 코드, 로그, 자료를 붙이지 않아 AI가 추측해서 답하게 함",
                    "AI는 대화창에 붙인 내용만 볼 수 있다. 판단에 필요한 코드, 로그, 자료 수치를 붙이지 않고 질문해서 AI가 일반론이나 추측으로 답한 경우가 핵심 질문에 있으면 걸림."),
            new Check("U3", "usage", Track.ALL, Method.JUDGE, 3, "대부분의 질문에서 원하는 출력 형식이나 범위를 정하지 않음",
                    "질문의 절반 넘게 원하는 답의 형식(예: 3줄, 코드만, 표)이나 범위를 정하지 않았으면 걸림."),
            new Check("U5", "usage", Track.ALL, Method.JUDGE, 3, "막혔을 때 거의 같은 질문을 3번 이상 반복하고 전략을 바꾸지 않음",
                    "거의 같은 내용의 질문을 3번 이상 반복했으면 걸림."),
            new Check("U6", "usage", Track.ALL, Method.JUDGE, 3, "AI 답변을 받은 뒤 이어서 확인하거나 좁혀 묻는 질문이 없음",
                    "모든 질문이 서로 독립된 단발 질문이고, 앞 답변을 바탕으로 확인하거나 좁혀 묻는 질문이 한 번도 없으면 걸림. 질문이 1번뿐이어도 걸림."),
            new Check("U7", "usage", Track.ALL, Method.JUDGE, 2, "핵심 지시가 앞 대화 없이는 뜻이 통하지 않음",
                    "결과물에 쓰인 핵심 지시가 \"그거 다시 해줘\", \"아까 거\"처럼 앞 대화를 모르면 무엇을 원하는지 알 수 없으면 걸림."),
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
            // ── 문제 분해력 (10): 크기(K1, K3)와 순서(K2) ──
            new Check("K0", "decomposition", Track.ALL, Method.AUTO, 10, "AI를 쓰지 않아 AI에게 일을 나눠 맡기는 모습을 볼 수 없음 (이 항목 0점)", null),
            new Check("K1", "decomposition", Track.ALL, Method.JUDGE, 5, "너무 큰 덩어리: 단계 없이 한 덩어리로 맡겨 중간 결과를 확인하지 못함",
                    "대화 전체를 본다. 과제 해결을 단계 없이 한 덩어리로 AI에게 맡겼으면 걸림. 다음 두 경우 모두 해당한다. (1) 원인 파악 → 수정 → 검증, 자료 분석 → 표 → 보고서처럼 앞 결과에 기대는 단계들을 한 요청에 묶어 맡김(예: \"교착 원인 찾아서 고치고 테스트도 짜 줘\"). (2) 원인이나 접근 방향을 함께 정하는 단계 없이 \"이 코드 고쳐줘\", \"기획안 써 줘\"처럼 최종 결과물만 바로 요청하고, 이후 턴에서도 중간 결과(원인, 수정 방향, 검증)를 확인하며 나눠 진행하지 않음. 첫 질문이 결과 요청이어도 이후 원인 확인, 수정, 검증으로 나눠 진행했으면 걸리지 않음. 서로 관계없는 간단한 일을 함께 요청한 것(예: \"오타 고치고 제목도 바꿔 줘\")도 걸리지 않음. K2와의 구분: K2는 요청 순서(확인 전에 해결 요청)만 보고, K1은 대화 전체가 단계 없이 한 덩어리로 진행됐는지를 본다."),
            new Check("K2", "decomposition", Track.ALL, Method.JUDGE, 3, "순서 거꾸로: 앞 단계가 끝나기 전에 뒤 단계를 요청함",
                    "원인이나 현황을 확인하기 전에 해결책부터 요청했으면 걸림. 예: 로그와 코드를 보기 전에 \"락 순서 바꿔 줘\", 자료를 확인하기 전에 \"출시가 맞다는 근거를 써 줘\", 실패하기도 전에 \"안 되면 알아서 해결해 줘\". 크기와 관계없이 순서만 본다."),
            new Check("K3", "decomposition", Track.ALL, Method.JUDGE, 2, "너무 잘게 쪼갬: 한 번에 해도 되는 단순한 일을 여러 턴으로 나눠 턴만 늘림",
                    "확인할 것도 없는 단순한 일을 턴마다 쪼개 요청했으면 걸림(예: \"파일 열어 줘\" → \"첫 줄 읽어 줘\" → \"둘째 줄 읽어 줘\"). 결과를 확인하는 지점에서 나눈 것(예: 표를 확인한 뒤 보고서 요청)은 걸리지 않음."),
            // ── 위임 판단력 (10) ──
            new Check("J0", "delegation", Track.ALL, Method.AUTO, 10, "AI를 쓰지 않아 위임 판단을 볼 수 없음 (이 항목 0점)", null),
            new Check("J1", "delegation", Track.ALL, Method.JUDGE, 4, "과제의 핵심 판단(근본 원인 결정, 최종 결론과 추천안)을 AI에게 맡기고 자기 판단 없이 그대로 씀",
                    "근본 원인을 무엇으로 볼지, 최종 결론이나 추천안을 무엇으로 할지를 AI가 정하게 하고, 응시자가 자기 근거로 고르거나 따져 본 흔적(대화, 후속 답변, NOTES.md, 기획안) 없이 그대로 결과물에 썼으면 걸림. AI 답을 실행이나 자료로 검증했는지는 통제력(C1~C4)에서 보고, 여기서는 판단 자체를 누가 내렸는지만 본다."),
            new Check("J2", "delegation", Track.ALL, Method.JUDGE, 3, "주어진 파일을 열어 보면 바로 아는 내용이나 단순 계산을 AI에게 여러 번 물음",
                    "과제 파일에 그대로 적혀 있는 내용(설정값, 함수 이름, 표의 수치 등)이나 단순 계산을 AI에게 2번 이상 물었으면 걸림. 해당 내용을 붙여 넣고 해석이나 분석을 요청한 것은 걸리지 않음."),
            new Check("J3", "delegation", Track.ALL, Method.JUDGE, 3, "AI에게 맡기기 좋은 반복 작업을 직접 하느라 시간을 많이 씀",
                    "이벤트 요약에서 비슷한 수정(여러 곳의 같은 패턴 코드, 표 정리, 긴 초안 작성)을 AI 도움 없이 직접 오래 편집한 흐름이 보이고, 그 작업을 AI에게 맡긴 질문이 대화에 없으면 걸림. 판단이 필요한 핵심 수정을 직접 한 것은 걸리지 않음. 근거가 분명하지 않으면 걸리지 않음으로 판정한다."),
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

    /** 체크를 구분하는 키. D1~D4 는 개발/비개발 기준이 달라서 "D1-dev", "D1-biz" 처럼 과제 유형을 붙인다. */
    public static String key(Check c) {
        return c.track() == Track.ALL ? c.code() : c.code() + "-" + c.track().name().toLowerCase();
    }

    /** 배점을 바꿀 수 있는지. U0, C0, K0, J0, D0 은 "이 항목 0점"이라 항목 배점과 같아야 해서 고정이다. */
    public static boolean pointsEditable(Check c) {
        return !List.of("U0", "C0", "K0", "J0", "D0").contains(c.code());
    }

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
