package shop;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

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
}
