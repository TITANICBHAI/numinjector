/**
 * Expo config plugin for NumInjector.
 *
 * Handles:
 *  1. Disabling the new architecture (old arch)
 *  2. Copying Kotlin source files into android/app/src/main/java/com/numinjector/
 *  3. Copying the accessibility service XML descriptor
 *  4. Adding required permissions & the accessibility service entry to AndroidManifest.xml
 *  5. Adding the string resource for service description
 *  6. Registering NumberInjectorPackage in MainApplication.kt
 */

const { withAndroidManifest, withDangerousMod, withGradleProperties, withStringsXml } =
  require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// ── 1. Disable new arch ─────────────────────────────────────────────────────
function withOldArch(config) {
  return withGradleProperties(config, (mod) => {
    const props = mod.modResults;
    const idx = props.findIndex(
      (p) => p.type === "property" && p.key === "newArchEnabled"
    );
    const entry = { type: "property", key: "newArchEnabled", value: "false" };
    if (idx >= 0) props[idx] = entry;
    else props.push(entry);
    return mod;
  });
}

// ── 2. Copy Kotlin source files ─────────────────────────────────────────────
function withKotlinSources(config) {
  return withDangerousMod(config, [
    "android",
    (mod) => {
      const srcDir = path.join(mod.modRequest.projectRoot, "android-src");
      const pkg = "com/numinjector";
      const destDir = path.join(
        mod.modRequest.platformProjectRoot,
        "app/src/main/java",
        pkg
      );
      fs.mkdirSync(destDir, { recursive: true });

      const ktFiles = [
        "NumberInjectorModule.kt",
        "NumberInjectorPackage.kt",
        "NumberInjectorAccessibilityService.kt",
        "InjectionConfig.kt",
      ];
      for (const f of ktFiles) {
        const src = path.join(srcDir, f);
        const dst = path.join(destDir, f);
        if (fs.existsSync(src)) fs.copyFileSync(src, dst);
      }

      // Accessibility service XML
      const xmlSrc = path.join(srcDir, "accessibility_service_config.xml");
      const xmlDest = path.join(
        mod.modRequest.platformProjectRoot,
        "app/src/main/res/xml"
      );
      fs.mkdirSync(xmlDest, { recursive: true });
      if (fs.existsSync(xmlSrc)) {
        fs.copyFileSync(xmlSrc, path.join(xmlDest, "numinjector_service_config.xml"));
      }

      return mod;
    },
  ]);
}

// ── 3. Add permissions + accessibility service to AndroidManifest ────────────
function withManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;

    // Permissions
    const wantPerms = [
      "android.permission.BIND_ACCESSIBILITY_SERVICE",
      "android.permission.WAKE_LOCK",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.POST_NOTIFICATIONS",
    ];
    const existingPerms = (manifest["uses-permission"] || []).map(
      (p) => p.$["android:name"]
    );
    for (const perm of wantPerms) {
      if (!existingPerms.includes(perm)) {
        manifest["uses-permission"] = manifest["uses-permission"] || [];
        manifest["uses-permission"].push({ $: { "android:name": perm } });
      }
    }

    // Accessibility service entry inside <application>
    const application = manifest.application?.[0];
    if (application) {
      application.service = application.service || [];
      const svcName = "com.numinjector.NumberInjectorAccessibilityService";
      const exists = application.service.some(
        (s) => s.$?.["android:name"] === svcName
      );
      if (!exists) {
        application.service.push({
          $: {
            "android:name": svcName,
            "android:permission": "android.permission.BIND_ACCESSIBILITY_SERVICE",
            "android:exported": "true",
          },
          "intent-filter": [
            {
              action: [
                {
                  $: {
                    "android:name":
                      "android.accessibilityservice.AccessibilityService",
                  },
                },
              ],
            },
          ],
          "meta-data": [
            {
              $: {
                "android:name": "android.accessibilityservice",
                "android:resource": "@xml/numinjector_service_config",
              },
            },
          ],
        });
      }
    }

    return mod;
  });
}

// ── 4. Add string resource ───────────────────────────────────────────────────
function withServiceString(config) {
  return withStringsXml(config, (mod) => {
    const strings = mod.modResults.resources.string || [];
    const exists = strings.some(
      (s) => s.$?.name === "accessibility_service_description"
    );
    if (!exists) {
      strings.push({
        $: { name: "accessibility_service_description" },
        _: "NumInjector automatically enters number sequences into input fields to help test or unlock numeric entry forms.",
      });
    }
    mod.modResults.resources.string = strings;
    return mod;
  });
}

// ── 5. Register package in MainApplication ───────────────────────────────────
function withPackageRegistration(config) {
  return withDangerousMod(config, [
    "android",
    (mod) => {
      const mainAppPath = path.join(
        mod.modRequest.platformProjectRoot,
        "app/src/main/java/com/numinjector/MainApplication.kt"
      );
      if (!fs.existsSync(mainAppPath)) return mod;

      let src = fs.readFileSync(mainAppPath, "utf8");
      const importLine = "import com.numinjector.NumberInjectorPackage";
      const pkgLine = "NumberInjectorPackage()";

      if (!src.includes(importLine)) {
        src = src.replace(
          "import expo.modules.ReactNativeHostWrapper",
          `import expo.modules.ReactNativeHostWrapper\n${importLine}`
        );
      }
      if (!src.includes(pkgLine)) {
        src = src.replace(
          "packages.add(ReactNativeHostWrapper.cradle(",
          `packages.add(NumberInjectorPackage())\n            packages.add(ReactNativeHostWrapper.cradle(`
        );
      }
      fs.writeFileSync(mainAppPath, src, "utf8");
      return mod;
    },
  ]);
}

// ── Compose all plugins ──────────────────────────────────────────────────────
module.exports = function withNumberInjector(config) {
  config = withOldArch(config);
  config = withKotlinSources(config);
  config = withManifest(config);
  config = withServiceString(config);
  config = withPackageRegistration(config);
  return config;
};
