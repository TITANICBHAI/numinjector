package com.numinjector

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class NumberInjectorModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "NumberInjector"

    // Required for RCTEventEmitter support (old arch)
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    /**
     * Emit event to JS side
     */
    fun emit(event: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("NumberInjectorEvent", params)
    }

    /**
     * Check whether the NumInjector accessibility service is enabled.
     */
    @ReactMethod
    fun isAccessibilityServiceEnabled(promise: Promise) {
        try {
            val enabled = NumberInjectorAccessibilityService.isEnabled(reactApplicationContext)
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * Check whether the SYSTEM_ALERT_WINDOW (overlay) permission is granted.
     */
    @ReactMethod
    fun hasOverlayPermission(promise: Promise) {
        try {
            val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(reactApplicationContext)
            } else {
                true
            }
            promise.resolve(granted)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * Open the Android Accessibility Settings screen.
     */
    @ReactMethod
    fun openAccessibilitySettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    /**
     * Open the SYSTEM_ALERT_WINDOW (overlay) permission settings.
     */
    @ReactMethod
    fun openOverlaySettings(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${reactApplicationContext.packageName}")
                )
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(intent)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    /**
     * Start the number injection loop.
     *
     * config keys:
     *   startNumber: Int
     *   endNumber: Int
     *   step: Int
     *   delayMs: Int
     *   fieldMode: "auto" | "manual"
     *   fieldHint: String
     *   buttonMode: "auto" | "manual"
     *   buttonHint: String
     *   padding: Int
     *   padChar: String
     */
    @ReactMethod
    fun startInjection(config: ReadableMap, promise: Promise) {
        val service = NumberInjectorAccessibilityService.instance
        if (service == null) {
            promise.reject("SERVICE_NOT_RUNNING",
                "Accessibility Service is not active. Please enable NumInjector in Accessibility Settings.")
            return
        }

        val cfg = InjectionConfig(
            startNumber   = config.getInt("startNumber"),
            endNumber     = config.getInt("endNumber"),
            step          = config.getInt("step").coerceAtLeast(1),
            delayMs       = config.getInt("delayMs").coerceAtLeast(50).toLong(),
            fieldMode     = config.getString("fieldMode") ?: "auto",
            fieldHint     = config.getString("fieldHint") ?: "",
            buttonMode    = config.getString("buttonMode") ?: "auto",
            buttonHint    = config.getString("buttonHint") ?: "",
            padding       = config.getInt("padding"),
            padChar       = config.getString("padChar") ?: "0",
        )

        service.startInjection(cfg, object : InjectionCallback {
            override fun onProgress(current: Int, attempts: Int) {
                val params = Arguments.createMap().apply {
                    putString("type", "progress")
                    putInt("current", current)
                    putInt("attempts", attempts)
                }
                emit("NumberInjectorEvent", params)
            }

            override fun onFound(value: String, attempts: Int) {
                val params = Arguments.createMap().apply {
                    putString("type", "found")
                    putString("value", value)
                    putInt("attempts", attempts)
                }
                emit("NumberInjectorEvent", params)
            }

            override fun onStopped(attempts: Int) {
                val params = Arguments.createMap().apply {
                    putString("type", "stopped")
                    putInt("attempts", attempts)
                }
                emit("NumberInjectorEvent", params)
            }

            override fun onError(message: String) {
                val params = Arguments.createMap().apply {
                    putString("type", "error")
                    putString("error", message)
                }
                emit("NumberInjectorEvent", params)
            }
        })

        promise.resolve(null)
    }

    /**
     * Stop the currently running injection loop.
     */
    @ReactMethod
    fun stopInjection(promise: Promise) {
        NumberInjectorAccessibilityService.instance?.stopInjection()
        promise.resolve(null)
    }
}
