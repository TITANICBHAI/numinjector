package com.numinjector

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.graphics.Rect
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.TextUtils
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.facebook.react.bridge.Arguments
import kotlinx.coroutines.*

class NumberInjectorAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile var instance: NumberInjectorAccessibilityService? = null

        // ── Picked targets (set from pick mode, persist across injection runs) ──
        @Volatile var pickedField: PickedTargetInfo? = null
        @Volatile var pickedButton: PickedTargetInfo? = null

        // ── Pick mode flags ────────────────────────────────────────────────────
        @Volatile var pickingField  = false
        @Volatile var pickingButton = false

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
            } catch (e: Exception) { false }
        }
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var injectionJob: Job? = null
    private val serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    var overlayController: OverlayController? = null

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onServiceConnected() {
        instance = this
        // Build the overlay controller (but don't show it yet)
        mainHandler.post {
            overlayController = OverlayController(
                context         = this,
                windowManager   = getSystemService(WINDOW_SERVICE) as WindowManager,
                onStopClicked   = { stopInjection() },
                onPickFieldClicked  = { startFieldPick() },
                onPickButtonClicked = { startButtonPick() },
            )
        }
    }

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        instance = null
        injectionJob?.cancel()
        overlayController?.hide()
        overlayController = null
        return super.onUnbind(intent)
    }

    // ── Accessibility events — used for pick mode ─────────────────────────────

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        val node = event.source ?: return

        if (pickingField &&
            event.eventType == AccessibilityEvent.TYPE_VIEW_FOCUSED &&
            node.isEditable) {
            pickingField = false
            val bounds = Rect()
            node.getBoundsInScreen(bounds)
            val label = listOf(
                node.hintText?.toString(),
                node.contentDescription?.toString(),
                node.viewIdResourceName?.substringAfterLast('/'),
                node.text?.toString(),
            ).firstOrNull { !it.isNullOrBlank() } ?: ""

            pickedField = PickedTargetInfo(
                left      = bounds.left,
                top       = bounds.top,
                right     = bounds.right,
                bottom    = bounds.bottom,
                viewId    = node.viewIdResourceName,
                className = node.className?.toString(),
                label     = label.take(30),
            )
            overlayController?.setPickingState(null)
            overlayController?.onFieldPicked(label)
            emitPicked("fieldPicked", label)
        }

        if (pickingButton &&
            event.eventType == AccessibilityEvent.TYPE_VIEW_CLICKED &&
            node.isClickable && !node.isEditable) {
            pickingButton = false
            val bounds = Rect()
            node.getBoundsInScreen(bounds)
            val label = listOf(
                node.text?.toString(),
                node.contentDescription?.toString(),
                node.viewIdResourceName?.substringAfterLast('/'),
            ).firstOrNull { !it.isNullOrBlank() } ?: ""

            pickedButton = PickedTargetInfo(
                left      = bounds.left,
                top       = bounds.top,
                right     = bounds.right,
                bottom    = bounds.bottom,
                viewId    = node.viewIdResourceName,
                className = node.className?.toString(),
                label     = label.take(30),
            )
            overlayController?.setPickingState(null)
            overlayController?.onButtonPicked(label)
            emitPicked("buttonPicked", label)
        }
    }

    override fun onInterrupt() { injectionJob?.cancel() }

    // ── Pick mode entry points ────────────────────────────────────────────────

    fun startFieldPick() {
        pickingField  = true
        pickingButton = false
        overlayController?.setPickingState("field")
    }

    fun startButtonPick() {
        pickingButton = true
        pickingField  = false
        overlayController?.setPickingState("button")
    }

    fun cancelPick() {
        pickingField  = false
        pickingButton = false
        overlayController?.setPickingState(null)
    }

    // ── Node finders ──────────────────────────────────────────────────────────

    private fun findInputField(mode: String, hint: String): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        // Prefer precisely picked node (bounds-based)
        pickedField?.let { target ->
            findNodeByBounds(root, target)?.let { return it }
        }
        return if (mode == "auto") findFirstEditable(root)
        else findNodeByHint(root, hint) ?: findFirstEditable(root)
    }

    private fun findButton(mode: String, hint: String): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        // Prefer precisely picked node
        pickedButton?.let { target ->
            findNodeByBounds(root, target)?.let { return it }
        }
        return if (mode == "auto") findFirstClickableButton(root)
        else findNodeByHint(root, hint) ?: findFirstClickableButton(root)
    }

    /**
     * Walk the node tree and return the node whose screen bounds exactly match
     * the stored target. Falls back gracefully if layout shifted (scroll etc.).
     */
    private fun findNodeByBounds(
        node: AccessibilityNodeInfo?,
        target: PickedTargetInfo,
    ): AccessibilityNodeInfo? {
        node ?: return null
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        // Exact match first
        if (target.matches(bounds)) return node
        // Child recursion
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val found = findNodeByBounds(child, target)
            if (found != null) return found
            child.recycle()
        }
        return null
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
        val text      = node.text?.toString() ?: ""
        val desc      = node.contentDescription?.toString() ?: ""
        val hintText  = node.hintText?.toString() ?: ""
        if (text.contains(hint, true) || desc.contains(hint, true) || hintText.contains(hint, true))
            return node
        for (i in 0 until node.childCount) {
            val found = findNodeByHint(node.getChild(i), hint)
            if (found != null) return found
        }
        return null
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
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    // ── Core injection ────────────────────────────────────────────────────────

    private suspend fun tryValue(formatted: String, config: InjectionConfig): Boolean {
        val inputNode = findInputField(config.fieldMode, config.fieldHint) ?: return false

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

        val rootAfter  = rootInActiveWindow
        val fieldAfter = rootAfter?.let { findFirstEditable(it) }
        return fieldAfter == null ||
               (fieldAfter.text?.toString()?.let { it.isEmpty() || it != formatted } == true)
    }

    fun startInjection(config: InjectionConfig, callback: InjectionCallback) {
        injectionJob?.cancel()
        injectionJob = serviceScope.launch {
            var attempts = 0

            // Phase 1: Common PINs priority sweep
            if (config.useCommonPins && config.priorityPins.isNotEmpty()) {
                val seen = mutableSetOf<String>()
                for (pin in config.priorityPins) {
                    if (!isActive) break
                    if (!seen.add(pin)) continue
                    val matched = tryValue(pin, config)
                    attempts++
                    val numVal = pin.toIntOrNull() ?: -1
                    callback.onProgress(numVal, attempts)
                    overlayController?.updateStatus(true, numVal, attempts, null)
                    if (matched) {
                        overlayController?.updateStatus(false, null, attempts, pin)
                        callback.onFound(pin, attempts)
                        return@launch
                    }
                }
            }

            // Phase 2: Sequential sweep
            var current = config.startNumber
            while (current <= config.endNumber && isActive) {
                val formatted = config.format(current)
                val matched = tryValue(formatted, config)
                attempts++
                callback.onProgress(current, attempts)
                overlayController?.updateStatus(true, current, attempts, null)
                if (matched) {
                    overlayController?.updateStatus(false, null, attempts, formatted)
                    callback.onFound(formatted, attempts)
                    return@launch
                }
                current += config.step
            }

            overlayController?.updateStatus(false, null, attempts, null)
            callback.onStopped(attempts)
        }
    }

    fun stopInjection() {
        injectionJob?.cancel()
        injectionJob = null
        overlayController?.updateStatus(false, null, null, null)
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun emitPicked(type: String, label: String) {
        NumberInjectorModule.instance?.emit("NumberInjectorEvent",
            Arguments.createMap().apply {
                putString("type", type)
                putString("label", label)
            })
    }
}
