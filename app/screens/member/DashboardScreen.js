// DashboardScreen.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Platform,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import DateTimePicker from "@react-native-community/datetimepicker";

// Données simulées (à remplacer par Firebase plus tard)
const MOCK_DATA = {
  membre: {
    nom: "بتعلي",
    prenom: "أمينة",
    avatar: null,
  },
  stats: {
    programmesActifs: 2,
    totalHizb: 13,
    progressionGlobale: 45,
  },
  programmes: [
    {
      id: "1",
      nom: "برنامج جزء عم",
      duree: 30,
      nbHizb: 3,
      dateDebut: "2025/01/01",
      statut: "termine",
      progression: 100,
    },
    {
      id: "2",
      nom: "برنامج تبارك",
      duree: 45,
      nbHizb: 5,
      dateDebut: "2025/02/15",
      statut: "en_cours",
      progression: 65,
    },
    {
      id: "3",
      nom: "برنامج جزء قد سمع",
      duree: 60,
      nbHizb: 4,
      dateDebut: "2025/03/01",
      statut: "en_cours",
      progression: 30,
    },
  ],
};

export default function DashboardScreen({ navigation }) {
  const [membre, setMembre] = useState(null);
  const [stats, setStats] = useState(null);
  const [programmes, setProgrammes] = useState([]);
  const [loading, setLoading] = useState(true);

  // États pour le modal nouveau programme
  const [modalVisible, setModalVisible] = useState(false);
  const [newProgrammeName, setNewProgrammeName] = useState("");
  const [newProgrammeNbHizb, setNewProgrammeNbHizb] = useState("");

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateText, setDateText] = useState("");

  const formatDate = (date) => {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  useEffect(() => {
    const today = new Date();
    setSelectedDate(today);
    setDateText(formatDate(today));
  }, []);
  useEffect(() => {
    console.log("🟢 Chargement des données simulées");
    setMembre(MOCK_DATA.membre);
    setStats(MOCK_DATA.stats);
    setProgrammes(MOCK_DATA.programmes);
    setLoading(false);
    console.log("🟢 Données chargées, loading = false");
  }, []);

  const onDateChange = (event, date) => {
    setShowDatePicker(Platform.OS === "ios");
    if (date) {
      setSelectedDate(date);
      setDateText(formatDate(date));
    }
  };

  // Fonction pour créer un nouveau programme
  const handleCreateProgramme = () => {
    if (!newProgrammeName || !newProgrammeNbHizb) {
      Alert.alert("خطأ", "الرجاء ملء جميع الخانات");
      return;
    }

    const newProgramme = {
      id: Date.now().toString(),
      nom: newProgrammeName,
      duree: 30,
      nbHizb: parseInt(newProgrammeNbHizb),
      dateDebut: dateText,
      statut: "en_cours",
      progression: 0,
    };

    setProgrammes([...programmes, newProgramme]);
    setNewProgrammeName("");
    setNewProgrammeNbHizb("");

    // 📅 Réinitialiser à la date du jour
    const today = new Date();
    setSelectedDate(today);
    setDateText(formatDate(today));
    setModalVisible(false);

    Alert.alert("نجاح", "تم إنشاء البرنامج بنجاح");
  };

  // Fonction pour obtenir la couleur de progression
  const getProgressColor = (progress) => {
    if (progress >= 80) return "#16A34A";
    if (progress >= 50) return "#EAB308";
    return "#F97316";
  };

  // Fonction pour obtenir le libellé du statut en arabe
  const getStatutLabel = (statut) => {
    switch (statut) {
      case "termine":
        return { text: "منتهي", color: "#9CA3AF" };
      case "en_cours":
        return { text: "قيد الإنجاز", color: "#16A34A" };
      case "a_venir":
        return { text: "قادم", color: "#EAB308" };
      default:
        return { text: statut, color: "#6B7280" };
    }
  };

  // Rendu d'une carte de programme
  const renderProgrammeCard = ({ item }) => {
    const statutInfo = getStatutLabel(item.statut);
    const progressColor = getProgressColor(item.progression);

    return (
      <TouchableOpacity
        style={styles.programmeCard}
        activeOpacity={0.7}
        onPress={() =>
          navigation.navigate("ProgrammeDetails", {
            programme: item,
          })
        }
      >
        <View style={styles.programmeHeader}>
          <Text style={styles.programmeNom}>{item.nom}</Text>
          <View
            style={[
              styles.statutBadge,
              { backgroundColor: statutInfo.color + "20" },
            ]}
          >
            <Text style={[styles.statutText, { color: statutInfo.color }]}>
              {statutInfo.text}
            </Text>
          </View>
        </View>

        <View style={styles.programmeInfos}>
          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>⏱️</Text>
            <Text style={styles.infoText}>{item.duree} يوم</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>📖</Text>
            <Text style={styles.infoText}>{item.nbHizb} أحزاب</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoIcon}>📅</Text>
            <Text style={styles.infoText}>{item.dateDebut}</Text>
          </View>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                {
                  width: `${item.progression}%`,
                  backgroundColor: progressColor,
                },
              ]}
            />
          </View>
          <View style={styles.progressTextContainer}>
            <Text style={styles.progressPercentage}>{item.progression}%</Text>
            <Text style={styles.progressLabel}>التقدم</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.userInfo}>
            <TouchableOpacity
              style={styles.avatarContainer}
              onPress={() => navigation.navigate("Profile")}
              activeOpacity={0.7}
            >
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{membre?.prenom}</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.userTextContainer}>
              <Text style={styles.welcomeText}>لوحة تحكم</Text>
              <Text style={styles.userName}>
                {membre?.prenom || "اسم"} {membre?.nom || "النسب"}
              </Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>العضو</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Cartes de statistiques */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>📋</Text>
            <Text style={styles.statValue}>{stats?.programmesActifs}</Text>
            <Text style={styles.statLabel}>البرامج النشطة</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statIcon}>📚</Text>
            <Text style={styles.statValue}>{stats?.totalHizb}</Text>
            <Text style={styles.statLabel}>مجموع الأحزاب</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statIcon}>📊</Text>
            <Text style={styles.statValue}>{stats?.progressionGlobale}%</Text>
            <Text style={styles.statLabel}>التقدم الإجمالي</Text>
          </View>
        </View>

        {/* Bouton Nouveau Programme */}
        <View style={styles.newProgrammeSection}>
          <TouchableOpacity
            style={styles.newProgrammeButton}
            onPress={() => {
              // 📅 Réinitialiser à la date du jour quand on ouvre le modal
              const today = new Date();
              setSelectedDate(today);
              setDateText(formatDate(today));
              setModalVisible(true);
            }}
          >
            <Text style={styles.newProgrammeIcon}>+</Text>
            <Text style={styles.newProgrammeText}>برنامج جديد</Text>
          </TouchableOpacity>
        </View>

        {/* MODAL NOUVEAU PROGRAMME */}
        <Modal
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* En-tête du modal */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>إنشاء برنامج جديد</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalSubtitle}>
                  حدد برنامج الحفظ المخصص الخاص بك
                </Text>

                {/* Nom du programme */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>اسم البرنامج</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="مثال: برنامج جزء عم"
                    placeholderTextColor="#9CA3AF"
                    value={newProgrammeName}
                    onChangeText={setNewProgrammeName}
                    textAlign="right"
                    writingDirection="rtl"
                  />
                </View>

                {/* Nombre de Hizb */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>عدد الأحزاب</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="مثال: 5"
                    placeholderTextColor="#9CA3AF"
                    value={newProgrammeNbHizb}
                    onChangeText={setNewProgrammeNbHizb}
                    keyboardType="numeric"
                    textAlign="right"
                    writingDirection="rtl"
                  />
                </View>

                {/* 📅 Date de début avec calendrier */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>تاريخ البداية</Text>
                  <TouchableOpacity
                    style={styles.dateInputContainer}
                    onPress={() => setShowDatePicker(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dateInputText}>
                      {dateText || formatDate(new Date())}
                    </Text>
                    <Text style={styles.calendarIcon}>📅</Text>
                  </TouchableOpacity>
                </View>

                {/* 📅 DatePicker */}
                {showDatePicker && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={onDateChange}
                    locale="fr-FR"
                  />
                )}

                {/* Boutons */}
                <View style={styles.modalButtonRow}>
                  <TouchableOpacity
                    style={styles.createButton}
                    onPress={handleCreateProgramme}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.createButtonText}>إنشاء البرنامج</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => setModalVisible(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cancelButtonText}>إلغاء</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Section Programmes */}
        <View style={styles.programmesSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>برامجك الحالية</Text>
            {programmes.length > 3 && (
              <TouchableOpacity
                onPress={() => console.log("Tous les programmes")}
              >
                <Text style={styles.seeAllText}>عرض الكل</Text>
              </TouchableOpacity>
            )}
          </View>

          {programmes.length > 0 ? (
            <View style={styles.programmesList}>
              {programmes.map((programme) => (
                <View key={programme.id}>
                  {renderProgrammeCard({ item: programme })}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>📭</Text>
              <Text style={styles.emptyStateText}>لا توجد برامج حالياً</Text>
              <Text style={styles.emptyStateSubText}>
                ابدأ بإنشاء برنامج جديد لحفظ القرآن
              </Text>
            </View>
          )}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

// AJOUTER CE STYLE
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#6B7280",
  },
  // Header
  header: {
    backgroundColor: "#16A34A",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 20 : 40,
    paddingBottom: 30,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatarPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#EAB308",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "white",
  },
  avatarText: {
    fontSize: 28,
    fontWeight: "bold",
    color: "white",
  },
  userTextContainer: {
    flex: 1,
  },
  welcomeText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    marginBottom: 4,
    writingDirection: "rtl",
  },
  userName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    marginBottom: 6,
    writingDirection: "rtl",
  },
  roleBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  roleText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  // Stats Cards
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: -20,
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    writingDirection: "rtl",
  },
  // New Programme Button
  newProgrammeSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  newProgrammeButton: {
    backgroundColor: "#16A34A",
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  newProgrammeIcon: {
    fontSize: 24,
    color: "white",
    marginRight: 8,
  },
  newProgrammeText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    writingDirection: "rtl",
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    width: "100%",
    maxHeight: "80%",
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
  modalClose: {
    fontSize: 24,
    color: "#9CA3AF",
    padding: 4,
  },
  modalSubtitle: {
    fontSize: 15,
    color: "#6B7280",
    writingDirection: "rtl",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    paddingBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
    writingDirection: "rtl",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1F2937",
    textAlign: "right",
    writingDirection: "rtl",
  },
  dateInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
  },
  dateInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1F2937",
    textAlign: "right",
    writingDirection: "rtl",
  },
  calendarIcon: {
    fontSize: 18,
    marginRight: 16,
    color: "#6B7280",
  },
  modalButtonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 24,
  },
  createButton: {
    backgroundColor: "#16A34A",
    flex: 1,
    marginRight: 10,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  createButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    writingDirection: "rtl",
  },
  cancelButton: {
    backgroundColor: "white",
    flex: 1,
    marginLeft: 10,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cancelButtonText: {
    color: "#6B7280",
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
    writingDirection: "rtl",
  },
  previewContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F2937",
    writingDirection: "rtl",
    marginBottom: 12,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  previewLabel: {
    fontSize: 14,
    color: "#6B7280",
    writingDirection: "rtl",
    marginRight: 8,
  },
  previewValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    writingDirection: "rtl",
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    color: "#6B7280",
    writingDirection: "rtl",
  },
  progressPercentage: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#16A34A",
    writingDirection: "rtl",
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
  },
  // Programmes Section
  programmesSection: {
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2937",
    writingDirection: "rtl",
  },
  seeAllText: {
    fontSize: 14,
    color: "#16A34A",
    fontWeight: "600",
  },
  programmesList: {
    marginBottom: 20,
  },
  programmeCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  programmeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  programmeNom: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F2937",
    writingDirection: "rtl",
  },
  statutBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statutText: {
    fontSize: 12,
    fontWeight: "600",
    writingDirection: "rtl",
  },
  programmeInfos: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#F3F4F6",
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  infoIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  infoText: {
    fontSize: 13,
    color: "#6B7280",
    writingDirection: "rtl",
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 4,
    overflow: "hidden",
    marginRight: 12,
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
  },
  progressTextContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  progressPercentage: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1F2937",
    marginRight: 4,
  },
  progressLabel: {
    fontSize: 12,
    color: "#6B7280",
    writingDirection: "rtl",
  },
  // Empty State
  emptyState: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    marginBottom: 20,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 8,
    writingDirection: "rtl",
  },
  emptyStateSubText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    writingDirection: "rtl",
  },
  bottomPadding: {
    height: 30,
  },
  dateInputText: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1F2937",
    textAlign: "right",
    writingDirection: "rtl",
  },
});
