import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { colors, radii } from "../../constants/theme";
import { fonts, rtlText } from "../../constants/rtl";
import { SoftButton, EmptyState } from "../../components/ui";
import { AttendanceHistoryRow } from "./components/SupervisorWidgets";
import {
  isSupabaseEntityId,
  markingAlertText,
  unmarkedDeadlinePrompt,
  groupAttendanceRowsByMonth,
  computeAttendanceHistorySummary,
} from "./supervisorAttendanceHelpers";
import { buildSeanceAttendanceHistory } from "../../lib/presenceApi";
import { arabicSessionCountLabel } from "./supervisorHelpers";

const DEGRADED_MESSAGE =
  "تسجيل الحضور غير متاح دون اتصال بقاعدة البيانات. يُرجى تسجيل الدخول عبر Supabase.";

function membersForNav(groupMembers) {
  return groupMembers.map((m) => ({

    
    id: m.user?.id,
    firstName: m.user?.firstName,
    lastName: m.user?.lastName,
  }));
}

export default function SupervisorAttendanceScreen({
  myGroups,
  activeGroup,
  selectedGroupId,
  onSelectGroup,
  members = [],
  usingSupabase = false,
}) {
  const navigation = useNavigation();

  const [historyState, setHistoryState] = useState({
    loading: false,
    rows: [],
    error: null,
  });
  const [markingContext, setMarkingContext] = useState(null);

  const groupMembers = useMemo(() => {
    if (!activeGroup?.id) return [];
    return members.filter((m) => m.group?.id === activeGroup.id);
  }, [members, activeGroup?.id]);

  const memberIds = useMemo(
    () => groupMembers.map((m) => m.user?.id).filter(Boolean),
    [groupMembers]
  );

  const monthGroups = useMemo(
    () => groupAttendanceRowsByMonth(historyState.rows),
    [historyState.rows]
  );

  const historySummary = useMemo(
    () =>
      computeAttendanceHistorySummary(historyState.rows, memberIds.length),
    [historyState.rows, memberIds.length]
  );

  const loadHistory = useCallback(async () => {
    if (
      !usingSupabase ||
      !activeGroup?.id ||
      !activeGroup?.jour ||
      memberIds.length === 0 ||
      !isSupabaseEntityId(activeGroup.id) ||
      memberIds.some((id) => !isSupabaseEntityId(id))
    ) {
      setHistoryState({ loading: false, rows: [], error: null });
      setMarkingContext(null);
      return;
    }

    if (!activeGroup.saisonDateDebut) {
      setHistoryState({
        loading: false,
        rows: [],
        error: "تاريخ بداية الموسم غير متوفر — تعذر عرض سجل الحضور",
      });
      setMarkingContext(null);
      return;
    }

    setHistoryState((s) => ({ ...s, loading: true, error: null }));

    const res = await buildSeanceAttendanceHistory(
      activeGroup.id,
      activeGroup.jour,
      activeGroup.heureDebut,
      activeGroup.saisonDateDebut,
      memberIds
    );

    if (!res.ok) {
      setHistoryState({
        loading: false,
        rows: [],
        error: res.error || "تعذر تحميل بيانات الحضور",
      });
      setMarkingContext(null);
      return;
    }

    setHistoryState({ loading: false, rows: res.rows || [], error: null });
    setMarkingContext(res.markingContext || null);
  }, [
    usingSupabase,
    activeGroup?.id,
    activeGroup?.jour,
    activeGroup?.heureDebut,
    activeGroup?.saisonDateDebut,
    memberIds,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  const openDetail = useCallback(
    (row, readOnly) => {
      if (!activeGroup?.id || !row?.sessionDate) return;

      navigation.navigate("SupervisorAttendanceDetail", {
        readOnly,
        seanceId: activeGroup.id,
        sessionDate: row.sessionDate,
        markingWindowEnd: row.markingWindowEnd,
        isMarked: row.isMarked,
        groupName: activeGroup.name,
        members: membersForNav(groupMembers),
      });
    },
    [navigation, activeGroup, groupMembers]
  );

  if (!usingSupabase) {
    return (
      <View style={styles.degradedWrap}>
        <EmptyState text={DEGRADED_MESSAGE} />
      </View>
    );
  }

  return (
    <View style={styles.flexFill}>
      {myGroups.length > 1 ? (
        <View style={styles.groupPicker}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {myGroups.map((g) => (
              <SoftButton
                key={g.id}
                label={g.name}
                active={selectedGroupId === g.id}
                onPress={() => onSelectGroup(g.id)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {activeGroup ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText} numberOfLines={1}>
              {activeGroup.name}
            </Text>
            {!historyState.loading && !historyState.error ? (
              <>
                <Text style={styles.summaryDot}> · </Text>
                <Text style={styles.summaryText}>
                  {arabicSessionCountLabel(historySummary.sessionCount)}
                </Text>
                {historySummary.attendancePct != null ? (
                  <>
                    <Text style={styles.summaryDot}> · </Text>
                    <Text style={styles.summaryText}>
                      نسبة الحضور {historySummary.attendancePct}%
                    </Text>
                  </>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}

        {historyState.loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : historyState.error ? (
          <EmptyState text={historyState.error} />
        ) : !activeGroup || groupMembers.length === 0 ? (
          <EmptyState text="لا يوجد أعضاء في هذه المجموعة" />
        ) : historyState.rows.length === 0 ? (
          <EmptyState text="لا توجد حصص سابقة لعرضها" />
        ) : (
          monthGroups.map((group) => (
            <View key={group.monthKey} style={styles.monthSection}>
              <Text style={styles.monthHeader}>{group.label}</Text>
              {group.rows.map((row) => {
                const isMarkingRow =
                  row.windowOpen && markingContext?.sessionDate === row.sessionDate;
                const needsMarkingHighlight = isMarkingRow && !row.isMarked;

                return (
                  <AttendanceHistoryRow
                    key={row.sessionDate}
                    sessionDate={row.sessionDate}
                    presentCount={row.presentCount}
                    absentCount={row.absentCount}
                    pct={row.pct}
                    isMarked={row.isMarked}
                    memberTotal={memberIds.length}
                    highlightUnmarked={needsMarkingHighlight}
                    unmarkedPrompt={
                      needsMarkingHighlight
                        ? unmarkedDeadlinePrompt(row.markingWindowEnd)
                        : null
                    }
                    markingHint={
                      isMarkingRow && row.isMarked
                        ? markingAlertText(
                            row.sessionDate,
                            row.isMarked,
                            row.markingWindowEnd
                          )
                        : null
                    }
                    onPress={() => openDetail(row, !isMarkingRow)}
                  />
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1 },
  degradedWrap: { flex: 1, justifyContent: "center", padding: 16 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  groupPicker: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.card },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  summaryText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "#FFFFFF",
    textAlign: "center",
    writingDirection: "rtl",
  },
  summaryDot: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.75)",
    marginHorizontal: 6,
  },
  monthSection: {
    marginBottom: 8,
  },
  monthHeader: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.gold,
    marginBottom: 10,
    marginTop: 4,
    ...rtlText,
  },
  sessionBanner: { padding: 10, backgroundColor: colors.card },
  sessionBannerText: {
    color: colors.text,
    fontFamily: fonts.medium,
    textAlign: "center",
    ...rtlText,
  },
  loader: { marginVertical: 24 },
});
