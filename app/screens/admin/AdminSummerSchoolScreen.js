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

export default function AdminSummerSchoolScreen({ navigation }) {
  const {
    seasons,
    createSeason,
    setRegistrationOpen,
    activateSeason,
    announceRegistrationForm,
  } = useApp();

  const summerSessions = useMemo(
    () => seasons.filter((s) => s.type === SEASON_TYPES.SUMMER),
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
      type: SEASON_TYPES.SUMMER,
      startDate,
      endDate,
      remote: true,
      openRegistration: announceNow,
      activate: announceNow,
    });
    setName("");
    setStartDate("");
    setEndDate("");
    Alert.alert(
      announceNow ? "تم إعلان الاستمارة الصيفية" : "تم إنشاء المدرسة الصيفية",
      announceNow
        ? `تم إنشاء «${season.name}» وفتح استمارة التسجيل الصيفي.\nيملأ المنخرطون الجدد الاستمارة من لوحة العضو.`
        : `تم إنشاء «${season.name}». يمكنك لاحقاً إعلان استمارة التسجيل.`
    );
  };

  const handleAnnounce = (seasonId, seasonName) => {
    const result = announceRegistrationForm(seasonId);
    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }
    Alert.alert(
      "تم إعلان الاستمارة الصيفية",
      `استمارة «${seasonName}» مفتوحة الآن للمنخرطين الجدد.`
    );
  };

  return (
    <AppShell
      title="المدرسة الصيفية"
      subtitle="إعلان استمارة التسجيل — عن بعد ومستقلة عن الموسم"
      icon="sunny"
      onBack={() => navigation.goBack()}
    >
      <SectionCard
        title="منفصلة عن الموسم العادي"
        subtitle="التسجيل والمجموعات تُدار بشكل مستقل"
        primary={colors.orange}
        borderColor="#FDE68A"
      >
        <Text style={styles.bannerText}>
          عند إعلان المدرسة الصيفية تُفتح استمارة خاصة يملأها المنخرطون
          الجدد لاختيار أوقات فراغهم، ثم تراجع الإدارة الطلبات.
        </Text>
      </SectionCard>

      <SectionCard
        title="إعلان مدرسة صيفية جديدة"
        subtitle="إنشاء الدورة وفتح الاستمارة للمنخرطين"
        primary={colors.orange}
        borderColor="#FDE68A"
      >
        <Text style={styles.label}>اسم المدرسة الصيفية</Text>
        <FormInput
          value={name}
          onChangeText={setName}
          placeholder="مثلاً: المدرسة الصيفية 2027"
        />
        <Text style={styles.label}>تاريخ البداية</Text>
        <FormInput
          value={startDate}
          onChangeText={setStartDate}
          placeholder="2027/07/01"
        />
        <Text style={styles.label}>تاريخ النهاية</Text>
        <FormInput
          value={endDate}
          onChangeText={setEndDate}
          placeholder="2027/08/31"
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
          color={colors.orange}
          icon="megaphone-outline"
          label="إنشاء المدرسة وإعلان الاستمارة"
          onPress={handleCreateAndAnnounce}
        />
      </SectionCard>

      <Text style={styles.listTitle}>الدورات الصيفية</Text>
      {summerSessions.length === 0 ? (
        <EmptyState text="لا توجد مدرسة صيفية بعد" />
      ) : (
        summerSessions.map((season) => (
          <SectionCard
            key={season.id}
            title={season.name}
            primary={colors.orange}
            borderColor="#FDE68A"
          >
            <Text style={styles.meta}>
              عن بعد{season.active ? " • نشطة" : ""}
              {season.registrationOpen
                ? " • الاستمارة مفتوحة"
                : " • الاستمارة مغلقة"}
            </Text>
            <Text style={styles.meta}>
              {season.startDate} → {season.endDate}
            </Text>

            {!season.registrationOpen ? (
              <QuickButton
                color={colors.orange}
                icon="megaphone-outline"
                label="إعلان استمارة التسجيل الصيفي"
                onPress={() => handleAnnounce(season.id, season.name)}
              />
            ) : (
              <QuickButton
                color={colors.primaryDark}
                icon="close-circle-outline"
                label="إغلاق استمارة التسجيل"
                onPress={() => {
                  setRegistrationOpen(season.id, false);
                  Alert.alert("تم", "تم إغلاق استمارة التسجيل الصيفي");
                }}
              />
            )}

            {!season.active ? (
              <QuickButton
                color={colors.primary}
                icon="checkmark-circle-outline"
                label="تعيين كمدرسة صيفية نشطة"
                onPress={() => activateSeason(season.id)}
              />
            ) : (
              <Text style={styles.activeBadge}>المدرسة الصيفية الحالية</Text>
            )}

            <QuickButton
              color={colors.orange}
              icon="document-text-outline"
              label="طلبات التسجيل الصيفي"
              onPress={() =>
                navigation.navigate("AdminRegistrations", {
                  seasonType: SEASON_TYPES.SUMMER,
                })
              }
            />
            <QuickButton
              color={colors.primary}
              icon="people-outline"
              label="مجموعات المدرسة الصيفية"
              onPress={() =>
                navigation.navigate("AdminGroups", {
                  seasonType: SEASON_TYPES.SUMMER,
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
  bannerText: { ...rtlText, color: "#78350F", lineHeight: 22, marginBottom: 4 },
  label: { ...rtlText, marginBottom: 6, color: colors.muted },
  listTitle: {
    fontSize: 17,
    fontWeight: "bold",
    ...rtlText,
    color: colors.text,
    marginBottom: 12,
  },
  meta: { ...rtlText, color: colors.muted, marginTop: 4 },
  activeBadge: {
    textAlign: "center",
    color: colors.orange,
    fontWeight: "bold",
    marginBottom: 10,
  },
});
