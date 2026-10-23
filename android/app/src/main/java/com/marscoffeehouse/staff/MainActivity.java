package com.marscoffeehouse.staff;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/*
 * The staff dashboard as a tablet app (owner, 2026-10-23: "for dashboard, build application .apk for tablets").
 * One full-screen WebView on the live dashboard, so every push to the site reaches the tablets with no new APK.
 * What the app adds over a browser tab:
 *  - the screen stays on, and the page keeps running while the app is open;
 *  - the new-order chime plays without a tap first;
 *  - receipts print on a Sunmi's built-in printer with no window (SunmiPrinter), elsewhere through Android's print
 *    service (the page's hidden-frame print is caught by SHIM below);
 *  - WhatsApp, phone and Maps links open their own apps;
 *  - photo uploads in Drinks / Food open the file picker;
 *  - with no internet it says so and retries every 10 seconds.
 */
public class MainActivity extends Activity {
    // an old browser engine (the Sunmi D2mini's Android 8.1, before Chrome 85) gets the site's old-engine copy
    static final String MODERN_URL = "https://www.marscoffeehouse.com/#staff";
    static final String OLD_URL = "https://www.marscoffeehouse.com/old/#staff";
    static final int MODERN_ENGINE = 85;
    private String startUrl = MODERN_URL;
    static final String SITE = "marscoffeehouse.com";
    static final int PICK_FILE = 1;

    private WebView web;
    private TextView offline;
    private boolean failed;
    private ValueCallback<Uri[]> pickCallback;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<WebView> printing = new ArrayList<>(); // print views kept alive until printed

    /* Injected into every page: route the receipt frame's print() and outside window.open() links to the app. */
    private static final String SHIM = "(function(){if(window.__marsApp)return;window.__marsApp=1;"
        + "function send(d){MarsAndroid.printHtml('<!doctype html>'+d.documentElement.outerHTML,d.title||'Mars receipt')}"
        + "window.print=function(){send(document)};"
        + "var cw=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'contentWindow');"
        + "Object.defineProperty(HTMLIFrameElement.prototype,'contentWindow',{configurable:true,get:function(){"
        + "var w=cw.get.call(this);if(w&&!w.__marsPrint){try{w.__marsPrint=1;w.print=function(){send(w.document);"
        + "setTimeout(function(){w.dispatchEvent(new Event('afterprint'))},1500)}}catch(e){}}return w}});"
        + "var op=window.open;window.open=function(u,t,f){try{var x=new URL(u,location.href);"
        + "if(x.hostname.indexOf('" + SITE + "')<0){MarsAndroid.openExternal(x.href);return null}}catch(e){}"
        + "return op.call(window,u,t,f)};})();";

    private SunmiPrinter printer;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        WebView.enableSlowWholeDocumentDraw(); // the receipt is drawn whole into a picture for the Sunmi printer
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        offline = new TextView(this);
        offline.setText("No internet connection.\nTrying again every 10 seconds…");
        offline.setTextSize(22);
        offline.setTextColor(Color.parseColor("#203469"));
        offline.setBackgroundColor(Color.WHITE);
        offline.setGravity(Gravity.CENTER);
        offline.setVisibility(View.GONE);
        root.addView(offline, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        hideBars();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false); // target=_blank links come through shouldOverrideUrlLoading
        if (engineVersion(s.getUserAgentString()) < MODERN_ENGINE) startUrl = OLD_URL;
        s.setUserAgentString(s.getUserAgentString() + " MarsStaffApp/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        web.addJavascriptInterface(new Bridge(), "MarsAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                String host = u.getHost();
                if (("https".equals(u.getScheme()) || "http".equals(u.getScheme())) && host != null && host.endsWith(SITE)) return false;
                openExternal(u.toString());
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                v.evaluateJavascript(SHIM, null);
                if (!failed) offline.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (!r.isForMainFrame()) return;
                failed = true;
                offline.setVisibility(View.VISIBLE);
                main.postDelayed(() -> { failed = false; web.loadUrl(startUrl); }, 10000);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (pickCallback != null) pickCallback.onReceiveValue(null);
                pickCallback = cb;
                try {
                    startActivityForResult(p.createIntent(), PICK_FILE);
                } catch (ActivityNotFoundException e) {
                    pickCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (saved != null) web.restoreState(saved);
        else web.loadUrl(startUrl);
        printer = new SunmiPrinter(this, root);
    }

    @Override
    protected void onDestroy() {
        printer.close();
        super.onDestroy();
    }

    /* the WebView's Chrome version from its user agent ("… Chrome/69.0.3497.100 …"); 0 when it cannot be read */
    static int engineVersion(String ua) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("Chrome/(\\d+)").matcher(ua);
        return m.find() ? Integer.parseInt(m.group(1)) : 0;
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == PICK_FILE && pickCallback != null) {
            pickCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            pickCallback = null;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) hideBars();
    }

    @SuppressWarnings("deprecation")
    private void hideBars() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    void openExternal(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No app on this tablet can open this link", Toast.LENGTH_LONG).show();
        }
    }

    /* Prints a receipt page: on the Sunmi's built-in printer straight away when there is one, otherwise through
       Android's print service (the printer chosen there is remembered). */
    void printHtml(String html, String title) {
        if (printer.ready()) { printer.print(html); return; }
        WebView pv = new WebView(this);
        printing.add(pv);
        pv.setWebViewClient(new WebViewClient() {
            private boolean sent;

            @Override
            public void onPageFinished(WebView v, String url) {
                if (sent) return;
                sent = true;
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                PrintAttributes attrs = new PrintAttributes.Builder()
                    .setMinMargins(PrintAttributes.Margins.NO_MARGINS).build();
                pm.print(title, v.createPrintDocumentAdapter(title), attrs);
                main.postDelayed(() -> { printing.remove(v); v.destroy(); }, 120000);
            }
        });
        pv.loadDataWithBaseURL("https://www." + SITE + "/", html, "text/html", "utf-8", null);
    }

    class Bridge {
        @JavascriptInterface
        public void printHtml(String html, String title) {
            main.post(() -> MainActivity.this.printHtml(html, title));
        }

        @JavascriptInterface
        public void openExternal(String url) {
            main.post(() -> MainActivity.this.openExternal(url));
        }
    }
}
