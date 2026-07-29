# Warehouse Operator — Android app

Native Kotlin/Jetpack Compose app for the warehouse floor operator. Talks to the
existing NestJS backend (`apps/api`) over the LAN — no backend changes.

- Package: `com.warehouseos.operator`
- Min SDK 26, Target SDK 35
- Stack: Compose, Hilt, Retrofit/OkHttp, Coroutines, Room, CameraX, ML Kit barcode

Full task breakdown: [`../../docs/task-cards/android-operator-app-checklist.md`](../../docs/task-cards/android-operator-app-checklist.md).
This module currently implements **Epic 0** (scaffolding + navigation skeleton);
all screens are placeholders.

## First-time setup

The Gradle wrapper jar (`gradle/wrapper/gradle-wrapper.jar`) is a binary and is not
committed here. Generate it once, either way:

- **Android Studio** — just open `apps/android`; the first Gradle sync creates it
  automatically.
- **CLI** — with a system Gradle installed: `gradle wrapper --gradle-version 8.11.1`

After that, `./gradlew` works normally.

## Build variants

Two flavors carry the backend URL as a `BuildConfig.BASE_URL` default (editable at
runtime once the Settings screen lands in Epic 9):

| Variant       | BASE_URL default        |
|---------------|-------------------------|
| `dev`         | `http://10.141.233.130:3000` (current LAN dev server) |
| `prod`        | `http://192.168.1.100:3000` (placeholder) |

```bash
./gradlew :app:assembleDevDebug
```

The backend must be running and reachable on the LAN for the app to function
(`npm run dev:api` from the repo root, bound to `0.0.0.0:3000`).
