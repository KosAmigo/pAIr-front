package com.pair.task;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.TreeMap;

import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;

/** classpath:tasks/{id}/ 아래의 과제 정의와 파일을 읽는다. */
@Component
public class TaskRepository {

    private final ObjectMapper json;
    private final PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
    private final Map<String, TaskDef> tasks = new LinkedHashMap<>();

    public TaskRepository(ObjectMapper json) {
        this.json = json;
        for (String id : new String[] {"order-deadlock", "pricing-plan"}) {
            Resource r = resolver.getResource("classpath:tasks/" + id + "/task.json");
            try (InputStream in = r.getInputStream()) {
                tasks.put(id, json.readValue(in, TaskDef.class));
            } catch (IOException e) {
                throw new UncheckedIOException("과제 정의를 읽지 못했습니다: " + id, e);
            }
        }
    }

    public TaskDef get(String id) {
        TaskDef t = tasks.get(id);
        if (t == null) throw new NoSuchElementException("없는 과제입니다: " + id);
        return t;
    }

    /** 응시자에게 보이는 파일들 (상대 경로 → 내용). */
    public Map<String, String> visibleFiles(String id) {
        return readTree(id, "files");
    }

    /** 숨은 테스트, 체크리스트 (상대 경로 → 내용). API로 내보내지 않는다. */
    public Map<String, String> hiddenFiles(String id) {
        return readTree(id, "hidden");
    }

    private Map<String, String> readTree(String id, String folder) {
        get(id);
        Map<String, String> out = new TreeMap<>();
        String base = "tasks/" + id + "/" + folder + "/";
        try {
            for (Resource r : resolver.getResources("classpath*:" + base + "**/*")) {
                if (!r.isReadable()) continue;
                String url = r.getURL().toString().replace('\\', '/');
                int at = url.indexOf(base);
                if (at < 0) continue;
                String rel = java.net.URLDecoder.decode(url.substring(at + base.length()), StandardCharsets.UTF_8);
                if (rel.isEmpty() || rel.endsWith("/")) continue;
                try (InputStream in = r.getInputStream()) {
                    out.put(rel, new String(in.readAllBytes(), StandardCharsets.UTF_8));
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out;
    }
}
