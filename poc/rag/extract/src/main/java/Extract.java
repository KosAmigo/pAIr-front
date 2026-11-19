import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.tika.metadata.Metadata;
import org.apache.tika.parser.ParseContext;
import org.apache.tika.parser.pdf.PDFParser;
import org.apache.tika.sax.ToXMLContentHandler;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;

/**
 * RAG 기술검증 C: 같은 PDF 를 PDFBox 와 Tika 로 쪽마다 추출해 pages.json 으로 남긴다.
 * 사용: gradlew run --args="<pdf 폴더> <출력 json>"
 */
public class Extract {
    public static void main(String[] args) throws Exception {
        Path dir = Path.of(args[0]);
        List<Map<String, Object>> rows = new ArrayList<>();
        long pdfboxMs = 0, tikaMs = 0;
        try (var files = Files.list(dir)) {
            for (Path pdf : files.filter(p -> p.toString().endsWith(".pdf")).sorted().toList()) {
                String doc = pdf.getFileName().toString().replace(".pdf", "");
                long t = System.nanoTime();
                List<String> a = pdfbox(pdf, true);
                List<String> a2 = pdfbox(pdf, false);
                pdfboxMs += (System.nanoTime() - t) / 1_000_000;
                t = System.nanoTime();
                List<String> b = tika(pdf);
                tikaMs += (System.nanoTime() - t) / 1_000_000;
                for (int i = 0; i < Math.max(a.size(), b.size()); i++) {
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("doc", doc);
                    r.put("page", i + 1);
                    r.put("pdfbox", i < a.size() ? a.get(i) : "");
                    r.put("pdfbox_raw", i < a2.size() ? a2.get(i) : "");
                    r.put("tika", i < b.size() ? b.get(i) : "");
                    rows.add(r);
                }
            }
        }
        Files.writeString(Path.of(args[1]), toJson(rows), StandardCharsets.UTF_8);
        System.out.println("pages=" + rows.size() + " pdfboxMs=" + pdfboxMs + " tikaMs=" + tikaMs);
    }

    /** PDFBox: 쪽마다 따로 추출. sort=true 면 화면 위치 순서로 정렬, false 면 PDF 안의 글 순서 그대로. */
    static List<String> pdfbox(Path pdf, boolean sort) throws Exception {
        List<String> out = new ArrayList<>();
        try (PDDocument d = Loader.loadPDF(pdf.toFile())) {
            PDFTextStripper s = new PDFTextStripper();
            s.setSortByPosition(sort);
            for (int p = 1; p <= d.getNumberOfPages(); p++) {
                s.setStartPage(p);
                s.setEndPage(p);
                out.add(s.getText(d).strip());
            }
        }
        return out;
    }

    /** Tika: XHTML 로 받아 <div class="page"> 단위로 나눈다. */
    static List<String> tika(Path pdf) throws Exception {
        ToXMLContentHandler h = new ToXMLContentHandler();
        try (InputStream in = Files.newInputStream(pdf)) {
            new PDFParser().parse(in, h, new Metadata(), new ParseContext());
        }
        List<String> out = new ArrayList<>();
        Matcher m = Pattern.compile("<div class=\"page\">(.*?)</div>", Pattern.DOTALL).matcher(h.toString());
        while (m.find()) {
            String text = m.group(1).replaceAll("</p>", "\n").replaceAll("<[^>]+>", "")
                    .replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'");
            out.add(text.strip());
        }
        return out;
    }

    static String toJson(List<Map<String, Object>> rows) {
        StringBuilder sb = new StringBuilder("[\n");
        for (int i = 0; i < rows.size(); i++) {
            sb.append("  {");
            int j = 0;
            for (var e : rows.get(i).entrySet()) {
                if (j++ > 0) sb.append(", ");
                sb.append('"').append(e.getKey()).append("\": ");
                Object v = e.getValue();
                if (v instanceof Number) sb.append(v);
                else sb.append('"').append(v.toString().replace("\\", "\\\\").replace("\"", "\\\"").replace("\r", "").replace("\n", "\\n").replace("\t", "\\t")).append('"');
            }
            sb.append(i < rows.size() - 1 ? "},\n" : "}\n");
        }
        return sb.append("]\n").toString();
    }
}
