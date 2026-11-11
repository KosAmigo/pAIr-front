package com.pair.scoring;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.pair.task.TaskRepository;

import com.fasterxml.jackson.databind.json.JsonMapper;

class ScoringHelpersTest {

    @Test
    void rubric_fiveItemsTotal100() {
        assertEquals(5, Rubric.ITEMS.size());
        assertEquals(100, Rubric.total());
        assertTrue(Rubric.ITEMS.stream().noneMatch(i -> i.key().equals("literacy")));
    }

    @Test
    void rubric_checksForTrack_haveUniqueCodes() {
        for (boolean dev : new boolean[] {true, false}) {
            var codes = Rubric.checksFor(dev).stream().map(Rubric.Check::code).toList();
            assertEquals(codes.size(), new java.util.HashSet<>(codes).size());
            assertTrue(codes.containsAll(List.of("U0", "C1", "R1", "D1", "D5", "P1")));
        }
        assertTrue(Rubric.checksFor(true).stream().anyMatch(c -> c.code().equals("D0")));
        assertTrue(Rubric.checksFor(false).stream().noneMatch(c -> c.code().equals("D0")));
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
        TaskRepository tasks = new TaskRepository(JsonMapper.builder().findAndAddModules().disable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build());
        Map<String, String> visible = tasks.visibleFiles("order-deadlock");
        assertTrue(visible.containsKey("src/shop/OrderService.java"));
        assertTrue(visible.keySet().stream().noneMatch(k -> k.contains("Hidden")));
        assertTrue(tasks.hiddenFiles("order-deadlock").containsKey("shop/HiddenOrderTest.java"));
        assertTrue(tasks.visibleFiles("pricing-plan").containsKey("자료/요금제별_매출.csv"));
        assertEquals(List.of("## 결론", "## 근거", "## 리스크"), tasks.get("pricing-plan").requiredHeadings());
    }
}
