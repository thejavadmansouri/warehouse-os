# Android Operator App — Implementation Checklist

Native Kotlin/Jetpack Compose app for the warehouse floor worker (STAFF role), replacing/complementing the current `/worker` PWA in `apps/web`. This was the original planned architecture (see `docs/PROGRESS.md`: "NestJS + Prisma + PostgreSQL + Next.js + Android Kotlin") and was never built — the web PWA was a stand-in.

Golden rule for every task below: if a choice trades operator speed for engineering elegance, pick operator speed.

Backend contract (already exists, do not modify unless a task says so):
- `POST /auth/login`, `GET /auth/me`
- `GET /locations/resolve/:barcode`
- `POST /inventory-session/start` (roles: ADMIN, MANAGER, STAFF)
- `POST /inventory/voice` `{locationBarcode, text, sessionId}`
- `POST /inventory/voice/confirm` `{productId, locationBarcode, sessionId}`
- `GET /products/search?q=`
- `POST /mobile/count/start` `{locationBarcode}`
- `POST /mobile/count/:countId/voice` `{text}`
- `GET /mobile/review/pending`, `POST /mobile/review/:itemId/confirm`

Each task below is scoped to ~20–30 minutes and independently committable.

## Epic 0 — Project scaffolding
- [ ] 1. Create `apps/android` module: new Android Studio project, Kotlin + Jetpack Compose, package id, min/target SDK decision.
- [ ] 2. Add Gradle deps: Retrofit, OkHttp (+ logging interceptor), kotlinx.serialization, Room, Hilt, Coroutines, CameraX, ML Kit barcode scanning, DataStore.
- [ ] 3. Set up Hilt application class + empty DI module stubs (Network, Database, Repository).
- [ ] 4. Add build variants `dev`/`prod` with `BASE_URL` as a `BuildConfig` field (dev → LAN dev server, prod → configurable at runtime, see Epic 9).
- [ ] 5. Enable RTL (`android:supportsRtl="true"`), set `fa` as default locale resource folder, add app icon + splash screen.
- [ ] 6. Set up Compose Navigation graph with empty placeholder screens: Login, ShiftHome, Scan, VoiceEntry, Count, Settings.

## Epic 1 — Networking layer
- [ ] 7. Define `ApiService` Retrofit interface with all 9 endpoints listed above (interface + DTOs only, no implementation logic).
- [ ] 8. Add OkHttp auth interceptor that attaches `Authorization: Bearer <token>` from secure storage to every request.
- [ ] 9. Add 401 interceptor behavior: clear session and force navigation back to Login.
- [ ] 10. Add a sealed `ApiResult<T>` (Success/NetworkError/ServerError/Unauthorized) wrapper + a single mapping function used by all repositories.

## Epic 2 — Auth & secure session storage
- [ ] 11. Set up encrypted token storage (DataStore + Tink, or EncryptedSharedPreferences) for JWT + role + username.
- [ ] 12. Implement `AuthRepository`: `login()`, `logout()`, `getCachedUser()`.
- [ ] 13. Implement app-start routing: no token → Login; token present → call `GET /me`, route to ShiftHome, on failure clear token and go to Login.

## Epic 3 — Login screen
- [ ] 14. Build Login UI: username/password fields, submit button, loading spinner, Persian inline error text.
- [ ] 15. Wire submit to `AuthRepository.login()`; distinguish "wrong credentials" vs "no network" messaging.
- [ ] 16. Add role gate: if role is none of ADMIN/MANAGER/STAFF, show "دسترسی غیرمجاز" and block navigation past Login.

## Epic 4 — Shift/session home
- [ ] 17. Build ShiftHome UI: no active session → single large "شروع شیفت" button; active session → two large buttons ("ثبت ورود کالا", "انبارگردانی") + small "شروع شیفت جدید".
- [ ] 18. Wire "شروع شیفت" to `POST /inventory-session/start`; hold `sessionId` in a shared ViewModel (not persisted to disk — matches the existing web behavior of losing session on restart).
- [ ] 19. Add logout action (top bar icon) with confirmation dialog.

## Epic 5 — Barcode/QR scanning (shared component)
- [ ] 20. Build CameraX preview + ML Kit barcode-scanning overlay as a standalone reusable Composable/screen.
- [ ] 21. Add camera runtime-permission request + rationale UI + "open settings" fallback if permanently denied.
- [ ] 22. On decoded barcode, call `GET /locations/resolve/:barcode`; on success return the location to the caller screen.
- [ ] 23. Handle not-found/error: show retry prompt + error beep, keep scanner open.
- [ ] 24. Add manual barcode text-entry fallback (input + confirm button) alongside the camera view.
- [ ] 25. Add a shared success/error feedback util (short beep via `ToneGenerator` + vibration via `Vibrator`).

## Epic 6 — Voice stock-in flow
- [ ] 26. Integrate `SpeechRecognizer` with `fa-IR` locale, exposed as a small reusable listening-state holder.
- [ ] 27. Build large circular mic button with idle/listening/error visual states + live partial-text display.
- [ ] 28. On final recognized text, call `POST /inventory/voice` with `{locationBarcode, text, sessionId}`.
- [ ] 29. Render success result: product name, quantity, new shelf total, success beep.
- [ ] 30. Render "needs selection" result: show suggestion list (if server provided one) or fall through to manual search (#31).
- [ ] 31. Build debounced (350ms) product search field calling `GET /products/search?q=`.
- [ ] 32. Wire manual product pick to `POST /inventory/voice/confirm` with `{productId, locationBarcode, sessionId}`.
- [ ] 33. Add manual free-text fallback (multiline field + submit) for when `SpeechRecognizer` is unavailable or mic permission is denied.
- [ ] 34. Add post-success actions: "کالای بعدی" (same shelf) and "اسکن قفسه بعدی" (back to Epic 5 scan).

## Epic 7 — Inventory count (audit) flow
- [ ] 35. Build Count screen step 1 reusing the Epic 5 scanner component.
- [ ] 36. On location resolved, call `POST /mobile/count/start` with `{locationBarcode}`; store `countId`.
- [ ] 37. Wire the Epic 6 mic component to call `POST /mobile/count/:countId/voice` with `{text}`.
- [ ] 38. Render matched result (product name, good/bad quantity, confidence bar) vs not-matched (error state + retry prompt).
- [ ] 39. Keep an in-memory running list (LazyColumn) of this session's count results with matched/mismatched icons.
- [ ] 40. Add "شمارش بعدی" / "تغییر قفسه" navigation actions.

## Epic 8 — Offline queue & sync
*(This is the one gap the web PWA never solved — its service worker only caches static shell, never queues API writes. Build it properly here.)*
- [ ] 41. Add Room entities `PendingVoiceEntry` and `PendingCountEntry` mirroring the two write DTOs, each with a client-generated UUID.
- [ ] 42. Implement local-first submit: write to Room as `PENDING` first, then attempt the network call immediately.
- [ ] 43. Add a WorkManager job that drains `PENDING` rows in order on network-available, marking each `SYNCED` or incrementing a retry counter on failure.
- [ ] 44. Add a client-generated idempotency key sent with each queued request — **flag as a backend dependency**: confirm with backend whether `/inventory/voice` and `/mobile/count/:id/voice` already dedupe on it before relying on this.
- [ ] 45. Add a small persistent banner/badge showing "N در انتظار ارسال" + last-synced time.
- [ ] 46. Build a "Sync Issues" screen listing failed rows with manual retry/discard per item.
- [ ] 47. Add a `ConnectivityManager` callback to trigger an immediate sync attempt the moment connectivity returns.

## Epic 9 — Settings & on-prem server config
- [ ] 48. Build Settings screen with an editable API base URL field, persisted via DataStore (the backend is an on-prem Windows LAN server, not a fixed cloud host).
- [ ] 49. Add a "تست اتصال" button that pings `GET /me` (or a lightweight health route) and shows success/failure.
- [ ] 50. Show app version, logged-in username, and role on the Settings screen.

## Epic 10 — Permissions
- [ ] 51. Declare and justify runtime permissions: `CAMERA`, `RECORD_AUDIO`, `INTERNET`, `ACCESS_NETWORK_STATE`.
- [ ] 52. Ensure every permission-denied path degrades to the manual-entry fallback already built (#24, #33) instead of dead-ending the screen.

## Epic 11 — Testing
- [ ] 53. Unit tests for `AuthRepository` (login success/failure, token persistence) with a fake `ApiService`.
- [ ] 54. Unit tests for the offline queue write + drain logic against an in-memory Room DB.
- [ ] 55. Compose UI test: Login → Start Shift → Scan (mocked resolve) → Voice submit (mocked success) happy path via `MockWebServer`.
- [ ] 56. Compose UI test: airplane-mode entry queues locally and shows the pending banner, then syncs on reconnect.

## Epic 12 — Build & release
- [ ] 57. Configure R8/ProGuard rules for Retrofit + serialization models.
- [ ] 58. Set up debug/release signing config (release keystore/secrets to be supplied by the user, not generated).
- [ ] 59. Document the release-build checklist (APK size, min/target SDK, direct-APK sideload steps for warehouse devices — no Play Store dependency required for this on-prem deployment model).
