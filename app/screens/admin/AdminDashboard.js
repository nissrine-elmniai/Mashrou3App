import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  TouchableOpacity,
} from "react-native";
import { useApp } from "../../context/AppContext";
import { ROLES, ROLE_LABELS, SEASON_TYPES } from "../../constants/roles";
import { colors } from "../../constants/theme";
import { rtlText, arrowBack, textAlignStart } from "../../constants/rtl";
import {
  AppShell,
  StatCard,
  SectionCard,
  QuickButton,
  PersonCard,
  FormInput,
  EmptyState,
} from "../../components/ui";
const TABS = [
  { key: "home", label: "الرئيسية" },
  { key: "supervisors", label: "المشرفين" },
  { key: "exams", label: "الاختبارات" },
];

export default function AdminDashboard({ navigation }) {
  const {
    stats,
    exams,
    users,
    seasons,
    logout,
    addSupervisor,
    getSupervisorGroups,
    sendAlert,
    getNotificationsForUser,
    markNotificationRead,
    currentUser,
  } = useApp();

  const myNotifications = getNotificationsForUser(currentUser);

  const [tab, setTab] = useState("home");
  const [alertText, setAlertText] = useState("");

  const supervisors = useMemo(
    () => users.filter((u) => u.role === ROLES.SUPERVISOR),
    [users]
  );

  const handleLogout = () => {
    logout();
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };

  const handleSendAlert = () => {
    const result = sendAlert(alertText);
    if (!result.ok) {
      Alert.alert("تنبيه", result.error);
      return;
    }
    Alert.alert("تم الإرسال", "تم حفظ التنبيه وإرساله للأعضاء والمشرفين");
    setAlertText("");
    setTab("home");
  };

  return (
    <AppShell
      title="لوحة تحكم الإدارة"
      subtitle="إدارة المشرفين والاختبارات"
      icon="shield"
      onLogout={handleLogout}
      tabs={TABS}
      activeTab={tab === "alert" ? "home" : tab}
      onTabChange={setTab}
    >
      {tab === "home" && (
        <>
          <StatCard
            icon="people"
            iconColor={colors.primary}
            borderColor={colors.borderBlue}
            label="إجمالي المشرفين"
            value={supervisors.length}
            valueColor={colors.primary}
          />
          <StatCard
            icon="person-outline"
            iconColor={colors.green}
            borderColor={colors.borderGreen}
            label="إجمالي الأعضاء"
            value={stats.members}
            valueColor={colors.green}
          />
          <StatCard
            icon="document-text-outline"
            iconColor={colors.gold}
            borderColor={colors.borderGold}
            label="طلبات التسجيل المعلقة"
            value={stats.pendingRegs}
            valueColor={colors.gold}
          />

          {seasons.length === 0 ? (
            <EmptyState text="ابدأ بإنشاء موسم أو مدرسة صيفية ثم أعلن استمارة التسجيل" />
          ) : null}

          {myNotifications.length > 0 ? (
            <SectionCard
              title="الإشعارات"
              subtitle="آخر الطلبات والتنبيهات"
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
              color={colors.primary}
              icon="people"
              label="إدارة المشرفين"
              onPress={() => setTab("supervisors")}
            />
            <QuickButton
              color={colors.gold}
              icon="clipboard-outline"
              label="إدارة الاختبارات"
              onPress={() => setTab("exams")}
            />
            <QuickButton
              color={colors.orange}
              icon="warning-outline"
              label="إرسال تنبيه"
              onPress={() => setTab("alert")}
            />
          </SectionCard>

          <SectionCard
            title="إدارة المشروع"
            subtitle="المواسم والمدرسة الصيفية والمجموعات"
          >
            <QuickButton
              color={colors.primary}
              icon="calendar-outline"
              label="المواسم العادية"
              onPress={() => navigation.navigate("AdminSeasons")}
            />
            <QuickButton
              color={colors.gold}
              icon="sunny-outline"
              label="المدرسة الصيفية"
              onPress={() => navigation.navigate("AdminSummerSchool")}
            />
            <QuickButton
              color={colors.primaryDark}
              icon="document-text-outline"
              label="طلبات التسجيل"
              onPress={() =>
                navigation.navigate("AdminRegistrations", {
                  seasonType: SEASON_TYPES.REGULAR,
                })
              }
            />
            <QuickButton
              color={colors.teal}
              icon="people-outline"
              label="إدارة المجموعات"
              onPress={() =>
                navigation.navigate("AdminGroups", {
                  seasonType: SEASON_TYPES.REGULAR,
                })
              }
            />
            <QuickButton
              color={colors.primary}
              icon="stats-chart-outline"
              label="الإحصائيات والتقارير"
              onPress={() => navigation.navigate("AdminStats")}
            />
          </SectionCard>
        </>
      )}

      {tab === "supervisors" && (
        <SupervisorsTab
          supervisors={supervisors}
          getSupervisorGroups={getSupervisorGroups}
          addSupervisor={addSupervisor}
        />
      )}

      {tab === "exams" && <ExamsTab exams={exams} users={users} />}

      {tab === "alert" && (
        <SectionCard
          title="إرسال تنبيه"
          subtitle="سيتم إرسال التنبيه إلى المشرفين والأعضاء"
          borderColor="#FFE0B2"
        >
          <TextInput
            style={styles.alertInput}
            placeholder="اكتب نص التنبيه هنا..."
              placeholderTextColor={colors.placeholder}
            value={alertText}
            onChangeText={setAlertText}
            multiline
            textAlign={textAlignStart}
          />
            <QuickButton
              color={colors.orange}
              icon="send"
              label="إرسال التنبيه الآن"
              onPress={handleSendAlert}
            />
            <QuickButton
              color={colors.primaryDark}
              icon={arrowBack}
              label="رجوع للرئيسية"
              onPress={() => setTab("home")}
            />
        </SectionCard>
      )}
    </AppShell>
  );
}

function SupervisorsTab({
  supervisors,
  getSupervisorGroups,
  addSupervisor,
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("123456");
  const [groupName, setGroupName] = useState("");

  const handleAdd = () => {
    if (!groupName.trim()) {
      Alert.alert("تنبيه", "أدخل اسم المجموعة المعنية بالمشرف");
      return;
    }

    const result = addSupervisor({
      firstName,
      lastName,
      email,
      password,
      groupName: groupName.trim(),
    });
    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }
    Alert.alert(
      "تم",
      result.created
        ? `تم إنشاء المجموعة «${result.group?.name}» وربطها بالمشرف`
        : `تمت إضافة المشرف وتعيينه على المجموعة: ${result.group?.name || "—"}`
    );
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("123456");
    setGroupName("");
  };

  return (
    <View>
      <SectionCard
        title="إضافة مشرف"
        subtitle="اكتب اسم المجموعة — تُربط إن وُجدت أو تُنشأ تلقائياً"
      >
        <FormInput
          placeholder="الاسم"
          value={firstName}
          onChangeText={setFirstName}
        />
        <FormInput
          placeholder="اللقب"
          value={lastName}
          onChangeText={setLastName}
        />
        <FormInput
          placeholder="البريد الإلكتروني"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <FormInput
          placeholder="كلمة المرور"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Text style={styles.fieldLabel}>اسم المجموعة</Text>
        <FormInput
          placeholder="مثال: مجموعة الفجر"
          value={groupName}
          onChangeText={setGroupName}
        />
        <Text style={styles.hintInline}>
          إذا كان الاسم موجوداً يُربط بالمشرف، وإلا تُنشأ مجموعة جديدة تلقائياً
        </Text>

        <QuickButton
          color={colors.primary}
          icon="person-add-outline"
          label="إضافة المشرف وربطه بالمجموعة"
          onPress={handleAdd}
        />
      </SectionCard>

      <Text style={styles.listTitle}>المشرفون الحاليون</Text>
      {supervisors.length === 0 ? (
        <EmptyState text="لا يوجد مشرفون بعد" />
      ) : (
        supervisors.map((s) => {
          const supervised = getSupervisorGroups(s.id);
          return (
            <PersonCard
              key={s.id}
              initials={`${s.firstName?.[0] || ""}${s.lastName?.[0] || ""}`}
              name={`${s.firstName} ${s.lastName}`}
              meta={[
                s.email,
                `المجموعات: ${
                  supervised.map((g) => g.name).join("، ") || "—"
                }`,
              ]}
              pill={ROLE_LABELS.supervisor}
            />
          );
        })
      )}
    </View>
  );
}

function ExamsTab({ exams, users }) {
  const getUser = (id) => users.find((u) => u.id === id);

  return (
    <View>
      <Text style={styles.listTitle}>الاختبارات المسجّلة</Text>
      {exams.length === 0 ? (
        <EmptyState text="لا توجد اختبارات بعد" />
      ) : (
        exams.map((e) => {
          const user = getUser(e.memberId);
          return (
            <StatCard
              key={e.id}
              icon="school-outline"
              iconColor={colors.gold}
              borderColor={colors.borderGold}
              label={
                user
                  ? `${user.firstName} ${user.lastName} • ${e.level}`
                  : e.level
              }
              value={e.score}
              valueColor={colors.gold}
            />
          );
        })
      )}
      <Text style={styles.hint}>
        يسجّل المسؤولون الفرعيون نتائج الاختبارات من لوحاتهم، وتظهر هنا للإدارة.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  listTitle: {
    fontSize: 17,
    fontWeight: "bold",
    ...rtlText,
    color: colors.text,
    marginBottom: 12,
    marginTop: 4,
  },
  fieldLabel: {
    ...rtlText,
    color: colors.muted,
    marginTop: 8,
    marginBottom: 6,
    fontWeight: "600",
  },
  hintInline: {
    ...rtlText,
    color: colors.orange,
    marginBottom: 10,
    lineHeight: 20,
  },
  alertInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    minHeight: 110,
    backgroundColor: "#F9FAFB",
    marginBottom: 12,
    textAlignVertical: "top",
    fontSize: 15,
    ...rtlText,
  },
  hint: {
    textAlign: "center",
    color: "#9CA3AF",
    marginTop: 8,
    lineHeight: 20,
  },
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
