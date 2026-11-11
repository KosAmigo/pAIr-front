package com.pair.attempt;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class EditProposalsTest {

    static final String REPLY = """
            잠금 순서를 정렬하세요.

            ```edit path=src/shop/OrderService.java
            <<<<<<< SEARCH
                for (Item i : items) {
                    lock(i);
                }
            =======
                for (Item i : sorted(items)) {
                    lock(i);
                }
            >>>>>>> REPLACE
            ```

            테스트도 추가합니다.

            ```edit path=test/shop/NewTest.java
            <<<<<<< SEARCH
            =======
            class NewTest {}
            >>>>>>> REPLACE
            ```
            """;

    @Test
    void parse_findsBlocksInOrder() {
        List<EditProposals.Proposal> ps = EditProposals.parse(REPLY);
        assertEquals(2, ps.size());
        assertEquals("src/shop/OrderService.java", ps.get(0).path());
        assertEquals(1, ps.get(0).hunks().size());
        assertTrue(ps.get(1).newFile());
        assertEquals("class NewTest {}", ps.get(1).hunks().get(0).replace());
    }

    @Test
    void apply_replacesExactAndKeepsCrlf() {
        var p = EditProposals.parse(REPLY).get(0);
        String file = "class A {\r\n    for (Item i : items) {\r\n        lock(i);\r\n    }\r\n}\r\n";
        String out = EditProposals.apply(p, file).orElseThrow();
        assertTrue(out.contains("sorted(items)"));
        assertTrue(out.contains("\r\n"));
    }

    @Test
    void apply_ignoresTrailingSpaces_andFailsWhenMissing() {
        var p = EditProposals.parse(REPLY).get(0);
        String file = "    for (Item i : items) {   \n        lock(i);\n    }\n";
        assertTrue(EditProposals.apply(p, file).orElseThrow().contains("sorted"));
        assertTrue(EditProposals.apply(p, "nothing here").isEmpty());
    }

    @Test
    void newFile_onlyWhenAbsent() {
        var p = EditProposals.parse(REPLY).get(1);
        assertEquals("class NewTest {}", EditProposals.apply(p, null).orElseThrow());
        assertTrue(EditProposals.apply(p, "class Old {}").isEmpty());
    }

    @Test
    void decisions_applyWinsOverEarlierReject() {
        JsonMapper m = JsonMapper.builder().build();
        List<JsonNode> ev = List.of(
                m.readTree("{\"type\":\"aiEdit\",\"turn\":2,\"index\":0,\"action\":\"reject\"}"),
                m.readTree("{\"type\":\"aiEdit\",\"turn\":2,\"index\":0,\"action\":\"apply\"}"),
                m.readTree("{\"type\":\"aiEdit\",\"turn\":4,\"index\":1,\"action\":\"reject\"}"));
        var d = AttemptService.decisions(ev);
        assertEquals("APPLIED", d.get("2:0"));
        assertEquals("REJECTED", d.get("4:1"));
    }
}
