import java.io.*;
public class DiskFill {
    public static void main(String[] a) throws Exception {
        File f = new File(a[0], "fill.bin"); byte[] mb = new byte[1 << 20]; int n = 0;
        try (var out = new FileOutputStream(f)) { for (; n < Integer.parseInt(a[1]); n++) out.write(mb); }
        catch (IOException e) { System.out.println("stopped: " + e.getMessage()); }
        finally { System.out.println("written=" + n + "MB"); f.delete(); }
    }
}
