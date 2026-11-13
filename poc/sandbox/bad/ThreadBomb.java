public class ThreadBomb {
    public static void main(String[] a) {
        int n = 0;
        try { while (true) { new Thread(() -> { try { Thread.sleep(600_000); } catch (InterruptedException e) {} }).start(); n++; } }
        catch (Throwable t) { System.out.println("threads=" + n + " stopped: " + t); System.exit(1); }
    }
}
