import React from "react";
import { View, StyleSheet } from "react-native";
import { colors, radii, shadows } from "../../constants/theme";
import ProfileCardHeader from "./ProfileCardHeader";
import ProfileFieldRow from "./ProfileFieldRow";

/**
 * Carte infos personnelles — en-tête identique à « الحصة / تعديل ».
 * @param {() => void} [onEdit] — si fourni, pastille تعديل (self-view membre)
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
      <ProfileCardHeader
        title="المعلومات الشخصية"
        onAction={onEdit}
        accessibilityLabel="تعديل المعلومات الشخصية"
      />
      <ProfileFieldRow
        icon="mail-outline"
        label="البريد الإلكتروني"
        value={email}
        hideIfEmpty
      />
      <ProfileFieldRow
        icon="male-female-outline"
        label="الجنس"
        value={gender || "—"}
      />
      <ProfileFieldRow
        icon="call-outline"
        label="رقم الهاتف"
        value={phone}
        hideIfEmpty
      />
      <ProfileFieldRow
        icon="school-outline"
        label="المدرسة"
        value={school}
        hideIfEmpty
      />
      <ProfileFieldRow
        icon="bar-chart-outline"
        label="المستوى التعليمي"
        value={level}
        hideIfEmpty
      />
      <ProfileFieldRow
        icon="book-outline"
        label="مقدار الحفظ"
        value={hifzAmount}
        hideIfEmpty
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
  },
});
