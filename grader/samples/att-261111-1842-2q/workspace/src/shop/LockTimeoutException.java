package shop;

public class LockTimeoutException extends RuntimeException {

    public LockTimeoutException(long productId) {
        super("Lock wait timeout exceeded (stock.product_id=" + productId + ")");
    }
}
