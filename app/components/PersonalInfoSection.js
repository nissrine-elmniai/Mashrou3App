import React, { isValidElement } from "react";
import { View, StyleSheet } from "react-native";
import { colors, radii, shadows } from "../constants/theme";
import { formatBirthDateLabel } from "../lib/auth";
import { formatGenderLabel } from "../lib/membersApi";
import ProfileCardHeader from "./profile/ProfileCardHeader";
import ProfileFieldRow from "./profile/ProfileFieldRow";
import { PROFILE_COLUMN_LABELS as L } from "./profile/profileColumnLabels";

/**
 * Section « المعلومات الشخصية » commune (admin, superviseur, membre).
 * `member` est le retour de getMemberProfileFields.
 * Libellés déjà présents dans l'app (الهاتف، المدرسة، المستوى).
 * Valeur vide → « — ». L'action d'édition est fournie par l'écran appelant.
 */
export default function PersonalInfoSection({
  member,
  adminTheme = false,
  editAction = null,
}) {
  const row = member || {};
  const fullName = `${row.firstName || ""} ${row.lastName || ""}`.trim();
  const birthLabel = formatBirthDateLabel(row.dateNaissance);
  const editNode = isValidElement(editAction) ? editAction : null;
  const onEdit = typeof editAction === "function" ? editAction : undefined;

  return (
    <View style={[styles.card, adminTheme ? styles.cardAdmin : shadows.card]}>
      <ProfileCardHeader
        title="المعلومات الشخصية"
        onAction={onEdit}
        action={editNode}
        accessibilityLabel="تعديل المعلومات الشخصية"
      />
      <ProfileFieldRow icon="person-outline" label={L.full_name} value={fullName} />
      <ProfileFieldRow icon="mail-outline" label={L.email} value={row.email} />
      <ProfileFieldRow icon="call-outline" label={L.phone} value={row.telephone} />
      <ProfileFieldRow
        icon="male-female-outline"
        label={L.genre}
        value={formatGenderLabel(row.genre)}
      />
      <ProfileFieldRow
        icon="calendar-outline"
        label={L.date_naissance}
        value={birthLabel}
      />
      <ProfileFieldRow icon="school-outline" label={L.school} value={row.ecole} />
      <ProfileFieldRow icon="bar-chart-outline" label={L.level} value={row.niveau} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
  },
  cardAdmin: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    shadowOpacity: 0,
    elevation: 0,
  },
});
