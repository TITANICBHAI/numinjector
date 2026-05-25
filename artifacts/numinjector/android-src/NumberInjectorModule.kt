package com.numinjector

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

private const val CHANNEL_ID  = "numinjector_running"
private const val NOTIF_ID    = 1001
private const val ACTION_STOP = "com.numinjector.STOP_INJECTION"

class NumberInjectorModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "NumberInjector"

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    // ── Notification helpers ──────────────────────────────────────────────

    private val notifManager: NotificationManager by lazy {
        reactApplicationContext
            .getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    }

    private var receiverRegistered = false

    private val stopReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == ACTION_STOP) {
                NumberInjectorAccessibilityService.instance?.stopInjection()
                cancelNotification()
            }
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID,
                "Injection Running",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shown while NumInjector is injecting numbers"
                setSound(null, null)
            }
            notifManager.createNotificationChannel(ch)
        }
    }

    private fun showRunningNotification(start: Int, end: Int) {
        ensureChannel()

        // Register the Stop broadcast receiver once
        if (!receiverRegistered) {
            val filter = IntentFilter(ACTION_STOP)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactApplicationContext.registerReceiver(
                    stopReceiver, filter, Context.RECEIVER_NOT_EXPORTED
                )
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                reactApplicationContext.registerReceiver(stopReceiver, filter)
            }
            receiverRegistered = true
        }

        val stopIntent = Intent(ACTION_STOP)
            .setPackage(reactApplicationContext.packageName)
        val stopPi = PendingIntent.getBroadcast(
            reactApplicationContext, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notif = NotificationCompat.Builder(reactApplicationContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("NumInjector — Injecting")
            .setContentText("Range $start → $end")
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(android.R.drawable.ic_delete, "Stop", stopPi)
            .build()

        notifManager.notify(NOTIF_ID, notif)
    }

    fun cancelNotification() {
        notifManager.cancel(NOTIF_ID)
        if (receiverRegistered) {
            runCatching { reactApplicationContext.unregisterReceiver(stopReceiver) }
            receiverRegistered = false
        }
    }

    // ── Bridge event emitter ──────────────────────────────────────────────

    fun emit(event: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("NumberInjectorEvent", params)
    }

    // ── React methods ─────────────────────────────────────────────────────

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

        // Show persistent notification with Stop action
        showRunningNotification(cfg.startNumber, cfg.endNumber)

        service.startInjection(cfg, object : InjectionCallback {
            override fun onProgress(current: Int, attempts: Int) {
                emit("NumberInjectorEvent", Arguments.createMap().apply {
                    putString("type", "progress")
                    putInt("current", current)
                    putInt("attempts", attempts)
                })
            }
            override fun onFound(value: String, attempts: Int) {
                cancelNotification()
                emit("NumberInjectorEvent", Arguments.createMap().apply {
                    putString("type", "found")
                    putString("value", value)
                    putInt("attempts", attempts)
                })
            }
            override fun onStopped(attempts: Int) {
                cancelNotification()
                emit("NumberInjectorEvent", Arguments.createMap().apply {
                    putString("type", "stopped")
                    putInt("attempts", attempts)
                })
            }
            override fun onError(message: String) {
                cancelNotification()
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
        cancelNotification()
        promise.resolve(null)
    }
}
