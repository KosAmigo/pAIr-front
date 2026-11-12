package shop;

import java.util.ArrayList;
import java.util.List;

public class OrderService {

    private final InventoryService inventory;

    public OrderService(InventoryService inventory) {
        this.inventory = inventory;
    }

    /**
     * 주문을 만든다. 상품마다 재고를 잠그고 차감한 뒤, 끝나면 잠금을 푼다.
     */
    public synchronized Order createOrder(long userId, List<OrderItem> items) throws InterruptedException {
        Order order = new Order(userId);
        List<Long> locked = new ArrayList<>();
        try {
            for (OrderItem item : items) {
                // 상품마다 재고를 잠그고 차감한다
                inventory.lock(item.productId());
                locked.add(item.productId());
                Db.simulateLatency();
                inventory.decrease(item.productId(), item.quantity());
                order.add(item);
            }
            return order;
        } finally {
            for (Long productId : locked) {
                inventory.unlock(productId);
            }
        }
    }
}
