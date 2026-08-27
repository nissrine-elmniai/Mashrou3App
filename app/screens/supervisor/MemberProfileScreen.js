import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, rtlTextBold, row, fonts, arrowBack } from "../../constants/rtl";
import { initials } from "./supervisorHelpers";

function ProfileRow({ icon, label, value }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}


/** Lecture seule : profil d'un membre, ouvert depuis SupervisorMembersScreen (clic nom/avatar).
 * Tous les champs affichés viennent directement des tables users/membres/inscriptions/seances
 * telles que sélectionnées par membersApi.js#getSeanceMembers — aucun champ recalculé/inventé. */
export default function MemberProfileScreen({ navigation, route }) {
  const {
    firstName,
    lastName,
    email,
    phone,
    birthDate,
    groupName,
    groupSchedule,
    registrationDate,
  } = route.params || {};
  const fullName = `${firstName || ""} ${lastName || ""}`.trim() || "عضو";
  const registrationDateOnly = registrationDate ? registrationDate.slice(0, 10) : null;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name={arrowBack} size={22} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الملف الشخصي</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarBlock}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(firstName)}</Text>
          </View>
          <Text style={styles.name}>{fullName}</Text>
        </View>

        <View style={[styles.card, shadows.card]}>
          <ProfileRow icon="mail-outline" label="البريد الإلكتروني" value={email} />
          <ProfileRow icon="call-outline" label="رقم الهاتف" value={phone} />
          <ProfileRow icon="calendar-outline" label="تاريخ الميلاد" value={birthDate} />
        </View>

        <View style={[styles.card, shadows.card, styles.cardSpacing]}>
          <ProfileRow icon="people-outline" label="الحصة" value={groupName} />
          <ProfileRow icon="time-outline" label="التوقيت" value={groupSchedule} />
        
          <ProfileRow icon="calendar-clear-outline" label="تاريخ التسجيل" value={registrationDateOnly} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },

  header: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.primary,
  },
  backBtn: { padding: 2 },
  headerTitle: { color: "white", fontSize: 18, fontFamily: fonts.bold, ...rtlTextBold },

  avatarBlock: { alignItems: "center", marginBottom: 20 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primarySoft,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  avatarText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 26 },
  name: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, ...rtlTextBold },

  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
  },
  cardSpacing: { marginTop: 14 },
  row: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  rowTextWrap: { flex: 1 },
  rowLabel: { fontSize: 12, color: colors.muted, fontFamily: fonts.regular, ...rtlText },
  rowValue: { fontSize: 15, color: colors.text, fontFamily: fonts.semiBold, marginTop: 2, ...rtlText },
});
