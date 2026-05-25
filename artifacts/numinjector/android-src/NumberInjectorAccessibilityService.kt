package com.numinjector

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.TextUtils
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import kotlinx.coroutines.*

class NumberInjectorAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile
        var instance: NumberInjectorAccessibilityService? = null

        fun isEnabled(context: Context): Boolean {
            val expectedId =
                "${context.packageName}/${NumberInjectorAccessibilityService::class.java.name}"
            return try {
                val enabled = Settings.Secure.getString(
                    context.contentResolver,
                    Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
                ) ?: return false
                val splitter = TextUtils.SimpleStringSplitter(':')
                splitter.setString(enabled)
                while (splitter.hasNext()) {
                    if (splitter.next().equals(expectedId, ignoreCase = true)) return true
                }
                false
            } catch (e: Exception) {
                false
            }
        }
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var injectionJob: Job? = null
    private val serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    override fun onServiceConnected() { instance = this }

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        instance = null
        injectionJob?.cancel()
        return super.onUnbind(intent)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() { injectionJob?.cancel() }

    // ── Node finders ──────────────────────────────────────────────────────────

    private fun findInputField(mode: String, hint: String): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        return if (mode == "auto") findFirstEditable(root)
        else findNodeByHint(root, hint) ?: findFirstEditable(root)
    }

    private fun findFirstEditable(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.isEditable) return node
        for (i in 0 until node.childCount) {
            val found = findFirstEditable(node.getChild(i))
            if (found != null) return found
        }
        return null
    }

    private fun findNodeByHint(node: AccessibilityNodeInfo?, hint: String): AccessibilityNodeInfo? {
        if (node == null || hint.isBlank()) return null
        val text = node.text?.toString() ?: ""
        val desc = node.contentDescription?.toString() ?: ""
        val hintText = node.hintText?.toString() ?: ""
        if (text.contains(hint, true) || desc.contains(hint, true) || hintText.contains(hint, true))
            return node
        for (i in 0 until node.childCount) {
            val found = findNodeByHint(node.getChild(i), hint)
            if (found != null) return found
        }
        return null
    }

    private fun findButton(mode: String, hint: String): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        return if (mode == "auto") findFirstClickableButton(root)
        else findNodeByHint(root, hint) ?: findFirstClickableButton(root)
    }

    private fun findFirstClickableButton(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.isClickable && node.className?.contains("Button") == true) return node
        for (i in 0 until node.childCount) {
            val found = findFirstClickableButton(node.getChild(i))
            if (found != null) return found
        }
        if (node.isClickable && node.childCount == 0) return node
        return null
    }

    // ── Text injection ────────────────────────────────────────────────────────

    private fun setText(node: AccessibilityNodeInfo, text: String): Boolean {
        val args = Bundle()
        args.putCharSequence(
            AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text
        )
        return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    // ── Core injection ────────────────────────────────────────────────────────

    /**
     * Try a single value: inject → click → wait → check.
     * Returns true if the injection appears to have succeeded.
     */
    private suspend fun tryValue(
        formatted: String,
        config: InjectionConfig,
    ): Boolean {
        val inputNode = findInputField(config.fieldMode, config.fieldHint)
            ?: return false

        val setOk = setText(inputNode, formatted)
        if (!setOk) {
            inputNode.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
            delay(80)
            setText(inputNode, formatted)
        }
        delay(100)

        val buttonNode = findButton(config.buttonMode, config.buttonHint)
        buttonNode?.performAction(AccessibilityNodeInfo.ACTION_CLICK)

        delay(config.delayMs)

        // Heuristic: field gone, cleared, or navigation happened → probable match
        val rootAfter = rootInActiveWindow
        val fieldAfter = rootAfter?.let { findFirstEditable(it) }
        return fieldAfter == null ||
               (fieldAfter.text?.toString()?.let { it.isEmpty() || it != formatted } == true)
    }

    fun startInjection(config: InjectionConfig, callback: InjectionCallback) {
        injectionJob?.cancel()
        injectionJob = serviceScope.launch {
            var attempts = 0

            // ── Phase 1: Priority (common) PINs ──────────────────────────────
            if (config.useCommonPins && config.priorityPins.isNotEmpty()) {
                val seen = mutableSetOf<String>()
                for (pin in config.priorityPins) {
                    if (!isActive) break
                    if (!seen.add(pin)) continue          // dedupe

                    val matched = tryValue(pin, config)
                    attempts++
                    // Report progress using numeric value if parseable, else -1
                    callback.onProgress(pin.toIntOrNull() ?: -1, attempts)

                    if (matched) {
                        callback.onFound(pin, attempts)
                        return@launch
                    }
                }
            }

            // ── Phase 2: Sequential sweep ─────────────────────────────────────
            var current = config.startNumber
            while (current <= config.endNumber && isActive) {
                val formatted = config.format(current)
                val matched = tryValue(formatted, config)
                attempts++
                callback.onProgress(current, attempts)

                if (matched) {
                    callback.onFound(formatted, attempts)
                    return@launch
                }

                current += config.step
            }

            callback.onStopped(attempts)
        }
    }

    fun stopInjection() {
        injectionJob?.cancel()
        injectionJob = null
    }
}
