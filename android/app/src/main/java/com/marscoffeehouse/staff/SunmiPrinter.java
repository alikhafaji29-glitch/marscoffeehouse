package com.marscoffeehouse.staff;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import com.sunmi.peripheral.printer.InnerPrinterCallback;
import com.sunmi.peripheral.printer.InnerPrinterManager;
import com.sunmi.peripheral.printer.SunmiPrinterService;

import java.util.ArrayDeque;

/*
 * The receipt printer built into Sunmi devices (owner, 2026-10-23: "make the built in apk printer for sunmi"). Prints
 * with no window, so Auto-print really prints each new order by itself. The receipt page is drawn into a picture at the
 * paper's width (58 mm = 384 dots, 80 mm = 576 dots) and sent as one image: Arabic and Kurdish come out exactly as on
 * screen, which the printer's own text fonts would not do. The logo is printed black (a thermal printer has no colour).
 * On any other device ready() stays false and receipts go through Android's print service as before.
 */
class SunmiPrinter {
    private static final int FEED_LINES = 7; // empty lines after a receipt: 4 left the last line on the D2mini's tear bar
    private static final int RECEIPT_CSS_WIDTH = 272; // the receipt page's body width (72 mm) in CSS pixels
    private static final String PRINT_CSS = "<style>body{width:" + RECEIPT_CSS_WIDTH + "px!important;margin:0!important;"
        + "background:#fff}img{filter:brightness(0)}</style>";

    private final Activity activity;
    private final FrameLayout root;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ArrayDeque<String> queue = new ArrayDeque<>();
    private SunmiPrinterService service;
    private boolean busy;

    private final InnerPrinterCallback callback = new InnerPrinterCallback() {
        @Override
        protected void onConnected(SunmiPrinterService s) {
            try {
                if (InnerPrinterManager.getInstance().hasPrinter(s)) service = s;
            } catch (Exception e) {
                service = null;
            }
        }

        @Override
        protected void onDisconnected() {
            service = null;
        }
    };

    SunmiPrinter(Activity activity, FrameLayout root) {
        this.activity = activity;
        this.root = root;
        try {
            InnerPrinterManager.getInstance().bindService(activity, callback);
        } catch (Exception e) {
            // not a Sunmi device: no printer service to bind
        }
    }

    boolean ready() {
        return service != null;
    }

    void close() {
        try {
            InnerPrinterManager.getInstance().unBindService(activity, callback);
        } catch (Exception e) {
            // was never bound
        }
    }

    /* one receipt at a time: orders arriving together print one after the other */
    void print(String html) {
        queue.add(html);
        if (!busy) next();
    }

    private void next() {
        String html = queue.poll();
        if (html == null) { busy = false; return; }
        busy = true;
        String problem = problem();
        if (problem != null) {
            Toast.makeText(activity, "Receipt not printed: " + problem, Toast.LENGTH_LONG).show();
            queue.clear();
            busy = false;
            return;
        }
        int dots = paperDots();
        int scale = Math.round(dots * 100f / RECEIPT_CSS_WIDTH); // the receipt's own layout, filling the paper's width

        // drawn by a WebView kept behind the dashboard (a WebView only draws while it is in the window)
        WebView pv = new WebView(activity);
        pv.setBackgroundColor(Color.WHITE);
        pv.setInitialScale(scale);
        pv.getSettings().setJavaScriptEnabled(true);
        root.addView(pv, 0, new FrameLayout.LayoutParams(dots, 10));
        pv.setWebViewClient(new WebViewClient() {
            private boolean done;

            @Override
            public void onPageFinished(WebView v, String url) {
                if (done) return;
                done = true;
                main.postDelayed(() -> v.evaluateJavascript("document.documentElement.scrollHeight", (h) -> {
                    int cssHeight;
                    try { cssHeight = Integer.parseInt(h.trim()); } catch (NumberFormatException e) { cssHeight = 800; }
                    int height = Math.max(1, (int) Math.ceil(cssHeight * scale / 100f));
                    v.setLayoutParams(new FrameLayout.LayoutParams(dots, height));
                    main.postDelayed(() -> {
                        Bitmap bmp = Bitmap.createBitmap(dots, height, Bitmap.Config.ARGB_8888);
                        Canvas c = new Canvas(bmp);
                        c.drawColor(Color.WHITE);
                        v.draw(c);
                        root.removeView(v);
                        v.destroy();
                        send(bmp);
                        next();
                    }, 400);
                }), 300);
            }
        });
        String page = html.contains("</head>") ? html.replace("</head>", PRINT_CSS + "</head>") : PRINT_CSS + html;
        pv.loadDataWithBaseURL("https://www." + MainActivity.SITE + "/", page, "text/html", "utf-8", null);
    }

    private void send(Bitmap bmp) {
        try {
            service.enterPrinterBuffer(true);
            service.printerInit(null);
            service.setAlignment(1, null); // centred
            service.printBitmap(bmp, null);
            service.lineWrap(FEED_LINES, null); // past the tear bar, so the last line is not torn (owner, 2026-10-24)
            try { service.cutPaper(null); } catch (Exception e) { /* no cutter on this model */ }
            service.exitPrinterBuffer(true);
        } catch (Exception e) {
            Toast.makeText(activity, "Receipt not printed: the printer did not answer", Toast.LENGTH_LONG).show();
        }
    }

    private int paperDots() {
        try {
            return service.getPrinterPaper() == 2 ? 576 : 384; // 2 = 80 mm, 1 = 58 mm
        } catch (Exception e) {
            return 384;
        }
    }

    /* why it cannot print now, or null when it can (Sunmi's printer states) */
    private String problem() {
        if (service == null) return "no printer";
        int state;
        try { state = service.updatePrinterState(); } catch (Exception e) { return "the printer did not answer"; }
        switch (state) {
            case 1: case 2: case 8: return null; // working, starting up, cutter recovered
            case 4: return "out of paper";
            case 5: return "the printer is too hot";
            case 6: return "the paper cover is open";
            case 7: return "the paper cutter is stuck";
            case 505: return "no printer in this device";
            default: return "printer problem (" + state + ")";
        }
    }
}
