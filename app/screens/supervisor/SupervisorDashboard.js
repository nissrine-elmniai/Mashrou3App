import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  I18nManager,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../../context/AppContext";
import { colors, radii } from "../../constants/theme";
import { rtlText, rtlTextBold, row, fonts } from "../../constants/rtl";
import {
  useSupervisorMembers,
  SUPERVISOR_FETCH_DEGRADED_MESSAGE,
} from "./hooks/useSupervisorMembers";
import { getUnacknowledgedAlerts, subscribeToNewAlerts } from "../../lib/alertsApi";

import SupervisorHomeScreen from "./SupervisorHomeScreen";
import SupervisorMembersScreen from "./SupervisorMembersScreen";
import SupervisorAttendanceScreen from "./SupervisorAttendanceScreen";
import SupervisorProgressScreen from "./SupervisorProgressScreen";
import SupervisorMessagesScreen from "./SupervisorMessagesScreen";
import {
  registerSupervisorAttendanceSaved,
  unregisterSupervisorAttendanceSaved,
} from "./supervisorAttendanceBridge";

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
 * les 5 écrans supervisor. Un seul appel useSupervisorMembers() pour toute la zone.
 */
export default function SupervisorDashboard({ navigation }) {
  const { currentUser, logout } = useApp();

  const [tab, setTab] = useState("home");
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [pendingAlertCount, setPendingAlertCount] = useState(0);

  const {
    myGroups,
    activeGroup,
    members,
    membersWithStatus,
    attendancePct,
    avgProgress,
    isMarkingWindowOpen,
    showPresenceReminder,
    loading,
    fetchError,
    dataSource,
    refetch,
  } = useSupervisorMembers(selectedGroupId);

  const fullName = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : "";

  useEffect(() => {
    if (!selectedGroupId && myGroups[0]) {
      setSelectedGroupId(myGroups[0].id);
    }
  }, [myGroups, selectedGroupId]);

  useEffect(() => {
    if (
      selectedGroupId &&
      myGroups.length > 0 &&
      !myGroups.some((g) => g.id === selectedGroupId)
    ) {
      setSelectedGroupId(myGroups[0].id);
    }
  }, [myGroups, selectedGroupId]);

  const handleLogout = () => {
    Alert.alert("تسجيل الخروج", "هل تريد تسجيل الخروج من الحساب؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "خروج",
        style: "destructive",
        onPress: async () => {
          await logout();
          navigation.reset({ index: 0, routes: [{ name: "Login" }] });
        },
      },
    ]);
  };

  const showDegradedBanner = !!fetchError;
  const degradedMessage = SUPERVISOR_FETCH_DEGRADED_MESSAGE;

  // Compte non-acquitté centralisé (RG9) : absence de alert_acknowledgments.alert_id.
  const loadPendingAlertCount = useCallback(async () => {
    const res = await getUnacknowledgedAlerts();
    if (res.ok) setPendingAlertCount(res.alerts.length);
  }, []);

  useEffect(() => {
    loadPendingAlertCount();
    return subscribeToNewAlerts(() => loadPendingAlertCount());
  }, [loadPendingAlertCount]);

  useFocusEffect(
    useCallback(() => {
      loadPendingAlertCount();
    }, [loadPendingAlertCount])
  );

  useEffect(() => {
    registerSupervisorAttendanceSaved(refetch);
    return () => unregisterSupervisorAttendanceSaved();
  }, [refetch]);

  const openAlerts = () => navigation.navigate("SupervisorAlerts");

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
              <TouchableOpacity
                style={styles.headerIconWrap}
                onPress={openAlerts}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="تنبيهات الإدارة"
              >
                <Ionicons name="notifications-outline" size={22} color="white" />
                {pendingAlertCount > 0 ? (
                  <View style={styles.headerBellBadge}>
                    <Text style={styles.headerBellBadgeText}>
                      {pendingAlertCount > 9 ? "9+" : pendingAlertCount}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.profileBtn}
                onPress={() => navigation.navigate("SupervisorProfile")}
                activeOpacity={0.7}
              >
                <Ionicons name="person-circle-outline" size={24} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {showDegradedBanner ? (
        <View style={styles.degradedBanner}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.gold} />
          <Text style={styles.degradedBannerText}>{degradedMessage}</Text>
        </View>
      ) : null}

      <View style={styles.body}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            {tab === "home" && (
              <SupervisorHomeScreen
                activeGroup={activeGroup}
                members={members}
                attendancePct={attendancePct}
                avgProgress={avgProgress}
                isMarkingWindowOpen={isMarkingWindowOpen}
                showPresenceReminder={showPresenceReminder}
                onChangeTab={setTab}
              />
            )}
            {tab === "members" && (
              <SupervisorMembersScreen membersWithStatus={membersWithStatus} />
            )}
            {tab === "attendance" && (
              <SupervisorAttendanceScreen
                myGroups={dataSource === "supabase" ? myGroups : []}
                activeGroup={dataSource === "supabase" ? activeGroup : null}
                selectedGroupId={selectedGroupId}
                onSelectGroup={setSelectedGroupId}
                members={dataSource === "supabase" ? members : []}
                usingSupabase={dataSource === "supabase"}
              />
            )}
            {tab === "progress" && (
              <SupervisorProgressScreen members={members} />
            )}
            {tab === "messages" && (
              <SupervisorMessagesScreen navigation={navigation} />
            )}
          </>
        )}
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

  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  degradedBanner: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  degradedBannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 20,
    ...rtlText,
  },

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
  headerEnd: { flexDirection: row, alignItems: "center", gap: 8, marginTop: -6 },
  headerBtn: { flexDirection: row, alignItems: "center", gap: 6 },
  headerIconWrap: { position: "relative", padding: 2 },
  headerBellBadge: {
    position: "absolute",
    top: -4,
    left: -6,
    backgroundColor: colors.red,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  headerBellBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: fonts.bold,
  },
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
