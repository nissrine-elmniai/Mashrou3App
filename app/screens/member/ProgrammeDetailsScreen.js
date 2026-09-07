// app/screens/member/ProgrammeDetailScreen.js
import React, { useEffect, useMemo, useRef } from "react";
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
import {
  flushMemberProgressDelta,
  scheduleMemberProgressDelta,
} from "../../lib/progressApi";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import { TUMUNS_PER_HIZB, hizbBreakdown } from "../../lib/tumun";
import { isHifzProgram } from "../../lib/memberProgramsApi";
import { row as rtlRow, rtlText } from "../../constants/rtl";
import { colors, radii, shadows } from "../../constants/theme";

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

  const formatDate = (date) => {
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

  const dateDebutFormatted = dateDebut ? formatDate(dateDebut) : "تاريخ غير محدد";

  const dateFinObj = dateDebut ? new Date(dateDebut) : null;
  if (dateFinObj) {
    dateFinObj.setDate(dateFinObj.getDate() + programData.duree);
  }
  const dateFinFormatted = dateFinObj
    ? formatDate(dateFinObj)
    : "تاريخ غير محدد";

  const atMin = programData.completedTumuns <= 0;
  const atMax = programData.completedTumuns >= programData.totalTumuns;

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
        <View style={styles.content}>
          <View style={[styles.card, styles.mainCard]}>
            <View style={styles.titleContainer}>
              <View style={styles.bookCol}>
                <View style={styles.iconCircle}>
                  <MaterialCommunityIcons
                    name="book-open-variant"
                    size={30}
                    color="white"
                  />
                </View>
              </View>
              <Text style={styles.mainTitle}>{programData.nom}</Text>
            </View>
            <View style={styles.headerIcons}>
              <View style={styles.badgeGreen}>
                <Text style={styles.badgeTextGreen}>
                  {isHifzProgram(programData) ? "حفظ" : "مراجعة"}
                </Text>
              </View>
              <View style={styles.badgeYellow}>
                <Text style={styles.badgeTextYellow}>
                  {programData.nbHizb} أحزاب
                </Text>
              </View>
              <View style={styles.badgeGreen}>
                <Text style={styles.badgeTextGreen}>
                  {programData.duree} يوم
                </Text>
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
                  <Ionicons
                    name="calendar-outline"
                    size={16}
                    color={colors.primary}
                    style={styles.dateIcon}
                  />
                  <Text style={styles.dateValue}>{dateDebutFormatted}</Text>
                </View>
              </View>
              <View style={styles.dateItem}>
                <Text style={styles.dateLabel}>تاريخ الانتهاء المتوقع</Text>
                <View style={styles.dateValueRow}>
                  <Ionicons
                    name="calendar-outline"
                    size={16}
                    color={colors.gold}
                    style={styles.dateIcon}
                  />
                  <Text style={styles.dateValue}>{dateFinFormatted}</Text>
                </View>
              </View>
            </View>

            <View style={styles.progressContainer}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressTitle}>الأيام المنقضية</Text>
                <Text style={styles.progressText}>
                  {joursEcoules} من {programData.duree} يوم
                </Text>
              </View>
              <View style={[styles.progressBarFull, styles.progressBarRtl]}>
                <View
                  style={[
                    styles.progressBarFill,
                    styles.progressBarFillRtl,
                    {
                      width: `${
                        programData.duree
                          ? (joursRestants / programData.duree) * 100
                          : 0
                      }%`,
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
              {programData.completedTumuns} / {programData.totalTumuns} ثمن
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

            <View style={[styles.progressBarFull, styles.progressBarRtl]}>
              <View
                style={[
                  styles.progressBarFill,
                  styles.progressBarFillRtl,
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
            activeOpacity={0.85}
            accessibilityLabel="حذف البرنامج"
          >
            <Ionicons name="trash-outline" size={18} color={colors.red} />
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
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={colors.muted}
          style={{ marginEnd: 8 }}
        />
        <Text style={[styles.statTitle, { ...rtlText }]}>{title}</Text>
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
  content: {
    padding: 16,
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
    flexDirection: rtlRow,
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  bookCol: {
    width: 50,
    alignItems: "center",
  },
  mainTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: "bold",
    color: colors.primary,
    ...rtlText,
  },
  iconCircle: {
    width: 50,
    height: 50,
    backgroundColor: colors.primary,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIcons: {
    flexDirection: rtlRow,
    flexWrap: "wrap",
    gap: 6,
    paddingStart: 25,
  },
  badgeGreen: {
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
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
    fontSize: 15,
    color: colors.muted,
  },
  statValue: {
    fontSize: 22,
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
    alignItems: "flex-start",
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
    gap: 12,
  },
  dateItem: {
    alignItems: "flex-start",
    flex: 1,
  },
  dateLabel: {
    fontSize: 12,
    color: colors.placeholder,
    marginBottom: 5,
    ...rtlText,
  },
  dateValue: {
    fontSize: 13,
    fontWeight: "bold",
    color: colors.textSecondary,
    ...rtlText,
  },
  dateValueRow: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 5,
  },
  dateIcon: {},
  progressContainer: {
    backgroundColor: colors.soft,
    padding: 12,
    borderRadius: radii.sm,
  },
  progressHeader: {
    flexDirection: rtlRow,
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  progressTitle: {
    color: colors.primary,
    fontWeight: "bold",
    ...rtlText,
  },
  progressText: {
    color: colors.textSecondary,
    ...rtlText,
  },
  progressBarFull: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarRtl: {
    direction: "rtl",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.primary,
    alignSelf: "flex-end",
  },
  progressBarFillRtl: {
    alignSelf: "flex-start",
  },
  currentProgressLabel: {
    fontSize: 14,
    color: colors.muted,
    ...rtlText,
    marginTop: 8,
    marginBottom: 4,
  },
  tumunCountText: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.primary,
    marginVertical: 4,
    ...rtlText,
  },
  percentageText: {
    fontSize: 16,
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
    fontSize: 25,
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
    backgroundColor: "#FEE2E2",
    marginTop: 8,
    marginBottom: 16,
    paddingVertical: 12,
    borderRadius: radii.md,
    flexDirection: rtlRow,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  deleteButtonText: {
    color: colors.red,
    fontSize: 16,
    fontWeight: "700",
    ...rtlText,
  },
  bottomPadding: {
    height: 20,
  },
});
