# 응시자 코드 실행용 샌드박스 이미지 (기술검증 PoC)
FROM eclipse-temurin:21-jdk
COPY junit.jar /opt/junit.jar
RUN useradd -u 10001 -m runner && mkdir /workspace && chown runner /workspace
USER runner
WORKDIR /workspace
