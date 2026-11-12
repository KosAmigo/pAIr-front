package shop;

import java.util.ArrayList;
import java.util.List;

public class OrderService {

    private final InventoryService inventory;

    public OrderService(InventoryService inventory) {
        this.inventory = inventory;
    }

    /**
     * 주문을 만든다. 교착을 막기 위해 상품 ID 오름차순으로 모든 잠금을 먼저 잡고,
     * 차감 중 실패하면 이미 차감한 재고를 되돌린다.
     */
    public Order createOrder(long userId, List<OrderItem> items) throws InterruptedException {
        Order order = new Order(userId);
        List<Long> ids = items.stream().map(OrderItem::productId).distinct().sorted().toList();
        List<Long> locked = new ArrayList<>();
        try {
            for (Long id : ids) {
                inventory.lock(id);
                locked.add(id);
            }
            Db.simulateLatency();
            List<OrderItem> done = new ArrayList<>();
            try {
                for (OrderItem item : items) {
                    inventory.decrease(item.productId(), item.quantity());
                    done.add(item);
                    order.add(item);
                }
            } catch (RuntimeException e) {
                for (OrderItem d : done) {
                    inventory.increase(d.productId(), d.quantity());
                }
                throw e;
            }
            return order;
        } finally {
            for (Long id : locked) {
                inventory.unlock(id);
            }
        }
    }
}
