/**
 * Fiche superviseur (admin) : onglet « الملف الشخصي » (profil lecture seule) et
 * onglet « الأعضاء » (membres inscrits aux séances de ce superviseur sur le
 * musim actif).
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { rtlText, row, arrowBack } from "../../constants/rtl";
import { useApp } from "../../context/AppContext";
import { formatAccountStatusLabel } from "../../constants/roles";
import { fetchProfile, fetchAppUserRow, formatBirthDateLabel } from "../../lib/auth";
import { formatGenderLabel } from "../../lib/membersApi";
import { PROFILE_COLUMN_LABELS as L } from "../../components/profile/profileColumnLabels";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import {
  getAllSeances,
  getAllAcceptedInscriptions,
  getMemberProfiles,
  formatSeanceScheduleLabel,
} from "../../lib/seancesApi";
import {
  getAllProgressionAdmin,
  computeProgressMetrics,
} from "../../lib/progressApi";
import {
  LEVEL_COLORS,
  deriveLevel,
  initials,
} from "../supervisor/supervisorHelpers";
import ProfileAvatar from "../../components/ProfileAvatar";

const palette = {
  primary: "#2E7D32",
  softGreen: "#E8F5E9",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  border: "#E0E0E0",
};

const TABS = [
  { key: "profile", label: "الملف الشخصي" },
  { key: "members", label: "الأعضاء" },
];

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return displayValue(value);
  return d.toLocaleDateString("ar-MA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color={palette.primary} />
      </View>
      <View style={styles.infoTextWrap}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{displayValue(value)}</Text>
      </View>
    </View>
  );
}

function SectionCard({ title, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function AdminSupervisorDetailScreen({ navigation, route }) {
  const params = route.params || {};
  const supervisorId = params.supervisorId || null;
  const { seasons } = useApp();
  const activeSeason = getActiveRegularSeason(seasons);

  const [tab, setTab] = useState("profile");
  const [loading, setLoading] = useState(true);
  const [profileRow, setProfileRow] = useState(null);
  const [usersRow, setUsersRow] = useState(null);
  const [seances, setSeances] = useState([]);
  const [inscriptions, setInscriptions] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [progressions, setProgressions] = useState([]);

  useFocusEffect(
    useCallback(() => {
      if (!supervisorId) {
        setLoading(false);
        return undefined;
      }
      let cancelled = false;
      const saisonId = activeSeason?.id || null;
      (async () => {
        const [profRes, userRes, seaRes, inscRes, memRes, progRes] =
          await Promise.all([
            fetchProfile(supervisorId),
            fetchAppUserRow(supervisorId),
            getAllSeances({ saisonId }),
            getAllAcceptedInscriptions({ saisonId }),
            getMemberProfiles(),
            getAllProgressionAdmin(),
          ]);
        if (cancelled) return;
        if (profRes.ok) setProfileRow(profRes.profile);
        if (userRes.ok) setUsersRow(userRes.user);
        if (seaRes.ok) setSeances(seaRes.seances);
        if (inscRes.ok) setInscriptions(inscRes.inscriptions);
        if (memRes.ok) setProfiles(memRes.members);
        if (progRes.ok) setProgressions(progRes.entries);
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [supervisorId, activeSeason?.id])
  );

  const firstName = profileRow?.first_name || params.firstName || "";
  const lastName = profileRow?.last_name || params.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();
  const email = profileRow?.email || usersRow?.email || params.email || "";
  const avatarUrl = profileRow?.avatar_url || params.avatarUrl || null;

  const supervisorSeances = useMemo(
    () =>
      seances.filter(
        (s) => s.superviseur_id === supervisorId && s.statut !== "archivee"
      ),
    [seances, supervisorId]
  );

  const members = useMemo(() => {
    const seanceIds = new Set(supervisorSeances.map((s) => s.id));
    if (seanceIds.size === 0) return [];

    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const seanceById = new Map(supervisorSeances.map((s) => [s.id, s]));
    const seen = new Set();

    return inscriptions
      .filter((i) => i.membre_id && seanceIds.has(i.seance_id))
      .filter((i) => {
        if (seen.has(i.membre_id)) return false;
        seen.add(i.membre_id);
        return true;
      })
      .map((i) => {
        const profile = profileById.get(i.membre_id);
        const seance = seanceById.get(i.seance_id) || i.seance || null;
        const entries = progressions
          .filter((e) => e.membre_id === i.membre_id)
          .sort(
            (a, b) =>
              new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
          );
        const pct = computeProgressMetrics(entries[0])?.globalPct ?? 0;
        const name = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
        return {
          id: i.membre_id,
          name,
          firstName: profile?.first_name || "",
          lastName: profile?.last_name || "",
          avatarUrl: profile?.avatar_url || null,
          email: profile?.email || "",
          phone: profile?.phone || null,
          school: profile?.school || null,
          levelLabel: profile?.level || null,
          hifzAmount: profile?.hifz_amount || null,
          level: deriveLevel(pct),
          pct,
          seanceId: i.seance_id,
          saisonId: i.saison_id || seance?.saison_id || activeSeason?.id || null,
          session: seance?.nom || "بدون حصة",
          groupSchedule: formatSeanceScheduleLabel(seance),
          registrationDate: i.date_inscription || profile?.created_at || null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [
    inscriptions,
    profiles,
    progressions,
    supervisorSeances,
    activeSeason?.id,
  ]);

  const openMemberProfile = (member) => {
    navigation.navigate("MemberProfile", {
      memberId: member.id,
      seanceId: member.seanceId,
      saisonId: member.saisonId,
      firstName: member.firstName,
      lastName: member.lastName,
      avatarUrl: member.avatarUrl,
      email: member.email,
      phone: member.phone,
      school: member.school,
      level: member.levelLabel,
      hifzAmount: member.hifzAmount,
      groupName: member.session !== "بدون حصة" ? member.session : null,
      groupSchedule: member.groupSchedule || null,
      registrationDate: member.registrationDate,
      supervisorName: fullName || email,
      seasonName: activeSeason?.name || null,
      seasonVersion: activeSeason?.version ?? null,
      canEditSeance: true,
      adminTheme: true,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="رجوع"
        >
          <Ionicons name={arrowBack} size={22} color={palette.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          {fullName || email || "المشرف"}
        </Text>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((item) => {
          const active = tab === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(item.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {item.key === "members"
                  ? `${item.label} (${members.length})`
                  : item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <ProfileAvatar
            userId={supervisorId}
            avatarUrl={avatarUrl}
            fallbackLetter={initials(firstName || fullName)}
            size={72}
            softBackgroundColor={palette.softGreen}
            letterColor={palette.primary}
          />
          <Text style={styles.heroName}>{fullName || "المشرف"}</Text>
          <Text style={styles.heroEmail}>{email || "—"}</Text>
        </View>

        {loading ? (
          <View style={styles.loaderCard}>
            <ActivityIndicator size="large" color={palette.primary} />
          </View>
        ) : tab === "profile" ? (
          <>
            <SectionCard title="المعلومات الشخصية">
              <InfoRow
                icon="person-outline"
                label={L.full_name}
                value={fullName}
              />
              <InfoRow
                icon="mail-outline"
                label={L.email}
                value={email}
              />
              <InfoRow
                icon="call-outline"
                label={L.phone}
                value={usersRow?.telephone || profileRow?.phone}
              />
              <InfoRow
                icon="male-female-outline"
                label={L.genre}
                value={formatGenderLabel(profileRow?.genre)}
              />
              <InfoRow
                icon="calendar-outline"
                label={L.date_naissance}
                value={formatBirthDateLabel(profileRow?.date_naissance)}
              />
              <InfoRow
                icon="shield-checkmark-outline"
                label={L.account_status}
                value={formatAccountStatusLabel(profileRow?.account_status)}
              />
              <InfoRow
                icon="time-outline"
                label={L.created_at}
                value={formatDate(profileRow?.created_at)}
              />
              <InfoRow
                icon="refresh-outline"
                label={L.updated_at}
                value={formatDate(profileRow?.updated_at)}
              />
            </SectionCard>

            <SectionCard title={`الحصص (${supervisorSeances.length})`}>
              {supervisorSeances.length === 0 ? (
                <Text style={styles.emptyText}>
                  لا توجد حصص مسندة لهذا المشرف
                </Text>
              ) : (
                supervisorSeances.map((seance) => (
                  <View key={seance.id} style={styles.seanceRow}>
                    <View style={styles.infoIcon}>
                      <Ionicons
                        name="people-outline"
                        size={18}
                        color={palette.primary}
                      />
                    </View>
                    <View style={styles.infoTextWrap}>
                      <Text style={styles.infoValue}>{seance.nom}</Text>
                      <Text style={styles.infoLabel}>
                        {formatSeanceScheduleLabel(seance) || "—"}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </SectionCard>
          </>
        ) : members.length === 0 ? (
          <Text style={styles.emptyText}>
            لا يوجد أعضاء مسجّلون في حصص هذا المشرف
          </Text>
        ) : (
          members.map((member) => (
            <TouchableOpacity
              key={member.id}
              style={styles.memberCard}
              onPress={() => openMemberProfile(member)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`عرض ملف ${member.name || "عضو"}`}
            >
              <ProfileAvatar
                userId={member.id}
                avatarUrl={member.avatarUrl}
                fallbackLetter={initials(member.firstName || member.name)}
                size={44}
                softBackgroundColor={palette.softGreen}
                letterColor={palette.primary}
              />
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.name || "عضو"}</Text>
                <View style={styles.memberMeta}>
                  <View
                    style={[
                      styles.levelPill,
                      {
                        backgroundColor: `${
                          LEVEL_COLORS[member.level] || palette.primary
                        }22`,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.levelPillText,
                        { color: LEVEL_COLORS[member.level] || palette.primary },
                      ]}
                    >
                      {member.level}
                    </Text>
                  </View>
                  <Text style={styles.memberSession}>{member.session}</Text>
                </View>
              </View>
              <Text style={styles.memberPct}>{member.pct}%</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  topBar: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: row,
    alignItems: "center",
    gap: 12,
  },
  topBarTitle: {
    flex: 1,
    fontWeight: "bold",
    color: palette.textPrimary,
    fontSize: 16,
    ...rtlText,
  },
  tabBar: {
    flexDirection: row,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  tabText: {
    fontSize: 13,
    color: palette.textSecondary,
    ...rtlText,
  },
  tabTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    paddingBottom: 28,
  },
  hero: {
    alignItems: "center",
    marginBottom: 18,
  },
  heroName: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: "bold",
    color: palette.textPrimary,
    ...rtlText,
  },
  heroEmail: {
    marginTop: 2,
    fontSize: 13,
    color: palette.textSecondary,
    ...rtlText,
  },
  loaderCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 48,
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.border,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.textPrimary,
    marginBottom: 4,
    ...rtlText,
  },
  infoRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  seanceRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.softGreen,
    justifyContent: "center",
    alignItems: "center",
  },
  infoTextWrap: { flex: 1 },
  infoLabel: {
    fontSize: 12,
    color: palette.textSecondary,
    ...rtlText,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "600",
    color: palette.textPrimary,
    marginTop: 2,
    ...rtlText,
  },
  emptyText: {
    textAlign: "center",
    color: palette.textSecondary,
    fontSize: 14,
    marginTop: 20,
    ...rtlText,
  },
  memberCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: row,
    alignItems: "center",
    gap: 10,
  },
  memberInfo: { flex: 1 },
  memberName: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.textPrimary,
    marginBottom: 6,
    ...rtlText,
  },
  memberMeta: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  levelPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  levelPillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  memberSession: {
    fontSize: 12,
    color: palette.textSecondary,
    ...rtlText,
  },
  memberPct: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.textSecondary,
  },
});
