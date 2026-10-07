import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/theme";
import { rtlText, rtlTextBold, fonts, arrowBack, row as rtlRow } from "../../constants/rtl";
import { QuickButton } from "../../components/ui";
import { AttendanceRow, OutlineButton } from "./components/SupervisorWidgets";
import { initials, STATUS_COLORS } from "./supervisorHelpers";
import {
  formatSessionDateLabel,
  formatDeadlineLabel,
  recordsFromByMemberId,
} from "./supervisorAttendanceHelpers";
import {
  getSeancePresenceForDate,
  saveSeancePresence,
} from "../../lib/presenceApi";
import { getSeanceMembers } from "../../lib/membersApi";
import { emitSupervisorAttendanceSaved } from "./supervisorAttendanceBridge";

/** Fenêtre dépassée : maintenant > fin (heure_debut + 48h). Fermée mais pas encore commencée = false. */
function isMarkingWindowExceeded(markingWindowEnd) {
  if (!markingWindowEnd) return false;
  const end = new Date(markingWindowEnd);
  if (Number.isNaN(end.getTime())) return false;
  return Date.now() > end.getTime();
}

function statusOf(byMemberId, id) {
  const status = byMemberId?.[id];
  if (status === "present" || status === "absent") return status;
  return "unset";
}

function detailVisibility({
  readOnly,
  windowExceeded,
  correcting,
  loading,
  error,
  deadlineLabel,
  presentCount,
  absentCount,
}) {
  const idle = !loading && !error;
  return {
    showPencil: windowExceeded && !correcting && idle,
    showSummary: idle && presentCount + absentCount > 0,
    showDeadline: !readOnly && Boolean(deadlineLabel),
    showMarkingSave: !readOnly && idle,
    showCorrectionSave: correcting && idle,
  };
}

function AttendanceDetailRows({
  members,
  readOnly,
  correcting,
  saving,
  byMemberId,
  correctionRecords,
  records,
  onToggleCorrection,
  onToggleRecord,
}) {
  return members.map((m) => {
    if (!m?.id) return null;
    const name = `${m.firstName || ""} ${m.lastName || ""}`.trim();
    const useSwitches = correcting || !readOnly;

    if (!useSwitches) {
      const status = statusOf(byMemberId, m.id);
      const isUnset = status === "unset";
      const isPresent = status === "present";

      return (
        <AttendanceRow
          key={m.id}
          name={name}
          initial={initials(m.firstName)}
          userId={m.id}
          avatarUrl={m.avatarUrl}
          value={isPresent}
          readOnly
          unset={isUnset}
        />
      );
    }

    const isPresent = (correcting ? correctionRecords : records)[m.id] === true;
    return (
      <AttendanceRow
        key={m.id}
        name={name}
        initial={initials(m.firstName)}
        userId={m.id}
        avatarUrl={m.avatarUrl}
        value={isPresent}
        unset={false}
        statusLabel={isPresent ? "حاضر" : "غائب"}
        onToggle={(v) => {
          if (correcting) {
            if (!saving) onToggleCorrection(m.id, v);
            return;
          }
          onToggleRecord(m.id, v);
        }}
      />
    );
  });
}

function DetailListBody({ loading, error, rows }) {
  if (loading) {
    return <ActivityIndicator color={colors.primary} style={styles.loader} />;
  }
  if (error) {
    return <Text style={styles.errorText}>{error}</Text>;
  }
  return rows;
}

function AttendanceDetailView({
  navigation,
  headerTitle,
  dateLabel,
  deadlineLabel,
  groupName,
  presenceStats,
  visibility,
  loading,
  error,
  onStartCorrection,
  onMarkingSave,
  onCorrectionSave,
  onCancelCorrection,
  saving,
  rows,
}) {
  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name={arrowBack} size={22} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        {visibility.showPencil ? (
          <TouchableOpacity
            style={styles.editBtn}
            onPress={onStartCorrection}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="تعديل الحضور"
          >
            <Ionicons name="create-outline" size={22} color="white" />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerGroup}>{groupName || "الحصة"}</Text>
        <Text style={styles.bannerDate}>{dateLabel}</Text>
        {visibility.showSummary ? (
          <Text style={styles.bannerStats}>
            <Text style={styles.bannerPresent}>{presenceStats.presentCount} حاضر</Text>
            <Text style={styles.bannerStatsDash}> — </Text>
            <Text style={styles.bannerAbsent}>{presenceStats.absentCount} غائب</Text>
          </Text>
        ) : null}
        {visibility.showDeadline ? (
          <Text style={styles.bannerDeadline}>يمكنك التعديل حتى {deadlineLabel}</Text>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <DetailListBody loading={loading} error={error} rows={rows} />
      </ScrollView>

      {visibility.showMarkingSave ? (
        <View style={styles.saveBar}>
          <QuickButton
            label="حفظ الحضور "
            icon="checkmark"
            color={colors.primary}
            onPress={onMarkingSave}
          />
        </View>
      ) : null}

      {visibility.showCorrectionSave ? (
        <View style={styles.saveBar}>
          {saving ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : null}
          <QuickButton
            label="حفظ"
            icon="checkmark"
            color={colors.primary}
            onPress={onCorrectionSave}
          />
          <OutlineButton label="إلغاء" onPress={onCancelCorrection} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export default function SupervisorAttendanceDetailScreen({ navigation, route }) {
  const {
    readOnly = true,
    seanceId,
    sessionDate,
    markingWindowEnd,
    groupName,
  } = route.params || {};
  const membersFromRoute = Array.isArray(route.params?.members)
    ? route.params.members
    : null;

  const [members, setMembers] = useState(membersFromRoute || []);
  const [membersLoading, setMembersLoading] = useState(
    !(membersFromRoute && membersFromRoute.length > 0)
  );

  useEffect(() => {
    if (membersFromRoute && membersFromRoute.length > 0) {
      setMembers(membersFromRoute);
      setMembersLoading(false);
      return undefined;
    }
    if (!seanceId) {
      setMembersLoading(false);
      return undefined;
    }
    let cancelled = false;
    setMembersLoading(true);
    (async () => {
      const res = await getSeanceMembers(seanceId);
      if (cancelled) return;
      if (res.ok) {
        setMembers(
          (res.members || []).map((m) => ({
            id: m.userId,
            firstName: m.prenom,
            lastName: m.nom,
            avatarUrl: m.avatarUrl || null,
          }))
        );
      }
      setMembersLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [seanceId, membersFromRoute]);

  const memberIds = useMemo(
    () => (members || []).map((m) => m.id).filter(Boolean),
    [members]
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [byMemberId, setByMemberId] = useState({});
  const [records, setRecords] = useState({});
  const [saving, setSaving] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctionRecords, setCorrectionRecords] = useState({});
  const saveLock = useRef(false);
  const correctingRef = useRef(false);

  const windowExceeded = readOnly && isMarkingWindowExceeded(markingWindowEnd);

  useEffect(() => {
    if (membersLoading) {
      setLoading(true);
      setError(null);
      return;
    }
    if (!seanceId || !sessionDate || memberIds.length === 0) {
      setLoading(false);
      setError("بيانات الحصة غير مكتملة");
      return;
    }
    if (correctingRef.current) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const res = await getSeancePresenceForDate(seanceId, sessionDate, memberIds);
      if (cancelled) return;

      if (!res.ok) {
        setError(res.error || "تعذر تحميل بيانات الحضور");
        setLoading(false);
        return;
      }

      if (correctingRef.current) {
        setLoading(false);
        return;
      }
      const fetched = res.byMemberId || {};
      setByMemberId(fetched);
      if (!readOnly) {
        setRecords(recordsFromByMemberId(memberIds, fetched));
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [seanceId, sessionDate, memberIds, readOnly, membersLoading]);

  const handleSave = async () => {
    if (readOnly || !seanceId || !sessionDate || saving || loading) return;

    const payload = {};
    memberIds.forEach((id) => {
      payload[id] = records[id] ? "present" : "absent";
    });

    setSaving(true);
    const res = await saveSeancePresence(seanceId, sessionDate, payload);
    setSaving(false);

    if (!res.ok) {
      Alert.alert("تنبيه", res.error || "تعذر حفظ الحضور");
      return;
    }

    Alert.alert("تم", "تم حفظ الحضور", [
      {
        text: "حسناً",
        onPress: () => {
          emitSupervisorAttendanceSaved();
          navigation.goBack();
        },
      },
    ]);
  };

  const startCorrection = () => {
    if (!windowExceeded || loading || error || saving) return;
    setCorrectionRecords(recordsFromByMemberId(memberIds, byMemberId));
    correctingRef.current = true;
    setCorrecting(true);
  };

  const cancelCorrection = () => {
    if (saveLock.current) return;
    correctingRef.current = false;
    setCorrectionRecords({});
    setCorrecting(false);
  };

  const toggleCorrection = (id, value) => {
    if (saving) return;
    setCorrectionRecords((prev) => ({ ...prev, [id]: value }));
  };

  const commitCorrection = async (payload) => {
    if (!correctingRef.current || saveLock.current || !seanceId || !sessionDate) return;
    saveLock.current = true;
    setSaving(true);
    const res = await saveSeancePresence(seanceId, sessionDate, payload);
    setSaving(false);
    saveLock.current = false;

    if (!correctingRef.current) return;

    if (!res.ok) {
      Alert.alert("تنبيه", res.error || "تعذر حفظ الحضور");
      return;
    }

    setByMemberId((prev) => ({ ...prev, ...payload }));
    setCorrectionRecords({});
    correctingRef.current = false;
    setCorrecting(false);
    emitSupervisorAttendanceSaved();
    Alert.alert("تم", "تم حفظ الحضور");
  };

  const requestCorrectionSave = () => {
    if (!correcting || saving || loading) return;

    const payload = {};
    let unsetSavedAbsent = 0;
    memberIds.forEach((id) => {
      const before = statusOf(byMemberId, id);
      const after = correctionRecords[id] ? "present" : "absent";
      if (after === before) return;
      payload[id] = after;
      if (before === "unset" && after === "absent") unsetSavedAbsent += 1;
    });

    if (Object.keys(payload).length === 0) {
      Alert.alert("تنبيه", "لا توجد تغييرات للحفظ");
      return;
    }

    const confirmMessage =
      unsetSavedAbsent > 0
        ? `سيتم تسجيل ${unsetSavedAbsent} أعضاء غير مسجلين كغائبين. هل تريد الحفظ؟`
        : "هل تريد حفظ تعديلات الحضور؟";

    Alert.alert("تأكيد", confirmMessage, [
      { text: "إلغاء", style: "cancel" },
      { text: "حفظ", onPress: () => commitCorrection(payload) },
    ]);
  };

  const dateLabel = formatSessionDateLabel(sessionDate);
  const deadlineLabel = formatDeadlineLabel(markingWindowEnd);
  const headerTitle = readOnly ? "تفاصيل الحضور" : "تسجيل الحضور";

  const presenceStats = useMemo(() => {
    let presentCount = 0;
    let absentCount = 0;
    memberIds.forEach((id) => {
      let status = statusOf(byMemberId, id);
      if (!readOnly && id in records) {
        status = records[id] ? "present" : "absent";
      } else if (correcting && id in correctionRecords) {
        status = correctionRecords[id] ? "present" : "absent";
      }
      if (status === "present") presentCount += 1;
      else if (status === "absent") absentCount += 1;
    });
    return { presentCount, absentCount };
  }, [memberIds, byMemberId, records, readOnly, correcting, correctionRecords]);

  const visibility = detailVisibility({
    readOnly,
    windowExceeded,
    correcting,
    loading,
    error,
    deadlineLabel,
    presentCount: presenceStats.presentCount,
    absentCount: presenceStats.absentCount,
  });

  return (
    <AttendanceDetailView
      navigation={navigation}
      headerTitle={headerTitle}
      dateLabel={dateLabel}
      deadlineLabel={deadlineLabel}
      groupName={groupName}
      presenceStats={presenceStats}
      visibility={visibility}
      loading={loading}
      error={error}
      saving={saving}
      onStartCorrection={startCorrection}
      onMarkingSave={handleSave}
      onCorrectionSave={requestCorrectionSave}
      onCancelCorrection={cancelCorrection}
      rows={
        <AttendanceDetailRows
          members={members}
          readOnly={readOnly}
          correcting={correcting}
          saving={saving}
          byMemberId={byMemberId}
          correctionRecords={correctionRecords}
          records={records}
          onToggleCorrection={toggleCorrection}
          onToggleRecord={(id, value) =>
            setRecords((prev) => ({ ...prev, [id]: value }))
          }
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 10,
  },
  backBtn: { padding: 2 },
  editBtn: { padding: 2 },
  headerTitle: {
    flex: 1,
    color: "white",
    fontFamily: fonts.bold,
    fontSize: 18,
    ...rtlTextBold,
  },
  banner: {
    backgroundColor: colors.card,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bannerGroup: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
    textAlign: "center",
    ...rtlTextBold,
  },
  bannerDate: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginTop: 4,
    ...rtlText,
  },
  bannerStats: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    ...rtlText,
  },
  bannerPresent: {
    color: STATUS_COLORS.present,
  },
  bannerStatsDash: {
    color: colors.muted,
  },
  bannerAbsent: {
    color: STATUS_COLORS.absent,
  },
  bannerDeadline: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.primary,
    textAlign: "center",
    marginTop: 8,
    ...rtlText,
  },
  scrollContent: { padding: 16, paddingBottom: 24 },
  loader: { marginVertical: 24 },
  errorText: {
    color: colors.muted,
    fontFamily: fonts.medium,
    textAlign: "center",
    ...rtlText,
  },
  saveBar: {
    padding: 16,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
