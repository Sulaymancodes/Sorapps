# Sorapps Agent — Android TWA

Sideloadable Android wrapper around the hosted agent app. It is a Trusted Web Activity: a real APK with no Chrome URL bar, using the existing login, offline drafts, camera, GPS, and barcode flow.

This is **not** a native rewrite. The APK hosts the existing web app in a WebView so field work can keep running after the first online sign-in, including with no network.

## What it opens

Default launch URL: `https://sorappscrm.vercel.app/~offline`

That page is precached, so the app can open with no internet. Online it forwards to sales or login.

Change host or path in `gradle.properties`:

```
twa.host=sorappscrm.vercel.app
twa.launchPath=/~offline
```

## Build a sideload APK

You need **JDK 17** and the **Android SDK**. Easiest path: install [Android Studio](https://developer.android.com/studio), open this `android-agent` folder, then:

```bash
cd android-agent
./gradlew assembleDebug
```

APK:

`app/build/outputs/apk/debug/Sorappscrm.apk`

Install on a device:

```bash
adb install -r app/build/outputs/apk/debug/Sorappscrm.apk
```

Or send the APK to agents. They enable **Install unknown apps** for Files / WhatsApp / Drive, then open the file.

The included `keystore/debug.keystore` is for **internal sideload only**. Do not reuse it for Play Store.

## Hide the Chrome URL bar

Chrome only goes fullscreen if Digital Asset Links match this APK.

1. Deploy the Next.js app so this URL works:

   `https://sorappscrm.vercel.app/.well-known/assetlinks.json`

2. Confirm it lists package `com.sorapps.agent` and the sideload SHA-256:

   ```
   9F:6E:31:E0:45:D4:F7:61:95:60:9A:F7:8B:9A:80:34:C2:9F:E6:EE:73:2C:A1:8E:6A:43:FF:B1:23:BA:A2:EC
   ```

   Print it locally:

   ```bash
   ./scripts/print-sha256.sh
   ```

3. Extra release keys: set `TWA_SHA256_FINGERPRINTS` on Vercel (comma-separated SHA-256 fingerprints).

Until that file is live, the APK still installs and runs, but Chrome may show a URL bar.

## Permissions

The APK declares **camera** and **fine/coarse location**. Chrome prompts the agent on first site-photo / GPS use.

## Offline

Same as the PWA: first open needs internet, then cached agent pages and local drafts work. Live lists and draft upload still need a network.

## First-run checklist

1. Chrome installed on the phone
2. Production site reachable over HTTPS
3. Agent account (not required to be an admin)
4. Open the app once online so the service worker can cache the shell
