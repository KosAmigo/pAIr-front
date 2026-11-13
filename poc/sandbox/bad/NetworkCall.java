public class NetworkCall {
    public static void main(String[] a) throws Exception {
        try (var in = new java.net.URI("https://example.com").toURL().openStream()) { System.out.println("CONNECTED " + in.read()); }
    }
}
