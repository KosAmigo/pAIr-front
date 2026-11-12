package shop;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Order {

    private final long userId;
    private final List<OrderItem> items = new ArrayList<>();

    public Order(long userId) {
        this.userId = userId;
    }

    void add(OrderItem item) {
        items.add(item);
    }

    public long userId() {
        return userId;
    }

    public List<OrderItem> items() {
        return Collections.unmodifiableList(items);
    }

    public int totalQuantity() {
        return items.stream().mapToInt(OrderItem::quantity).sum();
    }
}
