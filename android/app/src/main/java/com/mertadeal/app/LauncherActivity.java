package com.mertadeal.app;

import android.content.pm.ActivityInfo;
import android.os.Build;
import android.os.Bundle;

/**
 * Opens mertadeal.com as a Trusted Web Activity. Everything (UI, login, cart, payments)
 * comes from the website; androidbrowserhelper handles splash, the Chrome hand-off and the
 * WebView fallback on phones without a TWA-capable browser.
 */
public class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android 8.0 throws when a translucent activity fixes its orientation, so only lock it elsewhere.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }
}
