import com.sun.source.tree.*;
import com.sun.source.util.*;

import javax.lang.model.element.*;
import javax.lang.model.type.*;
import javax.tools.*;
import java.io.File;
import java.lang.management.ManagementFactory;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Stream;

/**
 * 10번 기술검증 (언어 서버 대신 javac API): 백엔드 안에서 JDK 컴파일러 API 로 IDE 기능을 낸다.
 * 오류 밑줄, 타입을 아는 자동 완성, 정의로 이동의 속도와 메모리를 잰다. 별도 프로세스 없이 요청마다 잠깐 분석한다.
 *
 * 사용: java -Xmx256m JavacAssist.java <과제 files 폴더> <junit-platform-console-standalone.jar>
 */
public class JavacAssist {
    static final JavaCompiler COMPILER = ToolProvider.getSystemJavaCompiler();
    // 문법 오류가 있어도 타입 분석까지 진행하게 한다 (입력 중인 코드는 대부분 문법이 깨져 있음)
    static final List<String> OPTIONS = List.of("-proc:none", "-Xlint:none", "-XDshould-stop.ifError=FLOW", "-XDshould-stop.ifNoError=FLOW");
    static String junitJar;

    /** JDK 클래스 목록 같은 무거운 정보는 파일 관리자에 캐시되므로 스레드마다 하나씩 재사용한다. */
    static final ThreadLocal<StandardJavaFileManager> FILES = ThreadLocal.withInitial(() -> {
        StandardJavaFileManager fm = COMPILER.getStandardFileManager(null, null, StandardCharsets.UTF_8);
        try {
            fm.setLocation(StandardLocation.CLASS_PATH, List.of(new File(junitJar)));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        return fm;
    });

    static final class Source extends SimpleJavaFileObject {
        final String text;
        Source(String path, String text) { super(URI.create("mem:///" + path), Kind.SOURCE); this.text = text; }
        @Override public CharSequence getCharContent(boolean ignore) { return text; }
    }

    record Analysis(JavacTask task, Trees trees, List<CompilationUnitTree> units, List<Diagnostic<? extends JavaFileObject>> diags) {
        CompilationUnitTree unit(String path) {
            return units.stream().filter(u -> u.getSourceFile().toUri().getPath().endsWith("/" + path)).findFirst().orElseThrow();
        }
    }

    static Analysis analyze(Map<String, String> files) throws Exception {
        DiagnosticCollector<JavaFileObject> dc = new DiagnosticCollector<>();
        List<Source> sources = files.entrySet().stream().map(e -> new Source(e.getKey(), e.getValue())).toList();
        JavacTask task = (JavacTask) COMPILER.getTask(null, FILES.get(), dc, OPTIONS, null, sources);
        List<CompilationUnitTree> units = new ArrayList<>();
        task.parse().forEach(units::add);
        task.analyze();
        return new Analysis(task, Trees.instance(task), units, dc.getDiagnostics());
    }

    // ── 오류 밑줄 ─────────────────────
    static List<String> errors(Map<String, String> files, String path) throws Exception {
        List<String> out = new ArrayList<>();
        for (var d : analyze(files).diags()) {
            if (d.getKind() == Diagnostic.Kind.ERROR && d.getSource() != null && d.getSource().toUri().getPath().endsWith("/" + path)) {
                out.add(d.getLineNumber() + ":" + d.getColumnNumber() + " " + d.getMessage(Locale.KOREAN));
            }
        }
        return out;
    }

    // ── 자동 완성: 커서 앞이 "식." 또는 "식.앞글자" 일 때 그 식의 타입 멤버를 낸다 ─────────────────────
    static List<String> complete(Map<String, String> files, String path, int offset) throws Exception {
        String text = files.get(path);
        int start = offset;
        while (start > 0 && Character.isJavaIdentifierPart(text.charAt(start - 1))) start--;
        if (start == 0 || text.charAt(start - 1) != '.') return List.of();
        String prefix = text.substring(start, offset);
        String marker = prefix + "__pairCursor";
        // "s." 처럼 끊긴 식은 문법 트리에서 빠지므로, 커서 자리를 메서드 호출 "s.표시()" 로 바꿔 올바른 식으로 만든다.
        // 문장이 끝나는 자리(뒤가 } 나 줄바꿈)면 ; 도 붙인다.
        String rest = text.substring(offset);
        String next = rest.stripLeading();
        boolean statementEnd = next.isEmpty() || next.charAt(0) == '}' || rest.indexOf('\n') < Math.max(0, rest.indexOf(next.isEmpty() ? " " : next.substring(0, 1)));
        String fill = next.startsWith("(") ? "" : statementEnd ? "();" : "()";
        Map<String, String> patched = new HashMap<>(files);
        patched.put(path, text.substring(0, start) + marker + fill + rest);
        Analysis a = analyze(patched);
        CompilationUnitTree unit = a.unit(path);
        TreePath[] found = new TreePath[1];
        new TreePathScanner<Void, Void>() {
            @Override public Void visitMemberSelect(MemberSelectTree t, Void v) {
                if (t.getIdentifier().contentEquals(marker)) found[0] = getCurrentPath();
                return super.visitMemberSelect(t, v);
            }
        }.scan(unit, null);
        if (found[0] == null) return List.of();
        MemberSelectTree select = (MemberSelectTree) found[0].getLeaf();
        TypeMirror type = a.trees().getTypeMirror(new TreePath(found[0], select.getExpression()));
        if (!(type instanceof DeclaredType declared)) return List.of();
        Scope scope = a.trees().getScope(found[0]);
        TypeElement te = (TypeElement) declared.asElement();
        Set<String> out = new LinkedHashSet<>();
        for (Element e : a.task().getElements().getAllMembers(te)) {
            if (e.getKind() != ElementKind.METHOD && e.getKind() != ElementKind.FIELD) continue;
            if (!e.getSimpleName().toString().startsWith(prefix)) continue;
            if (!a.trees().isAccessible(scope, e, declared)) continue;
            out.add(e.getKind() == ElementKind.METHOD
                    ? e.getSimpleName() + "(" + String.join(", ", ((ExecutableElement) e).getParameters().stream().map(p -> p.asType() + " " + p.getSimpleName()).toList()) + ") : " + ((ExecutableElement) e).getReturnType()
                    : e.getSimpleName() + " : " + e.asType());
        }
        return new ArrayList<>(out);
    }

    // ── 정의로 이동: 커서 위치의 이름이 선언된 파일과 줄 ─────────────────────
    static String definition(Map<String, String> files, String path, int offset) throws Exception {
        Analysis a = analyze(files);
        CompilationUnitTree unit = a.unit(path);
        SourcePositions pos = a.trees().getSourcePositions();
        TreePath[] best = new TreePath[1];
        new TreePathScanner<Void, Void>() {
            @Override public Void scan(Tree t, Void v) {
                if (t == null) return null;
                long s = pos.getStartPosition(unit, t), e = pos.getEndPosition(unit, t);
                if (s <= offset && offset <= e && (t instanceof IdentifierTree || t instanceof MemberSelectTree)) {
                    best[0] = new TreePath(getCurrentPath() == null ? new TreePath(unit) : getCurrentPath(), t);
                }
                return super.scan(t, v);
            }
        }.scan(unit, null);
        if (best[0] == null) return "없음";
        Element el = a.trees().getElement(best[0]);
        if (el == null) return "없음";
        TreePath decl = a.trees().getPath(el);
        if (decl == null) return el + " (JDK/라이브러리)";
        CompilationUnitTree du = decl.getCompilationUnit();
        long p = pos.getStartPosition(du, decl.getLeaf());
        String file = du.getSourceFile().toUri().getPath().replaceFirst("^/", "");
        return file + ":" + du.getLineMap().getLineNumber(p) + " (" + el.getKind() + " " + el + ")";
    }

    // ── 측정 ─────────────────────
    static final AtomicLong PEAK = new AtomicLong();

    static long heapMb() { return ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed() / (1 << 20); }

    static double ms(long nanos) { return nanos / 1e6; }

    static String stats(List<Long> ns) {
        List<Long> s = new ArrayList<>(ns); Collections.sort(s);
        double avg = s.stream().mapToLong(x -> x).average().orElse(0);
        return String.format("평균 %.0fms, 95%% %.0fms, 최대 %.0fms", ms((long) avg), ms(s.get((int) (s.size() * 0.95) - (s.size() >= 20 ? 0 : 1))), ms(s.get(s.size() - 1)));
    }

    interface Job { void run() throws Exception; }

    static long time(Job j) throws Exception { long t = System.nanoTime(); j.run(); return System.nanoTime() - t; }

    public static void main(String[] args) throws Exception {
        Path root = Path.of(args[0]);
        junitJar = args[1];
        Thread sampler = new Thread(() -> { while (true) { PEAK.accumulateAndGet(heapMb(), Math::max); try { Thread.sleep(5); } catch (InterruptedException e) { return; } } });
        sampler.setDaemon(true); sampler.start();

        Map<String, String> files = new TreeMap<>();
        try (Stream<Path> s = Files.walk(root)) {
            for (Path p : s.filter(p -> p.toString().endsWith(".java")).toList()) {
                files.put(root.relativize(p).toString().replace('\\', '/'), Files.readString(p));
            }
        }
        String path = "src/shop/OrderService.java";
        String orig = files.get(path);
        int at = orig.indexOf('{', orig.indexOf("class OrderService")) + 1;
        String editing = orig.substring(0, at) + "\n    int bad = \"text\";\n    void probe(Stock s) { s. }\n    void probe2(Stock s) { s.de }\n" + orig.substring(at);
        Map<String, String> edited = new TreeMap<>(files); edited.put(path, editing);
        int dot = editing.indexOf("{ s. }") + 4, dotPrefix = editing.indexOf("{ s.de }") + 6, stockName = editing.indexOf("probe(Stock") + 7;

        System.out.println("[설정] 파일 " + files.size() + "개, 힙 한도 " + Runtime.getRuntime().maxMemory() / (1 << 20) + "MB");
        long cold = time(() -> analyze(files));
        System.out.printf("[첫 분석(콜드)] %.0fms%n", ms(cold));
        System.out.println("[원본 오류] " + errors(files, path));
        System.out.println("[입력 중 오류] " + errors(edited, path));
        System.out.println("[자동 완성 s.] " + complete(edited, path, dot));
        System.out.println("[자동 완성 s.de] " + complete(edited, path, dotPrefix));
        System.out.println("[정의로 이동 Stock] " + definition(edited, path, stockName));

        // 한 사람이 계속 입력할 때 (워밍업 후)
        for (int i = 0; i < 10; i++) { errors(edited, path); complete(edited, path, dot); }
        List<Long> e1 = new ArrayList<>(), c1 = new ArrayList<>(), d1 = new ArrayList<>();
        for (int i = 0; i < 30; i++) {
            e1.add(time(() -> errors(edited, path)));
            c1.add(time(() -> complete(edited, path, dot)));
            d1.add(time(() -> definition(edited, path, stockName)));
        }
        System.out.println("[1명] 오류 밑줄 " + stats(e1));
        System.out.println("[1명] 자동 완성 " + stats(c1));
        System.out.println("[1명] 정의로 이동 " + stats(d1));
        System.gc(); Thread.sleep(200);
        System.out.println("[1명] 힙 최고 " + PEAK.get() + "MB, GC 후 " + heapMb() + "MB");

        // 여러 명이 동시에 입력할 때: 사람마다 0.5초에 한 번씩 오류 분석 + 자동 완성
        for (int users : new int[]{10, 30}) {
            PEAK.set(0);
            ExecutorService pool = Executors.newFixedThreadPool(users);
            List<Long> all = Collections.synchronizedList(new ArrayList<>());
            List<Future<?>> fs = new ArrayList<>();
            for (int u = 0; u < users; u++) {
                final int id = u;
                fs.add(pool.submit(() -> {
                    Map<String, String> mine = new TreeMap<>(edited);
                    mine.put(path, editing.replace("int bad", "int bad" + id));
                    for (int i = 0; i < 20; i++) {
                        long t = System.nanoTime();
                        errors(mine, path); complete(mine, path, dot);
                        long took = System.nanoTime() - t; all.add(took);
                        Thread.sleep(Math.max(0, 500 - took / 1_000_000));
                    }
                    return null;
                }));
            }
            for (Future<?> f : fs) f.get();
            pool.shutdown();
            System.out.println("[" + users + "명 동시, 0.5초마다 오류+자동 완성] " + stats(all) + " / 힙 최고 " + PEAK.get() + "MB");
        }
        System.out.println("[CPU] " + Runtime.getRuntime().availableProcessors() + "코어");
    }
}
