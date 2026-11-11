package shop;

/** 실제 DB 왕복 시간을 흉내 낸다. 수정 대상이 아니다. */
final class Db {

    private Db() {
    }

    static void simulateLatency() throws InterruptedException {
        Thread.sleep(50);
    }
}
