import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../../context/AppContext";
import { ROLES, ROLE_LABELS, SEASON_TYPES, userHasRole } from "../../constants/roles";
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
import { sendSupervisorInviteEmail } from "../../utils/sendInviteEmail";
import { APP_EMAIL } from "../../constants/email";
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
    removeSupervisor,
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
    () => users.filter((u) => userHasRole(u, ROLES.SUPERVISOR)),
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
              label={
                stats.pendingRegs > 0
                  ? `طلبات التسجيل (${stats.pendingRegs})`
                  : "طلبات التسجيل"
              }
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
          removeSupervisor={removeSupervisor}
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
  removeSupervisor,
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [groupName, setGroupName] = useState("");
  const [sending, setSending] = useState(false);

  const handleAdd = async () => {
    if (!groupName.trim()) {
      Alert.alert("تنبيه", "أدخل اسم المجموعة المعنية بالمشرف");
      return;
    }

    setSending(true);
    const result = addSupervisor({
      firstName,
      lastName,
      email,
      groupName: groupName.trim(),
    });
    if (!result.ok) {
      setSending(false);
      Alert.alert("خطأ", result.error);
      return;
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const mail = await sendSupervisorInviteEmail({
      toEmail: email.trim(),
      fullName,
      groupName: result.groupName,
    });
    setSending(false);

    if (mail.ok) {
      Alert.alert(
        "تمت الإضافة",
        `تمت إضافة ${fullName} وإرسال الرسالة إلى:\n${email.trim()}`
      );
    } else {
      Alert.alert(
        "تمت الإضافة — فشل إرسال البريد",
        `${mail.error || ""}\n\nأبلغ المشرف أنه يمكنه إنشاء حسابه من التطبيق.`
      );
    }

    setFirstName("");
    setLastName("");
    setEmail("");
    setGroupName("");
  };

  const confirmRemove = (supervisor) => {
    const fullName = `${supervisor.firstName} ${supervisor.lastName}`;
    Alert.alert("حذف المشرف", `هل تريد حذف «${fullName}»؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: () => {
          const result = removeSupervisor(supervisor.id);
          if (!result.ok) {
            Alert.alert("خطأ", result.error);
            return;
          }
          Alert.alert("تم الحذف", "تم حذف المشرف بنجاح");
        },
      },
    ]);
  };

  return (
    <View>
      <SectionCard
        title="إضافة مشرف"
        subtitle="الاسم، البريد الإلكتروني، والمجموعة المكلف بها"
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

        <Text style={styles.fieldLabel}>اسم المجموعة</Text>
        <FormInput
          placeholder="مثال: مجموعة الفجر"
          value={groupName}
          onChangeText={setGroupName}
        />
        <Text style={styles.hintInline}>
          تُحاكى رسالة من بريد التطبيق ({APP_EMAIL.fromEmail}) — بدون إرسال
          حقيقي حالياً. لاحقاً تُربط بالخادم.
        </Text>

        <QuickButton
          color={colors.primary}
          icon="mail-outline"
          label={sending ? "جاري الإرسال..." : "إضافة وإرسال الرسالة"}
          onPress={sending ? undefined : handleAdd}
        />
      </SectionCard>

      <Text style={styles.listTitle}>المشرفون الحاليون</Text>
      {supervisors.length === 0 ? (
        <EmptyState text="لا يوجد مشرفون بعد" />
      ) : (
        supervisors.map((s) => {
          const supervised = getSupervisorGroups(s.id);
          const pending = s.accountStatus === "invited";
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
                pending ? "بانتظار إنشاء الحساب" : "مفعّل",
              ]}
              pill={pending ? "بانتظار التفعيل" : ROLE_LABELS.supervisor}
              trailing={
                <TouchableOpacity
                  onPress={() => confirmRemove(s)}
                  accessibilityLabel="حذف المشرف"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.deleteBtn}
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={colors.red}
                  />
                </TouchableOpacity>
              }
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
  seasonChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: colors.bg,
  },
  seasonChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.soft,
  },
  seasonChipText: { ...rtlText, color: colors.muted },
  seasonChipTextActive: { color: colors.primaryDark, fontWeight: "700" },
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
  deleteBtn: {
    padding: 6,
    justifyContent: "center",
    alignItems: "center",
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
