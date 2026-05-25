import {
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { Accelerometer } from "expo-sensors";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useInjector } from "@/context/InjectorContext";
import { useColors } from "@/hooks/useColors";

type SectionId = "target" | "range" | "settings";

function SectionHeader({
  title,
  icon,
  expanded,
  onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.sectionHeader, { borderBottomColor: colors.border }]}
    >
      <View style={styles.sectionHeaderLeft}>
        {icon}
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.foreground, fontFamily: "Inter_600SemiBold" },
          ]}
        >
          {title}
        </Text>
      </View>
      <Ionicons
        name={expanded ? "chevron-up" : "chevron-down"}
        size={18}
        color={colors.mutedForeground}
      />
    </Pressable>
  );
}

function ConfigInput({
  label,
  value,
  onChangeText,
  keyboardType = "numeric",
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "numeric" | "default";
  placeholder?: string;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.configInputWrap}>
      <Text
        style={[
          styles.configLabel,
          { color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
        ]}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        editable={!disabled}
        style={[
          styles.configInput,
          {
            color: colors.foreground,
            backgroundColor: colors.muted,
            borderColor: colors.border,
            borderRadius: colors.radius,
            fontFamily: "Inter_400Regular",
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      />
    </View>
  );
}

function ModeToggle({
  label,
  mode,
  onChange,
}: {
  label: string;
  mode: "auto" | "manual";
  onChange: (m: "auto" | "manual") => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.modeRow}>
      <Text
        style={[
          styles.configLabel,
          { color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.modeToggleWrap,
          { backgroundColor: colors.muted, borderRadius: 10 },
        ]}
      >
        {(["auto", "manual"] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => onChange(m)}
            style={[
              styles.modeToggleBtn,
              {
                backgroundColor:
                  mode === m ? colors.primary : "transparent",
                borderRadius: 8,
              },
            ]}
          >
            <Text
              style={[
                styles.modeToggleText,
                {
                  color:
                    mode === m
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                  fontFamily:
                    mode === m ? "Inter_600SemiBold" : "Inter_400Regular",
                },
              ]}
            >
              {m === "auto" ? "Auto" : "Manual"}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ServiceBanner() {
  const colors = useColors();
  const { state, openAccessibilitySettings } = useInjector();

  if (state.serviceEnabled) return null;

  return (
    <Pressable
      onPress={openAccessibilitySettings}
      style={[
        styles.banner,
        {
          backgroundColor: colors.warning + "22",
          borderColor: colors.warning,
          borderRadius: colors.radius,
        },
      ]}
    >
      <Ionicons
        name="warning-outline"
        size={16}
        color={colors.warning}
      />
      <Text
        style={[
          styles.bannerText,
          { color: colors.warning, fontFamily: "Inter_500Medium" },
        ]}
      >
        Accessibility Service not enabled — tap to fix
      </Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    config, setConfig, state, history, start, stop, refreshServiceStatus,
    pickedField, pickedButton, startFieldPick, startButtonPick,
    clearPickedField, clearPickedButton, overlayVisible, showOverlay, hideOverlay,
  } = useInjector();

  const SPEED_PRESETS = [
    { label: "⚡ Turbo", ms: 50 },
    { label: "Fast", ms: 200 },
    { label: "Normal", ms: 400 },
    { label: "Careful", ms: 1000 },
  ] as const;

  const [expanded, setExpanded] = useState<Set<SectionId>>(
    new Set(["target", "range"])
  );
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;

  const toggleSection = useCallback((id: SectionId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refreshServiceStatus();
    });
    return () => sub.remove();
  }, [refreshServiceStatus]);

  const keepAwakeActive = useRef(false);

  useEffect(() => {
    if (state.running) {
      activateKeepAwakeAsync().then(() => {
        keepAwakeActive.current = true;
      }).catch(() => {});
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.5,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => {
        pulse.stop();
        if (keepAwakeActive.current) {
          deactivateKeepAwake();
          keepAwakeActive.current = false;
        }
      };
    } else {
      if (keepAwakeActive.current) {
        deactivateKeepAwake();
        keepAwakeActive.current = false;
      }
      pulseAnim.setValue(1);
    }
  }, [state.running, pulseAnim]);

  useEffect(() => {
    const total = config.endNumber - config.startNumber;
    if (total <= 0) return;
    const progress = (state.current - config.startNumber) / total;
    Animated.timing(progressWidth, {
      toValue: Math.max(0, Math.min(1, progress)),
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [state.current, config.startNumber, config.endNumber, progressWidth]);

  // Shake-to-stop: detect shake while running and abort injection
  const lastShakeRef = useRef(0);
  useEffect(() => {
    if (!state.running) return;
    Accelerometer.setUpdateInterval(80);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const mag = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();
      if (mag > 2.8 && now - lastShakeRef.current > 2500) {
        lastShakeRef.current = now;
        stop();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    });
    return () => sub.remove();
  }, [state.running, stop]);

  const handleStartStop = useCallback(async () => {
    if (state.running) {
      stop();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await start();
    }
  }, [state.running, stop, start]);

  const isExpanded = (id: SectionId) => expanded.has(id);

  const formatNum = (n: number) => {
    if (config.padding > 0) {
      return String(n).padStart(config.padding, config.padChar);
    }
    return String(n);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === "web" ? 67 + 16 : insets.top + 16,
            paddingBottom: Platform.OS === "web" ? 34 + 40 : insets.bottom + 40,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <View>
            <Text
              style={[
                styles.appTitle,
                { color: colors.primary, fontFamily: "Inter_700Bold" },
              ]}
            >
              NumInjector
            </Text>
            <Text
              style={[
                styles.appSub,
                {
                  color: colors.mutedForeground,
                  fontFamily: "Inter_400Regular",
                },
              ]}
            >
              Automated numeric field testing
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              onPress={() => router.push("/history")}
              style={({ pressed }) => [
                styles.historyBtn,
                {
                  backgroundColor: pressed
                    ? colors.muted
                    : colors.muted + "88",
                  borderRadius: 10,
                },
              ]}
            >
              <Ionicons name="time-outline" size={18} color={colors.primary} />
              {history.length > 0 && (
                <View
                  style={[
                    styles.historyBadge,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.historyBadgeText,
                      {
                        color: colors.primaryForeground,
                        fontFamily: "Inter_700Bold",
                      },
                    ]}
                  >
                    {history.length > 99 ? "99+" : history.length}
                  </Text>
                </View>
              )}
            </Pressable>
            <View
              style={[
                styles.serviceStatusDot,
                {
                  backgroundColor: state.serviceEnabled
                    ? colors.success
                    : colors.destructive,
                },
              ]}
            />
            <Text
              style={[
                styles.serviceStatusText,
                {
                  color: state.serviceEnabled
                    ? colors.success
                    : colors.destructive,
                  fontFamily: "Inter_500Medium",
                },
              ]}
            >
              {state.serviceEnabled ? "Active" : "Off"}
            </Text>
          </View>
        </View>

        <ServiceBanner />

        {(state.running || state.found || state.error) && (
          <View
            style={[
              styles.statusCard,
              {
                backgroundColor: state.found
                  ? colors.success + "18"
                  : state.error
                    ? colors.destructive + "18"
                    : colors.card,
                borderColor: state.found
                  ? colors.success
                  : state.error
                    ? colors.destructive
                    : colors.primary,
                borderRadius: colors.radius,
              },
            ]}
          >
            {state.running && (
              <>
                <View style={styles.statusRunningRow}>
                  <Animated.View
                    style={[
                      styles.statusDotLive,
                      {
                        backgroundColor: colors.primary,
                        opacity: pulseAnim,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusLabel,
                      {
                        color: colors.primary,
                        fontFamily: "Inter_600SemiBold",
                      },
                    ]}
                  >
                    Running
                  </Text>
                  <Text
                    style={[
                      styles.attemptsText,
                      {
                        color: colors.mutedForeground,
                        fontFamily: "Inter_400Regular",
                      },
                    ]}
                  >
                    {state.attempts} attempts
                  </Text>
                </View>
                <Text
                  style={[
                    styles.currentNum,
                    {
                      color: colors.foreground,
                      fontFamily: "Inter_700Bold",
                    },
                  ]}
                >
                  {formatNum(state.current)}
                </Text>
                <View
                  style={[
                    styles.progressTrack,
                    { backgroundColor: colors.muted, borderRadius: 4 },
                  ]}
                >
                  <Animated.View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: colors.primary,
                        borderRadius: 4,
                        width: progressWidth.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0%", "100%"],
                        }),
                      },
                    ]}
                  />
                </View>
              </>
            )}
            {state.found && (
              <View style={styles.resultRow}>
                <Ionicons
                  name="checkmark-circle"
                  size={28}
                  color={colors.success}
                />
                <View>
                  <Text
                    style={[
                      styles.resultLabel,
                      {
                        color: colors.success,
                        fontFamily: "Inter_700Bold",
                      },
                    ]}
                  >
                    Found!
                  </Text>
                  <Text
                    style={[
                      styles.resultValue,
                      {
                        color: colors.foreground,
                        fontFamily: "Inter_600SemiBold",
                      },
                    ]}
                  >
                    Value: {state.foundValue}
                  </Text>
                  <Text
                    style={[
                      styles.attemptsText,
                      {
                        color: colors.mutedForeground,
                        fontFamily: "Inter_400Regular",
                      },
                    ]}
                  >
                    {state.attempts} attempts
                  </Text>
                </View>
              </View>
            )}
            {state.error && (
              <View style={styles.resultRow}>
                <Ionicons
                  name="alert-circle"
                  size={24}
                  color={colors.destructive}
                />
                <Text
                  style={[
                    styles.errorText,
                    {
                      color: colors.destructive,
                      fontFamily: "Inter_500Medium",
                    },
                  ]}
                >
                  {state.error}
                </Text>
              </View>
            )}
          </View>
        )}

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <SectionHeader
            title="Target Selection"
            icon={
              <MaterialCommunityIcons
                name="crosshairs"
                size={18}
                color={colors.primary}
              />
            }
            expanded={isExpanded("target")}
            onToggle={() => toggleSection("target")}
          />
          {isExpanded("target") && (
            <View style={styles.sectionBody}>
              {/* Overlay bubble toggle */}
              <Pressable
                onPress={overlayVisible ? hideOverlay : showOverlay}
                disabled={state.running ? false : !state.serviceEnabled}
                style={({ pressed }) => [
                  styles.overlayToggleBtn,
                  {
                    backgroundColor: overlayVisible
                      ? colors.primary + "22"
                      : pressed
                        ? colors.muted
                        : colors.muted + "55",
                    borderColor: overlayVisible ? colors.primary : colors.border,
                    borderRadius: colors.radius - 2,
                    opacity: !state.serviceEnabled && !overlayVisible ? 0.5 : 1,
                  },
                ]}
              >
                <Ionicons
                  name={overlayVisible ? "layers" : "layers-outline"}
                  size={16}
                  color={overlayVisible ? colors.primary : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.overlayToggleText,
                    {
                      color: overlayVisible ? colors.primary : colors.mutedForeground,
                      fontFamily: overlayVisible ? "Inter_600SemiBold" : "Inter_400Regular",
                    },
                  ]}
                >
                  {overlayVisible ? "Overlay On — floating bubble active" : "Show Overlay Bubble"}
                </Text>
              </Pressable>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Field picker */}
              <View style={styles.pickRow}>
                <View style={styles.pickInfo}>
                  <Text style={[styles.pickLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    Input Field
                  </Text>
                  <Text
                    style={[styles.pickValue, { color: pickedField ? colors.primary : colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                    numberOfLines={1}
                  >
                    {pickedField ? `✓ ${pickedField}` : "auto-detect (first editable field)"}
                  </Text>
                </View>
                <View style={styles.pickBtns}>
                  {pickedField && (
                    <Pressable
                      onPress={clearPickedField}
                      disabled={state.running}
                      style={({ pressed }) => [styles.pickClearBtn, { opacity: pressed || state.running ? 0.5 : 1 }]}
                    >
                      <Ionicons name="close-circle" size={18} color={colors.destructive} />
                    </Pressable>
                  )}
                  <Pressable
                    onPress={startFieldPick}
                    disabled={state.running || !state.serviceEnabled}
                    style={({ pressed }) => [
                      styles.pickBtn,
                      {
                        backgroundColor: pressed ? colors.primary + "33" : colors.primary + "18",
                        borderColor: colors.primary + "66",
                        borderRadius: colors.radius - 4,
                        opacity: state.running || !state.serviceEnabled ? 0.4 : 1,
                      },
                    ]}
                  >
                    <Ionicons name="locate" size={14} color={colors.primary} />
                    <Text style={[styles.pickBtnText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                      Pick
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Button picker */}
              <View style={styles.pickRow}>
                <View style={styles.pickInfo}>
                  <Text style={[styles.pickLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    Submit Button
                  </Text>
                  <Text
                    style={[styles.pickValue, { color: pickedButton ? colors.secondary : colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                    numberOfLines={1}
                  >
                    {pickedButton ? `✓ ${pickedButton}` : "auto-detect (first clickable button)"}
                  </Text>
                </View>
                <View style={styles.pickBtns}>
                  {pickedButton && (
                    <Pressable
                      onPress={clearPickedButton}
                      disabled={state.running}
                      style={({ pressed }) => [styles.pickClearBtn, { opacity: pressed || state.running ? 0.5 : 1 }]}
                    >
                      <Ionicons name="close-circle" size={18} color={colors.destructive} />
                    </Pressable>
                  )}
                  <Pressable
                    onPress={startButtonPick}
                    disabled={state.running || !state.serviceEnabled}
                    style={({ pressed }) => [
                      styles.pickBtn,
                      {
                        backgroundColor: pressed ? colors.secondary + "33" : colors.secondary + "18",
                        borderColor: colors.secondary + "66",
                        borderRadius: colors.radius - 4,
                        opacity: state.running || !state.serviceEnabled ? 0.4 : 1,
                      },
                    ]}
                  >
                    <Ionicons name="locate" size={14} color={colors.secondary} />
                    <Text style={[styles.pickBtnText, { color: colors.secondary, fontFamily: "Inter_600SemiBold" }]}>
                      Pick
                    </Text>
                  </Pressable>
                </View>
              </View>

              <Text style={[styles.pickHint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Tap Pick → switch to your target app → tap the field or button. The service locks onto it exactly.
              </Text>
            </View>
          )}
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <SectionHeader
            title="Number Range"
            icon={
              <MaterialCommunityIcons
                name="numeric"
                size={18}
                color={colors.secondary}
              />
            }
            expanded={isExpanded("range")}
            onToggle={() => toggleSection("range")}
          />
          {isExpanded("range") && (
            <View style={styles.sectionBody}>
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <ConfigInput
                    label="Start"
                    value={String(config.startNumber)}
                    onChangeText={(v) =>
                      setConfig({ startNumber: parseInt(v) || 0 })
                    }
                    disabled={state.running}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ConfigInput
                    label="End"
                    value={String(config.endNumber)}
                    onChangeText={(v) =>
                      setConfig({ endNumber: parseInt(v) || 9999 })
                    }
                    disabled={state.running}
                  />
                </View>
              </View>
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <ConfigInput
                    label="Step"
                    value={String(config.step)}
                    onChangeText={(v) =>
                      setConfig({ step: Math.max(1, parseInt(v) || 1) })
                    }
                    disabled={state.running}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ConfigInput
                    label="Delay (ms)"
                    value={String(config.delayMs)}
                    onChangeText={(v) =>
                      setConfig({ delayMs: Math.max(50, parseInt(v) || 400) })
                    }
                    disabled={state.running}
                  />
                </View>
              </View>

              {/* Speed presets */}
              <View style={styles.speedRow}>
                {SPEED_PRESETS.map((p) => (
                  <Pressable
                    key={p.ms}
                    onPress={() => setConfig({ delayMs: p.ms })}
                    disabled={state.running}
                    style={({ pressed }) => [
                      styles.speedBtn,
                      {
                        backgroundColor:
                          config.delayMs === p.ms
                            ? colors.secondary + "33"
                            : pressed
                              ? colors.muted
                              : colors.muted + "55",
                        borderColor:
                          config.delayMs === p.ms
                            ? colors.secondary
                            : colors.border,
                        borderRadius: colors.radius - 4,
                        opacity: state.running ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.speedBtnText,
                        {
                          color:
                            config.delayMs === p.ms
                              ? colors.secondary
                              : colors.mutedForeground,
                          fontFamily:
                            config.delayMs === p.ms
                              ? "Inter_600SemiBold"
                              : "Inter_400Regular",
                        },
                      ]}
                    >
                      {p.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Common PINs priority mode */}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.switchRow}>
                <View style={styles.switchLeft}>
                  <Text
                    style={[
                      styles.switchLabel,
                      { color: colors.foreground, fontFamily: "Inter_600SemiBold" },
                    ]}
                  >
                    Common PINs First
                  </Text>
                  <Text
                    style={[
                      styles.switchDesc,
                      { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
                    ]}
                  >
                    Try ~80 most-common PINs before the sequential sweep
                  </Text>
                </View>
                <Switch
                  value={config.useCommonPins}
                  onValueChange={(v) => setConfig({ useCommonPins: v })}
                  disabled={state.running}
                  trackColor={{ false: colors.muted, true: colors.primary + "66" }}
                  thumbColor={config.useCommonPins ? colors.primary : colors.mutedForeground}
                />
              </View>
            </View>
          )}
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <SectionHeader
            title="Formatting"
            icon={
              <Ionicons name="code-slash-outline" size={18} color={colors.accent} />
            }
            expanded={isExpanded("settings")}
            onToggle={() => toggleSection("settings")}
          />
          {isExpanded("settings") && (
            <View style={styles.sectionBody}>
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <ConfigInput
                    label="Pad length (0 = off)"
                    value={String(config.padding)}
                    onChangeText={(v) =>
                      setConfig({ padding: parseInt(v) || 0 })
                    }
                    disabled={state.running}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ConfigInput
                    label="Pad character"
                    value={config.padChar}
                    onChangeText={(v) =>
                      setConfig({ padChar: v.slice(-1) || "0" })
                    }
                    keyboardType="default"
                    disabled={state.running || config.padding === 0}
                  />
                </View>
              </View>
              <Text
                style={[
                  styles.previewText,
                  {
                    color: colors.mutedForeground,
                    fontFamily: "Inter_400Regular",
                  },
                ]}
              >
                Preview:{" "}
                <Text
                  style={{
                    color: colors.primary,
                    fontFamily: "Inter_600SemiBold",
                  }}
                >
                  {formatNum(config.startNumber)}
                </Text>{" "}
                ...{" "}
                <Text
                  style={{
                    color: colors.primary,
                    fontFamily: "Inter_600SemiBold",
                  }}
                >
                  {formatNum(config.endNumber)}
                </Text>
              </Text>
            </View>
          )}
        </View>

        <View style={styles.ctaWrap}>
          <Pressable
            onPress={handleStartStop}
            disabled={!state.serviceEnabled && !state.running}
            style={({ pressed }) => [
              styles.startBtn,
              {
                backgroundColor: state.running
                  ? colors.destructive
                  : pressed
                    ? colors.primary + "cc"
                    : colors.primary,
                borderRadius: colors.radius + 4,
                opacity:
                  !state.serviceEnabled && !state.running ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Ionicons
              name={state.running ? "stop" : "play"}
              size={20}
              color={state.running ? colors.destructiveForeground : colors.primaryForeground}
            />
            <Text
              style={[
                styles.startBtnText,
                {
                  color: state.running
                    ? colors.destructiveForeground
                    : colors.primaryForeground,
                  fontFamily: "Inter_700Bold",
                },
              ]}
            >
              {state.running ? "Stop Injection" : "Start Injection"}
            </Text>
          </Pressable>
          {!state.serviceEnabled && (
            <Text
              style={[
                styles.disabledHint,
                {
                  color: colors.mutedForeground,
                  fontFamily: "Inter_400Regular",
                },
              ]}
            >
              Enable Accessibility Service first
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 12 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  appTitle: { fontSize: 22 },
  appSub: { fontSize: 12, marginTop: 2 },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  historyBtn: {
    padding: 7,
    position: "relative",
  },
  historyBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  historyBadgeText: { fontSize: 9 },
  serviceStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  serviceStatusText: { fontSize: 12 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  bannerText: { fontSize: 13, flex: 1 },
  statusCard: {
    padding: 16,
    borderWidth: 1.5,
    gap: 10,
  },
  statusRunningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDotLive: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: { fontSize: 13, flex: 1 },
  attemptsText: { fontSize: 12 },
  currentNum: { fontSize: 48, textAlign: "center" },
  progressTrack: { height: 4, width: "100%" },
  progressFill: { height: "100%" },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  resultLabel: { fontSize: 16 },
  resultValue: { fontSize: 14 },
  errorText: { fontSize: 13, flex: 1 },
  card: {
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 0,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 14 },
  sectionBody: { padding: 14, gap: 12 },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modeToggleWrap: {
    flexDirection: "row",
    padding: 3,
    gap: 2,
  },
  modeToggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  modeToggleText: { fontSize: 13 },
  configInputWrap: { gap: 6 },
  configLabel: { fontSize: 12 },
  configInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
  },
  divider: { height: 1 },
  row2: { flexDirection: "row", gap: 10 },
  previewText: { fontSize: 12, marginTop: 4 },
  ctaWrap: { gap: 8, marginTop: 4 },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
  },
  startBtnText: { fontSize: 18 },
  disabledHint: { textAlign: "center", fontSize: 12 },
  speedRow: {
    flexDirection: "row",
    gap: 6,
  },
  speedBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderWidth: 1,
  },
  speedBtnText: { fontSize: 12 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  switchLeft: { flex: 1, gap: 2 },
  switchLabel: { fontSize: 14 },
  switchDesc: { fontSize: 11, lineHeight: 16 },
  overlayToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  overlayToggleText: { fontSize: 13, flex: 1 },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
  },
  pickInfo: { flex: 1, gap: 3 },
  pickLabel: { fontSize: 13 },
  pickValue: { fontSize: 11 },
  pickBtns: { flexDirection: "row", alignItems: "center", gap: 6 },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
  },
  pickBtnText: { fontSize: 12 },
  pickClearBtn: { padding: 2 },
  pickHint: { fontSize: 11, lineHeight: 16, marginTop: 2 },
});

function formatNum(n: number, config?: { padding: number; padChar: string }) {
  if (config && config.padding > 0) {
    return String(n).padStart(config.padding, config.padChar);
  }
  return String(n);
}
