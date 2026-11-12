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
    void createOrder_twoItems() throws Exception {
        InventoryService inventory = new InventoryService();
        inventory.register(10L, 5);
        inventory.register(22L, 5);
        Order order = new OrderService(inventory).createOrder(1L, List.of(new OrderItem(10L, 1), new OrderItem(22L, 1)));
        assertEquals(2, order.totalQuantity());
    }
}
