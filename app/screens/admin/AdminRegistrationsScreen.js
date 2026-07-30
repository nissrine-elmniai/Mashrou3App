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
import RegistrationStepper, {
  statusToStepper,
} from "../../components/RegistrationStepper";
import { sendMemberAcceptEmail } from "../../utils/sendInviteEmail";

export default function AdminRegistrationsScreen({ navigation, route }) {
  const seasonType = route?.params?.seasonType || SEASON_TYPES.REGULAR;
  const isSummer = seasonType === SEASON_TYPES.SUMMER;

  const {
    registrations,
    seasons,
    getUserById,
    reviewRegistration,
  } = useApp();
  const [filter, setFilter] = useState("pending");

  const list = useMemo(() => {
    return registrations
      .filter((r) => {
        const season = seasons.find((s) => s.id === r.seasonId);
        // Demandes sans saison : visibles dans la liste saison régulière
        if (r.seasonId && season && season.type !== seasonType) return false;
        if (!r.seasonId && seasonType !== SEASON_TYPES.REGULAR) return false;
        if (filter === "all") return true;
        if (filter === "pending") {
          return r.status === REGISTRATION_STATUS.PENDING;
        }
        if (filter === "accepted") {
          return (
            r.status === REGISTRATION_STATUS.ACCEPTED ||
            r.status === REGISTRATION_STATUS.INVITED ||
            r.status === REGISTRATION_STATUS.ACTIVATED
          );
        }
        if (filter === "rejected") {
          return r.status === REGISTRATION_STATUS.REJECTED;
        }
        return r.status === filter;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [registrations, filter, seasons, seasonType]);

  const pendingCount = useMemo(
    () =>
      registrations.filter((r) => {
        const season = seasons.find((s) => s.id === r.seasonId);
        if (r.seasonId && season && season.type !== seasonType) return false;
        if (!r.seasonId && seasonType !== SEASON_TYPES.REGULAR) return false;
        return r.status === REGISTRATION_STATUS.PENDING;
      }).length,
    [registrations, seasons, seasonType]
  );

  const [sendingId, setSendingId] = useState(null);

  const acceptAndInvite = async (reg) => {
    if (!reg.email) {
      Alert.alert(
        "تنبيه",
        "لا يوجد بريد إلكتروني لهذا الطلب. لا يمكن إرسال الدعوة."
      );
      return;
    }

    const result = reviewRegistration(reg.id, REGISTRATION_STATUS.ACCEPTED);
    if (!result?.ok) {
      Alert.alert("خطأ", result?.error || "تعذر قبول الطلب");
      return;
    }

    setSendingId(reg.id);
    const mail = await sendMemberAcceptEmail({
      toEmail: reg.email,
      fullName: reg.fullName,
    });
    setSendingId(null);

    if (mail.ok) {
      Alert.alert(
        "تم القبول",
        `تم قبول الطلب وإرسال الرسالة إلى:\n${reg.email}\n\nيمكن للمترشح إنشاء حسابه من التطبيق.`
      );
    } else {
      Alert.alert(
        "تم القبول — فشل إرسال البريد",
        `${mail.error || ""}\n\nشارك رمز الدعوة يدوياً: ${result.inviteToken}`
      );
    }
  };

  const rejectRegistration = (reg) => {
    Alert.alert("تأكيد الرفض", `هل تريد رفض طلب ${reg.fullName}؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "رفض",
        style: "destructive",
        onPress: () => {
          reviewRegistration(reg.id, REGISTRATION_STATUS.REJECTED);
        },
      },
    ]);
  };

  const accent = isSummer ? colors.orange : colors.primary;

  return (
    <AppShell
      title={isSummer ? "طلبات التسجيل الصيفي" : "طلبات التسجيل"}
      subtitle={
        pendingCount > 0
          ? `${pendingCount} طلب بانتظار قرارك — القبول يحاكي إرسال رسالة`
          : "قبول الطلب يحاكي رسالة من بريد التطبيق (وضع الواجهات)"
      }
      icon="document-text"
      onBack={() => navigation.goBack()}
    >
      <SectionCard title="تصفية الطلبات" subtitle="اختر حالة العرض">
        {[
          ["pending", `قيد الانتظار (${pendingCount})`],
          ["accepted", "المقبولة / الدعوات"],
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
          const user = reg.userId ? getUserById(reg.userId) : null;
          const season = seasons.find((s) => s.id === reg.seasonId);
          const title =
            reg.fullName ||
            (user ? `${user.firstName} ${user.lastName}` : "مترشح");
          const step = statusToStepper(reg.status);
          return (
            <SectionCard
              key={reg.id}
              title={title}
              primary={accent}
              borderColor={isSummer ? "#FDE68A" : colors.borderBlue}
            >
              <RegistrationStepper
                activeStep={step.activeStep}
                rejected={step.rejected}
              />
              {season ? (
                <Text style={styles.meta}>
                  {season.name} • {SEASON_TYPE_LABELS[season.type] || ""}
                </Text>
              ) : (
                <Text style={styles.meta}>طلب انضمام عام</Text>
              )}
              {reg.email ? (
                <Text style={styles.meta}>البريد: {reg.email}</Text>
              ) : null}
              {reg.phone ? (
                <Text style={styles.meta}>الهاتف: {reg.phone}</Text>
              ) : null}
              {reg.school ? (
                <Text style={styles.meta}>المدرسة/الكلية: {reg.school}</Text>
              ) : null}
              {reg.level ? (
                <Text style={styles.meta}>مستوى الحفظ: {reg.level}</Text>
              ) : null}
              {reg.hifzAmount ? (
                <Text style={styles.meta}>مقدار الحفظ: {reg.hifzAmount}</Text>
              ) : null}
              {reg.inviteToken ? (
                <Text style={[styles.meta, styles.token]}>
                  رمز الدعوة: {reg.inviteToken}
                </Text>
              ) : null}
              <Text style={[styles.status, { color: accent }]}>
                {REGISTRATION_STATUS_LABELS[reg.status]}
              </Text>
              {reg.status === REGISTRATION_STATUS.PENDING ? (
                <View>
                  <QuickButton
                    label={
                      sendingId === reg.id
                        ? "جاري الإرسال..."
                        : "قبول وإرسال الرسالة"
                    }
                    color={accent}
                    icon="mail"
                    onPress={
                      sendingId === reg.id
                        ? undefined
                        : () => acceptAndInvite(reg)
                    }
                  />
                  <QuickButton
                    label="رفض"
                    color={colors.red}
                    icon="close"
                    onPress={() => rejectRegistration(reg)}
                  />
                </View>
              ) : null}
              {reg.status === REGISTRATION_STATUS.INVITED && reg.email ? (
                <QuickButton
                  label={
                    sendingId === reg.id
                      ? "جاري الإرسال..."
                      : "إعادة إرسال الرسالة"
                  }
                  color={colors.teal}
                  icon="mail-outline"
                  onPress={
                    sendingId === reg.id
                      ? undefined
                      : async () => {
                          setSendingId(reg.id);
                          const mail = await sendMemberAcceptEmail({
                            toEmail: reg.email,
                            fullName: reg.fullName,
                          });
                          setSendingId(null);
                          if (mail.ok) {
                            Alert.alert(
                              "تم الإرسال",
                              `أُرسلت الرسالة إلى:\n${reg.email}`
                            );
                          } else {
                            Alert.alert(
                              "تنبيه",
                              mail.error || "تعذر إرسال البريد"
                            );
                          }
                        }
                  }
                />
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
  token: { color: colors.primaryDark, fontWeight: "700", marginTop: 8 },
  status: {
    ...rtlText,
    marginTop: 8,
    marginBottom: 8,
    fontWeight: "600",
  },
});
