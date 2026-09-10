import React from "react";
import { View, StyleSheet } from "react-native";
import { colors, radii, shadows } from "../../constants/theme";
import { formatBirthDateLabel } from "../../lib/auth";
import ProfileCardHeader from "./ProfileCardHeader";
import ProfileFieldRow from "./ProfileFieldRow";
import { PROFILE_COLUMN_LABELS as L } from "./profileColumnLabels";

/**
 * Carte infos personnelles — libellés alignés sur public.profiles.
 * @param {() => void} [onEdit] — si fourni, pastille تعديل (self-view membre)
 */
export default function ProfileInfoCard({
  firstName,
  lastName,
  email,
  gender,
  phone,
  birthDate,
  school,
  level,
  hifzAmount,
  onEdit,
}) {
  const birthLabel = formatBirthDateLabel(birthDate);
  const fullName = `${firstName || ""} ${lastName || ""}`.trim();

  return (
    <View style={[styles.card, shadows.card]}>
      <ProfileCardHeader
        title="المعلومات الشخصية"
        onAction={onEdit}
        accessibilityLabel="تعديل المعلومات الشخصية"
      />
      <ProfileFieldRow
        icon="person-outline"
        label={L.full_name}
        value={fullName}
      />
      <ProfileFieldRow
        icon="mail-outline"
        label={L.email}
        value={email}
        hideIfEmpty
      />
      <ProfileFieldRow
        icon="call-outline"
        label={L.phone}
        value={phone}
        hideIfEmpty
      />
      <ProfileFieldRow
        icon="male-female-outline"
        label={L.genre}
        value={gender || "—"}
      />
      <ProfileFieldRow
        icon="calendar-outline"
        label={L.date_naissance}
        value={birthLabel}
        hideIfEmpty
      />
      <ProfileFieldRow
        icon="school-outline"
        label={L.school}
        value={school}
        hideIfEmpty
      />
      <ProfileFieldRow
        icon="bar-chart-outline"
        label={L.level}
        value={level}
        hideIfEmpty
      />
      <ProfileFieldRow
        icon="book-outline"
        label={L.hifz_amount}
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
