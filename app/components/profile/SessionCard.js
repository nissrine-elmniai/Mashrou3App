import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { colors, radii, shadows } from "../../constants/theme";
import ProfileFieldRow from "./ProfileFieldRow";
import ProfileCardHeader from "./ProfileCardHeader";

/**
 * Formate "الأربعاء 23:00" ou raw jour+heure → "الأربعاء — 23:00".
 */
export function formatSessionSchedule(scheduleOrJour, heureDebut) {
  if (scheduleOrJour && heureDebut) {
    const heure = String(heureDebut).slice(0, 5);
    return `${String(scheduleOrJour).trim()} — ${heure}`;
  }
  const raw = String(scheduleOrJour || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\S+)\s+(\d{1,2}:\d{2})(?:\s*-\s*\d{1,2}:\d{2})?/);
  if (match) return `${match[1]} — ${match[2]}`;
  return raw.includes("—") ? raw : raw.replace(/\s+/, " — ");
}

/**
 * Carte الحصة — lecture seule.
 * Les infos de séance sont gérées par le superviseur uniquement.
 */
export default function SessionCard({
  groupName,
  jour,
  heureDebut,
  groupSchedule,
  registrationDate,
}) {
  const scheduleLabel = useMemo(() => {
    if (jour || heureDebut) return formatSessionSchedule(jour, heureDebut);
    return formatSessionSchedule(groupSchedule);
  }, [jour, heureDebut, groupSchedule]);

  const registrationDateOnly = registrationDate
    ? String(registrationDate).slice(0, 10)
    : null;

  return (
    <View style={[styles.card, shadows.card]}>
      <ProfileCardHeader title="الحصة" />
      <ProfileFieldRow icon="people-outline" label="الحصة" value={groupName || "—"} />
      <ProfileFieldRow icon="time-outline" label="التوقيت" value={scheduleLabel} hideIfEmpty />
      <ProfileFieldRow
        icon="calendar-clear-outline"
        label="تاريخ التسجيل"
        value={registrationDateOnly}
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
