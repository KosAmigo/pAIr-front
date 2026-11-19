package com.pair.exam.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.util.Base64;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.ServerSideEncryption;

class SnapshotStorageTest {

    static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 1, 2, 3};

    @TempDir
    Path dir;

    @Test
    @DisplayName("검증: data URL·base64 모두 받고, JPEG 아님·크기 초과·깨진 base64 는 거절")
    void validator() {
        SnapshotValidator v = new SnapshotValidator(100);
        String b64 = Base64.getEncoder().encodeToString(JPEG);

        assertThat(v.decode(b64)).isEqualTo(JPEG);
        assertThat(v.decode("data:image/jpeg;base64," + b64)).isEqualTo(JPEG);
        assertThatThrownBy(() -> v.decode(Base64.getEncoder().encodeToString(new byte[] {1, 2, 3, 4})))
                .hasMessageContaining("JPEG");
        assertThatThrownBy(() -> v.decode(Base64.getEncoder().encodeToString(new byte[200]))).hasMessageContaining("너무 큽니다");
        assertThatThrownBy(() -> v.decode("!!!not-base64")).hasMessageContaining("형식");
    }

    @Test
    @DisplayName("로컬 저장소: 저장·읽기·삭제, 경로를 벗어나는 키는 거절")
    void local() {
        LocalSnapshotStorage s = new LocalSnapshotStorage(dir);
        String key = SnapshotStorage.keyOf(7, 42);

        s.put(key, JPEG);
        assertThat(s.get(key)).contains(JPEG);
        s.delete(key);
        s.delete(key); // 두 번 지워도 안전
        assertThat(s.get(key)).isEmpty();
        assertThatThrownBy(() -> s.get("../../etc/passwd")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> s.put("7/../../x.jpg", JPEG)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("S3: 접두어를 붙여 서버 측 암호화로 올리고, 없는 키는 빈 값")
    void s3() {
        S3Client client = mock(S3Client.class);
        S3SnapshotStorage s = new S3SnapshotStorage(client, "pair-bucket", "exam-snapshots");
        when(client.getObjectAsBytes(any(GetObjectRequest.class))).thenThrow(NoSuchKeyException.builder().build());

        s.put(SnapshotStorage.keyOf(7, 42), JPEG);

        ArgumentCaptor<PutObjectRequest> req = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(client).putObject(req.capture(), any(RequestBody.class));
        assertThat(req.getValue().bucket()).isEqualTo("pair-bucket");
        assertThat(req.getValue().key()).isEqualTo("exam-snapshots/7/42.jpg");
        assertThat(req.getValue().contentType()).isEqualTo("image/jpeg");
        assertThat(req.getValue().serverSideEncryption()).isEqualTo(ServerSideEncryption.AES256);
        assertThat(s.get(SnapshotStorage.keyOf(7, 1))).isEmpty();
        assertThatThrownBy(() -> s.objectKey("../secret")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("S3: 버킷이 없으면 서버가 켜질 때 바로 알려 준다")
    void s3RequiresBucket() {
        assertThatThrownBy(() -> new S3SnapshotStorage(mock(S3Client.class), "", "p/"))
                .hasMessageContaining("pair.exam.s3.bucket");
    }

    @Test
    @DisplayName("CSV 칸: 쉼표·따옴표는 감싸고, 수식으로 시작하는 값은 앞에 ' 를 붙인다")
    void csvCell() {
        assertThat(SessionResultService.cell("a,b")).isEqualTo("\"a,b\"");
        assertThat(SessionResultService.cell("say \"hi\"")).isEqualTo("\"say \"\"hi\"\"\"");
        assertThat(SessionResultService.cell("=HYPERLINK(1)")).isEqualTo("'=HYPERLINK(1)");
        assertThat(SessionResultService.cell("-1+2")).isEqualTo("'-1+2");
        assertThat(SessionResultService.cell(null)).isEmpty();
    }
}
