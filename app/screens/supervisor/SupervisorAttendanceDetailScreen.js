import React, { useEffect, useMemo, useState } from "react";
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
import { rtlText, rtlTextBold, fonts, arrowBack } from "../../constants/rtl";
import { QuickButton } from "../../components/ui";
import { AttendanceRow } from "./components/SupervisorWidgets";
import { initials } from "./supervisorHelpers";
import {
  formatSessionDateLabel,
  formatDeadlineLabel,
  recordsFromByMemberId,
} from "./supervisorAttendanceHelpers";
import {
  getSeancePresenceForDate,
  saveSeancePresence,
} from "../../lib/presenceApi";
import { emitSupervisorAttendanceSaved } from "./supervisorAttendanceBridge";

export default function SupervisorAttendanceDetailScreen({ navigation, route }) {
  const {
    readOnly = true,
    seanceId,
    sessionDate,
    markingWindowEnd,
    isMarked: isMarkedParam = false,
    groupName,
    members = [],
  } = route.params || {};

  const memberIds = useMemo(
    () => (members || []).map((m) => m.id).filter(Boolean),
    [members]
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [byMemberId, setByMemberId] = useState({});
  const [records, setRecords] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!seanceId || !sessionDate || memberIds.length === 0) {
      setLoading(false);
      setError("بيانات الحصة غير مكتملة");
      return;
    }

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
  }, [seanceId, sessionDate, memberIds, readOnly]);

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

  const dateLabel = formatSessionDateLabel(sessionDate);
  const deadlineLabel = formatDeadlineLabel(markingWindowEnd);
  const headerTitle = readOnly ? "تفاصيل الحضور" : "تسجيل الحضور";

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
        <View style={styles.headerPlaceholder} />
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerGroup}>{groupName || "الحصة"}</Text>
        <Text style={styles.bannerDate}>حصة {dateLabel}</Text>
        {!readOnly && deadlineLabel ? (
          <Text style={styles.bannerDeadline}>يمكن التعديل حتى {deadlineLabel}</Text>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          members.map((m) => {
            if (!m?.id) return null;
            const name = `${m.firstName || ""} ${m.lastName || ""}`.trim();

            if (readOnly) {
              const status = byMemberId[m.id] || "unset";
              const isUnset = status === "unset";
              const isPresent = status === "present";

              return (
                <AttendanceRow
                  key={m.id}
                  name={name}
                  initial={initials(m.firstName)}
                  value={isPresent}
                  readOnly
                  unset={isUnset}
                />
              );
            }

            const isPresent = records[m.id] === true;
            return (
              <AttendanceRow
                key={m.id}
                name={name}
                initial={initials(m.firstName)}
                value={isPresent}
                unset={false}
                statusLabel={isPresent ? "حاضر" : "غائب"}
                onToggle={(v) => setRecords((prev) => ({ ...prev, [m.id]: v }))}
              />
            );
          })
        )}
      </ScrollView>

      {!readOnly && !loading && !error ? (
        <View style={styles.saveBar}>
          <QuickButton
            label="حفظ الحضور "
            icon="checkmark"
            color={colors.primary}
            onPress={handleSave}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: { padding: 4 },
  headerTitle: {
    color: "white",
    fontFamily: fonts.bold,
    fontSize: 17,
    ...rtlTextBold,
  },
  headerPlaceholder: { width: 30 },
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
