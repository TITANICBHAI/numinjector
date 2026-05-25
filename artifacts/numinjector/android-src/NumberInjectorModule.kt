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

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    fun emit(event: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("NumberInjectorEvent", params)
    }

    @ReactMethod
    fun isAccessibilityServiceEnabled(promise: Promise) {
        promise.resolve(
            runCatching {
                NumberInjectorAccessibilityService.isEnabled(reactApplicationContext)
            }.getOrDefault(false)
        )
    }

    @ReactMethod
    fun hasOverlayPermission(promise: Promise) {
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            Settings.canDrawOverlays(reactApplicationContext)
        else true
        promise.resolve(granted)
    }

    @ReactMethod
    fun openAccessibilitySettings(promise: Promise) {
        runCatching {
            reactApplicationContext.startActivity(
                Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            promise.resolve(null)
        }.onFailure { promise.reject("ERROR", it.message) }
    }

    @ReactMethod
    fun openOverlaySettings(promise: Promise) {
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                reactApplicationContext.startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:${reactApplicationContext.packageName}")
                    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            }
            promise.resolve(null)
        }.onFailure { promise.reject("ERROR", it.message) }
    }

    /**
     * config keys:
     *   startNumber, endNumber, step, delayMs,
     *   fieldMode, fieldHint, buttonMode, buttonHint,
     *   padding, padChar,
     *   useCommonPins (Boolean), priorityPins (ReadableArray of String)
     */
    @ReactMethod
    fun startInjection(config: ReadableMap, promise: Promise) {
        val service = NumberInjectorAccessibilityService.instance
            ?: return promise.reject(
                "SERVICE_NOT_RUNNING",
                "Accessibility Service is not active. Enable NumInjector in Android Accessibility Settings."
            )

        // Build priority pins list from JS array
        val priorityPins = mutableListOf<String>()
        config.getArray("priorityPins")?.let { arr ->
            for (i in 0 until arr.size()) {
                priorityPins.add(arr.getString(i) ?: continue)
            }
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
            useCommonPins = config.getBoolean("useCommonPins"),
            priorityPins  = priorityPins,
        )

        service.startInjection(cfg, object : InjectionCallback {
            override fun onProgress(current: Int, attempts: Int) {
                emit("NumberInjectorEvent", Arguments.createMap().apply {
                    putString("type", "progress")
                    putInt("current", current)
                    putInt("attempts", attempts)
                })
            }
            override fun onFound(value: String, attempts: Int) {
                emit("NumberInjectorEvent", Arguments.createMap().apply {
                    putString("type", "found")
                    putString("value", value)
                    putInt("attempts", attempts)
                })
            }
            override fun onStopped(attempts: Int) {
                emit("NumberInjectorEvent", Arguments.createMap().apply {
                    putString("type", "stopped")
                    putInt("attempts", attempts)
                })
            }
            override fun onError(message: String) {
                emit("NumberInjectorEvent", Arguments.createMap().apply {
                    putString("type", "error")
                    putString("error", message)
                })
            }
        })

        promise.resolve(null)
    }

    @ReactMethod
    fun stopInjection(promise: Promise) {
        NumberInjectorAccessibilityService.instance?.stopInjection()
        promise.resolve(null)
    }
}
