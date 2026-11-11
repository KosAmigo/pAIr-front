package com.pair.attempt;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * AI 답변 속 파일 수정 제안. 형식:
 * <pre>
 * ```edit path=src/shop/OrderService.java
 * <<<<<<< SEARCH
 * (바꿀 원래 내용)
 * =======
 * (새 내용)
 * >>>>>>> REPLACE
 * ```
 * </pre>
 * 블록 하나가 제안 하나이고, 안에 SEARCH/REPLACE 쌍이 여러 개 있을 수 있다. 응시자가 [적용]을 누르면 모두 한 번에 반영한다.
 * SEARCH 가 비어 있으면 새 파일 만들기다.
 */
public final class EditProposals {

    private EditProposals() {
    }

    public record Hunk(String search, String replace) {}

    public record Proposal(int index, String path, List<Hunk> hunks) {
        public boolean newFile() {
            return hunks.size() == 1 && hunks.get(0).search().isBlank();
        }
    }

    /** 프런트(src/lib/edits.ts)와 같은 규칙이어야 한다. */
    static final Pattern BLOCK = Pattern.compile("```edit[ \\t]+path=(\\S+)[ \\t]*\\r?\\n(.*?)\\r?\\n```", Pattern.DOTALL);
    static final Pattern HUNK = Pattern.compile(
            "<<<<<<< SEARCH\\r?\\n(.*?)(?:\\r?\\n)?=======\\r?\\n(.*?)(?:\\r?\\n)?>>>>>>> REPLACE", Pattern.DOTALL);

    public static List<Proposal> parse(String text) {
        List<Proposal> out = new ArrayList<>();
        if (text == null) return out;
        Matcher m = BLOCK.matcher(text);
        int i = 0;
        while (m.find()) {
            List<Hunk> hunks = new ArrayList<>();
            Matcher h = HUNK.matcher(m.group(2));
            while (h.find()) hunks.add(new Hunk(h.group(1), h.group(2)));
            if (!hunks.isEmpty()) out.add(new Proposal(i, m.group(1).trim(), hunks));
            i++; // 형식이 깨진 블록도 번호는 센다 (프런트 순서와 맞추기 위해)
        }
        return out;
    }

    /**
     * 현재 파일 내용에 제안을 적용한 결과. 바꿀 부분을 찾지 못하면 빈 값.
     * @param current 지금 파일 내용, 파일이 없으면 null
     */
    public static Optional<String> apply(Proposal p, String current) {
        if (p.newFile()) {
            return current == null || current.isBlank() ? Optional.of(p.hunks().get(0).replace()) : Optional.empty();
        }
        if (current == null) return Optional.empty();
        boolean crlf = current.contains("\r\n");
        String s = current.replace("\r\n", "\n");
        for (Hunk h : p.hunks()) {
            String search = h.search().replace("\r\n", "\n");
            String replace = h.replace().replace("\r\n", "\n");
            int at = s.indexOf(search);
            if (at < 0 || search.isEmpty()) {
                // 줄 끝 공백 차이는 봐준다
                Optional<int[]> loose = looseFind(s, search);
                if (loose.isEmpty()) return Optional.empty();
                int[] r = loose.get();
                s = s.substring(0, r[0]) + replace + s.substring(r[1]);
            } else {
                s = s.substring(0, at) + replace + s.substring(at + search.length());
            }
        }
        return Optional.of(crlf ? s.replace("\n", "\r\n") : s);
    }

    /** 줄마다 오른쪽 공백을 무시하고 연속된 줄을 찾는다. 찾으면 원문 기준 [시작, 끝) 위치. */
    static Optional<int[]> looseFind(String s, String search) {
        String[] want = search.split("\n", -1);
        if (want.length == 0 || search.isBlank()) return Optional.empty();
        String[] lines = s.split("\n", -1);
        int[] starts = new int[lines.length + 1];
        for (int i = 0, pos = 0; i < lines.length; i++) {
            starts[i] = pos;
            pos += lines[i].length() + 1;
        }
        starts[lines.length] = s.length() + 1;
        outer:
        for (int i = 0; i + want.length <= lines.length; i++) {
            for (int j = 0; j < want.length; j++) {
                if (!lines[i + j].stripTrailing().equals(want[j].stripTrailing())) continue outer;
            }
            int end = starts[i + want.length] - 1;
            return Optional.of(new int[] {starts[i], Math.min(end, s.length())});
        }
        return Optional.empty();
    }
}
