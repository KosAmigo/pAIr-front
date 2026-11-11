package com.pair.scoring;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.pair.task.TaskRepository;

import tools.jackson.databind.json.JsonMapper;

class ScoringHelpersTest {

    @Test
    void rubricWeights_sumTo100PerItem() {
        int r = Rubric.ALL.stream().filter(c -> c.item().equals("reproducibility")).mapToInt(Rubric.Criterion::weight).sum();
        int d = Rubric.ALL.stream().filter(c -> c.item().equals("delivery")).mapToInt(Rubric.Criterion::weight).sum();
        assertEquals(100, r);
        assertEquals(100, d);
    }

    @Test
    void countTests_onlyCountsTestFolder() {
        assertEquals(2, ScoringService.countTests(Map.of(
                "test/shop/A.java", "@Test void a(){} @Test void b(){}",
                "src/shop/B.java", "@Test")));
    }

    @Test
    void notesFilled_ignoresTemplateHeadings() {
        assertFalse(ScoringService.notesFilled("# 원인\n\n# 판단 근거\n"));
        assertTrue(ScoringService.notesFilled("# 원인\n잠금 순서\n"));
    }

    @Test
    void adoptionRatio_highWhenAiTextKeptInFinal() {
        var finalGrams = ScoringService.grams("Map<Long, Integer> quantities = new TreeMap<>();");
        assertTrue(ScoringService.adoptionRatio("quantities = new TreeMap<>();", finalGrams) > 0.9);
        assertEquals(0.0, ScoringService.adoptionRatio("완전히 다른 문장입니다 정말로", finalGrams));
    }

    @Test
    void clock_formatsElapsed() {
        Instant start = Instant.parse("2026-11-11T00:00:00Z");
        assertEquals("01:02:03", ScoringService.clock(start, start.plusSeconds(3723)));
    }

    @Test
    void taskLoader_doesNotExposeHiddenFiles() {
        TaskRepository tasks = new TaskRepository(JsonMapper.builder().build());
        Map<String, String> visible = tasks.visibleFiles("order-deadlock");
        assertTrue(visible.containsKey("src/shop/OrderService.java"));
        assertTrue(visible.keySet().stream().noneMatch(k -> k.contains("Hidden")));
        assertTrue(tasks.hiddenFiles("order-deadlock").containsKey("shop/HiddenOrderTest.java"));
        assertTrue(tasks.visibleFiles("pricing-plan").containsKey("자료/요금제별_매출.csv"));
        assertEquals(List.of("## 결론", "## 근거", "## 리스크"), tasks.get("pricing-plan").requiredHeadings());
    }
}
