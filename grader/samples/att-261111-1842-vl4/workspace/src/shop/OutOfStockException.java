package shop;

public class OutOfStockException extends RuntimeException {

    public OutOfStockException(long productId, int count, int requested) {
        super("재고 부족: product=" + productId + ", 남은 수량=" + count + ", 요청=" + requested);
    }
}
