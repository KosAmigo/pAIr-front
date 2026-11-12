package shop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

class OrderServiceTest {

    @Test
    void createOrder_singleItem() throws Exception {
        InventoryService inventory = new InventoryService();
        inventory.register(10L, 5);
        OrderService orderService = new OrderService(inventory);

        Order order = orderService.createOrder(1L, List.of(new OrderItem(10L, 1)));

        assertEquals(1, order.totalQuantity());
        assertEquals(4, inventory.countOf(10L));
    }

    @Test
    void reverseOrder_concurrent_noDeadlock() throws Exception {
        InventoryService inventory = new InventoryService();
        inventory.register(10L, 100);
        inventory.register(22L, 100);
        OrderService service = new OrderService(inventory);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        Future<Order> a = pool.submit(() -> { start.await(); return service.createOrder(1L, List.of(new OrderItem(10L, 1), new OrderItem(22L, 1))); });
        Future<Order> b = pool.submit(() -> { start.await(); return service.createOrder(2L, List.of(new OrderItem(22L, 1), new OrderItem(10L, 1))); });
        start.countDown();
        a.get(2, TimeUnit.SECONDS);
        b.get(2, TimeUnit.SECONDS);
        pool.shutdown();
        assertEquals(98, inventory.countOf(10L));
        assertEquals(98, inventory.countOf(22L));
    }

    @Test
    void outOfStock_rollsBack() {
        InventoryService inventory = new InventoryService();
        inventory.register(10L, 5);
        inventory.register(22L, 0);
        OrderService service = new OrderService(inventory);
        assertThrows(OutOfStockException.class,
                () -> service.createOrder(1L, List.of(new OrderItem(10L, 2), new OrderItem(22L, 1))));
        assertEquals(5, inventory.countOf(10L));
    }
}
