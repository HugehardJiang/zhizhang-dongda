package cn.neu.zhizhangdongda;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.os.Bundle;
import org.json.JSONArray;
import org.json.JSONObject;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;

/** Runs on an Android emulator/device; no mocked SQLite or third-party runner. */
public final class CacheStoreInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    private static JSONObject snapshot(String name) throws Exception {
        return new JSONObject().put("courses", new JSONArray().put(new JSONObject().put("name", name)))
                .put("scheduleDetail", new JSONArray());
    }
    private static JSONObject payload(String account, String term, String name) throws Exception {
        return new JSONObject().put("schema", "zhizhang-personal-cache/v3").put("studentId", account)
                .put("termCode", term).put("termSnapshots", new JSONObject().put(term, snapshot(name)));
    }
    private static Object call(Object target, String name, Class<?>[] types, Object... args) throws Exception {
        Method method = target.getClass().getDeclaredMethod(name, types);
        method.setAccessible(true);
        return method.invoke(target, args);
    }
    private static JSONObject reply(Object bridge, String name, Class<?>[] types, Object... args) throws Exception {
        return new JSONObject((String) call(bridge, name, types, args));
    }
    private static final class TestActivity extends MainActivity {
        TestActivity(Context context) { attachBaseContext(context); }
    }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Context testContext = getContext(); // separate test APK private data
            testContext.deleteDatabase("personal-cache-v3.db");
            PersonalCacheStore store = new PersonalCacheStore(testContext);
            store.save("A", payload("A", "T1", "first"));
            store.save("A", payload("A", "T2", "other term"));
            store.save("B", payload("B", "T1", "other account"));
            check(new JSONObject(store.load("A")).getJSONObject("termSnapshots").length() == 2, "term isolation");
            JSONObject broken = payload("A", "T1", "must rollback");
            broken.getJSONObject("termSnapshots").put("BROKEN", new JSONObject());
            try { store.save("A", broken); throw new AssertionError("accepted invalid transaction"); }
            catch (org.json.JSONException expected) { /* rollback includes the earlier metadata update */ }
            check(store.load("A").contains("first"), "rollback retained prior term");
            check("B".equals(store.lastProfile()), "rollback retained active account");
            store.save("A", payload("A", "T1", "second"));
            store.getWritableDatabase().execSQL("UPDATE snapshots SET body='{}' WHERE profile='A' AND part='term:T1'");
            JSONObject recovered = new JSONObject(store.load("A"));
            check(recovered.getBoolean("recoveredPrevious") && recovered.toString().contains("first"), "checksum fallback");
            // A multi-megabyte TEXT row must not overflow Android CursorWindow.
            StringBuilder text = new StringBuilder();
            for (int i = 0; i < 400000; i++) text.append("课程😀");
            JSONObject large = payload("A", "LARGE", "large");
            large.getJSONObject("termSnapshots").getJSONObject("LARGE").put("notes", text.toString());
            store.save("A", large);
            store.close();
            store = new PersonalCacheStore(testContext);
            String restored = new JSONObject(store.load("A")).getJSONObject("termSnapshots").getJSONObject("LARGE").getString("notes");
            check(text.toString().equals(restored), "large unicode snapshot after reopen");
            store.clear("B");
            check(store.load("B").isEmpty() && !store.load("A").isEmpty(), "clear only selected account");

            final MainActivity[] activity = new MainActivity[1];
            runOnMainSync(() -> activity[0] = new TestActivity(testContext));
            Field field = MainActivity.class.getDeclaredField("personalCacheStore");
            field.setAccessible(true); field.set(activity[0], store);
            Class<?> type = Class.forName("cn.neu.zhizhangdongda.MainActivity$AndroidBridge");
            Constructor<?> constructor = type.getDeclaredConstructor(MainActivity.class);
            constructor.setAccessible(true);
            Object bridge = constructor.newInstance(activity[0]);
            Class<?>[] beginTypes = {String.class, String.class, int.class};
            Class<?>[] chunkTypes = {String.class, int.class, String.class};
            Class<?>[] idType = {String.class};
            String body = large.put("studentId", "20250001").toString();
            check(reply(bridge, "cacheBeginWrite", beginTypes, "one", "20250001", body.length()).getBoolean("ok"), "begin");
            check(!reply(bridge, "cacheWriteChunk", chunkTypes, "one", 1, "wrong").getBoolean("ok"), "reject reordered chunk");
            check(!reply(bridge, "cacheCommitWrite", idType, "one").getBoolean("ok"), "reject incomplete commit");
            reply(bridge, "cacheBeginWrite", beginTypes, "old", "20250001", body.length());
            reply(bridge, "cacheBeginWrite", beginTypes, "new", "20250001", body.length());
            check(!reply(bridge, "cacheCommitWrite", idType, "old").getBoolean("ok"), "reject superseded writer");
            for (int offset = 0; offset < body.length(); offset += 32768) {
                check(reply(bridge, "cacheWriteChunk", chunkTypes, "new", offset,
                        body.substring(offset, Math.min(offset + 32768, body.length()))).getBoolean("ok"), "chunk accepted");
            }
            JSONObject ack = reply(bridge, "cacheCommitWrite", idType, "new");
            check(ack.getBoolean("ok") && "new".equals(ack.getString("requestId")), "durable ack");
            JSONObject info = reply(bridge, "cacheBeginRead", idType, "20250001");
            check(info.getBoolean("ok"), "read begin");
            StringBuilder read = new StringBuilder();
            for (int offset = 0; offset < info.getInt("length"); offset += 32768) {
                read.append(call(bridge, "cacheReadChunk", new Class<?>[]{String.class, int.class}, info.getString("readId"), offset));
            }
            call(bridge, "cacheEndRead", idType, info.getString("readId"));
            check(new JSONObject(read.toString()).getJSONObject("termSnapshots").getJSONObject("LARGE").getString("notes").equals(text.toString()), "bridge unicode roundtrip");
            check(reply(bridge, "cacheBeginRead", idType, "20259999").getInt("length") == 0, "no cross-account read");

            // A legacy v2 file is usable before migration, and is retained after
            // successful migration so an interrupted upgrade cannot destroy it.
            String legacyStudent = "20250003";
            Method keyMethod = MainActivity.class.getDeclaredMethod("cacheProfileForStudent", String.class);
            keyMethod.setAccessible(true);
            String legacyKey = (String) keyMethod.invoke(activity[0], legacyStudent);
            java.io.File directory = new java.io.File(testContext.getFilesDir(), "personal-cache");
            directory.mkdirs();
            java.io.File legacyFile = new java.io.File(directory, legacyKey + ".json");
            JSONObject legacy = payload(legacyStudent, "OLD", "legacy").put("schema", "zhizhang-personal-cache/v2");
            try (java.io.FileOutputStream output = new java.io.FileOutputStream(legacyFile)) {
                output.write(legacy.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            }
            JSONObject legacyRead = reply(bridge, "cacheBeginRead", idType, legacyStudent);
            check(legacyRead.getBoolean("ok") && legacyRead.getInt("length") > 0, "legacy file readable");
            store.save(legacyKey, legacy.put("schema", "zhizhang-personal-cache/v3"));
            check(legacyFile.exists(), "migration retains legacy backup");
            check(reply(bridge, "cacheClearProfile", idType, legacyStudent).getBoolean("ok"), "clear acknowledged");
            check(!legacyFile.exists() && store.load(legacyKey).isEmpty(), "clear legacy and new cache together");
            store.close();
            result.putString("stream", "Cache storage + native bridge instrumentation: PASS\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", android.util.Log.getStackTraceString(error));
            finish(Activity.RESULT_CANCELED, result);
        }
    }
}
