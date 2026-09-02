// app/screens/member/ProgrammeDetailScreen.js
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useApp } from "../../context/AppContext";
import { addProgressEntry } from "../../lib/progressApi";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import { TUMUNS_PER_HIZB, hizbBreakdown } from "../../lib/tumun";
import { row as rtlRow, rtlText, arrowBack } from "../../constants/rtl";
import { colors, radii, shadows } from "../../constants/theme";

const HISTORY_DEBOUNCE_MS = 800;

export default function ProgrammeDetailScreen({ navigation, route }) {
  const routeProgram = route.params?.programme;
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

  const historyTimerRef = useRef(null);
  const pendingHistoryRef = useRef(null);

  const { completed: hizbCompletes, remaining: hizbRestants } = hizbBreakdown(
    programData.completedTumuns,
    programData.nbHizb
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
    const date = new Date(dateString.replace(/\//g, "-"));
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

  const dateDebutFormatted = dateIsValid ? formatDate(rawDate) : "Date non définie";

  const dateFinObj = dateDebut ? new Date(dateDebut) : null;
  if (dateFinObj) {
    dateFinObj.setDate(dateFinObj.getDate() + programData.duree);
  }
  const dateFinFormatted = dateFinObj
    ? `${dateFinObj.getDate()} ${dateFinObj.toLocaleDateString("fr-FR", { month: "long" })} ${dateFinObj.getFullYear()}`
    : "Date non définie";

  const atMin = programData.completedTumuns <= 0;
  const atMax = programData.completedTumuns >= programData.totalTumuns;

  const flushProgressHistory = useCallback(async () => {
    const pending = pendingHistoryRef.current;
    pendingHistoryRef.current = null;
    if (!pending || pending.completedTumuns <= 0) return;

    const result = await addProgressEntry({
      completedTumuns: pending.completedTumuns,
      nbHizb: pending.nbHizb,
      saisonId: activeSeasonIdRef.current,
      notes: `${pending.title} — ${pending.completedTumuns}/${pending.totalTumuns} أثمان`,
    });

    if (!result.ok) {
      Alert.alert("تنبيه", result.error || "تعذر تسجيل النشاط");
    }
  }, []);

  const scheduleProgressHistory = useCallback(
    (program) => {
      pendingHistoryRef.current = {
        title: program.nom,
        completedTumuns: program.completedTumuns,
        totalTumuns: program.totalTumuns,
        nbHizb: program.nbHizb,
      };
      if (historyTimerRef.current) {
        clearTimeout(historyTimerRef.current);
      }
      historyTimerRef.current = setTimeout(flushProgressHistory, HISTORY_DEBOUNCE_MS);
    },
    [flushProgressHistory]
  );

  useEffect(
    () => () => {
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    },
    []
  );

  const handleAdjustTumuns = (delta) => {
    if (!programData.id) return;
    const result = adjustMemberProgramTumuns(programData.id, delta);
    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }
    if (delta > 0 && result.program && !result.unchanged) {
      scheduleProgressHistory({
        nom: result.program.title,
        completedTumuns: result.program.completedTumuns,
        totalTumuns: result.program.totalTumuns,
        nbHizb: result.program.nbHizb,
      });
    }
  };

  const handleDeleteProgramme = () => {
    Alert.alert(
      "حذف البرنامج",
      `هل أنت متأكد من حذف برنامج "${programData.nom}"؟\n\nسيتم حذف جميع بيانات التقدم المرتبطة به بشكل نهائي.`,
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
      Alert.alert("✅ تم الحذف", "تم حذف البرنامج بنجاح", [
        { text: "رجوع", onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error("Erreur suppression:", error);
      Alert.alert("خطأ", "حدث خطأ أثناء حذف البرنامج");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backText}>رجوع</Text>
            <Ionicons name={arrowBack} size={20} color="white" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={[styles.card, styles.mainCard]}>
            <View style={styles.rowBetween}>
              <View style={styles.headerIcons}>
                <View style={styles.badgeGreen}>
                  <Text style={styles.badgeTextGreen}>
                    {programData.nbHizb} أحزاب
                  </Text>
                </View>
                <View style={styles.badgeYellow}>
                  <Text style={styles.badgeTextYellow}>
                    {programData.duree} يوم
                  </Text>
                </View>
              </View>
              <View style={styles.titleContainer}>
                <Text style={styles.mainTitle}>{programData.nom}</Text>
                <View style={styles.iconCircle}>
                  <MaterialCommunityIcons
                    name="book-open-variant"
                    size={30}
                    color="white"
                  />
                </View>
              </View>
            </View>
          </View>

          <StatCard
            title="الأحزاب المكتملة"
            value={hizbCompletes.toString()}
            icon="check-circle"
            color={colors.primary}
          />
          <StatCard
            title="الأحزاب المتبقية"
            value={hizbRestants.toString()}
            icon="clock-outline"
            color={colors.gold}
          />
          <StatCard
            title="الأيام المتبقية"
            value={joursRestants.toString()}
            icon="calendar-clock"
            color={colors.primary}
          />

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>تفاصيل البرنامج</Text>

            <View style={styles.datesRow}>
              <View style={styles.dateItem}>
                <Text style={styles.dateLabel}>تاريخ البداية</Text>
                <View style={styles.dateValueRow}>
                  <Text style={styles.dateValue}>{dateDebutFormatted}</Text>
                  <Ionicons
                    name="calendar-outline"
                    size={16}
                    color={colors.primary}
                    style={styles.dateIcon}
                  />
                </View>
              </View>
              <View style={styles.dateItem}>
                <Text style={styles.dateLabel}>تاريخ الانتهاء المتوقع</Text>
                <View style={styles.dateValueRow}>
                  <Text style={styles.dateValue}>{dateFinFormatted}</Text>
                  <Ionicons
                    name="calendar-outline"
                    size={16}
                    color={colors.gold}
                    style={styles.dateIcon}
                  />
                </View>
              </View>
            </View>

            <View style={styles.progressContainer}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressText}>
                  {joursEcoules} من {programData.duree} يوم
                </Text>
                <Text style={styles.progressTitle}>الأيام المنقضية</Text>
              </View>
              <View style={styles.progressBarFull}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${programData.duree ? (joursEcoules / programData.duree) * 100 : 0}%`,
                    },
                  ]}
                />
              </View>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.titleRight}>
              <Text style={styles.sectionTitle}>إدارة التقدم</Text>
              <Text style={styles.subTitle}>تحديث التقدم بالأثمان (ثمن)</Text>
            </View>

            <Text style={styles.currentProgressLabel}>التقدم الحالي</Text>
            <Text style={styles.tumunCountText}>
              {programData.completedTumuns} / {programData.totalTumuns} أثمان
            </Text>
            <Text style={styles.percentageText}>{programData.progression}%</Text>

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

            <View style={styles.progressBarFull}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${programData.progression}%` },
                ]}
              />
            </View>

            {programData.progression < 100 && (
              <View style={styles.noteBox}>
                <Text style={styles.noteText}>
                  ملاحظة: التقدم الفعلي ({programData.progression}%) أقل من
                  المتوقع (100%) بناء على الأيام المنقضية.
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeleteProgramme}
            activeOpacity={0.8}
          >
            <Text style={styles.deleteButtonIcon}>🗑️</Text>
            <Text style={styles.deleteButtonText}>حذف البرنامج</Text>
          </TouchableOpacity>

          <View style={styles.bottomPadding} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const StatCard = ({ title, value, icon, color }) => (
  <View style={[styles.card, { borderColor: color, borderStartWidth: 4 }]}>
    <View style={styles.rowBetween}>
      <View style={styles.itemRow}>
        <Text style={[styles.statTitle, { ...rtlText }]}>{title}</Text>
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={colors.muted}
          style={{ marginStart: 8 }}
        />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    backgroundColor: colors.primary,
    height: 100,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  backButton: {
    flexDirection: rtlRow,
    alignItems: "center",
  },
  backText: {
    color: "white",
    marginEnd: 8,
    fontSize: 16,
    fontWeight: "bold",
  },
  content: {
    padding: 16,
    marginTop: -20,
  },
  card: {
    backgroundColor: "white",
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
    ...shadows.card,
  },
  mainCard: {
    backgroundColor: colors.soft,
    borderWidth: 1,
    borderColor: colors.borderGreen,
  },
  itemRow: {
    flexDirection: rtlRow,
    alignItems: "center",
  },
  rowBetween: {
    flexDirection: rtlRow,
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleContainer: {
    flex: 1,
    flexDirection: rtlRow,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: colors.primary,
    marginEnd: 10,
  },
  iconCircle: {
    backgroundColor: colors.primary,
    padding: 10,
    borderRadius: radii.pill,
  },
  headerIcons: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  badgeGreen: {
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 5,
  },
  badgeYellow: {
    borderColor: colors.gold,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeTextGreen: {
    color: colors.primary,
    fontSize: 12,
  },
  badgeTextYellow: {
    color: colors.gold,
    fontSize: 12,
  },
  statTitle: {
    fontSize: 16,
    color: colors.muted,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
  },
  sectionCard: {
    backgroundColor: "white",
    borderRadius: radii.lg,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.primary,
    ...rtlText,
  },
  titleRight: {
    alignItems: "flex-end",
    marginBottom: 8,
  },
  subTitle: {
    fontSize: 12,
    color: colors.placeholder,
    ...rtlText,
  },
  datesRow: {
    flexDirection: rtlRow,
    justifyContent: "space-between",
    marginVertical: 20,
  },
  dateItem: {
    alignItems: "flex-end",
    flex: 1,
  },
  dateLabel: {
    fontSize: 12,
    color: colors.placeholder,
    marginBottom: 5,
  },
  dateValue: {
    fontSize: 13,
    fontWeight: "bold",
    color: colors.textSecondary,
    marginEnd: 5,
  },
  dateValueRow: {
    flexDirection: rtlRow,
    alignItems: "center",
  },
  dateIcon: {
    marginStart: 5,
  },
  progressContainer: {
    backgroundColor: colors.soft,
    padding: 12,
    borderRadius: radii.sm,
  },
  progressHeader: {
    flexDirection: rtlRow,
    justifyContent: "space-between",
    marginBottom: 10,
  },
  progressTitle: {
    color: colors.primary,
    fontWeight: "bold",
  },
  progressText: {
    color: colors.textSecondary,
  },
  progressBarFull: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.primary,
  },
  currentProgressLabel: {
    fontSize: 14,
    color: colors.muted,
    ...rtlText,
    marginTop: 8,
    marginBottom: 4,
  },
  tumunCountText: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.primary,
    marginVertical: 4,
    ...rtlText,
  },
  percentageText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 16,
    ...rtlText,
  },
  stepperRow: {
    flexDirection: rtlRow,
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 12,
  },
  stepperBtn: {
    backgroundColor: colors.inputBg,
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperBtnText: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.primary,
  },
  stepperValueWrap: {
    flex: 1,
    alignItems: "center",
  },
  stepperValue: {
    fontSize: 32,
    fontWeight: "bold",
    color: colors.primary,
  },
  stepperHint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
    ...rtlText,
  },
  noteBox: {
    backgroundColor: "#FFF8E7",
    padding: 16,
    borderRadius: radii.md,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#FFE0B2",
  },
  noteText: {
    color: "#B76E3C",
    fontSize: 13,
    ...rtlText,
    lineHeight: 20,
  },
  deleteButton: {
    backgroundColor: colors.red,
    marginTop: 8,
    marginBottom: 16,
    paddingVertical: 18,
    borderRadius: radii.lg,
    flexDirection: rtlRow,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  deleteButtonIcon: {
    fontSize: 22,
    color: "white",
    marginEnd: 10,
  },
  deleteButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    ...rtlText,
  },
  bottomPadding: {
    height: 20,
  },
});
