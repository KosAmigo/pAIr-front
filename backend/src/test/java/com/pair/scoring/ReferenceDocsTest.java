package com.pair.scoring;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.pair.ai.EmbeddingClient;

class ReferenceDocsTest {

    /** 글자 수로 2차원 벡터를 만드는 가짜 임베딩: "가격"이 들어가면 (1,0), 아니면 (0,1). */
    static class FakeEmbeddings extends EmbeddingClient {
        FakeEmbeddings() { super(null); }
        @Override public Result embed(List<String> texts) {
            List<float[]> out = new ArrayList<>();
            for (String t : texts) out.add(t.contains("가격") ? new float[]{1, 0} : new float[]{0, 1});
            return new Result(out, texts.size());
        }
    }

    @Test
    void splitsByPageMarker() {
        var chunks = ReferenceDocs.split("자료/a.txt", "--- 1쪽 ---\n첫 쪽\n--- 2쪽 ---\n둘째 쪽\n");
        assertEquals(2, chunks.size());
        assertEquals("2쪽", chunks.get(1).label());
    }

    @Test
    void splitsByHeadingWithoutPageMarker() {
        var chunks = ReferenceDocs.split("자료/a.md", "# 제목\n## 1. 설문\n내용\n## 2. 참고\n내용");
        assertEquals(3, chunks.size());
    }

    @Test
    void queriesAreSentencesWithNumbers() {
        var q = ReferenceDocs.queries("# 기획안\n결론은 조건부 출시다.\n베이직 이탈률은 7.9%로 가장 높다. 숫자 없는 문장이다.");
        assertEquals(List.of("베이직 이탈률은 7.9%로 가장 높다."), q);
    }

    @Test
    void fullModeKeepsEverything() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("자료/a.txt", "--- 1쪽 ---\n가격 이야기\n--- 2쪽 ---\n콘텐츠 이야기");
        var s = new ReferenceDocs(new FakeEmbeddings()).build(m, "가격이 9,900원이다.", false);
        assertEquals("full", s.mode());
        assertTrue(s.text().contains("콘텐츠 이야기"));
    }

    @Test
    void ragModeKeepsCsvWholeAndPicksNearestPages() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("자료/표.csv", "월,가입자\n10월,100");
        StringBuilder doc = new StringBuilder();
        for (int i = 1; i <= 6; i++) doc.append("--- ").append(i).append("쪽 ---\n").append(i == 6 ? "가격 이야기" : "다른 이야기 " + i).append("\n");
        m.put("자료/긴문서.txt", doc.toString());
        var s = new ReferenceDocs(new FakeEmbeddings()).build(m, "가격은 5,900원이다.", true);
        assertEquals("rag", s.mode());
        assertTrue(s.text().contains("10월,100"), "CSV 는 통째로");
        assertTrue(s.text().contains("가격 이야기"), "가장 가까운 쪽은 들어감");
        assertEquals(1 + ReferenceDocs.TOP_K, s.chunksUsed());
        assertEquals(7, s.chunksTotal());
    }
}
