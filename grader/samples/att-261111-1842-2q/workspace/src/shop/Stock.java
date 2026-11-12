package shop;

import java.util.concurrent.locks.ReentrantLock;

public class Stock {

    private final long productId;
    private final ReentrantLock lock = new ReentrantLock();
    private int count;

    public Stock(long productId, int count) {
        this.productId = productId;
        this.count = count;
    }

    public long productId() {
        return productId;
    }

    public int count() {
        return count;
    }

    ReentrantLock lock() {
        return lock;
    }

    void decrease(int quantity) {
        if (count < quantity) {
            throw new OutOfStockException(productId, count, quantity);
        }
        count -= quantity;
    }

    void increase(int quantity) {
        count += quantity;
    }
}
