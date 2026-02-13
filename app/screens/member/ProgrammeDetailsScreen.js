// app/screens/member/ProgrammeDetailScreen.js
import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";

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

  // Calcul des jours (simulé - à remplacer par Firebase)
  const dateDebut = new Date(programData.dateDebut.replace(/\//g, "-"));
  const aujourdhui = new Date();
  const joursEcoules = Math.min(
    programData.duree,
    Math.floor((aujourdhui - dateDebut) / (1000 * 60 * 60 * 24)),
  );
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

  const dateDebutFormatted = formatDate(programData.dateDebut);

  const dateFinObj = new Date(programData.dateDebut.replace(/\//g, "-"));
  dateFinObj.setDate(dateFinObj.getDate() + programData.duree);
  const dateFinFormatted = `${dateFinObj.getDate()} ${dateFinObj.toLocaleDateString("fr-FR", { month: "long" })} ${dateFinObj.getFullYear()}`;

  // Gestion de la sauvegarde du progrès
  const handleSaveProgress = () => {
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
    Alert.alert("تم", "تم تحديث التقدم بنجاح");

    // Ici vous ajouterez la logique pour sauvegarder dans Firebase
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
              <Ionicons name="close" size={24} color="#666" />
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
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* --- Header avec bouton retour --- */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backText}>رجوع</Text>
            <Ionicons name="arrow-forward" size={20} color="white" />
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
            color="#00963F"
          />
          <StatCard
            title="الأحزاب المتبقية"
            value={hizbRestants.toString()}
            icon="clock-outline"
            color="#FFC107"
          />
          <StatCard
            title="الأيام المتبقية"
            value={joursRestants.toString()}
            icon="calendar-clock"
            color="#00963F"
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
                    color="#00963F"
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
                    color="#FFC107"
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
        </View>
      </ScrollView>

      {/* Modal de modification du progrès */}
      <ProgressModal />
    </SafeAreaView>
  );
}

// Composant pour les petites cartes de stats
const StatCard = ({ title, value, icon, color }) => (
  <View style={[styles.card, { borderColor: color, borderLeftWidth: 4 }]}>
    <View style={styles.rowBetween}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <View style={styles.row}>
        <Text style={styles.statTitle}>{title}</Text>
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color="#888"
          style={{ marginLeft: 8 }}
        />
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  header: {
    backgroundColor: "#16A34A",
    height: 100,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  backText: {
    color: "white",
    marginRight: 8,
    fontSize: 16,
    fontWeight: "bold",
  },
  content: {
    padding: 16,
    marginTop: -20,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  mainCard: {
    backgroundColor: "#F0F9F0",
    borderWidth: 1,
    borderColor: "#D0E8D0",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#16A34A",
    marginRight: 10,
  },
  iconCircle: {
    backgroundColor: "#16A34A",
    padding: 10,
    borderRadius: 50,
  },
  headerIcons: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  badgeGreen: {
    borderColor: "#16A34A",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 5,
  },
  badgeYellow: {
    borderColor: "#FFC107",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeTextGreen: {
    color: "#16A34A",
    fontSize: 12,
  },
  badgeTextYellow: {
    color: "#FFC107",
    fontSize: 12,
  },
  statTitle: {
    fontSize: 16,
    color: "#666",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
  },
  sectionCard: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#16A34A",
    textAlign: "right",
  },
  titleRight: {
    alignItems: "flex-end",
  },
  subTitle: {
    fontSize: 12,
    color: "#888",
    textAlign: "right",
  },
  datesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 20,
  },
  dateItem: {
    alignItems: "flex-end",
    flex: 1,
  },
  dateLabel: {
    fontSize: 12,
    color: "#AAA",
    marginBottom: 5,
  },
  dateValue: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#444",
    marginRight: 5,
  },
  dateValueRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dateIcon: {
    marginLeft: 5,
  },
  progressContainer: {
    backgroundColor: "#F0F9F0",
    padding: 12,
    borderRadius: 10,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  progressTitle: {
    color: "#16A34A",
    fontWeight: "bold",
  },
  progressText: {
    color: "#444",
  },
  progressBarFull: {
    height: 8,
    backgroundColor: "#E8E8E8",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#16A34A",
  },
  editButton: {
    backgroundColor: "#16A34A",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  editButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 14,
  },
  currentProgressLabel: {
    fontSize: 14,
    color: "#666",
    textAlign: "right",
    marginTop: 16,
    marginBottom: 4,
  },
  percentageText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#16A34A",
    marginVertical: 8,
    textAlign: "left",
  },
  noteBox: {
    backgroundColor: "#FFF8E7",
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#FFE0B2",
  },
  noteText: {
    color: "#B76E3C",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 20,
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
    borderRadius: 24,
    padding: 24,
    width: width * 0.9,
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#16A34A",
    writingDirection: "rtl",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#666",
    writingDirection: "rtl",
    marginBottom: 20,
  },
  currentProgressContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  currentProgressLabel: {
    fontSize: 15,
    color: "#666",
    writingDirection: "rtl",
  },
  currentProgressValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#16A34A",
  },
  adjustSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  adjustLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#444",
    writingDirection: "rtl",
    marginBottom: 16,
  },
  sliderContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  sliderButton: {
    backgroundColor: "#F0F0F0",
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  sliderButtonText: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#16A34A",
  },
  progressInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 100,
  },
  progressInput: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#16A34A",
    textAlign: "center",
    minWidth: 60,
  },
  percentSymbol: {
    fontSize: 18,
    color: "#666",
    marginLeft: 4,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#16A34A",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  saveButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#F0F0F0",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#666",
    fontWeight: "bold",
    fontSize: 16,
  },
  warningNote: {
    flexDirection: "row",
    backgroundColor: "#FFF8E7",
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#FFE0B2",
  },
  warningIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: "#B76E3C",
    lineHeight: 20,
    writingDirection: "rtl",
  },
});
