package cn.neu.zhizhangdongda;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONObject;

/** Per-account, per-term snapshots. SQLite commits metadata and meetings together. */
final class PersonalCacheStore extends SQLiteOpenHelper {
    private static final String SCHEMA = "zhizhang-personal-cache/v3";

    PersonalCacheStore(Context context) {
        super(context, "personal-cache-v3.db", null, 1);
    }

    @Override public void onConfigure(SQLiteDatabase db) {
        // Full synchronous rollback-journal commits: interrupted writes recover
        // the previous transaction; no delete-then-rename window.
        db.execSQL("PRAGMA synchronous=FULL");
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE snapshots (profile TEXT NOT NULL, part TEXT NOT NULL, body TEXT NOT NULL, digest TEXT NOT NULL, previous TEXT, previous_digest TEXT, PRIMARY KEY(profile,part))");
        db.execSQL("CREATE TABLE active_profile (id INTEGER PRIMARY KEY CHECK(id=1), profile TEXT NOT NULL)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        throw new IllegalStateException("Unsupported cache database version");
    }

    synchronized void save(String profile, JSONObject payload) throws Exception {
        if (!SCHEMA.equals(payload.optString("schema")) || payload.optString("studentId").trim().isEmpty()) {
            throw new IllegalArgumentException("Invalid cache identity");
        }
        JSONObject terms = payload.getJSONObject("termSnapshots");
        if (!terms.has(payload.getString("termCode"))) throw new IllegalArgumentException("Missing current term");
        JSONObject metadata = new JSONObject(payload.toString());
        metadata.remove("termSnapshots");
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            put(db, profile, "meta", metadata.toString());
            java.util.Iterator<String> keys = terms.keys();
            while (keys.hasNext()) {
                String term = keys.next();
                JSONObject snapshot = terms.getJSONObject(term);
                validateTerm(snapshot);
                put(db, profile, "term:" + term, snapshot.toString());
            }
            ContentValues active = new ContentValues();
            active.put("id", 1);
            active.put("profile", profile);
            if (db.insertWithOnConflict("active_profile", null, active, SQLiteDatabase.CONFLICT_REPLACE) < 0) {
                throw new IllegalStateException("Cache profile update failed");
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    private static void validateTerm(JSONObject value) throws Exception {
        value.getJSONArray("courses");
        value.getJSONArray("scheduleDetail");
    }

    private static String digest(String text) throws Exception {
        byte[] bytes = java.security.MessageDigest.getInstance("SHA-256")
                .digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        return result.toString();
    }

    // CursorWindow cannot hold multi-megabyte rows. Read SQLite TEXT in bounded
    // substrings (SQLite offsets count code points, not Java UTF-16 chars).
    private static String readColumn(SQLiteDatabase db, String profile, String part, String column) {
        StringBuilder result = new StringBuilder();
        for (int offset = 1; ; offset += 32768) {
            try (Cursor row = db.rawQuery("SELECT substr(" + column + ",?,32768) FROM snapshots WHERE profile=? AND part=?",
                    new String[]{String.valueOf(offset), profile, part})) {
                if (!row.moveToFirst() || row.isNull(0)) return null;
                String chunk = row.getString(0);
                if (chunk.isEmpty()) return result.toString();
                result.append(chunk);
            }
        }
    }

    private static String validBody(SQLiteDatabase db, String profile, String part, boolean previous) throws Exception {
        String body = readColumn(db, profile, part, previous ? "previous" : "body");
        if (body == null) throw new IllegalStateException("Missing cache part");
        String checksum = readColumn(db, profile, part, previous ? "previous_digest" : "digest");
        if (!digest(body).equals(checksum)) throw new IllegalStateException("Cache checksum mismatch");
        JSONObject value = new JSONObject(body);
        if (part.startsWith("term:")) validateTerm(value);
        return body;
    }

    private static void put(SQLiteDatabase db, String profile, String part, String body) throws Exception {
        String previous = null;
        try { previous = validBody(db, profile, part, false); }
        catch (Exception ignored) {
            try { previous = validBody(db, profile, part, true); }
            catch (Exception noPrevious) { /* first commit */ }
        }
        if (body.equals(previous)) return;
        ContentValues values = new ContentValues();
        values.put("profile", profile);
        values.put("part", part);
        values.put("body", body);
        values.put("digest", digest(body));
        values.put("previous", previous);
        values.put("previous_digest", previous == null ? null : digest(previous));
        if (db.insertWithOnConflict("snapshots", null, values, SQLiteDatabase.CONFLICT_REPLACE) < 0) {
            throw new IllegalStateException("Cache transaction failed");
        }
    }

    synchronized String lastProfile() {
        try (Cursor row = getReadableDatabase().rawQuery("SELECT profile FROM active_profile WHERE id=1", null)) {
            return row.moveToFirst() ? row.getString(0) : "";
        }
    }

    synchronized String load(String profile) throws Exception {
        JSONObject metadata = null;
        JSONObject terms = new JSONObject();
        boolean recovered = false;
        SQLiteDatabase db = getReadableDatabase();
        try (Cursor rows = db.rawQuery("SELECT part FROM snapshots WHERE profile=?", new String[]{profile})) {
            while (rows.moveToNext()) {
                String part = rows.getString(0);
                JSONObject value;
                try {
                    value = new JSONObject(validBody(db, profile, part, false));
                } catch (Exception corrupt) {
                    value = new JSONObject(validBody(db, profile, part, true));
                    recovered = true;
                }
                if ("meta".equals(part)) metadata = value;
                else if (part.startsWith("term:")) terms.put(part.substring(5), value);
            }
        }
        if (metadata == null) return "";
        metadata.put("termSnapshots", terms);
        metadata.put("recoveredPrevious", recovered);
        return metadata.toString();
    }

    synchronized void clear(String profile) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("snapshots", "profile=?", new String[]{profile});
            db.delete("active_profile", "profile=?", new String[]{profile});
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }
}
