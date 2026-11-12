package shop;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

public class InventoryService {

    /** 잠금을 기다리는 최대 시간. 운영 DB의 lock wait timeout 과 같은 값이다. */
    static final long LOCK_TIMEOUT_MS = 10000;

    private final Map<Long, Stock> stocks = new ConcurrentHashMap<>();

    public void register(long productId, int count) {
        stocks.put(productId, new Stock(productId, count));
    }

    public int countOf(long productId) {
        return stock(productId).count();
    }

    /** 재고 행을 잠근다. LOCK_TIMEOUT_MS 안에 잠그지 못하면 LockTimeoutException. */
    public void lock(long productId) throws InterruptedException {
        Stock stock = stock(productId);
        if (!stock.lock().tryLock(LOCK_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
            throw new LockTimeoutException(productId);
        }
    }

    public void unlock(long productId) {
        stock(productId).lock().unlock();
    }

    public void decrease(long productId, int quantity) {
        stock(productId).decrease(quantity);
    }

    public void increase(long productId, int quantity) {
        stock(productId).increase(quantity);
    }

    private Stock stock(long productId) {
        Stock stock = stocks.get(productId);
        if (stock == null) {
            throw new IllegalArgumentException("등록되지 않은 상품: " + productId);
        }
        return stock;
    }
}
