package shop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;

/** 채점용 숨은 테스트. 응시자에게 보이지 않는다. */
class HiddenOrderTest {

    /** 필수 1: 상품 순서가 반대인 주문이 동시에 와도 교착 없이 모두 끝난다. */
    @Test
    void required_reverseOrderConcurrent_noDeadlock() {
        assertTimeoutPreemptively(Duration.ofSeconds(15), () -> {
            InventoryService inventory = new InventoryService();
            inventory.register(10L, 1000);
            inventory.register(22L, 1000);
            OrderService service = new OrderService(inventory);
            ExecutorService pool = Executors.newFixedThreadPool(2);
            try {
                int rounds = 10;
                for (int i = 0; i < rounds; i++) {
                    CountDownLatch start = new CountDownLatch(1);
                    Future<Order> a = pool.submit(() -> {
                        start.await();
                        return service.createOrder(1L, List.of(new OrderItem(10L, 1), new OrderItem(22L, 1)));
                    });
                    Future<Order> b = pool.submit(() -> {
                        start.await();
                        return service.createOrder(2L, List.of(new OrderItem(22L, 1), new OrderItem(10L, 1)));
                    });
                    start.countDown();
                    a.get();
                    b.get();
                }
                assertEquals(1000 - rounds * 2, inventory.countOf(10L));
                assertEquals(1000 - rounds * 2, inventory.countOf(22L));
            } finally {
                pool.shutdownNow();
            }
        });
    }

    /** 필수 2: 한 주문에 같은 상품이 두 번 들어와도 수량만큼 정확히 차감된다. */
    @Test
    void required_duplicateItems_decreaseTotal() {
        assertTimeoutPreemptively(Duration.ofSeconds(10), () -> {
            InventoryService inventory = new InventoryService();
            inventory.register(10L, 5);
            OrderService service = new OrderService(inventory);

            Order order = service.createOrder(1L, List.of(new OrderItem(10L, 1), new OrderItem(10L, 2)));

            assertEquals(3, order.totalQuantity());
            assertEquals(2, inventory.countOf(10L));
        });
    }

    /** 필수 3: 재고가 부족해 주문이 실패하면 다른 상품 재고도 원래대로 돌아온다. */
    @Test
    void required_outOfStock_rollsBackOtherItems() {
        assertTimeoutPreemptively(Duration.ofSeconds(10), () -> {
            InventoryService inventory = new InventoryService();
            inventory.register(10L, 5);
            inventory.register(22L, 1);
            OrderService service = new OrderService(inventory);

            assertThrows(OutOfStockException.class,
                    () -> service.createOrder(1L, List.of(new OrderItem(10L, 2), new OrderItem(22L, 3))));

            assertEquals(5, inventory.countOf(10L));
            assertEquals(1, inventory.countOf(22L));
        });
    }

    /** 필수 4: 실패한 주문 뒤에도 잠금이 남지 않아 다음 주문이 바로 처리된다. */
    @Test
    void required_locksReleasedAfterFailure() {
        assertTimeoutPreemptively(Duration.ofSeconds(10), () -> {
            InventoryService inventory = new InventoryService();
            inventory.register(10L, 5);
            inventory.register(22L, 0);
            OrderService service = new OrderService(inventory);

            assertThrows(OutOfStockException.class,
                    () -> service.createOrder(1L, List.of(new OrderItem(10L, 1), new OrderItem(22L, 1))));

            long started = System.nanoTime();
            ExecutorService pool = Executors.newSingleThreadExecutor();
            try {
                Order next = pool.submit(() -> service.createOrder(2L, List.of(new OrderItem(10L, 1)))).get();
                assertEquals(1, next.totalQuantity());
            } finally {
                pool.shutdownNow();
            }
            assertTrue(Duration.ofNanos(System.nanoTime() - started).toMillis() < 2000, "다음 주문이 잠금 때문에 지연됨");
        });
    }

    /** 선택: 여러 스레드가 겹치는 상품을 섞어 주문해도 총 재고가 맞다. */
    @Test
    void optional_manyThreads_stockConsistent() {
        assertTimeoutPreemptively(Duration.ofSeconds(20), () -> {
            InventoryService inventory = new InventoryService();
            long[] ids = {10L, 22L, 31L};
            for (long id : ids) inventory.register(id, 10_000);
            OrderService service = new OrderService(inventory);
            ExecutorService pool = Executors.newFixedThreadPool(4);
            try {
                List<Future<Order>> futures = new ArrayList<>();
                for (int i = 0; i < 24; i++) {
                    long a = ids[i % 3];
                    long b = ids[(i + 1) % 3];
                    long c = ids[(i + 2) % 3];
                    long user = i;
                    futures.add(pool.submit(() -> service.createOrder(user,
                            List.of(new OrderItem(a, 1), new OrderItem(b, 1), new OrderItem(c, 1)))));
                }
                for (Future<Order> f : futures) f.get();
                for (long id : ids) assertEquals(10_000 - 24, inventory.countOf(id));
            } finally {
                pool.shutdownNow();
            }
        });
    }
}
