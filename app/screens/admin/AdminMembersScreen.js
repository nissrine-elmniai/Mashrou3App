import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Menu, Bell, ClipboardList } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { rtlText, row } from "../../constants/rtl";
import {
  getMemberProfiles,
  getAllAcceptedInscriptions,
} from "../../lib/seancesApi";
import { getAllProgressionAdmin } from "../../lib/progressApi";
import {
  LEVEL_COLORS,
  deriveLevel,
  initials,
} from "../supervisor/supervisorHelpers";

const palette = {
  primary: "#2E7D32",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  softGold: "#FFF8E1",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  border: "#E0E0E0",
  inactive: "#9E9E9E",
};

function levelColor(level) {
  return LEVEL_COLORS[level] || palette.primary;
}

export default function AdminMembersScreen({ navigation }) {
  const { stats, currentUser } = useApp();

  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState([]);
  const [inscriptions, setInscriptions] = useState([]);
  const [progressions, setProgressions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [profRes, inscRes, progRes] = await Promise.all([
        getMemberProfiles(),
        getAllAcceptedInscriptions(),
        getAllProgressionAdmin(),
      ]);
      if (cancelled) return;
      if (profRes.ok) setProfiles(profRes.members);
      if (inscRes.ok) setInscriptions(inscRes.inscriptions);
      if (progRes.ok) setProgressions(progRes.entries);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const members = useMemo(() => {
    return profiles
      .filter((p) => p.account_status !== "invited")
      .map((p) => {
        const inscription = inscriptions.find((i) => i.membre_id === p.id);
        const entries = progressions
          .filter((e) => e.membre_id === p.id)
          .sort((a, b) => {
            const d = (x) => `${x.date_saisie}T${x.created_at || ""}`;
            return d(b) < d(a) ? -1 : 1;
          });
        const latest = entries[0];
        const juze = latest?.juze || 0;
        const pct = Math.min(100, Math.round((juze / 30) * 100));
        const level = deriveLevel(pct);
        const name = `${p.first_name || ""} ${p.last_name || ""}`.trim();
        return {
          id: p.id,
          name,
          firstName: p.first_name || "",
          level,
          pct,
          session: inscription?.seance?.nom || "بدون حصة",
          active: !!inscription,
        };
      });
  }, [profiles, inscriptions, progressions]);

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = displayName.charAt(0) || "م";
  const pendingCount = stats?.pendingRegs ?? 0;

  return (
    <SafeAreaView
      style={[styles.container, { paddingBottom: 16 }]}
      edges={["top", "bottom"]}
    >
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="رجوع"
        >
          <Menu size={24} color={palette.textPrimary} pointerEvents="none" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>الأعضاء</Text>
        <TouchableOpacity
          style={styles.topBarAvatar}
          onPress={() => navigation.navigate("AdminProfile")}
          hitSlop={8}
        >
          <Text style={styles.topBarAvatarText}>{initial}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminRegistrations")}
          hitSlop={12}
        >
          <Bell size={24} color={palette.textSecondary} pointerEvents="none" />
          {pendingCount > 0 ? (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>
                {pendingCount > 9 ? "9+" : pendingCount}
              </Text>
            </View>
          ) : null}
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

        <Text style={styles.sectionTitle}>جميع الأعضاء</Text>

        {loading ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="large" color={palette.primary} />
          </View>
        ) : members.length === 0 ? (
          <Text style={styles.emptyText}>لا يوجد أعضاء بعد</Text>
        ) : (
          members.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MemberCard({ member }) {
  const color = levelColor(member.level);
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardAvatar}>
          <Text style={styles.cardAvatarText}>
            {initials(member.firstName || member.name)}
          </Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{member.name || "عضو"}</Text>
          <View style={styles.cardMeta}>
            <View style={[styles.levelPill, { backgroundColor: `${color}22` }]}>
              <Text style={[styles.levelPillText, { color }]}>
                {member.level}
              </Text>
            </View>
            <Text style={styles.sessionText}>{member.session}</Text>
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
    </View>
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