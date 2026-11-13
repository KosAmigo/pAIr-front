import java.util.*;
public class MemoryBomb {
    public static void main(String[] a) {
        List<long[]> keep = new ArrayList<>();
        while (true) { keep.add(new long[1 << 20]); if (keep.size() % 64 == 0) System.out.println((keep.size() * 8) + "MB"); }
    }
}
