/**
 * Fiche membre superviseur — données Supabase réelles (lecture seule sur les infos contact).
 *
 * Décisions techniques actées (ne pas migrer vers le schéma CdC pour ces points) :
 * 1. Identité : profiles (legacy) via inscriptions → profiles FK, pas users+membres/superviseurs.
 * 2. Progression : colonnes réelles de la table (nb_hizb_completes, tumun_courant, notes,
 *    saison_id, date_saisie) — cf. migration 0041. juze n'est pas stocké, il est dérivé
 *    par computeProgressMetrics (ceil(nb_hizb_completes / 2)).
 *
 * Présence : table presences via presenceApi (pas AppContext.attendance mock).
 *
 * date_naissance / âge : getSeanceMembers ne joint pas membres.date_naissance ;
 * phone, school, level, hifz_amount viennent de profiles via route.params.
 */
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
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, rtlTextBold, fonts, arrowBack, row as rtlRow } from "../../constants/rtl";
import {
  getMemberProgressionSummary,
  getMemberSeasonObjectif,
} from "../../lib/progressApi";
import { getMemberPresenceSummary } from "../../lib/presenceApi";
import { getMemberProfileFields, removeMemberFromSeance, formatGenderLabel } from "../../lib/membersApi";
import { initials, deriveLevel, STATUS_COLORS, arabicSessionCountLabel } from "./supervisorHelpers";
import { groupMemberPresenceByMonth } from "./supervisorAttendanceHelpers";

const PRESENCE_LABELS = {
  present: "حاضر",
  absent: "غائب",
};

function ProfileRow({ icon, label, value }) {
  if (!value) return null;
  return (
    <View style={styles.itemRow}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

function PresenceTotalRow({ icon, label, count, iconColor, styles }) {
  return (
    <View style={styles.itemRow}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.presenceStatValue}>
          {arabicSessionCountLabel(count ?? 0)}
        </Text>
      </View>
    </View>
  );
}

function PresenceMiniRow({ date, status }) {
  const label = PRESENCE_LABELS[status] || status;
  const statusColor = STATUS_COLORS[status] || colors.muted;
  return (
    <View style={[styles.presenceMiniRow, shadows.card]}>
      <Text style={styles.presenceMiniDate}>{date || "—"}</Text>
      <Text style={[styles.presenceMiniStatus, { color: statusColor }]}>{label}</Text>
    </View>
  );
}

function formatTumunCourant(metrics) {
  if (metrics?.tumunCourant == null) return "—";
  return String(metrics.tumunCourant);
}

function ProgressSectionContent({ progressState, styles }) {
  if (progressState.loading) {
    return <ActivityIndicator color={colors.primary} style={styles.loader} />;
  }
  if (progressState.error) {
    return <Text style={styles.errorText}>{progressState.error}</Text>;
  }
  if (!progressState.hasData) {
    return <Text style={styles.emptyText}>لم يتم تسجيل أي تقدم بعد</Text>;
  }

  const metrics = progressState.metrics;
  const globalPct = metrics?.globalPct ?? 0;

  return (
    <>
      <ProfileRow
        icon="analytics-outline"
        label="النسبة الإجمالية"
        value={`${globalPct}%`}
      />
      <ProfileRow icon="ribbon-outline" label="المستوى" value={deriveLevel(globalPct)} />
      <ProfileRow
        icon="book-outline"
        label="الجزء الحالي"
        value={String(metrics?.juzeCourant ?? "")}
      />
      <ProfileRow
        icon="layers-outline"
        label="الثمن الحالي"
        value={formatTumunCourant(metrics)}
      />
      <ProfileRow
        icon="checkmark-done-outline"
        label="آخر حزب مكتمل"
        value={String(metrics?.nbHizbCompletes ?? 0)}
      />
      {metrics?.dateSaisie ? (
        <ProfileRow
          icon="calendar-outline"
          label="تاريخ آخر تحديث"
          value={String(metrics.dateSaisie).slice(0, 10)}
        />
      ) : null}
      {progressState.note ? (
        <ProfileRow icon="document-text-outline" label="ملاحظة" value={progressState.note} />
      ) : null}
      {progressState.objectif ? (
        <ProfileRow icon="flag-outline" label="هدف الموسم" value={progressState.objectif} />
      ) : null}
    </>
  );
}

function PresenceSectionContent({ presenceState, styles }) {
  const monthGroups = useMemo(
    () => groupMemberPresenceByMonth(presenceState.records || []),
    [presenceState.records]
  );
  const [monthIndex, setMonthIndex] = useState(0);

  useEffect(() => {
    setMonthIndex(0);
  }, [presenceState.records]);

  if (presenceState.loading) {
    return <ActivityIndicator color={colors.primary} style={styles.loader} />;
  }
  if (presenceState.error) {
    return <Text style={styles.errorText}>{presenceState.error}</Text>;
  }
  if (!presenceState.hasData) {
    return <Text style={styles.emptyText}>لا يوجد سجل حضور بعد</Text>;
  }

  const currentMonth = monthGroups[monthIndex] || null;
  const canGoOlder = monthIndex < monthGroups.length - 1;
  const canGoNewer = monthIndex > 0;
  const showMonthNav = monthGroups.length > 1;

  return (
    <>
      <PresenceTotalRow
        icon="checkmark-circle"
        label="إجمالي الحضور"
        count={presenceState.presentCount ?? 0}
        iconColor={STATUS_COLORS.present}
        styles={styles}
      />
      <PresenceTotalRow
        icon="close-circle"
        label="إجمالي الغياب"
        count={presenceState.absentCount ?? 0}
        iconColor={STATUS_COLORS.absent}
        styles={styles}
      />
      {currentMonth ? (
        <>
          {!showMonthNav ? (
            <Text style={styles.monthNavLabelStatic}>{currentMonth.label}</Text>
          ) : null}
          <View style={styles.presenceList}>
            {currentMonth.rows.map((rec, idx) => (
              <PresenceMiniRow
                key={`${rec.date}_${rec.status}_${idx}`}
                date={rec.date}
                status={rec.status}
              />
            ))}
          </View>
          {showMonthNav ? (
            <View style={styles.monthNavBar}>
              <TouchableOpacity
                style={styles.monthNavBtn}
                onPress={() => setMonthIndex((i) => i + 1)}
                disabled={!canGoOlder}
                activeOpacity={0.7}
                accessibilityLabel="الشهر السابق"
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={canGoOlder ? colors.primary : colors.placeholder}
                />
              </TouchableOpacity>
              <Text style={styles.monthNavLabel}>{currentMonth.label}</Text>
              <TouchableOpacity
                style={styles.monthNavBtn}
                onPress={() => setMonthIndex((i) => i - 1)}
                disabled={!canGoNewer}
                activeOpacity={0.7}
                accessibilityLabel="الشهر التالي"
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={canGoNewer ? colors.primary : colors.placeholder}
                />
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export default function MemberProfileScreen({ navigation, route }) {
  const {
    memberId,
    seanceId,
    saisonId,
    firstName,
    lastName,
    email,
    phone,
    school,
    level,
    hifzAmount,
    gender,
    groupName,
    groupSchedule,
    registrationDate,
  } = route.params || {};

  const fullName = `${firstName || ""} ${lastName || ""}`.trim() || "عضو";
  const registrationDateOnly = registrationDate ? String(registrationDate).slice(0, 10) : null;

  const [progressState, setProgressState] = useState({
    loading: !!memberId,
    error: null,
    hasData: false,
    metrics: null,
    note: null,
    objectif: null,
  });
  const [presenceState, setPresenceState] = useState({
    loading: !!memberId,
    error: null,
    hasData: false,
    rate: null,
    presentCount: 0,
    absentCount: 0,
    records: [],
  });
  const [contactFields, setContactFields] = useState({
    phone: phone || null,
    school: school || null,
    level: level || null,
    hifzAmount: hifzAmount || null,
    gender: formatGenderLabel(gender) || null,
  });
  const [removingFromSeance, setRemovingFromSeance] = useState(false);

  const confirmRemoveFromSeance = () => {
    if (!memberId || !seanceId || removingFromSeance) return;
    Alert.alert(
      "إزالة من الحصة",
      `هل تريد إزالة ${fullName} من حصة «${groupName || "—"}»؟\n\nسيتم حذف تسجيل العضو في هذه الحصة فقط. يمكنه التسجيل في حصة أخرى لاحقاً.`,
      [
        { text: "إلغاء", style: "cancel" },
        { text: "تأكيد", style: "destructive", onPress: handleRemoveFromSeance },
      ]
    );
  };

  const handleRemoveFromSeance = async () => {
    if (!memberId || !seanceId || removingFromSeance) return;
    setRemovingFromSeance(true);
    const res = await removeMemberFromSeance(memberId, seanceId);
    setRemovingFromSeance(false);
    if (!res.ok) {
      Alert.alert("تنبيه", res.error || "تعذر إزالة العضو من الحصة");
      return;
    }
    Alert.alert("تم", "تم إزالة العضو من الحصة بنجاح", [
      { text: "حسناً", onPress: () => navigation.goBack() },
    ]);
  };

  useEffect(() => {
    if (!memberId) return;
    let cancelled = false;
    (async () => {
      const res = await getMemberProfileFields(memberId);
      if (cancelled || !res.ok) return;
      setContactFields({
        phone: res.telephone || phone || null,
        school: res.ecole || school || null,
        level: res.niveau || level || null,
        hifzAmount: res.quantiteHifz || hifzAmount || null,
        gender: res.genre || formatGenderLabel(gender) || null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId, phone, school, level, hifzAmount, gender]);

  useEffect(() => {
    if (!memberId) {
      setProgressState({
        loading: false,
        error: null,
        hasData: false,
        metrics: null,
        note: null,
        objectif: null,
      });
      setPresenceState({
        loading: false,
        error: null,
        hasData: false,
        rate: null,
        presentCount: 0,
        absentCount: 0,
        records: [],
      });
      return;
    }

    let cancelled = false;
    setProgressState((s) => ({ ...s, loading: true, error: null }));
    setPresenceState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      const [progRes, objRes, presRes] = await Promise.all([
        getMemberProgressionSummary(memberId),
        saisonId
          ? getMemberSeasonObjectif(memberId, saisonId)
          : Promise.resolve({ ok: true, objectif: null }),
        getMemberPresenceSummary(memberId, seanceId),
      ]);
      if (cancelled) return;

      if (!progRes.ok) {
        setProgressState({
          loading: false,
          error: progRes.error,
          hasData: false,
          metrics: null,
          note: null,
          objectif: null,
        });
      } else {
        setProgressState({
          loading: false,
          error: null,
          hasData: progRes.hasData,
          metrics: progRes.metrics,
          note: progRes.metrics?.notes || null,
          objectif: objRes.ok && objRes.objectif ? objRes.objectif : null,
        });
      }

      if (!presRes.ok) {
        setPresenceState({
          loading: false,
          error: presRes.error,
          hasData: false,
          rate: null,
          presentCount: 0,
          absentCount: 0,
          records: [],
        });
      } else {
        setPresenceState({
          loading: false,
          error: null,
          hasData: presRes.hasData,
          rate: presRes.rate,
          presentCount: presRes.presentCount ?? 0,
          absentCount: presRes.absentCount ?? 0,
          records: presRes.records || [],
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [memberId, seanceId, saisonId]);

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
        <Text style={styles.headerTitle}>الملف الشخصي</Text>
        {seanceId ? (
          <TouchableOpacity
            style={styles.headerRemoveBtn}
            onPress={confirmRemoveFromSeance}
            disabled={removingFromSeance}
            activeOpacity={0.7}
            accessibilityLabel="إزالة من الحصة"
          >
            {removingFromSeance ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Ionicons name="trash-outline" size={22} color="white" />
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.headerRemovePlaceholder} />
        )}
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarBlock}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(firstName)}</Text>
          </View>
          <Text style={styles.name}>{fullName}</Text>
        </View>

        <View style={[styles.card, shadows.card]}>
          <ProfileRow icon="mail-outline" label="البريد الإلكتروني" value={email} />
          <ProfileRow
            icon="male-female-outline"
            label="الجنس"
            value={contactFields.gender || "—"}
          />
          <ProfileRow icon="call-outline" label="رقم الهاتف" value={contactFields.phone} />
          <ProfileRow icon="school-outline" label="المدرسة" value={contactFields.school} />
          <ProfileRow
            icon="bar-chart-outline"
            label="المستوى التعليمي"
            value={contactFields.level}
          />
          <ProfileRow icon="book-outline" label="مقدار الحفظ" value={contactFields.hifzAmount} />
        </View>

        <View style={[styles.card, shadows.card, styles.cardSpacing]}>
          <ProfileRow icon="people-outline" label="الحصة" value={groupName} />
          <ProfileRow icon="time-outline" label="التوقيت" value={groupSchedule} />
          <ProfileRow icon="calendar-clear-outline" label="تاريخ التسجيل" value={registrationDateOnly} />
        </View>

        <View style={[styles.card, shadows.card, styles.cardSpacing]}>
          <Text style={styles.cardTitle}>التقدم</Text>
          <ProgressSectionContent progressState={progressState} styles={styles} />
        </View>

        <View style={[styles.card, shadows.card, styles.cardSpacing]}>
          <Text style={styles.cardTitle}>
            {!presenceState.loading &&
            presenceState.rate != null &&
            presenceState.rate !== 0
              ? `الحضور (${presenceState.rate}%)`
              : "الحضور"}
          </Text>
          <PresenceSectionContent
            key={`${memberId || ""}_${seanceId || ""}`}
            presenceState={presenceState}
            styles={styles}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },

  header: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.primary,
  },
  backBtn: { padding: 2 },
  headerTitle: {
    flex: 1,
    color: "white",
    fontSize: 18,
    fontFamily: fonts.bold,
    ...rtlTextBold,
  },
  headerRemoveBtn: {
    padding: 4,
    minWidth: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  headerRemovePlaceholder: {
    width: 30,
  },

  avatarBlock: { alignItems: "center", marginBottom: 20 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primarySoft,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  avatarText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 26 },
  name: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, ...rtlTextBold },

  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
  },
  cardSpacing: { marginTop: 14 },
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
    ...rtlTextBold,
  },
  monthNavBar: {
    flexDirection: "row",
    direction: "ltr",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  monthNavBtn: {
    padding: 6,
    minWidth: 32,
    alignItems: "center",
  },
  monthNavLabel: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.text,
    textAlign: "center",
    ...rtlText,
  },
  monthNavLabelStatic: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.text,
    marginTop: 8,
    marginBottom: 4,
    textAlign: "center",
    ...rtlText,
  },
  itemRow: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  rowTextWrap: { flex: 1 },
  rowLabel: { fontSize: 12, color: colors.muted, fontFamily: fonts.regular, ...rtlText },
  rowValue: {
    fontSize: 15,
    color: colors.text,
    fontFamily: fonts.semiBold,
    marginTop: 2,
    ...rtlText,
  },
  presenceStatValue: {
    fontSize: 15,
    color: colors.muted,
    fontFamily: fonts.semiBold,
    marginTop: 2,
    ...rtlText,
  },
  loader: { marginVertical: 16 },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    fontFamily: fonts.regular,
    paddingVertical: 8,
    ...rtlText,
  },
  errorText: {
    fontSize: 14,
    color: colors.red,
    fontFamily: fonts.regular,
    paddingVertical: 8,
    ...rtlText,
  },
  presenceList: { marginTop: 8, gap: 8 },
  presenceMiniRow: {
    flexDirection: rtlRow,
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presenceMiniDate: {
    fontSize: 13,
    color: colors.text,
    fontFamily: fonts.medium,
    ...rtlText,
  },
  presenceMiniStatus: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
});
