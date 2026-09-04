import React, { useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../../context/AppContext";
import {
  flushMemberProgressDelta,
  scheduleMemberProgressDelta,
} from "../../lib/progressApi";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import { TUMUNS_PER_HIZB, hizbBreakdown } from "../../lib/tumun";
import { isHifzProgram } from "../../lib/memberProgramsApi";
import { row as rtlRow, rtlText, fonts, arrowBack } from "../../constants/rtl";
import { colors, radii } from "../../constants/theme";

function StatRow({ icon, label, value }) {
  return (
    <View style={styles.statRow}>
      <View style={styles.statIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export default function ProgrammeDetailScreen({ navigation, route }) {
  const routeProgram = route.params?.programme;
  const insets = useSafeAreaInsets();
  const {
    getMemberPrograms,
    adjustMemberProgramTumuns,
    deleteMemberProgram,
    seasons,
  } = useApp();

  const activeSeasonIdRef = useRef(null);
  activeSeasonIdRef.current = getActiveRegularSeason(seasons)?.id ?? null;

  const programFromContext = useMemo(() => {
    if (!routeProgram?.id) return null;
    return getMemberPrograms().find((p) => p.id === routeProgram.id) || null;
  }, [getMemberPrograms, routeProgram?.id]);

  const programData = useMemo(() => {
    if (programFromContext) {
      return {
        id: programFromContext.id,
        nom: programFromContext.title,
        duree: programFromContext.durationDays,
        nbHizb: programFromContext.nbHizb,
        completedTumuns: programFromContext.completedTumuns,
        totalTumuns: programFromContext.totalTumuns,
        progression: programFromContext.progression,
        type: programFromContext.type,
        dateDebut: programFromContext.startDate,
        statut: programFromContext.progression >= 100 ? "terminé" : "en_cours",
      };
    }
    if (routeProgram) {
      const nbHizb = routeProgram.nbHizb || 0;
      const totalTumuns = nbHizb * TUMUNS_PER_HIZB;
      const completedTumuns = Math.round(
        ((routeProgram.progression || 0) / 100) * totalTumuns
      );
      return {
        ...routeProgram,
        completedTumuns,
        totalTumuns,
      };
    }
    return {
      id: "1",
      nom: "برنامج جزء عم",
      duree: 30,
      nbHizb: 3,
      completedTumuns: 0,
      totalTumuns: 24,
      progression: 0,
      dateDebut: "2025/01/01",
      statut: "en_cours",
    };
  }, [programFromContext, routeProgram]);

  const { completed: hizbCompletes, remaining: hizbRestants } = hizbBreakdown(
    programData.completedTumuns,
    programData.nbHizb
  );

  const handleAdjustTumuns = (delta) => {
    if (!programData.id) return;
    const result = adjustMemberProgramTumuns(programData.id, delta);
    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }
    if (result.unchanged) return;
    if (isHifzProgram(result.program)) {
      scheduleMemberProgressDelta({
        delta,
        saisonId: activeSeasonIdRef.current,
        notes: result.program.title || programData.nom || null,
      });
    }
  };

  useEffect(
    () => () => {
      flushMemberProgressDelta();
    },
    []
  );

  const rawDate = programData.dateDebut;
  const dateIsValid =
    !!rawDate &&
    rawDate !== "—" &&
    !Number.isNaN(new Date(String(rawDate).replace(/\//g, "-")).getTime());
  const dateDebut = dateIsValid
    ? new Date(String(rawDate).replace(/\//g, "-"))
    : null;

  const aujourdhui = new Date();
  const joursEcoules = dateDebut
    ? Math.min(
        programData.duree,
        Math.max(
          0,
          Math.floor((aujourdhui - dateDebut) / (1000 * 60 * 60 * 24))
        )
      )
    : 0;
  const joursRestants = Math.max(0, programData.duree - joursEcoules);

  const formatDate = (dateString) => {
    const date = new Date(String(dateString).replace(/\//g, "-"));
    const mois = [
      "يناير",
      "فبراير",
      "مارس",
      "أبريل",
      "ماي",
      "يونيو",
      "يوليوز",
      "غشت",
      "شتنبر",
      "أكتوبر",
      "نونبر",
      "دجنبر",
    ];
    return `${date.getDate()} ${mois[date.getMonth()]} ${date.getFullYear()}`;
  };

  const dateDebutFormatted = dateIsValid ? formatDate(rawDate) : "غير محدد";

  const dateFinObj = dateDebut ? new Date(dateDebut) : null;
  if (dateFinObj) {
    dateFinObj.setDate(dateFinObj.getDate() + programData.duree);
  }
  const dateFinFormatted = dateFinObj
    ? formatDate(
        `${dateFinObj.getFullYear()}-${String(dateFinObj.getMonth() + 1).padStart(2, "0")}-${String(dateFinObj.getDate()).padStart(2, "0")}`
      )
    : "غير محدد";

  const atMin = programData.completedTumuns <= 0;
  const atMax = programData.completedTumuns >= programData.totalTumuns;
  const daysPct = programData.duree
    ? Math.min(100, Math.round((joursEcoules / programData.duree) * 100))
    : 0;

  const handleDeleteProgramme = () => {
    Alert.alert(
      "حذف البرنامج",
      `هل أنت متأكد من حذف برنامج "${programData.nom}"؟\n\nسيُحذف البرنامج فقط. موضعك في القرآن يبقى كما هو.`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: confirmDelete,
        },
      ]
    );
  };

  const confirmDelete = async () => {
    try {
      if (programData.id) {
        const result = deleteMemberProgram(programData.id);
        if (!result.ok) {
          Alert.alert("خطأ", result.error);
          return;
        }
      }
      Alert.alert("تم الحذف", "تم حذف البرنامج بنجاح", [
        { text: "رجوع", onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error("Erreur suppression:", error);
      Alert.alert("خطأ", "حدث خطأ أثناء حذف البرنامج");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityLabel="رجوع"
        >
          <Ionicons name={arrowBack} size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {programData.nom || "تفاصيل البرنامج"}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 28 + Math.max(insets.bottom, 16) },
        ]}
      >
        <View style={styles.card}>
          <View style={styles.heroRow}>
            <View style={styles.heroIcon}>
              <Ionicons name="book-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroTitle}>{programData.nom}</Text>
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {isHifzProgram(programData) ? "حفظ" : "مراجعة"}
                  </Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{programData.nbHizb} أحزاب</Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{programData.duree} يوم</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ملخص التقدم</Text>
          <StatRow
            icon="checkmark-circle-outline"
            label="الأحزاب المكتملة"
            value={hizbCompletes}
          />
          <StatRow
            icon="time-outline"
            label="الأحزاب المتبقية"
            value={hizbRestants}
          />
          <StatRow
            icon="calendar-outline"
            label="الأيام المتبقية"
            value={joursRestants}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>تفاصيل البرنامج</Text>
          <View style={styles.datesRow}>
            <View style={styles.dateBox}>
              <Text style={styles.dateLabel}>تاريخ البداية</Text>
              <Text style={styles.dateValue}>{dateDebutFormatted}</Text>
            </View>
            <View style={styles.dateBox}>
              <Text style={styles.dateLabel}>الانتهاء المتوقع</Text>
              <Text style={styles.dateValue}>{dateFinFormatted}</Text>
            </View>
          </View>
          <View style={styles.meterBlock}>
            <View style={styles.meterHeader}>
              <Text style={styles.meterLabel}>الأيام المنقضية</Text>
              <Text style={styles.meterMeta}>
                {joursEcoules} / {programData.duree}
              </Text>
            </View>
            <View style={styles.meterTrack}>
              <View style={[styles.meterFill, { width: `${daysPct}%` }]} />
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>إدارة التقدم</Text>
          <Text style={styles.sectionHint}>تحديث التقدم بالأثمان (ثمن)</Text>

          <Text style={styles.progressCount}>
            {programData.completedTumuns} / {programData.totalTumuns} أثمان
          </Text>
          <Text style={styles.progressPct}>{programData.progression}%</Text>

          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={[styles.stepperBtn, atMin && styles.stepperBtnDisabled]}
              onPress={() => handleAdjustTumuns(-1)}
              disabled={atMin}
              activeOpacity={0.85}
            >
              <Text style={styles.stepperBtnText}>−</Text>
            </TouchableOpacity>

            <View style={styles.stepperValueWrap}>
              <Text style={styles.stepperValue}>
                {programData.completedTumuns}
              </Text>
              <Text style={styles.stepperHint}>ثمن مكتمل</Text>
            </View>

            <TouchableOpacity
              style={[styles.stepperBtn, atMax && styles.stepperBtnDisabled]}
              onPress={() => handleAdjustTumuns(1)}
              disabled={atMax}
              activeOpacity={0.85}
            >
              <Text style={styles.stepperBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.meterTrack}>
            <View
              style={[
                styles.meterFill,
                { width: `${Math.min(100, programData.progression || 0)}%` },
              ]}
            />
          </View>

          {programData.progression < 100 ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteText}>
                ملاحظة: يمكنك تحديث تقدمك ثمنًا بثمن وفق ما أنجزته فعليًا.
              </Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={handleDeleteProgramme}
          activeOpacity={0.85}
        >
          <Ionicons name="trash-outline" size={18} color={colors.red} />
          <Text style={styles.deleteBtnText}>حذف البرنامج</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 10,
  },
  headerBtn: { padding: 2 },
  headerTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    fontFamily: fonts.bold,
    ...rtlText,
  },
  headerSpacer: { width: 26 },
  content: { padding: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: 16,
    marginBottom: 12,
  },
  heroRow: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 12,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTextWrap: { flex: 1 },
  heroTitle: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.text,
    marginBottom: 8,
    ...rtlText,
  },
  badgeRow: {
    flexDirection: rtlRow,
    flexWrap: "wrap",
    gap: 6,
  },
  badge: {
    backgroundColor: colors.soft,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.borderGreen,
  },
  badgeText: {
    color: colors.primary,
    fontSize: 12,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.text,
    marginBottom: 12,
    ...rtlText,
  },
  sectionHint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: -6,
    marginBottom: 12,
    ...rtlText,
  },
  statRow: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.muted,
    ...rtlText,
  },
  statValue: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.primary,
    ...rtlText,
  },
  datesRow: {
    flexDirection: rtlRow,
    gap: 10,
    marginBottom: 14,
  },
  dateBox: {
    flex: 1,
    backgroundColor: colors.soft,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.borderGreen,
  },
  dateLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
    ...rtlText,
  },
  dateValue: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: colors.text,
    ...rtlText,
  },
  meterBlock: { marginTop: 4 },
  meterHeader: {
    flexDirection: rtlRow,
    justifyContent: "space-between",
    marginBottom: 8,
  },
  meterLabel: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: colors.primary,
    ...rtlText,
  },
  meterMeta: {
    fontSize: 13,
    color: colors.muted,
    ...rtlText,
  },
  meterTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  meterFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressCount: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: colors.primary,
    ...rtlText,
  },
  progressPct: {
    fontSize: 15,
    color: colors.muted,
    marginBottom: 14,
    ...rtlText,
  },
  stepperRow: {
    flexDirection: rtlRow,
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 12,
  },
  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.soft,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnDisabled: { opacity: 0.4 },
  stepperBtnText: {
    fontSize: 26,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  stepperValueWrap: { flex: 1, alignItems: "center" },
  stepperValue: {
    fontSize: 28,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  stepperHint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    ...rtlText,
  },
  noteBox: {
    marginTop: 14,
    backgroundColor: colors.soft,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.borderGreen,
  },
  noteText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    ...rtlText,
  },
  deleteBtn: {
    marginTop: 4,
    flexDirection: rtlRow,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFEBEE",
    borderRadius: 14,
    paddingVertical: 14,
  },
  deleteBtnText: {
    color: colors.red,
    fontSize: 15,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
});
