package com.pair.scoring;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.pair.ai.Judge;
import com.pair.scoring.ScoringService.CheckVerdict;

/** 이중 채점: 두 모델 판정을 합치는 규칙. */
class DualJudgeTest {

    record Stub(String name) implements Judge {
        public String model() {
            return name + "-model";
        }

        public <T> Result<T> judge(String system, String cachedPrefix, String user, Class<T> type) {
            throw new UnsupportedOperationException();
        }
    }

    static final Judge A = new Stub("claude"), B = new Stub("openai");
    static final Rubric.Check C4 = Rubric.checksFor(true).stream().filter(c -> c.code().equals("C4")).findFirst().orElseThrow();
    static final Rubric.Check D1 = Rubric.checksFor(false).stream().filter(c -> c.code().equals("D1")).findFirst().orElseThrow();

    static CheckVerdict v(String code, boolean violated, int count, String... ev) {
        return new CheckVerdict(code, violated, count, List.of(ev), "이유");
    }

    static Map<Judge, Map<String, CheckVerdict>> both(CheckVerdict a, CheckVerdict b) {
        Map<Judge, Map<String, CheckVerdict>> m = new LinkedHashMap<>();
        m.put(A, a == null ? Map.of() : Map.of(a.code(), a));
        m.put(B, b == null ? Map.of() : Map.of(b.code(), b));
        return m;
    }

    @Test
    void bothViolatedWithEvidence_deducts() {
        var r = ScoringService.combine(C4, both(v("C4", true, 0, "#T03"), v("C4", true, 0, "#T05")));
        assertEquals("DEDUCTED", r.status());
        assertEquals(2, r.deducted());
        assertEquals(List.of("#T03", "#T05"), r.evidence());
        assertEquals(2, r.judges().size());
    }

    @Test
    void onlyOneViolated_isSplitWithHalfDeduction() {
        var r = ScoringService.combine(C4, both(v("C4", true, 0, "#T03"), v("C4", false, 0)));
        assertEquals("SPLIT", r.status());
        assertEquals(1, r.deducted()); // 2점의 절반
        var odd = Rubric.checksFor(true).stream().filter(c -> c.code().equals("U2")).findFirst().orElseThrow();
        assertEquals(2, ScoringService.combine(odd, both(v("U2", true, 0, "#T01"), v("U2", false, 0))).deducted()); // 5점 → 2 (버림)
    }

    @Test
    void missingVerdictCountsAsNotViolated() {
        var r = ScoringService.combine(C4, both(v("C4", true, 0, "#T03"), null));
        assertEquals("SPLIT", r.status());
    }

    @Test
    void violatedWithoutEvidence_noDeduction() {
        var r = ScoringService.combine(C4, both(v("C4", true, 0), v("C4", true, 0, "#T01")));
        assertEquals("SPLIT", r.status());
        r = ScoringService.combine(C4, both(v("C4", true, 0), v("C4", false, 0)));
        assertEquals("NO_EVIDENCE", r.status());
    }

    @Test
    void bothPassed() {
        var r = ScoringService.combine(C4, both(v("C4", false, 0), v("C4", false, 0)));
        assertEquals("PASSED", r.status());
    }

    @Test
    void perUnitAveragesCounts() {
        var r = ScoringService.combine(D1, both(v("D1", true, 3, "기획안.md"), v("D1", true, 1, "기획안.md")));
        assertEquals(10, r.deducted()); // (15 + 5) / 2
        r = ScoringService.combine(D1, both(v("D1", true, 2, "기획안.md"), v("D1", false, 0)));
        assertEquals(5, r.deducted()); // (10 + 0) / 2
    }

    @Test
    void singleJudgeFallback_usesThatJudgeAlone() {
        Map<Judge, Map<String, CheckVerdict>> m = Map.of(A, Map.of("C4", v("C4", true, 0, "#T02")));
        assertEquals("DEDUCTED", ScoringService.combine(C4, m).status());
    }
}
