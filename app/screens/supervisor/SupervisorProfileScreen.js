import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../../context/AppContext";
import { ROLE_LABELS } from "../../constants/roles";
import { fetchProfile, fetchAppUserRow } from "../../lib/auth";
import {
  getPushNotificationsToggleState,
  registerForPushNotifications,
  unregisterPushNotifications,
} from "../../lib/pushNotifications";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, rtlTextBold, row as rtlRow, fonts, arrowBack, arrowForward } from "../../constants/rtl";
import { initials } from "./supervisorHelpers";
import ChangePasswordModal from "../../components/ChangePasswordModal";

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return displayValue(value);
  return d.toLocaleDateString("ar-MA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function ProfileRow({ icon, label, value }) {
  return (
    <View style={styles.itemRow}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{displayValue(value)}</Text>
      </View>
    </View>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <View style={[styles.card, shadows.card]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

/** Profil superviseur — champs affichés : identité + users + profiles (dates). */
export default function SupervisorProfileScreen({ navigation }) {
  const { currentUser, supabaseSession } = useApp();
  const insets = useSafeAreaInsets();
  const [profileRow, setProfileRow] = useState(null);
  const [usersRow, setUsersRow] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [togglingNotifications, setTogglingNotifications] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);

  const authId = currentUser?.authId || supabaseSession?.user?.id || null;

  const loadNotificationsState = useCallback(async () => {
    if (!authId) {
      setNotificationsEnabled(false);
      return;
    }
    setLoadingNotifications(true);
    const res = await getPushNotificationsToggleState(authId);
    if (res.ok) {
      setNotificationsEnabled(res.enabled === true);
    }
    setLoadingNotifications(false);
  }, [authId]);

  useFocusEffect(
    useCallback(() => {
      loadNotificationsState();
    }, [loadNotificationsState])
  );

  const handleNotificationsToggle = async (nextValue) => {
    if (!authId || togglingNotifications) return;

    if (nextValue) {
      setTogglingNotifications(true);
      const res = await registerForPushNotifications(authId);
      setTogglingNotifications(false);

      if (!res.ok) {
        setNotificationsEnabled(false);
        if (res.permissionDenied) {
          Alert.alert(
            "تنبيه",
            "لم يتم منح إذن الإشعارات. يمكنك تفعيلها من إعدادات الجهاز."
          );
        } else {
          Alert.alert("تنبيه", res.error || "تعذر تفعيل الإشعارات");
        }
        return;
      }
      setNotificationsEnabled(true);
      return;
    }

    setTogglingNotifications(true);
    const res = await unregisterPushNotifications(authId);
    setTogglingNotifications(false);

    if (!res.ok) {
      Alert.alert("تنبيه", res.error || "تعذر إيقاف الإشعارات");
      await loadNotificationsState();
      return;
    }
    setNotificationsEnabled(false);
  };

  useEffect(() => {
    if (!authId) return;
    let cancelled = false;
    setLoadingProfile(true);
    (async () => {
      const [profileRes, usersRes] = await Promise.all([
        fetchProfile(authId),
        fetchAppUserRow(authId),
      ]);
      if (cancelled) return;
      if (profileRes.ok) setProfileRow(profileRes.profile);
      if (usersRes.ok) setUsersRow(usersRes.user);
      setLoadingProfile(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authId]);

  const firstName =
    profileRow?.first_name || usersRow?.prenom || currentUser?.firstName || "";
  const lastName =
    profileRow?.last_name || usersRow?.nom || currentUser?.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();
  const roleKey = profileRow?.role || currentUser?.role;
  const phone =
    usersRow?.telephone || profileRow?.phone || currentUser?.phone;
  const email =
    usersRow?.email || profileRow?.email || currentUser?.email;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name={arrowBack} size={22} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الملف الشخصي</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarBlock}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(firstName || fullName)}</Text>
          </View>
          <Text style={styles.name}>{fullName || "المشرف"}</Text>
          <Text style={styles.roleBadge}>{ROLE_LABELS[roleKey] || "مشرف"}</Text>
        </View>

        {loadingProfile ? (
          <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
        ) : null}

        <SectionCard title="المعلومات الشخصية">
          <ProfileRow icon="id-card-outline" label="الاسم الكامل" value={fullName} />
          <ProfileRow icon="mail-outline" label="البريد الإلكتروني" value={email} />
          <ProfileRow icon="call-outline" label="رقم الهاتف" value={phone} />
          <ProfileRow
            icon="calendar-outline"
            label="تاريخ الميلاد"
            value={currentUser?.birthDate}
          />
          <ProfileRow icon="male-female-outline" label="الجنس" value={currentUser?.gender} />
          <ProfileRow
            icon="time-outline"
            label="تاريخ إنشاء الحساب"
            value={formatDateTime(profileRow?.created_at)}
          />
          <ProfileRow
            icon="refresh-outline"
            label="آخر تحديث"
            value={formatDateTime(profileRow?.updated_at)}
          />
        </SectionCard>

        <SectionCard title="الإشعارات" subtitle="استلام التنبيهات والتحديثات">
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>تفعيل الإشعارات</Text>
            {loadingNotifications || togglingNotifications ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationsToggle}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="white"
                disabled={!authId}
              />
            )}
          </View>
        </SectionCard>
        <SectionCard title="الحساب" subtitle="تأمين الدخول إلى التطبيق">
          <TouchableOpacity
            style={styles.passwordRow}
            onPress={() => setPasswordModal(true)}
            activeOpacity={0.75}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowValue}>تغيير كلمة المرور</Text>
              <Text style={styles.rowLabel}>تعيين كلمة مرور جديدة</Text>
            </View>
            <Ionicons name={arrowForward} size={18} color={colors.muted} />
          </TouchableOpacity>
        </SectionCard>
      </ScrollView>

      <ChangePasswordModal
        visible={passwordModal}
        onClose={() => setPasswordModal(false)}
        bottomInset={Math.max(insets.bottom, 16)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },

  header: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.primary,
  },
  backBtn: { padding: 2 },
  headerTitle: { color: "white", fontSize: 18, fontFamily: fonts.bold, ...rtlTextBold },

  loader: { marginBottom: 12 },

  avatarBlock: { alignItems: "center", marginBottom: 20 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primarySoft,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  avatarText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 26 },
  name: { fontFamily: fonts.bold, fontSize: 18, color: colors.text, ...rtlTextBold },
  roleBadge: {
    marginTop: 6,
    fontSize: 13,
    color: colors.primary,
    fontFamily: fonts.medium,
    ...rtlText,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    ...rtlTextBold,
  },
  sectionSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
    marginBottom: 8,
    ...rtlText,
  },
  itemRow: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  rowTextWrap: { flex: 1 },
  rowLabel: { fontSize: 12, color: colors.muted, fontFamily: fonts.regular, ...rtlText },
  rowValue: {
    fontSize: 15,
    color: colors.text,
    fontFamily: fonts.semiBold,
    marginTop: 2,
    ...rtlText,
  },
  switchRow: {
    flexDirection: rtlRow,
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9F9F9",
    marginTop: 8,
    padding: 12,
    borderRadius: radii.md,
  },
  switchLabel: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: colors.text,
    ...rtlText,
  },
  passwordRow: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
});
