package com.pair.grader;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.pair.scoring.Rubric;
import com.pair.scoring.Rubric.Check;

/**
 * 채점 프롬프트 버전 하나. grader/versions/{id}.json 으로 저장하고 git 으로 팀원과 공유한다.
 * 체크 항목 구성과 배점은 고정이고(2026-11-12 결정), 판정 기준 문장(hint)과 공통 프롬프트만 바꾼다.
 * points 는 기록용으로 남지만 채점에는 코드(Rubric)의 배점을 쓴다.
 *
 * @param checks 체크 키(Rubric.key) → 판정 기준과 배점
 */
public record PromptVersion(String id, String name, String author, String note, Instant createdAt, String parent,
                            String judgeSystem, String replaySystem, Map<String, CheckPrompt> checks) {

    /** hint: 판정 체크의 판정 기준 문장(자동 체크는 null). points: 감점(단위 감점이면 1개당). */
    public record CheckPrompt(String hint, int points) {}

    /** 이 버전의 판정 기준과 배점을 적용한 체크 목록. 버전에 없는 체크는 코드 기본값을 쓴다. */
    public List<Check> apply(List<Check> base) {
        List<Check> out = new ArrayList<>();
        for (Check c : base) {
            CheckPrompt p = checks == null ? null : checks.get(Rubric.key(c));
            if (p == null) {
                out.add(c);
                continue;
            }
            int points = c.points(); // 배점 고정
            String hint = c.method() == Rubric.Method.JUDGE && p.hint() != null && !p.hint().isBlank() ? p.hint() : c.judgeHint();
            out.add(new Check(c.code(), c.item(), c.track(), c.method(), points, c.label(), hint));
        }
        return out;
    }
}
