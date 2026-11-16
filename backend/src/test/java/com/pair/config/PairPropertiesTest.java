package com.pair.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;

class PairPropertiesTest {

    @Test
    void relativeDirs_resolveFromRepoRoot_evenWhenRunInBackendFolder() {
        // Gradle 테스트는 backend 폴더에서 돈다. IntelliJ 로 실행할 때와 같은 상황이다.
        PairProperties p = new PairProperties("pilot-data", null, null, null, null, new PairProperties.Grader("grader", 4), null);
        Path grader = Path.of(p.grader().dir());
        assertTrue(Files.isDirectory(grader.resolve("samples")), grader.toString());
        assertEquals("backend", grader.getParent().resolve("backend").getFileName().toString());
        assertTrue(Files.isDirectory(grader.getParent().resolve("backend")));
        assertEquals(grader.getParent(), Path.of(p.dataDir()).getParent());
    }

    @Test
    void absoluteDir_isKept() {
        String abs = Path.of("x").toAbsolutePath().toString();
        assertEquals(abs, PairProperties.fromRepoRoot(abs));
    }
}
