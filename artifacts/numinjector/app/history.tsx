import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SessionRecord, useInjector } from "@/context/InjectorContext";
import { useColors } from "@/hooks/useColors";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - ts;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString();
}

function SessionCard({
  record,
  onReplay,
}: {
  record: SessionRecord;
  onReplay: () => void;
}) {
  const colors = useColors();

  const resultColor =
    record.result === "found"
      ? colors.success
      : record.result === "error"
        ? colors.destructive
        : colors.mutedForeground;

  const resultIcon =
    record.result === "found"
      ? "checkmark-circle"
      : record.result === "error"
        ? "alert-circle"
        : "stop-circle";

  const pinModeLabel = record.config.useCommonPins ? " + Common PINs" : "";
  const rangeLabel = `${record.config.startNumber}–${record.config.endNumber}${pinModeLabel}`;
  const padLabel =
    record.config.padding > 0
      ? ` · pad ${record.config.padding} '${record.config.padChar}'`
      : "";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor:
            record.result === "found" ? colors.success + "44" : colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={styles.resultRow}>
          <Ionicons name={resultIcon as any} size={20} color={resultColor} />
          <Text
            style={[
              styles.resultLabel,
              { color: resultColor, fontFamily: "Inter_600SemiBold" },
            ]}
          >
            {record.result === "found"
              ? `Found: ${record.foundValue}`
              : record.result === "error"
                ? "Error"
                : "Stopped"}
          </Text>
        </View>
        <Text
          style={[
            styles.timeLabel,
            { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
          ]}
        >
          {formatTime(record.timestamp)}
        </Text>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaChip}>
          <MaterialCommunityIcons
            name="numeric"
            size={12}
            color={colors.mutedForeground}
          />
          <Text
            style={[
              styles.metaText,
              {
                color: colors.mutedForeground,
                fontFamily: "Inter_400Regular",
              },
            ]}
          >
            {rangeLabel}
            {padLabel}
          </Text>
        </View>
        <View style={styles.metaChip}>
          <Ionicons
            name="flash-outline"
            size={12}
            color={colors.mutedForeground}
          />
          <Text
            style={[
              styles.metaText,
              {
                color: colors.mutedForeground,
                fontFamily: "Inter_400Regular",
              },
            ]}
          >
            {record.config.delayMs}ms delay
          </Text>
        </View>
        <View style={styles.metaChip}>
          <Ionicons
            name="repeat-outline"
            size={12}
            color={colors.mutedForeground}
          />
          <Text
            style={[
              styles.metaText,
              {
                color: colors.mutedForeground,
                fontFamily: "Inter_400Regular",
              },
            ]}
          >
            {record.attempts} attempts
          </Text>
        </View>
        <View style={styles.metaChip}>
          <Ionicons
            name="time-outline"
            size={12}
            color={colors.mutedForeground}
          />
          <Text
            style={[
              styles.metaText,
              {
                color: colors.mutedForeground,
                fontFamily: "Inter_400Regular",
              },
            ]}
          >
            {formatDuration(record.durationMs)}
          </Text>
        </View>
      </View>

      <View style={styles.targetRow}>
        <Ionicons
          name="location-outline"
          size={12}
          color={colors.mutedForeground}
        />
        <Text
          style={[
            styles.targetText,
            { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
          ]}
          numberOfLines={1}
        >
          Field:{" "}
          {record.config.fieldMode === "auto"
            ? "auto-detect"
            : `"${record.config.fieldHint || "any"}"`}{" "}
          · Button:{" "}
          {record.config.buttonMode === "auto"
            ? "auto-detect"
            : `"${record.config.buttonHint || "any"}"`}
        </Text>
      </View>

      <Pressable
        onPress={onReplay}
        style={({ pressed }) => [
          styles.replayBtn,
          {
            backgroundColor: pressed
              ? colors.primary + "33"
              : colors.primary + "18",
            borderColor: colors.primary + "55",
            borderRadius: colors.radius - 2,
          },
        ]}
      >
        <Ionicons name="play-back-outline" size={14} color={colors.primary} />
        <Text
          style={[
            styles.replayText,
            { color: colors.primary, fontFamily: "Inter_600SemiBold" },
          ]}
        >
          Load this config
        </Text>
      </Pressable>
    </View>
  );
}

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { history, clearHistory, replaySession } = useInjector();

  const handleShare = useCallback(async () => {
    if (history.length === 0) return;
    const lines = history.map((r) => {
      const date = new Date(r.timestamp).toLocaleString();
      const result =
        r.result === "found"
          ? `FOUND: ${r.foundValue}`
          : r.result.toUpperCase();
      const range = `${r.config.startNumber}-${r.config.endNumber}`;
      return `[${date}] ${result} | ${r.attempts} attempts | ${formatDuration(r.durationMs)} | Range ${range} @${r.config.delayMs}ms`;
    });
    const body = `NumInjector Session History (${history.length} sessions)\n${"─".repeat(44)}\n${lines.join("\n")}`;
    await Share.share({ title: "NumInjector Sessions", message: body }).catch(
      () => {}
    );
  }, [history]);

  const handleReplay = useCallback(
    (record: SessionRecord) => {
      replaySession(record);
      router.back();
    },
    [replaySession, router]
  );

  const handleClear = useCallback(() => {
    Alert.alert(
      "Clear History",
      "Delete all session records? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: clearHistory,
        },
      ]
    );
  }, [clearHistory]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop:
              Platform.OS === "web" ? 67 : insets.top + 12,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backBtn,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={colors.primary}
          />
        </Pressable>
        <Text
          style={[
            styles.headerTitle,
            { color: colors.foreground, fontFamily: "Inter_700Bold" },
          ]}
        >
          Session History
        </Text>
        {history.length > 0 && (
          <View style={styles.headerActions}>
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [
                styles.headerIconBtn,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Ionicons
                name="share-outline"
                size={18}
                color={colors.primary}
              />
            </Pressable>
            <Pressable
              onPress={handleClear}
              style={({ pressed }) => [
                styles.headerIconBtn,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color={colors.destructive}
              />
            </Pressable>
          </View>
        )}
      </View>

      {history.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="time-outline"
            size={48}
            color={colors.mutedForeground}
          />
          <Text
            style={[
              styles.emptyTitle,
              { color: colors.foreground, fontFamily: "Inter_600SemiBold" },
            ]}
          >
            No sessions yet
          </Text>
          <Text
            style={[
              styles.emptyDesc,
              {
                color: colors.mutedForeground,
                fontFamily: "Inter_400Regular",
              },
            ]}
          >
            Each injection run will be recorded here with its config and result.
          </Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            {
              paddingBottom:
                Platform.OS === "web" ? 34 + 20 : insets.bottom + 20,
            },
          ]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <SessionCard
              record={item}
              onReplay={() => handleReplay(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerIconBtn: { padding: 4 },
  list: { padding: 16 },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 17 },
  emptyDesc: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  card: {
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  resultLabel: { fontSize: 15 },
  timeLabel: { fontSize: 12 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaText: { fontSize: 12 },
  targetRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  targetText: { fontSize: 11, flex: 1 },
  replayBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderWidth: 1,
    marginTop: 2,
  },
  replayText: { fontSize: 13 },
});
