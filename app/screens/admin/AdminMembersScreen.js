import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Menu, Bell, Search, Clock, User } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import { rtlText, row } from "../../constants/rtl";
import { colors, shadows } from "../../constants/theme";
import InboxHeaderButton from "../../components/InboxHeaderButton";
import { fetchSeasonDirectory } from "../../lib/saisonsApi";
import {
  getMemberProfiles,
  getAllAcceptedInscriptions,
} from "../../lib/seancesApi";
import {
  fetchActivatedMemberIdsForSeason,
  isAcceptedInActiveSeason,
} from "../../lib/membersApi";
import { getAllProgressionAdmin, computeProgressMetrics } from "../../lib/progressApi";
import { initials } from "../supervisor/supervisorHelpers";
import ProfileAvatar from "../../components/ProfileAvatar";
import AdminTopBarAvatar from "../../components/admin/AdminTopBarAvatar";
import { displayProfileEmail } from "../../lib/authEmail";

const palette = {
  primary: "#2E7D32",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  placeholder: "#999999",
  border: "#E0E0E0",
  inactive: "#9E9E9E",
  softAmber: "#FFF8E1",
  amber: "#8D6E00",
};

const CATEGORY_REGISTERED = "registered";
const CATEGORY_WAITING = "waiting";
const CATEGORY_OTHER = "other";

function supervisorName(profile) {
  if (!profile) return null;
  const name = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
  return name || displayProfileEmail(profile) || null;
}

function inscriptionTime(inscription) {
  return new Date(inscription?.date_inscription || 0).getTime() || 0;
}

function latestInscription(rows) {
  if (!rows?.length) return null;
  return [...rows].sort((a, b) => inscriptionTime(b) - inscriptionTime(a))[0];
}

function formatLastSeance(inscription, seasonNames) {
  const seanceName = inscription?.seance?.nom || null;
  if (!seanceName) return null;
  const seasonId = String(inscription.saison_id || inscription.seance?.saison_id || "");
  const seasonName = seasonNames[seasonId] || "";
  if (!seasonName) return `آخر حصة: ${seanceName}`;
  return `آخر حصة: ${seanceName} (${seasonName})`;
}

export default function AdminMembersScreen({ navigation }) {
  const { openSidebar, sidebar, messagesFab } = useAdminSidebar(navigation, "members");
  const { currentUser } = useApp();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profilesError, setProfilesError] = useState(false);
  const [inscriptionsOk, setInscriptionsOk] = useState(true);
  const [progressOk, setProgressOk] = useState(true);
  const [applicationsOk, setApplicationsOk] = useState(true);
  const [activeSeason, setActiveSeason] = useState(null);
  const [activeSeasonIds, setActiveSeasonIds] = useState([]);
  const [seasonNames, setSeasonNames] = useState({});
  const [profiles, setProfiles] = useState([]);
  const [inscriptions, setInscriptions] = useState([]);
  const [activatedIds, setActivatedIds] = useState([]);
  const [progressions, setProgressions] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(CATEGORY_REGISTERED);
  const categoryTouchedRef = useRef(false);
  const categoryDefaultedRef = useRef(false);
  const [avatarNonce, setAvatarNonce] = useState(() => Date.now());
  const loadSeq = useRef(0);

  const loadMembers = useCallback(async (mode) => {
    const seq = ++loadSeq.current;
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    try {
      const seasonRes = await fetchSeasonDirectory();
      if (seq !== loadSeq.current) return;
      if (!seasonRes.ok) {
        console.warn("[AdminMembers] fetchSeasonDirectory failed:", seasonRes.error);
        setProfilesError(true);
        return;
      }
      const names = {};
      (seasonRes.seasons || []).forEach((season) => {
        names[String(season.id)] = season.name || "";
      });
      setSeasonNames(names);
      setActiveSeason(seasonRes.activeSeason);
      const activeIds = (seasonRes.seasons || [])
        .filter((season) => season.active)
        .map((season) => String(season.id));
      setActiveSeasonIds(activeIds);
      if (!seasonRes.activeSeason && activeIds.length === 0) {
        setProfiles([]);
        setInscriptions([]);
        setActivatedIds([]);
        setProgressions([]);
        setProfilesError(false);
        setInscriptionsOk(true);
        setProgressOk(true);
        setApplicationsOk(true);
        return;
      }

      const [profRes, inscRes, progRes, appsRes] = await Promise.all([
        getMemberProfiles(),
        getAllAcceptedInscriptions(),
        getAllProgressionAdmin(),
        fetchActivatedMemberIdsForSeason(activeIds),
      ]);
      if (seq !== loadSeq.current) return;
      if (profRes.ok) {
        setProfiles(profRes.members);
        setProfilesError(false);
      } else {
        console.warn("[AdminMembers] getMemberProfiles failed:", profRes.error);
        setProfilesError(true);
      }
      if (inscRes.ok) {
        setInscriptions(inscRes.inscriptions);
        setInscriptionsOk(true);
      } else {
        setInscriptions([]);
        setInscriptionsOk(false);
      }
      if (progRes.ok) {
        setProgressions(progRes.entries);
        setProgressOk(true);
      } else {
        setProgressions([]);
        setProgressOk(false);
      }
      if (appsRes.ok) {
        setActivatedIds(appsRes.ids);
        setApplicationsOk(true);
      } else {
        setActivatedIds([]);
        setApplicationsOk(false);
      }
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setAvatarNonce(Date.now());
      loadMembers("initial");
    }, [loadMembers])
  );

  const activatedSet = useMemo(() => new Set(activatedIds), [activatedIds]);
  const activeIdSet = useMemo(() => new Set(activeSeasonIds), [activeSeasonIds]);

  const members = useMemo(() => {
    const byMember = new Map();
    inscriptions.forEach((inscription) => {
      if (!inscription.membre_id) return;
      if (!byMember.has(inscription.membre_id)) byMember.set(inscription.membre_id, []);
      byMember.get(inscription.membre_id).push(inscription);
    });

    return profiles
      .filter((profile) => profile.account_status !== "invited")
      .map((profile) => {
        const memberInscriptions = byMember.get(profile.id) || [];
        const current = latestInscription(
          memberInscriptions.filter((row) =>
            isAcceptedInActiveSeason(row, activeIdSet)
          )
        );
        const hasArchived = memberInscriptions.some((row) =>
          isAcceptedInActiveSeason(row, activeIdSet, { archivedOnly: true })
        );
        const categoryKey = current
          ? CATEGORY_REGISTERED
          : activatedSet.has(profile.id) || hasArchived
            ? CATEGORY_WAITING
            : CATEGORY_OTHER;

        const entries = progressions
          .filter((entry) => entry.membre_id === profile.id)
          .sort((a, b) => {
            const byDate =
              new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
            if (byDate !== 0) return byDate;
            return String(b.id || "").localeCompare(String(a.id || ""));
          });
        const latest = entries[0];
        const metrics = progressOk && latest ? computeProgressMetrics(latest) : null;
        const pct = metrics?.globalPct ?? null;
        const name = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
        const seance = current?.seance || null;

        const lastSeanceLabel =
          categoryKey === CATEGORY_OTHER
            ? formatLastSeance(latestInscription(memberInscriptions), seasonNames)
            : null;

        return {
          id: profile.id,
          name,
          firstName: profile.first_name || "",
          lastName: profile.last_name || "",
          avatarUrl: profile.avatar_url || null,
          email: profile.email || "",
          phone: profile.phone || null,
          school: profile.school || null,
          levelLabel: profile.level || null,
          hifzAmount: profile.hifz_amount || null,
          pct,
          category: categoryKey,
          session: !inscriptionsOk ? "—" : seance?.nom || null,
          seanceId: current?.seance_id || seance?.id || null,
          inscriptionId: current?.id || null,
          saisonId: activeSeason?.id || null,
          seasonName: activeSeason?.name || null,
          supervisorName: current ? supervisorName(seance?.superviseur) : null,
          lastSeanceLabel,
          registrationDate: current?.date_inscription || null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [
    profiles,
    inscriptions,
    progressions,
    activatedSet,
    activeIdSet,
    seasonNames,
    activeSeason,
    inscriptionsOk,
    progressOk,
  ]);

  const categoryCounts = useMemo(() => {
    const counts = {
      [CATEGORY_REGISTERED]: 0,
      [CATEGORY_WAITING]: 0,
      [CATEGORY_OTHER]: 0,
    };
    members.forEach((member) => {
      counts[member.category] += 1;
    });
    return counts;
  }, [members]);

  // Premier onglet non vide, une fois les comptes connus. Un appui explicite reste prioritaire.
  useEffect(() => {
    if (categoryTouchedRef.current || categoryDefaultedRef.current || loading) return;
    if (profilesError) return;
    const order = [CATEGORY_REGISTERED, CATEGORY_WAITING, CATEGORY_OTHER];
    const first = order.find((key) => (categoryCounts[key] || 0) > 0);
    if (!first) return;
    categoryDefaultedRef.current = true;
    setCategory(first);
  }, [categoryCounts, loading, profilesError]);

  const chooseCategory = (next) => {
    categoryTouchedRef.current = true;
    setCategory(next);
  };

  const q = search.trim().toLowerCase();
  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      if (member.category !== category) return false;
      if (!q) return true;
      return (
        member.name.toLowerCase().includes(q) ||
        member.email.toLowerCase().includes(q) ||
        (member.supervisorName || "").toLowerCase().includes(q)
      );
    });
  }, [members, category, q]);

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
      groupName: member.session && member.session !== "—" ? member.session : null,
      registrationDate: member.registrationDate,
      supervisorName: member.supervisorName,
      seasonName: member.seasonName,
      canEditSeance: true,
      adminTheme: true,
      viewerRole: "admin",
    });
  };

  const emptyMessage = (() => {
    if (members.length === 0) return "لا يوجد أعضاء في التطبيق بعد";
    if (q) return "لا توجد نتائج مطابقة للبحث";
    if (category === CATEGORY_WAITING) return "لا يوجد أعضاء بانتظار حصة";
    if (category === CATEGORY_OTHER) return "لا يوجد أعضاء غير مسجّلين";
    return "لا يوجد أعضاء مسجّلون في هذا الموسم";
  })();

  const partialWarning = (() => {
    const parts = [];
    if (!inscriptionsOk) parts.push("الحصص");
    if (!applicationsOk) parts.push("الطلبات المفعّلة");
    if (!progressOk) parts.push("نسب التقدم");
    if (parts.length === 0) return null;
    return `تعذّر تحميل ${parts.join(" و")}`;
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
        <InboxHeaderButton
          navigation={navigation}
          color={colors.muted}
          variant="lucide"
          size={24}
        />
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminRegistrations")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="طلبات الانضمام والتسجيل"
        >
          <Bell size={24} color={palette.textSecondary} pointerEvents="none" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadMembers("refresh")}
            colors={[palette.primary]}
            tintColor={palette.primary}
          />
        }
      >
        <View style={styles.searchContainer}>
          <Search size={20} color={palette.placeholder} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="ابحث بالاسم أو البريد أو المشرف..."
            placeholderTextColor={palette.placeholder}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
        </View>

        {activeSeason?.name ? (
          <Text style={styles.currentSeasonLabel}>الموسم الحالي: {activeSeason.name}</Text>
        ) : null}

        {!loading && !profilesError && !activeSeason ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>لا يوجد موسم نشط</Text>
          </View>
        ) : (
          <>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          <FilterChip
            label={`المسجّلون (${categoryCounts[CATEGORY_REGISTERED]})`}
            active={category === CATEGORY_REGISTERED}
            onPress={() => chooseCategory(CATEGORY_REGISTERED)}
          />
          <FilterChip
            label={`مسجّلون بدون حصة (${categoryCounts[CATEGORY_WAITING]})`}
            active={category === CATEGORY_WAITING}
            onPress={() => chooseCategory(CATEGORY_WAITING)}
          />
          <FilterChip
            label={`غير مسجّلين (${categoryCounts[CATEGORY_OTHER]})`}
            active={category === CATEGORY_OTHER}
            onPress={() => chooseCategory(CATEGORY_OTHER)}
          />
        </ScrollView>

        {loading && !refreshing ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="large" color={palette.primary} />
          </View>
        ) : profilesError ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>تعذّر تحميل الأعضاء</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => loadMembers("initial")}
              accessibilityRole="button"
              accessibilityLabel="إعادة المحاولة"
            >
              <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {partialWarning ? (
              <View style={styles.warningBanner}>
                <Text style={styles.warningText}>{partialWarning}</Text>
              </View>
            ) : null}
            {filteredMembers.length === 0 ? (
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
          </>
        )}
          </>
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
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`عرض ملف ${member.name || "عضو"}`}
    >
      <View style={styles.identityRow}>
        <ProfileAvatar
          userId={member.id}
          avatarUrl={member.avatarUrl}
          cacheKey={member.avatarUrl || `${member.id}-${avatarNonce}`}
          fallbackLetter={initials(member.firstName || member.name)}
          size={44}
          softBackgroundColor={palette.softGreen}
          letterColor={palette.primary}
        />
        <Text style={styles.cardName} numberOfLines={1}>
          {member.name || "عضو"}
        </Text>
      </View>

      {member.category === CATEGORY_REGISTERED ? (
        <View style={styles.chipRow}>
          <View style={styles.sessionChip}>
            <Clock size={13} color={palette.textSecondary} pointerEvents="none" />
            <Text style={styles.sessionChipText} numberOfLines={1}>
              {member.session || "—"}
            </Text>
          </View>
        </View>
      ) : null}

      {member.category === CATEGORY_WAITING ? (
        <View style={styles.chipRow}>
          <View style={styles.waitingChip}>
            <Text style={styles.waitingChipText}>بدون حصة</Text>
          </View>
        </View>
      ) : null}

      {member.category === CATEGORY_OTHER ? (
        <View style={styles.chipRow}>
          <View style={[styles.sessionChip, styles.sessionChipEmpty]}>
            <Text style={styles.sessionChipTextEmpty}>غير مسجّل هذا الموسم</Text>
          </View>
        </View>
      ) : null}

      {member.category === CATEGORY_REGISTERED ? (
        <View style={styles.supervisorRow}>
          <User size={13} color={palette.textSecondary} pointerEvents="none" />
          <Text style={styles.supervisorText} numberOfLines={1}>
            المشرف: {member.supervisorName || "—"}
          </Text>
        </View>
      ) : null}

      {member.category === CATEGORY_WAITING ? (
        <Text style={styles.assignHint}>يجب تعيين حصة</Text>
      ) : null}

      {member.category === CATEGORY_OTHER && member.lastSeanceLabel ? (
        <Text style={styles.lastSeanceText}>{member.lastSeanceLabel}</Text>
      ) : null}

      {member.category === CATEGORY_REGISTERED ? (
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: member.pct == null ? "0%" : `${Math.max(0, Math.min(100, member.pct))}%` },
              ]}
            />
          </View>
          <Text style={styles.progressPct}>
            {member.pct == null ? "—" : `${member.pct}%`}
          </Text>
        </View>
      ) : null}
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
  searchContainer: {
    position: "relative",
    marginBottom: 8,
  },
  currentSeasonLabel: {
    fontSize: 12,
    color: palette.textSecondary,
    marginBottom: 12,
    ...rtlText,
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
  retryBtn: {
    marginTop: 16,
    backgroundColor: palette.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  retryBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  warningBanner: {
    backgroundColor: "#FFF8E1",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FFE082",
  },
  warningText: {
    color: "#8D6E00",
    fontSize: 14,
    ...rtlText,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 10,
    ...shadows.card,
  },
  identityRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
  },
  cardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: palette.textPrimary,
    ...rtlText,
  },
  chipRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  sessionChip: {
    flexDirection: row,
    alignItems: "center",
    gap: 4,
    maxWidth: "70%",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#F5F5F5",
  },
  sessionChipEmpty: {
    backgroundColor: "#EEEEEE",
  },
  sessionChipText: {
    flexShrink: 1,
    fontSize: 12,
    color: palette.textSecondary,
    ...rtlText,
  },
  sessionChipTextEmpty: {
    color: palette.inactive,
    fontWeight: "600",
    ...rtlText,
  },
  waitingChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: palette.softAmber,
  },
  waitingChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.amber,
    ...rtlText,
  },
  assignHint: {
    fontSize: 13,
    color: palette.textPrimary,
    ...rtlText,
  },
  lastSeanceText: {
    fontSize: 12,
    color: palette.inactive,
    ...rtlText,
  },
  supervisorRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 4,
  },
  supervisorText: {
    flex: 1,
    fontSize: 12,
    color: palette.textSecondary,
    ...rtlText,
  },
  progressRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
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