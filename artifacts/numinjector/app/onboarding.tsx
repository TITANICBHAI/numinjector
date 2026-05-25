import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useInjector } from "@/context/InjectorContext";
import { useColors } from "@/hooks/useColors";

interface Step {
  id: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: string;
  optional?: boolean;
}

function OnboardingStep({
  step,
  active,
  completed,
  onAction,
}: {
  step: Step;
  active: boolean;
  completed: boolean;
  onAction?: () => void;
}) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.stepCard,
        {
          backgroundColor: colors.card,
          borderColor: active
            ? colors.primary
            : completed
              ? colors.success
              : colors.border,
          borderWidth: active || completed ? 1.5 : 1,
          opacity: !active && !completed ? 0.6 : 1,
        },
      ]}
    >
      <View style={styles.stepHeader}>
        <View
          style={[
            styles.stepIconWrap,
            {
              backgroundColor: completed
                ? colors.success + "22"
                : active
                  ? colors.primary + "22"
                  : colors.muted,
            },
          ]}
        >
          {completed ? (
            <Ionicons name="checkmark" size={22} color={colors.success} />
          ) : (
            step.icon
          )}
        </View>
        <View style={styles.stepTitleWrap}>
          <View style={styles.stepTitleRow}>
            <Text
              style={[
                styles.stepTitle,
                {
                  color: active
                    ? colors.foreground
                    : completed
                      ? colors.success
                      : colors.mutedForeground,
                  fontFamily: "Inter_600SemiBold",
                },
              ]}
            >
              {step.title}
            </Text>
            {step.optional && (
              <View
                style={[
                  styles.optionalBadge,
                  { backgroundColor: colors.muted },
                ]}
              >
                <Text
                  style={[
                    styles.optionalText,
                    { color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
                  ]}
                >
                  Optional
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.stepDesc,
              { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
            ]}
          >
            {step.description}
          </Text>
        </View>
      </View>
      {active && step.action && onAction && (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              backgroundColor: pressed
                ? colors.primary + "cc"
                : colors.primary,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Text
            style={[
              styles.actionBtnText,
              { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" },
            ]}
          >
            {step.action}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setOnboarded, openAccessibilitySettings, openOverlaySettings, refreshServiceStatus } =
    useInjector();

  const [stepsDone, setStepsDone] = useState<Set<number>>(new Set([0]));
  const [currentStep, setCurrentStep] = useState(0);

  const markDone = useCallback(
    (id: number) => {
      setStepsDone((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setCurrentStep(id + 1);
    },
    []
  );

  const steps: Step[] = [
    {
      id: 0,
      icon: (
        <MaterialCommunityIcons
          name="numeric"
          size={22}
          color={colors.primary}
        />
      ),
      title: "Welcome to NumInjector",
      description:
        "This app automatically tries number sequences in any text field on your screen. Great for PIN entry forms, combo fields, or any numeric input. Tap Next to begin setup.",
    },
    {
      id: 1,
      icon: (
        <MaterialCommunityIcons
          name="eye-outline"
          size={22}
          color={colors.primary}
        />
      ),
      title: "Enable Accessibility Service",
      description:
        "NumInjector needs Accessibility Service to detect and interact with UI elements in other apps. Open Settings → Accessibility → NumInjector and enable it.",
      action: "Open Accessibility Settings",
    },
    {
      id: 2,
      icon: (
        <Ionicons
          name="layers-outline"
          size={22}
          color={colors.secondary}
        />
      ),
      title: "Allow Screen Overlay",
      description:
        "Optional — allows NumInjector to show a targeting overlay when manually selecting which field and button to use. Tap the button to grant permission.",
      action: "Open Overlay Settings",
      optional: true,
    },
    {
      id: 3,
      icon: (
        <Ionicons name="battery-charging-outline" size={22} color={colors.success} />
      ),
      title: "Keep Screen On",
      description:
        "The app will keep your screen on while running so injection isn't interrupted. This is handled automatically — no action needed.",
    },
  ];

  const allRequiredDone = stepsDone.has(0) && stepsDone.has(1);

  const handleAction = useCallback(
    (id: number) => {
      if (id === 1) {
        openAccessibilitySettings();
        setTimeout(() => markDone(1), 1000);
      } else if (id === 2) {
        openOverlaySettings();
        setTimeout(() => markDone(2), 800);
      }
    },
    [openAccessibilitySettings, openOverlaySettings, markDone]
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop:
              Platform.OS === "web" ? 67 + 20 : insets.top + 20,
            paddingBottom:
              Platform.OS === "web" ? 34 + 40 : insets.bottom + 40,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoRow}>
          <View
            style={[
              styles.logoWrap,
              { backgroundColor: colors.primary + "18", borderRadius: 20 },
            ]}
          >
            <MaterialCommunityIcons
              name="target"
              size={40}
              color={colors.primary}
            />
          </View>
          <View>
            <Text
              style={[
                styles.appName,
                { color: colors.primary, fontFamily: "Inter_700Bold" },
              ]}
            >
              NumInjector
            </Text>
            <Text
              style={[
                styles.appTagline,
                {
                  color: colors.mutedForeground,
                  fontFamily: "Inter_400Regular",
                },
              ]}
            >
              Automated number field testing
            </Text>
          </View>
        </View>

        <View style={styles.stepsWrap}>
          {steps.map((step) => (
            <OnboardingStep
              key={step.id}
              step={step}
              active={currentStep === step.id}
              completed={stepsDone.has(step.id) && currentStep > step.id}
              onAction={step.action ? () => handleAction(step.id) : undefined}
            />
          ))}
        </View>

        {currentStep <= 0 && (
          <Pressable
            style={({ pressed }) => [
              styles.nextBtn,
              {
                backgroundColor: pressed
                  ? colors.primary + "cc"
                  : colors.primary,
                borderRadius: colors.radius,
              },
            ]}
            onPress={() => markDone(0)}
          >
            <Text
              style={[
                styles.nextBtnText,
                {
                  color: colors.primaryForeground,
                  fontFamily: "Inter_700Bold",
                },
              ]}
            >
              Get Started
            </Text>
          </Pressable>
        )}

        {currentStep === 3 && (
          <Pressable
            onPress={() => markDone(3)}
            style={({ pressed }) => [
              styles.nextBtn,
              {
                backgroundColor: pressed
                  ? colors.primary + "cc"
                  : colors.primary,
                borderRadius: colors.radius,
              },
            ]}
          >
            <Text
              style={[
                styles.nextBtnText,
                {
                  color: colors.primaryForeground,
                  fontFamily: "Inter_700Bold",
                },
              ]}
            >
              Continue to App
            </Text>
          </Pressable>
        )}

        {currentStep > 3 && (
          <Pressable
            onPress={async () => {
              await refreshServiceStatus();
              setOnboarded(true);
              router.replace("/home");
            }}
            style={({ pressed }) => [
              styles.nextBtn,
              {
                backgroundColor: pressed
                  ? colors.success + "cc"
                  : colors.success,
                borderRadius: colors.radius,
              },
            ]}
          >
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={colors.successForeground}
              style={{ marginRight: 8 }}
            />
            <Text
              style={[
                styles.nextBtnText,
                {
                  color: colors.successForeground,
                  fontFamily: "Inter_700Bold",
                },
              ]}
            >
              Launch NumInjector
            </Text>
          </Pressable>
        )}

        {currentStep === 2 && (
          <Pressable
            onPress={() => {
              setStepsDone((prev) => {
                const next = new Set(prev);
                next.add(2);
                return next;
              });
              setCurrentStep(3);
            }}
            style={styles.skipBtn}
          >
            <Text
              style={[
                styles.skipText,
                {
                  color: colors.mutedForeground,
                  fontFamily: "Inter_400Regular",
                },
              ]}
            >
              Skip for now
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20 },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 32,
  },
  logoWrap: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  appName: { fontSize: 26 },
  appTagline: { fontSize: 13, marginTop: 2 },
  stepsWrap: { gap: 12, marginBottom: 24 },
  stepCard: {
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  stepHeader: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  stepIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  stepTitleWrap: { flex: 1, gap: 4 },
  stepTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  stepTitle: { fontSize: 15 },
  stepDesc: { fontSize: 13, lineHeight: 19 },
  optionalBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  optionalText: { fontSize: 10 },
  actionBtn: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: { fontSize: 14 },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    marginTop: 4,
  },
  nextBtnText: { fontSize: 16 },
  skipBtn: { alignItems: "center", marginTop: 12 },
  skipText: { fontSize: 13 },
});
