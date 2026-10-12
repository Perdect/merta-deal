# Merta Deal — Android app

The Android app is a **Trusted Web Activity (TWA)**: a small native shell (≈0.8 MB) that opens
https://mertadeal.com full screen in the phone's Chrome, with no address bar. Everything
customers see comes from the website, so login, cart, Razorpay/UPI, location, live tracking and
push notifications work exactly as on the web, and **every website deploy updates the app
instantly** — no Play Store release needed for content or design changes.

Package: `com.mertadeal.app` · min Android 7.0 (API 24) · target API 36 · version 1.0.1 (code 2)

## What the native shell adds
- Launcher icon (adaptive + themed/monochrome), green splash screen, white status/navigation bars
- Push notifications shown as "Merta Deal" with the cart icon (Android 13+ asks permission)
- Location permission owned by the app for "Use my current location"
- Long-press shortcuts: Search, My orders, Cart
- Links to mertadeal.com (WhatsApp shares, QR posters) open straight in the app
- UPI apps open from Razorpay checkout; WebView fallback on phones without Chrome

## Files
- `release/MertaDeal-1.0.1.apk` — install directly on a phone to test
- `release/MertaDeal-1.0.1.aab` — upload this to Google Play
- `store-listing/` — Play icon, feature graphic, listing text, data-safety notes
- `merta-deal-upload.jks` + `keystore.properties` — **upload signing key (secret, not in git)**

> **Back up `merta-deal-upload.jks` and `keystore.properties` now** (e.g. a password manager or an
> encrypted drive). With Play App Signing a lost upload key can be reset through Google support,
> but it takes days; never share these files.

## Website side (already live)
`/.well-known/assetlinks.json` proves the site and app belong together. It is generated from the
Vercel env var `ANDROID_CERT_SHA256` (comma-separated SHA-256 fingerprints). Currently set to the
upload key:

    5E:A1:02:4C:75:D5:C8:89:E9:77:DF:1E:09:38:C0:3C:B4:CE:31:DE:B1:5D:3C:90:EA:1E:07:E4:B1:36:45:5F

## Publish on Google Play
1. Create the app in Play Console (developer account, one-time US$25), name "Merta Deal".
2. Upload `release/MertaDeal-1.0.1.aab` to Internal testing first; keep **Play App Signing** on.
3. In Play Console → Setup → App signing, copy the **App signing key certificate SHA-256** and add it
   to Vercel: `ANDROID_CERT_SHA256 = <upload key>,<Play app signing key>`, then redeploy. (Without
   this, phones that install from Play show an address bar.)
4. Fill the listing from `store-listing/listing.md`, add 2+ phone screenshots, privacy policy URL,
   content rating and data safety, then promote to Production.
5. Set `NEXT_PUBLIC_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.mertadeal.app`
   in Vercel and redeploy — the website's "Get it on Android" buttons then open the Play listing.

## Test on a phone
Enable "Install unknown apps" for your file manager, copy `MertaDeal-1.0.1.apk` to the phone and
open it. Chrome must be installed and up to date.

## Rebuild / release an update
Only needed when the shell changes (icon, name, colours, permissions) — not for website changes.

    export JAVA_HOME="$HOME/Library/Android/jdk-17/Contents/Home"
    export ANDROID_HOME="$HOME/Library/Android/sdk"
    cd android
    # bump versionCode (+1) and versionName in app/build.gradle first
    ./gradlew assembleRelease bundleRelease
    # outputs: app/build/outputs/apk/release/app-release.apk, app/build/outputs/bundle/release/app-release.aab

Android Studio can also open the `android/` folder directly.

## Not covered by this app
The rider app needs background GPS while delivering, which a TWA cannot do; riders keep using
/rider in Chrome. Store owners use /store in Chrome.
