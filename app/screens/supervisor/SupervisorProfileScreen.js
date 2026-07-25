import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useApp } from "../../context/AppContext";
import { ROLE_LABELS } from "../../constants/roles";
import {
  AppShell,
  SectionCard,
  QuickButton,
} from "../../components/ui";
import { colors } from "../../constants/theme";
import { rtlText, row } from "../../constants/rtl";

export default function SupervisorProfileScreen({ navigation }) {
  const { currentUser, logout, getSupervisorGroups } = useApp();
  const groups = getSupervisorGroups(currentUser?.id);
  const fullName = currentUser
    ? `${currentUser.firstName} ${currentUser.lastName}`
    : "";

  const handleLogout = () => {
    logout();
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };

  return (
    <AppShell
      title="الملف الشخصي"
      subtitle="معلومات المشرف"
      icon="person"
      onBack={() => navigation.goBack()}
      onLogout={handleLogout}
    >
      <SectionCard title="المعلومات الشخصية" subtitle={ROLE_LABELS[currentUser?.role] || "مسؤول فرعي"}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {currentUser?.firstName?.[0] || "م"}
            {currentUser?.lastName?.[0] || ""}
          </Text>
        </View>
        <Text style={styles.name}>{fullName}</Text>

        <InfoRow label="الاسم الكامل" value={fullName} />
        <InfoRow label="تاريخ الميلاد" value={currentUser?.birthDate || "—"} />
        <InfoRow label="البريد" value={currentUser?.email || "—"} />
        <InfoRow
          label="المجموعات"
          value={groups.map((g) => g.name).join("، ") || "—"}
        />

        <QuickButton
          color={colors.red}
          icon="log-out-outline"
          label="تسجيل الخروج"
          onPress={handleLogout}
        />
      </SectionCard>
    </AppShell>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoValue}>{value}</Text>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  avatarText: { color: "white", fontWeight: "bold", fontSize: 22 },
  name: {
    textAlign: "center",
    fontSize: 20,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: 16,
    ...rtlText,
  },
  infoRow: {
    width: "100%",
    flexDirection: row,
    justifyContent: "space-between",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  infoLabel: { color: colors.muted, ...rtlText },
  infoValue: { fontWeight: "600", color: colors.text, ...rtlText, maxWidth: "60%" },
});
