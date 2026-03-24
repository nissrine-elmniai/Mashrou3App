import React from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

export default function MemberDashboardScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A8F3C" />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* HEADER - Vert avec Texte à Droite et Icône à Gauche */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            {/* Gauche: Boutons d'action */}
            <View style={styles.headerLeft}>
              <TouchableOpacity style={styles.headerAction}>
                <Ionicons name="log-out-outline" size={20} color="white" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerAction}>
                <Ionicons name="person-outline" size={20} color="white" />
                <Text style={styles.headerActionText}>الملف الشخصي</Text>
              </TouchableOpacity>
            </View>

            {/* Droite: Titre et Nom */}
            <View style={styles.headerRight}>
              <View style={styles.headerTextContainer}>
                <Text style={styles.headerTitle}>لوحة تحكم العضو</Text>
                <Text style={styles.headerSubtitle}>أمينة بنعلي</Text>
              </View>
              <View style={styles.headerIconCircle}>
                <MaterialCommunityIcons name="book-open-variant" size={24} color="white" />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          {/* STATS - Texte à droite, Chiffre à gauche */}
          <StatCard label="البرامج النشطة" value="2" color="#0A8F3C" />
          <StatCard label="مجموع الأحزاب" value="13" color="#F4B400" isYellow />
          <StatCard label="التقدّم الإجمالي" value="45%" color="#00C853" isProgress />

          {/* SECTION TITRE */}
          <View style={styles.sectionHeader}>
            <TouchableOpacity style={styles.addBtn}>
              <Text style={styles.addBtnText}>برنامج جديد +</Text>
            </TouchableOpacity>
            <Text style={styles.sectionTitle}>برامجي</Text>
          </View>

          {/* CARTE PROGRAMME (Style Image fed22e) */}
          <View style={styles.programCard}>
            <View style={styles.programTopRow}>
              {/* Gauche: Actions (Corbeille / Edit) */}
              <View style={styles.actionIcons}>
                <Ionicons name="trash-outline" size={20} color="#D32F2F" />
                <Ionicons name="create-outline" size={20} color="#3F51B5" style={{ marginLeft: 10 }} />
              </View>
              {/* Droite: Titre et Icône Livre */}
              <View style={styles.programTitleGroup}>
                <Text style={styles.programName}>برنامج جزء عم</Text>
                <MaterialCommunityIcons name="book-open-variant" size={20} color="#0A8F3C" />
              </View>
            </View>

            {/* Badges au milieu à droite */}
            <View style={styles.badgeRow}>
              <View style={styles.badgeYellow}><Text style={styles.badgeTextYellow}>30 يوم</Text></View>
              <View style={styles.badgeGreen}><Text style={styles.badgeTextGreen}>3 أحزاب</Text></View>
            </View>

            {/* Infos alignées à droite */}
            <View style={styles.infoLine}>
              <Text style={styles.infoText}>البداية: 2025/1/1</Text>
              <Ionicons name="calendar-outline" size={16} color="#666" />
            </View>
            <View style={styles.infoLine}>
              <Text style={styles.infoText}>البرنامج منتهي</Text>
              <Ionicons name="time-outline" size={16} color="#666" />
            </View>

            {/* Barre de progression */}
            <View style={styles.progressSection}>
              <View style={styles.progressLabels}>
                <Text style={styles.percentText}>65%</Text>
                <Text style={styles.progressTitle}>التقدم</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: '65%' }]} />
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Composant StatCard pour éviter la répétition
const StatCard = ({ label, value, color, isYellow, isProgress }) => (
  <View style={[styles.statCard, isYellow && styles.yellowBorder]}>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    <View style={styles.statLabelGroup}>
      <Text style={styles.statLabel}>{label}</Text>
      {isProgress && <Ionicons name="trending-up" size={18} color={color} style={{ marginLeft: 5 }} />}
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FBF9" },
  header: {
    backgroundColor: "#0A8F3C",
    height: 160,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  headerContent: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 20 },
  headerLeft: { flexDirection: "row-reverse", alignItems: "center" },
  headerRight: { flexDirection: "row-reverse", alignItems: "center" },
  headerAction: { flexDirection: "row-reverse", alignItems: "center", marginRight: 15 },
  headerActionText: { color: "white", fontSize: 12, marginLeft: 5 },
  headerTextContainer: { alignItems: "flex-end", marginRight: 10 },
  headerTitle: { color: "white", fontSize: 18, fontWeight: "bold" },
  headerSubtitle: { color: "rgba(255,255,255,0.8)", fontSize: 13 },
  headerIconCircle: { width: 45, height: 45, borderRadius: 25, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center" },

  content: { paddingHorizontal: 20, marginTop: -25 },

  // Stats
  statCard: {
    backgroundColor: "white",
    borderRadius: 15,
    padding: 18,
    marginBottom: 12,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    elevation: 3,
    borderWidth: 1,
    borderColor: "#E8F5E9",
  },
  yellowBorder: { borderColor: "#FFF9C4" },
  statLabelGroup: { flexDirection: 'row-reverse', alignItems: 'center' },
  statLabel: { fontSize: 15, color: "#666" },
  statValue: { fontSize: 22, fontWeight: "bold" },

  // Program Section
  sectionHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginVertical: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "bold", color: "#004D40" },
  addBtn: { backgroundColor: "#00C853", paddingHorizontal: 15, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { color: "white", fontWeight: "bold" },

  // Program Card
  programCard: { backgroundColor: "white", borderRadius: 20, padding: 15, elevation: 2, borderWidth: 1, borderColor: "#E8F5E9" },
  programTopRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  programTitleGroup: { flexDirection: 'row-reverse', alignItems: 'center' },
  programName: { fontSize: 16, fontWeight: "bold", color: "#0A8F3C", marginRight: 10 },
  actionIcons: { flexDirection: 'row-reverse' },

  badgeRow: { flexDirection: 'row-reverse', justifyContent: 'flex-end', marginTop: 10, marginBottom: 15 },
  badgeGreen: { borderWidth: 1, borderColor: "#00C853", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeYellow: { borderWidth: 1, borderColor: "#F4B400", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginRight: 8 },
  badgeTextGreen: { color: "#00C853", fontSize: 11, fontWeight: "bold" },
  badgeTextYellow: { color: "#F4B400", fontSize: 11, fontWeight: "bold" },

  infoLine: { flexDirection: 'row-reverse', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 5 },
  infoText: { marginRight: 8, color: '#666', fontSize: 13 },

  progressSection: { marginTop: 15 },
  progressLabels: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 5 },
  percentText: { color: '#00C853', fontWeight: 'bold' },
  progressTitle: { color: '#888', fontSize: 13 },
  progressBarBg: { height: 8, backgroundColor: '#F0F0F0', borderRadius: 10 },
  progressBarFill: { height: '100%', backgroundColor: '#00C853', borderRadius: 10 },
});