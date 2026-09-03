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
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, rtlTextBold, fonts, arrowBack, row as rtlRow } from "../../constants/rtl";
import {
  getMemberProgressionSummary,
  getMemberSeasonObjectif,
} from "../../lib/progressApi";
import { getMemberPresenceSummary } from "../../lib/presenceApi";
import {
  getMemberProfileFields,
  removeMemberFromSeance,
  updateMemberSeance,
  formatGenderLabel,
} from "../../lib/membersApi";
import {
  getAllSeances,
  formatSeanceScheduleLabel,
} from "../../lib/seancesApi";
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
  const insets = useSafeAreaInsets();
  const {
    memberId,
    seanceId: initialSeanceId,
    saisonId: initialSaisonId,
    firstName,
    lastName,
    email,
    phone,
    school,
    level,
    hifzAmount,
    gender,
    groupName: initialGroupName,
    groupSchedule: initialGroupSchedule,
    registrationDate,
    canEditSeance = false,
    adminTheme = false,
  } = route.params || {};

  const fullName = `${firstName || ""} ${lastName || ""}`.trim() || "عضو";
  const registrationDateOnly = registrationDate ? String(registrationDate).slice(0, 10) : null;

  const [seanceId, setSeanceId] = useState(initialSeanceId || null);
  const [saisonId, setSaisonId] = useState(initialSaisonId || null);
  const [groupName, setGroupName] = useState(initialGroupName || null);
  const [groupSchedule, setGroupSchedule] = useState(initialGroupSchedule || null);
  const [seanceModalVisible, setSeanceModalVisible] = useState(false);
  const [availableSeances, setAvailableSeances] = useState([]);
  const [loadingSeances, setLoadingSeances] = useState(false);
  const [savingSeance, setSavingSeance] = useState(false);

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

  const openSeancePicker = async () => {
    if (!canEditSeance || savingSeance) return;
    setSeanceModalVisible(true);
    setLoadingSeances(true);
    const res = await getAllSeances({ saisonId: saisonId || null });
    setLoadingSeances(false);
    if (!res.ok) {
      Alert.alert("تنبيه", res.error || "تعذر تحميل الحصص");
      return;
    }
    const memberGenre = contactFields.gender;
    const active = (res.seances || []).filter((s) => s.statut === "active");
    const filtered =
      memberGenre && (memberGenre === "ذكر" || memberGenre === "أنثى")
        ? active.filter((s) => !s.genre || s.genre === memberGenre)
        : active;
    setAvailableSeances(filtered);
  };

  const applySeanceChange = async (nextSeance) => {
    if (!nextSeance?.id || !memberId || savingSeance) return;
    if (nextSeance.id === seanceId) {
      setSeanceModalVisible(false);
      return;
    }

    setSavingSeance(true);
    const res = await updateMemberSeance({
      memberId,
      currentSeanceId: seanceId,
      newSeanceId: nextSeance.id,
      saisonId,
    });
    setSavingSeance(false);

    if (!res.ok) {
      Alert.alert("تنبيه", res.error || "تعذر تغيير الحصة");
      return;
    }

    setSeanceId(nextSeance.id);
    setSaisonId(res.saisonId || nextSeance.saison_id || saisonId);
    setGroupName(nextSeance.nom || null);
    setGroupSchedule(formatSeanceScheduleLabel(nextSeance) || null);
    setSeanceModalVisible(false);
    Alert.alert("تم", `تم نقل العضو إلى حصة «${nextSeance.nom}»`);
  };

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

  const headerIconColor = adminTheme ? "#333333" : "white";
  const trashColor = adminTheme ? "#D32F2F" : "white";

  return (
    <SafeAreaView
      style={[styles.container, adminTheme && styles.containerAdmin]}
      edges={["top", "bottom"]}
    >
      <StatusBar style={adminTheme ? "dark" : "light"} />
      <View style={[styles.header, adminTheme && styles.headerAdmin]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name={arrowBack} size={22} color={headerIconColor} />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, adminTheme && styles.headerTitleAdmin]}
          numberOfLines={1}
        >
          {fullName}
        </Text>
        {seanceId ? (
          <TouchableOpacity
            style={styles.headerRemoveBtn}
            onPress={confirmRemoveFromSeance}
            disabled={removingFromSeance}
            activeOpacity={0.7}
            accessibilityLabel="إزالة من الحصة"
          >
            {removingFromSeance ? (
              <ActivityIndicator color={trashColor} size="small" />
            ) : (
              <Ionicons name="trash-outline" size={22} color={trashColor} />
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

        <View style={[styles.card, adminTheme ? styles.cardAdmin : shadows.card]}>
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

        <View style={[styles.card, adminTheme ? styles.cardAdmin : shadows.card, styles.cardSpacing]}>
          <View style={styles.seanceHeader}>
            <Text style={styles.cardTitleInline}>الحصة</Text>
            {canEditSeance ? (
              <TouchableOpacity
                style={styles.editSeanceBtn}
                onPress={openSeancePicker}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="تعديل الحصة"
              >
                <Ionicons name="create-outline" size={16} color={colors.primary} />
                <Text style={styles.editSeanceBtnText}>تعديل</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <ProfileRow icon="people-outline" label="الحصة" value={groupName || "—"} />
          <ProfileRow icon="time-outline" label="التوقيت" value={groupSchedule} />
          <ProfileRow icon="calendar-clear-outline" label="تاريخ التسجيل" value={registrationDateOnly} />
        </View>

        <View style={[styles.card, adminTheme ? styles.cardAdmin : shadows.card, styles.cardSpacing]}>
          <Text style={styles.cardTitle}>التقدم</Text>
          <ProgressSectionContent progressState={progressState} styles={styles} />
        </View>

        <View style={[styles.card, adminTheme ? styles.cardAdmin : shadows.card, styles.cardSpacing]}>
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

      <Modal
        visible={seanceModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !savingSeance && setSeanceModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => !savingSeance && setSeanceModalVisible(false)}
          />
          <View
            style={[
              styles.modalCard,
              { paddingBottom: Math.max(insets.bottom, 16) + 12 },
            ]}
          >
            <Text style={styles.modalTitle}>اختيار حصة جديدة</Text>
            <Text style={styles.modalHint}>
              اختر الحصة التي تريد نقل العضو إليها
            </Text>
            {loadingSeances ? (
              <ActivityIndicator color={colors.primary} style={styles.loader} />
            ) : availableSeances.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد حصص نشطة متاحة</Text>
            ) : (
              <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
                {availableSeances.map((s) => {
                  const active = s.id === seanceId;
                  const schedule = formatSeanceScheduleLabel(s);
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.seanceOption, active && styles.seanceOptionActive]}
                      onPress={() => applySeanceChange(s)}
                      disabled={savingSeance}
                      activeOpacity={0.8}
                    >
                      <View style={styles.seanceOptionTextWrap}>
                        <Text
                          style={[
                            styles.seanceOptionTitle,
                            active && styles.seanceOptionTitleActive,
                          ]}
                        >
                          {s.nom}
                        </Text>
                        {schedule ? (
                          <Text
                            style={[
                              styles.seanceOptionSub,
                              active && styles.seanceOptionSubActive,
                            ]}
                          >
                            {schedule}
                          </Text>
                        ) : null}
                      </View>
                      {active ? (
                        <Ionicons name="checkmark-circle" size={22} color="#fff" />
                      ) : (
                        <Ionicons
                          name="ellipse-outline"
                          size={22}
                          color={colors.border}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            {savingSeance ? (
              <View style={styles.modalSaving}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.modalSavingText}>جاري النقل…</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSeanceModalVisible(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.modalCloseBtnText}>إلغاء</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  containerAdmin: { backgroundColor: "#F5F5F5" },
  content: { padding: 16, paddingBottom: 32 },

  header: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.primary,
  },
  headerAdmin: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  backBtn: { padding: 2 },
  headerTitle: {
    flex: 1,
    color: "white",
    fontSize: 16,
    fontFamily: fonts.bold,
    ...rtlTextBold,
  },
  headerTitleAdmin: {
    color: "#333333",
    fontSize: 16,
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
  cardAdmin: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    shadowOpacity: 0,
    elevation: 0,
  },
  cardSpacing: { marginTop: 14 },
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
    ...rtlTextBold,
  },
  cardTitleInline: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    ...rtlTextBold,
  },
  seanceHeader: {
    flexDirection: rtlRow,
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  editSeanceBtn: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  editSeanceBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: 20,
    maxHeight: "75%",
  },
  modalTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.text,
    marginBottom: 4,
    ...rtlTextBold,
  },
  modalHint: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 14,
    ...rtlText,
  },
  modalList: {
    maxHeight: 360,
  },
  seanceOption: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    backgroundColor: colors.bg,
  },
  seanceOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  seanceOptionTextWrap: { flex: 1 },
  seanceOptionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.text,
    ...rtlText,
  },
  seanceOptionTitleActive: { color: "#fff" },
  seanceOptionSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    ...rtlText,
  },
  seanceOptionSubActive: { color: "rgba(255,255,255,0.85)" },
  modalSaving: {
    flexDirection: rtlRow,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  modalSavingText: {
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  modalCloseBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  modalCloseBtnText: {
    color: colors.text,
    fontFamily: fonts.semiBold,
    fontSize: 16,
    ...rtlText,
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
