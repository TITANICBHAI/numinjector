# NumInjector

An Android automation tool that systematically injects number sequences into any on-screen input field using Android's Accessibility Service, and automatically submits them until the correct value is found (or the range is exhausted).

Built with **Expo + React Native** (UI) and **pure Kotlin** (Accessibility Service + native bridge), targeting the **old React Native architecture** (no Turbo modules, no Reanimated plugin).

---

## What It Does

1. User opens NumInjector and completes a one-time onboarding (grants Accessibility Service + optional overlay permission).
2. User configures the **target**: either auto-detect the first editable field + button on screen, or manually provide hint text to match a specific field/button by label or content description.
3. User sets the **number range**: start, end, step size, and delay between attempts.
4. User optionally configures **zero-padding** (e.g. `0042` instead of `42`).
5. User taps **Start Injection** — the app keeps the screen on, then for each number in the range:
   - Injects the formatted number into the target input field via `ACTION_SET_TEXT`
   - Clicks the target button via `ACTION_CLICK`
   - Waits the configured delay
   - Checks if the field was cleared or the app navigated away (heuristic "found" detection)
   - Reports progress live to the UI
6. When a value is accepted, the app stops and displays the found value + attempt count.

---

## Architecture

### React Native UI (Expo, old arch)

| File | Purpose |
|---|---|
| `app/_layout.tsx` | Root stack, providers, font loading, SplashScreen gate |
| `app/index.tsx` | Entry — redirects to onboarding or home based on AsyncStorage |
| `app/onboarding.tsx` | 4-step permission onboarding (Welcome → Accessibility → Overlay → Keep-Screen-On) |
| `app/home.tsx` | Main control screen — status, target config, range config, formatting, start/stop |
| `context/InjectorContext.tsx` | Shared state — config, injection state, NativeModules bridge, NativeEventEmitter |
| `constants/colors.ts` | Dark hacker/terminal theme (navy + electric cyan + orange) |
| `hooks/useColors.ts` | Theme hook, picks light/dark palette from `constants/colors.ts` |

### Kotlin Native (Android, old arch bridge)

All source lives in `android-src/` and is copied into the Android project by the config plugin during `expo prebuild`.

| File | Purpose |
|---|---|
| `NumberInjectorAccessibilityService.kt` | `AccessibilityService` — finds nodes, injects numbers, clicks buttons, runs loop on coroutine |
| `NumberInjectorModule.kt` | `ReactContextBaseJavaModule` — bridge between JS and the service, emits events |
| `NumberInjectorPackage.kt` | `ReactPackage` — registers the module |
| `InjectionConfig.kt` | Config data class + number formatter |
| `accessibility_service_config.xml` | Declares event types, flags, and permissions for the service |

### Config Plugin (`plugins/withNumberInjector.js`)

Run automatically during `expo prebuild`. It:
- Sets `newArchEnabled=false` in `gradle.properties` (old arch)
- Copies Kotlin source files into `android/app/src/main/java/com/numinjector/`
- Copies the accessibility service XML descriptor into `res/xml/`
- Injects `WAKE_LOCK`, `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE` permissions into `AndroidManifest.xml`
- Declares the `<service>` entry with `BIND_ACCESSIBILITY_SERVICE` permission
- Registers `NumberInjectorPackage` in `MainApplication.kt`

---

## JS ↔ Kotlin Bridge (Old Arch)

```typescript
// JS side — context/InjectorContext.tsx
import { NativeModules, NativeEventEmitter } from 'react-native';
const NativeInjector = NativeModules.NumberInjector;  // null-safe on non-Android

// Start injection
await NativeInjector.startInjection({ startNumber, endNumber, step, delayMs, ... });

// Listen for progress / found / stopped / error events
const emitter = new NativeEventEmitter(NativeInjector);
emitter.addListener('NumberInjectorEvent', (event) => { ... });
```

```kotlin
// Kotlin side — NumberInjectorModule.kt
class NumberInjectorModule(ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    override fun getName() = "NumberInjector"

    @ReactMethod fun startInjection(config: ReadableMap, promise: Promise) { ... }
    @ReactMethod fun stopInjection(promise: Promise) { ... }
    @ReactMethod fun isAccessibilityServiceEnabled(promise: Promise) { ... }
    @ReactMethod fun hasOverlayPermission(promise: Promise) { ... }
    @ReactMethod fun openAccessibilitySettings(promise: Promise) { ... }
    @ReactMethod fun openOverlaySettings(promise: Promise) { ... }
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
```

---

## Permissions

| Permission | Why |
|---|---|
| `BIND_ACCESSIBILITY_SERVICE` | Required to run as an Accessibility Service — core feature |
| `WAKE_LOCK` | Keeps screen on during injection via `expo-keep-awake` |
| `SYSTEM_ALERT_WINDOW` | Optional overlay for visual field selection |
| `FOREGROUND_SERVICE` | Allows the service to stay running in the background |

---

## Building the APK

> The Expo Go / web preview shows the full UI. The injection engine requires a native APK build.

```bash
# 1. Generate the Android project
cd artifacts/numinjector
npx expo prebuild --platform android

# 2. Build the debug APK
cd android
./gradlew assembleDebug

# APK location:
# android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Push to GitHub

A helper script and Replit workflow are provided to sync changes:

```bash
bash scripts/push-to-github.sh "feat: your message here"
```

Or use the **Push to GitHub** workflow in the Replit workflow panel (runs the same script automatically).

Requires the `GITHUB_PERSONAL_ACCESS_TOKEN` secret to be set in Replit Secrets.

---

## Key Design Decisions

- **Old architecture** — `newArchEnabled=false`. The Kotlin module uses `ReactContextBaseJavaModule` + `@ReactMethod` annotations (classic bridge), not `TurboModule`. This was an explicit requirement.
- **No Reanimated plugin** — `babel.config.js` uses only `babel-preset-expo`. Animations use the built-in `Animated` API.
- **Kotlin coroutines for the injection loop** — avoids blocking the Android main thread; `CoroutineScope(Dispatchers.Default)` handles the loop, `Handler(Looper.getMainLooper())` for any UI-thread work.
- **Heuristic found-detection** — after each click, the service checks if the target field was cleared or if the root window changed (navigation). This is intentionally conservative; the user can also stop manually.
- **Config plugin pattern** — keeps Kotlin source in `android-src/` (version-controlled, readable) and copies it into the generated `android/` tree at prebuild time, avoiding manual merge conflicts when re-running prebuild.
- **AsyncStorage for config persistence** — all injection settings (range, delay, target hints, padding) survive app restarts with no backend needed.

---

## Repo

**GitHub:** https://github.com/TITANICBHAI/numinjector
