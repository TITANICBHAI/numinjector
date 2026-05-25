package com.numinjector

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.*
import android.widget.*

class OverlayController(
    private val context: Context,
    private val windowManager: WindowManager,
    private val onStopClicked: () -> Unit,
    private val onPickFieldClicked: () -> Unit,
    private val onPickButtonClicked: () -> Unit,
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var bubbleView: View? = null
    private var bubbleParams: WindowManager.LayoutParams? = null

    private var tvStatus: TextView? = null
    private var tvCurrentNum: TextView? = null
    private var tvAttempts: TextView? = null
    private var tvFieldLabel: TextView? = null
    private var tvButtonLabel: TextView? = null
    private var btnStop: View? = null
    private var pickArea: View? = null

    private val COL_BG      = Color.parseColor("#0d1421")
    private val COL_CYAN    = Color.parseColor("#00d4ff")
    private val COL_ORANGE  = Color.parseColor("#ff6b35")
    private val COL_RED     = Color.parseColor("#ef4444")
    private val COL_MUTED   = Color.parseColor("#4a5568")
    private val COL_TEXT    = Color.parseColor("#e2e8f0")

    private fun dp(v: Int) = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, v.toFloat(),
        context.resources.displayMetrics
    ).toInt()

    private fun sp(v: Float) = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_SP, v,
        context.resources.displayMetrics
    )

    // ── Public API ────────────────────────────────────────────────────────────

    fun show() {
        if (bubbleView != null) return
        mainHandler.post { buildBubble() }
    }

    fun hide() {
        mainHandler.post {
            bubbleView?.let { runCatching { windowManager.removeView(it) } }
            bubbleView = null
            tvStatus = null; tvCurrentNum = null; tvAttempts = null
            tvFieldLabel = null; tvButtonLabel = null
            btnStop = null; pickArea = null
        }
    }

    fun updateStatus(running: Boolean, current: Int?, attempts: Int?, foundValue: String?) {
        mainHandler.post {
            tvCurrentNum?.text = when {
                foundValue != null -> foundValue
                running && current != null -> current.toString()
                else -> "—"
            }
            tvStatus?.apply {
                text  = if (foundValue != null) "FOUND" else if (running) "RUNNING" else "READY"
                setTextColor(if (foundValue != null) COL_CYAN else if (running) COL_ORANGE else COL_MUTED)
            }
            tvAttempts?.text = if (attempts != null && attempts > 0) "$attempts tries" else ""
            btnStop?.visibility = if (running) View.VISIBLE else View.GONE
            pickArea?.visibility = if (running) View.GONE else View.VISIBLE
        }
    }

    fun onFieldPicked(label: String) {
        mainHandler.post {
            tvFieldLabel?.text  = if (label.isBlank()) "Field ✓" else "Field: ${label.take(18)}"
            tvFieldLabel?.setTextColor(COL_CYAN)
        }
    }

    fun onButtonPicked(label: String) {
        mainHandler.post {
            tvButtonLabel?.text  = if (label.isBlank()) "Button ✓" else "Button: ${label.take(16)}"
            tvButtonLabel?.setTextColor(COL_ORANGE)
        }
    }

    fun setPickingState(type: String?) {
        mainHandler.post {
            when (type) {
                "field"  -> tvFieldLabel?.apply  { text = "Tap a field…"; setTextColor(COL_ORANGE) }
                "button" -> tvButtonLabel?.apply { text = "Tap a button…"; setTextColor(COL_ORANGE) }
                null -> {
                    tvFieldLabel?.setTextColor(COL_MUTED)
                    tvButtonLabel?.setTextColor(COL_MUTED)
                }
            }
        }
    }

    fun clearField()  { mainHandler.post { tvFieldLabel?.apply  { text = "auto-detect"; setTextColor(COL_MUTED) } } }
    fun clearButton() { mainHandler.post { tvButtonLabel?.apply { text = "auto-detect"; setTextColor(COL_MUTED) } } }

    // ── Build bubble ──────────────────────────────────────────────────────────

    private fun buildBubble() {
        val ctx = context

        // Root card
        val root = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(10), dp(12), dp(12))
            background = GradientDrawable().apply {
                cornerRadius = dp(14).toFloat()
                setColor(COL_BG)
                setStroke(dp(1), COL_CYAN)
            }
            elevation = dp(8).toFloat()
        }

        // Header row: drag handle + status chip
        val headerRow = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        TextView(ctx).apply {
            text = "≡  NumInjector"
            setTextColor(COL_CYAN)
            textSize = 11f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }.also { headerRow.addView(it) }
        tvStatus = TextView(ctx).apply {
            text = "READY"
            setTextColor(COL_MUTED)
            textSize = 10f
        }.also { headerRow.addView(it) }
        root.addView(headerRow)

        // Big current number
        tvCurrentNum = TextView(ctx).apply {
            text = "—"
            setTextColor(COL_TEXT)
            textSize = 34f
            gravity = Gravity.CENTER
            setPadding(0, dp(4), 0, 0)
        }
        root.addView(tvCurrentNum, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        // Attempts
        tvAttempts = TextView(ctx).apply {
            text = ""
            setTextColor(COL_MUTED)
            textSize = 11f
            gravity = Gravity.CENTER
        }
        root.addView(tvAttempts, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        // Stop button (hidden when idle)
        val stopBtn = TextView(ctx).apply {
            text = "■  Stop Injection"
            setTextColor(Color.WHITE)
            textSize = 13f
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                cornerRadius = dp(8).toFloat()
                setColor(COL_RED)
            }
            setPadding(dp(10), dp(8), dp(10), dp(8))
            visibility = View.GONE
            isClickable = true
            setOnClickListener { onStopClicked() }
        }
        root.addView(stopBtn, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(8) })
        btnStop = stopBtn

        // Divider
        root.addView(View(ctx).apply {
            setBackgroundColor(COL_MUTED)
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1)).apply {
            topMargin = dp(10); bottomMargin = dp(8)
        })

        // Pick area (field + button rows)
        val pa = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL; layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT) }

        // Field row
        val fieldRow = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(6) }
        }
        TextView(ctx).apply {
            text = "📍 Field"
            setTextColor(COL_CYAN)
            textSize = 11f
            background = GradientDrawable().apply {
                cornerRadius = dp(6).toFloat()
                setStroke(dp(1), COL_CYAN)
                setColor(Color.TRANSPARENT)
            }
            setPadding(dp(8), dp(5), dp(8), dp(5))
            isClickable = true
            setOnClickListener { onPickFieldClicked() }
        }.also { fieldRow.addView(it) }
        tvFieldLabel = TextView(ctx).apply {
            text = "auto-detect"
            setTextColor(COL_MUTED)
            textSize = 10f
            maxLines = 1
            setPadding(dp(6), 0, 0, 0)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }.also { fieldRow.addView(it) }
        pa.addView(fieldRow)

        // Button row
        val buttonRow = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        TextView(ctx).apply {
            text = "📍 Button"
            setTextColor(COL_ORANGE)
            textSize = 11f
            background = GradientDrawable().apply {
                cornerRadius = dp(6).toFloat()
                setStroke(dp(1), COL_ORANGE)
                setColor(Color.TRANSPARENT)
            }
            setPadding(dp(8), dp(5), dp(8), dp(5))
            isClickable = true
            setOnClickListener { onPickButtonClicked() }
        }.also { buttonRow.addView(it) }
        tvButtonLabel = TextView(ctx).apply {
            text = "auto-detect"
            setTextColor(COL_MUTED)
            textSize = 10f
            maxLines = 1
            setPadding(dp(6), 0, 0, 0)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }.also { buttonRow.addView(it) }
        pa.addView(buttonRow)

        root.addView(pa)
        pickArea = pa

        // WindowManager layout params
        val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        val params = WindowManager.LayoutParams(
            dp(220),
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = dp(12)
            y = dp(80)
        }
        bubbleParams = params

        // Drag handling: differentiate drag vs tap so inner buttons still fire
        var initX = 0; var initY = 0; var touchX = 0f; var touchY = 0f; var didDrag = false
        root.setOnTouchListener { _, ev ->
            when (ev.action) {
                MotionEvent.ACTION_DOWN -> {
                    initX = params.x; initY = params.y
                    touchX = ev.rawX; touchY = ev.rawY
                    didDrag = false; false
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = ev.rawX - touchX; val dy = ev.rawY - touchY
                    if (!didDrag && (kotlin.math.abs(dx) > dp(6) || kotlin.math.abs(dy) > dp(6))) didDrag = true
                    if (didDrag) {
                        params.x = (initX - dx.toInt()).coerceAtLeast(0)
                        params.y = (initY + dy.toInt()).coerceAtLeast(0)
                        runCatching { windowManager.updateViewLayout(root, params) }
                    }
                    didDrag
                }
                else -> false
            }
        }

        bubbleView = root
        runCatching { windowManager.addView(root, params) }
    }
}
