package com.numinjector

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
