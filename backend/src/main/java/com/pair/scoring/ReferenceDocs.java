package com.pair.scoring;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.pair.ai.EmbeddingClient;

/**
 * 비개발 채점에 넣을 "제공 자료" 부분을 만든다.
 * full: 자료를 통째로. rag: 제출물에서 숫자가 들어간 문장마다 가까운 조각 3개를 찾아 그 조각만 넣는다.
 * 숫자 표(CSV)는 조각으로 나누면 행끼리 구분이 안 돼 검색이 부정확하므로 항상 통째로 넣는다(docs/erd/sample 실험).
 * 조각은 쪽 단위("--- N쪽 ---" 줄로 구분), 쪽 표시가 없으면 "## " 제목 단위다(docs/기술검증_보고서.md 13번).
 */
@Component
public class ReferenceDocs {

    static final int TOP_K = 3;
    static final int MAX_QUERIES = 40;
    private static final Pattern PAGE = Pattern.compile("(?m)^--- (\\d+)쪽 ---\\s*$");
    private static final Pattern HEADING = Pattern.compile("(?m)^(?=## )");
    private static final Pattern DIGIT = Pattern.compile("\\d");

    private final EmbeddingClient embeddings;

    public ReferenceDocs(EmbeddingClient embeddings) {
        this.embeddings = embeddings;
    }

    /** 채점 프롬프트에 넣을 글과 기록용 수치. */
    public record Section(String text, String mode, int chars, int chunksUsed, int chunksTotal, long embedTokens) {}

    record Chunk(String path, String label, String text) {}

    public Section build(Map<String, String> materials, String submission, boolean rag) {
        if (!rag || materials.isEmpty()) {
            StringBuilder sb = new StringBuilder();
            materials.forEach((path, content) -> sb.append("## ").append(path).append("\n```\n").append(content).append("\n```\n"));
            return new Section(sb.toString(), "full", sb.length(), 0, 0, 0);
        }
        List<Chunk> tables = new ArrayList<>();
        List<Chunk> chunks = new ArrayList<>();
        materials.forEach((path, content) -> {
            if (path.toLowerCase().endsWith(".csv")) tables.add(new Chunk(path, "표 전체", content));
            else chunks.addAll(split(path, content));
        });
        List<String> queries = queries(submission);
        Set<Integer> picked = new LinkedHashSet<>();
        long tokens = 0;
        if (!chunks.isEmpty() && !queries.isEmpty()) {
            List<String> texts = new ArrayList<>();
            chunks.forEach(c -> texts.add(c.text()));
            texts.addAll(queries);
            EmbeddingClient.Result r = embeddings.embed(texts);
            tokens = r.tokens();
            List<float[]> cv = r.vectors().subList(0, chunks.size());
            for (float[] q : r.vectors().subList(chunks.size(), texts.size())) picked.addAll(topK(q, cv, TOP_K));
        }
        StringBuilder sb = new StringBuilder();
        for (Chunk t : tables) append(sb, t);
        for (int i = 0; i < chunks.size(); i++) if (picked.contains(i)) append(sb, chunks.get(i)); // 원래 순서대로
        return new Section(sb.toString(), "rag", sb.length(), picked.size() + tables.size(), chunks.size() + tables.size(), tokens);
    }

    private static void append(StringBuilder sb, Chunk c) {
        sb.append("## ").append(c.path()).append(" (").append(c.label()).append(")\n```\n").append(c.text().strip()).append("\n```\n");
    }

    static List<Chunk> split(String path, String content) {
        List<Chunk> out = new ArrayList<>();
        Matcher m = PAGE.matcher(content);
        List<int[]> marks = new ArrayList<>();
        while (m.find()) marks.add(new int[]{m.start(), m.end(), Integer.parseInt(m.group(1))});
        if (!marks.isEmpty()) {
            for (int i = 0; i < marks.size(); i++) {
                int end = i + 1 < marks.size() ? marks.get(i + 1)[0] : content.length();
                String text = content.substring(marks.get(i)[1], end);
                if (!text.isBlank()) out.add(new Chunk(path, marks.get(i)[2] + "쪽", text));
            }
            return out;
        }
        String[] parts = HEADING.split(content);
        for (int i = 0; i < parts.length; i++) {
            if (!parts[i].isBlank()) out.add(new Chunk(path, "부분 " + (i + 1), parts[i]));
        }
        return out;
    }

    /** 제출물에서 숫자가 들어간 문장(줄·마침표 기준)을 검색 문장으로 쓴다. 없으면 제출물 앞부분 하나. */
    static List<String> queries(String submission) {
        List<String> out = new ArrayList<>();
        for (String s : submission.split("(?<=[.!?。])\\s+|\\n+")) {
            String t = s.replaceAll("^[#>*\\-|\\s]+", "").strip();
            if (t.length() >= 8 && DIGIT.matcher(t).find() && !out.contains(t)) out.add(t);
            if (out.size() >= MAX_QUERIES) break;
        }
        if (out.isEmpty() && !submission.isBlank()) out.add(submission.strip().substring(0, Math.min(1500, submission.strip().length())));
        return out;
    }

    static List<Integer> topK(float[] q, List<float[]> vs, int k) {
        List<Integer> idx = new ArrayList<>();
        for (int i = 0; i < vs.size(); i++) idx.add(i);
        double[] sim = new double[vs.size()];
        for (int i = 0; i < vs.size(); i++) sim[i] = cosine(q, vs.get(i));
        idx.sort((a, b) -> Double.compare(sim[b], sim[a]));
        return idx.subList(0, Math.min(k, idx.size()));
    }

    static double cosine(float[] a, float[] b) {
        double dot = 0, na = 0, nb = 0;
        for (int i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        return na == 0 || nb == 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
    }
}
