package com.pair.run;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.pair.config.PairProperties;
import com.pair.task.TaskRepository;

import com.fasterxml.jackson.databind.json.JsonMapper;

/** 개발 과제 검증: 원본 코드는 숨은 필수 테스트에서 실패하고, 정답 코드는 모두 통과해야 한다. */
class CodeRunnerTaskTest {

    private final TaskRepository tasks = new TaskRepository(JsonMapper.builder().findAndAddModules().disable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build());
    private final CodeRunner runner = new CodeRunner(new PairProperties(null, null, null, null,
            new PairProperties.Run(60), null, null));

    private Map<String, String> srcPlusHidden(Map<String, String> src) {
        Map<String, String> all = new HashMap<>();
        src.forEach((k, v) -> {
            if (k.startsWith("src/")) all.put(k, v);
        });
        tasks.hiddenFiles("order-deadlock").forEach((k, v) -> all.put("hidden/" + k, v));
        return all;
    }

    @Test
    void visibleTest_passesOnOriginalCode() {
        Map<String, String> files = tasks.visibleFiles("order-deadlock");
        CodeRunner.RunResult r = runner.run(files);
        r.lines().forEach(System.out::println);
        assertTrue(r.compiled());
        assertEquals(1, r.passed());
        assertEquals(0, r.failed());
    }

    @Test
    void hiddenRequiredTests_failOnOriginalCode() {
        CodeRunner.RunResult r = runner.run(srcPlusHidden(tasks.visibleFiles("order-deadlock")));
        r.tests().forEach(t -> System.out.println(t.passed() + " " + t.name()));
        assertTrue(r.compiled());
        assertFalse(r.tests().stream().filter(t -> t.name().contains("required_")).allMatch(CodeRunner.TestCase::passed));
    }

    @Test
    void hiddenTests_allPassOnSolution() throws IOException {
        Map<String, String> files = new HashMap<>(tasks.visibleFiles("order-deadlock"));
        try (InputStream in = getClass().getResourceAsStream("/solutions/order-deadlock/OrderService.java")) {
            files.put("src/shop/OrderService.java", new String(in.readAllBytes(), StandardCharsets.UTF_8));
        }
        CodeRunner.RunResult r = runner.run(srcPlusHidden(files));
        r.tests().forEach(t -> System.out.println(t.passed() + " " + t.name() + " " + t.message()));
        assertTrue(r.compiled());
        assertEquals(5, r.passed());
        assertEquals(0, r.failed());
    }
}
