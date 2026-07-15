import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
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
import { colors } from "../../constants/theme";
import { rtlText } from "../../constants/rtl";

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

  return (
    <AppShell
      title="إدارة المواسم العادية"
      subtitle="إعلان استمارة التسجيل للمنخرطين الجدد"
      icon="calendar"
      onBack={() => navigation.goBack()}
    >
      <SectionCard
        title="إعلان موسم دراسي جديد"
        subtitle="إنشاء الموسم وفتح استمارة التسجيل التي يملأها المنخرطون الجدد"
      >
        <Text style={styles.info}>
          عند الإعلان يُفتح نموذج التسجيل في لوحة العضو، فيختار المنخرط
          أوقات فراغه ويرسل الطلب لقبول الإدارة.
        </Text>
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
          <SectionCard key={season.id} title={season.name}>
            <Text style={styles.meta}>
              حضوري في المسجد{season.active ? " • نشط" : ""}
              {season.registrationOpen ? " • الاستمارة مفتوحة" : " • الاستمارة مغلقة"}
            </Text>
            <Text style={styles.meta}>
              {season.startDate} → {season.endDate}
            </Text>

            {!season.registrationOpen ? (
              <QuickButton
                color={colors.primary}
                icon="megaphone-outline"
                label="إعلان استمارة التسجيل للمنخرطين"
                onPress={() => handleAnnounce(season.id, season.name)}
              />
            ) : (
              <QuickButton
                color={colors.orange}
                icon="close-circle-outline"
                label="إغلاق استمارة التسجيل"
                onPress={() => {
                  setRegistrationOpen(season.id, false);
                  Alert.alert("تم", "تم إغلاق استمارة التسجيل");
                }}
              />
            )}

            {!season.active ? (
              <QuickButton
                color={colors.teal}
                icon="checkmark-circle-outline"
                label="تعيين كموسم نشط"
                onPress={() => activateSeason(season.id)}
              />
            ) : (
              <Text style={styles.activeBadge}>الموسم العادي الحالي</Text>
            )}

            <QuickButton
              color={colors.gold}
              icon="document-text-outline"
              label="طلبات تسجيل هذا الموسم"
              onPress={() =>
                navigation.navigate("AdminRegistrations", {
                  seasonType: SEASON_TYPES.REGULAR,
                })
              }
            />
            <QuickButton
              color={colors.primaryDark}
              icon="people-outline"
              label="مجموعات الموسم العادي"
              onPress={() =>
                navigation.navigate("AdminGroups", {
                  seasonType: SEASON_TYPES.REGULAR,
                })
              }
            />
          </SectionCard>
        ))
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  info: {
    ...rtlText,
    color: colors.primaryDark,
    backgroundColor: colors.soft,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    lineHeight: 22,
    borderWidth: 1,
    borderColor: colors.borderGreen,
  },
  label: { ...rtlText, marginBottom: 6, color: colors.muted },
  listTitle: {
    fontSize: 17,
    fontWeight: "bold",
    ...rtlText,
    color: colors.text,
    marginBottom: 12,
    marginTop: 4,
  },
  meta: { ...rtlText, color: colors.muted, marginTop: 4 },
  activeBadge: {
    textAlign: "center",
    color: colors.primary,
    fontWeight: "bold",
    marginBottom: 10,
  },
});
