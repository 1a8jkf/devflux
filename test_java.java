import android.content.Context;
class Test {
  public void test(Context reactContext) {
    String dir = reactContext.getApplicationInfo().nativeLibraryDir;
  }
}
