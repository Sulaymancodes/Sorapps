package com.sorapps.agent;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.ServiceWorkerWebSettingsCompat;
import androidx.webkit.WebViewFeature;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int REQUEST_PERMISSIONS = 41;
    private static final int REQUEST_FILE_CHOOSER = 42;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri captureUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webview);
        configureWebView();
        requestRuntimePermissions();
        webView.loadUrl(BuildConfig.LAUNCH_URL);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setCacheMode(cacheMode());
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)
                && WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_CACHE_MODE)) {
            ServiceWorkerWebSettingsCompat swSettings =
                    ServiceWorkerControllerCompat.getInstance().getServiceWorkerWebSettings();
            swSettings.setCacheMode(cacheMode());
            swSettings.setAllowContentAccess(true);
            swSettings.setAllowFileAccess(true);
        }

        webView.setWebViewClient(new WebViewClient() {
            private boolean recovering;

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null) return false;
                String host = uri.getHost();
                if (host == null || !host.equalsIgnoreCase(BuildConfig.TWA_HOST)) {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    return true;
                }
                if (!isOnline()) {
                    return handleOfflineNavigation(view, uri);
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                recovering = false;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request == null || !request.isForMainFrame() || recovering) return;
                recovering = true;
                applyCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
                view.loadUrl(cachedLaunchUrl(request.getUrl()));
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(
                    String origin, GeolocationPermissions.Callback callback) {
                boolean granted = ContextCompat.checkSelfPermission(
                        MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED;
                callback.invoke(origin, granted, false);
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.grant(request.getResources());
            }

            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                openFileChooser(params);
                return true;
            }
        });
    }

    private void openFileChooser(WebChromeClient.FileChooserParams params) {
        Intent contents = params.createIntent();
        Intent chooser = Intent.createChooser(contents, "Choose file");

        Intent capture = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (capture.resolveActivity(getPackageManager()) != null) {
            try {
                File photo = createCaptureFile();
                captureUri = FileProvider.getUriForFile(
                        this, getPackageName() + ".fileprovider", photo);
                capture.putExtra(MediaStore.EXTRA_OUTPUT, captureUri);
                capture.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] {capture});
            } catch (IOException ignored) {
                captureUri = null;
            }
        }

        try {
            startActivityForResult(chooser, REQUEST_FILE_CHOOSER);
        } catch (Exception e) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
            Toast.makeText(this, "Could not open camera or files", Toast.LENGTH_SHORT).show();
        }
    }

    private File createCaptureFile() throws IOException {
        File dir = new File(getCacheDir(), "capture");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IOException("Could not create capture directory");
        }
        String name = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        return File.createTempFile("IMG_" + name, ".jpg", dir);
    }

    private boolean handleOfflineNavigation(WebView view, Uri uri) {
        String path = uri.getPath() == null ? "/" : uri.getPath();
        if ("/login".equals(path)) {
            applyCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
            return false;
        }

        if (uri.getQueryParameter("view") != null) {
            applyCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
            view.loadUrl(cachedLaunchUrl(uri));
            return true;
        }

        String hash = offlineHash(uri);
        String current = view.getUrl();
        if (current != null && current.contains("/~offline")) {
            view.evaluateJavascript("location.hash='" + hash.replace("'", "") + "'", null);
            return true;
        }

        applyCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        view.loadUrl(cachedLaunchUrl(uri));
        return true;
    }

    private String cachedLaunchUrl(Uri failed) {
        String hash = failed == null ? "" : offlineHash(failed);
        String path = failed != null && failed.getPath() != null ? failed.getPath() : "";
        String base = "/login".equals(path) && hash.isEmpty()
                ? "https://" + BuildConfig.TWA_HOST + "/login"
                : "https://" + BuildConfig.TWA_HOST + "/~offline";
        if (hash.isEmpty()) return base;
        return base + "#" + hash;
    }

    private String offlineHash(Uri uri) {
        if (uri == null) return "";
        if (isKnownView(uri.getFragment())) return uri.getFragment();
        if (isKnownView(uri.getQueryParameter("view"))) return uri.getQueryParameter("view");
        String path = uri.getPath() == null ? "" : uri.getPath();
        if (path.startsWith("/sales/new")) return "sale";
        if (path.startsWith("/customers/new")) return "customer";
        if (path.contains("/drafts")) return "drafts";
        return "";
    }

    private boolean isKnownView(String value) {
        return "sale".equals(value) || "customer".equals(value) || "drafts".equals(value);
    }

    private int cacheMode() {
        return isOnline() ? WebSettings.LOAD_DEFAULT : WebSettings.LOAD_CACHE_ELSE_NETWORK;
    }

    private void applyCacheMode(int mode) {
        webView.getSettings().setCacheMode(mode);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_CACHE_MODE)) {
            ServiceWorkerControllerCompat.getInstance().getServiceWorkerWebSettings().setCacheMode(mode);
        }
    }

    private boolean isOnline() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (manager == null) return true;
        Network network = manager.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
        return capabilities != null && (
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                        || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
                        || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
                        || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
        );
    }

    private void requestRuntimePermissions() {
        String[] needed = new String[] {
                Manifest.permission.CAMERA,
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
        };
        boolean missing = false;
        for (String permission : needed) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                missing = true;
                break;
            }
        }
        if (missing) {
            ActivityCompat.requestPermissions(this, needed, REQUEST_PERMISSIONS);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_FILE_CHOOSER || filePathCallback == null) return;

        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getData() != null) {
                result = new Uri[] {data.getData()};
            } else if (captureUri != null) {
                result = new Uri[] {captureUri};
            }
        }
        filePathCallback.onReceiveValue(result);
        filePathCallback = null;
        captureUri = null;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();
        super.onPause();
    }
}
