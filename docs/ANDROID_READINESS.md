# Android Readiness — can we (safely) change the operator app?

Written 2026-09-15 by inspecting the tree and the tools on the Windows dev laptop.
Every line is either **verified** (with the evidence named) or explicitly marked
**unverified**. Nothing here was inferred from intention.

The toolchain was not merely inventoried but exercised on the same day: **87 unit tests
re-executed green (0 failures) and the release-shaped APK built** — the exact commands
and their output are in §7.

Scope of the question this answers: *if we want to modify `apps/android`, do we have
everything we need?* Short answer: **yes for building and installing, no for
distributing a release APK and no for reviewable change history** — the three gaps
are listed with their blast radius in §3.

See also [`task-cards/android-operator-app-checklist.md`](task-cards/android-operator-app-checklist.md)
for the epic-by-epic status of the app itself.

---

## 1. Toolchain inventory (verified on this laptop)

Everything is **user-scope**: no Android Studio, no emulator, no administrator rights,
no PATH changes required. `deploy/android/setup-android.ps1` is idempotent and rebuilds
all of it from scratch if the laptop is replaced.

| Piece | Status | Exact location / version |
|---|---|---|
| JDK 17 (Temurin) | ✅ installed | `%LOCALAPPDATA%\AndroidBuild\jdk-17\bin\java.exe` |
| Android SDK root | ✅ installed | `%LOCALAPPDATA%\AndroidBuild\android-sdk` |
| SDK platforms | ✅ `android-35` | `…\android-sdk\platforms\android-35` |
| Build tools | ✅ `35.0.0` + `34.0.0` | `…\android-sdk\build-tools` |
| Platform tools (adb, fastboot) | ✅ | `…\android-sdk\platform-tools\adb.exe` |
| cmdline-tools (`sdkmanager`) | ✅ `latest` | `…\android-sdk\cmdline-tools\latest\bin` |
| SDK licences | ✅ accepted | `…\android-sdk\licenses` |
| Gradle | ✅ wrapper jar + 8.11.1 distribution cached | `apps/android/gradle/wrapper/`, `~/.gradle/wrapper/dists/gradle-8.11.1-bin` |
| Dependency cache | ✅ populated (previous builds) | `~/.gradle/caches` |
| SDK ↔ project link | ✅ | `apps/android/local.properties` → `sdk.dir=C:/Users/K/AppData/Local/AndroidBuild/android-sdk` |
| Build / install scripts | ✅ | `deploy/android/setup-android.ps1`, `deploy/android/build-android.ps1` |
| Backend for real testing | ✅ running now | API on `0.0.0.0:3000`, PostgreSQL on `:5432` (same laptop) |
| Node / npm (for the API) | ✅ | Node v24.19.0, npm 11.17.0 |

Two machine-specific traps are already handled in-repo, so a fresh clone behaves:

- `gradle.properties` pins both JVMs to `en-US`. This is load-bearing, not cosmetic:
  with the machine's `fa-IR` default the Kotlin daemon wrote Persian-digit rendezvous
  files and every build burned ~13 minutes on 4 connect retries before falling back to
  in-process compilation.
- `local.properties` is machine-specific and gitignored; the setup script rewrites it
  with forward slashes (a backslash is an escape character in `.properties`).

## 2. Commands that work today

```powershell
# one-time (or after a laptop reset) — JDK + SDK, ~1 GB, user scope
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\android\setup-android.ps1

# unit tests (devDebug) then the release-shaped APK the warehouse can judge speed on
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\android\build-android.ps1
powershell ... -SkipTests                       # APK only
powershell ... -Install                         # build then adb install -r
powershell ... -Task :app:testDevDebugUnitTest  # exactly one Gradle task
```

Output lands in `apps/android/app/build/outputs/apk/dev/bench/app-dev-bench.apk`;
the build script prints its path and size. `bench` is intentionally release-shaped
(R8, resource shrinking, `debuggable=false`) because a debug build cannot tell you how
the app really feels on a warehouse phone — but it keeps the `.debug` applicationId
and the **debug** signing key so it installs side-by-side over adb.

On the phone: enable USB debugging once, then `adb install -r <apk>`. Wireless
debugging works too (`adb pair <ip:port>` → `adb connect <ip:port>`). The build script's
failure text already lists the usual causes (debugging off, RSA prompt never accepted,
`adb devices` showing `unauthorized`).

The backend must be reachable on the shop LAN. `BuildConfig.BASE_URL` defaults to the
`dev`/`prod` flavor value (`http://10.141.233.130:3000` / placeholder
`http://192.168.1.100:3000`) and stays editable at runtime from the Settings screen,
because the ONPREM server is a LAN host whose address changes.

## 3. The three real gaps

### 3.1 No release keystore — cannot ship a signed APK

- **Verified:** no `.jks` / `.keystore` / `.p12` anywhere in the tree.
- **Verified:** the `release` build type has no `signingConfig` at all, so
  `assembleRelease` produces an *unsigned* APK (uninstallable). The only installable
  builds are `debug` and `bench`, both signed with the throwaway debug key and both
  carrying the `.debug` applicationId suffix.
- **Consequence:** changing the app for our own testing is unaffected; *handing a
  release build to the warehouse* is blocked. A real deployment needs a keystore that
  is generated once and **kept forever** (losing it means no future upgrade can install
  over the existing app), plus `signingConfigs`, a `versionCode` bump per release, and
  a decision about where the key + passwords live.
- **Not done on purpose** in this round (see §7).

### 3.2 No emulator and no instrumented tests — device-only verification

- **Verified:** the SDK contains only `build-tools`, `cmdline-tools`, `licenses`,
  `platform-tools`, `platforms` — no `emulator/` and no `system-images/`.
- **Verified:** `apps/android/app/src/androidTest` does not exist; there are 12 JVM
  unit-test files (`src/test`) and zero instrumented tests.
- **Consequence:** CameraX preview, ML Kit decoding, beep/vibration feedback, Compose
  layout on a real screen, and thermal/battery behaviour **cannot be verified on this
  laptop**. Every Epic 5+ flow needs a physical phone over adb. Unit tests still cover
  the logic layer (auth, session, view models, offline outbox) with `MockWebServer`
  fakes — 87 of them, green on 2026-09-15 (§7).
- Items 55–56 of the checklist (Compose UI tests via `MockWebServer`, offline-queue UI
  test) are not achievable without either a device farm or adding
  `emulator` + a system image to the SDK.

### 3.3 No version control — no diff, no revert, no review

- **Verified:** `/c/warehouse-os` has no `.git` directory (and no ancestor does). There
  is no history and no `.gitignore`-backed safety net beyond the files themselves.
- **Consequence:** every change to the Android app (or the API, or the web app) is
  unreviewable and unrevertable. This report's "what changed since the last shop
  update" section in `CHANGELOG.md` had to be reconstructed from **file modification
  times**, not from commits — good enough to be useful, impossible to prove.
- This is the cheapest gap to close and the one with the highest blast radius; it
  affects far more than Android.

## 4. What the app actually is (so "changing it" is a knowable amount of work)

- **Size (verified):** 114 Kotlin files under `app/src/main`, 14 screen packages
  (`login`, `startup`, `shifthome`, `scan`, `voice`, `count`, `locate`, `catalog`,
  `mywork`, `worktasks`, `transfer`, `newproduct`, `linkbarcode`, `settings`) each with
  its own `ViewModel`.
- **Stack (verified from `gradle/libs.versions.toml` / `app/build.gradle.kts`):**
  Compose + Material 3 + Navigation, Hilt, Retrofit/OkHttp + kotlinx.serialization,
  Room, DataStore, WorkManager, CameraX 1.4.1, ML Kit `com.google.mlkit:barcode-scanning`
  17.3.0, `androidx.security.crypto` for the encrypted token store. AGP 8.6.1,
  Kotlin 2.0.21, KSP, Compose BOM 2024.12.01.
- **Scanning works without Google Play Services (verified):** the *bundled* ML Kit
  artifact (`com.google.mlkit:barcode-scanning`) ships the model in the APK, unlike
  `play-services-mlkit-barcode-scanning`. Important for the phones actually in use.
- **SDK levels:** `minSdk 26` (Android 8.0+), `targetSdk 35`, `compileSdk 35`. A phone
  older than Android 8 cannot run it — worth confirming against the actual warehouse
  handsets before promising anything.
- **Backend contract (verified by grepping the Retrofit interface):** the app consumes
  25 routes, all of which already exist in `apps/api` — `auth/*`, `locations/resolve/*`,
  `products/search|catalog|locate`, `inventory/voice*`,
  `inventory-session/start`, `inventory-transfer`, `mobile/count/*`, `mobile/my-work`,
  `mobile/review/*`, `mobile/shelf/*/stock`, `work-tasks/*`, `sync/operations`,
  `uploads/pending-operation/.../photo`, `barcode/link`, `product-requests`. **No
  backend change is required to modify the app**, as long as a new screen stays inside
  this contract.
- **Progress honesty:** Epics 0–3 are built **and verified**; Epics 4–12 are implemented
  in the tree but have **never been ticked off on a device** — that is what the
  checklist says, and it matches the file history (last Android source change
  2026-09-12 09:32, last green APK 2026-09-12 09:45).

## 5. Pre-flight checklist before touching the app

1. `adb devices` shows the target phone as `device` (not `unauthorized`, not empty).
2. The backend answers on the LAN from the phone's network — the `dev` flavor's
   `BASE_URL` may need editing if this laptop's IP changed, or set the address in
   Settings at runtime.
3. `powershell … deploy\android\build-android.ps1 -SkipTests` succeeds **before** your
   first change, so a later failure is provably yours.
4. Any change to the offline queue, sync, or auth must add/extend a JVM unit test —
   that is the only automated safety net this machine can run.
5. Anything touching the camera, audio, or Compose layout is **unverifiable here**;
   plan a phone pass explicitly.
6. If the change is meant to reach the warehouse, resolve §3.1 first, otherwise you
   are shipping a debug-suffixed package.

## 6. Verification run — 2026-09-15

Executed on this laptop against the untouched tree (`apps/android` source last changed
2026-09-12 09:32), so the result describes the toolchain, not a specific edit.

```
> gradlew.bat :app:testDevDebugUnitTest --rerun-tasks --console=plain
BUILD SUCCESSFUL in 1m 42s
31 actionable tasks: 31 executed
```

`--rerun-tasks` matters here: without it Gradle reported every task `UP-TO-DATE` and
finished in 3 s, which proves configuration but executes nothing. With it, all 31 tasks
ran and the tests really ran:

- **87 tests, 0 failures, 0 errors, 0 skipped** (from the JUnit XML in
  `app/build/test-results/testDevDebugUnitTest/`; 11 test classes — API contract,
  safe-call mapping, auth, catalog, outbox, product requests, local voice parser,
  offline search, secure token store, login and my-work view models). This matches the
  87 the checklist has claimed since 2026-09-12 — now independently reproduced.
- **APK:** `deploy/android/build-android.ps1` → `BUILD SUCCESSFUL`,
  `app-dev-bench.apk` (23.4 MB, 24,525,791 bytes). The `assembleDevBench` task reported
  `UP-TO-DATE` (the file itself is dated 2026-09-12), which is the expected outcome of
  building a tree whose Android sources have not changed since the last green build.

Two operational notes worth knowing before you run this yourself:

- A Gradle daemon (~550 MB JVM) keeps running after the build. That is normal; it idles
  out on its own, and it is why a second run is much faster.
- **Do not pipe the build through `tee`/`tail`.** The daemon inherits the pipe's write
  handle, so the pipe never sees EOF and the shell sits there long after the build has
  printed `BUILD SUCCESSFUL` (observed: a 10-minute timeout on a build that had
  finished in 3 s). Redirect to a file and read the file.

## 7. Deliberately not done in this round

Recorded so nobody assumes these exist:

- **No keystore generated, no `signingConfigs` added, no `versionCode` bump.**
- **No emulator / system image installed**; no `androidTest` source set created.
- **No git repository initialised.**
- No change of any kind under `apps/` — this document and the sibling doc updates are
  the entire change set.
