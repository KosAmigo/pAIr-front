package com.pair.exam.service;

import java.util.Optional;

/**
 * 감독 사진 저장소 경계. 운영에서는 파일 서버(예: S3 호환 오브젝트 스토리지)에 올리고,
 * 개발 중에는 {@link LocalSnapshotStorage} 가 pilot-data 폴더에 둔다.
 * key 는 서버가 만든 "{회차ID}/{이벤트ID}.jpg" 형식이다.
 */
public interface SnapshotStorage {

    void put(String key, byte[] jpeg);

    Optional<byte[]> get(String key);

    /** 없는 키는 조용히 넘어간다 (두 번 지워도 안전) */
    void delete(String key);

    static String keyOf(long sessionId, long eventId) {
        return sessionId + "/" + eventId + ".jpg";
    }
}
