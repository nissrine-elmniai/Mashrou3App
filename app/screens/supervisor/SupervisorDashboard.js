import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../../context/AppContext";
import { colors } from "../../constants/theme";
import { rtlText, row } from "../../constants/rtl";
import {
  AppShell,
  StatCard,
  SectionCard,
  QuickButton,
  PersonCard,
  EmptyState,
} from "../../components/ui";

const TABS = [
  { key: "home", label: "الرئيسية" },
  { key: "members", label: "الأعضاء" },
  { key: "tools", label: "الأدوات" },
];

export default function SupervisorDashboard({ navigation }) {
  const {
    currentUser,
    getSupervisorGroups,
    getUserById,
    getMemberProgress,
    logout,
    getNotificationsForUser,
    markNotificationRead,
  } = useApp();

  const [tab, setTab] = useState("home");
  const [search, setSearch] = useState("");
  const myGroups = getSupervisorGroups(currentUser?.id);
  const myNotifications = getNotificationsForUser(currentUser);

  const members = useMemo(() => {
    const list = [];
    const seen = new Set();
    myGroups.forEach((g) => {
      g.memberIds.forEach((mid) => {
        if (seen.has(mid)) return;
        seen.add(mid);
        const user = getUserById(mid);
        const prog = getMemberProgress(mid, g.seasonId);
        if (user) list.push({ user, group: g, prog });
      });
    });
    return list.filter((item) => {
      const full = `${item.user.firstName} ${item.user.lastName}`;
      return !search.trim() || full.includes(search.trim());
    });
  }, [myGroups, search, getUserById, getMemberProgress]);

  const programsCount = members.reduce((sum, m) => sum + (m.prog ? 1 : 0), 0);

  const avg =
    members.length === 0
      ? 0
      : Math.round(
          members.reduce((sum, m) => {
            const pct = Math.min(
              100,
              Math.round(
                ((m.prog?.hifzPages || 0) / (m.prog?.targetPages || 1)) * 100
              )
            );
            return sum + pct;
          }, 0) / members.length
        );

  const handleLogout = () => {
    logout();
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };

  const fullName = currentUser
    ? `${currentUser.firstName} ${currentUser.lastName}`
    : "";

  return (
    <AppShell
      title="لوحة تحكم المشرف"
      subtitle={fullName || "إدارة الأعضاء والحضور"}
      icon="shield-checkmark"
      onLogout={handleLogout}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === "home" && (
        <>
          <StatCard
            icon="people"
            iconColor={colors.green}
            borderColor={colors.borderGreen}
            label="إجمالي الأعضاء"
            value={members.length}
            valueColor={colors.green}
          />
          <StatCard
            icon="book-outline"
            iconColor={colors.gold}
            borderColor={colors.borderGold}
            label="إجمالي البرامج"
            value={programsCount || myGroups.length}
            valueColor={colors.gold}
          />
          <StatCard
            icon="trending-up-outline"
            iconColor={colors.primary}
            borderColor={colors.borderBlue}
            label="متوسط التقدم"
            value={`${avg}%`}
            valueColor={colors.primary}
          />

          {myGroups.length === 0 ? (
            <EmptyState text="لا توجد مجموعة مسندة إليك بعد — انتظر تعيين الإدارة" />
          ) : null}

          {myNotifications.length > 0 ? (
            <SectionCard
              title="الإشعارات"
              subtitle="آخر التنبيهات من الإدارة"
            >
              {myNotifications.slice(0, 5).map((n) => (
                <TouchableOpacity
                  key={n.id}
                  style={styles.notifItem}
                  onPress={() => markNotificationRead(n.id)}
                >
                  <Text style={styles.notifTitle}>{n.title}</Text>
                  <Text style={styles.notifBody}>{n.body}</Text>
                </TouchableOpacity>
              ))}
            </SectionCard>
          ) : null}

          <SectionCard
            title="الإجراءات السريعة"
            subtitle="الوصول السريع إلى الوظائف الرئيسية"
          >
            <QuickButton
              color={colors.green}
              icon="calendar-outline"
              label="إدارة الحضور"
              onPress={() => navigation.navigate("Presence")}
            />
            <QuickButton
              color={colors.gold}
              icon="stats-chart-outline"
              label="الإحصائيات"
              onPress={() => navigation.navigate("Statistics")}
            />
            <QuickButton
              color={colors.primary}
              icon="person-add-outline"
              label="إضافة عضو جديد"
              onPress={() => navigation.navigate("AddMember")}
            />
          </SectionCard>
        </>
      )}

      {tab === "members" && (
        <SectionCard
          title="إدارة الأعضاء"
          subtitle="قائمة كاملة بالأعضاء المسجلين"
        >
          <View style={styles.searchWrapper}>
            <Ionicons name="search-outline" size={20} color={colors.primary} />
            <TextInput
              placeholder="البحث عن عضو..."
              placeholderTextColor={colors.placeholder}
              style={styles.searchInput}
              textAlign="right"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {members.length === 0 ? (
            <EmptyState text="لا يوجد أعضاء في مجموعاتك" />
          ) : (
            members.map(({ user, group, prog }) => {
              const pct = Math.min(
                100,
                Math.round(
                  ((prog?.hifzPages || 0) / (prog?.targetPages || 1)) * 100
                )
              );
              return (
                <PersonCard
                  key={`${group.id}_${user.id}`}
                  initials={`${user.firstName?.[0] || ""}${
                    user.lastName?.[0] || ""
                  }`}
                  name={`${user.firstName} ${user.lastName}`}
                  meta={[
                    `${user.gender} • ${user.birthDate}`,
                    `البرامج: ${prog ? 1 : 0} • التقدم: ${pct}%`,
                  ]}
                  trailing={
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate("SupervisorTracking")
                      }
                      style={styles.editBtn}
                    >
                      <Ionicons
                        name="pencil"
                        size={18}
                        color={colors.primary}
                      />
                    </TouchableOpacity>
                  }
                />
              );
            })
          )}
        </SectionCard>
      )}

      {tab === "tools" && (
        <SectionCard
          title="أدوات المشرف"
          subtitle="المتابعة والاختبارات والملف الشخصي"
        >
          <QuickButton
            color={colors.primary}
            icon="book-outline"
            label="متابعة الحفظ والمراجعة"
            onPress={() => navigation.navigate("SupervisorTracking")}
          />
          <QuickButton
            color={colors.green}
            icon="school-outline"
            label="الاختبارات"
            onPress={() => navigation.navigate("SupervisorExams")}
          />
          <QuickButton
            color={colors.teal}
            icon="person-outline"
            label="الملف الشخصي"
            onPress={() => navigation.navigate("SupervisorProfileScreen")}
          />
        </SectionCard>
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  searchWrapper: {
    flexDirection: row,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.borderBlue,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 14,
    backgroundColor: "#F9FAFB",
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    ...rtlText,
  },
  editBtn: { padding: 8 },
  notifItem: {
    borderWidth: 1,
    borderColor: colors.borderGreen,
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  notifTitle: {
    ...rtlText,
    fontWeight: "bold",
    color: colors.primary,
    marginBottom: 4,
  },
  notifBody: { ...rtlText, color: colors.muted, fontSize: 13 },
});
