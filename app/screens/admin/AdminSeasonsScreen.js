import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../../context/AppContext";
import {
  AppShell,
  SectionCard,
  QuickButton,
  FormInput,
  EmptyState,
  SoftButton,
} from "../../components/ui";
import { SEASON_TYPES } from "../../constants/roles";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, row } from "../../constants/rtl";

export default function AdminSeasonsScreen({ navigation }) {
  const {
    seasons,
    createSeason,
    setRegistrationOpen,
    activateSeason,
    announceRegistrationForm,
  } = useApp();

  const regularSeasons = useMemo(
    () => seasons.filter((s) => s.type === SEASON_TYPES.REGULAR),
    [seasons]
  );

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [announceNow, setAnnounceNow] = useState(true);

  const handleCreateAndAnnounce = () => {
    if (!name || !startDate || !endDate) {
      Alert.alert("تنبيه", "املأ جميع الحقول");
      return;
    }
    const season = createSeason({
      name,
      type: SEASON_TYPES.REGULAR,
      startDate,
      endDate,
      remote: false,
      openRegistration: announceNow,
      activate: announceNow,
    });
    setName("");
    setStartDate("");
    setEndDate("");
    Alert.alert(
      announceNow ? "تم إعلان الاستمارة" : "تم إنشاء الموسم",
      announceNow
        ? `تم إنشاء «${season.name}» وفتح استمارة التسجيل.\nيمكن للمنخرطين الجدد ملء الاستمارة من لوحة العضو.`
        : `تم إنشاء «${season.name}». يمكنك لاحقاً إعلان استمارة التسجيل للأعضاء.`
    );
  };

  const handleAnnounce = (seasonId, seasonName) => {
    const result = announceRegistrationForm(seasonId);
    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }
    Alert.alert(
      "تم إعلان الاستمارة",
      `استمارة «${seasonName}» مفتوحة الآن.\nسجّل المنخرطون الجدد عبر ملء الاستمارة في التطبيق.`
    );
  };

  const toggleRegistration = (season) => {
    if (season.registrationOpen) {
      setRegistrationOpen(season.id, false);
      Alert.alert("تم", "تم إغلاق استمارة التسجيل");
    } else {
      handleAnnounce(season.id, season.name);
    }
  };

  return (
    <AppShell
      title="إدارة المواسم العادية"
      subtitle="إعلان استمارة التسجيل للمنخرطين الجدد"
      icon="calendar"
      onBack={() => navigation.goBack()}
    >
      <SectionCard
        title="إعلان موسم دراسي جديد"
        subtitle="إنشاء الموسم وفتح استمارة التسجيل"
      >
        <Text style={styles.label}>اسم الموسم</Text>
        <FormInput
          value={name}
          onChangeText={setName}
          placeholder="مثلاً: موسم 2026-2027"
        />
        <Text style={styles.label}>تاريخ البداية</Text>
        <FormInput
          value={startDate}
          onChangeText={setStartDate}
          placeholder="2026/09/01"
        />
        <Text style={styles.label}>تاريخ النهاية</Text>
        <FormInput
          value={endDate}
          onChangeText={setEndDate}
          placeholder="2027/06/30"
        />
        <SoftButton
          label={
            announceNow
              ? "✓ فتح الاستمارة فوراً للأعضاء"
              : "فتح الاستمارة فوراً للأعضاء"
          }
          active={announceNow}
          onPress={() => setAnnounceNow((v) => !v)}
        />
        <QuickButton
          color={colors.primary}
          icon="megaphone-outline"
          label="إنشاء الموسم وإعلان الاستمارة"
          onPress={handleCreateAndAnnounce}
        />
      </SectionCard>

      <Text style={styles.listTitle}>المواسم العادية</Text>
      {regularSeasons.length === 0 ? (
        <EmptyState text="لا توجد مواسم عادية بعد" />
      ) : (
        regularSeasons.map((season) => (
          <View key={season.id} style={styles.seasonCard}>
            <View style={styles.cardTop}>
              <View style={styles.cardInfo}>
                <Text style={styles.seasonName} numberOfLines={2}>
                  {season.name}
                </Text>
                <Text style={styles.dates}>
                  {season.startDate} → {season.endDate}
                </Text>
                <View style={styles.badges}>
                  {season.active ? (
                    <View style={[styles.badge, styles.badgeActive]}>
                      <Text style={styles.badgeTextActive}>نشط</Text>
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.badge,
                      season.registrationOpen
                        ? styles.badgeOpen
                        : styles.badgeClosed,
                    ]}
                  >
                    <Text
                      style={
                        season.registrationOpen
                          ? styles.badgeTextOpen
                          : styles.badgeTextClosed
                      }
                    >
                      {season.registrationOpen
                        ? "الاستمارة مفتوحة"
                        : "الاستمارة مغلقة"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.actionChip}
                onPress={() => toggleRegistration(season)}
              >
                <Ionicons
                  name={
                    season.registrationOpen
                      ? "close-circle-outline"
                      : "megaphone-outline"
                  }
                  size={18}
                  color={
                    season.registrationOpen ? colors.orange : colors.primary
                  }
                />
                <Text
                  style={[
                    styles.actionLabel,
                    {
                      color: season.registrationOpen
                        ? colors.orange
                        : colors.primary,
                    },
                  ]}
                >
                  {season.registrationOpen ? "إغلاق الاستمارة" : "فتح الاستمارة"}
                </Text>
              </TouchableOpacity>

              {!season.active ? (
                <TouchableOpacity
                  style={styles.actionChip}
                  onPress={() => activateSeason(season.id)}
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={18}
                    color={colors.teal}
                  />
                  <Text style={[styles.actionLabel, { color: colors.teal }]}>
                    تفعيل الموسم
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.actionChip}
                onPress={() =>
                  navigation.navigate("AdminRegistrations", {
                    seasonType: SEASON_TYPES.REGULAR,
                  })
                }
              >
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color={colors.gold}
                />
                <Text style={[styles.actionLabel, { color: colors.gold }]}>
                  طلبات التسجيل
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionChip}
                onPress={() =>
                  navigation.navigate("AdminGroups", {
                    seasonType: SEASON_TYPES.REGULAR,
                  })
                }
              >
                <Ionicons
                  name="people-outline"
                  size={18}
                  color={colors.primaryDark}
                />
                <Text
                  style={[styles.actionLabel, { color: colors.primaryDark }]}
                >
                  المجموعات
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  label: { ...rtlText, marginBottom: 6, color: colors.muted },
  listTitle: {
    fontSize: 17,
    fontWeight: "bold",
    ...rtlText,
    color: colors.text,
    marginBottom: 12,
    marginTop: 8,
  },
  seasonCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    ...shadows.card,
  },
  cardTop: {
    marginBottom: 10,
  },
  cardInfo: {
    flex: 1,
  },
  seasonName: {
    ...rtlText,
    fontSize: 16,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 4,
    lineHeight: 24,
  },
  dates: {
    ...rtlText,
    fontSize: 13,
    color: colors.muted,
    marginBottom: 8,
  },
  badges: {
    flexDirection: row,
    flexWrap: "wrap",
    alignItems: "center",
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginStart: 6,
    marginBottom: 4,
    borderWidth: 1,
  },
  badgeActive: {
    backgroundColor: colors.soft,
    borderColor: colors.borderGreen,
  },
  badgeOpen: {
    backgroundColor: "#ECFDF5",
    borderColor: colors.borderGreen,
  },
  badgeClosed: {
    backgroundColor: "#F3F4F6",
    borderColor: colors.border,
  },
  badgeTextActive: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  badgeTextOpen: {
    color: colors.green || colors.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  badgeTextClosed: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: row,
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  actionChip: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 0,
  },
  actionLabel: {
    textAlign: "center",
    writingDirection: "rtl",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 4,
  },
});
