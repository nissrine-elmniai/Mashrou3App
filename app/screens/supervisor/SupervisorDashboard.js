import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, I18nManager } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../../context/AppContext";
import { colors, radii } from "../../constants/theme";
import { rtlText, rtlTextBold, row, fonts } from "../../constants/rtl";

import SupervisorHomeScreen from "./SupervisorHomeScreen";
import SupervisorMembersScreen from "./SupervisorMembersScreen";
import SupervisorAttendanceScreen from "./SupervisorAttendanceScreen";
import SupervisorProgressScreen from "./SupervisorProgressScreen";
import SupervisorMessagesScreen from "./SupervisorMessagesScreen";

const alignEdge = I18nManager.isRTL ? "flex-start" : "flex-end";

const NAV_TABS = [
  { key: "home", label: "الرئيسية", icon: "home-outline", iconActive: "home" },
  { key: "members", label: "الأعضاء", icon: "people-outline", iconActive: "people" },
  { key: "attendance", label: "الحضور", icon: "checkbox-outline", iconActive: "checkbox" },
  { key: "progress", label: "التقدم", icon: "bar-chart-outline", iconActive: "bar-chart" },
  { key: "messages", label: "الرسائل", icon: "chatbubble-ellipses-outline", iconActive: "chatbubble-ellipses" },
];

/**
 * Conteneur léger : header + bottomBar communs, état `tab` pour basculer entre
 * les 5 écrans supervisor, et `selectedGroupId` partagé entre Home/Members/Attendance
 * (qui ont tous besoin du même groupe actif pour rester cohérents entre onglets).
 */
export default function SupervisorDashboard({ navigation }) {
  const { currentUser, getSupervisorGroups, logout } = useApp();

  const [tab, setTab] = useState("home");
  const [selectedGroupId, setSelectedGroupId] = useState(null);

  const fullName = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : "";
  const myGroups = getSupervisorGroups(currentUser?.id);
  const activeGroup =
    myGroups.find((g) => g.id === selectedGroupId) || myGroups[0] || null;

  useEffect(() => {
    if (!selectedGroupId && myGroups[0]) setSelectedGroupId(myGroups[0].id);
  }, [myGroups, selectedGroupId]);

  const handleLogout = () => {
    logout();
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };

  return (
    <SafeAreaView
      style={[styles.container, { paddingBottom: 16 }]}
      edges={["top", "bottom"]}
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      {tab === "home" && (
        <View style={styles.headerWrap}>
          <View style={styles.headerCard}>
            <View style={styles.headerStart}>
              <Text style={styles.headerGreeting}>مرحباً</Text>
              <Text style={styles.headerName}>{fullName || "المشرف"}</Text>
            </View>
            <View style={styles.headerEnd}>
              <TouchableOpacity style={styles.headerBtn} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={22} color="white" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.profileBtn}>
                <Ionicons name="person-circle-outline" size={24} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <View style={styles.body}>
        {tab === "home" && (
          <SupervisorHomeScreen activeGroup={activeGroup} onChangeTab={setTab} />
        )}
        {tab === "members" && (
          <SupervisorMembersScreen activeGroup={activeGroup} onChangeTab={setTab} />
        )}
        {tab === "attendance" && (
          <SupervisorAttendanceScreen
            myGroups={myGroups}
            activeGroup={activeGroup}
            selectedGroupId={selectedGroupId}
            onSelectGroup={setSelectedGroupId}
          />
        )}
        {tab === "progress" && <SupervisorProgressScreen />}
        {tab === "messages" && <SupervisorMessagesScreen navigation={navigation} />}
      </View>

      <View style={styles.bottomBar}>
        {NAV_TABS.map((t) => {
          const isActive = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={styles.bottomBarItem}
              onPress={() => setTab(t.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isActive ? t.iconActive : t.icon}
                size={22}
                color={isActive ? colors.primary : colors.placeholder}
              />
              <Text style={[styles.bottomBarLabel, isActive && styles.bottomBarLabelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },

  headerWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  headerCard: {
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerStart: { flexDirection: "column", alignItems: alignEdge, flex: 1 },
  headerGreeting: { color: "rgba(255,255,255,0.85)", fontSize: 14, ...rtlText },
  headerName: {
    color: "white",
    fontSize: 20,
    fontFamily: fonts.bold,
    ...rtlTextBold,
    marginTop: 2,
    flexShrink: 1,
  },
  headerEnd: { flexDirection: row, alignItems: "center", gap: 8 },
  headerBtn: { flexDirection: row, alignItems: "center", gap: 6 },
  profileBtn: { padding: 2 },

  bottomBar: {
    flexDirection: row,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bottomBarItem: { flex: 1, paddingVertical: 10, alignItems: "center", gap: 2 },
  bottomBarLabel: { fontSize: 11, color: colors.placeholder, fontFamily: fonts.medium },
  bottomBarLabelActive: { color: colors.primary },
});
