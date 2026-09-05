package cn.neu.zhizhangdongda;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.animation.ValueAnimator;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.SharedPreferences;
import android.content.res.Configuration;
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
import android.view.MotionEvent;
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
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
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
    private static final String PORTAL_FALLBACK_URL = "https://webvpn.neu.edu.cn/https/62304135386136393339346365373340baf6bc2bc4cb43c8bc1d6f66c806db";
    private static final String CAMPUS_ACADEMIC_HTTPS = "https://jwxt.neu.edu.cn";
    private static final String CAMPUS_ACADEMIC_HTTP = "http://jwxt.neu.edu.cn";
    private static final String CAMPUS_AUTH_HOST = "pass.neu.edu.cn";
    private static final String CAMPUS_ECODE_URL = "https://ecode.neu.edu.cn/ecode/";
    private static final String ACCESS_NETWORK_AUTO = "auto";
    private static final String ACCESS_NETWORK_CAMPUS = "campus";
    private static final String ACCESS_NETWORK_WEBVPN = "webvpn";
    private static final String ACCESS_NETWORK_MODE = "access_network_mode";
    private static final String ACCESS_NETWORK_RESOLVED = "access_network_resolved";
    // 这是学校 E 码通对应的 WebVPN 目标地址；其中的代理标识必须与学校
    // 给出的地址完全一致，少一个字符都会被 WebVPN 解析成 PARSE_FAILED。
    // 不把 SPA 的 #/ 片段直接交给 WebVPN 代理，先请求目录地址，让原网页
    // 自己完成重定向，兼容 Android WebView 的代理解析行为。
    private static final String ECODE_URL = "https://webvpn.neu.edu.cn/https/62304135386136393339346365373340b5e2ab3b8f8b48d8e7566e77934bd689/ecode/";
    private static final String ECODE_TARGET_TOKEN = "62304135386136393339346365373340b5e2ab3b8f8b48d8e7566e77934bd689";
    private static final String WEBVPN_ECODE_URL = ECODE_URL;
    private static final String DASHBOARD_URL = "file:///android_asset/dashboard.html?v=0.1.87";
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
    private static final String TOAST_NOTIFICATIONS_ENABLED = "toast_notifications_enabled";
    private static final String CURRENT_TERM_SETTINGS = "current_term_settings_v1";
    private static final String CAMPUS_SETTING = "campus_setting_v1";
    private static final String BUILT_IN_CREDENTIALS = "built_in_credentials";
    private static final String LAST_ACADEMIC_LOGIN_ERROR = "last_academic_login_error";
    private static final String LAST_LOGIN_DIAGNOSTICS = "last_login_diagnostics";
    private static final String SAVED_QR_IMAGE_URI = "saved_qr_image_uri";
    private static final String SAVED_QR_IMAGE_PATH = "saved_qr_image_path";
    private static final String LOGIN_METHOD_BUILT_IN = "builtin";
    private static final String LOGIN_METHOD_PASSWORD = "password";
    // 手机登录由学校页面自己完成图形验证码、短信发送和登录请求；原生只负责
    // 把这个入口带到同一个认证 WebView，不复制学校的私有协议。
    private static final String LOGIN_METHOD_MOBILE = "mobile";
    private static final String LOGIN_METHOD_WECHAT = "wechat";
    private static final String LOGIN_KEYSTORE_ALIAS = "zhizhang_builtin_login_v1";
    private static final int LOGIN_INSPECTION_MAX_ATTEMPTS = 12;
    private static final int BUILT_IN_LOGIN_TAB_SETTLE_MS = 180;
    private static final int BUILT_IN_LOGIN_SUBMIT_SETTLE_MS = 260;
    private static final int BUILT_IN_LOGIN_INSPECTION_INTERVAL_MS = 300;
    private static final int BUILT_IN_LOGIN_PORTAL_PROBE_DELAY_MS = 260;
    private static final int BUILT_IN_LOGIN_RETRY_MAX = 1;
    private static final int BUILT_IN_LOGIN_PORTAL_PROBE_MAX_ATTEMPTS = 2;
    private static final int LOGIN_DIAGNOSTIC_EVENT_MAX = 120;
    private static final int LOGIN_DIAGNOSTICS_MAX_CHARS = 60000;
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
    // 会话探测严格使用学校 WebVPN 地址；不允许回退到 jwxt 直连。
    private static final int ACADEMIC_PROBE_TIMEOUT_MS = 2500;
    private static final int ACADEMIC_PROBE_TOTAL_BUDGET_MS = 5000;
    private static final long ACADEMIC_PROBE_COOLDOWN_MS = 8000L;
    private static final long FOREGROUND_PROBE_INTERVAL_MS = 10000L;
    private static final int NETWORK_FAILURES_BEFORE_PROBE = 2;
    private static final int ACADEMIC_ECODE_REDIRECT_MAX = 2;
    private static final int ACADEMIC_CAS_TICKET_BOUNCE_MAX = 2;
    private static final int ACADEMIC_HOME_NOT_FOUND_MAX = 3;

    /**
     * 学校登录页 DOM 判定，供账密注入和页面检查共用。
     * laidOut：当前有布局面积，表示用户正在看的控件。
     * present：节点存在即可操作；隐藏的账号/二维码 tab、0×0 的信任设备勾选仍算可操作。
     * 账密提交后学校会整页换成设备二次认证（#imgCode 图形码 + #scendAuthCode 短信），
     * 不再保留 #un/#pd/#loginForm/#saveDevice。
     */
    private static final String SCHOOL_LOGIN_PAGE_HELPERS = """
            function laidOut(n){
              if(!n)return false;
              var s=getComputedStyle(n),r=n.getBoundingClientRect();
              return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;
            }
            function present(n){return Boolean(n);}
            function isSecondAuthPage(){
              return Boolean(
                document.getElementById('second_auth_form')
                || document.getElementById('imgCode')
                || document.getElementById('scendAuthCode')
                || document.getElementById('getScendAuthCode')
                || document.getElementById('index_scendAuth_btn')
                || document.getElementById('secondAuthByMobile')
                || document.getElementById('second-qr-code')
              );
            }
            """;

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
    private BackgroundLoginWebView portalWebView;
    private WebView ecodeWebView;
    private WebView dashboardWebView;
    private LinearLayout loginMethodBar;
    private FrameLayout builtInLoginPanel;
    private EditText builtInUsernameInput;
    private EditText builtInPasswordInput;
    private EditText builtInCodeInput;
    private LinearLayout builtInCodeRow;
    private CheckBox builtInTrustDeviceCheck;
    private FrameLayout interactiveTrustDevicePanel;
    private CheckBox interactiveTrustDeviceCheck;
    private TextView builtInLoginStatus;
    private Button builtInLoginButton;
    private Button builtInMobileLoginButton;
    private Button builtInOpenAcademicButton;
    private Button builtInCloseLoginButton;
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
    private boolean ecodePanelHidden;
    private boolean ecodeBackgroundLoginAttemptedForCurrentFailure;
    private boolean ecodeReloadAfterBackgroundLogin;
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
    // 用户从查询台打开原教务系统时，按实际 URL 决定是否显示登录层：
    // 已进入 /jwapp/ 就只展示原网页；只有仍停在认证页才显示内置登录。
    private boolean academicPortalViewerActive;
    private int academicEcodeRedirectAttempts;
    private int academicCasTicketBounceAttempts;
    private int academicHomeNotFoundAttempts;
    private String accessNetworkMode = ACCESS_NETWORK_AUTO;
    private String accessNetworkResolved = ACCESS_NETWORK_WEBVPN;
    private boolean accessNetworkProbeDone;
    private boolean builtInLoginChallengeVisible;
    private boolean builtInInteractiveChallengeVisible;
    private boolean builtInMobileLoginMode;
    private boolean backgroundLoginInProgress;
    private boolean backgroundLoginForEcode;
    private boolean backgroundLoginAttemptedForCurrentFailure;
    private String pendingAcademicFailureReason = "";
    private String pendingEcodeLoginUrl = "";
    private int builtInLoginInspectionAttempts;
    private int builtInLoginPortalProbeAttempts;
    private int builtInLoginRetryCount;
    private boolean builtInLoginPortalProbeScheduled;
    private boolean builtInLoginSessionProbeInProgress;
    private String pendingBuiltInUsername = "";
    private String pendingBuiltInPassword = "";
    private String lastAcademicLoginError = "";
    private String lastLoginDiagnostics = "";

    // 所有异步会话/登录回调都必须带上这两个代次；WebView 旧页面完成回调
    // 不能改变新一轮登录或新 Cookie 的状态。
    private long sessionEpoch = 1L;
    private long loginOperationSequence;
    private long activeLoginOperationId;
    // dashboard.js 的 ready 回调可能早于 WebView 的 onPageFinished；必须先
    // 保存信号，等文档真正可执行刷新脚本时再消费，不能把这次启动握手丢掉。
    private boolean dashboardHandshakeSignalReceived;
    private boolean dashboardHandshakeReceived;
    private boolean dashboardRefreshPending;
    private boolean dashboardRefreshForceTerms;
    private long lastForegroundProbeAt;
    private long lastBackgroundAt;
    private long lastAcademicProbeAt;
    private long lastAcademicSessionHealthyAt;
    private long academicProbeSequence;
    private long activeAcademicProbeId;
    private long activeAcademicProbeEpoch;
    private long activeAcademicProbeLoginOperationId;
    private boolean academicProbeInFlight;
    private int academicNetworkFailureStreak;
    private long lastNetworkRecoveryAt;
    private boolean postLoginVerificationPending;
    private boolean postLoginVerificationForEcode;
    private boolean postLoginHadAcademicFailure;
    private long postLoginOperationId;

    // 登录诊断只保存脱敏后的阶段、页面元数据和错误摘要，不保存密码、验证码、Cookie
    // 值、Token 或完整查询参数。事件保存在内存中，并在失败后保存一份有限长度的报告，
    // 方便用户在应用重启后仍能复制给开发者定位问题。
    private final Object loginDiagnosticLock = new Object();
    private final ArrayDeque<String> loginDiagnosticEvents = new ArrayDeque<>();
    private long loginDiagnosticStartedAt;
    private long loginDiagnosticFinishedAt;
    private int loginDiagnosticAttemptNumber;
    private String loginDiagnosticStatus = "idle";
    private String loginDiagnosticScope = "academic";
    private String loginDiagnosticPhase = "idle";
    private boolean loginDiagnosticBackground;
    private String loginDiagnosticLastUrl = "";
    private String loginDiagnosticLastTitle = "";
    private String loginDiagnosticLastMessage = "";
    private int loginDiagnosticLastHttpStatus = -1;
    private String loginDiagnosticLastHttpUrl = "";
    private String loginDiagnosticLastWebError = "";
    private String loginDiagnosticLastWebErrorUrl = "";
    private boolean loginDiagnosticCredentialsAvailable;
    private boolean loginDiagnosticTrustDeviceRequested;

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

    /**
     * 后台认证需要保持 WebView 可见运行，不能用 INVISIBLE/GONE 停掉页面脚本；
     * 但它位于前台层级时必须把触摸事件交还给下面的 dashboard。
     */
    private static final class BackgroundLoginWebView extends WebView {
        private boolean backgroundInputBlocked;

        BackgroundLoginWebView(Context context) {
            super(context);
        }

        void setBackgroundInputBlocked(boolean blocked) {
            backgroundInputBlocked = blocked;
        }

        @Override
        public boolean dispatchTouchEvent(MotionEvent event) {
            if (backgroundInputBlocked) return false;
            return super.dispatchTouchEvent(event);
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(getColor(R.color.native_background));
        getWindow().setNavigationBarColor(getColor(R.color.native_background));

        preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        cookieManager.setAcceptCookie(true);
        if (!preferences.contains(DEFAULT_LOGIN_METHOD)) {
            preferences.edit().putString(DEFAULT_LOGIN_METHOD, LOGIN_METHOD_BUILT_IN).apply();
        }
        loginMethodForCurrentPortal = readLoginMethodPreference();
        lastAcademicLoginError = preferences.getString(LAST_ACADEMIC_LOGIN_ERROR, "");
        lastLoginDiagnostics = preferences.getString(LAST_LOGIN_DIAGNOSTICS, "");
        savedQrImageUri = preferences.getString(SAVED_QR_IMAGE_URI, "");
        savedQrImagePath = preferences.getString(SAVED_QR_IMAGE_PATH, "");
        restoreAccessNetworkPreference();
        startAccessNetworkResolve();

        root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.native_background));

        portalWebView = createPortalWebView();
        portalWebView.addJavascriptInterface(new LoginBridge(), "AndroidLoginBridge");
        ecodeWebView = createWebView(false);
        dashboardWebView = createWebView(true);
        root.addView(portalWebView, fullScreenParams());

        dashboardHome = new FrameLayout(this);
        dashboardHome.setBackgroundColor(getColor(R.color.native_background));
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
        portalActionButton.setBackground(roundBackground(getColor(R.color.native_brand_strong), 16));
        portalActionButton.setOnClickListener(view -> {
            if (builtInInteractiveChallengeVisible && builtInLoginSubmissionPending) {
                completeBuiltInInteractiveChallenge();
                return;
            }
            if (builtInMobileLoginMode && isPortalLoginPage(portalWebView == null ? "" : portalWebView.getUrl())) {
                stopBuiltInMobileLoginMode();
                return;
            }
            if (hasSavedQrImage()) {
                deleteSavedQrImage();
                showDashboard();
                return;
            }
            if (isPortalLoginPage(portalWebView == null ? "" : portalWebView.getUrl())) {
                closePortalLoginToDashboard();
                return;
            }
            showDashboard();
            // 已加载过 Dashboard 时，启动握手不会再次触发；外部原网页登录
            // 返回后先确认新 Cookie，再由唯一刷新链路更新数据。
            root.post(() -> {
                requestDashboardRefreshAfterSessionProbe(true);
                requestAcademicSessionProbe("manual-portal-return", 0L, true);
            });
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
        portalQrActionButton.setTextColor(getColor(R.color.native_text_primary));
        portalQrActionButton.setTextSize(14);
        portalQrActionButton.setText("保存二维码并打开微信");
        portalQrActionButton.setContentDescription("保存教务系统登录二维码并打开微信");
        portalQrActionButton.setBackground(roundBackground(getColor(R.color.native_surface), 16));
        portalQrActionButton.setOnClickListener(view -> saveQrAndOpenWechat());
        portalQrActionButton.setVisibility(View.GONE);
        FrameLayout.LayoutParams qrActionParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                dp(48),
                Gravity.BOTTOM
        );
        qrActionParams.setMargins(dp(16), 0, dp(16), dp(84));
        root.addView(portalQrActionButton, qrActionParams);

        interactiveTrustDevicePanel = new FrameLayout(this);
        interactiveTrustDevicePanel.setPadding(dp(8), 0, dp(8), 0);
        interactiveTrustDevicePanel.setBackground(roundBackground(getColor(R.color.native_surface), 14));
        interactiveTrustDevicePanel.setElevation(dp(4));
        interactiveTrustDeviceCheck = new CheckBox(this);
        interactiveTrustDeviceCheck.setText("信任此设备（默认已勾选）");
        interactiveTrustDeviceCheck.setTextColor(getColor(R.color.native_text_primary));
        interactiveTrustDeviceCheck.setTextSize(13);
        interactiveTrustDeviceCheck.setContentDescription("信任此设备，默认已勾选");
        interactiveTrustDeviceCheck.setChecked(true);
        interactiveTrustDeviceCheck.setOnCheckedChangeListener((button, checked) -> {
            if (builtInTrustDeviceCheck != null && builtInTrustDeviceCheck.isChecked() != checked) {
                builtInTrustDeviceCheck.setChecked(checked);
            }
            if (builtInInteractiveChallengeVisible && builtInLoginSubmissionPending) {
                syncBuiltInTrustDeviceSelection(activeLoginOperationId);
            } else if (builtInMobileLoginMode) {
                syncPortalTrustDeviceSelection();
            }
        });
        interactiveTrustDevicePanel.addView(interactiveTrustDeviceCheck, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.CENTER_VERTICAL
        ));
        interactiveTrustDevicePanel.setVisibility(View.GONE);
        FrameLayout.LayoutParams interactiveTrustParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                dp(50),
                Gravity.BOTTOM
        );
        interactiveTrustParams.setMargins(dp(16), 0, dp(16), dp(82));
        root.addView(interactiveTrustDevicePanel, interactiveTrustParams);

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
            // 先显示查询页/缓存，再由 Dashboard 启动握手完成 WebVPN 轻量
            // 探测。加密凭据存在只表示“可恢复”，不是跳过探测直接提交密码的
            // 理由；这样 Cookie 仍有效时不会多走一遍统一认证。
            showDashboard();
        } else {
            // 首次默认显示内置登录，同时始终保留学校原网页账密和二维码入口。
            showPortal();
        }
    }

    private WebView createWebView(boolean enableNativeBridge) {
        return createWebView(new WebView(this), enableNativeBridge);
    }

    private WebView createWebView(WebView webView, boolean enableNativeBridge) {
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
        CookieManager.getInstance().setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        }
        // 保持跨版本稳定的 UA 标识，避免应用更新被学校的可信设备策略视为全新设备。
        settings.setUserAgentString(settings.getUserAgentString() + " ZhiZhangDongDa/Android");
        webView.setBackgroundColor(getColor(R.color.native_background));
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
                    updatePortalActionLabel(url);
                    if (builtInLoginSubmissionPending) {
                        recordLoginDiagnosticPage("page-started", view, url);
                    }
                    String rewrittenAuth = rewriteCampusAuthServiceUrl(url);
                    if (!rewrittenAuth.equals(url)) {
                        if (builtInLoginSubmissionPending) {
                            recordLoginDiagnostic(
                                    "cas-service-rewrite",
                                    "from=" + sanitizeDiagnosticUrl(url)
                                            + " to=" + sanitizeDiagnosticUrl(rewrittenAuth)
                            );
                        }
                        view.stopLoading();
                        view.loadUrl(rewrittenAuth);
                        return;
                    }
                }
                if (view == ecodeWebView) {
                    Log.d(LOG_TAG, "page-started url=" + url);
                }
                if (view == dashboardWebView) {
                    dashboardPageReady = false;
                    dashboardHandshakeSignalReceived = false;
                    dashboardHandshakeReceived = false;
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
                    updatePortalActionLabel(url);
                    if (builtInLoginSubmissionPending) {
                        recordLoginDiagnosticPage("page-finished", view, url);
                    }
                    if (handleCampusCasTicketLanding(url)) {
                        return;
                    }
                    if (redirectAcademicPortalAwayFromEcode(url)) {
                        return;
                    }
                    if (redirectAcademicPortalAwayFromBareShell(url)) {
                        return;
                    }
                    if (recoverCampusAcademicNotFound(view, url, -1)) {
                        return;
                    }
                    if (dashboardVisible && !academicPortalViewerActive
                            && !builtInLoginSubmissionPending
                            && !builtInInteractiveChallengeVisible
                            && !builtInMobileLoginMode) {
                        hidePortalOverlays();
                    } else {
                        installPortalQrCapture();
                        showQrActionLoadingIfNeeded(url);
                        showLoginMethodChooserIfNeeded(url);
                    }
                    if (!builtInLoginSubmissionPending) {
                        applyPortalLoginMethodUi();
                        if (builtInMobileLoginMode) {
                            view.postDelayed(MainActivity.this::syncPortalTrustDeviceSelection, 120L);
                        }
                    }
                    if (!builtInLoginSubmissionPending
                            && (LOGIN_METHOD_MOBILE.equals(loginMethodForCurrentPortal)
                            || builtInMobileLoginMode)
                            && isPortalLoginPage(url)) {
                        // 学校目前把手机登录入口留在 mobile_template 中但注释掉了；
                        // 仍调用学校自己的 loginByMobile/initPassWordEvent，让图形
                        // 验证码、短信发送、Cookie 和重定向全部留在同一 WebView。
                        view.postDelayed(MainActivity.this::activatePortalMobileLogin, BUILT_IN_LOGIN_TAB_SETTLE_MS);
                    }
                    if (builtInLoginSubmissionPending
                            && backgroundLoginForEcode
                            && isEcodeTargetReadyUrl(url)) {
                        finishBuiltInLoginSuccess(activeLoginOperationId);
                    } else if (builtInLoginSubmissionPending && isAcademicPortalReadyUrl(url)) {
                        // 校园网打开 jwxt /jwapp/ 时，地址本身就含 /jwapp/，
                        // 即使尚未完成 CAS 也会误报成功。必须用 Cookie 探测确认。
                        verifyBuiltInLoginSession(activeLoginOperationId, "url-jwapp-confirm", false);
                    } else if (builtInLoginSubmissionPending && isPortalLoginPage(url)) {
                        // 会话失效后学校可能直接返回图形/手机验证页，
                        // 该页面没有账号密码输入框；先检查页面状态，
                        // 不能默认把它当作普通账密页提交。
                        long operationId = activeLoginOperationId;
                        view.postDelayed(() -> inspectBuiltInLoginPage(operationId), 120);
                    } else if (builtInLoginSubmissionPending && isPortalPageUrl(url)) {
                        // 挑战页可能不再使用 /tpass/login 路径；先观察官方
                        // 页面本身，避免把新增验证码误判成未知中转页。
                        long operationId = activeLoginOperationId;
                        view.postDelayed(() -> inspectBuiltInLoginPage(operationId), 120);
                    } else if (builtInLoginSubmissionPending) {
                        // 统一认证成功后偶尔会停在 WebVPN/CAS 中转页，而不是
                        // 直接进入 /jwapp/。主动重新打开教务入口验证 Cookie，
                        // 避免后台登录只在未知页轮询直至超时。
                        scheduleBuiltInPortalProbe(url, activeLoginOperationId);
                    }
                } else if (view == ecodeWebView) {
                    Log.d(LOG_TAG, "page-finished url=" + url + " current=" + view.getUrl() + " title=" + view.getTitle());
                    if (isPortalLoginPage(url)) {
                        handleEcodeSessionInvalid("E 码通登录状态已失效", url);
                        return;
                    }
                    setEcodeError("原网页已加载，正在定位二维码…");
                    scheduleEcodeProbe(350);
                } else if (view == dashboardWebView) {
                    dashboardPageReady = true;
                    view.evaluateJavascript("document.documentElement.classList.add('android-shell');", null);
                    view.evaluateJavascript("window.__prepareNativeEcode && window.__prepareNativeEcode();", null);
                    // JS 的启动握手可能比 onPageFinished 更早抵达。此处仅消费
                    // 已保存的握手，不直接新建刷新链路，仍能避免重复请求。
                    completeDashboardHandshakeIfReady();
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
                if (view == portalWebView && builtInLoginSubmissionPending
                        && (request == null || request.isForMainFrame())) {
                    String description = error == null ? "未知 WebView 错误" : String.valueOf(error.getDescription());
                    int errorCode = error == null ? -1 : error.getErrorCode();
                    String errorUrl = request == null || request.getUrl() == null
                            ? view.getUrl() : request.getUrl().toString();
                    recordLoginDiagnostic(
                            "web-error",
                            "mainFrame=true code=" + errorCode + " description=" + sanitizeDiagnosticText(description)
                                    + " url=" + sanitizeDiagnosticUrl(errorUrl)
                    );
                    updateLoginDiagnosticWebError(description, errorUrl);
                }
                if (view == ecodeWebView && (request == null || request.isForMainFrame())) {
                    String description = error == null ? "未知网络错误" : String.valueOf(error.getDescription());
                    Log.e(LOG_TAG, "main-frame-error url=" + (request == null ? "" : request.getUrl()) + " description=" + description);
                    setEcodeError("原网页加载失败：" + description);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                if (view == portalWebView && request != null && request.isForMainFrame()
                        && request.getUrl() != null) {
                    String original = request.getUrl().toString();
                    String rewritten = rewriteCampusAuthServiceUrl(original);
                    if (!rewritten.equals(original)) {
                        if (builtInLoginSubmissionPending) {
                            recordLoginDiagnostic(
                                    "cas-service-rewrite",
                                    "from=" + sanitizeDiagnosticUrl(original)
                                            + " to=" + sanitizeDiagnosticUrl(rewritten)
                            );
                        }
                        view.loadUrl(rewritten);
                        return true;
                    }
                }
                return false;
            }

            @Override
            public void onReceivedHttpError(WebView view, android.webkit.WebResourceRequest request, android.webkit.WebResourceResponse response) {
                super.onReceivedHttpError(view, request, response);
                if (view == portalWebView && request != null && request.isForMainFrame()) {
                    int status = response == null ? -1 : response.getStatusCode();
                    String errorUrl = request.getUrl() == null ? view.getUrl() : request.getUrl().toString();
                    if (builtInLoginSubmissionPending) {
                        recordLoginDiagnostic(
                                "http-error",
                                "mainFrame=true status=" + status + " url=" + sanitizeDiagnosticUrl(errorUrl)
                        );
                        updateLoginDiagnosticHttpError(status, errorUrl);
                    }
                    if (status == 404) {
                        if (handleCampusCasTicketLanding(errorUrl)) return;
                        recoverCampusAcademicNotFound(view, errorUrl, status);
                    }
                }
                if (view == ecodeWebView && request != null && request.isForMainFrame()) {
                    int status = response == null ? -1 : response.getStatusCode();
                    Log.e(LOG_TAG, "main-frame-http-error url=" + request.getUrl() + " status=" + status);
                    if (status == 401 || status == 403) {
                        handleEcodeSessionInvalid("E 码通原网页返回 HTTP " + status,
                                request.getUrl() == null ? "" : request.getUrl().toString());
                    } else {
                        setEcodeError("原网页返回 HTTP " + status + "，请检查网络状态");
                    }
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

    private BackgroundLoginWebView createPortalWebView() {
        return (BackgroundLoginWebView) createWebView(new BackgroundLoginWebView(this), false);
    }

    private LinearLayout createLoginMethodBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setPadding(dp(8), dp(7), dp(8), dp(7));
        bar.setBackgroundColor(getColor(R.color.native_surface));
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
        panel.setBackgroundColor(getColor(R.color.native_background));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(22), dp(30), dp(22), dp(30));

        TextView title = new TextView(this);
        title.setText("内置登录");
        title.setTextColor(getColor(R.color.native_text_primary));
        title.setTextSize(24);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        content.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("通过学校官方统一身份认证页面提交。凭据仅使用 Android Keystore 加密保存在本机，用于登录失效后的后台自动重试。");
        subtitle.setTextColor(getColor(R.color.native_text_secondary));
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
        builtInTrustDeviceCheck.setTextColor(getColor(R.color.native_text_primary));
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
        builtInLoginButton.setBackground(roundBackground(getColor(R.color.native_brand), 14));
        builtInLoginButton.setOnClickListener(view -> {
            if (builtInLoginChallengeVisible) submitBuiltInVerificationCode();
            else submitBuiltInCredentials(false);
        });
        content.addView(builtInLoginButton, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(52)));

        builtInMobileLoginButton = new Button(this);
        builtInMobileLoginButton.setText("使用手机验证码登录");
        builtInMobileLoginButton.setAllCaps(false);
        builtInMobileLoginButton.setTextSize(13);
        builtInMobileLoginButton.setTextColor(getColor(R.color.native_brand_text));
        builtInMobileLoginButton.setBackground(roundBackground(getColor(R.color.native_surface), 14));
        builtInMobileLoginButton.setContentDescription("在内置登录流程中使用手机验证码登录");
        builtInMobileLoginButton.setOnClickListener(view -> startBuiltInMobileLogin());
        LinearLayout.LayoutParams mobileLoginParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(44));
        mobileLoginParams.setMargins(0, dp(8), 0, 0);
        content.addView(builtInMobileLoginButton, mobileLoginParams);

        LinearLayout manualNavigationRow = new LinearLayout(this);
        manualNavigationRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams manualNavigationParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(44));
        manualNavigationParams.setMargins(0, dp(8), 0, 0);

        builtInOpenAcademicButton = new Button(this);
        builtInOpenAcademicButton.setText("打开教务系统原网页");
        builtInOpenAcademicButton.setAllCaps(false);
        builtInOpenAcademicButton.setTextSize(12);
        builtInOpenAcademicButton.setTextColor(getColor(R.color.native_brand_text));
        builtInOpenAcademicButton.setBackground(roundBackground(getColor(R.color.native_surface), 14));
        builtInOpenAcademicButton.setContentDescription("打开教务系统原网页");
        builtInOpenAcademicButton.setOnClickListener(view -> openOfficialAcademicPortal());
        manualNavigationRow.addView(builtInOpenAcademicButton, new LinearLayout.LayoutParams(0, dp(44), 1f));

        builtInCloseLoginButton = new Button(this);
        builtInCloseLoginButton.setText("关闭并返回主页");
        builtInCloseLoginButton.setAllCaps(false);
        builtInCloseLoginButton.setTextSize(12);
        builtInCloseLoginButton.setTextColor(getColor(R.color.native_text_secondary));
        builtInCloseLoginButton.setBackground(roundBackground(getColor(R.color.native_surface_subtle), 14));
        builtInCloseLoginButton.setContentDescription("关闭认证页并返回执掌东大主页");
        builtInCloseLoginButton.setOnClickListener(view -> closePortalLoginToDashboard());
        LinearLayout.LayoutParams closeLoginParams = new LinearLayout.LayoutParams(0, dp(44), 1f);
        closeLoginParams.setMargins(dp(8), 0, 0, 0);
        manualNavigationRow.addView(builtInCloseLoginButton, closeLoginParams);
        content.addView(manualNavigationRow, manualNavigationParams);

        builtInLoginStatus = new TextView(this);
        builtInLoginStatus.setTextColor(getColor(R.color.native_text_tertiary));
        builtInLoginStatus.setTextSize(12);
        builtInLoginStatus.setLineSpacing(0, 1.25f);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        statusParams.setMargins(0, dp(12), 0, dp(8));
        content.addView(builtInLoginStatus, statusParams);

        TextView fallback = new TextView(this);
        fallback.setText("手机验证码属于内置登录的补充验证方式。需要时可点击上面的按钮；图形验证码、短信发送、Cookie 和跳转仍由学校官方页面完成，验证码仅提交给学校页面，应用不会保存。如果学校已经登录但仍停在认证页，可使用上方按钮手动打开原网页或返回主页。");
        fallback.setTextColor(getColor(R.color.native_text_tertiary));
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
            builtInLoginStatus.setTextColor(getColor(R.color.native_error));
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
        field.setBackground(roundBackground(getColor(R.color.native_surface), 12));
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
        boolean darkMode = isDarkMode();
        int systemUiVisibility = darkMode ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (!darkMode && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
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

    private void enterBackgroundLoginMode() {
        if (portalWebView == null) return;
        portalWebView.setBackgroundInputBlocked(true);
        portalWebView.clearFocus();
        portalWebView.setFocusable(false);
        portalWebView.setFocusableInTouchMode(false);
        portalWebView.setClickable(false);
        // 保持真实可见 WebView 的 JS/重定向调度，但让它不可见且不再接收输入。
        portalWebView.setAlpha(0.01f);
        portalWebView.setVisibility(View.VISIBLE);
        portalWebView.bringToFront();
    }

    private void exitBackgroundLoginMode() {
        if (portalWebView == null) return;
        portalWebView.setBackgroundInputBlocked(false);
        portalWebView.clearFocus();
        portalWebView.setFocusable(true);
        portalWebView.setFocusableInTouchMode(true);
        portalWebView.setClickable(true);
        portalWebView.setAlpha(1f);
    }

    /**
     * 后台登录会把 WebView 调到最前面以承载重定向；进入人工验证时，
     * 必须把原生控件重新放回 WebView 之上，否则复选框和确认按钮会被整页遮住。
     */
    private void restorePortalOverlayOrder() {
        if (root == null) return;
        if (loginMethodBar != null) loginMethodBar.bringToFront();
        if (builtInLoginPanel != null) builtInLoginPanel.bringToFront();
        if (portalActionButton != null) portalActionButton.bringToFront();
        if (portalQrActionButton != null) portalQrActionButton.bringToFront();
        if (interactiveTrustDevicePanel != null) interactiveTrustDevicePanel.bringToFront();
    }

    private void showPortal() {
        showPortal(false);
    }

    private void showPortal(boolean forceLoginPage) {
        runOnUiThread(() -> {
            dashboardVisible = false;
            exitBackgroundLoginMode();
            String currentUrl = portalWebView == null ? "" : portalWebView.getUrl();
            if (forceLoginPage
                    || currentUrl == null || currentUrl.isEmpty()
                    || !isPortalPageUrl(currentUrl)
                    || isEcodeTargetReadyUrl(currentUrl)) {
                academicEcodeRedirectAttempts = 0;
                academicCasTicketBounceAttempts = 0;
                academicHomeNotFoundAttempts = 0;
                portalWebView.loadUrl(academicViewerEntryUrl());
            }
            portalWebView.setVisibility(View.VISIBLE);
            dashboardHome.setVisibility(View.GONE);
            if (academicPortalViewerActive) applyAcademicPortalViewerUi();
            else applyPortalLoginChrome();
            restorePortalOverlayOrder();
            updatePortalActionLabel(portalWebView.getUrl());
            if (portalQrActionButton != null) {
                showQrActionLoadingIfNeeded(portalWebView.getUrl());
            }
            cookieManager.flush();
            portalWebView.postDelayed(this::installPortalQrCapture, 180);
            if (LOGIN_METHOD_MOBILE.equals(loginMethodForCurrentPortal) || builtInMobileLoginMode) {
                portalWebView.postDelayed(this::activatePortalMobileLogin, BUILT_IN_LOGIN_TAB_SETTLE_MS);
            }
        });
    }

    private void openPortalForReauthentication() {
        runOnUiThread(() -> {
            cancelAutomaticBackgroundLogin();
            academicPortalViewerActive = true;
            academicEcodeRedirectAttempts = 0;
            academicCasTicketBounceAttempts = 0;
            academicHomeNotFoundAttempts = 0;
            clearPendingQrUrl();
            // 校园网必须先进入 /jwapp/ 换票；直接打开 /jwapp/sys/homeapp 会让
            // CAS 把 ticket 送到 404 页。WebVPN 仍打开 homeapp。不要打开
            // WebVPN 根地址（登录后经常落到校园门户或 E 码通）。
            if (portalWebView != null) {
                portalWebView.loadUrl(academicViewerEntryUrl());
            }
            showPortal(false);
        });
    }

    /**
     * 用户明确选择关闭当前认证页时，回到应用主页并让主页自己重新确认
     * 教务 Cookie。不能把“返回主页”误当成登录成功，失效时仍会显示缓存
     * 并按现有流程提示重新登录。
     */
    private void closePortalLoginToDashboard() {
        // 学校登录成功后有时仍把 WebView 留在 /tpass/login。此时不能先
        // cancelAutomaticBackgroundLogin()，否则会清掉当前手动登录事务，
        // 也就没有机会保存用户刚刚确认过的加密账号密码。
        if (builtInLoginSubmissionPending && !backgroundLoginInProgress) {
            verifyBuiltInLoginSession(activeLoginOperationId, "manual-login-close", true);
            return;
        }
        closePortalLoginToDashboardNow();
    }

    private void closePortalLoginToDashboardNow() {
        cancelAutomaticBackgroundLogin();
        clearPendingQrUrl();
        showDashboard();
        if (root != null) {
            root.post(() -> {
                requestDashboardRefreshAfterSessionProbe(true);
                requestAcademicSessionProbe("manual-login-close", 0L, true);
            });
        }
    }

    /**
     * 从内置登录面板切换到学校官方认证页。这里不改变用户保存的默认
     * 登录方式，只是提供一次性的原网页入口，便于处理“已经登录但页面
     * 没有自动跳转”的状态。
     */
    private void openOfficialAcademicPortal() {
        runOnUiThread(() -> {
            cancelAutomaticBackgroundLogin();
            academicPortalViewerActive = true;
            academicEcodeRedirectAttempts = 0;
            clearPendingQrUrl();
            loginMethodForCurrentPortal = LOGIN_METHOD_PASSWORD;
            showPortal(true);
            if (portalWebView != null) {
                portalWebView.postDelayed(() -> {
                    if (portalWebView == null
                            || !LOGIN_METHOD_PASSWORD.equals(loginMethodForCurrentPortal)) return;
                    if (!isPortalLoginPage(portalWebView.getUrl())) return;
                    String script = "(function(){var node=document.getElementById('password_login');"
                            + "if(node&&typeof node.click==='function'){node.click();return true;}return false;})();";
                    portalWebView.evaluateJavascript(script, null);
                }, 320L);
            }
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
            cancelAutomaticBackgroundLogin();
            clearPendingQrUrl();
            showPortal();
            portalWebView.loadUrl(url);
        });
    }

    private void cancelAutomaticBackgroundLogin() {
        sessionEpoch += 1L;
        activeLoginOperationId = ++loginOperationSequence;
        exitBackgroundLoginMode();
        builtInLoginSubmissionPending = false;
        builtInLoginAwaitingPage = false;
        builtInLoginChallengeVisible = false;
        builtInInteractiveChallengeVisible = false;
        builtInMobileLoginMode = false;
        builtInLoginPortalProbeScheduled = false;
        builtInLoginSessionProbeInProgress = false;
        pendingBuiltInPassword = "";
        backgroundLoginForEcode = false;
        pendingEcodeLoginUrl = "";
        ecodeReloadAfterBackgroundLogin = false;
        academicCasTicketBounceAttempts = 0;
        if (interactiveTrustDevicePanel != null) interactiveTrustDevicePanel.setVisibility(View.GONE);
        if (backgroundLoginInProgress) {
            backgroundLoginInProgress = false;
        }
    }

    private void showDashboard() {
        runOnUiThread(() -> {
            dashboardVisible = true;
            builtInMobileLoginMode = false;
            academicPortalViewerActive = false;
            academicEcodeRedirectAttempts = 0;
            exitBackgroundLoginMode();
            // 这个值只是上次成功会话的提示，不能因为展示缓存首页就把失效
            // Cookie 标成有效；真实状态由轻量 WebVPN 探测或业务响应确认。
            cookieManager.flush();
            hidePortalOverlays();
            if (portalWebView != null) portalWebView.setVisibility(View.GONE);
            dashboardHome.setVisibility(View.VISIBLE);
            if (!dashboardLoaded) {
                dashboardLoaded = true;
                ecodeWebView.loadUrl(ecodeUrl());
                dashboardWebView.loadUrl(DASHBOARD_URL);
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

    private boolean isPersistentLoginMethod(String method) {
        return LOGIN_METHOD_BUILT_IN.equals(method)
                || LOGIN_METHOD_PASSWORD.equals(method)
                || LOGIN_METHOD_WECHAT.equals(method);
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

    private String diagnosticTimestamp(long timeMillis) {
        if (timeMillis <= 0) return "未记录";
        return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS Z", Locale.ROOT)
                .format(new Date(timeMillis));
    }

    private String sanitizeDiagnosticText(String value) {
        if (value == null || value.trim().isEmpty()) return "";
        String text = value.replace('\n', ' ').replace('\r', ' ').replaceAll("\\s+", " ").trim();
        text = text.replaceAll(
                "(?i)(password|passwd|pwd|token|ticket|authorization|cookie|session|mcode|验证码|密码|学号|username|user)\\s*[=:：]\\s*[^\\s,;；)）]+",
                "$1=<已脱敏>"
        );
        return text.length() > 500 ? text.substring(0, 500) + "…" : text;
    }

    private String sanitizeDiagnosticUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return "未记录";
        try {
            Uri parsed = Uri.parse(rawUrl);
            String scheme = parsed.getScheme() == null ? "" : parsed.getScheme();
            String host = parsed.getHost() == null ? "" : parsed.getHost();
            String path = parsed.getPath() == null || parsed.getPath().isEmpty() ? "/" : parsed.getPath();
            StringBuilder result = new StringBuilder();
            if (!scheme.isEmpty()) result.append(scheme).append("://");
            if (!host.isEmpty()) result.append(host);
            result.append(path);
            String query = parsed.getEncodedQuery();
            if (query != null && !query.isEmpty()) {
                result.append("?");
                String[] parts = query.split("&");
                for (int index = 0; index < parts.length; index += 1) {
                    if (index > 0) result.append("&");
                    String key = parts[index];
                    int equals = key.indexOf('=');
                    if (equals >= 0) key = key.substring(0, equals);
                    result.append(key.isEmpty() ? "<参数>" : key).append("=<已脱敏>");
                }
            }
            if (parsed.getEncodedFragment() != null) result.append("#<已脱敏>");
            return result.toString();
        } catch (RuntimeException error) {
            return "<无法解析的地址>";
        }
    }

    private void beginLoginDiagnostics(boolean background, boolean credentialsAvailable) {
        long now = System.currentTimeMillis();
        synchronized (loginDiagnosticLock) {
            loginDiagnosticEvents.clear();
            loginDiagnosticStartedAt = now;
            loginDiagnosticFinishedAt = 0L;
            loginDiagnosticAttemptNumber += 1;
            loginDiagnosticStatus = "running";
            loginDiagnosticScope = background && backgroundLoginForEcode ? "ecode" : "academic";
            loginDiagnosticBackground = background;
            loginDiagnosticPhase = "starting";
            loginDiagnosticLastUrl = "";
            loginDiagnosticLastTitle = "";
            loginDiagnosticLastMessage = "";
            loginDiagnosticLastHttpStatus = -1;
            loginDiagnosticLastHttpUrl = "";
            loginDiagnosticLastWebError = "";
            loginDiagnosticLastWebErrorUrl = "";
            loginDiagnosticCredentialsAvailable = credentialsAvailable;
            loginDiagnosticTrustDeviceRequested = !background
                    && builtInTrustDeviceCheck != null
                    && builtInTrustDeviceCheck.isChecked();
        }
        recordLoginDiagnostic(
                "start",
                "trigger=" + (background ? "background" : "manual")
                        + " scope=" + loginDiagnosticScope
                        + " encryptedCredentials=" + (credentialsAvailable ? "present" : "missing")
                        + " trustDevice=" + (loginDiagnosticTrustDeviceRequested ? "enabled" : "disabled/not-applicable")
        );
    }

    private void recordLoginDiagnostic(String phase, String detail) {
        long now = System.currentTimeMillis();
        synchronized (loginDiagnosticLock) {
            if (loginDiagnosticStartedAt <= 0L) {
                loginDiagnosticStartedAt = now;
                loginDiagnosticStatus = "running";
            }
            loginDiagnosticPhase = phase == null || phase.trim().isEmpty() ? "unknown" : phase.trim();
            loginDiagnosticLastMessage = sanitizeDiagnosticText(detail);
            long elapsed = Math.max(0L, now - loginDiagnosticStartedAt);
            String event = "[" + diagnosticTimestamp(now) + "] +" + elapsed + "ms ["
                    + loginDiagnosticPhase + "] " + loginDiagnosticLastMessage;
            while (loginDiagnosticEvents.size() >= LOGIN_DIAGNOSTIC_EVENT_MAX) {
                loginDiagnosticEvents.removeFirst();
            }
            loginDiagnosticEvents.addLast(event);
        }
    }

    private void recordLoginDiagnosticPage(String phase, WebView view, String url) {
        String safeUrl = sanitizeDiagnosticUrl(url);
        String title = view == null ? "" : view.getTitle();
        String safeTitle = sanitizeDiagnosticText(title);
        synchronized (loginDiagnosticLock) {
            loginDiagnosticLastUrl = safeUrl;
            loginDiagnosticLastTitle = safeTitle;
        }
        recordLoginDiagnostic(
                phase,
                "url=" + safeUrl + " title=" + (safeTitle.isEmpty() ? "<无标题>" : safeTitle)
        );
    }

    private void updateLoginDiagnosticHttpError(int status, String url) {
        synchronized (loginDiagnosticLock) {
            loginDiagnosticLastHttpStatus = status;
            loginDiagnosticLastHttpUrl = sanitizeDiagnosticUrl(url);
        }
    }

    private void updateLoginDiagnosticWebError(String message, String url) {
        synchronized (loginDiagnosticLock) {
            loginDiagnosticLastWebError = sanitizeDiagnosticText(message);
            loginDiagnosticLastWebErrorUrl = sanitizeDiagnosticUrl(url);
        }
    }

    private String appVersionForDiagnostics() {
        try {
            android.content.pm.PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            return info.versionName == null ? "未知" : info.versionName;
        } catch (Exception ignored) {
            return "未知";
        }
    }

    private String webViewVersionForDiagnostics() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return "系统未提供版本信息";
        try {
            android.content.pm.PackageInfo info = WebView.getCurrentWebViewPackage();
            if (info == null) return "未知";
            return info.packageName + " " + (info.versionName == null ? "未知" : info.versionName);
        } catch (RuntimeException ignored) {
            return "读取失败";
        }
    }

    private String buildLoginDiagnostics() {
        synchronized (loginDiagnosticLock) {
            if (loginDiagnosticStartedAt <= 0L && lastLoginDiagnostics != null && !lastLoginDiagnostics.isEmpty()) {
                return lastLoginDiagnostics;
            }
            long end = loginDiagnosticFinishedAt > 0L ? loginDiagnosticFinishedAt : System.currentTimeMillis();
            long duration = loginDiagnosticStartedAt > 0L
                    ? Math.max(0L, end - loginDiagnosticStartedAt)
                    : 0L;
            StringBuilder report = new StringBuilder();
            report.append("执掌东大 Android 登录诊断报告\n");
            report.append("说明：以下内容已脱敏，不包含密码、验证码、Cookie 值、Token 或完整查询参数。\n\n");
            report.append("【运行环境】\n");
            report.append("应用版本：").append(appVersionForDiagnostics()).append("\n");
            report.append("Android：").append(Build.VERSION.RELEASE).append(" (API ").append(Build.VERSION.SDK_INT).append(")\n");
            report.append("设备：").append(Build.MANUFACTURER).append(" ").append(Build.MODEL).append("\n");
            report.append("WebView：").append(webViewVersionForDiagnostics()).append("\n");
            report.append("生成时间：").append(diagnosticTimestamp(System.currentTimeMillis())).append("\n\n");
            report.append("【登录尝试】\n");
            report.append("范围：").append("ecode".equals(loginDiagnosticScope) ? "E 码通" : "教务系统").append("\n");
            report.append("触发方式：").append(loginDiagnosticBackground ? "后台自动登录" : "内置登录/手动触发").append("\n");
            report.append("状态：").append(loginDiagnosticStatus).append("\n");
            report.append("当前阶段：").append(loginDiagnosticPhase).append("\n");
            report.append("尝试编号：").append(loginDiagnosticAttemptNumber).append("\n");
            report.append("开始时间：").append(diagnosticTimestamp(loginDiagnosticStartedAt)).append("\n");
            report.append("结束时间：").append(diagnosticTimestamp(loginDiagnosticFinishedAt)).append("\n");
            report.append("耗时：").append(duration).append(" ms\n");
            report.append("本机加密凭据：").append(loginDiagnosticCredentialsAvailable ? "存在" : "不存在/不可用").append("\n");
            report.append("本次信任设备选项：").append(loginDiagnosticTrustDeviceRequested ? "开启" : "关闭或不适用").append("\n");
            report.append("最终错误：").append(loginDiagnosticLastMessage.isEmpty() ? "未记录" : loginDiagnosticLastMessage).append("\n\n");
            report.append("【页面与网络摘要】\n");
            report.append("最后页面：").append(loginDiagnosticLastUrl.isEmpty() ? "未记录" : loginDiagnosticLastUrl).append("\n");
            report.append("页面标题：").append(loginDiagnosticLastTitle.isEmpty() ? "未记录" : loginDiagnosticLastTitle).append("\n");
            report.append("最后主文档 HTTP：").append(loginDiagnosticLastHttpStatus < 0 ? "未记录" : loginDiagnosticLastHttpStatus).append("\n");
            report.append("HTTP 地址：").append(loginDiagnosticLastHttpUrl.isEmpty() ? "未记录" : loginDiagnosticLastHttpUrl).append("\n");
            report.append("最后 WebView 错误：").append(loginDiagnosticLastWebError.isEmpty() ? "未记录" : loginDiagnosticLastWebError).append("\n");
            report.append("WebView 错误地址：").append(loginDiagnosticLastWebErrorUrl.isEmpty() ? "未记录" : loginDiagnosticLastWebErrorUrl).append("\n\n");
            report.append("【事件时间线】\n");
            if (loginDiagnosticEvents.isEmpty()) {
                report.append("未记录到登录事件。\n");
            } else {
                for (String event : loginDiagnosticEvents) report.append(event).append("\n");
            }
            String result = report.toString();
            return result.length() > LOGIN_DIAGNOSTICS_MAX_CHARS
                    ? result.substring(0, LOGIN_DIAGNOSTICS_MAX_CHARS) + "\n[报告已截断]"
                    : result;
        }
    }

    private void finishLoginDiagnosticsFailure(String message) {
        synchronized (loginDiagnosticLock) {
            if (loginDiagnosticStartedAt <= 0L) {
                loginDiagnosticStartedAt = System.currentTimeMillis();
            }
            loginDiagnosticStatus = "failed";
            loginDiagnosticPhase = "failed";
            loginDiagnosticFinishedAt = System.currentTimeMillis();
            loginDiagnosticLastMessage = sanitizeDiagnosticText(message);
            String report = buildLoginDiagnostics();
            lastLoginDiagnostics = report;
            if (preferences != null) preferences.edit().putString(LAST_LOGIN_DIAGNOSTICS, report).apply();
        }
    }

    private void finishLoginDiagnosticsSuccess() {
        synchronized (loginDiagnosticLock) {
            loginDiagnosticStatus = "success";
            loginDiagnosticPhase = "success";
            loginDiagnosticFinishedAt = System.currentTimeMillis();
            lastLoginDiagnostics = "";
            if (preferences != null) preferences.edit().remove(LAST_LOGIN_DIAGNOSTICS).apply();
        }
    }

    private boolean copyLoginDiagnosticsToClipboard() {
        String report = buildLoginDiagnostics();
        ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        if (clipboard == null) return false;
        clipboard.setPrimaryClip(ClipData.newPlainText("执掌东大登录诊断信息", report));
        return true;
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

    private String normalizeAccessNetworkMode(String value) {
        if (ACCESS_NETWORK_CAMPUS.equals(value) || ACCESS_NETWORK_WEBVPN.equals(value)) return value;
        return ACCESS_NETWORK_AUTO;
    }

    private String normalizeAccessNetworkResolved(String value) {
        return ACCESS_NETWORK_CAMPUS.equals(value) ? ACCESS_NETWORK_CAMPUS : ACCESS_NETWORK_WEBVPN;
    }

    private boolean isCampusAccess() {
        return ACCESS_NETWORK_CAMPUS.equals(accessNetworkResolved);
    }

    private String academicRootUrl() {
        return isCampusAccess() ? CAMPUS_ACADEMIC_HTTPS : PORTAL_URL;
    }

    private String academicRootFallbackUrl() {
        return isCampusAccess() ? CAMPUS_ACADEMIC_HTTP : PORTAL_FALLBACK_URL;
    }

    private String academicHomeUrl() {
        return academicRootUrl() + "/jwapp/sys/homeapp";
    }

    private String academicHomeFallbackUrl() {
        return academicRootFallbackUrl() + "/jwapp/sys/homeapp";
    }

    private String academicHomeIndexUrl() {
        return academicHomeUrl() + "/*default/index.do";
    }

    private String academicHomeIndexFallbackUrl() {
        return academicHomeFallbackUrl() + "/*default/index.do";
    }

    /**
     * 从查询台打开原教务系统：校园网先走 EMAP 换票入口，换完再进 homeapp。
     */
    private String academicViewerEntryUrl() {
        return isCampusAccess() ? academicCasCallbackUrl() : academicHomeUrl();
    }

    /**
     * EMAP 的 CAS 过滤器在 /jwapp/，不在 /jwapp/sys/homeapp。
     * 把 homeapp 当作 service 时，认证中心会带着 ticket 跳到 404 页，会话无法生效。
     */
    private String academicCasCallbackUrl() {
        return academicRootUrl() + "/jwapp/";
    }

    private String campusAuthLoginUrl(String service) {
        try {
            return "https://pass.neu.edu.cn/tpass/login?service="
                    + java.net.URLEncoder.encode(service, "UTF-8");
        } catch (Exception ignored) {
            return "https://pass.neu.edu.cn/tpass/login";
        }
    }

    private String academicLoginEntryUrl() {
        if (isCampusAccess()) {
            return campusAuthLoginUrl(academicCasCallbackUrl());
        }
        return academicHomeUrl();
    }

    private String academicCasTicketValue(String url) {
        if (url == null || url.isEmpty()) return "";
        try {
            String ticket = Uri.parse(url).getQueryParameter("ticket");
            return ticket == null ? "" : ticket.trim();
        } catch (RuntimeException ignored) {
            return "";
        }
    }

    private boolean isAcademicCasTicketUrl(String url) {
        return isPortalPageUrl(url) && url != null && url.contains("/jwapp/")
                && !academicCasTicketValue(url).isEmpty();
    }

    private boolean isAcademicCasCallbackUrl(String url) {
        if (url == null || !isPortalPageUrl(url) || isPortalLoginPage(url)) return false;
        try {
            String path = Uri.parse(url).getPath();
            if (path == null) return false;
            String normalized = path.replaceAll("/+$", "");
            return normalized.endsWith("/jwapp");
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private String rewriteCampusAuthServiceUrl(String url) {
        if (!isCampusAccess() || url == null || url.isEmpty()) return url;
        if (!url.contains("/tpass/login") || !url.contains("pass.neu.edu.cn")) return url;
        String service = extractLoginService(url);
        if (service.isEmpty()) {
            if (backgroundLoginForEcode) return url;
            if (builtInLoginSubmissionPending || academicPortalViewerActive) {
                return campusAuthLoginUrl(academicCasCallbackUrl());
            }
            return url;
        }
        if (!service.contains("jwxt.neu.edu.cn")) return url;
        if (isAcademicCasCallbackUrl(service)) return url;
        return campusAuthLoginUrl(academicCasCallbackUrl());
    }

    private boolean handleCampusCasTicketLanding(String url) {
        if (portalWebView == null || !isCampusAccess() || !isAcademicCasTicketUrl(url)) return false;
        if (!isAcademicCasCallbackUrl(url)
                && academicCasTicketBounceAttempts < ACADEMIC_CAS_TICKET_BOUNCE_MAX) {
            academicCasTicketBounceAttempts += 1;
            recordLoginDiagnostic(
                    "cas-ticket-wrong-path",
                    "attempt=" + academicCasTicketBounceAttempts
                            + " CAS ticket 落到了没有换票过滤器的页面，改用 /jwapp/ 重新换票 from="
                            + sanitizeDiagnosticUrl(url)
            );
            portalWebView.stopLoading();
            portalWebView.loadUrl(academicLoginEntryUrl());
            return true;
        }
        recordLoginDiagnostic("cas-ticket-pending", "等待教务入口核销 CAS ticket");
        if (builtInLoginSubmissionPending) {
            long operationId = activeLoginOperationId;
            portalWebView.postDelayed(() -> {
                if (!isCurrentLoginOperation(operationId) || portalWebView == null) return;
                verifyBuiltInLoginSession(operationId, "cas-ticket-confirm", false);
            }, 450L);
        }
        return true;
    }

    private boolean recoverCampusAcademicNotFound(WebView view, String url, int status) {
        if (!isCampusAccess() || view == null || url == null) return false;
        if (isPortalLoginPage(url) || isAcademicCasTicketUrl(url)) return false;
        boolean looksMissing = status == 404;
        if (!looksMissing) {
            String title = view.getTitle();
            looksMissing = title != null && title.trim().equals("404");
        }
        if (!looksMissing) return false;
        if (!isAcademicHomeAppUrl(url) && !isBareAcademicShellUrl(url)) return false;
        if (academicHomeNotFoundAttempts >= ACADEMIC_HOME_NOT_FOUND_MAX) {
            recordLoginDiagnostic("portal-viewer", "校园网教务首页连续 404，已停止改写入口");
            return false;
        }
        academicHomeNotFoundAttempts += 1;
        String target;
        if (isBareAcademicShellUrl(url) && url.startsWith("https://")) {
            target = academicRootFallbackUrl() + "/jwapp/";
        } else if (isAcademicHomeAppUrl(url) && !url.contains("*default")) {
            target = url.startsWith("https://") ? academicHomeFallbackUrl() : academicHomeIndexUrl();
        } else {
            target = academicHomeIndexFallbackUrl();
        }
        recordLoginDiagnostic(
                "portal-viewer",
                "campus-404-fallback attempt=" + academicHomeNotFoundAttempts
                        + " from=" + sanitizeDiagnosticUrl(url)
                        + " to=" + sanitizeDiagnosticUrl(target)
        );
        view.stopLoading();
        view.loadUrl(target);
        return true;
    }

    private String ecodeUrl() {
        return isCampusAccess() ? CAMPUS_ECODE_URL : WEBVPN_ECODE_URL;
    }

    private void restoreAccessNetworkPreference() {
        if (preferences == null) return;
        accessNetworkMode = normalizeAccessNetworkMode(preferences.getString(ACCESS_NETWORK_MODE, ACCESS_NETWORK_AUTO));
        String storedResolved = normalizeAccessNetworkResolved(preferences.getString(ACCESS_NETWORK_RESOLVED, ACCESS_NETWORK_WEBVPN));
        if (ACCESS_NETWORK_CAMPUS.equals(accessNetworkMode) || ACCESS_NETWORK_WEBVPN.equals(accessNetworkMode)) {
            accessNetworkResolved = accessNetworkMode;
        } else {
            accessNetworkResolved = storedResolved;
        }
    }

    private void persistAccessNetworkPreference() {
        if (preferences == null) return;
        preferences.edit()
                .putString(ACCESS_NETWORK_MODE, accessNetworkMode)
                .putString(ACCESS_NETWORK_RESOLVED, accessNetworkResolved)
                .apply();
    }

    private void startAccessNetworkResolve() {
        if (ACCESS_NETWORK_CAMPUS.equals(accessNetworkMode) || ACCESS_NETWORK_WEBVPN.equals(accessNetworkMode)) {
            accessNetworkResolved = accessNetworkMode;
            accessNetworkProbeDone = true;
            persistAccessNetworkPreference();
            return;
        }
        networkExecutor.execute(() -> {
            boolean campusReachable = probeAccessOriginReachable(
                    CAMPUS_ACADEMIC_HTTPS + "/jwapp/sys/homeapp/api/home/currentUser.do", 2200)
                    || probeAccessOriginReachable(
                    CAMPUS_ACADEMIC_HTTP + "/jwapp/sys/homeapp/api/home/currentUser.do", 1800);
            runOnUiThread(() -> applyResolvedAccessNetwork(
                    ACCESS_NETWORK_AUTO,
                    campusReachable ? ACCESS_NETWORK_CAMPUS : ACCESS_NETWORK_WEBVPN,
                    true
            ));
        });
    }

    private boolean probeAccessOriginReachable(String urlText, int timeoutMs) {
        AcademicProbeResult result = probeAcademicEndpoint(urlText, timeoutMs);
        return result.kind == AcademicProbeResult.HEALTHY || result.kind == AcademicProbeResult.INVALID;
    }

    private void applyResolvedAccessNetwork(String mode, String resolved, boolean notifyDashboard) {
        String previous = accessNetworkResolved;
        accessNetworkMode = normalizeAccessNetworkMode(mode);
        accessNetworkResolved = normalizeAccessNetworkResolved(resolved);
        accessNetworkProbeDone = true;
        persistAccessNetworkPreference();
        if (!accessNetworkResolved.equals(previous) && dashboardLoaded && ecodeWebView != null) {
            ecodeWebView.stopLoading();
            ecodeWebView.loadUrl(ecodeUrl());
        }
        if (notifyDashboard) notifyDashboardAccessNetwork();
        completeDashboardHandshakeIfReady();
    }

    private void notifyDashboardAccessNetwork() {
        if (dashboardWebView == null || !dashboardLoaded) return;
        String script = "window.__androidAccessNetworkResolved && window.__androidAccessNetworkResolved("
                + JSONObject.quote(accessNetworkMode) + ","
                + JSONObject.quote(accessNetworkResolved) + ");";
        dashboardWebView.evaluateJavascript(script, null);
    }

    private void reloadAccessNetworkEndpoints() {
        runOnUiThread(() -> {
            if (ecodeWebView != null && dashboardLoaded) {
                ecodeWebView.stopLoading();
                ecodeWebView.loadUrl(ecodeUrl());
            }
            notifyDashboardAccessNetwork();
            requestDashboardRefreshAfterSessionProbe(true);
            requestAcademicSessionProbe("access-network-change", 0L, true);
        });
    }

    private boolean isAllowedSchoolHost(String host) {
        if (host == null) return false;
        String normalized = host.toLowerCase(java.util.Locale.ROOT);
        return "webvpn.neu.edu.cn".equals(normalized)
                || "jwxt.neu.edu.cn".equals(normalized)
                || CAMPUS_AUTH_HOST.equals(normalized)
                || "ecode.neu.edu.cn".equals(normalized);
    }

    private boolean isAllowedNativeRequestUrl(String urlText) {
        if (urlText == null || urlText.isEmpty()) return false;
        try {
            URL url = new URL(urlText);
            String protocol = url.getProtocol() == null ? "" : url.getProtocol().toLowerCase(java.util.Locale.ROOT);
            String host = url.getHost();
            if (!isAllowedSchoolHost(host)) return false;
            if ("webvpn.neu.edu.cn".equalsIgnoreCase(host)) {
                return "https".equals(protocol) && urlText.startsWith("https://webvpn.neu.edu.cn/");
            }
            if ("jwxt.neu.edu.cn".equalsIgnoreCase(host)) {
                return "https".equals(protocol) || "http".equals(protocol);
            }
            return "https".equals(protocol);
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isPortalPageUrl(String url) {
        if (url == null || url.isEmpty()) return false;
        try {
            URL parsed = new URL(url);
            String host = parsed.getHost() == null ? "" : parsed.getHost().toLowerCase(java.util.Locale.ROOT);
            return "webvpn.neu.edu.cn".equals(host)
                    || "jwxt.neu.edu.cn".equals(host)
                    || CAMPUS_AUTH_HOST.equals(host);
        } catch (Exception ignored) {
            return url.startsWith("https://webvpn.neu.edu.cn/")
                    || url.startsWith("https://jwxt.neu.edu.cn/")
                    || url.startsWith("http://jwxt.neu.edu.cn/")
                    || url.startsWith("https://pass.neu.edu.cn/");
        }
    }

    private boolean isPortalLoginPage(String url) {
        if (url == null) return false;
        return url.contains("/tpass/login") || url.contains("pass.neu.edu.cn/login");
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
            StringBuilder target = new StringBuilder();
            if (isCampusAccess() || (poll.getHost() != null && poll.getHost().equalsIgnoreCase(CAMPUS_AUTH_HOST))) {
                target.append("https://pass.neu.edu.cn").append(targetPath.contains("/tpass/")
                        ? targetPath.substring(targetPath.indexOf("/tpass/"))
                        : "/tpass/qyQrLogin");
                target.append("?uuid=").append(Uri.encode(uuid));
            } else {
                target.append("https://webvpn.neu.edu.cn").append(targetPath).append("?");
                if (!marker.isEmpty()) target.append(marker).append("&");
                target.append("uuid=").append(Uri.encode(uuid));
            }
            if (service != null && !service.isEmpty()) {
                target.append(target.toString().contains("?") ? "&" : "?").append("service=").append(Uri.encode(service));
            }
            return target.toString();
        } catch (RuntimeException ignored) {
            return "";
        }
    }

    private void updatePortalActionLabel(String url) {
        if (portalActionButton == null) return;
        if (builtInInteractiveChallengeVisible) {
            portalActionButton.setText("验证完成，进入执掌东大");
            portalActionButton.setContentDescription("完成学校图形验证码和短信验证后确认登录");
            return;
        }
        if (builtInMobileLoginMode && isPortalLoginPage(url)) {
            portalActionButton.setText("返回内置账号密码登录");
            portalActionButton.setContentDescription("返回内置账号密码登录");
            return;
        }
        if (hasSavedQrImage()) {
            portalActionButton.setText("删除刚刚的二维码图片并进入主界面");
        } else if (shouldShowAcademicPortalViewer(url)) {
            portalActionButton.setText("返回执掌东大");
            portalActionButton.setContentDescription("关闭原教务系统页面并返回执掌东大");
        } else {
            portalActionButton.setText(isPortalLoginPage(url)
                    ? "关闭认证页，返回主页"
                    : "已登录，进入执掌东大");
            portalActionButton.setContentDescription(isPortalLoginPage(url)
                    ? "关闭认证页并返回执掌东大主页"
                    : "进入执掌东大主页");
        }
    }

    private void installPortalQrCapture() {
        if (portalWebView == null || !isPortalLoginPage(portalWebView.getUrl())) return;
        String script = QR_CAPTURE_SCRIPT.replace(
                "__AUTO_QR__",
                Boolean.toString(LOGIN_METHOD_WECHAT.equals(loginMethodForCurrentPortal))
        );
        portalWebView.evaluateJavascript(script, null);
    }

    private boolean shouldShowAcademicPortalViewer(String url) {
        if (builtInLoginSubmissionPending || builtInInteractiveChallengeVisible || builtInMobileLoginMode) {
            return false;
        }
        if (isPortalLoginPage(url)) return false;
        if (isAcademicPortalReadyUrl(url)) return true;
        return academicPortalViewerActive && !isEcodeTargetReadyUrl(url);
    }

    private void applyAcademicPortalViewerUi() {
        academicPortalViewerActive = true;
        if (loginMethodBar != null) loginMethodBar.setVisibility(View.GONE);
        if (builtInLoginPanel != null) builtInLoginPanel.setVisibility(View.GONE);
        if (interactiveTrustDevicePanel != null) interactiveTrustDevicePanel.setVisibility(View.GONE);
        if (portalQrActionButton != null) portalQrActionButton.setVisibility(View.GONE);
        if (portalActionButton != null) {
            portalActionButton.setVisibility(View.VISIBLE);
            portalActionButton.setEnabled(true);
            updatePortalActionLabel(portalWebView == null ? "" : portalWebView.getUrl());
        }
    }

    private boolean isBareAcademicShellUrl(String url) {
        if (url == null || !isPortalPageUrl(url) || isPortalLoginPage(url) || isEcodeTargetReadyUrl(url)) {
            return false;
        }
        try {
            String path = Uri.parse(url).getPath();
            if (path == null) return false;
            String normalized = path.replaceAll("/+$", "");
            return normalized.endsWith("/jwapp")
                    || normalized.matches(".*/jwapp/index(?:\\.html|\\.do)?$");
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private boolean isAcademicHomeAppUrl(String url) {
        return url != null && url.contains("/jwapp/sys/homeapp");
    }

    /**
     * 查看原教务系统时，若 WebView 被 WebVPN 带到 E 码通，拉回教务首页。
     * E 码通自己的后台恢复仍使用 portalWebView，那种情况不能拦截。
     */
    private boolean redirectAcademicPortalAwayFromEcode(String url) {
        if (portalWebView == null || backgroundLoginForEcode || backgroundLoginInProgress) return false;
        if (!academicPortalViewerActive && dashboardVisible) return false;
        if (!isEcodeTargetReadyUrl(url)) return false;
        if (academicEcodeRedirectAttempts >= ACADEMIC_ECODE_REDIRECT_MAX) {
            recordLoginDiagnostic("portal-viewer", "原教务入口连续落到 E 码通，已停止重定向");
            return false;
        }
        academicEcodeRedirectAttempts += 1;
        recordLoginDiagnostic(
                "portal-viewer",
                "redirect-ecode-to-jwapp attempt=" + academicEcodeRedirectAttempts
                        + " from=" + sanitizeDiagnosticUrl(url)
        );
        portalWebView.loadUrl(academicViewerEntryUrl());
        return true;
    }

    /**
     * /jwapp/ 只是 EMAP 容器，页面往往只有 “Welcome come to EMAP.”。
     * 查看原系统时应进入 homeapp；登录换票也可以用这个真实首页。
     * 带 ticket 的 /jwapp/ 必须先让 CAS 过滤器换票，不能立刻改去 homeapp。
     */
    private boolean redirectAcademicPortalAwayFromBareShell(String url) {
        if (portalWebView == null || backgroundLoginForEcode || backgroundLoginInProgress) return false;
        if (!academicPortalViewerActive && dashboardVisible) return false;
        if (isPortalLoginPage(url) || isAcademicHomeAppUrl(url) || isAcademicCasTicketUrl(url)) return false;
        boolean bareShell = isBareAcademicShellUrl(url)
                || (isAcademicPortalReadyUrl(url) && !url.contains("/jwapp/sys/"));
        if (!bareShell) {
            recoverAcademicPortalViewerFromEmapWelcome();
            return false;
        }
        if (academicEcodeRedirectAttempts >= ACADEMIC_ECODE_REDIRECT_MAX) {
            recordLoginDiagnostic("portal-viewer", "原教务入口停在 EMAP 欢迎页，已停止重定向");
            return false;
        }
        academicEcodeRedirectAttempts += 1;
        recordLoginDiagnostic(
                "portal-viewer",
                "redirect-emap-shell-to-homeapp attempt=" + academicEcodeRedirectAttempts
                        + " from=" + sanitizeDiagnosticUrl(url)
        );
        portalWebView.loadUrl(academicHomeUrl());
        return true;
    }

    private void recoverAcademicPortalViewerFromEmapWelcome() {
        if (portalWebView == null || !academicPortalViewerActive || backgroundLoginInProgress) return;
        if (isAcademicHomeAppUrl(portalWebView.getUrl()) || isAcademicCasTicketUrl(portalWebView.getUrl())) return;
        portalWebView.evaluateJavascript(
                "(function(){var t=String((document.body&&document.body.innerText)||document.title||'').replace(/\\s+/g,' ');"
                        + "return /Welcome come to EMAP|Welcome to EMAP/i.test(t);})();",
                value -> {
                    if (portalWebView == null || !academicPortalViewerActive) return;
                    if (!"true".equalsIgnoreCase(decodeJavascriptString(value))) return;
                    if (academicEcodeRedirectAttempts >= ACADEMIC_ECODE_REDIRECT_MAX) return;
                    academicEcodeRedirectAttempts += 1;
                    recordLoginDiagnostic("portal-viewer", "emap-welcome-text-to-homeapp");
                    portalWebView.loadUrl(academicHomeUrl());
                }
        );
    }

    private void hidePortalOverlays() {
        academicPortalViewerActive = false;
        if (loginMethodBar != null) loginMethodBar.setVisibility(View.GONE);
        if (builtInLoginPanel != null) builtInLoginPanel.setVisibility(View.GONE);
        if (interactiveTrustDevicePanel != null) interactiveTrustDevicePanel.setVisibility(View.GONE);
        if (portalActionButton != null) portalActionButton.setVisibility(View.GONE);
        if (portalQrActionButton != null) portalQrActionButton.setVisibility(View.GONE);
    }

    private void applyPortalLoginMethodUi() {
        if (dashboardVisible
                && !academicPortalViewerActive
                && !builtInLoginSubmissionPending
                && !builtInInteractiveChallengeVisible
                && !builtInMobileLoginMode
                && !backgroundLoginInProgress) {
            hidePortalOverlays();
            return;
        }
        String currentUrl = portalWebView == null ? "" : portalWebView.getUrl();
        if (shouldShowAcademicPortalViewer(currentUrl)) {
            applyAcademicPortalViewerUi();
            return;
        }
        applyPortalLoginChrome();
    }

    private void applyPortalLoginChrome() {
        if (loginMethodBar != null) {
            loginMethodBar.setVisibility(View.VISIBLE);
            for (int index = 0; index < loginMethodBar.getChildCount(); index += 1) {
                View child = loginMethodBar.getChildAt(index);
                if (!(child instanceof Button)) continue;
                boolean selected = loginMethodForCurrentPortal.equals(String.valueOf(child.getTag()));
                ((Button) child).setTextColor(selected ? Color.WHITE : getColor(R.color.native_text_secondary));
                child.setBackground(roundBackground(
                        selected ? getColor(R.color.native_brand) : getColor(R.color.native_surface_subtle),
                        10
                ));
            }
        }
        boolean builtIn = LOGIN_METHOD_BUILT_IN.equals(loginMethodForCurrentPortal);
        boolean nativeBuiltIn = builtIn && !builtInInteractiveChallengeVisible && !builtInMobileLoginMode;
        boolean showInteractiveTrustDevice = builtInInteractiveChallengeVisible
                || builtInMobileLoginMode
                || (LOGIN_METHOD_MOBILE.equals(loginMethodForCurrentPortal)
                && isPortalLoginPage(portalWebView == null ? "" : portalWebView.getUrl()));
        if (builtInLoginPanel != null) builtInLoginPanel.setVisibility(nativeBuiltIn ? View.VISIBLE : View.GONE);
        if (builtInMobileLoginButton != null) {
            builtInMobileLoginButton.setVisibility(nativeBuiltIn ? View.VISIBLE : View.GONE);
        }
        if (portalActionButton != null) {
            portalActionButton.setVisibility(nativeBuiltIn ? View.GONE : View.VISIBLE);
            if (builtInInteractiveChallengeVisible) {
                portalActionButton.setEnabled(true);
                portalActionButton.setText("验证完成，进入执掌东大");
                portalActionButton.setContentDescription("完成学校图形验证码和短信验证后确认登录");
            } else if (builtInMobileLoginMode) {
                portalActionButton.setEnabled(true);
                portalActionButton.setText("返回内置账号密码登录");
                portalActionButton.setContentDescription("返回内置账号密码登录");
            }
        }
        if (interactiveTrustDevicePanel != null) {
            interactiveTrustDevicePanel.setVisibility(showInteractiveTrustDevice ? View.VISIBLE : View.GONE);
        }
        if (portalQrActionButton != null && (builtIn || LOGIN_METHOD_MOBILE.equals(loginMethodForCurrentPortal))) {
            portalQrActionButton.setVisibility(View.GONE);
        }
        if (nativeBuiltIn && builtInLoginStatus != null && !lastAcademicLoginError.isEmpty()) {
            builtInLoginStatus.setText(lastAcademicLoginError);
            builtInLoginStatus.setTextColor(getColor(R.color.native_error));
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
            if (!background || loginDiagnosticStartedAt <= 0L) {
                beginLoginDiagnostics(background, false);
            }
            recordLoginDiagnostic("credentials", "账号或密码字段不完整，未提交学校登录表单");
            finishBuiltInLoginFailure("内置登录失败：请完整输入学号和密码。", background);
            return;
        }
        final long operationId = ++loginOperationSequence;
        activeLoginOperationId = operationId;
        sessionEpoch += 1L;
        pendingBuiltInUsername = credentials.username.trim();
        pendingBuiltInPassword = credentials.password;
        backgroundLoginInProgress = background;
        builtInLoginSubmissionPending = true;
        builtInLoginAwaitingPage = true;
        builtInLoginChallengeVisible = false;
        builtInInteractiveChallengeVisible = false;
        builtInLoginInspectionAttempts = 0;
        builtInLoginPortalProbeAttempts = 0;
        builtInLoginRetryCount = 0;
        academicCasTicketBounceAttempts = 0;
        academicHomeNotFoundAttempts = 0;
        builtInLoginPortalProbeScheduled = false;
        builtInLoginSessionProbeInProgress = false;
        if (!background) backgroundLoginForEcode = false;
        beginLoginDiagnostics(background, true);
        recordLoginDiagnostic(
                "credentials",
                "已准备提交账号密码；reason="
                        + sanitizeDiagnosticText(backgroundLoginForEcode ? "E码通会话失效" : pendingAcademicFailureReason)
        );
        if (!background) {
            showBuiltInChallenge(false);
            setBuiltInLoginStatus("正在连接学校统一身份认证…", false);
            if (builtInLoginButton != null) builtInLoginButton.setEnabled(false);
            backgroundLoginForEcode = false;
            pendingEcodeLoginUrl = "";
        } else {
            if (backgroundLoginForEcode) {
                setEcodeError("登录状态已失效，正在后台使用本机加密凭据重新登录…");
            } else {
                notifyDashboardLoginStatus("retrying", "登录状态已失效，正在后台使用本机加密凭据重新登录…");
            }
        }
        if (portalWebView == null) {
            finishBuiltInLoginFailure("内置登录失败：学校登录页面不可用。", background);
            return;
        }
        if (background) {
            // 后台登录复用手动登录的真实 WebView 提交路径。WebVPN 会在页面
            // 自己的 form.submit/XHR 钩子中处理认证地址；保持 VISIBLE 让
            // WebView 继续执行 JavaScript 和重定向，由专用子类把触摸事件
            // 返回给 dashboard，同时清掉焦点避免抢输入。
            enterBackgroundLoginMode();
        } else {
            exitBackgroundLoginMode();
        }
        String currentUrl = portalWebView.getUrl();
        if (background && backgroundLoginForEcode) {
            if (isPortalLoginPage(pendingEcodeLoginUrl) && pendingEcodeLoginUrl.equals(currentUrl)) {
                injectBuiltInCredentialsIntoSchoolPage(operationId);
            } else {
                portalWebView.loadUrl(isPortalLoginPage(pendingEcodeLoginUrl)
                        ? pendingEcodeLoginUrl
                        : ecodeUrl());
            }
        } else if (!background && isPortalLoginPage(currentUrl)) {
            injectBuiltInCredentialsIntoSchoolPage(operationId);
        } else {
            // 后台登录不能复用上一次失败后留下的登录页。统一认证页的
            // lt/execution 与 WebVPN 代理会话是一组短时状态，必须从教务
            // 入口重新获取，避免把旧表单再次提交。
            portalWebView.loadUrl(academicLoginEntryUrl());
        }
    }

    private String builtInLoginPageDescription(String url) {
        if (url == null || url.trim().isEmpty()) return "无地址中转页";
        try {
            String path = Uri.parse(url).getPath();
            if (path == null || path.trim().isEmpty()) return "WebVPN 中转页";
            String normalized = path.trim();
            return normalized.length() > 120 ? normalized.substring(0, 120) + "…" : normalized;
        } catch (RuntimeException ignored) {
            return "无法识别的学校中转页";
        }
    }

    private boolean isCurrentLoginOperation(long operationId) {
        return operationId > 0L && builtInLoginSubmissionPending && activeLoginOperationId == operationId;
    }

    private void loadBuiltInAcademicPortalProbe(String observedUrl, long operationId) {
        if (portalWebView == null || !isCurrentLoginOperation(operationId)) return;
        if (builtInLoginPortalProbeAttempts >= BUILT_IN_LOGIN_PORTAL_PROBE_MAX_ATTEMPTS) {
            finishBuiltInLoginFailure(
                    "内置登录未完成：学校认证后连续返回非教务中转页（"
                            + builtInLoginPageDescription(observedUrl)
                            + "）。已停止后台重试，请点击手动登录；也可以改用原网页账密或二维码登录。",
                    backgroundLoginInProgress
            );
            return;
        }
        builtInLoginPortalProbeAttempts += 1;
        cookieManager.flush();
        String target = backgroundLoginForEcode
                ? ecodeUrl()
                : (builtInLoginPortalProbeAttempts == 1 ? academicHomeUrl() : academicHomeFallbackUrl());
        recordLoginDiagnostic(
                "portal-probe",
                "attempt=" + builtInLoginPortalProbeAttempts
                        + " target=" + sanitizeDiagnosticUrl(target)
                        + " observed=" + sanitizeDiagnosticUrl(observedUrl)
        );
        Log.d(LOG_TAG, "built-in login portal probe=" + builtInLoginPortalProbeAttempts
                + " from=" + builtInLoginPageDescription(observedUrl));
        portalWebView.loadUrl(target);
    }

    private void scheduleBuiltInPortalProbe(String observedUrl, long operationId) {
        if (portalWebView == null || !isCurrentLoginOperation(operationId) || builtInLoginPortalProbeScheduled) return;
        builtInLoginPortalProbeScheduled = true;
        portalWebView.postDelayed(() -> {
            builtInLoginPortalProbeScheduled = false;
            if (portalWebView == null || !isCurrentLoginOperation(operationId)) return;
            String currentUrl = portalWebView.getUrl();
            if (isAcademicPortalReadyUrl(currentUrl)
                    || (backgroundLoginForEcode && isEcodeTargetReadyUrl(currentUrl))) {
                finishBuiltInLoginSuccess(operationId);
            } else if (isPortalLoginPage(currentUrl)) {
                inspectBuiltInLoginPage(operationId);
            } else {
                loadBuiltInAcademicPortalProbe(currentUrl == null ? observedUrl : currentUrl, operationId);
            }
        }, BUILT_IN_LOGIN_PORTAL_PROBE_DELAY_MS);
    }

    private void injectBuiltInCredentialsIntoSchoolPage(long operationId) {
        if (portalWebView == null || !isCurrentLoginOperation(operationId)) return;
        builtInLoginAwaitingPage = false;
        // 账号登录页是由脚本切换出来的。旧实现点击选项卡后立即填值并提交，
        // 在后台 WebView 中可能赶在页面完成切换前执行，导致提交使用了不完整
        // 的表单状态。先只走一次页面原本的“账号登录”点击，再等待页面稳定。
        String script = "(function(){"
                + SCHOOL_LOGIN_PAGE_HELPERS
                + "if(isSecondAuthPage())return JSON.stringify({ok:true,interactive:true,secondAuth:true});"
                + "var tab=document.getElementById('password_login');"
                // 账号/二维码 tab 在 WebVPN 认证页经常是 display:none，但仍可 click。
                + "if(present(tab)&&typeof tab.click==='function'){tab.click();return JSON.stringify({ok:true,tabClicked:true});}"
                + "return JSON.stringify({ok:true,tabClicked:false});"
                + "})();";
        portalWebView.evaluateJavascript(script, value -> {
            if (!isCurrentLoginOperation(operationId)) return;
            try {
                JSONObject result = new JSONObject(decodeJavascriptString(value));
                recordLoginDiagnostic("login-tab", "clicked=" + result.optBoolean("tabClicked", false)
                        + " secondAuth=" + result.optBoolean("secondAuth", false)
                        + (result.has("error") ? " error=" + sanitizeDiagnosticText(result.optString("error", "")) : ""));
                if (result.optBoolean("interactive", false) || result.optBoolean("secondAuth", false)) {
                    handOffBuiltInInteractiveChallenge(
                            operationId,
                            "学校认证需要图形验证码或短信验证，请在官方页面完成验证。"
                    );
                    return;
                }
                if (!result.optBoolean("ok", false)) {
                    finishBuiltInLoginFailure("内置登录失败：" + result.optString("error", "无法切换到账号登录页面"), backgroundLoginInProgress);
                    return;
                }
            } catch (Exception error) {
                recordLoginDiagnostic("login-tab", "无法解析账号登录页面切换结果：" + safeErrorMessage(error));
                finishBuiltInLoginFailure("内置登录失败：无法切换到账号登录页面。", backgroundLoginInProgress);
                return;
            }
            portalWebView.postDelayed(() -> submitBuiltInCredentialsToSchoolPage(operationId), BUILT_IN_LOGIN_TAB_SETTLE_MS);
        });
    }

    private void submitBuiltInCredentialsToSchoolPage(long operationId) {
        if (portalWebView == null || !isCurrentLoginOperation(operationId)) return;
        String username = JSONObject.quote(pendingBuiltInUsername);
        String password = JSONObject.quote(pendingBuiltInPassword);
        String script = "(function(){"
                + SCHOOL_LOGIN_PAGE_HELPERS
                + "var u=" + username + ",p=" + password + ";"
                + "var un=document.getElementById('un'),pd=document.getElementById('pd');"
                + "var button=document.getElementById('index_login_btn');"
                + "var form=document.getElementById('loginForm')||document.getElementById('loginform');"
                + "var visible=laidOut;"
                + "var pageText=String(document.body&&document.body.innerText||'');"
                + "if(isSecondAuthPage())return JSON.stringify({ok:true,interactive:true,secondAuth:true});"
                + "var challenge=Boolean(document.getElementById('loginMobile')||document.getElementById('codeImage')||document.getElementById('phoneCode')||document.getElementById('getMobileVerifyCode'))||/(图形验证码|图片验证码|安全验证|获取验证码|手机验证码|手机登录|当前设备需进行身份验证)/.test(pageText);"
                + "if((!un||!pd||!visible(un)||!visible(pd))&&challenge)return JSON.stringify({ok:true,interactive:true});"
                + "if(!un||!pd||!visible(un)||!visible(pd))return JSON.stringify({ok:true,waitForPage:true});"
                + "if(!form)return JSON.stringify({ok:true,waitForPage:true});"
                + "var formActionBefore=form&&form.action?String(form.action):'';"
                + "un.disabled=false;pd.disabled=false;un.removeAttribute('disabled');pd.removeAttribute('disabled');"
                + "un.value=u;pd.value=p;"
                + "un.dispatchEvent(new Event('input',{bubbles:true}));"
                + "pd.dispatchEvent(new Event('input',{bubbles:true}));"
                + "un.dispatchEvent(new Event('change',{bubbles:true}));"
                + "pd.dispatchEvent(new Event('change',{bubbles:true}));"
                + "var submitter='';"
                // 直接调用学校脚本导出的 login()，与用户点击学校页面按钮
                // 后的真实处理完全一致；只有旧页面没有导出函数时才回退到
                // 按钮 click，兼容学校页面脚本改版。
                + "if(typeof window.login==='function'){window.login();submitter='window.login';}"
                + "else if(button&&typeof button.click==='function'){button.click();submitter='index_login_btn';}"
                + "else return JSON.stringify({ok:false,error:'学校登录页未找到登录按钮'});"
                + "var rsa=document.getElementById('rsa'),ul=document.getElementById('ul'),pl=document.getElementById('pl'),lt=document.getElementById('lt');"
                + "var action=form&&form.action?String(form.action).split('?')[0]:'';"
                + "return JSON.stringify({ok:true,submitter:submitter,rsaPresent:Boolean(rsa&&rsa.value),rsaLength:rsa&&rsa.value?rsa.value.length:0,ulLength:ul&&ul.value?ul.value.length:0,plLength:pl&&pl.value?pl.value.length:0,ltPresent:Boolean(lt&&lt.value),formActionBefore:formActionBefore.split('?')[0],formAction:action});"
                + "})();";
        portalWebView.evaluateJavascript(script, value -> {
            if (!isCurrentLoginOperation(operationId)) return;
            try {
                JSONObject result = new JSONObject(decodeJavascriptString(value));
                if (result.optBoolean("interactive", false) || result.optBoolean("secondAuth", false)) {
                    recordLoginDiagnostic("form-submit", result.optBoolean("secondAuth", false)
                            ? "当前页面已进入设备二次认证（图形验证码/短信）"
                            : "当前页面已进入人工图形/手机验证流程");
                    handOffBuiltInInteractiveChallenge(
                            operationId,
                            "学校认证已进入身份验证页面，请完成图形验证码和短信验证码。"
                    );
                    return;
                }
                if (result.optBoolean("waitForPage", false)) {
                    builtInLoginAwaitingPage = true;
                    portalWebView.postDelayed(() -> inspectBuiltInLoginPage(operationId), BUILT_IN_LOGIN_TAB_SETTLE_MS);
                    return;
                }
                StringBuilder detail = new StringBuilder("submitted=")
                        .append(result.optBoolean("ok", false))
                        .append(" submitter=").append(result.optString("submitter", "none"))
                        .append(" rsaPresent=").append(result.optBoolean("rsaPresent", false))
                        .append(" rsaLength=").append(result.optInt("rsaLength", 0))
                        .append(" ulLength=").append(result.optInt("ulLength", 0))
                        .append(" plLength=").append(result.optInt("plLength", 0))
                        .append(" ltPresent=").append(result.optBoolean("ltPresent", false));
                if (result.has("formActionBefore")) {
                    detail.append(" formActionBefore=")
                            .append(sanitizeDiagnosticUrl(result.optString("formActionBefore", "")));
                }
                if (result.has("formAction")) {
                    detail.append(" formAction=")
                            .append(sanitizeDiagnosticUrl(result.optString("formAction", "")));
                }
                if (result.has("error")) {
                    detail.append(" error=")
                            .append(sanitizeDiagnosticText(result.optString("error", "")));
                }
                recordLoginDiagnostic("form-submit", detail.toString());
                if (!result.optBoolean("ok", false)) {
                    finishBuiltInLoginFailure(
                            "内置登录失败：" + result.optString("error", "无法提交学校登录表单"),
                            backgroundLoginInProgress
                    );
                    return;
                }
            } catch (Exception error) {
                recordLoginDiagnostic("form-submit", "无法解析学校登录表单提交结果：" + safeErrorMessage(error));
                finishBuiltInLoginFailure("内置登录失败：无法确认学校登录表单是否提交。", backgroundLoginInProgress);
                return;
            }
            portalWebView.postDelayed(() -> inspectBuiltInLoginPage(operationId), BUILT_IN_LOGIN_SUBMIT_SETTLE_MS);
        });
    }

    private void inspectBuiltInLoginPage(long operationId) {
        if (portalWebView == null || !isCurrentLoginOperation(operationId)) return;
        String currentUrl = portalWebView.getUrl();
        if (backgroundLoginForEcode && isEcodeTargetReadyUrl(currentUrl)) {
            finishBuiltInLoginSuccess(operationId);
            return;
        }
        if (isAcademicPortalReadyUrl(currentUrl)) {
            verifyBuiltInLoginSession(operationId, "inspect-jwapp-confirm", false);
            return;
        }
        if (builtInInteractiveChallengeVisible) {
            // 官方页面已经交给用户操作。不能继续用短轮询的超时逻辑打断
            // 图形验证码、短信输入或手机登录后的账号选择。
            return;
        }
        if (builtInLoginSessionProbeInProgress) return;
        if (!isPortalLoginPage(currentUrl)) {
            if (isPortalPageUrl(currentUrl)) {
                builtInLoginInspectionAttempts += 1;
                if (builtInLoginInspectionAttempts < 3) {
                    portalWebView.postDelayed(() -> inspectBuiltInLoginPage(operationId), BUILT_IN_LOGIN_INSPECTION_INTERVAL_MS);
                } else {
                    loadBuiltInAcademicPortalProbe(currentUrl, operationId);
                }
            } else {
                scheduleBuiltInPortalProbe(currentUrl, operationId);
            }
            return;
        }
        builtInLoginInspectionAttempts += 1;
        String script = "(function(){"
                + SCHOOL_LOGIN_PAGE_HELPERS
                + "function visible(n){return laidOut(n);}"
                + "function text(n){return String((n&&(n.innerText||n.textContent))||'').replace(/\\s+/g,' ').trim();}"
                + "var secondAuth=isSecondAuthPage();"
                + "var m=document.getElementById('mcode'),save=document.getElementById('saveDevice'),send=document.getElementById('sendCode');"
                + "var un=document.getElementById('un'),pd=document.getElementById('pd');"
                + "var credentialInputs=visible(un)&&visible(pd);"
                + "var loginForm=document.getElementById('loginForm')||document.getElementById('loginform')||un||pd;"
                // 普通账号密码页也可能预渲染“信任设备”复选框（常为 0×0）；
                // 只有真正铺开的短信/二次认证控件，或没有账号密码框时的
                // 可见信任选项，才能把当前页面判定为人工挑战。
                + "var challenge=visible(m)||visible(document.getElementById('second_valid_ok'))||(visible(save)&&!credentialInputs);"
                + "var mobileIds=['loginMobile','sendConfirm','codeImage','getMobileVerifyCode','phoneCode','finishloginbymobile'];"
                + "var mobileFlow=mobileIds.some(function(id){return visible(document.getElementById(id));});"
                + "var graphInput=Array.prototype.some.call(document.querySelectorAll('input'),function(n){"
                + "if(!visible(n)||n===m||n===document.getElementById('phoneCode'))return false;"
                + "var identity=String(n.id||'')+' '+String(n.name||'')+' '+String(n.placeholder||'');"
                + "return /captcha|verify|imgCode|scendAuthCode|图形验证码|图片验证码|验证码/.test(identity);"
                + "});"
                + "var graphImage=Array.prototype.some.call(document.querySelectorAll('img,canvas'),function(n){"
                + "if(!visible(n))return false;var identity=String(n.id||'')+' '+String(n.className||'')+' '+String(n.getAttribute&&n.getAttribute('alt')||'')+' '+String(n.currentSrc||n.src||'');"
                + "return /captcha|verify|codeImage|\\/tpass\\/code|图形验证码|验证码/.test(identity);"
                + "});"
                + "var errors=[],add=function(n){if(!visible(n))return;var t=text(n);if(t&&errors.indexOf(t)<0)errors.push(t);};"
                + "['errormsg','errorMsg','errorMessage','errormsghide'].forEach(function(id){add(document.getElementById(id));});"
                + "Array.prototype.slice.call(document.querySelectorAll('.layui-layer-content,.layui-layer-msg,[role=alert],.alert,.error,.error-msg,.login_box_title_notice')).forEach(add);"
                + "Array.prototype.slice.call(document.querySelectorAll('body *')).forEach(function(n){if(n.children&&n.children.length)return;if(!visible(n))return;var t=text(n);if(t&&t.length<160&&/(密码错误|账号不存在|登录失败|不正确|锁定|过期|验证码错误|认证失败|不能为空|未找到|禁止)/.test(t))add(n);});"
                + "var visibleText=text(document.body);"
                + "var challengeText=/(图形验证码|图片验证码|验证码图片|安全验证|获取短信验证码|获取验证码|短信验证码|手机验证码|手机登录|当前设备需进行身份验证)/.test(visibleText);"
                // 普通账密页可能同时展示“手机登录”说明或隐藏模板文字；
                // 只要可见账号密码输入框仍在，就不能把这些提示误判成
                // 当前必须人工完成的手机挑战。设备二次认证页用明确 ID 识别。
                + "var interactiveChallenge=secondAuth||challenge||graphInput||graphImage||(mobileFlow&&!credentialInputs)||(challengeText&&!credentialInputs);"
                + "var hiddenError=text(document.getElementById('errormsghide'));"
                + "var rsa=document.getElementById('rsa'),ul=document.getElementById('ul'),pl=document.getElementById('pl'),lt=document.getElementById('lt');"
                + "return JSON.stringify({secondAuth:secondAuth,challenge:challenge,interactiveChallenge:interactiveChallenge,mobileFlow:mobileFlow,graphInput:graphInput,graphImage:graphImage,error:errors.join('；'),hiddenError:hiddenError,sendAvailable:visible(send),loginForm:Boolean(loginForm),credentialInputs:credentialInputs,rsaPresent:Boolean(rsa&&rsa.value),ulLength:ul&&ul.value?ul.value.length:0,plLength:pl&&pl.value?pl.value.length:0,ltPresent:Boolean(lt&&lt.value)});"
                + "})();";
        portalWebView.evaluateJavascript(script, value -> {
            if (!isCurrentLoginOperation(operationId)) return;
            try {
                JSONObject result = new JSONObject(decodeJavascriptString(value));
                String errorText = result.optString("error", "").trim();
                boolean secondAuth = result.optBoolean("secondAuth", false);
                boolean challenge = result.optBoolean("challenge", false);
                boolean interactiveChallenge = result.optBoolean("interactiveChallenge", false);
                boolean loginForm = result.optBoolean("loginForm", false);
                boolean credentialInputs = result.optBoolean("credentialInputs", false);
                recordLoginDiagnostic(
                        "inspect",
                        "url=" + sanitizeDiagnosticUrl(currentUrl)
                                + " secondAuth=" + secondAuth
                                + " challenge=" + challenge
                                + " interactive=" + interactiveChallenge
                                + " mobile=" + result.optBoolean("mobileFlow", false)
                                + " graphInput=" + result.optBoolean("graphInput", false)
                                + " graphImage=" + result.optBoolean("graphImage", false)
                                + " loginForm=" + loginForm
                                + " credentialInputs=" + credentialInputs
                                + " sendCode=" + result.optBoolean("sendAvailable", false)
                                + " rsaPresent=" + result.optBoolean("rsaPresent", false)
                                + " ulLength=" + result.optInt("ulLength", 0)
                                + " plLength=" + result.optInt("plLength", 0)
                                + " ltPresent=" + result.optBoolean("ltPresent", false)
                                + (errorText.isEmpty() ? "" : " schoolError=" + sanitizeDiagnosticText(errorText))
                                + (result.optString("hiddenError", "").trim().isEmpty() ? "" : " hiddenError=" + sanitizeDiagnosticText(result.optString("hiddenError", "")))
                );
                if (secondAuth || challenge || interactiveChallenge) {
                    // 账密提交后的设备二次认证、旧版短信弹窗、手机模板
                    // 都交给同一个可见官方 WebView。后台遇到这些页立即停止，
                    // 不自动发送或重放验证码。
                    if (builtInInteractiveChallengeVisible) return;
                    if (backgroundLoginInProgress) {
                        finishBuiltInLoginFailure(
                                secondAuth || interactiveChallenge
                                        ? "后台自动登录需要人工完成图形验证码和短信验证。请点击手动登录完成验证，或改用原网页账密/二维码登录。"
                                        : "后台自动登录需要人工完成短信二次认证。请点击手动登录完成验证，或改用原网页账密/二维码登录。",
                                true
                        );
                        return;
                    }
                    handOffBuiltInInteractiveChallenge(
                            operationId,
                            secondAuth
                                    ? "学校认证需要图形验证码和短信验证码，请在官方页面完成验证。"
                                    : (interactiveChallenge
                                    ? "学校认证需要图形验证码或手机验证码，请在官方页面完成验证。"
                                    : "学校认证需要短信二次验证，请在官方页面获取并填写验证码。")
                    );
                    return;
                }
                if (credentialInputs && builtInLoginAwaitingPage) {
                    // 只有确认账号密码输入框存在时才提交；如果页面是会话
                    // 失效后的直接手机/图形验证页，上面的分支已经把它交给用户。
                    injectBuiltInCredentialsIntoSchoolPage(operationId);
                    return;
                }
                if (!errorText.isEmpty()) {
                    if (backgroundLoginInProgress && !builtInLoginSessionProbeInProgress) {
                        // 认证页上的旧错误提示可能没有随新一轮登录清空；
                        // 先确认当前 Cookie，避免把已经成功的可信设备登录
                        // 当成密码错误。
                        verifyBuiltInLoginSession(operationId, "background-error-confirm", false);
                        return;
                    }
                    finishBuiltInLoginFailure("学校统一身份认证返回：" + errorText, backgroundLoginInProgress);
                    return;
                }
                if (!loginForm && !secondAuth && builtInLoginInspectionAttempts >= 3) {
                    // 某些成功回调仍保留 /tpass/login 地址，但登录表单已经被
                    // 中转内容替换。此时直接用新 Cookie 探测教务入口。
                    // 设备二次认证页没有 loginForm，绝不能走这条误判成功路径。
                    loadBuiltInAcademicPortalProbe(currentUrl, operationId);
                    return;
                }
            } catch (Exception ignored) {
                recordLoginDiagnostic("inspect", "无法解析登录页检查结果，继续等待页面稳定");
                // 页面仍在跳转时可能暂时无法读取结果，继续短暂轮询。
            }
            if (builtInLoginInspectionAttempts >= LOGIN_INSPECTION_MAX_ATTEMPTS) {
                if (backgroundLoginInProgress) {
                    // 可信设备已生效时，学校可能已经写入 Cookie，但不一定
                    // 立即把 WebView 地址改成 /jwapp/。先用业务接口确认，
                    // 避免把“登录成功但页面没跳转”误报成后台失败。
                    verifyBuiltInLoginSession(operationId, "background-confirm", false);
                    return;
                }
                String hiddenError = "";
                try {
                    JSONObject result = new JSONObject(decodeJavascriptString(value));
                    hiddenError = result.optString("hiddenError", "").trim();
                } catch (Exception ignored) {
                    // 保留下面的明确失败信息。
                }
                String detail = hiddenError.isEmpty()
                        ? "学校统一身份认证提交后仍停留在登录页"
                        : "学校统一身份认证提示：" + sanitizeDiagnosticText(hiddenError);
                finishBuiltInLoginFailure(
                        "内置登录未成功：" + detail + "。请检查已保存的账号密码，或点击手动登录完成一次登录。",
                        backgroundLoginInProgress
                );
            } else {
                portalWebView.postDelayed(() -> inspectBuiltInLoginPage(operationId), BUILT_IN_LOGIN_INSPECTION_INTERVAL_MS);
            }
        });
    }

    private void syncBuiltInTrustDeviceSelection(long operationId) {
        if (portalWebView == null || !isCurrentLoginOperation(operationId)) return;
        boolean interactiveVisible = interactiveTrustDevicePanel != null
                && interactiveTrustDevicePanel.getVisibility() == View.VISIBLE
                && interactiveTrustDeviceCheck != null;
        boolean trustDevice = interactiveVisible
                ? interactiveTrustDeviceCheck.isChecked()
                : builtInTrustDeviceCheck == null || builtInTrustDeviceCheck.isChecked();
        if (builtInTrustDeviceCheck != null && builtInTrustDeviceCheck.isChecked() != trustDevice) {
            builtInTrustDeviceCheck.setChecked(trustDevice);
        }
        String script = "(function(){"
                + "var save=document.getElementById('saveDevice');"
                + "if(!save)return JSON.stringify({found:false});"
                + "save.checked=" + Boolean.toString(trustDevice) + ";"
                + "save.dispatchEvent(new Event('change',{bubbles:true}));"
                + "return JSON.stringify({found:true,checked:save.checked});"
                + "})();";
        portalWebView.evaluateJavascript(script, value -> {
            if (!isCurrentLoginOperation(operationId)) return;
            try {
                JSONObject result = new JSONObject(decodeJavascriptString(value));
                recordLoginDiagnostic(
                        "trust-device",
                        "officialCheckboxFound=" + result.optBoolean("found", false)
                                + " requested=" + trustDevice
                );
            } catch (Exception error) {
                recordLoginDiagnostic("trust-device", "无法确认学校页面的可信设备选项");
            }
        });
    }

    /**
     * 手机验证码作为内置登录的主动入口时没有账密登录事务 ID，仍要把
     * 原生默认选择同步到学校页面（若该页面提供 saveDevice）。
     */
    private void syncPortalTrustDeviceSelection() {
        if (portalWebView == null) return;
        boolean trustDevice = interactiveTrustDeviceCheck == null
                ? builtInTrustDeviceCheck == null || builtInTrustDeviceCheck.isChecked()
                : interactiveTrustDeviceCheck.isChecked();
        String script = "(function(){"
                + "var save=document.getElementById('saveDevice');"
                + "if(!save)return false;"
                + "save.checked=" + Boolean.toString(trustDevice) + ";"
                + "save.dispatchEvent(new Event('change',{bubbles:true}));"
                + "return true;"
                + "})();";
        portalWebView.evaluateJavascript(script, null);
    }

    /**
     * 把当前认证页交给用户，或在后台登录时安全停止。
     * 不改信任设备勾选和 Keystore 存凭据；官方页若有 #saveDevice 仍由
     * 原有同步逻辑处理，没有该节点则保持 no-op。
     */
    private void handOffBuiltInInteractiveChallenge(long operationId, String message) {
        if (!isCurrentLoginOperation(operationId)) return;
        if (builtInInteractiveChallengeVisible) return;
        if (backgroundLoginInProgress) {
            finishBuiltInLoginFailure(
                    "后台自动登录需要人工完成图形验证码和短信验证。请点击手动登录完成验证，或改用原网页账密/二维码登录。",
                    true
            );
            return;
        }
        showBuiltInInteractiveChallenge(operationId, message);
    }

    private void showBuiltInInteractiveChallenge(long operationId, String message) {
        if (!isCurrentLoginOperation(operationId) || backgroundLoginInProgress) return;
        builtInInteractiveChallengeVisible = true;
        builtInLoginChallengeVisible = false;
        boolean trustDevice = builtInTrustDeviceCheck == null || builtInTrustDeviceCheck.isChecked();
        recordLoginDiagnostic("interactive-challenge", "把认证页面交给用户完成图形/手机验证");
        runOnUiThread(() -> {
            if (!isCurrentLoginOperation(operationId)) return;
            showBuiltInChallenge(false);
            exitBackgroundLoginMode();
            dashboardVisible = false;
            if (dashboardHome != null) dashboardHome.setVisibility(View.GONE);
            if (portalWebView != null) portalWebView.setVisibility(View.VISIBLE);
            if (loginMethodBar != null) loginMethodBar.setVisibility(View.VISIBLE);
            if (builtInLoginPanel != null) builtInLoginPanel.setVisibility(View.GONE);
            if (interactiveTrustDevicePanel != null) {
                interactiveTrustDevicePanel.setVisibility(View.VISIBLE);
                if (interactiveTrustDeviceCheck != null) interactiveTrustDeviceCheck.setChecked(trustDevice);
            }
            if (portalActionButton != null) {
                portalActionButton.setVisibility(View.VISIBLE);
                portalActionButton.setEnabled(true);
                portalActionButton.setText("验证完成，进入执掌东大");
                portalActionButton.setContentDescription("完成学校图形验证码和短信验证后确认登录");
            }
            if (portalQrActionButton != null) portalQrActionButton.setVisibility(View.GONE);
            restorePortalOverlayOrder();
            Toast.makeText(
                    this,
                    message == null || message.trim().isEmpty()
                            ? "请在学校官方页面完成图形验证码、短信验证码，并确认勾选信任此设备"
                            : message + (trustDevice ? " 已勾选信任此设备。" : " 当前未勾选信任此设备。"),
                    Toast.LENGTH_LONG
            ).show();
        });
        // challenge DOM 由学校异步创建，检查后立即同步一次；后续再次检查时
        // 仍会使用同一个认证事务，不会创建第二个 WebView 或重放凭据。
        syncBuiltInTrustDeviceSelection(operationId);
        portalWebView.postDelayed(() -> syncBuiltInTrustDeviceSelection(operationId), 360L);
    }

    private void completeBuiltInInteractiveChallenge() {
        if (portalWebView == null || !builtInInteractiveChallengeVisible || !builtInLoginSubmissionPending) return;
        final long operationId = activeLoginOperationId;
        String currentUrl = portalWebView.getUrl();
        if (isAcademicPortalReadyUrl(currentUrl)
                || (backgroundLoginForEcode && isEcodeTargetReadyUrl(currentUrl))) {
            finishBuiltInLoginSuccess(operationId);
            return;
        }
        if (isPortalLoginPage(currentUrl)) {
            // 首次安装时 Dashboard 尚未加载，不能依赖 Dashboard 探针。
            // 直接用当前 WebView Cookie 探测教务接口；学校认证成功但仍
            // 保留 /tpass/login 地址时，也能在这里确认并进入首页。
            syncBuiltInTrustDeviceSelection(operationId);
            verifyAcademicSessionAfterInteractiveChallenge(operationId);
            return;
        }
        if (portalActionButton != null) {
            portalActionButton.setEnabled(false);
            portalActionButton.setText("正在确认学校登录…");
        }
        scheduleBuiltInPortalProbe(currentUrl, operationId);
        portalWebView.postDelayed(() -> {
            if (!isCurrentLoginOperation(operationId) || !builtInInteractiveChallengeVisible) return;
            String latestUrl = portalWebView.getUrl();
            if (isAcademicPortalReadyUrl(latestUrl)
                    || (backgroundLoginForEcode && isEcodeTargetReadyUrl(latestUrl))) {
                finishBuiltInLoginSuccess(operationId);
                return;
            }
            if (portalActionButton != null) {
                portalActionButton.setEnabled(true);
                portalActionButton.setText("验证完成，进入执掌东大");
            }
        }, BUILT_IN_LOGIN_PORTAL_PROBE_DELAY_MS * 4L);
    }

    private void verifyAcademicSessionAfterInteractiveChallenge(long operationId) {
        verifyBuiltInLoginSession(operationId, "interactive-confirm", false);
    }

    /**
     * 登录表单提交后不要只靠 URL 判断成功。学校在可信设备已登记时，
     * 可能已经写入有效 Cookie，却暂时把 WebView 留在 /tpass/login；
     * 直接探测教务接口才能区分“页面没跳转”和“真的登录失败”。
     *
     * closeAfterFailure 只用于用户主动点击“关闭并返回主页”的场景：
     * 探测暂时无法确认时仍尊重用户的关闭选择，但不会伪造成功状态。
     */
    private void verifyBuiltInLoginSession(long operationId, String diagnosticPhase,
                                           boolean closeAfterFailure) {
        if (portalWebView == null || !isCurrentLoginOperation(operationId)) return;
        if (builtInLoginSessionProbeInProgress) return;
        String currentUrl = portalWebView.getUrl();
        builtInLoginSessionProbeInProgress = true;
        boolean background = backgroundLoginInProgress;
        if (portalActionButton != null) {
            portalActionButton.setEnabled(false);
            portalActionButton.setText("正在确认学校登录…");
        }
        if (!background && builtInLoginButton != null) builtInLoginButton.setEnabled(false);
        recordLoginDiagnostic(diagnosticPhase, "用当前 WebView Cookie 确认教务会话");
        cookieManager.flush();
        networkExecutor.execute(() -> {
            long deadline = System.currentTimeMillis() + ACADEMIC_PROBE_TOTAL_BUDGET_MS;
            AcademicProbeResult result = probeAcademicEndpoint(
                    academicRootUrl() + "/jwapp/sys/homeapp/api/home/currentUser.do",
                    Math.min(ACADEMIC_PROBE_TIMEOUT_MS, Math.max(500, (int) (deadline - System.currentTimeMillis())))
            );
            if (result.kind == AcademicProbeResult.UNKNOWN && System.currentTimeMillis() < deadline) {
                result = probeAcademicEndpoint(
                        academicRootUrl() + "/jwapp/sys/homeapp/api/home/kb/xnxq.do",
                        Math.min(ACADEMIC_PROBE_TIMEOUT_MS, Math.max(500, (int) (deadline - System.currentTimeMillis())))
                );
            }
            AcademicProbeResult finalResult = result;
            runOnUiThread(() -> {
                builtInLoginSessionProbeInProgress = false;
                if (!isCurrentLoginOperation(operationId)) return;
                if (finalResult.kind == AcademicProbeResult.HEALTHY) {
                    finishBuiltInLoginSuccess(operationId);
                    return;
                }
                if (background) {
                    if (isPortalLoginPage(portalWebView.getUrl())) {
                        recordLoginDiagnostic(diagnosticPhase, "会话未生效，继续在认证页提交账密");
                        inspectBuiltInLoginPage(operationId);
                        return;
                    }
                    if (builtInLoginRetryCount < BUILT_IN_LOGIN_RETRY_MAX) {
                        builtInLoginRetryCount += 1;
                        builtInLoginInspectionAttempts = 0;
                        builtInLoginPortalProbeAttempts = 0;
                        builtInLoginPortalProbeScheduled = false;
                        builtInLoginAwaitingPage = true;
                        recordLoginDiagnostic(
                                "retry",
                                "Cookie 尚未确认有效，重新打开学校认证页并只重试一次"
                        );
                        portalWebView.stopLoading();
                        portalWebView.loadUrl(academicLoginEntryUrl());
                        return;
                    }
                    finishBuiltInLoginFailure(
                            finalResult.kind == AcademicProbeResult.INVALID
                                    ? "后台自动登录提交后，学校会话仍未生效。"
                                    : "后台自动登录已提交，但暂时无法确认学校会话。",
                            true
                    );
                    return;
                }
                if (closeAfterFailure) {
                    Toast.makeText(
                            this,
                            finalResult.kind == AcademicProbeResult.INVALID
                                    ? "未确认到有效教务会话，已返回主页。"
                                    : "暂时无法确认教务会话，已返回主页；联网后会再次探测。",
                            Toast.LENGTH_LONG
                    ).show();
                    closePortalLoginToDashboardNow();
                    return;
                }
                if (builtInLoginButton != null) builtInLoginButton.setEnabled(true);
                if (portalActionButton != null) {
                    portalActionButton.setEnabled(true);
                    portalActionButton.setText("验证完成，进入执掌东大");
                }
                Toast.makeText(
                        this,
                        finalResult.kind == AcademicProbeResult.INVALID
                                ? "学校会话尚未确认，请完成图形验证码和短信验证码后再试。"
                                : "暂时无法确认学校登录状态，请检查网络后再试。",
                        Toast.LENGTH_LONG
                ).show();
            });
        });
    }

    private void requestBuiltInSmsCode() {
        if (portalWebView == null || !builtInLoginChallengeVisible || builtInInteractiveChallengeVisible) return;
        final long operationId = activeLoginOperationId;
        if (!isCurrentLoginOperation(operationId)) return;
        builtInCodeSendButton.setEnabled(false);
        builtInCodeSendButton.setText("已请求");
        String script = "(function(){var send=document.getElementById('sendCode');"
                + "if(send&&typeof send.click==='function'){send.click();return true;}return false;})();";
        portalWebView.evaluateJavascript(script, value -> {
            if (!isCurrentLoginOperation(operationId)) return;
            if (!"true".equals(value)) {
                builtInCodeSendButton.setEnabled(true);
                builtInCodeSendButton.setText("重新获取");
                setBuiltInLoginStatus("学校页面未找到验证码发送按钮，请切换到原网页账密登录完成验证。", true);
                return;
            }
            setBuiltInLoginStatus("验证码请求已提交，请查看统一身份认证绑定的手机。学校限制重复发送频率，请勿连续点击。", false);
            // 新版学校服务可能在点击发送后再插入图形验证码控件；延迟
            // 重新观察，发现后交给官方可见页面处理，而不是继续假定短信已发送。
            portalWebView.postDelayed(() -> inspectBuiltInLoginPage(operationId), BUILT_IN_LOGIN_SUBMIT_SETTLE_MS);
        });
    }

    private void submitBuiltInVerificationCode() {
        String code = builtInCodeInput == null ? "" : builtInCodeInput.getText().toString().trim();
        if (code.isEmpty()) {
            setBuiltInLoginStatus("请输入短信验证码。", true);
            return;
        }
        if (portalWebView == null) return;
        final long operationId = activeLoginOperationId;
        if (builtInLoginButton != null) builtInLoginButton.setEnabled(false);
        String script = "(function(){var code=document.getElementById('mcode'),save=document.getElementById('saveDevice'),button=document.getElementById('second_valid_ok');"
                + "if(!code||!button)return JSON.stringify({ok:false,error:'学校二次认证输入框不可用'});"
                + "code.value=" + JSONObject.quote(code) + ";"
                + "code.dispatchEvent(new Event('input',{bubbles:true}));"
                + "if(save)save.checked=" + Boolean.toString(builtInTrustDeviceCheck == null || builtInTrustDeviceCheck.isChecked()) + ";"
                + "button.click();return JSON.stringify({ok:true});})();";
        portalWebView.evaluateJavascript(script, value -> {
            if (!isCurrentLoginOperation(operationId)) return;
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
            portalWebView.postDelayed(() -> inspectBuiltInLoginPage(operationId), BUILT_IN_LOGIN_SUBMIT_SETTLE_MS);
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
            builtInLoginStatus.setTextColor(error ? getColor(R.color.native_error) : getColor(R.color.native_text_secondary));
        });
    }

    private void setBuiltInLoginError(String message) {
        setBuiltInLoginStatus(message, true);
        setLastAcademicLoginError(message);
    }

    private void finishBuiltInLoginSuccess(long operationId) {
        if (!isCurrentLoginOperation(operationId)) return;
        finishLoginDiagnosticsSuccess();
        boolean wasBackground = backgroundLoginInProgress;
        boolean wasForEcode = wasBackground && backgroundLoginForEcode;
        boolean hadAcademicFailure = !pendingAcademicFailureReason.isEmpty();
        exitBackgroundLoginMode();
        if (!wasBackground && builtInTrustDeviceCheck != null && builtInTrustDeviceCheck.isChecked()) {
            saveBuiltInCredentials(pendingBuiltInUsername, pendingBuiltInPassword);
        } else if (!wasBackground && builtInTrustDeviceCheck != null && !builtInTrustDeviceCheck.isChecked()) {
            clearBuiltInCredentials();
        }
        pendingBuiltInPassword = "";
        builtInLoginSubmissionPending = false;
        builtInLoginAwaitingPage = false;
        builtInLoginChallengeVisible = false;
        builtInInteractiveChallengeVisible = false;
        builtInMobileLoginMode = false;
        backgroundLoginInProgress = false;
        builtInLoginPortalProbeScheduled = false;
        builtInLoginSessionProbeInProgress = false;
        builtInLoginRetryCount = 0;
        academicCasTicketBounceAttempts = 0;
        backgroundLoginForEcode = false;
        pendingEcodeLoginUrl = "";
        activeLoginOperationId = operationId;
        sessionEpoch += 1L;
        if (!wasBackground) {
            backgroundLoginAttemptedForCurrentFailure = false;
        }
        if (wasBackground) {
            hidePortalOverlays();
            if (portalWebView != null) portalWebView.setVisibility(View.GONE);
            if (wasForEcode) {
                reloadEcodeAfterBackgroundLogin();
            } else {
                if (!ecodeSessionReady || ecodeReloadAfterBackgroundLogin) {
                    reloadEcodeAfterBackgroundLogin();
                }
            }
            postLoginVerificationPending = true;
            postLoginVerificationForEcode = wasForEcode;
            postLoginHadAcademicFailure = hadAcademicFailure;
            postLoginOperationId = operationId;
            requestAcademicSessionProbe("post-login-verification", operationId);
        } else {
            setLastAcademicLoginError("");
            showDashboard();
            // 手动登录同样不能只凭 WebView 地址就把会话写成有效；首页会先
            // 显示缓存，随后用同一个轻量探针确认新的 WebVPN Cookie。
            // 若失效前的完整刷新仍在等待旧 Cookie 的响应，强制把这次验证后
            // 的刷新排到它之后，避免 single-flight 误复用那一轮过期请求。
            requestDashboardRefreshAfterSessionProbe(true);
            requestAcademicSessionProbe("manual-login-verification", operationId);
        }
    }

    private void finishBuiltInLoginFailure(String message, boolean background) {
        String fullMessage = message == null || message.trim().isEmpty() ? "内置登录失败：未知错误" : message.trim();
        exitBackgroundLoginMode();
        if (loginDiagnosticStartedAt <= 0L || !"running".equals(loginDiagnosticStatus)) {
            beginLoginDiagnostics(background, background && loadBuiltInCredentials().isComplete());
        }
        recordLoginDiagnostic("failure", fullMessage);
        finishLoginDiagnosticsFailure(fullMessage);
        boolean wasForEcode = background && backgroundLoginForEcode;
        boolean academicAlsoInvalid = !pendingAcademicFailureReason.isEmpty();
        pendingBuiltInPassword = "";
        sessionEpoch += 1L;
        builtInLoginSubmissionPending = false;
        builtInLoginAwaitingPage = false;
        builtInLoginChallengeVisible = false;
        builtInInteractiveChallengeVisible = false;
        builtInMobileLoginMode = false;
        backgroundLoginInProgress = false;
        builtInLoginPortalProbeScheduled = false;
        builtInLoginSessionProbeInProgress = false;
        builtInLoginRetryCount = 0;
        academicCasTicketBounceAttempts = 0;
        backgroundLoginForEcode = false;
        pendingEcodeLoginUrl = "";
        ecodeReloadAfterBackgroundLogin = false;
        if (interactiveTrustDevicePanel != null) interactiveTrustDevicePanel.setVisibility(View.GONE);
        if (!wasForEcode || academicAlsoInvalid) {
            if (preferences != null) preferences.edit().putBoolean(HAS_ACADEMIC_SESSION, false).apply();
            setLastAcademicLoginError(fullMessage);
            notifyDashboardLoginStatus("failed", fullMessage);
        } else {
            setEcodeError(fullMessage + " 请点击 E 码通区域的登录按钮手动完成登录。");
        }
        if (background) {
            hidePortalOverlays();
            if (portalWebView != null) portalWebView.setVisibility(View.GONE);
            if (dashboardHome != null) dashboardHome.setVisibility(View.VISIBLE);
            dashboardVisible = true;
        } else {
            setBuiltInLoginStatus(fullMessage, true);
            showBuiltInChallenge(false);
            applyPortalLoginMethodUi();
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
        if (!isPortalPageUrl(url) || url == null || !url.contains("/jwapp/")) return false;
        // ticket 还在地址上说明 CAS 尚未换票；此时 Cookie 探测必然失败。
        return academicCasTicketValue(url).isEmpty();
    }

    private boolean isEcodeTargetReadyUrl(String url) {
        if (url == null || isPortalLoginPage(url)) return false;
        if (url.contains(ECODE_TARGET_TOKEN)) return true;
        try {
            String host = new URL(url).getHost();
            return host != null && host.equalsIgnoreCase("ecode.neu.edu.cn");
        } catch (Exception ignored) {
            return url.contains("ecode.neu.edu.cn");
        }
    }

    private boolean isAcademicLoginInvalidResponse(int status, String body) {
        if (status == 401) return true;
        String text = body == null ? "" : body;
        if (text.length() > 600000) text = text.substring(0, 600000);
        String lower = text.toLowerCase(java.util.Locale.ROOT);
        String compact = lower.replaceAll("\\s+", "");
        // 教务接口不一定重定向到 HTML 登录页，也可能用 HTTP 200 返回
        // {loginRequired:true}、{authenticated:false} 或“请先登录”。
        // 只按“是否 JSON”判断会把这种失效响应误当成健康会话，导致
        // 后台自动登录根本不会启动。
        if (text.trim().startsWith("{")) {
            try {
                JSONObject payload = new JSONObject(text);
                String[] authCodeFields = {"code", "status", "errCode", "errorCode"};
                for (String field : authCodeFields) {
                    String code = String.valueOf(payload.opt(field)).trim();
                    if ("401".equals(code) || "403".equals(code)) return true;
                }
            } catch (Exception ignored) {
                // 后续仍用不依赖 JSON 解析的文本/HTML 规则判断。
            }
        }
        if (compact.contains("\"loginrequired\":true")
                || compact.contains("\"authenticated\":false")
                || compact.contains("\"loggedin\":false")
                || compact.contains("\"sessionvalid\":false")) {
            return true;
        }
        boolean explicitAuthText = lower.matches(
                "(?s).*(登录失效|请先登录|未登录|登录过期|会话(?:已)?(?:失效|过期)|统一身份认证|unauthori[sz]ed|authentication required|session expired|login required).*"
        );
        boolean forbiddenWithAuthContext = lower.contains("forbidden")
                && (lower.contains("login") || lower.contains("auth") || lower.contains("session")
                || lower.contains("登录") || lower.contains("认证"));
        if (explicitAuthText || forbiddenWithAuthContext) {
            return true;
        }
        return (lower.contains("/tpass/login") || lower.contains("id=\"loginform\"")
                || lower.contains("id='loginform'"))
                && (text.contains("统一身份认证") || lower.contains("uniform identity authentication"));
    }

    private void attemptBuiltInBackgroundLoginOrReport(String reason) {
        LoginCredentials saved = loadBuiltInCredentials();
        if (saved.isComplete() && !backgroundLoginAttemptedForCurrentFailure) {
            backgroundLoginAttemptedForCurrentFailure = true;
            backgroundLoginForEcode = false;
            pendingEcodeLoginUrl = "";
            notifyDashboardLoginStatus(
                    "retrying",
                    "教务会话已失效，正在后台使用本机加密凭据重登…"
            );
            submitBuiltInCredentials(true);
            return;
        }
        String failure = reason == null || reason.trim().isEmpty()
                ? "教务系统后台恢复失败"
                : reason.trim();
        if (!saved.isComplete()) {
            failure += "。本机没有可用于后台登录的加密凭据，请点击手动登录。";
        } else {
            failure += "。加密凭据后台重登也未成功，请点击手动登录。";
        }
        if (loginDiagnosticStartedAt <= 0L || !"failed".equals(loginDiagnosticStatus)) {
            beginLoginDiagnostics(true, saved.isComplete());
        }
        recordLoginDiagnostic(
                "background-gate",
                "未启动新的后台提交：" + (saved.isComplete() ? "本次失败已尝试过后台登录" : "没有可用的加密凭据")
        );
        finishLoginDiagnosticsFailure(failure);
        setLastAcademicLoginError(failure);
        notifyDashboardLoginStatus("failed", failure);
    }

    private void markAcademicSessionHealthy() {
        runOnUiThread(() -> {
            if (backgroundLoginInProgress) return;
            academicNetworkFailureStreak = 0;
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
            if (backgroundLoginInProgress) {
                pendingAcademicFailureReason = reason;
                return;
            }
            setLastAcademicLoginError(reason);
            if (preferences != null) preferences.edit().putBoolean(HAS_ACADEMIC_SESSION, false).apply();
            pendingAcademicFailureReason = reason;
            attemptBuiltInBackgroundLoginOrReport(reason);
        });
    }

    private void handleEcodeSessionInvalid(String detail, String loginUrl) {
        runOnUiThread(() -> {
            String reason = detail == null || detail.trim().isEmpty()
                    ? "E 码通登录状态已失效"
                    : detail.trim();
            ecodeSessionReady = false;
            ecodeReloadAfterBackgroundLogin = true;
            if (isPortalLoginPage(loginUrl)) pendingEcodeLoginUrl = loginUrl;
            if (!dashboardVisible) return;
            if (backgroundLoginInProgress) {
                setEcodeError(reason + "，正在等待当前后台登录完成…");
                return;
            }
            LoginCredentials saved = loadBuiltInCredentials();
            if (saved.isComplete() && !ecodeBackgroundLoginAttemptedForCurrentFailure) {
                ecodeBackgroundLoginAttemptedForCurrentFailure = true;
                backgroundLoginForEcode = true;
                setEcodeError(reason + "，正在后台使用本机加密凭据重新登录…");
                submitBuiltInCredentials(true);
                return;
            }
            if (!saved.isComplete()) {
                setEcodeError(reason + "。本机没有可用于后台登录的加密凭据，请点击登录按钮手动登录。");
            } else {
                setEcodeError(reason + "。后台自动登录未成功，请点击登录按钮手动登录。");
            }
        });
    }

    private void reloadEcodeAfterBackgroundLogin() {
        if (ecodeWebView == null) return;
        ecodeReloadAfterBackgroundLogin = false;
        ecodeAutoScrolled = false;
        ecodeProbeAttempts = 0;
        setEcodeError("后台登录成功，正在重新加载学校原网页…");
        ecodeWebView.stopLoading();
        ecodeWebView.loadUrl(ecodeUrl());
    }

    /**
     * 内置登录页里的手机验证码入口只负责切换到同一个官方认证 WebView；
     * 图形验证码、短信发送、Cookie 和跳转仍由学校页面自己的脚本处理。
     */
    private void startBuiltInMobileLogin() {
        if (portalWebView == null || backgroundLoginInProgress) return;
        cancelAutomaticBackgroundLogin();
        loginMethodForCurrentPortal = LOGIN_METHOD_BUILT_IN;
        builtInMobileLoginMode = true;
        builtInLoginSubmissionPending = false;
        builtInLoginAwaitingPage = false;
        builtInLoginChallengeVisible = false;
        builtInInteractiveChallengeVisible = false;
        if (interactiveTrustDeviceCheck != null) {
            interactiveTrustDeviceCheck.setChecked(
                    builtInTrustDeviceCheck == null || builtInTrustDeviceCheck.isChecked()
            );
        }
        showBuiltInChallenge(false);
        showPortal(true);
        portalWebView.postDelayed(this::activatePortalMobileLogin, BUILT_IN_LOGIN_TAB_SETTLE_MS);
    }

    private void stopBuiltInMobileLoginMode() {
        if (!builtInMobileLoginMode) return;
        builtInMobileLoginMode = false;
        loginMethodForCurrentPortal = LOGIN_METHOD_BUILT_IN;
        builtInLoginSubmissionPending = false;
        builtInLoginAwaitingPage = false;
        builtInLoginChallengeVisible = false;
        builtInInteractiveChallengeVisible = false;
        showBuiltInChallenge(false);
        showPortal(true);
    }

    /**
     * 学校页面目前把手机登录标签注释掉，但仍保留完整的 mobile_template
     * 和 loginByMobile()。这里仅让官方脚本渲染并处理它，不在原生层复制
     * 图形验证码、短信发送或手机登录接口。
     */
    private void activatePortalMobileLogin() {
        boolean mobileLoginActive = LOGIN_METHOD_MOBILE.equals(loginMethodForCurrentPortal)
                || builtInMobileLoginMode;
        if (portalWebView == null
                || !mobileLoginActive
                || !isPortalLoginPage(portalWebView.getUrl())) return;
        String script = "(function(){"
                + "var content=document.getElementById('login_content'),template=document.getElementById('mobile_template');"
                + "if(!content||!template)return JSON.stringify({ok:false,error:'学校页面未提供手机验证码登录模板'});"
                + "if(document.getElementById('loginMobile')&&document.getElementById('codeImage'))return JSON.stringify({ok:true,active:true});"
                + "content.innerHTML=template.innerHTML;"
                // 当前学校 HTML 把手机登录 tab 注释掉了。先补一个只供官方
                // initPassWordEvent 绑定的隐藏入口，再触发学校自己的 click
                // handler；这样 handler 会在其原有脚本上下文里调用
                // loginByMobile()，不需要原生复制 loginByMorE 协议。
                + "var mobileTab=document.createElement('a');mobileTab.id='loginByMobile';mobileTab.style.display='none';mobileTab.textContent='手机登录';content.insertBefore(mobileTab,content.firstChild);"
                + "try{"
                + "if(typeof window.initPassWordEvent!=='function')return JSON.stringify({ok:false,error:'学校页面手机验证码脚本不可用'});"
                + "window.initPassWordEvent();"
                + "mobileTab.click();"
                + "return JSON.stringify({ok:true,active:Boolean(document.getElementById('loginMobile')&&document.getElementById('codeImage'))});"
                + "}catch(error){return JSON.stringify({ok:false,error:String(error&&error.message||error).slice(0,120)});}"
                + "})();";
        portalWebView.evaluateJavascript(script, value -> {
            try {
                JSONObject result = new JSONObject(decodeJavascriptString(value));
                if (!result.optBoolean("ok", false)) {
                    Toast.makeText(this,
                            result.optString("error", "学校手机验证码登录暂不可用"),
                            Toast.LENGTH_LONG).show();
                } else if (builtInMobileLoginMode) {
                    portalWebView.postDelayed(this::syncPortalTrustDeviceSelection, 120L);
                }
            } catch (Exception error) {
                Toast.makeText(this, "学校手机验证码登录页面初始化失败，请改用原网页账密或二维码登录。", Toast.LENGTH_LONG).show();
            }
        });
    }

    private void selectPortalLoginMethod(String method) {
        if (LOGIN_METHOD_MOBILE.equals(method)) {
            // 兼容旧版本可能发来的内部方法值，但不再把手机验证码作为
            // 顶部并列页面；它统一归入内置登录流程。
            startBuiltInMobileLogin();
            return;
        }
        boolean wasBuiltInMobileLoginMode = builtInMobileLoginMode;
        if (!LOGIN_METHOD_BUILT_IN.equals(method) && builtInLoginSubmissionPending && !backgroundLoginInProgress) {
            // 切换到官方页面入口时，取消尚未完成的原生提交；否则旧页面的
            // onPageFinished/轮询回调可能在新登录方式后面误报成功。
            activeLoginOperationId = ++loginOperationSequence;
            builtInLoginSubmissionPending = false;
            builtInLoginAwaitingPage = false;
            builtInLoginChallengeVisible = false;
            builtInInteractiveChallengeVisible = false;
            pendingBuiltInPassword = "";
            showBuiltInChallenge(false);
        }
        if (LOGIN_METHOD_WECHAT.equals(method)) loginMethodForCurrentPortal = LOGIN_METHOD_WECHAT;
        else if (LOGIN_METHOD_PASSWORD.equals(method)) loginMethodForCurrentPortal = LOGIN_METHOD_PASSWORD;
        else loginMethodForCurrentPortal = LOGIN_METHOD_BUILT_IN;
        builtInMobileLoginMode = false;
        if (preferences != null && isPersistentLoginMethod(loginMethodForCurrentPortal)) {
            preferences.edit().putString(DEFAULT_LOGIN_METHOD, loginMethodForCurrentPortal).apply();
        }
        if (portalWebView == null) return;
        applyPortalLoginMethodUi();
        if (LOGIN_METHOD_BUILT_IN.equals(loginMethodForCurrentPortal)) {
            if (wasBuiltInMobileLoginMode) showPortal(true);
            return;
        }
        if (wasBuiltInMobileLoginMode) showPortal(true);
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
        if (url == null || url.isEmpty() || !url.contains("/tpass/qyQrLogin") || !url.contains("uuid=")) {
            return false;
        }
        return url.startsWith("https://webvpn.neu.edu.cn/")
                || url.startsWith("https://pass.neu.edu.cn/");
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
        applyEcodePanelChrome(panel, false);

        ecodeWebView.setBackgroundColor(getColor(R.color.native_background));
        ecodeWebView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        panel.addView(ecodeWebView, fullScreenParams());

        ecodeCollapsedCard = new FrameLayout(this);
        ecodeCollapsedCard.setBackground(roundBackground(getColor(R.color.native_surface), 0));
        ecodeCollapsedCard.setContentDescription("校园码，点击查看完整 E 码通");
        ecodeCollapsedCard.setOnClickListener(view -> setEcodeExpanded(true));

        FrameLayout ecodeThumbnailShell = new FrameLayout(this);
        ecodeThumbnailShell.setBackground(roundBackground(getColor(R.color.native_ecode_thumbnail), 8));
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
        ecodeTitle.setTextColor(getColor(R.color.native_text_primary));
        ecodeTitle.setTextSize(14);
        ecodeTitle.setTypeface(null, android.graphics.Typeface.BOLD);
        ecodeCopy.addView(ecodeTitle, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        ecodeCollapsedTimeView = new TextView(this);
        ecodeCollapsedTimeView.setText("点击查看完整 E 码通");
        ecodeCollapsedTimeView.setTextColor(getColor(R.color.native_text_secondary));
        ecodeCollapsedTimeView.setTextSize(11);
        LinearLayout.LayoutParams ecodeTimeParams = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        ecodeTimeParams.topMargin = dp(4);
        ecodeCopy.addView(ecodeCollapsedTimeView, ecodeTimeParams);
        FrameLayout.LayoutParams copyParams = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER_VERTICAL | Gravity.START);
        copyParams.setMargins(dp(100), 0, dp(52), 0);
        ecodeCollapsedCard.addView(ecodeCopy, copyParams);

        TextView ecodeArrow = new TextView(this);
        ecodeArrow.setText("›");
        ecodeArrow.setTextColor(getColor(R.color.native_brand_text));
        ecodeArrow.setTextSize(25);
        ecodeArrow.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams arrowParams = new FrameLayout.LayoutParams(dp(40), FrameLayout.LayoutParams.MATCH_PARENT, Gravity.END);
        arrowParams.setMargins(0, 0, dp(8), 0);
        ecodeCollapsedCard.addView(ecodeArrow, arrowParams);
        View ecodeHeaderDivider = new View(this);
        ecodeHeaderDivider.setBackgroundColor(getColor(R.color.native_border));
        ecodeCollapsedCard.addView(
                ecodeHeaderDivider,
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        Math.max(1, dp(1)),
                        Gravity.BOTTOM
                )
        );
        panel.addView(ecodeCollapsedCard, fullScreenParams());

        ecodeErrorView = new TextView(this);
        ecodeErrorView.setTextColor(getColor(R.color.native_error));
        ecodeErrorView.setTextSize(11);
        ecodeErrorView.setGravity(Gravity.CENTER_VERTICAL);
        ecodeErrorView.setMaxLines(3);
        ecodeErrorView.setPadding(dp(10), dp(7), dp(10), dp(7));
        ecodeErrorView.setBackground(roundBackground(withAlpha(getColor(R.color.native_error_surface), 235), 12));
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
        ecodeCollapseButton.setTextColor(getColor(R.color.native_text_primary));
        ecodeCollapseButton.setTextSize(12);
        ecodeCollapseButton.setGravity(Gravity.CENTER);
        ecodeCollapseButton.setBackground(roundBackground(withAlpha(getColor(R.color.native_surface), 230), 18));
        ecodeCollapseButton.setOnClickListener(view -> setEcodeExpanded(false));
        ecodeCollapseButton.setVisibility(View.GONE);
        FrameLayout.LayoutParams collapseParams = new FrameLayout.LayoutParams(dp(58), dp(34), Gravity.TOP | Gravity.END);
        collapseParams.setMargins(0, dp(10), dp(76), 0);
        panel.addView(ecodeCollapseButton, collapseParams);

        ecodeRefreshButton = new TextView(this);
        ecodeRefreshButton.setText("刷新");
        ecodeRefreshButton.setTextColor(getColor(R.color.native_text_primary));
        ecodeRefreshButton.setTextSize(12);
        ecodeRefreshButton.setGravity(Gravity.CENTER);
        ecodeRefreshButton.setContentDescription("刷新校园 E 码通原网页");
        ecodeRefreshButton.setBackground(roundBackground(withAlpha(getColor(R.color.native_surface), 230), 18));
        ecodeRefreshButton.setOnClickListener(view -> refreshEcodePage());
        FrameLayout.LayoutParams refreshParams = new FrameLayout.LayoutParams(dp(58), dp(34), Gravity.TOP | Gravity.END);
        refreshParams.setMargins(0, dp(10), dp(10), 0);
        panel.addView(ecodeRefreshButton, refreshParams);

        ecodeLoginButton = new TextView(this);
        ecodeLoginButton.setText("登录");
        ecodeLoginButton.setTextColor(getColor(R.color.native_text_primary));
        ecodeLoginButton.setTextSize(12);
        ecodeLoginButton.setGravity(Gravity.CENTER);
        ecodeLoginButton.setContentDescription("单独登录校园 E 码通");
        ecodeLoginButton.setBackground(roundBackground(withAlpha(getColor(R.color.native_surface), 230), 18));
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
        applyEcodePanelChrome(ecodePanel, expanded);

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
        // E 码通与教务系统分别检查业务会话。直接刷新 E 码通目标；若它
        // 跳回统一认证页，由独立后台登录流程恢复，不再借道教务入口。
        ecodeWebView.loadUrl(ecodeUrl());
    }

    private void openEcodeLogin() {
        if (ecodeWebView == null) return;
        setEcodeExpanded(true);
        ecodeAutoScrolled = false;
        ecodeProbeAttempts = 0;
        setEcodeError("已展开 E 码通原网页，可在这里单独登录；不会影响教务系统会话");
        ecodeWebView.stopLoading();
        ecodeWebView.loadUrl(ecodeUrl());
    }

    private void setEcodePanelHidden(boolean hidden) {
        if (ecodePanel == null) return;
        // 展开状态也必须参与主页面的滚动联动。否则展开面板会一直覆盖
        // 主页面的大部分触摸区域，用户只能在底部极窄的区域里尝试滚动。
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
                    ecodeAutoScrolled = true;
                    ecodeSessionReady = true;
                    ecodeBackgroundLoginAttemptedForCurrentFailure = false;
                    ecodeReloadAfterBackgroundLogin = false;
                    pendingEcodeLoginUrl = "";
                    ecodeProbeAttempts = 0;
                    captureEcodeThumbnail(payload.optString("time", ""));
                    clearEcodeError();
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
        refreshDashboardData(false);
    }

    private void refreshDashboardData(boolean forceTerms) {
        // Android 的 JS 启动握手、手动回到首页和登录成功回调都可能同时
        // 到达；dashboard.js 自己负责 single-flight/coalescing，这里只做一次
        // 轻量的桥接转发，绝不在 E 码通 ready 时额外刷新。
        if (dashboardWebView == null || !dashboardLoaded || !dashboardPageReady) return;
        cookieManager.flush();
        dashboardWebView.post(() -> dashboardWebView.evaluateJavascript(
                "window.__refreshDashboard && window.__refreshDashboard(" + forceTerms + ");", null));
    }

    private void requestDashboardRefreshAfterSessionProbe(boolean forceTerms) {
        dashboardRefreshPending = true;
        dashboardRefreshForceTerms = dashboardRefreshForceTerms || forceTerms;
    }

    private void flushPendingDashboardRefresh() {
        if (!dashboardRefreshPending || !dashboardPageReady) return;
        boolean forceTerms = dashboardRefreshForceTerms;
        dashboardRefreshPending = false;
        dashboardRefreshForceTerms = false;
        refreshDashboardData(forceTerms);
    }

    /**
     * 只在 Dashboard 文档已完成、JS 已明确发出启动信号且当前仍停留首页时，
     * 启动一次会话探测和数据刷新。两边事件先后顺序不再影响首屏。
     */
    private void completeDashboardHandshakeIfReady() {
        if (!dashboardVisible || !dashboardPageReady
                || !dashboardHandshakeSignalReceived || dashboardHandshakeReceived) return;
        if (!accessNetworkProbeDone) return;
        dashboardHandshakeReceived = true;
        requestDashboardRefreshAfterSessionProbe(false);
        long now = System.currentTimeMillis();
        if (lastAcademicSessionHealthyAt > 0L
                && now - lastAcademicSessionHealthyAt < ACADEMIC_PROBE_COOLDOWN_MS) {
            flushPendingDashboardRefresh();
        } else {
            requestAcademicSessionProbe("dashboard-start");
        }
    }

    private static final class AcademicProbeResult {
        static final int HEALTHY = 1;
        static final int INVALID = 2;
        static final int UNKNOWN = 3;
        final int kind;
        final int status;
        final String detail;

        AcademicProbeResult(int kind, int status, String detail) {
            this.kind = kind;
            this.status = status;
            this.detail = detail == null ? "" : detail;
        }
    }

    private void requestAcademicSessionProbe(String reason) {
        requestAcademicSessionProbe(reason, 0L, false);
    }

    private void requestAcademicSessionProbe(String reason, long loginOperationId) {
        requestAcademicSessionProbe(reason, loginOperationId, false);
    }

    private void requestAcademicSessionProbe(String reason, long loginOperationId, boolean force) {
        // 探测只依赖 WebVPN Cookie；后台登录刚完成时 Dashboard 文档可能
        // 仍在加载，不能因为 dashboardPageReady 尚未置位而放弃登录后验证。
        if (dashboardWebView == null || !dashboardLoaded || !dashboardVisible) return;
        final long now = System.currentTimeMillis();
        final long probeId;
        final long probeEpoch;
        synchronized (this) {
            if (academicProbeInFlight) {
                if (loginOperationId <= 0L) return;
                // 登录成功后的验证拥有更高优先级；旧探测仍会自然结束，但
                // activeAcademicProbeId 被替换后其回调会被丢弃。
                academicProbeInFlight = false;
            }
            if (!force && loginOperationId <= 0L && now - lastAcademicProbeAt < ACADEMIC_PROBE_COOLDOWN_MS) return;
            academicProbeInFlight = true;
            lastAcademicProbeAt = now;
            probeId = ++academicProbeSequence;
            activeAcademicProbeId = probeId;
            probeEpoch = sessionEpoch;
            activeAcademicProbeEpoch = probeEpoch;
            activeAcademicProbeLoginOperationId = loginOperationId;
        }
        final String trigger = reason == null || reason.trim().isEmpty() ? "unknown" : reason.trim();
        networkExecutor.execute(() -> performAcademicSessionProbe(probeId, probeEpoch, loginOperationId, trigger));
    }

    private void performAcademicSessionProbe(long probeId, long probeEpoch, long loginOperationId, String reason) {
        long deadline = System.currentTimeMillis() + ACADEMIC_PROBE_TOTAL_BUDGET_MS;
        AcademicProbeResult result = probeAcademicEndpoint(
                academicRootUrl() + "/jwapp/sys/homeapp/api/home/currentUser.do",
                Math.min(ACADEMIC_PROBE_TIMEOUT_MS, Math.max(500, (int) (deadline - System.currentTimeMillis())))
        );
        // currentUser.do 是最快的探测；只有它无法判断时才用同一 WebVPN
        // 代理下的 kb/xnxq.do 兜底，两个请求总预算约 5 秒。
        if (result.kind == AcademicProbeResult.UNKNOWN && System.currentTimeMillis() < deadline) {
            result = probeAcademicEndpoint(
                    academicRootUrl() + "/jwapp/sys/homeapp/api/home/kb/xnxq.do",
                    Math.min(ACADEMIC_PROBE_TIMEOUT_MS, Math.max(500, (int) (deadline - System.currentTimeMillis())))
            );
        }
        final AcademicProbeResult finalResult = result;
        runOnUiThread(() -> finishAcademicSessionProbe(
                probeId, probeEpoch, loginOperationId, reason, finalResult
        ));
    }

    private AcademicProbeResult probeAcademicEndpoint(String urlText, int timeoutMs) {
        HttpURLConnection connection = null;
        try {
            if (!isAllowedNativeRequestUrl(urlText)) {
                return new AcademicProbeResult(AcademicProbeResult.UNKNOWN, -1, "探测地址不在允许的学校范围内");
            }
            URL url = new URL(urlText);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(timeoutMs);
            connection.setReadTimeout(timeoutMs);
            connection.setInstanceFollowRedirects(true);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json, text/plain, */*");
            connection.setRequestProperty("Fetch-Api", "true");
            String cookie = cookieManager.getCookie(urlText);
            if (cookie != null && !cookie.isEmpty()) connection.setRequestProperty("Cookie", cookie);
            int status = connection.getResponseCode();
            storeResponseCookies(urlText, connection.getHeaderFields());
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String body = readResponseLimited(stream, 180000);
            if (isAcademicLoginInvalidResponse(status, body)) {
                return new AcademicProbeResult(AcademicProbeResult.INVALID, status, "WebVPN 返回统一身份认证登录页");
            }
            String trimmed = body.trim();
            if (status >= 200 && status < 400
                    && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
                return new AcademicProbeResult(AcademicProbeResult.HEALTHY, status, "轻量会话探测成功");
            }
            return new AcademicProbeResult(AcademicProbeResult.UNKNOWN, status,
                    "WebVPN 探测未返回可确认的 JSON 会话数据（HTTP " + status + "）");
        } catch (Exception error) {
            return new AcademicProbeResult(
                    AcademicProbeResult.UNKNOWN,
                    -1,
                    error.getMessage() == null ? "WebVPN 会话探测超时或网络不可用" : error.getMessage()
            );
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void finishAcademicSessionProbe(long probeId, long probeEpoch, long loginOperationId,
                                            String reason, AcademicProbeResult result) {
        synchronized (this) {
            if (!academicProbeInFlight || activeAcademicProbeId != probeId || activeAcademicProbeEpoch != probeEpoch) return;
            academicProbeInFlight = false;
        }
        // 登录开始后，登录前发出的探测结果只允许结束自己的网络请求，不能
        // 覆盖新一轮 Cookie 或把当前登录重新打成失败。
        if (probeEpoch != sessionEpoch && !(postLoginVerificationPending && loginOperationId == postLoginOperationId)) return;
        if (result.kind == AcademicProbeResult.HEALTHY) {
            academicNetworkFailureStreak = 0;
            lastAcademicSessionHealthyAt = System.currentTimeMillis();
            markAcademicSessionHealthy();
            if (postLoginVerificationPending && loginOperationId == postLoginOperationId) {
                completePostLoginRecovery(loginOperationId);
            } else {
                flushPendingDashboardRefresh();
            }
            return;
        }
        if (result.kind == AcademicProbeResult.INVALID) {
            academicNetworkFailureStreak = 0;
            if (postLoginVerificationPending && loginOperationId == postLoginOperationId) {
                finishPostLoginVerificationFailure(
                        "登录后轻量会话验证失败：教务系统仍返回统一身份认证页面。"
                );
                return;
            }
            handleAcademicSessionInvalid("轻量会话探测确认教务登录状态已失效");
            return;
        }

        // 超时/服务器错误只累计“待探测”状态，第一次失败绝不直接提交密码。
        // 连续两次且已有会话提示时，才允许进入一次受冷却保护的恢复流程。
        academicNetworkFailureStreak += 1;
        if (postLoginVerificationPending && loginOperationId == postLoginOperationId) {
            finishPostLoginVerificationFailure(
                    "登录后无法确认教务会话：WebVPN 暂时不可用，请稍后重试。"
            );
            return;
        }
        boolean hasSessionHint = preferences != null && preferences.getBoolean(HAS_ACADEMIC_SESSION, false);
        long now = System.currentTimeMillis();
        // 即使连续失败，也只保留缓存并等待下一次冷却后的探测；未知网络
        // 状态不能直接调用 handleAcademicSessionInvalid，否则离线时会消耗
        // 后台登录尝试并形成“网络恢复前反复登录”的循环。
        if (academicNetworkFailureStreak >= NETWORK_FAILURES_BEFORE_PROBE && hasSessionHint) {
            Log.w(LOG_TAG, "academic session probe deferred after network failure: " + reason);
        }
        notifyDashboardLoginStatus("probe", "WebVPN 暂时不可用，保留本地数据并等待网络恢复…");
    }

    private void finishPostLoginVerificationFailure(String message) {
        boolean ecodeOnly = postLoginVerificationForEcode && !postLoginHadAcademicFailure;
        postLoginVerificationPending = false;
        postLoginVerificationForEcode = false;
        postLoginHadAcademicFailure = false;
        postLoginOperationId = 0L;
        // E 码通单独恢复时，教务会话不应被一次探测异常错误地写成失效。
        if (ecodeOnly) {
            setEcodeError(message + " E 码通原网页会保留当前状态，请稍后重试或手动登录。");
            return;
        }
        finishBuiltInLoginFailure(message, true);
    }

    private void completePostLoginRecovery(long operationId) {
        if (!postLoginVerificationPending || postLoginOperationId != operationId) return;
        boolean forEcode = postLoginVerificationForEcode;
        boolean hadAcademicFailure = postLoginHadAcademicFailure;
        postLoginVerificationPending = false;
        postLoginVerificationForEcode = false;
        postLoginHadAcademicFailure = false;
        postLoginOperationId = 0L;
        pendingAcademicFailureReason = "";
        backgroundLoginAttemptedForCurrentFailure = false;
        notifyDashboardLoginStatus("success", "后台登录成功，正在刷新教务数据…");
        // E 码通单独失效时只重载 E 码通；两者同时失效或教务本身失效时，
        // 才由这一处触发唯一一次教务刷新。
        if (hadAcademicFailure || !forEcode) {
            requestDashboardRefreshAfterSessionProbe(true);
            flushPendingDashboardRefresh();
        }
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

    private void applyEcodePanelChrome(FrameLayout panel, boolean expanded) {
        if (panel == null) return;
        if (expanded) {
            panel.setBackground(roundBackground(getColor(R.color.native_surface), 0, 0, 12, 12));
            panel.setElevation(dp(2));
        } else {
            panel.setBackground(roundBackground(getColor(R.color.native_surface), 0));
            panel.setElevation(0f);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            panel.setClipToOutline(expanded);
        }
    }

    private GradientDrawable roundBackground(int color, int radiusDp) {
        return roundBackground(color, radiusDp, radiusDp, radiusDp, radiusDp);
    }

    private int withAlpha(int color, int alpha) {
        return Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color));
    }

    private GradientDrawable roundBackground(int color, int topLeftDp, int topRightDp, int bottomRightDp, int bottomLeftDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        float topLeft = dp(topLeftDp);
        float topRight = dp(topRightDp);
        float bottomRight = dp(bottomRightDp);
        float bottomLeft = dp(bottomLeftDp);
        drawable.setCornerRadii(new float[] {
                topLeft, topLeft,
                topRight, topRight,
                bottomRight, bottomRight,
                bottomLeft, bottomLeft
        });
        return drawable;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private boolean isDarkMode() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (dashboardVisible) {
            long now = System.currentTimeMillis();
            boolean stayedInBackgroundLongEnough = lastBackgroundAt > 0L
                    && now - lastBackgroundAt >= FOREGROUND_PROBE_INTERVAL_MS;
            lastBackgroundAt = 0L;
            if (stayedInBackgroundLongEnough && now - lastForegroundProbeAt >= FOREGROUND_PROBE_INTERVAL_MS) {
                lastForegroundProbeAt = now;
                // 前台恢复代表用户可能刚从无网环境回来；先登记一次待同步
                // 意图，只有 HEALTHY 探测才真正刷新，UNKNOWN 不会触发重登。
                requestDashboardRefreshAfterSessionProbe(false);
                requestAcademicSessionProbe("foreground-resume");
            }
        } else if (portalActionButton != null) {
            updatePortalActionLabel(portalWebView == null ? "" : portalWebView.getUrl());
            if (portalWebView != null) {
                portalWebView.postDelayed(this::installPortalQrCapture, 160);
            }
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (dashboardVisible) lastBackgroundAt = System.currentTimeMillis();
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
        public void dashboardReady() {
            runOnUiThread(() -> {
                if (!dashboardVisible) return;
                dashboardHandshakeSignalReceived = true;
                completeDashboardHandshakeIfReady();
            });
        }

        @android.webkit.JavascriptInterface
        public void probeAcademicSession(String reason) {
            requestAcademicSessionProbe(reason == null ? "page-request" : reason);
        }

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
        public String getAccessNetworkMode() {
            return accessNetworkMode == null ? ACCESS_NETWORK_AUTO : accessNetworkMode;
        }

        @android.webkit.JavascriptInterface
        public String getAccessNetworkResolved() {
            return accessNetworkResolved == null ? ACCESS_NETWORK_WEBVPN : accessNetworkResolved;
        }

        @android.webkit.JavascriptInterface
        public void setAccessNetworkMode(String mode, String resolved) {
            runOnUiThread(() -> applyResolvedAccessNetwork(
                    normalizeAccessNetworkMode(mode),
                    normalizeAccessNetworkResolved(resolved),
                    false
            ));
        }

        @android.webkit.JavascriptInterface
        public void reloadAccessNetworkEndpoints() {
            MainActivity.this.reloadAccessNetworkEndpoints();
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
        public boolean getToastNotificationsEnabled() {
            return preferences == null || preferences.getBoolean(TOAST_NOTIFICATIONS_ENABLED, true);
        }

        @android.webkit.JavascriptInterface
        public void setToastNotificationsEnabled(boolean enabled) {
            if (preferences != null) {
                preferences.edit().putBoolean(TOAST_NOTIFICATIONS_ENABLED, enabled).apply();
            }
        }

        @android.webkit.JavascriptInterface
        public String getCurrentTermSettings() {
            return preferences == null ? "" : preferences.getString(CURRENT_TERM_SETTINGS, "");
        }

        @android.webkit.JavascriptInterface
        public void setCurrentTermSettings(String payload) {
            if (preferences == null) return;
            String normalized = payload == null ? "" : payload.trim();
            // 这里只保存模式、学期代码、来源和同步时间；限制大小，避免页面误传大对象。
            if (normalized.length() > 4096) return;
            if (normalized.isEmpty()) preferences.edit().remove(CURRENT_TERM_SETTINGS).apply();
            else preferences.edit().putString(CURRENT_TERM_SETTINGS, normalized).apply();
        }

        @android.webkit.JavascriptInterface
        public String getCampusSetting() {
            return preferences == null ? "" : preferences.getString(CAMPUS_SETTING, "");
        }

        @android.webkit.JavascriptInterface
        public void setCampusSetting(String value) {
            if (preferences == null) return;
            String normalized = value == null ? "" : value.trim().toLowerCase(java.util.Locale.ROOT);
            if (!"nanhu".equals(normalized) && !"hunnan".equals(normalized)) {
                preferences.edit().remove(CAMPUS_SETTING).apply();
                return;
            }
            preferences.edit().putString(CAMPUS_SETTING, normalized).apply();
        }

        @android.webkit.JavascriptInterface
        public String getLoginError() {
            return lastAcademicLoginError == null ? "" : lastAcademicLoginError;
        }

        @android.webkit.JavascriptInterface
        public String getLoginDiagnostics() {
            return buildLoginDiagnostics();
        }

        @android.webkit.JavascriptInterface
        public boolean copyLoginDiagnostics() {
            return copyLoginDiagnosticsToClipboard();
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
            if (!isAllowedNativeRequestUrl(urlText)) {
                deliver(requestId, -1, "只允许访问东北大学教务、统一认证、E 码通或 WebVPN 地址");
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
            recordAcademicNetworkFailure(error.getMessage());
            deliver(requestId, -1, error.getMessage() == null ? "原生网络请求失败" : error.getMessage());
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void recordAcademicNetworkFailure(String detail) {
        runOnUiThread(() -> {
            academicNetworkFailureStreak += 1;
            // 业务请求超时只触发轻量探测，不直接启动密码提交；探测自身
            // 还有冷却和连续失败阈值，离线时不会形成登录循环。
            if (academicNetworkFailureStreak >= NETWORK_FAILURES_BEFORE_PROBE
                    && !backgroundLoginInProgress
                    && dashboardVisible
                    && System.currentTimeMillis() - lastNetworkRecoveryAt >= ACADEMIC_PROBE_COOLDOWN_MS) {
                lastNetworkRecoveryAt = System.currentTimeMillis();
                requestAcademicSessionProbe("network-recovery");
            }
        });
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

    private String readResponseLimited(InputStream stream, int maxChars) throws IOException {
        if (stream == null) return "";
        StringBuilder result = new StringBuilder(Math.min(maxChars, 8192));
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            char[] buffer = new char[4096];
            int read;
            while ((read = reader.read(buffer)) >= 0 && result.length() < maxChars) {
                int remaining = maxChars - result.length();
                result.append(buffer, 0, Math.min(read, remaining));
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
