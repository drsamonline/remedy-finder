# Packaging — HTML, PWA, Windows, Android

Three of these four are already produced by this repository. The fourth (APK) is a
ten-minute step against the live URL, described below.

---

## 1. Single-file HTML (built here)

```bash
python3 build.py
# → dist/remedy-finder.html   (~517 KB, everything inlined)
```

Open it by double-clicking. No server, no install, no network. This is the file to
put on a USB stick, a shared drive, or a clinic desktop with no internet.

## 2. PWA — installable, offline (built here)

The site ships `manifest.webmanifest` and `sw.js`. Served over HTTPS (GitHub Pages
does this), the browser offers **Install app**:

- **Android / Chrome**: ⋮ menu → *Add to Home screen* → it runs full-screen, offline.
- **Windows / Edge or Chrome**: install icon in the address bar.
- **iOS / Safari**: Share → *Add to Home Screen*.

The service worker caches the shell, data, styles and scripts on first load. After
that, opening the app with aeroplane mode on works.

## 3. Windows `.exe` (built by CI)

`.github/workflows/build-exe.yml` runs on a `windows-latest` runner, inlines the
app, and wraps `launcher.py` — a 60-line stdlib HTTP server that serves the bundle
from memory and opens your default browser — into a single `RemedyFinder.exe` with
PyInstaller. The result is attached to the tagged release.

To build it locally on Windows:

```powershell
python build.py
pip install pyinstaller
pyinstaller --onefile --noconsole --name RemedyFinder --add-data "dist/remedy-finder.html;." launcher.py
# → dist/RemedyFinder.exe
```

Notes: no admin rights, no registry writes, no network access, ~8 MB. SmartScreen
may warn on unsigned binaries — *More info → Run anyway*.

## 4. Android `.apk`

An APK is a signed package; this repository deliberately does not ship an unsigned
one. Two routes that do work:

### a. PWABuilder (no toolchain, ~10 minutes)

1. Open <https://www.pwabuilder.com>.
2. Enter the live URL: `https://drsamonline.github.io/remedy-finder/`.
3. Choose **Android → Generate**. It reads the manifest and service worker and
   returns a signed **.apk** and **.aab**, plus the signing key.
4. Install the APK (allow *Install unknown apps* once).

This gives a Trusted Web Activity: a real APK, the app updates itself when the site
does, and it works offline because of the service worker.

### b. Capacitor (full local build)

```bash
npm install -g @capacitor/cli
npx cap init "Remedy Finder" app.remedyfinder --web-dir=site
npx cap add android
python3 build.py && cp dist/remedy-finder.html site/index.html
npx cap sync android
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Requires JDK 17 and the Android SDK. For a release build, sign it with
`apksigner` and your own keystore.

---

## What is *not* shipped, on purpose

- No `.exe` or `.apk` binaries are committed to this repository. They are built by
  CI or by you, so the source stays auditable and the repo stays small.
- No Electron, no WebView shell, no telemetry wrapper. The Windows launcher is a
  local HTTP server and your own browser.
