import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { useApp } from "../../context/AppContext";
import {
  AppShell,
  SectionCard,
  QuickButton,
  EmptyState,
  SoftButton,
} from "../../components/ui";
import {
  REGISTRATION_STATUS,
  REGISTRATION_STATUS_LABELS,
  SEASON_TYPES,
  SEASON_TYPE_LABELS,
} from "../../constants/roles";
import { colors } from "../../constants/theme";
import { rtlText } from "../../constants/rtl";

export default function AdminRegistrationsScreen({ navigation, route }) {
  const seasonType = route?.params?.seasonType || SEASON_TYPES.REGULAR;
  const isSummer = seasonType === SEASON_TYPES.SUMMER;

  const {
    registrations,
    seasons,
    getUserById,
    reviewRegistration,
    assignMemberToGroup,
    groups,
  } = useApp();
  const [filter, setFilter] = useState("pending");

  const list = useMemo(() => {
    return registrations
      .filter((r) => {
        const season = seasons.find((s) => s.id === r.seasonId);
        if (season?.type !== seasonType) return false;
        return filter === "all" ? true : r.status === filter;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [registrations, filter, seasons, seasonType]);

  const acceptAndSuggestGroup = (reg) => {
    reviewRegistration(reg.id, REGISTRATION_STATUS.ACCEPTED);
    const matching = groups.find(
      (g) =>
        g.seasonId === reg.seasonId &&
        reg.freeTimes?.some((t) => t === g.freeTimeSlot)
    );
    if (matching) {
      assignMemberToGroup(matching.id, reg.userId);
      Alert.alert(
        "تم القبول",
        `تم قبول الطلب وإضافته إلى المجموعة: ${matching.name}`
      );
    } else {
      Alert.alert(
        "تم القبول",
        "تم قبول الطلب. أنشئ مجموعة مناسبة ثم وزّع العضو."
      );
    }
  };

  const accent = isSummer ? colors.orange : colors.primary;

  return (
    <AppShell
      title={isSummer ? "طلبات التسجيل الصيفي" : "طلبات تسجيل الموسم"}
      subtitle={
        isSummer
          ? "المدرسة الصيفية فقط — منفصلة عن الموسم العادي"
          : "المواسم العادية فقط"
      }
      icon="document-text"
      onBack={() => navigation.goBack()}
    >
      <SectionCard title="تصفية الطلبات" subtitle="اختر حالة العرض">
        {[
          ["pending", "قيد الانتظار"],
          ["accepted", "المقبولة"],
          ["rejected", "المرفوضة"],
          ["all", "الكل"],
        ].map(([key, label]) => (
          <SoftButton
            key={key}
            label={label}
            active={filter === key}
            onPress={() => setFilter(key)}
          />
        ))}
      </SectionCard>

      {list.length === 0 ? (
        <EmptyState text="لا توجد طلبات في هذا التصنيف" />
      ) : (
        list.map((reg) => {
          const user = getUserById(reg.userId);
          const season = seasons.find((s) => s.id === reg.seasonId);
          return (
            <SectionCard
              key={reg.id}
              title={user ? `${user.firstName} ${user.lastName}` : "عضو"}
              primary={accent}
              borderColor={isSummer ? "#FDE68A" : colors.borderBlue}
            >
              <Text style={styles.meta}>
                {season?.name} • {SEASON_TYPE_LABELS[season?.type] || ""}
              </Text>
              <Text style={styles.meta}>
                أوقات الفراغ: {(reg.freeTimes || []).join("، ")}
              </Text>
              <Text style={[styles.status, { color: accent }]}>
                {REGISTRATION_STATUS_LABELS[reg.status]}
              </Text>
              {reg.status === REGISTRATION_STATUS.PENDING ? (
                <View>
                  <QuickButton
                    label="قبول وتوزيع"
                    color={accent}
                    icon="checkmark"
                    onPress={() => acceptAndSuggestGroup(reg)}
                  />
                  <QuickButton
                    label="رفض"
                    color={colors.red}
                    icon="close"
                    onPress={() =>
                      reviewRegistration(reg.id, REGISTRATION_STATUS.REJECTED)
                    }
                  />
                </View>
              ) : null}
            </SectionCard>
          );
        })
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  meta: { ...rtlText, color: colors.muted, marginTop: 4 },
  status: {
    ...rtlText,
    marginTop: 8,
    marginBottom: 8,
    fontWeight: "600",
  },
});
