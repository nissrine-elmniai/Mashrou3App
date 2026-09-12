import React, { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Menu, Bell, ClipboardList, Search, UserCheck } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import { rtlText, row } from "../../constants/rtl";
import {
  getMemberProfiles,
  getAllAcceptedInscriptions,
  formatSeanceScheduleLabel,
} from "../../lib/seancesApi";
import { getAllProgressionAdmin, computeProgressMetrics } from "../../lib/progressApi";
import {
  LEVEL_COLORS,
  deriveLevel,
  initials,
} from "../supervisor/supervisorHelpers";
import ProfileAvatar from "../../components/ProfileAvatar";
import AdminTopBarAvatar from "../../components/admin/AdminTopBarAvatar";

const palette = {
  primary: "#2E7D32",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  softGold: "#FFF8E1",
  softBlue: "#E3F2FD",
  blue: "#1565C0",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  placeholder: "#999999",
  border: "#E0E0E0",
  inactive: "#9E9E9E",
};

const ALL_FILTER = "all";
const NO_SEASON_FILTER = "none";

function levelColor(level) {
  return LEVEL_COLORS[level] || palette.primary;
}

function supervisorName(profile) {
  if (!profile) return null;
  const name = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
  return name || profile.email || null;
}

const ARABIC_ORDINALS = {
  1: "الأول",
  2: "الثاني",
  3: "الثالث",
  4: "الرابع",
  5: "الخامس",
  6: "السادس",
  7: "السابع",
  8: "الثامن",
  9: "التاسع",
  10: "العاشر",
  11: "الحادي عشر",
  12: "الثاني عشر",
  13: "الثالث عشر",
  14: "الرابع عشر",
  15: "الخامس عشر",
  16: "السادس عشر",
  17: "السابع عشر",
  18: "الثامن عشر",
  19: "التاسع عشر",
  20: "العشرون",
};

/** Libellé court d'un musim : « الموسم السابع » si la version est connue, sinon son nom. */
function seasonVersionLabel(season) {
  if (!season) return null;
  if (season.version != null) {
    const ordinal = ARABIC_ORDINALS[Number(season.version)];
    return ordinal ? `الموسم ${ordinal}` : `الموسم ${season.version}`;
  }
  return season.name || null;
}

/** Clé de regroupement du filtre : par numéro de version, sinon par musim. */
function seasonFilterKey(season) {
  if (!season) return null;
  if (season.version != null) return `v:${season.version}`;
  return `s:${season.id}`;
}

function inscriptionTime(inscription) {
  return new Date(inscription?.date_inscription || 0).getTime() || 0;
}

export default function AdminMembersScreen({ navigation }) {
  const { openSidebar, sidebar, messagesFab } = useAdminSidebar(navigation, "members");
  const { stats, currentUser, seasons } = useApp();
  const activeSeason = getActiveRegularSeason(seasons);

  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState([]);
  const [inscriptions, setInscriptions] = useState([]);
  const [progressions, setProgressions] = useState([]);
  const [search, setSearch] = useState("");
  const [versionFilter, setVersionFilter] = useState(ALL_FILTER);
  const [avatarNonce, setAvatarNonce] = useState(() => Date.now());

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setAvatarNonce(Date.now());
      (async () => {
        const [profRes, inscRes, progRes] = await Promise.all([
          getMemberProfiles(),
          getAllAcceptedInscriptions(),
          getAllProgressionAdmin(),
        ]);
        if (cancelled) return;
        if (profRes.ok) {
          setProfiles(profRes.members);
        } else {
          console.warn("[AdminMembers] getMemberProfiles failed:", profRes.error);
        }
        if (inscRes.ok) setInscriptions(inscRes.inscriptions);
        if (progRes.ok) setProgressions(progRes.entries);
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const seasonsById = useMemo(() => {
    const map = new Map();
    (seasons || []).forEach((s) => map.set(s.id, s));
    return map;
  }, [seasons]);

  const members = useMemo(() => {
    const byMember = new Map();
    inscriptions.forEach((i) => {
      if (!i.membre_id) return;
      if (!byMember.has(i.membre_id)) byMember.set(i.membre_id, []);
      byMember.get(i.membre_id).push(i);
    });

    return profiles
      .filter((p) => p.account_status !== "invited")
      .map((p) => {
        const memberInscriptions = (byMember.get(p.id) || []).sort(
          (a, b) => inscriptionTime(b) - inscriptionTime(a)
        );
        const seasonIdOf = (i) => i?.saison_id || i?.seance?.saison_id || null;
        // Inscription de référence : celle du musim actif, sinon la plus récente.
        const inscription =
          memberInscriptions.find(
            (i) => activeSeason?.id && seasonIdOf(i) === activeSeason.id
          ) ||
          memberInscriptions[0] ||
          null;

        const memberSeasons = [];
        const filterKeys = new Set();
        memberInscriptions.forEach((i) => {
          const season = seasonsById.get(seasonIdOf(i));
          if (!season) return;
          const key = seasonFilterKey(season);
          if (filterKeys.has(key)) return;
          filterKeys.add(key);
          memberSeasons.push(season);
        });

        const entries = progressions
          .filter((e) => e.membre_id === p.id)
          .sort((a, b) => {
            const ta = new Date(a.date || 0).getTime();
            const tb = new Date(b.date || 0).getTime();
            return tb - ta;
          });
        const latest = entries[0];
        const pct = computeProgressMetrics(latest)?.globalPct ?? 0;
        const level = deriveLevel(pct);
        const name = `${p.first_name || ""} ${p.last_name || ""}`.trim();
        const seance = inscription?.seance || null;
        const currentSeason = seasonsById.get(seasonIdOf(inscription)) || null;
        return {
          id: p.id,
          name,
          firstName: p.first_name || "",
          lastName: p.last_name || "",
          avatarUrl: p.avatar_url || null,
          email: p.email || "",
          phone: p.phone || null,
          school: p.school || null,
          levelLabel: p.level || null,
          hifzAmount: p.hifz_amount || null,
          level,
          pct,
          session: seance?.nom || "بدون حصة",
          seanceId: inscription?.seance_id || seance?.id || null,
          saisonId: seasonIdOf(inscription) || activeSeason?.id || null,
          seasonName: currentSeason?.name || null,
          seasonVersion: currentSeason?.version ?? null,
          supervisorId: seance?.superviseur_id || null,
          supervisorName: supervisorName(seance?.superviseur),
          versionPills: memberSeasons
            .map((season, index) => ({
              id: season.id,
              label: seasonVersionLabel(season),
              index,
            }))
            .filter((pill) => pill.label),
          filterKeys,
          groupSchedule: formatSeanceScheduleLabel(seance),
          registrationDate:
            inscription?.date_inscription || p.created_at || null,
          active: !!(
            activeSeason?.id &&
            memberInscriptions.some((i) => seasonIdOf(i) === activeSeason.id)
          ),
        };
      });
  }, [profiles, inscriptions, progressions, seasonsById, activeSeason?.id]);

  // Filtre unique : la version du musim actif (les anciennes versions restent visibles via « الكل »).
  const currentVersionOption = useMemo(() => {
    const key = seasonFilterKey(activeSeason);
    if (!key) return null;
    return {
      key,
      label: seasonVersionLabel(activeSeason),
      count: members.filter((m) => m.filterKeys.has(key)).length,
    };
  }, [activeSeason, members]);

  const unregisteredCount = useMemo(
    () => members.filter((m) => m.filterKeys.size === 0).length,
    [members]
  );

  const q = search.trim().toLowerCase();
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (versionFilter === NO_SEASON_FILTER) {
        if (m.filterKeys.size > 0) return false;
      } else if (versionFilter !== ALL_FILTER && !m.filterKeys.has(versionFilter)) {
        return false;
      }
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.supervisorName || "").toLowerCase().includes(q)
      );
    });
  }, [members, versionFilter, q]);

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
      supervisorName: member.supervisorName,
      seasonName: member.seasonName,
      seasonVersion: member.seasonVersion,
      canEditSeance: true,
      adminTheme: true,
    });
  };

  const pendingCount = stats?.pendingRegs ?? 0;

  const emptyMessage = (() => {
    if (members.length === 0) return "لا يوجد أعضاء في التطبيق بعد";
    if (q) return "لا توجد نتائج مطابقة للبحث";
    if (versionFilter === NO_SEASON_FILTER) return "كل الأعضاء مسجّلون في موسم";
    return "لا يوجد أعضاء مسجّلون في هذا الموسم";
  })();

  return (
    <SafeAreaView
      style={[styles.container, { paddingBottom: 16 }]}
      edges={["top", "bottom"]}
    >
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={openSidebar}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="فتح القائمة"
        >
          <Menu size={24} color={palette.textPrimary} pointerEvents="none" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>الأعضاء</Text>
        <AdminTopBarAvatar
          currentUser={currentUser}
          onPress={() => navigation.navigate("AdminProfile")}
        />
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminRegistrations")}
          hitSlop={12}
        >
          <Bell size={24} color={palette.textSecondary} pointerEvents="none" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {pendingCount > 0 ? (
          <TouchableOpacity
            style={styles.pendingBanner}
            onPress={() => navigation.navigate("AdminRegistrations")}
            activeOpacity={0.8}
          >
            <View style={styles.pendingBannerIcon}>
              <ClipboardList
                size={20}
                color={palette.primary}
                pointerEvents="none"
              />
            </View>
            <View style={styles.pendingBannerTextWrap}>
              <Text style={styles.pendingBannerTitle}>
                طلبات تسجيل بانتظار المراجعة
              </Text>
              <Text style={styles.pendingBannerSub}>
                {pendingCount} طلب — افتح طلبات التسجيل للقبول أو الرفض
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}

        <View style={styles.searchContainer}>
          <Search size={20} color={palette.placeholder} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="بحث بالاسم أو البريد أو المشرف..."
            placeholderTextColor={palette.placeholder}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
        </View>

        <Text style={styles.filterLabel}>تصفية حسب الموسم</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          <FilterChip
            label={`الكل (${members.length})`}
            active={versionFilter === ALL_FILTER}
            onPress={() => setVersionFilter(ALL_FILTER)}
          />
          {currentVersionOption ? (
            <FilterChip
              label={`${currentVersionOption.label} (${currentVersionOption.count})`}
              active={versionFilter === currentVersionOption.key}
              onPress={() => setVersionFilter(currentVersionOption.key)}
            />
          ) : null}
          <FilterChip
            label={`بدون تسجيل (${unregisteredCount})`}
            active={versionFilter === NO_SEASON_FILTER}
            onPress={() => setVersionFilter(NO_SEASON_FILTER)}
          />
        </ScrollView>

        <Text style={styles.sectionTitle}>
          {versionFilter === ALL_FILTER
            ? `جميع الأعضاء (${filteredMembers.length})`
            : `الأعضاء (${filteredMembers.length})`}
        </Text>

        {loading ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="large" color={palette.primary} />
          </View>
        ) : filteredMembers.length === 0 ? (
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        ) : (
          filteredMembers.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              avatarNonce={avatarNonce}
              onPress={() => openMemberProfile(member)}
            />
          ))
        )}
      </ScrollView>
      {messagesFab}
      {sidebar}
    </SafeAreaView>
  );
}

function FilterChip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.filterChip, active && styles.filterChipActive]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function MemberCard({ member, onPress, avatarNonce }) {
  const color = levelColor(member.level);
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`عرض ملف ${member.name || "عضو"}`}
    >
      <View style={styles.cardTop}>
        <ProfileAvatar
          userId={member.id}
          avatarUrl={member.avatarUrl}
          cacheKey={member.avatarUrl || `${member.id}-${avatarNonce}`}
          fallbackLetter={initials(member.firstName || member.name)}
          size={44}
          softBackgroundColor={palette.softGreen}
          letterColor={palette.primary}
        />
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{member.name || "عضو"}</Text>
          <View style={styles.cardMeta}>
            <View style={[styles.levelPill, { backgroundColor: `${color}22` }]}>
              <Text style={[styles.levelPillText, { color }]}>
                {member.level}
              </Text>
            </View>
            <Text style={styles.sessionText}>{member.session}</Text>
            {member.versionPills.map((pill) => (
              <View
                key={pill.id ?? `${pill.label}-${pill.index}`}
                style={styles.versionPill}
              >
                <Text style={styles.versionPillText}>{pill.label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.supervisorRow}>
            <UserCheck size={13} color={palette.textSecondary} pointerEvents="none" />
            <Text style={styles.supervisorText} numberOfLines={1}>
              المشرف: {member.supervisorName || "—"}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: member.active
                ? palette.softGreen
                : "#EEEEEE",
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              {
                color: member.active ? palette.primary : palette.inactive,
              },
            ]}
          >
            {member.active ? "نشط" : "غير نشط"}
          </Text>
        </View>
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${member.pct}%` }]}
          />
        </View>
        <Text style={styles.progressPct}>{member.pct}%</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  topBar: {
    backgroundColor: "#fff",
    padding: 16,
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  topBarTitle: {
    flex: 1,
    fontWeight: "bold",
    color: palette.textPrimary,
    fontSize: 16,
    ...rtlText,
  },
  topBarAvatar: {
    width: 32,
    height: 32,
    backgroundColor: palette.softGreen,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  topBarAvatarText: {
    color: palette.primary,
    fontWeight: "bold",
    fontSize: 14,
  },
  bellBadge: {
    position: "absolute",
    top: -4,
    end: -6,
    backgroundColor: palette.red,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "bold",
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    paddingBottom: 28,
  },
  pendingBanner: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    backgroundColor: palette.softGold,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#FFE082",
  },
  pendingBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  pendingBannerTextWrap: {
    flex: 1,
  },
  pendingBannerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.textPrimary,
    marginBottom: 2,
    ...rtlText,
  },
  pendingBannerSub: {
    fontSize: 12,
    color: palette.textSecondary,
    ...rtlText,
  },
  searchContainer: {
    position: "relative",
    marginBottom: 12,
  },
  searchIcon: {
    position: "absolute",
    right: 12,
    top: 12,
    zIndex: 1,
  },
  searchInput: {
    width: "100%",
    paddingRight: 40,
    paddingLeft: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    backgroundColor: "#fff",
    fontSize: 15,
    color: palette.textPrimary,
    ...rtlText,
  },
  filterLabel: {
    fontSize: 12,
    color: palette.textSecondary,
    marginBottom: 8,
    ...rtlText,
  },
  filterScroll: {
    marginBottom: 16,
    flexGrow: 0,
  },
  filterRow: {
    gap: 8,
    paddingEnd: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
  },
  filterChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  filterChipText: {
    fontSize: 13,
    color: palette.textSecondary,
    ...rtlText,
  },
  filterChipTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.textPrimary,
    marginBottom: 12,
    ...rtlText,
  },
  emptyText: {
    textAlign: "center",
    color: palette.textSecondary,
    marginTop: 40,
    fontSize: 14,
    ...rtlText,
  },
  emptyCard: {
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
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardTop: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
  },
  cardAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.softGreen,
    justifyContent: "center",
    alignItems: "center",
  },
  cardAvatarText: {
    color: palette.primary,
    fontWeight: "bold",
    fontSize: 18,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.textPrimary,
    marginBottom: 6,
    ...rtlText,
  },
  cardMeta: {
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
  sessionText: {
    fontSize: 12,
    color: palette.textSecondary,
    ...rtlText,
  },
  versionPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: palette.softBlue,
  },
  versionPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: palette.blue,
  },
  supervisorRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  supervisorText: {
    flex: 1,
    fontSize: 12,
    color: palette.textSecondary,
    ...rtlText,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  progressRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E8E8E8",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: palette.primary,
  },
  progressPct: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.textSecondary,
    minWidth: 36,
    textAlign: "left",
  },
});