package com.numinjector

import android.graphics.Rect

/**
 * Bounds-based record of a UI node the user physically tapped to select.
 * Used for precise targeting during injection instead of text-hint guessing.
 */
data class PickedTargetInfo(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
    val viewId: String?,       // android:id resource name if available (most stable)
    val className: String?,
    val label: String,         // display label shown in bubble & app UI
) {
    fun toRect() = Rect(left, top, right, bottom)
    fun matches(bounds: Rect) =
        bounds.left == left && bounds.top == top &&
        bounds.right == right && bounds.bottom == bottom
}

data class InjectionConfig(
    val startNumber: Int,
    val endNumber: Int,
    val step: Int,
    val delayMs: Long,
    val fieldMode: String,
    val fieldHint: String,
    val buttonMode: String,
    val buttonHint: String,
    val padding: Int,
    val padChar: String,
    val useCommonPins: Boolean = false,
    val priorityPins: List<String> = emptyList(),
) {
    fun format(n: Int): String {
        val s = n.toString()
        return if (padding > 0) s.padStart(padding, padChar.firstOrNull() ?: '0')
        else s
    }
}

interface InjectionCallback {
    fun onProgress(current: Int, attempts: Int)
    fun onFound(value: String, attempts: Int)
    fun onStopped(attempts: Int)
    fun onError(message: String)
}
