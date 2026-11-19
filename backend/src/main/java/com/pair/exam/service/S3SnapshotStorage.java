package com.pair.exam.service;

import java.net.URI;
import java.util.Optional;
import java.util.regex.Pattern;

import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3ClientBuilder;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.ServerSideEncryption;

/**
 * 감독 사진을 S3 에 저장한다. pair.exam.snapshot-storage=s3 로 켠다.
 * 자격 증명은 코드·설정 파일에 두지 않는다. AWS 기본 체인(환경 변수 AWS_ACCESS_KEY_ID 등, EC2/ECS 역할)을 쓴다.
 * 버킷은 비공개로 두고, 사진은 콘솔 API(/snapshot)를 거쳐서만 보여 준다.
 * 객체는 서버 측 암호화(SSE-S3)로 저장한다.
 */
@Component
@ConditionalOnProperty(name = "pair.exam.snapshot-storage", havingValue = "s3")
public class S3SnapshotStorage implements SnapshotStorage, DisposableBean {
    private static final Pattern KEY = Pattern.compile("\\d{1,19}/\\d{1,19}\\.jpg");

    private final S3Client s3;
    private final String bucket;
    private final String prefix;

    public S3SnapshotStorage(
            @Value("${pair.exam.s3.bucket}") String bucket,
            @Value("${pair.exam.s3.region:ap-northeast-2}") String region,
            @Value("${pair.exam.s3.prefix:exam-snapshots/}") String prefix,
            // MinIO·LocalStack 같은 S3 호환 서버로 테스트할 때만 넣는다 (비우면 AWS)
            @Value("${pair.exam.s3.endpoint:}") String endpoint) {
        this(build(region, endpoint), bucket, prefix);
    }

    S3SnapshotStorage(S3Client s3, String bucket, String prefix) {
        if (bucket == null || bucket.isBlank()) throw new IllegalStateException("pair.exam.s3.bucket 을 설정하세요.");
        this.s3 = s3;
        this.bucket = bucket;
        this.prefix = prefix == null || prefix.isEmpty() || prefix.endsWith("/") ? (prefix == null ? "" : prefix) : prefix + "/";
    }

    private static S3Client build(String region, String endpoint) {
        S3ClientBuilder b = S3Client.builder().region(Region.of(region));
        if (endpoint != null && !endpoint.isBlank()) b = b.endpointOverride(URI.create(endpoint)).forcePathStyle(true);
        return b.build();
    }

    @Override
    public void put(String key, byte[] jpeg) {
        s3.putObject(PutObjectRequest.builder()
                .bucket(bucket)
                .key(objectKey(key))
                .contentType("image/jpeg")
                .serverSideEncryption(ServerSideEncryption.AES256)
                .build(), RequestBody.fromBytes(jpeg));
    }

    @Override
    public Optional<byte[]> get(String key) {
        try {
            return Optional.of(s3.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket).key(objectKey(key)).build())
                    .asByteArray());
        } catch (NoSuchKeyException e) {
            return Optional.empty();
        }
    }

    /** S3 삭제는 없는 키여도 성공한다 */
    @Override
    public void delete(String key) {
        s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(objectKey(key)).build());
    }

    String objectKey(String key) {
        if (key == null || !KEY.matcher(key).matches()) throw new IllegalArgumentException("잘못된 사진 키");
        return prefix + key;
    }

    @Override
    public void destroy() {
        s3.close();
    }
}
