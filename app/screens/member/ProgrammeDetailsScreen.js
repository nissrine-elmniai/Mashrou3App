// app/screens/member/ProgrammeDetailScreen.js
import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { row, rtlText, arrowBack } from "../../constants/rtl";
import { colors, radii, shadows } from "../../constants/theme";
import { addProgressEntry } from "../../lib/progressApi";

const { width } = Dimensions.get("window");

export default function ProgrammeDetailScreen({ navigation, route }) {
  // 📥 RÉCUPÉRATION DES DONNÉES DEPUIS LE DASHBOARD
  const { programme } = route.params || {};

  // Données par défaut si rien n'est passé (au cas où)
  const defaultData = {
    id: "1",
    nom: "برنامج جزء عم",
    duree: 30,
    nbHizb: 3,
    progression: 65,
    dateDebut: "2025/01/01",
    statut: "en_cours",
  };

  // Utilisation des données du programme passé depuis le Dashboard
  const [programData, setProgramData] = useState(programme || defaultData);

  // État pour la modification du progrès
  const [isEditing, setIsEditing] = useState(false);
  const [tempProgress, setTempProgress] = useState(
    programData.progression.toString(),
  );
  const [showProgressModal, setShowProgressModal] = useState(false);

  // 📊 CALCULS DYNAMIQUES BASÉS SUR LES DONNÉES DU PROGRAMME
  const hizbCompletes = Math.floor(
    (programData.progression / 100) * programData.nbHizb,
  );
  const hizbRestants = programData.nbHizb - hizbCompletes;

  // Garde-fou : date de début absente/invalide ("—", undefined…)
  const rawDate = programData.dateDebut;
  const dateIsValid =
    !!rawDate &&
    rawDate !== "—" &&
    !isNaN(new Date(String(rawDate).replace(/\//g, "-")).getTime());
  const dateDebut = dateIsValid
    ? new Date(String(rawDate).replace(/\//g, "-"))
    : null;

  // Calcul des jours (dates portées par le programme affiché — pas d'entité backend)
  const aujourdhui = new Date();
  const joursEcoules = dateDebut
    ? Math.min(
        programData.duree,
        Math.max(
          0,
          Math.floor((aujourdhui - dateDebut) / (1000 * 60 * 60 * 24)),
        ),
      )
    : 0;
  const joursRestants = Math.max(0, programData.duree - joursEcoules);

  // Formatage des dates
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

  // Gestion de la sauvegarde du progrès
  const handleSaveProgress = async () => {
    const newProgress = parseInt(tempProgress);
    if (isNaN(newProgress) || newProgress < 0 || newProgress > 100) {
      Alert.alert("خطأ", "الرجاء إدخال قيمة بين 0 و 100");
      return;
    }

    setProgramData({
      ...programData,
      progression: newProgress,
    });

    setShowProgressModal(false);
    setIsEditing(false);

    // Persistance Supabase (table progression). Le programme affiché est
    // « جزء عم » → juze 30 ; le pourcentage du modal est traduit en tumun
    // (1..8) de ce juz. Mapping provisoire — à affiner quand le CDC
    // définira la saisie détaillée.
    const result = await addProgressEntry({
      juze: 30,
      tumun: Math.max(1, Math.min(8, Math.ceil((newProgress / 100) * 8))),
      note: null,
    });

    if (!result.ok) {
      Alert.alert("خطأ", result.error || "تعذر حفظ التقدم");
      return;
    }
    Alert.alert("تم", "تم تحديث التقدم بنجاح");
  };

  // 🆕 FONCTION POUR SUPPRIMER LE PROGRAMME
  const handleDeleteProgramme = () => {
    Alert.alert(
      "حذف البرنامج",
      `هل أنت متأكد من حذف برنامج "${programData.nom}"؟\n\nسيتم حذف جميع بيانات التقدم المرتبطة به بشكل نهائي.`,
      [
        {
          text: "إلغاء",
          style: "cancel",
        },
        {
          text: "حذف",
          style: "destructive",
          onPress: confirmDelete,
        },
      ],
    );
  };

  const confirmDelete = async () => {
    try {
      // Pas d'entité « programme » côté backend (le Mushaf reste un asset
      // statique embarqué) — suppression locale uniquement.

      console.log("Programme supprimé:", programData.id);

      // Message de succès
      Alert.alert("✅ تم الحذف", "تم حذف البرنامج بنجاح", [
        {
          text: "رجوع",
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error("Erreur suppression:", error);
      Alert.alert("خطأ", "حدث خطأ أثناء حذف البرنامج");
    }
  };

  // Composant Modal pour ajuster la progression
  const ProgressModal = () => (
    <Modal
      transparent={true}
      visible={showProgressModal}
      onRequestClose={() => setShowProgressModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>إدارة التقدم</Text>
            <TouchableOpacity onPress={() => setShowProgressModal(false)}>
              <Ionicons name="close" size={24} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.modalSubtitle}>
            تحديث نسبة الإنجاز في البرنامج
          </Text>

          {/* Progression actuelle */}
          <View style={styles.currentProgressContainer}>
            <Text style={styles.currentProgressLabel}>التقدم الحالي</Text>
            <Text style={styles.currentProgressValue}>
              {programData.progression}%
            </Text>
          </View>

          <View style={styles.progressBarFull}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${programData.progression}%` },
              ]}
            />
          </View>

          {/* Ajustement du progrès */}
          <View style={styles.adjustSection}>
            <Text style={styles.adjustLabel}>اضبط نسبة التقدم</Text>

            <View style={styles.sliderContainer}>
              <TouchableOpacity
                style={styles.sliderButton}
                onPress={() => {
                  const newVal = Math.max(0, parseInt(tempProgress) - 5);
                  setTempProgress(newVal.toString());
                }}
              >
                <Text style={styles.sliderButtonText}>-</Text>
              </TouchableOpacity>

              <View style={styles.progressInputContainer}>
                <TextInput
                  style={styles.progressInput}
                  value={tempProgress}
                  onChangeText={setTempProgress}
                  keyboardType="numeric"
                  maxLength={3}
                  textAlign="center"
                />
                <Text style={styles.percentSymbol}>%</Text>
              </View>

              <TouchableOpacity
                style={styles.sliderButton}
                onPress={() => {
                  const newVal = Math.min(100, parseInt(tempProgress) + 5);
                  setTempProgress(newVal.toString());
                }}
              >
                <Text style={styles.sliderButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Boutons d'action */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveProgress}
              >
                <Text style={styles.saveButtonText}>حفظ التغيرات</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowProgressModal(false);
                  setTempProgress(programData.progression.toString());
                }}
              >
                <Text style={styles.cancelButtonText}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Note d'avertissement */}
          {programData.progression < 100 && (
            <View style={styles.warningNote}>
              <Text style={styles.warningIcon}>⚠️</Text>
              <Text style={styles.warningText}>
                التقدم الفعلي ({programData.progression}%) أقل من المتوقع (100%)
                بناء على الأيام المنقضية.
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* --- Header avec bouton retour --- */}
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
          {/* --- Carte Header Programme (DONNÉES DYNAMIQUES) --- */}
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

          {/* --- Statistiques (CALCULÉES DYNAMIQUEMENT) --- */}
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

          {/* --- Détails du Programme (DATES DYNAMIQUES) --- */}
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
                    { width: `${(joursEcoules / programData.duree) * 100}%` },
                  ]}
                />
              </View>
            </View>
          </View>

          {/* --- Gestion de la progression --- */}
          <View style={styles.sectionCard}>
            <View style={styles.rowBetween}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => {
                  setTempProgress(programData.progression.toString());
                  setShowProgressModal(true);
                }}
              >
                <Text style={styles.editButtonText}>تعديل التقدم</Text>
              </TouchableOpacity>
              <View style={styles.titleRight}>
                <Text style={styles.sectionTitle}>إدارة التقدم</Text>
                <Text style={styles.subTitle}>
                  تحديث نسبة الإنجاز في البرنامج
                </Text>
              </View>
            </View>

            <Text style={styles.currentProgressLabel}>التقدم الحالي</Text>
            <Text style={styles.percentageText}>
              {programData.progression}%
            </Text>
            <View style={styles.progressBarFull}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${programData.progression}%` },
                ]}
              />
            </View>

            {/* Note d'avertissement conditionnelle */}
            {programData.progression < 100 && (
              <View style={styles.noteBox}>
                <Text style={styles.noteText}>
                  ملاحظة: التقدم الفعلي ({programData.progression}%) أقل من
                  المتوقع (100%) بناء على الأيام المنقضية.
                </Text>
              </View>
            )}
          </View>

          {/* 🆕 BOUTON SUPPRIMER AJOUTÉ ICI - À LA FIN DE L'ÉCRAN */}
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeleteProgramme}
            activeOpacity={0.8}
          >
            <Text style={styles.deleteButtonIcon}>🗑️</Text>
            <Text style={styles.deleteButtonText}>حذف البرنامج</Text>
          </TouchableOpacity>

          {/* Espace en bas pour le scroll */}
          <View style={styles.bottomPadding} />
        </View>
      </ScrollView>

      {/* Modal de modification du progrès */}
      <ProgressModal />
    </SafeAreaView>
  );
}

// Composant pour les petites cartes de stats
const StatCard = ({ title, value, icon, color }) => (
  <View style={[styles.card, { borderColor: color, borderStartWidth: 4 }]}>
    <View style={styles.rowBetween}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <View style={styles.row}>
        <Text style={[styles.statTitle, { ...rtlText }]}>{title}</Text>
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={colors.muted}
          style={{ marginStart: 8 }}
        />
      </View>
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
    flexDirection: row,
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
  row: {
    flexDirection: row,
    alignItems: "center",
  },
  rowBetween: {
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleContainer: {
    flex: 1,
    flexDirection: row,
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
  },
  subTitle: {
    fontSize: 12,
    color: colors.placeholder,
    ...rtlText,
  },
  datesRow: {
    flexDirection: row,
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
    flexDirection: row,
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
    flexDirection: row,
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
  editButton: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radii.sm,
  },
  editButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 14,
  },
  currentProgressLabel: {
    fontSize: 14,
    color: colors.muted,
    ...rtlText,
    marginTop: 16,
    marginBottom: 4,
  },
  percentageText: {
    fontSize: 32,
    fontWeight: "bold",
    color: colors.primary,
    marginVertical: 8,
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
  // 🆕 STYLES POUR LE BOUTON SUPPRIMER
  deleteButton: {
    backgroundColor: colors.red,
    marginTop: 8,
    marginBottom: 16,
    paddingVertical: 18,
    borderRadius: radii.lg,
    flexDirection: row,
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
  // Styles du Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: radii.xl,
    padding: 24,
    width: width * 0.9,
    maxWidth: 400,
    ...shadows.card,
  },
  modalHeader: {
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: colors.primary,
    ...rtlText,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.muted,
    ...rtlText,
    marginBottom: 20,
  },
  currentProgressContainer: {
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  currentProgressLabel: {
    fontSize: 15,
    color: colors.muted,
    ...rtlText,
  },
  currentProgressValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.primary,
  },
  adjustSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  adjustLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textSecondary,
    ...rtlText,
    marginBottom: 16,
  },
  sliderContainer: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  sliderButton: {
    backgroundColor: colors.inputBg,
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  sliderButtonText: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.primary,
  },
  progressInputContainer: {
    flexDirection: row,
    alignItems: "center",
    backgroundColor: colors.inputBg,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 100,
  },
  progressInput: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.primary,
    textAlign: "center",
    minWidth: 60,
  },
  percentSymbol: {
    fontSize: 18,
    color: colors.muted,
    marginStart: 4,
  },
  modalActions: {
    flexDirection: row,
    gap: 12,
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
  },
  saveButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.inputBg,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
  },
  cancelButtonText: {
    color: colors.muted,
    fontWeight: "bold",
    fontSize: 16,
  },
  warningNote: {
    flexDirection: row,
    backgroundColor: "#FFF8E7",
    padding: 16,
    borderRadius: radii.md,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#FFE0B2",
  },
  warningIcon: {
    fontSize: 18,
    marginEnd: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: "#B76E3C",
    lineHeight: 20,
    ...rtlText,
  },
});