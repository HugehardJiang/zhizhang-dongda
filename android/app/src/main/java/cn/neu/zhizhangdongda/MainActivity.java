package cn.neu.zhizhangdongda;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.animation.ValueAnimator;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Picture;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Bundle;
import android.provider.MediaStore;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.text.InputType;
import android.util.Base64;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.KeyStore;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * 执掌东大 Android 外壳：
 * - portalWebView 负责首次教务系统登录；
 * - dashboardWebView 复用插件已经验证过的本地 HTML/JS/CSS；
 * - ecodeWebView 只负责首页的 E 码通原网页，两套入口可以分别登录；
 * - AndroidBridge 负责把 WebVPN Cookie 带到原生网络请求中；
 * - CookieManager 保持学校会话，Android Keystore 加密保存用户明确选择记住的内置登录凭据；
 * - 应用内部 personal-cache 文件只保存按学号隔离的个人查询结果，供失效会话时离线展示。
 * - 应用内部 local-schedule 文件只保存按学号隔离的本地课程/日程覆盖层，
 *   不会混入教务缓存，也不会回写学校接口。
 */
public class MainActivity extends Activity {
    private static final String LOG_TAG = "ZhizhangEcode";
    private static final String PORTAL_URL = "https://webvpn.neu.edu.cn/http/62304135386136393339346365373340baf6bc2bc4cb43c8bc1d6f66c806db";
    // 这是学校 E 码通对应的 WebVPN 目标地址；其中的代理标识必须与学校
    // 给出的地址完全一致，少一个字符都会被 WebVPN 解析成 PARSE_FAILED。
    // 不把 SPA 的 #/ 片段直接交给 WebVPN 代理，先请求目录地址，让原网页
    // 自己完成重定向，兼容 Android WebView 的代理解析行为。
    private static final String ECODE_URL = "https://webvpn.neu.edu.cn/https/62304135386136393339346365373340b5e2ab3b8f8b48d8e7566e77934bd689/ecode/";
    private static final String ECODE_TARGET_TOKEN = "62304135386136393339346365373340b5e2ab3b8f8b48d8e7566e77934bd689";
    private static final String DASHBOARD_URL = "file:///android_asset/dashboard.html?v=0.1.45";
    private static final String WECHAT_PACKAGE = "com.tencent.mm";
    private static final String ECODE_LAYOUT_SCRIPT = """
            (function () {
              function nodes(selector) {
                return Array.prototype.slice.call(document.querySelectorAll(selector));
              }

              function textOf(node) {
                return ((node && (node.innerText || node.textContent)) || "")
                  .replace(/\\s+/g, " ").trim();
              }

              function timeFrom(text) {
                var match = String(text || "").match(/[0-9]{4}[-\\/][0-9]{1,2}[-\\/][0-9]{1,2}[ T][0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?/);
                return match ? match[0] : "";
              }

              function findTimeNode() {
                var candidates = nodes("*").filter(function (node) {
                  var text = textOf(node);
                  return text && text.length < 90 && !!timeFrom(text);
                });
                candidates.sort(function (a, b) {
                  return textOf(a).length - textOf(b).length;
                });
                return candidates[0] || null;
              }

              function bounds(node) {
                var rect = node.getBoundingClientRect ? node.getBoundingClientRect() : { width: 0, height: 0, left: 0, top: 0 };
                return {
                  width: rect.width || node.naturalWidth || node.width || 0,
                  height: rect.height || node.naturalHeight || node.height || 0,
                  left: rect.left || 0,
                  top: rect.top || 0
                };
              }

              function visualScore(node, timeNode) {
                var box = bounds(node);
                if (box.width < 60 || box.height < 60) return -1;
                var ratio = Math.max(box.width, box.height) / Math.max(1, Math.min(box.width, box.height));
                if (ratio > 1.65) return -1;
                var identity = String(node.id || "") + " " + String(node.className || "") + " " + String(node.getAttribute && node.getAttribute("aria-label") || "") + " " + String(node.getAttribute && node.getAttribute("alt") || "");
                var score = Math.min(box.width * box.height, 250000);
                if (/qr|qrcode|二维码|码通|code/i.test(identity)) score += 1000000;
                if (/avatar|head|photo|头像|logo|banner/i.test(identity)) score -= 700000;
                var parent = node.parentElement;
                for (var depth = 0; parent && depth < 5; depth += 1) {
                  var parentText = textOf(parent);
                  if (/码通|二维码/i.test(parentText)) score += 250000;
                  if (timeNode && parent.contains && parent.contains(timeNode)) score += 150000;
                  parent = parent.parentElement;
                }
                score -= Math.abs((box.left + box.width / 2) - (window.innerWidth || 360)) * 100;
                return score;
              }

              function findVisual(timeNode) {
                var candidates = nodes("img, canvas, svg");
                nodes("[style*='background'], [class*='qr'], [class*='code'], [id*='qr'], [id*='code']").forEach(function (node) {
                  if (candidates.indexOf(node) < 0) candidates.push(node);
                });
                var best = null;
                var bestScore = -1;
                candidates.forEach(function (node) {
                  var tag = String(node.tagName || "").toLowerCase();
                  if (tag !== "img" && tag !== "canvas" && tag !== "svg") {
                    var style = window.getComputedStyle(node);
                    if (!style || style.backgroundImage === "none") return;
                  }
                  var score = visualScore(node, timeNode);
                  if (score > bestScore) {
                    best = node;
                    bestScore = score;
                  }
                });
                return best;
              }

              var timeNode = findTimeNode();
              var visualNode = timeNode ? findVisual(timeNode) : null;
              var time = timeFrom(textOf(timeNode));
              var rect = visualNode && visualNode.getBoundingClientRect ? visualNode.getBoundingClientRect() : null;
              var ready = Boolean(time && rect && rect.width >= 60 && rect.height >= 60);
              var scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
              var target = ready ? Math.max(0, Math.round(rect.top + scrollTop - Math.max(40, Math.min(88, (window.innerHeight || 600) * 0.12)))) : 0;
              if (ready && !window.__zhizhangEcodeAutoScrolled) {
                window.scrollTo(0, target);
                window.__zhizhangEcodeAutoScrolled = true;
              }
              return JSON.stringify({
                ok: ready,
                time: time,
                top: target,
                reason: time ? (ready ? "" : "二维码元素未找到") : "E码通页面尚未返回有效时间",
                rect: rect ? { left: rect.left || 0, top: rect.top || 0, width: rect.width || 0, height: rect.height || 0 } : null
              });
            })();
            """;
    /**
     * 把 E 码通页面里的二维码定位、裁切成缩略图。
     * 优先使用真实 canvas/img/svg 及其二维码容器的 DOM 信息；如果图片节点
     * 自带白边，再在节点内部按高对比度像素收紧裁切，避免把整张校园码卡片
     * 缩小后塞进左侧缩略图。
     */
    private static final String ECODE_QR_IMAGE_SCRIPT = """
            (function () {
              function textOf(node) {
                return ((node && (node.innerText || node.textContent)) || '').replace(/\\s+/g, ' ').trim();
              }

              function rectOf(node) {
                var rect = node && node.getBoundingClientRect ? node.getBoundingClientRect() : { width: 0, height: 0, left: 0, top: 0 };
                return {
                  width: rect.width || node.naturalWidth || node.width || 0,
                  height: rect.height || node.naturalHeight || node.height || 0,
                  left: rect.left || 0,
                  top: rect.top || 0
                };
              }

              function identityOf(node) {
                if (!node) return '';
                return String(node.id || '') + ' ' + String(node.className || '') + ' '
                  + String(node.getAttribute && node.getAttribute('aria-label') || '') + ' '
                  + String(node.getAttribute && node.getAttribute('alt') || '') + ' '
                  + String(node.getAttribute && node.getAttribute('title') || '');
              }

              function score(node, timeNode) {
                var size = rectOf(node);
                if (size.width < 60 || size.height < 60) return -1;
                var ratio = Math.max(size.width, size.height) / Math.max(1, Math.min(size.width, size.height));
                if (ratio > 1.8) return -1;
                var identity = identityOf(node);
                var value = Math.min(size.width * size.height, 250000);
                if (/qr|qrcode|二维码|校园码|码通|扫码|code/i.test(identity)) value += 1000000;
                if (/logo|avatar|head|photo|banner|头像|背景/i.test(identity)) value -= 700000;
                var parent = node.parentElement;
                for (var depth = 0; parent && depth < 5; depth += 1) {
                  var context = identityOf(parent) + ' ' + textOf(parent).slice(0, 180);
                  if (/qr|qrcode|二维码|校园码|码通|扫码|登录/i.test(context)) value += 260000;
                  if (timeNode && parent.contains && parent.contains(timeNode)) value += 180000;
                  parent = parent.parentElement;
                }
                value -= Math.abs((size.left + size.width / 2) - (window.innerWidth || 360)) * 80;
                return value;
              }

              function backgroundDataUrl(node) {
                if (!node || !window.getComputedStyle) return '';
                var background = String(window.getComputedStyle(node).backgroundImage || '');
                var start = background.indexOf('data:image/');
                if (start < 0) return '';
                var end = background.indexOf(')', start);
                return (end >= 0 ? background.slice(start, end) : background.slice(start)).replace(/^['\"]|['\"]$/g, '');
              }

              function cropCanvas(source) {
                if (!source || !source.width || !source.height) return '';
                var context;
                try { context = source.getContext('2d', { willReadFrequently: true }); } catch (ignored) {}
                if (!context) return '';
                var pixels;
                try { pixels = context.getImageData(0, 0, source.width, source.height); } catch (ignored) { return ''; }
                var step = Math.max(1, Math.floor(Math.max(source.width, source.height) / 480));
                var left = source.width;
                var top = source.height;
                var right = -1;
                var bottom = -1;
                for (var y = 0; y < source.height; y += step) {
                  for (var x = 0; x < source.width; x += step) {
                    var offset = (y * source.width + x) * 4;
                    var alpha = pixels.data[offset + 3];
                    var luma = pixels.data[offset] * 0.299 + pixels.data[offset + 1] * 0.587 + pixels.data[offset + 2] * 0.114;
                    if (alpha > 24 && luma < 220) {
                      left = Math.min(left, x);
                      top = Math.min(top, y);
                      right = Math.max(right, x);
                      bottom = Math.max(bottom, y);
                    }
                  }
                }
                if (right < left || bottom < top) {
                  try { return source.toDataURL('image/png'); } catch (ignored) { return ''; }
                }
                var darkWidth = right - left + 1;
                var darkHeight = bottom - top + 1;
                var ratio = Math.max(darkWidth, darkHeight) / Math.max(1, Math.min(darkWidth, darkHeight));
                // 节点本身如果不是接近方形，通常是整张卡片或横幅，交给
                // Android 截图分析兜底，避免把标题和正文一起当成二维码。
                if (ratio > 1.8 || darkWidth < source.width * 0.08 || darkHeight < source.height * 0.08) {
                  try { return source.toDataURL('image/png'); } catch (ignored) { return ''; }
                }
                var side = Math.max(darkWidth, darkHeight) * 1.28;
                var centerX = (left + right) / 2;
                var centerY = (top + bottom) / 2;
                var sx = Math.max(0, Math.min(source.width - side, centerX - side / 2));
                var sy = Math.max(0, Math.min(source.height - side, centerY - side / 2));
                var output = document.createElement('canvas');
                output.width = Math.max(1, Math.round(side));
                output.height = output.width;
                try {
                  output.getContext('2d').drawImage(source, sx, sy, side, side, 0, 0, output.width, output.height);
                  return output.toDataURL('image/png');
                } catch (ignored) {
                  try { return source.toDataURL('image/png'); } catch (nested) { return ''; }
                }
              }

              function toDataUrl(node) {
                if (!node) return '';
                var tag = String(node.tagName || '').toLowerCase();
                if (tag === 'canvas') {
                  return cropCanvas(node);
                }
                if (tag === 'img') {
                  var source = String(node.currentSrc || node.src || '');
                  if (source.indexOf('data:image/') === 0) {
                    try {
                      var dataCanvas = document.createElement('canvas');
                      dataCanvas.width = node.naturalWidth || node.width || 0;
                      dataCanvas.height = node.naturalHeight || node.height || 0;
                      if (dataCanvas.width && dataCanvas.height) {
                        dataCanvas.getContext('2d').drawImage(node, 0, 0, dataCanvas.width, dataCanvas.height);
                        return cropCanvas(dataCanvas);
                      }
                    } catch (ignored) {}
                    return source;
                  }
                  try {
                    var canvas = document.createElement('canvas');
                    canvas.width = node.naturalWidth || node.width || 0;
                    canvas.height = node.naturalHeight || node.height || 0;
                    if (!canvas.width || !canvas.height) return '';
                    canvas.getContext('2d').drawImage(node, 0, 0, canvas.width, canvas.height);
                    return cropCanvas(canvas);
                  } catch (ignored) {}
                }
                if (tag === 'svg') {
                  try {
                    var svg = new XMLSerializer().serializeToString(node);
                    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
                  } catch (ignored) {}
                }
                return backgroundDataUrl(node);
              }

              var timeNode = Array.prototype.slice.call(document.querySelectorAll('*'))
                .filter(function (node) { var text = textOf(node); return text && text.length < 90 && /[0-9]{4}[-\\/][0-9]{1,2}[-\\/][0-9]{1,2}[ T][0-9]{1,2}:[0-9]{2}/.test(text); })
                .sort(function (a, b) { return textOf(a).length - textOf(b).length; })[0] || null;
              var candidates = Array.prototype.slice.call(document.querySelectorAll('canvas, img, svg'));
              Array.prototype.slice.call(document.querySelectorAll('[id*="qr"], [id*="code"], [class*="qr"], [class*="code"], [style*="background"]')).forEach(function (node) {
                var visual = node.querySelector && node.querySelector('canvas, img, svg');
                var candidate = visual || node;
                if (candidates.indexOf(candidate) < 0) candidates.push(candidate);
              });
              candidates = candidates.filter(function (node) { return score(node, timeNode) >= 0; });
              candidates.sort(function (a, b) { return score(b, timeNode) - score(a, timeNode); });
              var best = candidates[0] || null;
              var dataUrl = toDataUrl(best);
              var rect = best ? rectOf(best) : null;
              return JSON.stringify({
                dataUrl: dataUrl || '',
                source: dataUrl ? 'dom' : (best ? 'dom-unreadable' : 'image-analysis-fallback'),
                rect: rect
              });
            })();
            """;
    private static final String PREFS = "zhizhang_dongda";
    // 不复用旧版本的 has_session：旧版本把 E 码通登录误当成教务登录，
    // 升级后必须重新以教务系统会话为准，避免“上面已登录、下面未登录”。
    private static final String HAS_ACADEMIC_SESSION = "has_academic_session";
    private static final String DEFAULT_LOGIN_METHOD = "default_login_method";
    private static final String BUILT_IN_CREDENTIALS = "built_in_credentials";
    private static final String LAST_ACADEMIC_LOGIN_ERROR = "last_academic_login_error";
    private static final String SAVED_QR_IMAGE_URI = "saved_qr_image_uri";
    private static final String SAVED_QR_IMAGE_PATH = "saved_qr_image_path";
    private static final String LOGIN_METHOD_BUILT_IN = "builtin";
    private static final String LOGIN_METHOD_PASSWORD = "password";
    private static final String LOGIN_METHOD_WECHAT = "wechat";
    private static final String LOGIN_KEYSTORE_ALIAS = "zhizhang_builtin_login_v1";
    private static final int LOGIN_INSPECTION_MAX_ATTEMPTS = 18;
    private static final int ACADEMIC_SSO_RECOVERY_IDLE = 0;
    private static final int ACADEMIC_SSO_RECOVERY_ECODE = 1;
    private static final int ACADEMIC_SSO_RECOVERY_PORTAL = 2;
    private static final long ACADEMIC_SSO_RECOVERY_TIMEOUT_MS = 16000L;
    private static final int WRITE_QR_STORAGE_REQUEST = 2201;
    private static final int WRITE_DASHBOARD_IMAGE_REQUEST = 2202;
    private static final int WRITE_DASHBOARD_CSV_REQUEST = 2203;
    private static final String PERSONAL_CACHE_LAST_KEY = "personal_cache_last_key";
    private static final String PERSONAL_CACHE_DIRECTORY = "personal-cache";
    private static final String LOCAL_SCHEDULE_LAST_KEY = "local_schedule_last_key";
    private static final String LOCAL_SCHEDULE_DIRECTORY = "local-schedule";
    // JavascriptInterface 参数和返回值会经过 Binder；控制在 900 KiB 内，
    // 避免大号成绩历史在部分 Android 版本上触发事务大小限制。
    private static final int PERSONAL_CACHE_MAX_BYTES = 900 * 1024;
    private static final int LOCAL_SCHEDULE_MAX_BYTES = 900 * 1024;
    private static final int ECODE_COLLAPSED_HEIGHT_DP = 112;

    /**
     * 原登录页的二维码脚本会把完整的 qyQrLogin 地址传给 QRCode.makeCode。
     * 在页面已经加载后包一层，只把这个短时效地址交给本地桥；不读取密码，
     * 也不把二维码地址写入 SharedPreferences、日志或网络请求。
     */
    private static final String QR_CAPTURE_SCRIPT = """
            (function (autoSelect) {
              if (window.__zhizhangQrCaptureStarted) {
                var existingButton = document.getElementById('qrcode_login');
                if (autoSelect && existingButton && typeof existingButton.click === 'function') existingButton.click();
                return true;
              }
              window.__zhizhangQrCaptureStarted = true;
              var attempts = 0;
              function notify(value) {
                try {
                  if (window.AndroidLoginBridge && typeof window.AndroidLoginBridge.onQrUrl === 'function') {
                    window.AndroidLoginBridge.onQrUrl(String(value || ''));
                  }
                } catch (ignored) {}
              }
              function selectQrTab() {
                if (!autoSelect || window.__zhizhangQrAutoSelected) return;
                var button = document.getElementById('qrcode_login');
                if (button && typeof button.click === 'function') {
                  window.__zhizhangQrAutoSelected = true;
                  button.click();
                }
              }
              function install() {
                var qr = window.QRCode;
                var prototype = qr && qr.prototype;
                var ready = Boolean(prototype && typeof prototype.makeCode === 'function');
                if (ready && !prototype.__zhizhangWrapped) {
                  var original = prototype.makeCode;
                  prototype.makeCode = function (value) {
                    notify(value);
                    return original.apply(this, arguments);
                  };
                  prototype.__zhizhangWrapped = true;
                }
                // WebVPN 的登录脚本有时把 QRCode 放在包装函数作用域中，
                // 原生 WebView 不一定能从 window.QRCode 看到它。二维码轮询
                // 请求还会由原生 WebViewClient 兜底捕获，因此这里即使没有
                // hook 到 QRCode，也必须先切到二维码标签触发登录页生成二维码。
                selectQrTab();
                if (!ready && attempts++ < 80) window.setTimeout(install, 150);
              }
              install();
              return true;
            })(__AUTO_QR__);
            """;

    /**
     * 从学校登录页当前显示的二维码节点导出 PNG。二维码通常由 QRCode.js
     * 生成到 canvas，也兼容 img 和 data URL 背景；不再把登录地址交给浏览器。
     */
    private static final String QR_IMAGE_SCRIPT = """
            (function () {
              function textOf(node) {
                return ((node && (node.innerText || node.textContent)) || "")
                  .replace(/\\s+/g, " ").trim();
              }

              function bounds(node) {
                var rect = node && node.getBoundingClientRect ? node.getBoundingClientRect() : { width: 0, height: 0 };
                return {
                  width: rect.width || node.naturalWidth || node.width || 0,
                  height: rect.height || node.naturalHeight || node.height || 0
                };
              }

              function score(node) {
                var box = bounds(node);
                if (box.width < 80 || box.height < 80) return -1;
                var ratio = Math.max(box.width, box.height) / Math.max(1, Math.min(box.width, box.height));
                if (ratio > 1.6) return -1;
                var identity = String(node.id || "") + " " + String(node.className || "") + " "
                  + String(node.getAttribute && node.getAttribute("aria-label") || "") + " "
                  + String(node.getAttribute && node.getAttribute("alt") || "");
                var scoreValue = Math.min(box.width * box.height, 250000);
                if (/qr|qrcode|二维码|扫码|登录/i.test(identity)) scoreValue += 1000000;
                if (/logo|avatar|head|photo|头像|banner/i.test(identity)) scoreValue -= 700000;
                var parent = node.parentElement;
                for (var depth = 0; parent && depth < 5; depth += 1) {
                  var parentText = textOf(parent);
                  var parentIdentity = String(parent.id || "") + " " + String(parent.className || "");
                  if (/二维码|扫码|微信|登录|qr|qrcode/i.test(parentText + " " + parentIdentity)) scoreValue += 240000;
                  parent = parent.parentElement;
                }
                return scoreValue;
              }

              function toDataUrl(node) {
                if (!node) return "";
                var tag = String(node.tagName || "").toLowerCase();
                if (tag === "canvas") {
                  try { return node.toDataURL("image/png"); } catch (ignored) {}
                }
                if (tag === "img") {
                  var source = String(node.currentSrc || node.src || "");
                  if (source.indexOf("data:image/") === 0) return source;
                  try {
                    var canvas = document.createElement("canvas");
                    canvas.width = node.naturalWidth || node.width || 0;
                    canvas.height = node.naturalHeight || node.height || 0;
                    if (!canvas.width || !canvas.height) return "";
                    canvas.getContext("2d").drawImage(node, 0, 0, canvas.width, canvas.height);
                    return canvas.toDataURL("image/png");
                  } catch (ignored) {}
                }
                var background = node && window.getComputedStyle ? window.getComputedStyle(node).backgroundImage : "";
                var start = String(background || "").indexOf("data:image/");
                if (start >= 0) {
                  var end = String(background).indexOf(")", start);
                  var raw = end >= 0 ? String(background).slice(start, end) : String(background).slice(start);
                  return raw.replace(/^['\"]|['\"]$/g, "");
                }
                return "";
              }

              var candidates = Array.prototype.slice.call(document.querySelectorAll("canvas, img, svg"));
              candidates = candidates.filter(function (node) { return score(node) >= 0; });
              candidates.sort(function (a, b) { return score(b) - score(a); });
              return toDataUrl(candidates[0]);
            })();
            """;

    private final ExecutorService networkExecutor = Executors.newCachedThreadPool();
    private final CookieManager cookieManager = CookieManager.getInstance();

    private FrameLayout root;
    private WebView portalWebView;
    private WebView ecodeWebView;
    private WebView dashboardWebView;
    private LinearLayout loginMethodBar;
    private FrameLayout builtInLoginPanel;
    private EditText builtInUsernameInput;
    private EditText builtInPasswordInput;
    private EditText builtInCodeInput;
    private LinearLayout builtInCodeRow;
    private CheckBox builtInTrustDeviceCheck;
    private TextView builtInLoginStatus;
    private Button builtInLoginButton;
    private Button builtInCodeSendButton;
    private FrameLayout dashboardHome;
    private FrameLayout ecodePanel;
    private FrameLayout ecodeCollapsedCard;
    private ImageView ecodeThumbnailView;
    private TextView ecodeCollapsedTimeView;
    private TextView ecodeErrorView;
    private TextView ecodeExpandHint;
    private TextView ecodeCollapseButton;
    private TextView ecodeRefreshButton;
    private TextView ecodeLoginButton;
    private Button portalActionButton;
    private Button portalQrActionButton;
    private SharedPreferences preferences;
    private boolean dashboardVisible;
    private boolean dashboardLoaded;
    private boolean dashboardPageReady;
    private boolean ecodeExpanded;
    private boolean ecodeAutoScrolled;
    private boolean ecodeSessionReady;
    private boolean ecodeWarmupPending;
    private boolean ecodePanelHidden;
    private int ecodeProbeAttempts;
    private String loginMethodForCurrentPortal = LOGIN_METHOD_BUILT_IN;
    private volatile String portalLoginService = "";
    private String pendingQrUrl = "";
    private String pendingDashboardImageDataUrl = "";
    private String pendingDashboardImageName = "";
    private String pendingDashboardCsvContent = "";
    private String pendingDashboardCsvName = "";
    private String savedQrImageUri = "";
    private String savedQrImagePath = "";
    private boolean qrSavePendingPermission;
    private boolean loginMethodChooserShown;
    private boolean builtInLoginSubmissionPending;
    private boolean builtInLoginAwaitingPage;
    private boolean builtInLoginChallengeVisible;
    private boolean backgroundLoginInProgress;
    private boolean backgroundLoginAttemptedForCurrentFailure;
    private boolean academicSsoRecoveryInProgress;
    private boolean academicSsoRecoveryAttemptedForCurrentFailure;
    private int academicSsoRecoveryStage = ACADEMIC_SSO_RECOVERY_IDLE;
    private int academicSsoRecoveryToken;
    private boolean academicSsoEcodeNavigationStarted;
    private String pendingAcademicFailureReason = "";
    private int builtInLoginInspectionAttempts;
    private String pendingBuiltInUsername = "";
    private String pendingBuiltInPassword = "";
    private String lastAcademicLoginError = "";

    private static final class LoginCredentials {
        final String username;
        final String password;

        LoginCredentials(String username, String password) {
            this.username = username == null ? "" : username;
            this.password = password == null ? "" : password;
        }

        boolean isComplete() {
            return !username.trim().isEmpty() && !password.isEmpty();
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(246, 247, 249));
        getWindow().setNavigationBarColor(Color.rgb(246, 247, 249));

        preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        cookieManager.setAcceptCookie(true);
        if (!preferences.contains(DEFAULT_LOGIN_METHOD)) {
            preferences.edit().putString(DEFAULT_LOGIN_METHOD, LOGIN_METHOD_BUILT_IN).apply();
        }
        loginMethodForCurrentPortal = readLoginMethodPreference();
        lastAcademicLoginError = preferences.getString(LAST_ACADEMIC_LOGIN_ERROR, "");
        savedQrImageUri = preferences.getString(SAVED_QR_IMAGE_URI, "");
        savedQrImagePath = preferences.getString(SAVED_QR_IMAGE_PATH, "");

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(246, 247, 249));

        portalWebView = createWebView(false);
        portalWebView.addJavascriptInterface(new LoginBridge(), "AndroidLoginBridge");
        ecodeWebView = createWebView(false);
        dashboardWebView = createWebView(true);
        root.addView(portalWebView, fullScreenParams());

        dashboardHome = new FrameLayout(this);
        dashboardHome.setBackgroundColor(Color.rgb(246, 247, 249));
        FrameLayout.LayoutParams dashboardParams = fullScreenParams();
        dashboardHome.addView(dashboardWebView, dashboardParams);
        ecodePanel = createEcodePanel();
        FrameLayout.LayoutParams ecodeParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                dp(ECODE_COLLAPSED_HEIGHT_DP),
                Gravity.TOP
        );
        dashboardHome.addView(ecodePanel, ecodeParams);
        root.addView(dashboardHome, fullScreenParams());

        loginMethodBar = createLoginMethodBar();
        root.addView(loginMethodBar, loginMethodBarParams());
        builtInLoginPanel = createBuiltInLoginPanel();
        root.addView(builtInLoginPanel, builtInLoginPanelParams());

        portalActionButton = new Button(this);
        portalActionButton.setAllCaps(false);
        portalActionButton.setTextColor(Color.WHITE);
        portalActionButton.setTextSize(15);
        portalActionButton.setText("完成教务系统登录，进入执掌东大");
        portalActionButton.setBackground(roundBackground(Color.rgb(47, 104, 244), 16));
        portalActionButton.setOnClickListener(view -> {
            if (hasSavedQrImage()) {
                deleteSavedQrImage();
                showDashboard();
                return;
            }
            if (isPortalLoginPage(portalWebView == null ? "" : portalWebView.getUrl())) {
                Toast.makeText(this, "请先在上方完成教务系统登录", Toast.LENGTH_SHORT).show();
                return;
            }
            showDashboard();
        });
        FrameLayout.LayoutParams actionParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                dp(52),
                Gravity.BOTTOM
        );
        actionParams.setMargins(dp(16), 0, dp(16), dp(24));
        root.addView(portalActionButton, actionParams);

        portalQrActionButton = new Button(this);
        portalQrActionButton.setAllCaps(false);
        portalQrActionButton.setTextColor(Color.rgb(38, 54, 83));
        portalQrActionButton.setTextSize(14);
        portalQrActionButton.setText("保存二维码并打开微信");
        portalQrActionButton.setContentDescription("保存教务系统登录二维码并打开微信");
        portalQrActionButton.setBackground(roundBackground(Color.WHITE, 16));
        portalQrActionButton.setOnClickListener(view -> saveQrAndOpenWechat());
        portalQrActionButton.setVisibility(View.GONE);
        FrameLayout.LayoutParams qrActionParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                dp(48),
                Gravity.BOTTOM
        );
        qrActionParams.setMargins(dp(16), 0, dp(16), dp(84));
        root.addView(portalQrActionButton, qrActionParams);

        setContentView(root);
        applySystemBarInsets();
        boolean hasAcademicSession = preferences.getBoolean(HAS_ACADEMIC_SESSION, false);
        if (hasAcademicSession) {
            // 只根据教务系统登录标记进入查询页。E 码通是否有效由上方独立
            // 原网页自己判断，不能再阻塞教务成绩、考试和课表查询。
            showDashboard();
        } else if (!lastAcademicLoginError.isEmpty()
                || (LOGIN_METHOD_BUILT_IN.equals(loginMethodForCurrentPortal)
                && loadBuiltInCredentials().isComplete())) {
            // 上一次已确认教务会话失效：先显示查询页/缓存，再让
            // 隐藏 WebView 优先复用 E 码通/统一认证长会话，失败后才降级到加密账密。
            showDashboard();
            academicSsoRecoveryAttemptedForCurrentFailure = true;
            root.postDelayed(() -> startAcademicSsoRecovery(
                    "应用启动时发现教务会话已失效"), 180);
        } else {
            // 首次默认显示内置登录，同时始终保留学校原网页账密和二维码入口。
            showPortal();
        }
    }

    private WebView createWebView(boolean enableNativeBridge) {
        WebView webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        // 保持跨版本稳定的 UA 标识，避免应用更新被学校的可信设备策略视为全新设备。
        settings.setUserAgentString(settings.getUserAgentString() + " ZhiZhangDongDa/Android");
        webView.setBackgroundColor(Color.rgb(246, 247, 249));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                if (view == portalWebView) {
                    clearPendingQrUrl();
                    portalLoginService = extractLoginService(url);
                    if (academicSsoRecoveryInProgress
                            && academicSsoRecoveryStage == ACADEMIC_SSO_RECOVERY_ECODE
                            && url != null && url.contains(ECODE_TARGET_TOKEN)) {
                        academicSsoEcodeNavigationStarted = true;
                    }
                    updatePortalActionLabel(url);
                }
                if (view == ecodeWebView) {
                    Log.d(LOG_TAG, "page-started url=" + url + " warmup=" + ecodeWarmupPending);
                }
                if (view == dashboardWebView) {
                    dashboardPageReady = false;
                }
                if (view == ecodeWebView) {
                    ecodeAutoScrolled = false;
                    ecodeProbeAttempts = 0;
                    ecodeSessionReady = false;
                    setEcodeError("正在加载学校 E 码通原网页…");
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                cookieManager.flush();
                if (view == portalWebView) {
                    portalLoginService = extractLoginService(url);
                    if (academicSsoRecoveryInProgress) {
                        handleAcademicSsoRecoveryPage(url);
                        return;
                    }
                    updatePortalActionLabel(url);
                    installPortalQrCapture();
                    showQrActionLoadingIfNeeded(url);
                    showLoginMethodChooserIfNeeded(url);
                    if (builtInLoginSubmissionPending && isAcademicPortalReadyUrl(url)) {
                        finishBuiltInLoginSuccess();
                    } else if (builtInLoginSubmissionPending && isPortalLoginPage(url)) {
                        if (builtInLoginAwaitingPage) injectBuiltInCredentialsIntoSchoolPage();
                        else view.postDelayed(MainActivity.this::inspectBuiltInLoginPage, 350);
                    }
                } else if (view == ecodeWebView) {
                    Log.d(LOG_TAG, "page-finished url=" + url + " current=" + view.getUrl() + " title=" + view.getTitle() + " warmup=" + ecodeWarmupPending);
                    if (ecodeWarmupPending) {
                        // 兼容旧状态下手动刷新流程；正常首页加载不再依赖
                        // 教务入口给 E 码通“预热”，两者可以分别登录。
                        ecodeWarmupPending = false;
                        setEcodeError("教务入口已响应，正在打开 E 码通原网页…");
                        view.loadUrl(ECODE_URL);
                        return;
                    }
                    setEcodeError("原网页已加载，正在定位二维码…");
                    scheduleEcodeProbe(350);
                } else if (view == dashboardWebView) {
                    dashboardPageReady = true;
                    view.evaluateJavascript("document.documentElement.classList.add('android-shell');", null);
                    view.evaluateJavascript("window.__prepareNativeEcode && window.__prepareNativeEcode();", null);
                    // 查询页只等待教务系统会话；E 码通页面并行加载，不能成为
                    // 成绩、考试和课表请求的前置条件。
                    view.postDelayed(MainActivity.this::refreshDashboardData, 180);
                }
            }

            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, android.webkit.WebResourceRequest request) {
                if (view == portalWebView && request != null) {
                    captureQrUrlFromPollRequest(request.getUrl() == null ? "" : request.getUrl().toString(), portalLoginService);
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public void onReceivedError(WebView view, android.webkit.WebResourceRequest request, android.webkit.WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (view == ecodeWebView && (request == null || request.isForMainFrame())) {
                    String description = error == null ? "未知网络错误" : String.valueOf(error.getDescription());
                    Log.e(LOG_TAG, "main-frame-error url=" + (request == null ? "" : request.getUrl()) + " description=" + description);
                    setEcodeError("原网页加载失败：" + description);
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, android.webkit.WebResourceRequest request, android.webkit.WebResourceResponse response) {
                super.onReceivedHttpError(view, request, response);
                if (view == ecodeWebView && request != null && request.isForMainFrame()) {
                    int status = response == null ? -1 : response.getStatusCode();
                    Log.e(LOG_TAG, "main-frame-http-error url=" + request.getUrl() + " status=" + status);
                    setEcodeError("原网页返回 HTTP " + status + "，请检查 WebVPN 登录状态");
                }
            }
        });
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        // 登录 WebView 只负责访问学校页面，不暴露原生请求桥；查询页才需要桥接网络层。
        if (enableNativeBridge) {
            webView.addJavascriptInterface(new AndroidBridge(), "AndroidApi");
        }
        return webView;
    }

    private LinearLayout createLoginMethodBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setPadding(dp(8), dp(7), dp(8), dp(7));
        bar.setBackgroundColor(Color.WHITE);
        String[][] methods = {
                {LOGIN_METHOD_BUILT_IN, "内置登录"},
                {LOGIN_METHOD_PASSWORD, "原网页账密"},
                {LOGIN_METHOD_WECHAT, "二维码登录"}
        };
        for (String[] item : methods) {
            Button button = new Button(this);
            button.setTag(item[0]);
            button.setText(item[1]);
            button.setTextSize(12);
            button.setAllCaps(false);
            button.setMinHeight(0);
            button.setMinimumHeight(0);
            button.setPadding(dp(4), 0, dp(4), 0);
            button.setOnClickListener(view -> selectPortalLoginMethod(String.valueOf(view.getTag())));
            bar.addView(button, new LinearLayout.LayoutParams(0, dp(38), 1f));
        }
        return bar;
    }

    private FrameLayout.LayoutParams loginMethodBarParams() {
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, dp(52), Gravity.TOP);
        params.setMargins(dp(12), dp(6), dp(12), 0);
        return params;
    }

    private FrameLayout createBuiltInLoginPanel() {
        FrameLayout panel = new FrameLayout(this);
        panel.setBackgroundColor(Color.rgb(246, 247, 249));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(22), dp(30), dp(22), dp(30));

        TextView title = new TextView(this);
        title.setText("内置登录");
        title.setTextColor(Color.rgb(24, 35, 54));
        title.setTextSize(24);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        content.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("通过学校官方统一身份认证页面提交。凭据仅使用 Android Keystore 加密保存在本机，用于登录失效后的后台自动重试。");
        subtitle.setTextColor(Color.rgb(91, 104, 125));
        subtitle.setTextSize(13);
        subtitle.setLineSpacing(0, 1.25f);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        subtitleParams.setMargins(0, dp(8), 0, dp(22));
        content.addView(subtitle, subtitleParams);

        builtInUsernameInput = builtInLoginField("学号", InputType.TYPE_CLASS_TEXT);
        content.addView(builtInUsernameInput, loginFieldParams());
        builtInPasswordInput = builtInLoginField(
                "密码",
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD
        );
        content.addView(builtInPasswordInput, loginFieldParams());

        builtInCodeRow = new LinearLayout(this);
        builtInCodeRow.setTag("built_in_code_row");
        builtInCodeRow.setOrientation(LinearLayout.HORIZONTAL);
        builtInCodeInput = builtInLoginField("短信验证码", InputType.TYPE_CLASS_NUMBER);
        builtInCodeRow.addView(builtInCodeInput, new LinearLayout.LayoutParams(0, dp(52), 1f));
        builtInCodeSendButton = new Button(this);
        builtInCodeSendButton.setText("获取验证码");
        builtInCodeSendButton.setTextSize(12);
        builtInCodeSendButton.setAllCaps(false);
        builtInCodeSendButton.setOnClickListener(view -> requestBuiltInSmsCode());
        LinearLayout.LayoutParams codeButtonParams = new LinearLayout.LayoutParams(dp(112), dp(52));
        codeButtonParams.setMargins(dp(8), 0, 0, 0);
        builtInCodeRow.addView(builtInCodeSendButton, codeButtonParams);
        builtInCodeRow.setVisibility(View.GONE);
        content.addView(builtInCodeRow, loginFieldParams());

        builtInTrustDeviceCheck = new CheckBox(this);
        builtInTrustDeviceCheck.setText("信任此设备，并保存加密凭据用于后台自动登录");
        builtInTrustDeviceCheck.setTextColor(Color.rgb(47, 61, 83));
        builtInTrustDeviceCheck.setTextSize(13);
        builtInTrustDeviceCheck.setChecked(true);
        LinearLayout.LayoutParams trustParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        trustParams.setMargins(0, dp(2), 0, dp(14));
        content.addView(builtInTrustDeviceCheck, trustParams);

        builtInLoginButton = new Button(this);
        builtInLoginButton.setText("登录");
        builtInLoginButton.setAllCaps(false);
        builtInLoginButton.setTextSize(15);
        builtInLoginButton.setTextColor(Color.WHITE);
        builtInLoginButton.setBackground(roundBackground(Color.rgb(43, 101, 153), 14));
        builtInLoginButton.setOnClickListener(view -> {
            if (builtInLoginChallengeVisible) submitBuiltInVerificationCode();
            else submitBuiltInCredentials(false);
        });
        content.addView(builtInLoginButton, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(52)));

        builtInLoginStatus = new TextView(this);
        builtInLoginStatus.setTextColor(Color.rgb(111, 121, 138));
        builtInLoginStatus.setTextSize(12);
        builtInLoginStatus.setLineSpacing(0, 1.25f);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        statusParams.setMargins(0, dp(12), 0, dp(8));
        content.addView(builtInLoginStatus, statusParams);

        TextView fallback = new TextView(this);
        fallback.setText("如果内置登录失败，可随时切换到上方的原网页账密登录或二维码登录。验证码仅提交给学校页面，应用不会保存。");
        fallback.setTextColor(Color.rgb(125, 135, 151));
        fallback.setTextSize(11);
        fallback.setLineSpacing(0, 1.2f);
        content.addView(fallback);

        LoginCredentials saved = loadBuiltInCredentials();
        if (saved.isComplete()) {
            builtInUsernameInput.setText(saved.username);
            builtInPasswordInput.setText(saved.password);
            builtInLoginStatus.setText("已读取本机加密凭据。登录状态失效时会先在后台自动重试。");
        } else if (!lastAcademicLoginError.isEmpty()) {
            builtInLoginStatus.setText(lastAcademicLoginError);
            builtInLoginStatus.setTextColor(Color.rgb(176, 57, 57));
        }

        scroll.addView(content, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT));
        panel.addView(scroll, fullScreenParams());
        return panel;
    }

    private EditText builtInLoginField(String hint, int inputType) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setTextSize(15);
        field.setSingleLine(true);
        field.setInputType(inputType);
        field.setPadding(dp(14), 0, dp(14), 0);
        field.setBackground(roundBackground(Color.WHITE, 12));
        return field;
    }

    private LinearLayout.LayoutParams loginFieldParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(52));
        params.setMargins(0, 0, 0, dp(12));
        return params;
    }

    private FrameLayout.LayoutParams builtInLoginPanelParams() {
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.TOP
        );
        params.setMargins(0, dp(58), 0, 0);
        return params;
    }

    private FrameLayout.LayoutParams fullScreenParams() {
        return new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        );
    }

    private void applySystemBarInsets() {
        int systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            systemUiVisibility |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        getWindow().getDecorView().setSystemUiVisibility(systemUiVisibility);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            int top;
            int bottom;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                top = bars.top;
                bottom = bars.bottom;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            // Android 15 对 target 35 的 Activity 默认采用 edge-to-edge；将内容
            // 推到系统状态栏和导航栏以内，避免手机通知图标压住应用标题。
            view.setPadding(0, top, 0, bottom);
            return insets;
        });
        root.requestApplyInsets();
    }

    private void showPortal() {
        runOnUiThread(() -> {
            dashboardVisible = false;
            if (portalWebView.getUrl() == null || portalWebView.getUrl().isEmpty()
                    || !isPortalPageUrl(portalWebView.getUrl())) {
                portalWebView.loadUrl(PORTAL_URL);
            }
            portalWebView.setVisibility(View.VISIBLE);
            dashboardHome.setVisibility(View.GONE);
            if (loginMethodBar != null) loginMethodBar.setVisibility(View.VISIBLE);
            applyPortalLoginMethodUi();
            updatePortalActionLabel(portalWebView.getUrl());
            if (portalQrActionButton != null) {
                showQrActionLoadingIfNeeded(portalWebView.getUrl());
            }
            cookieManager.flush();
            portalWebView.postDelayed(this::installPortalQrCapture, 180);
        });
    }

    private void openPortalForReauthentication() {
        runOnUiThread(() -> {
            cancelAutomaticAcademicRecovery();
            if (dashboardVisible && portalWebView != null) {
                // 从查询页点击“打开原系统”时重新走一次统一认证入口，
                // 这样 Cookie 失效后不会停留在旧的远程页面。
                clearPendingQrUrl();
                portalWebView.loadUrl(PORTAL_URL);
            }
            showPortal();
        });
    }

    private boolean isAllowedGeneratedWebVpnUrl(String url) {
        if (url == null || url.isEmpty()) return false;
        try {
            Uri parsed = Uri.parse(url);
            String path = parsed.getPath();
            return "https".equalsIgnoreCase(parsed.getScheme())
                    && "webvpn.neu.edu.cn".equalsIgnoreCase(parsed.getHost())
                    && path != null
                    && (path.startsWith("/http/") || path.startsWith("/https/"));
        } catch (Exception ignored) {
            return false;
        }
    }

    private void openGeneratedWebVpnUrl(String url) {
        if (!isAllowedGeneratedWebVpnUrl(url)) return;
        runOnUiThread(() -> {
            cancelAutomaticAcademicRecovery();
            clearPendingQrUrl();
            showPortal();
            portalWebView.loadUrl(url);
        });
    }

    private void cancelAutomaticAcademicRecovery() {
        academicSsoRecoveryInProgress = false;
        academicSsoRecoveryStage = ACADEMIC_SSO_RECOVERY_IDLE;
        academicSsoEcodeNavigationStarted = false;
        academicSsoRecoveryToken += 1;
        if (backgroundLoginInProgress) {
            backgroundLoginInProgress = false;
            builtInLoginSubmissionPending = false;
            builtInLoginAwaitingPage = false;
            builtInLoginChallengeVisible = false;
            pendingBuiltInPassword = "";
        }
    }

    private void showDashboard() {
        runOnUiThread(() -> {
            dashboardVisible = true;
            preferences.edit().putBoolean(HAS_ACADEMIC_SESSION, true).apply();
            cookieManager.flush();
            portalWebView.setVisibility(View.GONE);
            if (loginMethodBar != null) loginMethodBar.setVisibility(View.GONE);
            if (builtInLoginPanel != null) builtInLoginPanel.setVisibility(View.GONE);
            dashboardHome.setVisibility(View.VISIBLE);
            portalActionButton.setVisibility(View.GONE);
            if (portalQrActionButton != null) portalQrActionButton.setVisibility(View.GONE);
            if (!dashboardLoaded) {
                dashboardLoaded = true;
                ecodeWarmupPending = false;
                ecodeWebView.loadUrl(ECODE_URL);
                dashboardWebView.loadUrl(DASHBOARD_URL);
            } else {
                // 登录页可能在应用切到微信期间完成认证；回到主界面时立刻
                // 复用新 Cookie 刷新数据，不要求用户退出应用再进一次。
                dashboardWebView.postDelayed(MainActivity.this::refreshDashboardData, 260);
            }
            if (ecodePanel != null) {
                ecodePanelHidden = false;
                ecodePanel.animate().cancel();
                ecodePanel.setTranslationY(0f);
                ecodePanel.setAlpha(1f);
                ecodePanel.setVisibility(View.VISIBLE);
            }
        });
    }

    private String readLoginMethodPreference() {
        String method = preferences == null ? "" : preferences.getString(DEFAULT_LOGIN_METHOD, "");
        if (LOGIN_METHOD_WECHAT.equals(method)) return LOGIN_METHOD_WECHAT;
        if (LOGIN_METHOD_PASSWORD.equals(method)) return LOGIN_METHOD_PASSWORD;
        return LOGIN_METHOD_BUILT_IN;
    }

    private SecretKey getOrCreateLoginSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(LOGIN_KEYSTORE_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                LOGIN_KEYSTORE_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    private void saveBuiltInCredentials(String username, String password) {
        if (preferences == null || username == null || username.trim().isEmpty()
                || password == null || password.isEmpty()) return;
        try {
            JSONObject payload = new JSONObject();
            payload.put("username", username.trim());
            payload.put("password", password);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateLoginSecretKey());
            byte[] encrypted = cipher.doFinal(payload.toString().getBytes(StandardCharsets.UTF_8));
            JSONObject envelope = new JSONObject();
            envelope.put("version", 1);
            envelope.put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
            envelope.put("ciphertext", Base64.encodeToString(encrypted, Base64.NO_WRAP));
            preferences.edit().putString(BUILT_IN_CREDENTIALS, envelope.toString()).apply();
        } catch (Exception error) {
            setBuiltInLoginError("无法安全保存登录凭据：" + safeErrorMessage(error));
        }
    }

    private LoginCredentials loadBuiltInCredentials() {
        if (preferences == null) return new LoginCredentials("", "");
        String encoded = preferences.getString(BUILT_IN_CREDENTIALS, "");
        if (encoded == null || encoded.isEmpty()) return new LoginCredentials("", "");
        try {
            JSONObject envelope = new JSONObject(encoded);
            byte[] iv = Base64.decode(envelope.getString("iv"), Base64.NO_WRAP);
            byte[] encrypted = Base64.decode(envelope.getString("ciphertext"), Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateLoginSecretKey(), new GCMParameterSpec(128, iv));
            JSONObject payload = new JSONObject(new String(
                    cipher.doFinal(encrypted), StandardCharsets.UTF_8));
            return new LoginCredentials(payload.optString("username", ""), payload.optString("password", ""));
        } catch (Exception error) {
            preferences.edit().remove(BUILT_IN_CREDENTIALS).apply();
            return new LoginCredentials("", "");
        }
    }

    private void clearBuiltInCredentials() {
        if (preferences != null) preferences.edit().remove(BUILT_IN_CREDENTIALS).apply();
    }

    private String safeErrorMessage(Throwable error) {
        if (error == null || error.getMessage() == null || error.getMessage().trim().isEmpty()) {
            return "未知错误";
        }
        return error.getMessage().trim();
    }

    private File personalCacheDirectory() {
        File directory = new File(getFilesDir(), PERSONAL_CACHE_DIRECTORY);
        if (!directory.exists()) directory.mkdirs();
        return directory;
    }

    private String personalCacheKey(String payload) {
        String studentId = "";
        try {
            studentId = new JSONObject(payload == null ? "" : payload).optString("studentId", "").trim();
        } catch (Exception ignored) {
            // 页面只会提交 JSON 缓存；格式错误时使用不可复用的兜底键。
        }
        if (studentId.isEmpty()) return "";
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(studentId.getBytes(StandardCharsets.UTF_8));
            StringBuilder key = new StringBuilder(digest.length * 2);
            for (byte value : digest) key.append(String.format("%02x", value & 0xff));
            return key.toString();
        } catch (Exception ignored) {
            return Integer.toHexString(studentId.hashCode());
        }
    }

    private File personalCacheFile(String key) {
        return new File(personalCacheDirectory(), key + ".json");
    }

    private String loadPersonalCachePayload() {
        if (preferences == null) return "";
        String key = preferences.getString(PERSONAL_CACHE_LAST_KEY, "");
        if (key.isEmpty()) return "";
        File file = personalCacheFile(key);
        if (!file.isFile()) return "";
        try (InputStream input = new java.io.FileInputStream(file)) {
            return readResponse(input);
        } catch (Exception ignored) {
            return "";
        }
    }

    private void savePersonalCachePayload(String payload) {
        if (payload == null || payload.isEmpty() || preferences == null) return;
        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > PERSONAL_CACHE_MAX_BYTES) return;
        String key = personalCacheKey(payload);
        if (key.isEmpty()) return;
        File directory = personalCacheDirectory();
        File target = personalCacheFile(key);
        File temporary = new File(directory, key + ".tmp");
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(bytes);
            output.flush();
        } catch (Exception ignored) {
            temporary.delete();
            return;
        }
        if (target.exists()) target.delete();
        if (!temporary.renameTo(target)) {
            try (FileOutputStream output = new FileOutputStream(target)) {
                output.write(bytes);
                output.flush();
                temporary.delete();
            } catch (Exception ignored) {
                target.delete();
                temporary.delete();
                return;
            }
        }
        preferences.edit().putString(PERSONAL_CACHE_LAST_KEY, key).apply();
    }

    private void clearPersonalCachePayload() {
        if (preferences == null) return;
        String key = preferences.getString(PERSONAL_CACHE_LAST_KEY, "");
        if (!key.isEmpty()) personalCacheFile(key).delete();
        preferences.edit().remove(PERSONAL_CACHE_LAST_KEY).apply();
    }

    private File localScheduleDirectory() {
        File directory = new File(getFilesDir(), LOCAL_SCHEDULE_DIRECTORY);
        if (!directory.exists()) directory.mkdirs();
        return directory;
    }

    private String localScheduleKeyForProfile(String profileKey) {
        String value = profileKey == null ? "" : profileKey.trim();
        if (value.isEmpty()) value = "anonymous";
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder key = new StringBuilder(digest.length * 2);
            for (byte item : digest) key.append(String.format("%02x", item & 0xff));
            return key.toString();
        } catch (Exception ignored) {
            return Integer.toHexString(value.hashCode());
        }
    }

    private String localScheduleKey(String payload) {
        String profileKey = "";
        try {
            JSONObject object = new JSONObject(payload == null ? "" : payload);
            profileKey = object.optString("studentId", "").trim();
            if (profileKey.isEmpty()) profileKey = object.optString("profileKey", "").trim();
        } catch (Exception ignored) {
            // 页面只提交 JSON；坏数据不覆盖已有文件。
        }
        return profileKey.isEmpty() ? "" : localScheduleKeyForProfile(profileKey);
    }

    private File localScheduleFile(String key) {
        return new File(localScheduleDirectory(), key + ".json");
    }

    private boolean replaceLocalScheduleFile(File temporary, File target) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return replaceLocalScheduleFileWithNio(temporary, target);
        }
        // Android 7 及以下没有 java.nio.file.Files；临时文件与目标文件位于
        // 同一目录，renameTo 在这些设备上仍是最安全的可用替换方式。
        return temporary.renameTo(target);
    }

    @android.annotation.TargetApi(Build.VERSION_CODES.O)
    private boolean replaceLocalScheduleFileWithNio(File temporary, File target) {
        try {
            Files.move(
                    temporary.toPath(),
                    target.toPath(),
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING
            );
            return true;
        } catch (Exception ignored) {
            // 部分 Android 文件系统不支持 ATOMIC_MOVE；继续尝试同文件系统替换。
        }
        try {
            Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING);
            return true;
        } catch (Exception ignored) {
            // 最后才使用 File.renameTo 兼容旧设备，仍然不主动删除旧文件。
            return temporary.renameTo(target);
        }
    }

    private String loadLocalSchedulePayload(String profileKey) {
        if (preferences == null) return "";
        String normalized = profileKey == null ? "" : profileKey.trim();
        String key = localScheduleKeyForProfile(normalized);
        if (normalized.isEmpty()) {
            String last = preferences.getString(LOCAL_SCHEDULE_LAST_KEY, "");
            if (!last.isEmpty()) key = last;
        }
        File file = localScheduleFile(key);
        if (!file.isFile()) return "";
        try (InputStream input = new java.io.FileInputStream(file)) {
            return readResponse(input);
        } catch (Exception ignored) {
            return "";
        }
    }

    private void saveLocalSchedulePayload(String payload) {
        if (payload == null || payload.isEmpty() || preferences == null) return;
        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > LOCAL_SCHEDULE_MAX_BYTES) return;
        String key = localScheduleKey(payload);
        if (key.isEmpty()) return;
        File directory = localScheduleDirectory();
        File target = localScheduleFile(key);
        File temporary = new File(directory, key + ".tmp");
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(bytes);
            output.flush();
            output.getFD().sync();
        } catch (Exception ignored) {
            temporary.delete();
            return;
        }
        if (!replaceLocalScheduleFile(temporary, target)) {
            temporary.delete();
            return;
        }
        preferences.edit().putString(LOCAL_SCHEDULE_LAST_KEY, key).apply();
    }

    private void clearLocalSchedulePayload(String profileKey) {
        if (preferences == null) return;
        String normalized = profileKey == null ? "" : profileKey.trim();
        String key = normalized.isEmpty()
                ? preferences.getString(LOCAL_SCHEDULE_LAST_KEY, "")
                : localScheduleKeyForProfile(normalized);
        if (!key.isEmpty()) localScheduleFile(key).delete();
        if (key.equals(preferences.getString(LOCAL_SCHEDULE_LAST_KEY, ""))) {
            preferences.edit().remove(LOCAL_SCHEDULE_LAST_KEY).apply();
        }
    }

    private boolean isPortalPageUrl(String url) {
        return url != null && url.startsWith("https://webvpn.neu.edu.cn/");
    }

    private boolean isPortalLoginPage(String url) {
        return isPortalPageUrl(url) && url.contains("/tpass/login");
    }

    private String extractLoginService(String url) {
        if (url == null || url.isEmpty()) return "";
        try {
            String service = Uri.parse(url).getQueryParameter("service");
            return service == null ? "" : service;
        } catch (RuntimeException ignored) {
            return "";
        }
    }

    private void showQrActionLoadingIfNeeded(String url) {
        if (portalQrActionButton == null) return;
        if (isAllowedQrUrl(pendingQrUrl)) {
            portalQrActionButton.setVisibility(View.VISIBLE);
            portalQrActionButton.setEnabled(true);
            portalQrActionButton.setText("保存二维码并打开微信");
            return;
        }
        if (isPortalLoginPage(url) && LOGIN_METHOD_WECHAT.equals(loginMethodForCurrentPortal)) {
            portalQrActionButton.setVisibility(View.VISIBLE);
            portalQrActionButton.setEnabled(false);
            portalQrActionButton.setText("正在获取登录二维码…");
        } else {
            portalQrActionButton.setVisibility(View.GONE);
            portalQrActionButton.setEnabled(true);
        }
    }

    private void captureQrUrlFromPollRequest(String pollUrl, String pageUrl) {
        if (pollUrl == null || !pollUrl.contains("/tpass/checkQRCodeScan") || !pollUrl.contains("uuid=")) return;
        String service = portalLoginService;
        if (service == null || service.isEmpty()) service = extractLoginService(pageUrl);
        String qrUrl = buildQrLoginUrlFromPollRequest(pollUrl, service);
        if (!qrUrl.isEmpty()) receiveQrUrl(qrUrl);
    }

    private String buildQrLoginUrlFromPollRequest(String pollUrl, String service) {
        try {
            Uri poll = Uri.parse(pollUrl);
            String path = poll.getPath();
            String uuid = poll.getQueryParameter("uuid");
            if (path == null || !path.contains("/checkQRCodeScan") || uuid == null || uuid.isEmpty()) return "";

            // WebVPN 把目标主机写成 query 的第一个无名参数，例如
            // “vpn-12-o2-pass.neu.edu.cn”。这个代理标记必须原样放回
            // qyQrLogin 地址，否则二维码链接会被 WebVPN 解析成普通查询。
            String marker = "";
            String encodedQuery = poll.getEncodedQuery();
            if (encodedQuery != null && !encodedQuery.isEmpty()) {
                String first = encodedQuery.split("&", 2)[0];
                if (!first.contains("=") && !first.isEmpty()) marker = first;
            }

            String targetPath = path.replace("/checkQRCodeScan", "/qyQrLogin");
            StringBuilder target = new StringBuilder("https://webvpn.neu.edu.cn").append(targetPath).append("?");
            if (!marker.isEmpty()) target.append(marker).append("&");
            target.append("uuid=").append(Uri.encode(uuid));
            if (service != null && !service.isEmpty()) {
                target.append("&service=").append(Uri.encode(service));
            }
            return target.toString();
        } catch (RuntimeException ignored) {
            return "";
        }
    }

    private void updatePortalActionLabel(String url) {
        if (portalActionButton == null) return;
        if (hasSavedQrImage()) {
            portalActionButton.setText("删除刚刚的二维码图片并进入主界面");
        } else {
            portalActionButton.setText(isPortalLoginPage(url)
                    ? "登录完成后进入执掌东大"
                    : "已登录，进入执掌东大");
        }
    }

    private void installPortalQrCapture() {
        if (portalWebView == null || !isPortalPageUrl(portalWebView.getUrl())) return;
        String script = QR_CAPTURE_SCRIPT.replace(
                "__AUTO_QR__",
                Boolean.toString(LOGIN_METHOD_WECHAT.equals(loginMethodForCurrentPortal))
        );
        portalWebView.evaluateJavascript(script, null);
    }

    private void applyPortalLoginMethodUi() {
        if (loginMethodBar != null) {
            for (int index = 0; index < loginMethodBar.getChildCount(); index += 1) {
                View child = loginMethodBar.getChildAt(index);
                if (!(child instanceof Button)) continue;
                boolean selected = loginMethodForCurrentPortal.equals(String.valueOf(child.getTag()));
                ((Button) child).setTextColor(selected ? Color.WHITE : Color.rgb(66, 81, 104));
                child.setBackground(roundBackground(
                        selected ? Color.rgb(43, 101, 153) : Color.rgb(242, 245, 248),
                        10
                ));
            }
        }
        boolean builtIn = LOGIN_METHOD_BUILT_IN.equals(loginMethodForCurrentPortal);
        if (builtInLoginPanel != null) builtInLoginPanel.setVisibility(builtIn ? View.VISIBLE : View.GONE);
        if (portalActionButton != null) portalActionButton.setVisibility(builtIn ? View.GONE : View.VISIBLE);
        if (portalQrActionButton != null && builtIn) portalQrActionButton.setVisibility(View.GONE);
        if (builtIn && builtInLoginStatus != null && !lastAcademicLoginError.isEmpty()) {
            builtInLoginStatus.setText(lastAcademicLoginError);
            builtInLoginStatus.setTextColor(Color.rgb(176, 57, 57));
        }
    }

    private void submitBuiltInCredentials(boolean background) {
        LoginCredentials credentials;
        if (background) {
            credentials = loadBuiltInCredentials();
        } else {
            credentials = new LoginCredentials(
                    builtInUsernameInput == null ? "" : builtInUsernameInput.getText().toString(),
                    builtInPasswordInput == null ? "" : builtInPasswordInput.getText().toString()
            );
        }
        if (!credentials.isComplete()) {
            finishBuiltInLoginFailure("内置登录失败：请完整输入学号和密码。", background);
            return;
        }
        pendingBuiltInUsername = credentials.username.trim();
        pendingBuiltInPassword = credentials.password;
        backgroundLoginInProgress = background;
        builtInLoginSubmissionPending = true;
        builtInLoginAwaitingPage = true;
        builtInLoginChallengeVisible = false;
        builtInLoginInspectionAttempts = 0;
        if (!background) {
            showBuiltInChallenge(false);
            setBuiltInLoginStatus("正在连接学校统一身份认证…", false);
            if (builtInLoginButton != null) builtInLoginButton.setEnabled(false);
        } else {
            notifyDashboardLoginStatus("retrying", "登录状态已失效，正在后台使用本机加密凭据重新登录…");
        }
        if (portalWebView == null) {
            finishBuiltInLoginFailure("内置登录失败：学校登录页面不可用。", background);
            return;
        }
        String currentUrl = portalWebView.getUrl();
        if (isPortalLoginPage(currentUrl)) injectBuiltInCredentialsIntoSchoolPage();
        else portalWebView.loadUrl(PORTAL_URL);
    }

    private void injectBuiltInCredentialsIntoSchoolPage() {
        if (portalWebView == null || !builtInLoginSubmissionPending) return;
        builtInLoginAwaitingPage = false;
        String username = JSONObject.quote(pendingBuiltInUsername);
        String password = JSONObject.quote(pendingBuiltInPassword);
        String script = "(function(){"
                + "var u=" + username + ",p=" + password + ";"
                + "var tab=document.getElementById('password_login');"
                + "if(tab&&typeof tab.click==='function')tab.click();"
                + "var un=document.getElementById('un'),pd=document.getElementById('pd');"
                + "if(!un||!pd)return JSON.stringify({ok:false,error:'学校登录页未找到账号密码输入框'});"
                + "un.disabled=false;pd.disabled=false;un.value=u;pd.value=p;"
                + "un.dispatchEvent(new Event('input',{bubbles:true}));"
                + "pd.dispatchEvent(new Event('input',{bubbles:true}));"
                + "if(typeof window.login==='function'){window.login();return JSON.stringify({ok:true});}"
                + "var button=document.getElementById('index_login_btn');"
                + "if(button&&typeof button.click==='function'){button.click();return JSON.stringify({ok:true});}"
                + "return JSON.stringify({ok:false,error:'学校登录页未找到登录按钮'});"
                + "})();";
        portalWebView.evaluateJavascript(script, value -> {
            try {
                JSONObject result = new JSONObject(decodeJavascriptString(value));
                if (!result.optBoolean("ok", false)) {
                    finishBuiltInLoginFailure("内置登录失败：" + result.optString("error", "无法提交学校登录表单"), backgroundLoginInProgress);
                    return;
                }
            } catch (Exception error) {
                finishBuiltInLoginFailure("内置登录失败：无法确认学校登录表单是否提交。", backgroundLoginInProgress);
                return;
            }
            portalWebView.postDelayed(this::inspectBuiltInLoginPage, 700);
        });
    }

    private void inspectBuiltInLoginPage() {
        if (portalWebView == null || !builtInLoginSubmissionPending) return;
        builtInLoginInspectionAttempts += 1;
        String script = "(function(){"
                + "function visible(n){if(!n)return false;var s=getComputedStyle(n),r=n.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;}"
                + "function text(n){return String((n&&(n.innerText||n.textContent))||'').replace(/\\s+/g,' ').trim();}"
                + "var m=document.getElementById('mcode'),save=document.getElementById('saveDevice'),send=document.getElementById('sendCode');"
                + "var challenge=visible(m)||visible(save)||visible(document.getElementById('second_valid_ok'));"
                + "var errors=['errormsg'].map(function(id){var n=document.getElementById(id);return visible(n)?text(n):'';}).filter(Boolean);"
                + "Array.prototype.slice.call(document.querySelectorAll('.layui-layer-content,.layui-layer-msg')).forEach(function(n){if(visible(n)){var t=text(n);if(t&&t.length<300)errors.push(t);}});"
                + "return JSON.stringify({challenge:challenge,error:errors.join('；'),sendAvailable:visible(send)});"
                + "})();";
        portalWebView.evaluateJavascript(script, value -> {
            if (!builtInLoginSubmissionPending) return;
            try {
                JSONObject result = new JSONObject(decodeJavascriptString(value));
                String errorText = result.optString("error", "").trim();
                boolean challenge = result.optBoolean("challenge", false);
                if (challenge) {
                    if (backgroundLoginInProgress) {
                        finishBuiltInLoginFailure(
                                "后台自动登录需要短信验证码。请点击手动登录完成验证，或改用原网页账密/二维码登录。",
                                true
                        );
                        return;
                    }
                    builtInLoginChallengeVisible = true;
                    showBuiltInChallenge(true);
                    setBuiltInLoginStatus(
                            errorText.isEmpty()
                                    ? "学校要求二次验证。请获取并输入绑定手机收到的短信验证码；“信任此设备”已默认开启。"
                                    : errorText,
                            !errorText.isEmpty()
                    );
                    if (builtInLoginButton != null) {
                        builtInLoginButton.setEnabled(true);
                        builtInLoginButton.setText("验证并登录");
                    }
                    return;
                }
                if (!errorText.isEmpty()) {
                    finishBuiltInLoginFailure("学校统一身份认证返回：" + errorText, backgroundLoginInProgress);
                    return;
                }
            } catch (Exception ignored) {
                // 页面仍在跳转时可能暂时无法读取结果，继续短暂轮询。
            }
            if (builtInLoginInspectionAttempts >= LOGIN_INSPECTION_MAX_ATTEMPTS) {
                finishBuiltInLoginFailure("内置登录超时：学校页面没有返回明确结果，请检查网络后手动登录。", backgroundLoginInProgress);
            } else {
                portalWebView.postDelayed(this::inspectBuiltInLoginPage, 650);
            }
        });
    }

    private void requestBuiltInSmsCode() {
        if (portalWebView == null || !builtInLoginChallengeVisible) return;
        builtInCodeSendButton.setEnabled(false);
        builtInCodeSendButton.setText("已请求");
        String script = "(function(){var send=document.getElementById('sendCode');"
                + "if(send&&typeof send.click==='function'){send.click();return true;}return false;})();";
        portalWebView.evaluateJavascript(script, value -> {
            if (!"true".equals(value)) {
                builtInCodeSendButton.setEnabled(true);
                builtInCodeSendButton.setText("重新获取");
                setBuiltInLoginStatus("学校页面未找到验证码发送按钮，请切换到原网页账密登录完成验证。", true);
                return;
            }
            setBuiltInLoginStatus("验证码请求已提交，请查看统一身份认证绑定的手机。学校限制重复发送频率，请勿连续点击。", false);
        });
    }

    private void submitBuiltInVerificationCode() {
        String code = builtInCodeInput == null ? "" : builtInCodeInput.getText().toString().trim();
        if (code.isEmpty()) {
            setBuiltInLoginStatus("请输入短信验证码。", true);
            return;
        }
        if (portalWebView == null) return;
        if (builtInLoginButton != null) builtInLoginButton.setEnabled(false);
        String script = "(function(){var code=document.getElementById('mcode'),save=document.getElementById('saveDevice'),button=document.getElementById('second_valid_ok');"
                + "if(!code||!button)return JSON.stringify({ok:false,error:'学校二次认证输入框不可用'});"
                + "code.value=" + JSONObject.quote(code) + ";"
                + "code.dispatchEvent(new Event('input',{bubbles:true}));"
                + "if(save)save.checked=" + Boolean.toString(builtInTrustDeviceCheck == null || builtInTrustDeviceCheck.isChecked()) + ";"
                + "button.click();return JSON.stringify({ok:true});})();";
        portalWebView.evaluateJavascript(script, value -> {
            try {
                JSONObject result = new JSONObject(decodeJavascriptString(value));
                if (!result.optBoolean("ok", false)) {
                    setBuiltInLoginStatus(result.optString("error", "无法提交验证码"), true);
                    if (builtInLoginButton != null) builtInLoginButton.setEnabled(true);
                    return;
                }
            } catch (Exception error) {
                setBuiltInLoginStatus("无法确认验证码是否提交，请稍后重试。", true);
                if (builtInLoginButton != null) builtInLoginButton.setEnabled(true);
                return;
            }
            setBuiltInLoginStatus("正在验证短信验证码并登记可信设备…", false);
            builtInLoginInspectionAttempts = 0;
            portalWebView.postDelayed(this::inspectBuiltInLoginPage, 700);
        });
    }

    private void showBuiltInChallenge(boolean visible) {
        if (builtInCodeRow != null) builtInCodeRow.setVisibility(visible ? View.VISIBLE : View.GONE);
        if (!visible && builtInCodeInput != null) builtInCodeInput.setText("");
        if (builtInLoginButton != null) builtInLoginButton.setText(visible ? "验证并登录" : "登录");
    }

    private void setBuiltInLoginStatus(String message, boolean error) {
        runOnUiThread(() -> {
            if (builtInLoginStatus == null) return;
            builtInLoginStatus.setText(message == null ? "" : message);
            builtInLoginStatus.setTextColor(error ? Color.rgb(176, 57, 57) : Color.rgb(74, 94, 120));
        });
    }

    private void setBuiltInLoginError(String message) {
        setBuiltInLoginStatus(message, true);
        setLastAcademicLoginError(message);
    }

    private void finishBuiltInLoginSuccess() {
        boolean wasBackground = backgroundLoginInProgress;
        if (!wasBackground && builtInTrustDeviceCheck != null && builtInTrustDeviceCheck.isChecked()) {
            saveBuiltInCredentials(pendingBuiltInUsername, pendingBuiltInPassword);
        } else if (!wasBackground && builtInTrustDeviceCheck != null && !builtInTrustDeviceCheck.isChecked()) {
            clearBuiltInCredentials();
        }
        pendingBuiltInPassword = "";
        builtInLoginSubmissionPending = false;
        builtInLoginAwaitingPage = false;
        builtInLoginChallengeVisible = false;
        backgroundLoginInProgress = false;
        if (!wasBackground) {
            backgroundLoginAttemptedForCurrentFailure = false;
            academicSsoRecoveryAttemptedForCurrentFailure = false;
        }
        if (preferences != null) preferences.edit().putBoolean(HAS_ACADEMIC_SESSION, true).apply();
        setLastAcademicLoginError("");
        notifyDashboardLoginStatus("success", "后台登录成功，正在刷新教务数据…");
        if (wasBackground) {
            if (portalWebView != null) portalWebView.setVisibility(View.GONE);
        } else {
            showDashboard();
        }
    }

    private void finishBuiltInLoginFailure(String message, boolean background) {
        String fullMessage = message == null || message.trim().isEmpty() ? "内置登录失败：未知错误" : message.trim();
        pendingBuiltInPassword = "";
        builtInLoginSubmissionPending = false;
        builtInLoginAwaitingPage = false;
        builtInLoginChallengeVisible = false;
        backgroundLoginInProgress = false;
        if (preferences != null) preferences.edit().putBoolean(HAS_ACADEMIC_SESSION, false).apply();
        setLastAcademicLoginError(fullMessage);
        notifyDashboardLoginStatus("failed", fullMessage);
        if (background) {
            if (portalWebView != null) portalWebView.setVisibility(View.GONE);
            if (dashboardHome != null) dashboardHome.setVisibility(View.VISIBLE);
            dashboardVisible = true;
        } else {
            setBuiltInLoginStatus(fullMessage, true);
            showBuiltInChallenge(false);
            if (builtInLoginButton != null) builtInLoginButton.setEnabled(true);
        }
    }

    private void setLastAcademicLoginError(String message) {
        lastAcademicLoginError = message == null ? "" : message.trim();
        if (preferences == null) return;
        SharedPreferences.Editor editor = preferences.edit();
        if (lastAcademicLoginError.isEmpty()) editor.remove(LAST_ACADEMIC_LOGIN_ERROR);
        else editor.putString(LAST_ACADEMIC_LOGIN_ERROR, lastAcademicLoginError);
        editor.apply();
    }

    private void notifyDashboardLoginStatus(String status, String message) {
        if (dashboardWebView == null) return;
        String script = "window.__androidLoginStatus && window.__androidLoginStatus("
                + JSONObject.quote(status == null ? "" : status) + ","
                + JSONObject.quote(message == null ? "" : message) + ");";
        runOnUiThread(() -> dashboardWebView.evaluateJavascript(script, null));
    }

    private boolean isAcademicPortalReadyUrl(String url) {
        return isPortalPageUrl(url) && url != null && url.contains("/jwapp/");
    }

    private boolean isAcademicLoginInvalidResponse(int status, String body) {
        if (status == 401) return true;
        String text = body == null ? "" : body;
        if (text.length() > 600000) text = text.substring(0, 600000);
        String lower = text.toLowerCase(java.util.Locale.ROOT);
        return (lower.contains("/tpass/login") || lower.contains("id=\"loginform\"")
                || lower.contains("id='loginform'"))
                && (text.contains("统一身份认证") || lower.contains("uniform identity authentication"));
    }

    private void startAcademicSsoRecovery(String reason) {
        if (portalWebView == null || academicSsoRecoveryInProgress || backgroundLoginInProgress) return;
        pendingAcademicFailureReason = reason == null || reason.trim().isEmpty()
                ? "教务系统登录状态已失效"
                : reason.trim();
        academicSsoRecoveryInProgress = true;
        academicSsoRecoveryStage = ACADEMIC_SSO_RECOVERY_ECODE;
        academicSsoEcodeNavigationStarted = false;
        int token = ++academicSsoRecoveryToken;
        notifyDashboardLoginStatus(
                "retrying",
                "教务会话已失效，正在后台复用 E 码通/统一认证长会话…"
        );
        portalWebView.setVisibility(View.GONE);
        portalWebView.stopLoading();
        // 先访问已能长时保持登录的 E 码通目标，让学校 SSO/WebVPN
        // 刷新共享 Cookie；随后再打开教务入口换取新的教务业务 Session。
        portalWebView.loadUrl(ECODE_URL);
        portalWebView.postDelayed(() -> {
            if (academicSsoRecoveryInProgress && academicSsoRecoveryToken == token) {
                finishAcademicSsoRecoveryFailure("复用 E 码通/统一认证会话超时");
            }
        }, ACADEMIC_SSO_RECOVERY_TIMEOUT_MS);
    }

    private void handleAcademicSsoRecoveryPage(String url) {
        if (!academicSsoRecoveryInProgress || portalWebView == null) return;
        if (academicSsoRecoveryStage == ACADEMIC_SSO_RECOVERY_ECODE) {
            if (!academicSsoEcodeNavigationStarted) return;
            academicSsoRecoveryStage = ACADEMIC_SSO_RECOVERY_PORTAL;
            cookieManager.flush();
            portalWebView.postDelayed(() -> {
                if (academicSsoRecoveryInProgress
                        && academicSsoRecoveryStage == ACADEMIC_SSO_RECOVERY_PORTAL) {
                    portalWebView.loadUrl(PORTAL_URL);
                }
            }, 220);
            return;
        }
        if (academicSsoRecoveryStage != ACADEMIC_SSO_RECOVERY_PORTAL) return;
        if (isAcademicPortalReadyUrl(url)) {
            finishAcademicSsoRecoverySuccess();
            return;
        }
        if (isPortalLoginPage(url)) {
            int token = academicSsoRecoveryToken;
            portalWebView.postDelayed(() -> {
                if (!academicSsoRecoveryInProgress || academicSsoRecoveryToken != token) return;
                String currentUrl = portalWebView.getUrl();
                if (isAcademicPortalReadyUrl(currentUrl)) finishAcademicSsoRecoverySuccess();
                else if (isPortalLoginPage(currentUrl)) {
                    finishAcademicSsoRecoveryFailure("学校统一认证长会话已失效");
                }
            }, 650);
        }
    }

    private void finishAcademicSsoRecoverySuccess() {
        if (!academicSsoRecoveryInProgress) return;
        academicSsoRecoveryInProgress = false;
        academicSsoRecoveryStage = ACADEMIC_SSO_RECOVERY_IDLE;
        academicSsoEcodeNavigationStarted = false;
        academicSsoRecoveryToken += 1;
        if (preferences != null) preferences.edit().putBoolean(HAS_ACADEMIC_SESSION, true).apply();
        setLastAcademicLoginError("");
        if (portalWebView != null) portalWebView.setVisibility(View.GONE);
        notifyDashboardLoginStatus(
                "success",
                "已在后台通过 E 码通/统一认证会话恢复教务登录，正在刷新数据…"
        );
    }

    private void finishAcademicSsoRecoveryFailure(String recoveryError) {
        if (!academicSsoRecoveryInProgress) return;
        academicSsoRecoveryInProgress = false;
        academicSsoRecoveryStage = ACADEMIC_SSO_RECOVERY_IDLE;
        academicSsoEcodeNavigationStarted = false;
        academicSsoRecoveryToken += 1;
        String detail = recoveryError == null || recoveryError.trim().isEmpty()
                ? "复用 E 码通/统一认证会话失败"
                : recoveryError.trim();
        attemptBuiltInBackgroundLoginOrReport(pendingAcademicFailureReason + "。" + detail);
    }

    private void attemptBuiltInBackgroundLoginOrReport(String reason) {
        LoginCredentials saved = loadBuiltInCredentials();
        if (LOGIN_METHOD_BUILT_IN.equals(readLoginMethodPreference())
                && saved.isComplete()
                && !backgroundLoginAttemptedForCurrentFailure) {
            backgroundLoginAttemptedForCurrentFailure = true;
            notifyDashboardLoginStatus(
                    "retrying",
                    "E 码通/统一认证会话无法恢复教务，正在后台使用本机加密凭据重登…"
            );
            submitBuiltInCredentials(true);
            return;
        }
        String failure = reason == null || reason.trim().isEmpty()
                ? "教务系统后台恢复失败"
                : reason.trim();
        if (!LOGIN_METHOD_BUILT_IN.equals(readLoginMethodPreference())) {
            failure += "。当前默认使用其他登录方式，请点击手动登录。";
        } else if (!saved.isComplete()) {
            failure += "。本机没有可用于后台登录的加密凭据，请点击手动登录。";
        } else {
            failure += "。加密凭据后台重登也未成功，请点击手动登录。";
        }
        setLastAcademicLoginError(failure);
        notifyDashboardLoginStatus("failed", failure);
    }

    private void markAcademicSessionHealthy() {
        runOnUiThread(() -> {
            if (academicSsoRecoveryInProgress || backgroundLoginInProgress) return;
            academicSsoRecoveryAttemptedForCurrentFailure = false;
            backgroundLoginAttemptedForCurrentFailure = false;
            pendingAcademicFailureReason = "";
            if (preferences != null) preferences.edit().putBoolean(HAS_ACADEMIC_SESSION, true).apply();
            if (!lastAcademicLoginError.isEmpty()) setLastAcademicLoginError("");
        });
    }

    private void handleAcademicSessionInvalid(String detail) {
        runOnUiThread(() -> {
            String reason = detail == null || detail.trim().isEmpty()
                    ? "教务系统登录状态已失效"
                    : detail.trim();
            // 一次刷新会并发请求多个教务接口，会话过期时它们可能
            // 同时返回登录页。后台重登已在进行时忽略后续重复通知，避免
            // “正在重登”被误覆盖成“登录失败”。
            if (academicSsoRecoveryInProgress || backgroundLoginInProgress) return;
            setLastAcademicLoginError(reason);
            if (preferences != null) preferences.edit().putBoolean(HAS_ACADEMIC_SESSION, false).apply();
            pendingAcademicFailureReason = reason;
            if (!academicSsoRecoveryAttemptedForCurrentFailure) {
                academicSsoRecoveryAttemptedForCurrentFailure = true;
                startAcademicSsoRecovery(reason);
                return;
            }
            attemptBuiltInBackgroundLoginOrReport(reason);
        });
    }

    private void selectPortalLoginMethod(String method) {
        if (LOGIN_METHOD_WECHAT.equals(method)) loginMethodForCurrentPortal = LOGIN_METHOD_WECHAT;
        else if (LOGIN_METHOD_PASSWORD.equals(method)) loginMethodForCurrentPortal = LOGIN_METHOD_PASSWORD;
        else loginMethodForCurrentPortal = LOGIN_METHOD_BUILT_IN;
        if (preferences != null) {
            preferences.edit().putString(DEFAULT_LOGIN_METHOD, loginMethodForCurrentPortal).apply();
        }
        if (portalWebView == null) return;
        applyPortalLoginMethodUi();
        if (LOGIN_METHOD_BUILT_IN.equals(loginMethodForCurrentPortal)) return;
        showQrActionLoadingIfNeeded(portalWebView.getUrl());
        installPortalQrCapture();
        portalWebView.postDelayed(() -> {
            if (portalWebView == null) return;
            String elementId = LOGIN_METHOD_WECHAT.equals(loginMethodForCurrentPortal)
                    ? "qrcode_login"
                    : "password_login";
            String script = "(function(){var node=document.getElementById('"
                    + elementId
                    + "'); if(node && typeof node.click==='function'){node.click(); return true;} return false;})();";
            portalWebView.evaluateJavascript(script, null);
        }, 240);
    }

    private void showLoginMethodChooserIfNeeded(String url) {
        if (!isPortalLoginPage(url)
                || loginMethodChooserShown
                || preferences.contains(DEFAULT_LOGIN_METHOD)) return;
        loginMethodChooserShown = true;
        runOnUiThread(() -> {
            if (isFinishing() || portalWebView == null) return;
            RadioGroup group = new RadioGroup(this);
            group.setOrientation(RadioGroup.VERTICAL);
            group.setPadding(dp(4), 0, dp(4), 0);

            RadioButton password = new RadioButton(this);
            password.setId(View.generateViewId());
            password.setText("账号密码登录");
            password.setTextSize(15);
            password.setChecked(true);
            group.addView(password, new RadioGroup.LayoutParams(
                    RadioGroup.LayoutParams.MATCH_PARENT, dp(48)));

            RadioButton wechat = new RadioButton(this);
            wechat.setId(View.generateViewId());
            wechat.setText("微信扫码登录（免输入验证码）");
            wechat.setTextSize(15);
            group.addView(wechat, new RadioGroup.LayoutParams(
                    RadioGroup.LayoutParams.MATCH_PARENT, dp(48)));

            CheckBox remember = new CheckBox(this);
            remember.setText("记住选择，之后默认使用该方式");
            remember.setTextSize(13);
            remember.setChecked(true);

            LinearLayout content = new LinearLayout(this);
            content.setOrientation(LinearLayout.VERTICAL);
            content.setPadding(dp(8), 0, dp(8), 0);
            content.addView(group);
            content.addView(remember, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, dp(48)));

            AlertDialog dialog = new AlertDialog.Builder(this)
                    .setTitle("选择教务系统登录方式")
                    .setMessage("账号密码和微信扫码登录都会保留；这里的选择只决定下次打开时默认显示哪个入口。")
                    .setView(content)
                    .setNegativeButton("暂不选择", null)
                    .setPositiveButton("继续", null)
                    .create();
            dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
                String method = group.getCheckedRadioButtonId() == wechat.getId()
                        ? LOGIN_METHOD_WECHAT
                        : LOGIN_METHOD_PASSWORD;
                selectPortalLoginMethod(method);
                if (remember.isChecked()) {
                    preferences.edit().putString(DEFAULT_LOGIN_METHOD, method).apply();
                }
                dialog.dismiss();
            }));
            dialog.show();
        });
    }

    private void clearPendingQrUrl() {
        pendingQrUrl = "";
        if (portalQrActionButton != null) portalQrActionButton.setVisibility(View.GONE);
    }

    private boolean isAllowedQrUrl(String url) {
        if (url == null || url.isEmpty()) return false;
        return url.startsWith("https://webvpn.neu.edu.cn/")
                && url.contains("/tpass/qyQrLogin")
                && url.contains("uuid=");
    }

    private void receiveQrUrl(String url) {
        if (!isAllowedQrUrl(url)) return;
        runOnUiThread(() -> {
            // 只保存在内存中供当前按钮使用；二维码由学校服务端短时效控制。
            pendingQrUrl = url;
            if (portalQrActionButton != null && portalWebView != null
                    && portalWebView.getVisibility() == View.VISIBLE) {
                portalQrActionButton.setVisibility(View.VISIBLE);
                portalQrActionButton.setEnabled(true);
                portalQrActionButton.setText("保存二维码并打开微信");
            }
        });
    }

    private boolean hasSavedQrImage() {
        return (savedQrImageUri != null && !savedQrImageUri.isEmpty())
                || (savedQrImagePath != null && !savedQrImagePath.isEmpty());
    }

    private void saveQrAndOpenWechat() {
        if (!isAllowedQrUrl(pendingQrUrl)) {
            Toast.makeText(this, "二维码链接已失效，请返回登录页刷新二维码", Toast.LENGTH_SHORT).show();
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            qrSavePendingPermission = true;
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, WRITE_QR_STORAGE_REQUEST);
            return;
        }
        captureQrImageAndSave();
    }

    private void captureQrImageAndSave() {
        if (portalWebView == null || portalQrActionButton == null) return;
        portalQrActionButton.setEnabled(false);
        portalQrActionButton.setText("正在保存二维码…");
        portalWebView.evaluateJavascript(QR_IMAGE_SCRIPT, value -> {
            String dataUrl = decodeJavascriptString(value);
            if (dataUrl == null || !dataUrl.startsWith("data:image/")) {
                portalQrActionButton.setEnabled(true);
                portalQrActionButton.setText("保存二维码并打开微信");
                Toast.makeText(this, "没有找到登录二维码，请等二维码显示后再试", Toast.LENGTH_LONG).show();
                return;
            }
            networkExecutor.execute(() -> persistQrImageAndLaunchWechat(dataUrl));
        });
    }

    private void persistQrImageAndLaunchWechat(String dataUrl) {
        Uri imageUri = null;
        String imagePath = "";
        try {
            int comma = dataUrl.indexOf(',');
            if (comma < 0) throw new IOException("二维码图片格式无效");
            byte[] imageBytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
            if (imageBytes.length == 0) throw new IOException("二维码图片为空");

            // 重新生成二维码时，先删除上一张由本应用保存的图片，避免相册堆积。
            deleteSavedQrImage();
            String displayName = "东北大学教务登录二维码-" + System.currentTimeMillis() + ".png";
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, displayName);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.Images.Media.RELATIVE_PATH,
                        Environment.DIRECTORY_PICTURES + "/执掌东大");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
                imageUri = getContentResolver().insert(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (imageUri == null) throw new IOException("无法创建相册图片");
                try (OutputStream output = getContentResolver().openOutputStream(imageUri)) {
                    if (output == null) throw new IOException("无法写入相册图片");
                    output.write(imageBytes);
                }
                ContentValues ready = new ContentValues();
                ready.put(MediaStore.Images.Media.IS_PENDING, 0);
                getContentResolver().update(imageUri, ready, null, null);
            } else {
                File directory = new File(
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                        "执掌东大");
                if (!directory.exists() && !directory.mkdirs()) {
                    throw new IOException("无法创建相册目录");
                }
                File imageFile = new File(directory, displayName);
                try (FileOutputStream output = new FileOutputStream(imageFile)) {
                    output.write(imageBytes);
                }
                imagePath = imageFile.getAbsolutePath();
                values.put(MediaStore.Images.Media.DATA, imagePath);
                imageUri = getContentResolver().insert(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                MediaScannerConnection.scanFile(this, new String[]{imagePath},
                        new String[]{"image/png"}, null);
            }

            if (imageUri == null) throw new IOException("无法保存二维码图片");
            final Uri savedUri = imageUri;
            final String savedPath = imagePath;
            runOnUiThread(() -> {
                savedQrImageUri = savedUri.toString();
                savedQrImagePath = savedPath;
                preferences.edit()
                        .putString(SAVED_QR_IMAGE_URI, savedQrImageUri)
                        .putString(SAVED_QR_IMAGE_PATH, savedQrImagePath)
                        .apply();
                portalQrActionButton.setEnabled(true);
                portalQrActionButton.setText("二维码已保存，可重新保存");
                updatePortalActionLabel(portalWebView == null ? "" : portalWebView.getUrl());
                Toast.makeText(this,
                        "二维码已保存到相册“图片/执掌东大”，请在微信中打开扫一扫并从相册选择它",
                        Toast.LENGTH_LONG).show();
                openWechatHome();
            });
        } catch (Exception error) {
            if (imageUri != null) {
                getContentResolver().delete(imageUri, null, null);
            }
            if (imagePath != null && !imagePath.isEmpty()) {
                new File(imagePath).delete();
            }
            runOnUiThread(() -> {
                portalQrActionButton.setEnabled(true);
                portalQrActionButton.setText("保存二维码并打开微信");
                Toast.makeText(this,
                        "二维码保存失败：" + (error.getMessage() == null ? "请检查相册权限" : error.getMessage()),
                        Toast.LENGTH_LONG).show();
            });
        }
    }

    private void persistDashboardImage(String dataUrl, String requestedName) {
        Uri imageUri = null;
        String imagePath = "";
        try {
            int comma = dataUrl == null ? -1 : dataUrl.indexOf(',');
            if (comma < 0) throw new IOException("课表图片格式无效");
            byte[] imageBytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
            if (imageBytes.length == 0) throw new IOException("课表图片为空");

            String displayName = requestedName == null || requestedName.trim().isEmpty()
                    ? "执掌东大课表.png"
                    : requestedName.trim();
            displayName = displayName.replace("/", "_")
                    .replace("\\", "_")
                    .replace(":", "_")
                    .replace("*", "_")
                    .replace("?", "_")
                    .replace("\"", "_")
                    .replace("<", "_")
                    .replace(">", "_")
                    .replace("|", "_")
                    .replace("\r", "_")
                    .replace("\n", "_");
            if (!displayName.toLowerCase().endsWith(".png")) displayName += ".png";

            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, displayName);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.Images.Media.RELATIVE_PATH,
                        Environment.DIRECTORY_PICTURES + "/执掌东大");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
                imageUri = getContentResolver().insert(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (imageUri == null) throw new IOException("无法创建图片文件");
                try (OutputStream output = getContentResolver().openOutputStream(imageUri)) {
                    if (output == null) throw new IOException("无法写入图片文件");
                    output.write(imageBytes);
                }
                ContentValues ready = new ContentValues();
                ready.put(MediaStore.Images.Media.IS_PENDING, 0);
                getContentResolver().update(imageUri, ready, null, null);
            } else {
                File directory = new File(
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                        "执掌东大");
                if (!directory.exists() && !directory.mkdirs()) {
                    throw new IOException("无法创建图片目录");
                }
                File imageFile = new File(directory, displayName);
                try (FileOutputStream output = new FileOutputStream(imageFile)) {
                    output.write(imageBytes);
                }
                imagePath = imageFile.getAbsolutePath();
                values.put(MediaStore.Images.Media.DATA, imagePath);
                imageUri = getContentResolver().insert(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                MediaScannerConnection.scanFile(this, new String[]{imagePath},
                        new String[]{"image/png"}, null);
            }

            if (imageUri == null) throw new IOException("无法保存课表图片");
            runOnUiThread(() -> Toast.makeText(this,
                    "课表图片已保存到相册“图片/执掌东大”",
                    Toast.LENGTH_LONG).show());
        } catch (Exception error) {
            if (imageUri != null) getContentResolver().delete(imageUri, null, null);
            if (imagePath != null && !imagePath.isEmpty()) new File(imagePath).delete();
            runOnUiThread(() -> Toast.makeText(this,
                    "课表图片保存失败：" + (error.getMessage() == null ? "请检查相册权限" : error.getMessage()),
                    Toast.LENGTH_LONG).show());
        }
    }

    private void persistScheduleCsv(String content, String requestedName) {
        Uri fileUri = null;
        String filePath = "";
        try {
            String csv = content == null ? "" : content;
            if (csv.isEmpty()) throw new IOException("CSV 内容为空");
            if (!csv.startsWith("\uFEFF")) csv = "\uFEFF" + csv;
            byte[] csvBytes = csv.getBytes(StandardCharsets.UTF_8);

            String displayName = requestedName == null || requestedName.trim().isEmpty()
                    ? "个人课表.csv"
                    : requestedName.trim();
            displayName = displayName.replace("/", "_")
                    .replace("\\", "_")
                    .replace(":", "_")
                    .replace("*", "_")
                    .replace("?", "_")
                    .replace("\"", "_")
                    .replace("<", "_")
                    .replace(">", "_")
                    .replace("|", "_")
                    .replace("\r", "_")
                    .replace("\n", "_");
            if (!displayName.toLowerCase().endsWith(".csv")) displayName += ".csv";

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, displayName);
                values.put(MediaStore.Downloads.MIME_TYPE, "text/csv");
                values.put(MediaStore.Downloads.RELATIVE_PATH,
                        Environment.DIRECTORY_DOWNLOADS + "/执掌东大");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                fileUri = getContentResolver().insert(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (fileUri == null) throw new IOException("无法创建下载文件");
                try (OutputStream output = getContentResolver().openOutputStream(fileUri)) {
                    if (output == null) throw new IOException("无法写入下载文件");
                    output.write(csvBytes);
                }
                ContentValues ready = new ContentValues();
                ready.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(fileUri, ready, null, null);
            } else {
                File directory = new File(
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                        "执掌东大");
                if (!directory.exists() && !directory.mkdirs()) {
                    throw new IOException("无法创建下载目录");
                }
                File csvFile = new File(directory, displayName);
                try (FileOutputStream output = new FileOutputStream(csvFile)) {
                    output.write(csvBytes);
                }
                filePath = csvFile.getAbsolutePath();
                MediaScannerConnection.scanFile(this, new String[]{filePath},
                        new String[]{"text/csv"}, null);
            }

            final Uri shareUri = fileUri;
            final String savedPath = filePath;
            runOnUiThread(() -> {
                if (shareUri != null) {
                    try {
                        Intent share = new Intent(Intent.ACTION_SEND);
                        share.setType("text/csv");
                        share.putExtra(Intent.EXTRA_STREAM, shareUri);
                        share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(share, "分享课表 CSV"));
                        return;
                    } catch (RuntimeException ignored) {
                        // 没有可用的分享目标时，文件仍已保存到下载目录。
                    }
                }
                Toast.makeText(this,
                        savedPath.isEmpty()
                                ? "CSV 已保存到下载/执掌东大"
                                : "CSV 已保存到下载/执掌东大，可用文件管理器打开",
                        Toast.LENGTH_LONG).show();
            });
        } catch (Exception error) {
            if (fileUri != null) getContentResolver().delete(fileUri, null, null);
            if (!filePath.isEmpty()) new File(filePath).delete();
            runOnUiThread(() -> Toast.makeText(this,
                    "CSV 保存失败：" + (error.getMessage() == null ? "请检查存储权限" : error.getMessage()),
                    Toast.LENGTH_LONG).show());
        }
    }

    private void openWechatHome() {
        PackageManager packageManager = getPackageManager();
        Intent launchIntent = packageManager.getLaunchIntentForPackage(WECHAT_PACKAGE);
        if (launchIntent == null) {
            // 某些定制系统不会返回 getLaunchIntentForPackage，显式构造微信的
            // MAIN/LAUNCHER Intent 再尝试一次；<queries> 已让该包对本应用可见。
            launchIntent = new Intent(Intent.ACTION_MAIN);
            launchIntent.addCategory(Intent.CATEGORY_LAUNCHER);
            launchIntent.setPackage(WECHAT_PACKAGE);
            if (packageManager.resolveActivity(launchIntent, PackageManager.MATCH_DEFAULT_ONLY) == null) {
                launchIntent = null;
            }
        }
        if (launchIntent == null) {
            Toast.makeText(this, "未检测到微信，二维码已保存，请手动打开微信扫描", Toast.LENGTH_LONG).show();
            return;
        }
        try {
            startActivity(launchIntent);
        } catch (RuntimeException error) {
            Toast.makeText(this, "微信打开失败，二维码已保存，请手动打开微信扫描", Toast.LENGTH_LONG).show();
        }
    }

    private void deleteSavedQrImage() {
        String uriText = savedQrImageUri;
        String path = savedQrImagePath;
        savedQrImageUri = "";
        savedQrImagePath = "";
        if (preferences != null) {
            preferences.edit()
                    .remove(SAVED_QR_IMAGE_URI)
                    .remove(SAVED_QR_IMAGE_PATH)
                    .apply();
        }
        if (uriText != null && !uriText.isEmpty()) {
            try {
                getContentResolver().delete(Uri.parse(uriText), null, null);
            } catch (RuntimeException ignored) {
                // 图片可能已被用户从相册删除；继续清理应用内记录。
            }
        }
        if (path != null && !path.isEmpty()) {
            new File(path).delete();
        }
    }

    private FrameLayout createEcodePanel() {
        FrameLayout panel = new FrameLayout(this);
        panel.setBackground(roundBackground(Color.WHITE, 20));
        panel.setElevation(dp(4));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            panel.setClipToOutline(true);
        }

        ecodeWebView.setBackgroundColor(Color.WHITE);
        ecodeWebView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        panel.addView(ecodeWebView, fullScreenParams());

        ecodeCollapsedCard = new FrameLayout(this);
        ecodeCollapsedCard.setBackground(roundBackground(Color.WHITE, 0));
        ecodeCollapsedCard.setContentDescription("校园码，点击查看完整 E 码通");
        ecodeCollapsedCard.setOnClickListener(view -> setEcodeExpanded(true));

        FrameLayout ecodeThumbnailShell = new FrameLayout(this);
        ecodeThumbnailShell.setBackground(roundBackground(Color.rgb(239, 244, 248), 8));
        ecodeThumbnailShell.setClipToPadding(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            ecodeThumbnailShell.setClipToOutline(true);
        }
        FrameLayout.LayoutParams thumbnailParams = new FrameLayout.LayoutParams(
                dp(72), dp(72), Gravity.CENTER_VERTICAL | Gravity.START);
        thumbnailParams.setMargins(dp(14), 0, 0, 0);

        ecodeThumbnailView = new ImageView(this);
        ecodeThumbnailView.setScaleType(ImageView.ScaleType.FIT_CENTER);
        // 外层 shell 负责背景和圆角；Bitmap 自身会在生成时加入对称 quiet zone，
        // ImageView 只负责把最终的方形 Bitmap 放在 shell 正中央。
        ecodeThumbnailView.setPadding(0, 0, 0, 0);
        ecodeThumbnailView.setBackgroundColor(Color.TRANSPARENT);
        ecodeThumbnailShell.addView(ecodeThumbnailView, fullScreenParams());
        ecodeCollapsedCard.addView(ecodeThumbnailShell, thumbnailParams);

        LinearLayout ecodeCopy = new LinearLayout(this);
        ecodeCopy.setOrientation(LinearLayout.VERTICAL);
        ecodeCopy.setGravity(Gravity.CENTER_VERTICAL);
        TextView ecodeTitle = new TextView(this);
        ecodeTitle.setText("校园码");
        ecodeTitle.setTextColor(Color.rgb(28, 28, 30));
        ecodeTitle.setTextSize(14);
        ecodeTitle.setTypeface(null, android.graphics.Typeface.BOLD);
        ecodeCopy.addView(ecodeTitle, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        ecodeCollapsedTimeView = new TextView(this);
        ecodeCollapsedTimeView.setText("点击查看完整 E 码通");
        ecodeCollapsedTimeView.setTextColor(Color.rgb(107, 114, 128));
        ecodeCollapsedTimeView.setTextSize(11);
        LinearLayout.LayoutParams ecodeTimeParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        ecodeTimeParams.topMargin = dp(4);
        ecodeCopy.addView(ecodeCollapsedTimeView, ecodeTimeParams);
        FrameLayout.LayoutParams copyParams = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER_VERTICAL | Gravity.START);
        copyParams.setMargins(dp(100), 0, dp(52), 0);
        ecodeCollapsedCard.addView(ecodeCopy, copyParams);

        TextView ecodeArrow = new TextView(this);
        ecodeArrow.setText("›");
        ecodeArrow.setTextColor(Color.rgb(49, 93, 143));
        ecodeArrow.setTextSize(25);
        ecodeArrow.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams arrowParams = new FrameLayout.LayoutParams(dp(40), FrameLayout.LayoutParams.MATCH_PARENT, Gravity.END);
        arrowParams.setMargins(0, 0, dp(8), 0);
        ecodeCollapsedCard.addView(ecodeArrow, arrowParams);
        panel.addView(ecodeCollapsedCard, fullScreenParams());

        ecodeErrorView = new TextView(this);
        ecodeErrorView.setTextColor(Color.rgb(151, 55, 55));
        ecodeErrorView.setTextSize(11);
        ecodeErrorView.setGravity(Gravity.CENTER_VERTICAL);
        ecodeErrorView.setMaxLines(3);
        ecodeErrorView.setPadding(dp(10), dp(7), dp(10), dp(7));
        ecodeErrorView.setBackground(roundBackground(Color.argb(235, 255, 239, 239), 12));
        ecodeErrorView.setVisibility(View.GONE);
        FrameLayout.LayoutParams errorParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP
        );
        errorParams.setMargins(dp(10), dp(10), dp(10), 0);
        panel.addView(ecodeErrorView, errorParams);

        ecodeExpandHint = new TextView(this);
        ecodeExpandHint.setText("点击展开 E 码通");
        ecodeExpandHint.setTextColor(Color.WHITE);
        ecodeExpandHint.setTextSize(12);
        ecodeExpandHint.setGravity(Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        ecodeExpandHint.setPadding(dp(12), 0, dp(12), dp(10));
        ecodeExpandHint.setShadowLayer(dp(3), 0, dp(1), Color.argb(180, 0, 0, 0));
        ecodeExpandHint.setOnClickListener(view -> setEcodeExpanded(true));
        ecodeExpandHint.setVisibility(View.GONE);
        panel.addView(ecodeExpandHint, fullScreenParams());

        ecodeCollapseButton = new TextView(this);
        ecodeCollapseButton.setText("收起");
        ecodeCollapseButton.setTextColor(Color.rgb(38, 54, 83));
        ecodeCollapseButton.setTextSize(12);
        ecodeCollapseButton.setGravity(Gravity.CENTER);
        ecodeCollapseButton.setBackground(roundBackground(Color.argb(230, 255, 255, 255), 18));
        ecodeCollapseButton.setOnClickListener(view -> setEcodeExpanded(false));
        ecodeCollapseButton.setVisibility(View.GONE);
        FrameLayout.LayoutParams collapseParams = new FrameLayout.LayoutParams(dp(58), dp(34), Gravity.TOP | Gravity.END);
        collapseParams.setMargins(0, dp(10), dp(76), 0);
        panel.addView(ecodeCollapseButton, collapseParams);

        ecodeRefreshButton = new TextView(this);
        ecodeRefreshButton.setText("刷新");
        ecodeRefreshButton.setTextColor(Color.rgb(38, 54, 83));
        ecodeRefreshButton.setTextSize(12);
        ecodeRefreshButton.setGravity(Gravity.CENTER);
        ecodeRefreshButton.setContentDescription("刷新校园 E 码通原网页");
        ecodeRefreshButton.setBackground(roundBackground(Color.argb(230, 255, 255, 255), 18));
        ecodeRefreshButton.setOnClickListener(view -> refreshEcodePage());
        FrameLayout.LayoutParams refreshParams = new FrameLayout.LayoutParams(dp(58), dp(34), Gravity.TOP | Gravity.END);
        refreshParams.setMargins(0, dp(10), dp(10), 0);
        panel.addView(ecodeRefreshButton, refreshParams);

        ecodeLoginButton = new TextView(this);
        ecodeLoginButton.setText("登录");
        ecodeLoginButton.setTextColor(Color.rgb(38, 54, 83));
        ecodeLoginButton.setTextSize(12);
        ecodeLoginButton.setGravity(Gravity.CENTER);
        ecodeLoginButton.setContentDescription("单独登录校园 E 码通");
        ecodeLoginButton.setBackground(roundBackground(Color.argb(230, 255, 255, 255), 18));
        ecodeLoginButton.setOnClickListener(view -> openEcodeLogin());
        FrameLayout.LayoutParams loginParams = new FrameLayout.LayoutParams(dp(58), dp(34), Gravity.TOP | Gravity.END);
        loginParams.setMargins(0, dp(10), dp(142), 0);
        panel.addView(ecodeLoginButton, loginParams);

        ecodeRefreshButton.setVisibility(View.GONE);
        ecodeLoginButton.setVisibility(View.GONE);

        return panel;
    }

    private void setEcodeExpanded(boolean expanded) {
        if (ecodePanel == null || ecodeExpanded == expanded) return;
        ecodePanel.animate().cancel();
        ecodePanelHidden = false;
        ecodePanel.setTranslationY(0f);
        ecodePanel.setAlpha(1f);
        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) ecodePanel.getLayoutParams();
        int start = params == null || params.height <= 0 ? dp(ECODE_COLLAPSED_HEIGHT_DP) : params.height;
        int target = expanded ? ecodeExpandedHeight() : dp(ECODE_COLLAPSED_HEIGHT_DP);
        ecodeExpanded = expanded;
        ecodeExpandHint.setVisibility(View.GONE);
        ecodeCollapseButton.setVisibility(expanded ? View.VISIBLE : View.GONE);
        ecodeCollapsedCard.setVisibility(expanded ? View.GONE : View.VISIBLE);
        ecodeRefreshButton.setVisibility(expanded ? View.VISIBLE : View.GONE);
        ecodeLoginButton.setVisibility(expanded ? View.VISIBLE : View.GONE);

        ValueAnimator animator = ValueAnimator.ofInt(start, target);
        animator.setDuration(260);
        animator.setInterpolator(new AccelerateDecelerateInterpolator());
        animator.addUpdateListener(valueAnimator -> {
            FrameLayout.LayoutParams current = (FrameLayout.LayoutParams) ecodePanel.getLayoutParams();
            current.height = (int) valueAnimator.getAnimatedValue();
            ecodePanel.setLayoutParams(current);
        });
        animator.start();
    }

    private void refreshEcodePage() {
        if (ecodeWebView == null) return;
        ecodeAutoScrolled = false;
        ecodeProbeAttempts = 0;
        setEcodeError("正在手动刷新学校 E 码通原网页…");
        ecodeWebView.stopLoading();
        // 先顺序访问教务入口再进入 E 码通，保留 WebVPN Cookie、LocalStorage
        // 和当前登录状态；不清理 WebView 数据，避免用户被迫重新登录。
        ecodeWarmupPending = true;
        ecodeWebView.loadUrl(PORTAL_URL);
    }

    private void openEcodeLogin() {
        if (ecodeWebView == null) return;
        setEcodeExpanded(true);
        ecodeAutoScrolled = false;
        ecodeProbeAttempts = 0;
        setEcodeError("已展开 E 码通原网页，可在这里单独登录；不会影响教务系统会话");
        ecodeWebView.stopLoading();
        ecodeWebView.loadUrl(ECODE_URL);
    }

    private void setEcodePanelHidden(boolean hidden) {
        if (ecodePanel == null || ecodeExpanded) return;
        boolean nextHidden = Boolean.parseBoolean(String.valueOf(hidden));
        if (ecodePanelHidden == nextHidden && ecodePanel.getAnimation() == null) return;
        ecodePanelHidden = nextHidden;
        ecodePanel.animate().cancel();
        int panelHeight = ecodePanel.getHeight() > 0 ? ecodePanel.getHeight() : dp(ECODE_COLLAPSED_HEIGHT_DP);
        ecodePanel.animate()
                .translationY(nextHidden ? -panelHeight : 0f)
                .alpha(nextHidden ? 0f : 1f)
                .setDuration(190)
                .setInterpolator(new AccelerateDecelerateInterpolator())
                .start();
    }

    private int ecodeExpandedHeight() {
        float density = getResources().getDisplayMetrics().density;
        int screenDp = Math.round(getResources().getDisplayMetrics().heightPixels / density);
        int heightDp = Math.min(680, Math.max(480, Math.round(screenDp * 0.72f)));
        return dp(heightDp);
    }

    private void setEcodeError(String message) {
        if (ecodeErrorView == null) return;
        runOnUiThread(() -> {
            if (ecodeErrorView == null) return;
            ecodeErrorView.setText("E 码通：" + (message == null || message.isEmpty() ? "未知错误" : message));
            ecodeErrorView.setVisibility(View.VISIBLE);
        });
    }

    private void clearEcodeError() {
        if (ecodeErrorView == null) return;
        runOnUiThread(() -> {
            if (ecodeErrorView != null) ecodeErrorView.setVisibility(View.GONE);
        });
    }

    private void scheduleEcodeProbe(long delayMs) {
        if (ecodeWebView == null || !dashboardVisible) return;
        ecodeWebView.postDelayed(this::probeEcodeLayout, delayMs);
    }

    private void probeEcodeLayout() {
        if (ecodeWebView == null || !dashboardVisible) return;
        ecodeProbeAttempts += 1;
        ecodeWebView.evaluateJavascript(ECODE_LAYOUT_SCRIPT, value -> {
            String decoded = decodeJavascriptString(value);
            try {
                JSONObject payload = new JSONObject(decoded);
                if (payload.optBoolean("ok")) {
                    boolean firstReady = !ecodeAutoScrolled;
                    ecodeAutoScrolled = true;
                    ecodeSessionReady = true;
                    ecodeProbeAttempts = 0;
                    captureEcodeThumbnail(payload.optString("time", ""));
                    clearEcodeError();
                    if (firstReady) refreshDashboardData();
                    return;
                }
                if (ecodeProbeAttempts >= 14) {
                    String reason = payload.optString("reason", "二维码 DOM 未定位");
                    Log.w(LOG_TAG, "ecode thumbnail fallback: " + reason
                            + " rect=" + payload.optString("rect", "null"));
                    // DOM 定位失败只是缩略图增强失败，不把它显示成错误，
                    // 完整 E 码通仍然可以通过顶部入口展开查看。
                    ecodeSessionReady = payload.optString("time", "").length() > 0;
                    ecodeAutoScrolled = true;
                    captureEcodeThumbnail(payload.optString("time", ""));
                    clearEcodeError();
                    refreshDashboardData();
                    scheduleEcodeProbe(2000);
                    return;
                }
            } catch (Exception error) {
                if (ecodeProbeAttempts >= 14) {
                    Log.w(LOG_TAG, "ecode thumbnail fallback: cannot parse layout", error);
                    captureEcodeThumbnail("");
                    clearEcodeError();
                    scheduleEcodeProbe(2000);
                    return;
                }
            }
            scheduleEcodeProbe(700);
        });
    }

    private void captureEcodeThumbnail(String time) {
        if (ecodeWebView == null || ecodeThumbnailView == null) return;
        ecodeWebView.evaluateJavascript(ECODE_QR_IMAGE_SCRIPT, value -> {
            String dataUrl = decodeJavascriptString(value);
            String source = "dom";
            try {
                JSONObject payload = new JSONObject(dataUrl);
                source = payload.optString("source", "dom");
                dataUrl = payload.optString("dataUrl", "");
                Log.d(LOG_TAG, "ecode thumbnail source=" + source
                        + " rect=" + payload.optString("rect", "null"));
            } catch (Exception ignored) {
                // 兼容旧页面脚本直接返回 data URL 的情况。
            }
            if (dataUrl == null || !dataUrl.startsWith("data:image/")) {
                if (ecodeCollapsedTimeView != null && time != null && !time.isEmpty()) {
                    ecodeCollapsedTimeView.setText(time);
                }
                captureEcodeFallbackThumbnail(time, source + "-empty");
                return;
            }
            try {
                int comma = dataUrl.indexOf(',');
                if (comma < 0) {
                    captureEcodeFallbackThumbnail(time, source + "-invalid");
                    return;
                }
                byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap == null) {
                    captureEcodeFallbackThumbnail(time, source + "-decode-failed");
                    return;
                }
                final Bitmap thumbnail = normalizeQrThumbnail(bitmap);
                if (thumbnail != bitmap) bitmap.recycle();
                runOnUiThread(() -> {
                    if (ecodeThumbnailView != null) ecodeThumbnailView.setImageBitmap(thumbnail);
                    if (ecodeCollapsedTimeView != null) ecodeCollapsedTimeView.setText(
                            time == null || time.isEmpty() ? "点击查看完整 E 码通" : time
                    );
                });
            } catch (RuntimeException error) {
                Log.w(LOG_TAG, "ecode thumbnail DOM decode failed; use screenshot fallback", error);
                captureEcodeFallbackThumbnail(time, source + "-exception");
            }
        });
    }

    private void captureEcodeFallbackThumbnail(String time, String reason) {
        if (ecodeWebView == null || ecodeThumbnailView == null) return;
        Log.w(LOG_TAG, "ecode thumbnail image-analysis fallback: " + reason);
        ecodeWebView.post(() -> {
            Bitmap snapshot = null;
            Bitmap thumbnail = null;
            try {
                Picture picture = ecodeWebView.capturePicture();
                if (picture != null && picture.getWidth() > 0 && picture.getHeight() > 0) {
                    int width = Math.min(picture.getWidth(), 1800);
                    int height = Math.min(picture.getHeight(), 2400);
                    snapshot = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
                    Canvas canvas = new Canvas(snapshot);
                    float scaleX = width / (float) picture.getWidth();
                    float scaleY = height / (float) picture.getHeight();
                    canvas.scale(scaleX, scaleY);
                    picture.draw(canvas);
                }
                if (snapshot == null && ecodeWebView.getWidth() > 0 && ecodeWebView.getHeight() > 0) {
                    snapshot = Bitmap.createBitmap(
                            ecodeWebView.getWidth(), ecodeWebView.getHeight(), Bitmap.Config.ARGB_8888);
                    ecodeWebView.draw(new Canvas(snapshot));
                }
                if (snapshot == null) return;
                thumbnail = cropBitmapToQrRegion(snapshot);
                if (thumbnail == null) thumbnail = snapshot;
                final Bitmap result = thumbnail;
                final Bitmap original = snapshot;
                runOnUiThread(() -> {
                    if (ecodeThumbnailView != null) ecodeThumbnailView.setImageBitmap(result);
                    if (ecodeCollapsedTimeView != null) ecodeCollapsedTimeView.setText(
                            time == null || time.isEmpty() ? "点击查看完整 E 码通" : time
                    );
                });
                if (result != original) original.recycle();
                thumbnail = null;
                snapshot = null;
            } catch (RuntimeException error) {
                Log.w(LOG_TAG, "ecode image-analysis fallback failed", error);
            } finally {
                if (thumbnail != null && thumbnail != snapshot) thumbnail.recycle();
                if (snapshot != null) snapshot.recycle();
            }
        });
    }

    /** 在整页截图兜底时寻找最像二维码的高对比度方形区域。 */
    private Bitmap cropBitmapToQrRegion(Bitmap source) {
        if (source == null || source.getWidth() < 80 || source.getHeight() < 80) return null;
        int maxSide = Math.max(source.getWidth(), source.getHeight());
        float scale = maxSide > 360f ? 360f / maxSide : 1f;
        int smallWidth = Math.max(1, Math.round(source.getWidth() * scale));
        int smallHeight = Math.max(1, Math.round(source.getHeight() * scale));
        Bitmap small = Bitmap.createScaledBitmap(source, smallWidth, smallHeight, true);
        Rect best = findQrCandidateRect(small);
        if (best == null) {
            if (small != source) small.recycle();
            return null;
        }
        float inverse = 1f / scale;
        int left = Math.round(best.left * inverse);
        int top = Math.round(best.top * inverse);
        int right = Math.round(best.right * inverse);
        int bottom = Math.round(best.bottom * inverse);
        int width = right - left;
        int height = bottom - top;
        int side = Math.min(Math.max(width, height), Math.min(source.getWidth(), source.getHeight()));
        int centerX = (left + right) / 2;
        int centerY = (top + bottom) / 2;
        int maxLeft = Math.max(0, source.getWidth() - side);
        int maxTop = Math.max(0, source.getHeight() - side);
        left = Math.max(0, Math.min(maxLeft, centerX - side / 2));
        top = Math.max(0, Math.min(maxTop, centerY - side / 2));
        if (side < 32) {
            if (small != source) small.recycle();
            return null;
        }
        Bitmap candidate = Bitmap.createBitmap(source, left, top, side, side);
        Bitmap result = normalizeQrThumbnail(candidate);
        if (result != candidate) candidate.recycle();
        if (small != source) small.recycle();
        return result;
    }

    /**
     * 去掉源图内部不对称的留白，再以二维码有效像素的真实边界生成居中的方形 Bitmap。
     * ImageView 的 padding 不参与二维码定位，避免“Bitmap 看似缩小但内容仍偏左上”。
     */
    private Bitmap normalizeQrThumbnail(Bitmap source) {
        if (source == null || source.isRecycled()) return source;
        Rect content = findQrContentBounds(source);
        if (content == null) return source;

        int contentWidth = content.width();
        int contentHeight = content.height();
        int contentSide = Math.max(contentWidth, contentHeight);
        int quietZone = Math.max(4, Math.round(contentSide * 0.12f));
        int targetSide = contentSide + quietZone * 2;
        if (contentSide < 8 || targetSide <= 0) return source;

        Bitmap normalized = Bitmap.createBitmap(targetSide, targetSide, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(normalized);
        canvas.drawColor(Color.WHITE);

        Paint paint = new Paint();
        paint.setFilterBitmap(false);
        paint.setDither(false);
        int contentLeft = quietZone + (contentSide - contentWidth) / 2;
        int contentTop = quietZone + (contentSide - contentHeight) / 2;
        Rect destination = new Rect(
                contentLeft,
                contentTop,
                contentLeft + contentWidth,
                contentTop + contentHeight
        );
        canvas.drawBitmap(source, content, destination, paint);
        Log.d(LOG_TAG, "ecode thumbnail normalized bounds=" + content.width() + "x" + content.height()
                + " quiet=" + quietZone + " output=" + targetSide + "x" + targetSide);
        return normalized;
    }

    /** 查找二维码深色/彩色模块的有效像素边界，返回右下角为 exclusive 的 Rect。 */
    private Rect findQrContentBounds(Bitmap image) {
        int width = image.getWidth();
        int height = image.getHeight();
        int step = Math.max(1, Math.max(width, height) / 900);
        int left = width;
        int top = height;
        int right = -1;
        int bottom = -1;
        for (int y = 0; y < height; y += step) {
            for (int x = 0; x < width; x += step) {
                int pixel = image.getPixel(x, y);
                if (Color.alpha(pixel) < 24) continue;
                int red = Color.red(pixel);
                int green = Color.green(pixel);
                int blue = Color.blue(pixel);
                int luma = (red * 299 + green * 587 + blue * 114) / 1000;
                int chroma = Math.max(red, Math.max(green, blue))
                        - Math.min(red, Math.min(green, blue));
                // 深色二维码模块，以及校园码常见的深绿色模块；浅色卡片背景不会命中。
                if (luma >= 220 && (chroma < 24 || luma >= 236)) continue;
                left = Math.min(left, x);
                top = Math.min(top, y);
                right = Math.max(right, x);
                bottom = Math.max(bottom, y);
            }
        }
        if (right < left || bottom < top) return null;
        int contentRight = Math.min(width, right + step);
        int contentBottom = Math.min(height, bottom + step);
        if (contentRight - left < 8 || contentBottom - top < 8) return null;
        return new Rect(left, top, contentRight, contentBottom);
    }

    private Rect findQrCandidateRect(Bitmap image) {
        int width = image.getWidth();
        int height = image.getHeight();
        int minSize = Math.max(48, Math.min(width, height) / 6);
        int maxSize = Math.min(Math.min(width, height) * 3 / 4, 300);
        if (maxSize < minSize) return null;
        Rect best = null;
        double bestScore = 0;
        int[] sizes = new int[]{minSize, Math.round(minSize * 1.25f), Math.round(minSize * 1.6f), maxSize};
        for (int size : sizes) {
            int candidateSize = Math.max(minSize, Math.min(maxSize, size));
            int step = Math.max(6, candidateSize / 5);
            for (int top = 0; top + candidateSize <= height; top += step) {
                for (int left = 0; left + candidateSize <= width; left += step) {
                    double[] metrics = qrWindowMetrics(image, left, top, candidateSize);
                    double density = metrics[0];
                    double transitions = metrics[1];
                    if (density < 0.08 || transitions < 0.08) continue;
                    double densityScore = 1d - Math.min(1d, Math.abs(density - 0.34d) / 0.34d);
                    double centerX = left + candidateSize / 2d;
                    double centerY = top + candidateSize / 2d;
                    double centerDistance = Math.abs(centerX - width * 0.5d) / Math.max(1d, width * 0.5d)
                            + Math.abs(centerY - height * 0.42d) / Math.max(1d, height * 0.58d);
                    double centerScore = 1d - Math.min(1d, centerDistance / 1.8d);
                    double score = densityScore * 0.48d + transitions * 0.38d + centerScore * 0.14d;
                    if (score > bestScore) {
                        bestScore = score;
                        best = new Rect(left, top, left + candidateSize, top + candidateSize);
                    }
                }
            }
        }
        return bestScore >= 0.24d ? best : null;
    }

    private double[] qrWindowMetrics(Bitmap image, int left, int top, int size) {
        int grid = 12;
        int dark = 0;
        int transitions = 0;
        int samples = grid * grid;
        boolean[][] values = new boolean[grid][grid];
        for (int row = 0; row < grid; row += 1) {
            for (int column = 0; column < grid; column += 1) {
                int x = Math.min(image.getWidth() - 1, left + (column * 2 + 1) * size / (grid * 2));
                int y = Math.min(image.getHeight() - 1, top + (row * 2 + 1) * size / (grid * 2));
                int pixel = image.getPixel(x, y);
                int luma = (Color.red(pixel) * 299 + Color.green(pixel) * 587 + Color.blue(pixel) * 114) / 1000;
                values[row][column] = luma < 180;
                if (values[row][column]) dark += 1;
                if (column > 0 && values[row][column] != values[row][column - 1]) transitions += 1;
                if (row > 0 && values[row][column] != values[row - 1][column]) transitions += 1;
            }
        }
        return new double[]{dark / (double) samples, transitions / (double) (grid * (grid - 1) * 2)};
    }

    private void refreshDashboardData() {
        // 教务查询只依赖教务系统会话；E 码通页面即使未登录或暂时解析失败，
        // 也不能阻塞成绩、考试和课表。E 码通成功后仍会再次触发这里刷新。
        if (dashboardWebView == null || !dashboardLoaded || !dashboardPageReady) return;
        cookieManager.flush();
        dashboardWebView.post(() -> dashboardWebView.evaluateJavascript(
                "window.__refreshDashboard && window.__refreshDashboard(true);", null));
    }

    private String decodeJavascriptString(String value) {
        if (value == null || "null".equals(value)) return "";
        try {
            Object parsed = new JSONTokener(value).nextValue();
            if (parsed instanceof String) return (String) parsed;
        } catch (Exception ignored) {
            // 某些 WebView 版本会直接返回 JSON 对象文本，继续按原文本解析。
        }
        return value;
    }

    private GradientDrawable roundBackground(int color, int radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        return drawable;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!dashboardVisible && portalActionButton != null) {
            updatePortalActionLabel(portalWebView == null ? "" : portalWebView.getUrl());
            if (portalWebView != null) {
                portalWebView.postDelayed(this::installPortalQrCapture, 160);
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == WRITE_DASHBOARD_IMAGE_REQUEST) {
            boolean granted = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            String dataUrl = pendingDashboardImageDataUrl;
            String fileName = pendingDashboardImageName;
            pendingDashboardImageDataUrl = "";
            pendingDashboardImageName = "";
            if (granted && dataUrl != null && !dataUrl.isEmpty()) {
                networkExecutor.execute(() -> persistDashboardImage(dataUrl, fileName));
            } else {
                Toast.makeText(this, "需要相册权限才能保存课表图片", Toast.LENGTH_LONG).show();
            }
            return;
        }
        if (requestCode == WRITE_DASHBOARD_CSV_REQUEST) {
            boolean granted = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            String content = pendingDashboardCsvContent;
            String fileName = pendingDashboardCsvName;
            pendingDashboardCsvContent = "";
            pendingDashboardCsvName = "";
            if (granted && content != null && !content.isEmpty()) {
                networkExecutor.execute(() -> persistScheduleCsv(content, fileName));
            } else {
                Toast.makeText(this, "需要存储权限才能保存 CSV 文件", Toast.LENGTH_LONG).show();
            }
            return;
        }
        if (requestCode != WRITE_QR_STORAGE_REQUEST) return;
        boolean granted = grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        boolean retry = qrSavePendingPermission;
        qrSavePendingPermission = false;
        if (granted && retry) {
            captureQrImageAndSave();
        } else if (retry) {
            Toast.makeText(this, "需要相册权限才能保存登录二维码", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    public void onBackPressed() {
        if (dashboardVisible) {
            if (ecodeExpanded) {
                setEcodeExpanded(false);
                return;
            }
            // 先交给移动端 shell 关闭抽屉、返回全校课表结果或回到总览；
            // 只有已经在总览时才退出 Activity，不把用户重新送回登录页。
            if (dashboardWebView != null) {
                dashboardWebView.evaluateJavascript(
                        "window.__handleAndroidBack ? window.__handleAndroidBack() : false;",
                        value -> {
                            if (!"true".equals(value)) MainActivity.super.onBackPressed();
                        }
                );
            } else {
                super.onBackPressed();
            }
            return;
        }
        if (portalWebView.canGoBack()) {
            portalWebView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        cookieManager.flush();
        networkExecutor.shutdownNow();
        if (portalWebView != null) portalWebView.destroy();
        if (ecodeWebView != null) ecodeWebView.destroy();
        if (dashboardWebView != null) dashboardWebView.destroy();
        super.onDestroy();
    }

    /** 只接收学校登录页生成的临时二维码地址，不接收账号、密码或验证码。 */
    private final class LoginBridge {
        @android.webkit.JavascriptInterface
        public void onQrUrl(String url) {
            receiveQrUrl(url);
        }
    }

    private final class AndroidBridge {
        @android.webkit.JavascriptInterface
        public void openPortal() {
            openPortalForReauthentication();
        }

        @android.webkit.JavascriptInterface
        public void openWebVpnUrl(String url) {
            openGeneratedWebVpnUrl(url);
        }

        @android.webkit.JavascriptInterface
        public void setEcodePanelHidden(boolean hidden) {
            // 这里不能直接调用同名桥接方法，否则会在 UI 线程里递归调用自身，
            // 页面一触发滚动通知就会 StackOverflowError 使整个 Activity 闪退。
            runOnUiThread(() -> MainActivity.this.setEcodePanelHidden(hidden));
        }

        @android.webkit.JavascriptInterface
        public String getLoginMethod() {
            return preferences == null ? LOGIN_METHOD_BUILT_IN : readLoginMethodPreference();
        }

        @android.webkit.JavascriptInterface
        public void setLoginMethod(String method) {
            String normalized;
            if (LOGIN_METHOD_WECHAT.equals(method)) normalized = LOGIN_METHOD_WECHAT;
            else if (LOGIN_METHOD_PASSWORD.equals(method)) normalized = LOGIN_METHOD_PASSWORD;
            else normalized = LOGIN_METHOD_BUILT_IN;
            loginMethodForCurrentPortal = normalized;
            if (preferences != null) {
                preferences.edit().putString(DEFAULT_LOGIN_METHOD, normalized).apply();
            }
        }

        @android.webkit.JavascriptInterface
        public String getLoginError() {
            return lastAcademicLoginError == null ? "" : lastAcademicLoginError;
        }

        @android.webkit.JavascriptInterface
        public void request(String requestId, String method, String url, String body, String headersJson) {
            networkExecutor.execute(() -> performRequest(requestId, method, url, body, headersJson));
        }

        @android.webkit.JavascriptInterface
        public String loadPersonalCache() {
            return loadPersonalCachePayload();
        }

        @android.webkit.JavascriptInterface
        public void savePersonalCache(String payload) {
            networkExecutor.execute(() -> savePersonalCachePayload(payload));
        }

        @android.webkit.JavascriptInterface
        public void clearPersonalCache() {
            clearPersonalCachePayload();
        }

        @android.webkit.JavascriptInterface
        public String loadLocalSchedule(String profileKey) {
            // local-schedule 与 personal-cache 分目录、分文件名索引，清除教务缓存不会触碰这里。
            return loadLocalSchedulePayload(profileKey);
        }

        @android.webkit.JavascriptInterface
        public String loadLocalSchedule() {
            return loadLocalSchedulePayload("");
        }

        @android.webkit.JavascriptInterface
        public void saveLocalSchedule(String payload) {
            networkExecutor.execute(() -> saveLocalSchedulePayload(payload));
        }

        @android.webkit.JavascriptInterface
        public void clearLocalSchedule(String profileKey) {
            clearLocalSchedulePayload(profileKey);
        }

        @android.webkit.JavascriptInterface
        public void clearLocalSchedule() {
            clearLocalSchedulePayload("");
        }

        @android.webkit.JavascriptInterface
        public void saveImage(String dataUrl, String fileName) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                    && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                pendingDashboardImageDataUrl = dataUrl == null ? "" : dataUrl;
                pendingDashboardImageName = fileName == null ? "" : fileName;
                runOnUiThread(() -> requestPermissions(
                        new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                        WRITE_DASHBOARD_IMAGE_REQUEST));
                return;
            }
            networkExecutor.execute(() -> persistDashboardImage(dataUrl, fileName));
        }

        @android.webkit.JavascriptInterface
        public void saveCsv(String content, String fileName) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                    && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                pendingDashboardCsvContent = content == null ? "" : content;
                pendingDashboardCsvName = fileName == null ? "" : fileName;
                runOnUiThread(() -> requestPermissions(
                        new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                        WRITE_DASHBOARD_CSV_REQUEST));
                return;
            }
            networkExecutor.execute(() -> persistScheduleCsv(content, fileName));
        }
    }

    private void performRequest(String requestId, String method, String urlText, String body, String headersJson) {
        HttpURLConnection connection = null;
        try {
            if (urlText == null || !urlText.startsWith("https://webvpn.neu.edu.cn/")) {
                deliver(requestId, -1, "只允许访问东北大学 WebVPN 地址");
                return;
            }

            URL url = new URL(urlText);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod(method == null || method.isEmpty() ? "GET" : method);
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(12000);
            connection.setInstanceFollowRedirects(true);
            connection.setUseCaches(false);
            connection.setDoInput(true);

            String cookie = cookieManager.getCookie(urlText);
            if (cookie != null && !cookie.isEmpty()) {
                connection.setRequestProperty("Cookie", cookie);
            }

            if (headersJson != null && !headersJson.isEmpty()) {
                JSONObject headers = new JSONObject(headersJson);
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    Object value = headers.opt(key);
                    if (value != null && value != JSONObject.NULL) {
                        connection.setRequestProperty(key, String.valueOf(value));
                    }
                }
            }

            String requestMethod = connection.getRequestMethod();
            if (!"GET".equalsIgnoreCase(requestMethod) && body != null && !body.isEmpty()) {
                connection.setDoOutput(true);
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                try (java.io.OutputStream output = connection.getOutputStream()) {
                    output.write(bytes);
                }
            }

            int status = connection.getResponseCode();
            storeResponseCookies(urlText, connection.getHeaderFields());
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String responseBody = readResponse(stream);
            boolean loginInvalid = isAcademicLoginInvalidResponse(status, responseBody);
            if (loginInvalid) {
                handleAcademicSessionInvalid(
                        status == 401
                                ? "教务系统返回 HTTP 401，登录状态已失效"
                                : "教务接口返回统一身份认证登录页，当前会话已失效"
                );
            } else if (status >= 200 && status < 400) {
                markAcademicSessionHealthy();
            }
            deliver(requestId, status, responseBody);
        } catch (Exception error) {
            deliver(requestId, -1, error.getMessage() == null ? "原生网络请求失败" : error.getMessage());
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void storeResponseCookies(String url, Map<String, List<String>> headers) {
        if (headers == null) return;
        for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
            if (entry.getKey() == null || !"set-cookie".equalsIgnoreCase(entry.getKey())) continue;
            List<String> values = entry.getValue();
            if (values == null) continue;
            for (String value : values) {
                if (value != null && !value.isEmpty()) {
                    cookieManager.setCookie(url, value);
                }
            }
        }
        cookieManager.flush();
    }

    private String readResponse(InputStream stream) throws IOException {
        if (stream == null) return "";
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                result.append(line).append('\n');
            }
        }
        return result.toString();
    }

    private void deliver(String requestId, int status, String body) {
        if (dashboardWebView == null) return;
        String safeId = JSONObject.quote(requestId == null ? "" : requestId);
        String safeBody = JSONObject.quote(body == null ? "" : body);
        String script = "window.__nativeApiResponse(" + safeId + "," + status + "," + safeBody + ");";
        runOnUiThread(() -> dashboardWebView.evaluateJavascript(script, null));
    }
}
