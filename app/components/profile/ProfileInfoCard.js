import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, fonts, row as rtlRow } from "../../constants/rtl";
import ProfileFieldRow from "./ProfileFieldRow";

/**
 * Carte infos personnelles — pas de titre visible.
 * @param {() => void} [onEdit] — si fourni, affiche le bouton "تعديل"
 */
export default function ProfileInfoCard({
  email,
  gender,
  phone,
  school,
  level,
  hifzAmount,
  onEdit,
}) {
  return (
    <View style={[styles.card, shadows.card]}>
      {onEdit ? (
        <View style={styles.headerRow}>
          <View style={styles.headerSpacer} />
          <TouchableOpacity
            style={styles.editPill}
            onPress={onEdit}
            activeOpacity={0.75}
            accessibilityLabel="تعديل المعلومات الشخصية"
          >
            <Text style={styles.editPillText}>تعديل</Text>
            <Ionicons name="create-outline" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>
      ) : null}
      <ProfileFieldRow icon="mail-outline" label="البريد الإلكتروني" value={email} />
      <ProfileFieldRow
        icon="male-female-outline"
        label="الجنس"
        value={gender || "—"}
      />
      <ProfileFieldRow icon="call-outline" label="رقم الهاتف" value={phone} />
      <ProfileFieldRow icon="school-outline" label="المدرسة" value={school} />
      <ProfileFieldRow
        icon="bar-chart-outline"
        label="المستوى التعليمي"
        value={level}
      />
      <ProfileFieldRow icon="book-outline" label="مقدار الحفظ" value={hifzAmount} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: 16,
  },
  headerRow: {
    flexDirection: rtlRow,
    alignItems: "center",
    marginBottom: 4,
  },
  headerSpacer: {
    flex: 1,
  },
  editPill: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  editPillText: {
    fontSize: 13,
    color: colors.primary,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
});
