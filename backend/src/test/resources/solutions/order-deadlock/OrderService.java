package shop;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** 검증용 정답 코드. 숨은 테스트가 정답에서는 모두 통과하는지 확인할 때만 쓴다. */
public class OrderService {

    private final InventoryService inventory;

    public OrderService(InventoryService inventory) {
        this.inventory = inventory;
    }

    public Order createOrder(long userId, List<OrderItem> items) throws InterruptedException {
        // 상품별 수량을 합치고, productId 오름차순으로 잠가서 잠금 순서를 고정한다
        Map<Long, Integer> quantities = new TreeMap<>();
        for (OrderItem item : items) {
            quantities.merge(item.productId(), item.quantity(), Integer::sum);
        }
        List<Long> locked = new ArrayList<>();
        Map<Long, Integer> decreased = new TreeMap<>();
        try {
            for (Long productId : quantities.keySet()) {
                inventory.lock(productId);
                locked.add(productId);
            }
            Db.simulateLatency();
            for (Map.Entry<Long, Integer> e : quantities.entrySet()) {
                inventory.decrease(e.getKey(), e.getValue());
                decreased.put(e.getKey(), e.getValue());
            }
            Order order = new Order(userId);
            items.forEach(order::add);
            return order;
        } catch (RuntimeException e) {
            decreased.forEach(inventory::increase);
            throw e;
        } finally {
            for (Long productId : locked) {
                inventory.unlock(productId);
            }
        }
    }
}
