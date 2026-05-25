# NumInjector

An Android automation tool that systematically injects number sequences into any on-screen input field using Android's Accessibility Service (Kotlin) and a React Native UI (Expo, old arch, no Turbo modules).

## Run & Operate

- `pnpm --filter @workspace/numinjector run dev` — start the Expo dev server (scan QR with Expo Go on Android)
- `pnpm run typecheck` — full typecheck across all workspace packages
- `bash scripts/push-to-github.sh "message"` — commit and push to GitHub
- Required secret: `GITHUB_PERSONAL_ACCESS_TOKEN` — for the push-to-GitHub workflow

## Stack

- **pnpm workspaces**, Node.js 24, TypeScript 5.9
- **UI**: Expo SDK 54 + React Native 0.81, Expo Router (file-based routing), old architecture (`newArchEnabled=false`)
- **Native**: Pure Kotlin — Accessibility Service + `ReactContextBaseJavaModule` bridge (old arch, no Turbo)
- **State**: React Context + AsyncStorage (no backend, frontend-only)
- **Animations**: React Native `Animated` API (no Reanimated plugin — explicitly removed from babel config)
- **Keep screen on**: `expo-keep-awake` (activated only while injection is running)
- **Build**: `expo prebuild` → Gradle (generates `android/` from `android-src/` via config plugin)

## Where Things Live

```
artifacts/numinjector/
├── app/
│   ├── _layout.tsx          # Root stack + providers (SafeArea, GestureHandler, QueryClient, InjectorProvider)
│   ├── index.tsx            # Entry — redirects to /onboarding or /home via AsyncStorage
│   ├── onboarding.tsx       # 4-step onboarding: Welcome → Accessibility → Overlay → Keep-screen-on
│   └── home.tsx             # Main screen: service status, target config, range config, start/stop
├── context/
│   └── InjectorContext.tsx  # Shared state, NativeModules bridge, NativeEventEmitter listener
├── constants/colors.ts      # Dark terminal theme (navy #080e1a, cyan #00d4ff, orange #ff6b35)
├── hooks/useColors.ts       # Theme hook
├── android-src/             # Kotlin source (copied into android/ by config plugin at prebuild)
│   ├── NumberInjectorAccessibilityService.kt
│   ├── NumberInjectorModule.kt
│   ├── NumberInjectorPackage.kt
│   ├── InjectionConfig.kt
│   └── accessibility_service_config.xml
├── plugins/
│   └── withNumberInjector.js  # Expo config plugin: old arch, manifest, permissions, package registration
└── app.json                 # newArchEnabled: false, plugin declared

scripts/
└── push-to-github.sh        # Commit + push script (uses GITHUB_PERSONAL_ACCESS_TOKEN)

README.md                    # Full project spec, architecture, bridge API, build instructions
```

## Architecture Decisions

- **Old arch only** — `newArchEnabled=false` is set by the config plugin in `gradle.properties`. The Kotlin module uses `ReactContextBaseJavaModule` + `@ReactMethod` + `DeviceEventManagerModule.RCTDeviceEventEmitter`, which are the old-arch primitives. No Turbo, no JSI.
- **No Reanimated plugin** — `babel.config.js` contains only `babel-preset-expo`. All animations use RN's built-in `Animated` API to avoid the Reanimated Babel transform entirely.
- **Config plugin pattern** — Kotlin source lives in `android-src/` (tracked in git, editable without touching the generated `android/` tree). The plugin copies files at `expo prebuild` time, keeping prebuild idempotent.
- **Heuristic found-detection** — after each injection + button click, the service checks if the input field text changed or the root window changed (navigation). Conservative by design; user can always stop manually.
- **Frontend-only** — all persistence via AsyncStorage. No API server, no database.

## Product

NumInjector lets users (or testers) automate the entry of number sequences into any Android input field across any app, using the Accessibility Service to interact with fields the user cannot access programmatically any other way. Key capabilities:

- **Auto or manual target selection** — auto-detects the first editable field and clickable button on screen, or user provides a hint string to match by content-description or label text
- **Configurable range** — set start, end, step, and delay (ms) between attempts
- **Zero-padding** — format numbers as `0042`, `00007`, etc. to match fixed-width PIN fields
- **Live progress** — animated counter, attempt count, progress bar shown during injection
- **Found detection** — stops automatically when the target field clears or the app navigates (success heuristic)
- **Keep screen on** — screen stays on for the duration of the injection run
- **Guided onboarding** — step-by-step permission setup (Accessibility Service → overlay → keep-screen-on)

## User Preferences

- Old architecture (no new arch / Turbo modules) — explicit requirement
- No Reanimated plugin — explicit requirement
- UI in React Native / Expo
- Accessibility Service + native bridge logic in pure Kotlin
- Proper onboarding flow with accessibility permissions
- Keep screen on while running

## Gotchas

- **Expo Go preview shows UI only** — the injection engine requires a native APK (`expo prebuild` + `./gradlew assembleDebug`). `NativeModules.NumberInjector` will be `null` in Expo Go; the context handles this gracefully.
- **Accessibility Service must be enabled manually** — the user must go to Android Settings → Accessibility → NumInjector and toggle it on. The app opens that screen for them during onboarding.
- **`deactivateKeepAwake()` crashes if never activated** — always guard with the `keepAwakeActive` ref before calling it (already implemented in `home.tsx`).
- **Old arch + Kotlin** — any new `@ReactMethod` must follow the old-arch pattern (no `@ReactMethod(isBlockingSynchronousMethod = true)` for promises; use async + Promise). Do not add `TurboReactPackage`.
- **Config plugin idempotency** — `expo prebuild` is safe to re-run; the plugin checks for existing entries before adding permissions/services to the manifest.
- **Push script masks the token** — `push-to-github.sh` pipes output through `grep -v GITHUB_PERSONAL_ACCESS_TOKEN` to avoid leaking it in logs.

## GitHub

- **Repo**: https://github.com/TITANICBHAI/numinjector
- **Push**: `bash scripts/push-to-github.sh` or use the "Push to GitHub" Replit workflow
