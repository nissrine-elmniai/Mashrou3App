import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, rtlTextBold, row, fonts, textAlignStart } from "../../constants/rtl";
import { EmptyState } from "../../components/ui";
import ProgressCard from "../../components/profile/ProgressCard";
import { LegendDot } from "./components/SupervisorWidgets";
import { useApp } from "../../context/AppContext";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import {
  computeProgressMetrics,
  computeProgressPace,
  getMemberProgressEntries,
} from "../../lib/progressApi";
import { formatHizbTumunDelta, tumunStoredToUi } from "../../lib/tumun";
import {
  ACTIVITY_DAY_COUNT,
  HISTORY_FETCH_LIMIT,
  activityCellColor,
  buildActivityDayCells,
  historySinceIso,
} from "./supervisorProgressHelpers";

/** Lignes visibles — un superviseur ne parcourt pas des centaines de saisies. */
const HISTORY_DISPLAY_LIMIT = 10;
const GRID_COLUMNS = 15;

function formatSupervisorDate(raw) {
  const sliced = String(raw || "").slice(0, 10);
  if (!sliced) return "—";
  return sliced.replaceAll("-", "/");
}

function formatHizbTumunPosition(entry, metrics) {
  const hizb = metrics?.nbHizbCompletes ?? 0;
  return `${hizb} حزب · الثمن ${tumunStoredToUi(entry?.tumun_courant)}`;
}

function progressStateFromMember(member, progressLoading, pace) {
  if (progressLoading) {
    return {
      loading: true,
      error: null,
      hasData: false,
      metrics: null,
      note: null,
      objectif: null,
      seasonDeltaTumuns: null,
      weekDeltaTumuns: null,
    };
  }
  const metrics = member?.prog?.metrics || null;
  return {
    loading: false,
    error: null,
    hasData: !!metrics,
    metrics,
    note: metrics?.notes || null,
    objectif: null,
    seasonDeltaTumuns: pace?.seasonDeltaTumuns ?? null,
    weekDeltaTumuns: pace?.weekDeltaTumuns ?? null,
  };
}

function HistoryEntryRow({ entry, olderEntry, isFirst }) {
  const metrics = computeProgressMetrics(entry);
  const currentTotal = metrics?.tumunTotal ?? 0;
  const olderTotal =
    olderEntry != null ? computeProgressMetrics(olderEntry)?.tumunTotal ?? 0 : null;
  const stepDelta = olderTotal != null ? currentTotal - olderTotal : null;
  const isRecul = stepDelta != null && stepDelta < 0;
  const reculLabel = isRecul ? formatHizbTumunDelta(stepDelta) : null;
  const when = formatSupervisorDate(
    metrics?.dateSaisie || entry.date_saisie || entry.date
  );

  return (
    <View style={[styles.historyRow, !isFirst && styles.historyRowBorder]}>
      <Text style={styles.historyDate}>{when}</Text>
      <Text style={[styles.historyPosition, isRecul && styles.historyRecul]}>
        {formatHizbTumunPosition(entry, metrics)}
      </Text>
      {reculLabel ? (
        <Text style={styles.historyRecul}>{reculLabel}</Text>
      ) : null}
      {metrics?.notes ? (
        <Text style={styles.historyNote}>{metrics.notes}</Text>
      ) : null}
    </View>
  );
}

/** Données membres fournies par SupervisorDashboard (un seul fetch). */
export default function SupervisorProgressScreen({
  members = [],
  activeGroup = null,
  progressLoading = false,
}) {
  const { seasons } = useApp();
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [history, setHistory] = useState({
    memberId: null,
    entries: [],
    loading: false,
  });

  useEffect(() => {
    if (members.length === 0) {
      setSelectedMemberId(null);
      return;
    }
    if (!members.some((m) => m.user.id === selectedMemberId)) {
      setSelectedMemberId(members[0].user.id);
    }
  }, [members, selectedMemberId]);

  useEffect(() => {
    if (!selectedMemberId) {
      setHistory({ memberId: null, entries: [], loading: false });
      return;
    }

    let cancelled = false;
    setHistory((prev) => ({
      memberId: selectedMemberId,
      entries: prev.memberId === selectedMemberId ? prev.entries : [],
      loading: true,
    }));

    (async () => {
      const res = await getMemberProgressEntries(selectedMemberId, {
        since: historySinceIso(),
        limit: HISTORY_FETCH_LIMIT,
      });
      if (cancelled) return;
      if (!res.ok) {
        console.warn(
          "SupervisorProgressScreen: échec lecture historique —",
          res.error
        );
        setHistory({
          memberId: selectedMemberId,
          entries: [],
          loading: false,
        });
        return;
      }
      setHistory({
        memberId: selectedMemberId,
        entries: res.entries || [],
        loading: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedMemberId]);

  const selectedMember = members.find((m) => m.user.id === selectedMemberId);
  const confirmedName = selectedMember
    ? `${selectedMember.user.firstName} ${selectedMember.user.lastName}`
    : "";

  // Tant que le menu est fermé, le champ affiche toujours le membre confirmé.
  useEffect(() => {
    if (!pickerOpen) setQuery(confirmedName);
  }, [confirmedName, pickerOpen]);

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const full = `${m.user.firstName} ${m.user.lastName}`;
      return !query.trim() || full.includes(query.trim());
    });
  }, [members, query]);

  const saisonId = getActiveRegularSeason(seasons)?.id ?? null;
  const historyReady =
    history.memberId === selectedMemberId && !history.loading;
  const pace = useMemo(() => {
    if (!historyReady) {
      return { seasonDeltaTumuns: null, weekDeltaTumuns: null };
    }
    return computeProgressPace(history.entries, saisonId);
  }, [historyReady, history.entries, saisonId]);

  const activityCells = useMemo(() => {
    if (history.memberId !== selectedMemberId) return [];
    return buildActivityDayCells(history.entries);
  }, [history.memberId, selectedMemberId, history.entries]);

  const progressState = progressStateFromMember(
    selectedMember,
    progressLoading,
    pace
  );

  const currentPositionLabel = selectedMember?.prog?.metrics
    ? formatHizbTumunPosition(
        selectedMember.prog.entry,
        selectedMember.prog.metrics
      )
    : null;

  const visibleEntries = history.entries.slice(0, HISTORY_DISPLAY_LIMIT);
  const hiddenCount = Math.max(
    0,
    history.entries.length - HISTORY_DISPLAY_LIMIT
  );
  const historyMayBeTruncated =
    history.entries.length >= HISTORY_FETCH_LIMIT;

  const handleSelect = (id) => {
    setSelectedMemberId(id);
    setPickerOpen(false);
  };

  const openPicker = () => {
    setQuery("");
    setPickerOpen(true);
  };

  const togglePicker = () => (pickerOpen ? setPickerOpen(false) : openPicker());

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {activeGroup ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText} numberOfLines={1}>
            {activeGroup.name}
          </Text>
          <Text style={styles.summaryDot}> · </Text>
          <Text style={styles.summaryText}>التقدم</Text>
        </View>
      ) : null}

      {members.length === 0 ? (
        <EmptyState text="لا يوجد أعضاء لعرض تقدمهم" />
      ) : (
        <View style={styles.dropdownWrap}>
          <View style={[styles.comboBox, pickerOpen && styles.comboBoxOpen]}>
            <Ionicons name="search-outline" size={18} color={colors.placeholder} />
            <TextInput
              style={styles.comboInput}
              textAlign={textAlignStart}
              placeholder="ابحث أو اختر عضواً..."
              placeholderTextColor={colors.placeholder}
              value={query}
              onFocus={openPicker}
              onChangeText={(t) => {
                setQuery(t);
                if (!pickerOpen) setPickerOpen(true);
              }}
            />
            <TouchableOpacity onPress={togglePicker} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons
                name={pickerOpen ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.placeholder}
              />
            </TouchableOpacity>
          </View>

          {pickerOpen ? (
            <View style={styles.dropdownPanel}>
              <ScrollView
                style={styles.optionsScroll}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {filteredMembers.length === 0 ? (
                  <EmptyState text="لا يوجد نتائج" />
                ) : (
                  filteredMembers.map((item) => {
                    const name = `${item.user.firstName} ${item.user.lastName}`;
                    const active = item.user.id === selectedMemberId;
                    return (
                      <TouchableOpacity
                        key={item.user.id}
                        style={[styles.optionRow, active && styles.optionRowActive]}
                        onPress={() => handleSelect(item.user.id)}
                      >
                        <Text style={[styles.optionText, active && styles.optionTextActive]}>
                          {name}
                        </Text>
                        {active ? (
                          <Ionicons name="checkmark" size={18} color={colors.primary} />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>
          ) : null}
        </View>
      )}

      {members.length > 0 ? (
        <>
          <ProgressCard progressState={progressState} />
          {currentPositionLabel && !progressLoading ? (
            <Text style={styles.positionDetail}>{currentPositionLabel}</Text>
          ) : null}

          <View style={[styles.historyCard, shadows.card]}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>آخر {ACTIVITY_DAY_COUNT} يوماً</Text>
              {history.loading ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : null}
            </View>
            {activityCells.length > 0 ? (
              <>
                <View style={styles.activityGrid}>
                  {activityCells.map((cell) => (
                    <View key={cell.key} style={styles.activityCellWrap}>
                      <View
                        style={[
                          styles.activityCell,
                          { backgroundColor: activityCellColor(cell.kind) },
                        ]}
                      />
                    </View>
                  ))}
                </View>
                <View style={styles.activityLegend}>
                  <LegendDot color={colors.inputBg} label="لا نشاط" />
                  <LegendDot color={colors.primarySoft} label="1–2" />
                  <LegendDot color={colors.borderGreen} label="3–5" />
                  <LegendDot color={colors.primary} label="6+" />
                  <LegendDot color={colors.goldSoft} label="تراجع" />
                </View>
              </>
            ) : history.loading ? null : (
              <Text style={styles.historyEmpty}>لا يوجد نشاط في هذه الفترة</Text>
            )}
          </View>

          <View style={[styles.historyCard, shadows.card]}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>آخر التسجيلات</Text>
              {history.loading ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : null}
            </View>
            {!history.loading && visibleEntries.length === 0 ? (
              <Text style={styles.historyEmpty}>لا يوجد سجل بعد</Text>
            ) : (
              visibleEntries.map((entry, idx) => (
                <HistoryEntryRow
                  key={entry.id || idx}
                  entry={entry}
                  olderEntry={history.entries[idx + 1] || null}
                  isFirst={idx === 0}
                />
              ))
            )}
            {!history.loading && hiddenCount > 0 ? (
              <Text style={styles.historyMore}>
                {historyMayBeTruncated
                  ? `عرض أحدث ${HISTORY_DISPLAY_LIMIT} — السجل أطول`
                  : `عرض أحدث ${HISTORY_DISPLAY_LIMIT} من ${history.entries.length}`}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 24 },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  summaryText: {
    fontSize: 16,
    color: "#FFFFFF",
    ...rtlText,
    textAlign: "center",
  },
  summaryDot: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.75)",
    marginHorizontal: 6,
  },

  dropdownWrap: { marginBottom: 14 },
  comboBox: {
    flexDirection: row,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    gap: 8,
  },
  comboBoxOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  comboInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: colors.text,
    ...rtlText,
  },

  dropdownPanel: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderTopWidth: 0,
    borderBottomLeftRadius: radii.md,
    borderBottomRightRadius: radii.md,
    backgroundColor: colors.card,
    padding: 10,
    ...shadows.card,
  },
  optionsScroll: { maxHeight: 220 },
  optionRow: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
  },
  optionRowActive: { backgroundColor: colors.primarySoft },
  optionText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.text, ...rtlText },
  optionTextActive: { fontFamily: fonts.semiBold, color: colors.primary },

  positionDetail: {
    marginTop: 8,
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.muted,
    ...rtlText,
  },
  activityGrid: {
    flexDirection: row,
    flexWrap: "wrap",
  },
  activityCellWrap: {
    width: `${100 / GRID_COLUMNS}%`,
    aspectRatio: 1,
    padding: 1,
  },
  activityCell: {
    flex: 1,
    borderRadius: 2,
  },
  activityLegend: {
    flexDirection: row,
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginTop: 12,
  },
  historyCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
    marginTop: 14,
  },
  historyHeader: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 8,
  },
  historyTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
    ...rtlTextBold,
  },
  historyEmpty: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    paddingVertical: 8,
    ...rtlText,
  },
  historyRow: {
    paddingVertical: 10,
  },
  historyRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  historyDate: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
    ...rtlText,
  },
  historyPosition: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.text,
    ...rtlText,
  },
  historyRecul: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.orange,
    ...rtlText,
  },
  historyNote: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    ...rtlText,
  },
  historyMore: {
    marginTop: 8,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    ...rtlText,
  },
});
