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

        /**
         * Check whether this service is active by inspecting the enabled
         * accessibility services setting.
         */
        fun isEnabled(context: Context): Boolean {
            val expectedId = "${context.packageName}/${NumberInjectorAccessibilityService::class.java.name}"
            return try {
                val enabled = Settings.Secure.getString(
                    context.contentResolver,
                    Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
                ) ?: return false
                val colonSplitter = TextUtils.SimpleStringSplitter(':')
                colonSplitter.setString(enabled)
                while (colonSplitter.hasNext()) {
                    if (colonSplitter.next().equals(expectedId, ignoreCase = true)) return true
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

    override fun onServiceConnected() {
        instance = this
    }

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        instance = null
        injectionJob?.cancel()
        return super.onUnbind(intent)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Events are handled inside the injection loop via performAction
    }

    override fun onInterrupt() {
        injectionJob?.cancel()
    }

    /**
     * Find the first editable text field on screen matching the given hint.
     * If fieldMode == "auto", returns the first editable node found.
     */
    private fun findInputField(mode: String, hint: String): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        return if (mode == "auto") {
            findFirstEditable(root)
        } else {
            findNodeByHint(root, hint) ?: findFirstEditable(root)
        }
    }

    private fun findFirstEditable(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.isEditable) return node
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val found = findFirstEditable(child)
            if (found != null) return found
        }
        return null
    }

    private fun findNodeByHint(node: AccessibilityNodeInfo?, hint: String): AccessibilityNodeInfo? {
        if (node == null || hint.isBlank()) return null
        val nodeText = node.text?.toString() ?: ""
        val nodeDesc = node.contentDescription?.toString() ?: ""
        val nodeHint = node.hintText?.toString() ?: ""
        if (nodeText.contains(hint, ignoreCase = true) ||
            nodeDesc.contains(hint, ignoreCase = true) ||
            nodeHint.contains(hint, ignoreCase = true)) {
            return node
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val found = findNodeByHint(child, hint)
            if (found != null) return found
        }
        return null
    }

    /**
     * Find the submit/confirm button on screen.
     */
    private fun findButton(mode: String, hint: String): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        return if (mode == "auto") {
            findFirstClickableButton(root)
        } else {
            findNodeByHint(root, hint) ?: findFirstClickableButton(root)
        }
    }

    private fun findFirstClickableButton(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.isClickable && node.className?.contains("Button") == true) return node
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val found = findFirstClickableButton(child)
            if (found != null) return found
        }
        // Fallback: any clickable leaf
        if (node.isClickable && node.childCount == 0) return node
        return null
    }

    /**
     * Set text in an editable node using ACTION_SET_TEXT (API 21+).
     */
    private fun setText(node: AccessibilityNodeInfo, text: String): Boolean {
        val args = Bundle()
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    /**
     * Start the injection loop. Runs on a background coroutine.
     */
    fun startInjection(config: InjectionConfig, callback: InjectionCallback) {
        injectionJob?.cancel()
        injectionJob = serviceScope.launch {
            var attempts = 0
            var current = config.startNumber

            while (current <= config.endNumber && isActive) {
                val formatted = config.format(current)

                // Find nodes fresh each iteration (UI may change)
                val inputNode = findInputField(config.fieldMode, config.fieldHint)
                val buttonNode = findButton(config.buttonMode, config.buttonHint)

                if (inputNode == null) {
                    callback.onError("Could not find input field. Make sure the target app is in the foreground.")
                    return@launch
                }

                // Inject the number
                val setOk = setText(inputNode, formatted)
                if (!setOk) {
                    // Try focus first then set text
                    inputNode.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                    delay(80)
                    setText(inputNode, formatted)
                }

                delay(100) // brief settle

                // Click the button if found
                buttonNode?.performAction(AccessibilityNodeInfo.ACTION_CLICK)

                attempts++
                callback.onProgress(current, attempts)

                // Wait for the app to respond
                delay(config.delayMs)

                // Heuristic "found" detection: if the field is now empty or the
                // app navigated away (root changed), the value may have been accepted.
                // The user can also stop manually. For maximum compatibility this is
                // intentionally conservative — advanced callers can use the manual stop.
                val rootAfter = rootInActiveWindow
                val fieldAfter = if (rootAfter != null) findFirstEditable(rootAfter) else null
                if (fieldAfter != null) {
                    val textAfter = fieldAfter.text?.toString() ?: ""
                    if (textAfter.isEmpty() || textAfter != formatted) {
                        // Field was cleared or changed — possible match, stop and report
                        callback.onFound(formatted, attempts)
                        return@launch
                    }
                } else {
                    // Field disappeared — navigation occurred, likely success
                    callback.onFound(formatted, attempts)
                    return@launch
                }

                current += config.step
            }

            // Exhausted the range
            callback.onStopped(attempts)
        }
    }

    /**
     * Stop the currently running injection loop.
     */
    fun stopInjection() {
        injectionJob?.cancel()
        injectionJob = null
    }
}
