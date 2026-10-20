import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Menu, Bell } from "lucide-react-native";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, fonts, arrowBack, row, isRTL } from "../../constants/rtl";
import { EmptyState } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import AdminTopBarAvatar from "../../components/admin/AdminTopBarAvatar";
import { ROLES, resolveSessionRole } from "../../constants/roles";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import { subscribeToNewAlerts } from "../../lib/alertsApi";
import {
  listMyNotifications,
  markAllNotificationsRead,
  subscribeMyNotifications,
  NOTIFICATION_CATEGORY_LABELS,
} from "../../lib/notificationsApi";
import {
  cachedAlertsWithAck,
  cachedNotificationsFirstPage,
} from "../../lib/messagingOfflineReads";
import { OFFLINE_UNAVAILABLE_MESSAGE } from "../../lib/offlineCache";
import { isOffline } from "../../lib/networkState";
import { requireOnline } from "../../lib/toast";
import { useOfflineReload } from "../../hooks/useOfflineReload";
import { useFocusEffect } from "@react-navigation/native";
import { openNotification } from "../../lib/notificationNavigation";

function formatTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ar-MA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function parseCreatedAtMs(iso) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? t : 0;
}

function mapAlertItem(alert) {
  return {
    kind: "alert",
    id: `alert:${alert.id}`,
    sourceId: alert.id,
    title: "إشعار الإدارة",
    body: alert.message || "",
    createdAt: alert.createdAt,
    acknowledged: !!alert.acknowledged,
    senderName: alert.senderName || "الإدارة",
  };
}

function mapNotificationItem(n) {
  return {
    kind: "notification",
    id: `notification:${n.id}`,
    sourceId: n.id,
    title: n.title || "",
    body: n.body || "",
    createdAt: n.createdAt,
    unread: !!n.unread,
    category: n.category,
    eventType: n.eventType,
    payload: n.payload,
  };
}

/**
 * Liste unique : alertes RG9 (restent, fond blanc si déjà vues) +
 * notifications non lues (disparaissent après lecture).
 * Pas d’acquittement manuel ici — BlockingAlertGate conserve RG9.
 */
export default function UnifiedInboxScreen({ navigation }) {
  const { currentUser, seasons } = useApp();
  const activeSeasonId = getActiveRegularSeason(seasons)?.id || null;
  const sessionRole = resolveSessionRole(currentUser);
  const isAdmin = sessionRole === ROLES.ADMIN;
  const { openSidebar, sidebar, messagesFab } = useAdminSidebar(
    navigation,
    "inbox"
  );
  let alertsRole = null;
  if (sessionRole === ROLES.SUPERVISOR) alertsRole = "supervisor";
  else if (sessionRole === ROLES.MEMBER) alertsRole = "member";

  const [alerts, setAlerts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  /** Alertes / notifications jamais lues (hors ligne, sans cache) : pas « aucune notification ». */
  const [alertsUnknown, setAlertsUnknown] = useState(false);
  const [notificationsUnknown, setNotificationsUnknown] = useState(false);
  /** Page suivante demandée hors ligne : seules les premières sont en cache. */
  const [moreUnavailable, setMoreUnavailable] = useState(false);
  // Retour du réseau : rechargement (aussi rechargé au focus, pas de différé).
  const reloadRef = useRef(null);
  const markOffline = useOfflineReload(() => reloadRef.current?.());

  const loadAlerts = useCallback(async () => {
    if (!alertsRole) {
      setAlerts([]);
      return { ok: true };
    }
    // Clé mem.|sup.alerts.withAck.<saison> ; null → alertsApi résout la saison active en DB.
    const res = await cachedAlertsWithAck(alertsRole, activeSeasonId);
    markOffline(res);
    if (res.ok) {
      setAlerts(res.alerts || []);
      setAlertsUnknown(false);
    } else if (res.offline) {
      setAlertsUnknown(true);
    }
    return res;
  }, [alertsRole, activeSeasonId, markOffline]);

  const loadNotifications = useCallback(async ({ offset = 0, append = false } = {}) => {
    // Première page : cache common.notifications.page1. Pages suivantes : non
    // mises en cache, aucune requête hors ligne.
    if (offset > 0 && isOffline()) {
      setMoreUnavailable(true);
      return { ok: false, offline: true };
    }
    const res =
      offset > 0 ? await listMyNotifications({ offset }) : await cachedNotificationsFirstPage();
    if (offset === 0) markOffline(res);
    if (!res.ok) {
      if (offset === 0 && res.offline) setNotificationsUnknown(true);
      return res;
    }
    if (offset === 0) setNotificationsUnknown(false);
    setMoreUnavailable(false);
    setHasMore(!!res.hasMore);
    setNotifications((prev) =>
      append ? [...prev, ...(res.notifications || [])] : res.notifications || []
    );
    return res;
  }, [markOffline]);

  const loadAll = useCallback(async () => {
    const [alertsRes, notifRes] = await Promise.all([
      loadAlerts(),
      loadNotifications({ offset: 0, append: false }),
    ]);
    return { alertsRes, notifRes };
  }, [loadAlerts, loadNotifications]);

  const loadWithFeedback = useCallback(async (isCancelled = () => false) => {
    setLoading(true);
    const { alertsRes, notifRes } = await loadAll();
    if (isCancelled()) return;
    // Hors ligne (cache servi ou donnée inconnue) : pas d'Alert à chaque échec.
    if (!alertsRes.ok && alertsRole && !alertsRes.offline) {
      Alert.alert("إشعار", alertsRes.error || "تعذر تحميل الإشعارات");
    }
    if (!notifRes.ok && !notifRes.offline) {
      Alert.alert("إشعار", notifRes.error || "تعذر تحميل الإشعارات");
    }
    setLoading(false);
  }, [loadAll, alertsRole]);
  reloadRef.current = () => loadWithFeedback();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadWithFeedback(() => cancelled);
      return () => {
        cancelled = true;
      };
    }, [loadWithFeedback])
  );

  useEffect(() => {
    const unsubAlerts = subscribeToNewAlerts(() => {
      loadAlerts();
    });
    const unsubNotifs = subscribeMyNotifications(() => {
      loadNotifications({ offset: 0, append: false });
    });
    return () => {
      unsubAlerts?.();
      unsubNotifs?.();
    };
  }, [loadAlerts, loadNotifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const onEndReached = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    await loadNotifications({ offset: notifications.length, append: true });
    setLoadingMore(false);
  }, [hasMore, loadingMore, loading, loadNotifications, notifications.length]);

  const timeline = useMemo(() => {
    const merged = [
      ...alerts.map(mapAlertItem),
      ...notifications.map(mapNotificationItem),
    ];
    return merged.sort(
      (a, b) => parseCreatedAtMs(b.createdAt) - parseCreatedAtMs(a.createdAt)
    );
  }, [alerts, notifications]);

  const unreadNotifCount = notifications.length;
  const listUnknown = notificationsUnknown || (!!alertsRole && alertsUnknown);

  const openNotifItem = async (item) => {
    const { marked } = await openNotification(navigation, {
      id: item.sourceId,
      eventType: item.eventType,
      payload: item.payload,
      title: item.title,
      body: item.body,
      createdAt: item.createdAt,
      category: item.category,
    });
    if (marked) {
      setNotifications((prev) => prev.filter((row) => row.id !== item.sourceId));
    }
  };

  const handleMarkAll = () => {
    if (unreadNotifCount === 0) return;
    // Écriture : hors ligne, toast seulement.
    if (!requireOnline()) return;
    Alert.alert("تعليم الكل كمقروء", "هل تريد تعليم كل الإشعارات كمقروءة؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "نعم",
        onPress: async () => {
          // Réseau perdu pendant la confirmation.
          if (!requireOnline()) return;
          setMarkingAll(true);
          const res = await markAllNotificationsRead();
          setMarkingAll(false);
          if (!res.ok) {
            Alert.alert("إشعار", res.error || "تعذر التحديث");
            return;
          }
          setNotifications([]);
          setHasMore(false);
        },
      },
    ]);
  };

  const renderItem = ({ item }) => {
    if (item.kind === "alert") {
      return (
        <View
          style={[
            styles.card,
            item.acknowledged ? styles.cardSeen : styles.cardUnread,
          ]}
        >
          <View style={styles.cardTop}>
            <Text style={styles.kindLabel}>إشعار</Text>
            <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
          </View>
          <View style={styles.goldLine} />
          {item.senderName ? (
            <Text style={styles.sender}>{item.senderName}</Text>
          ) : null}
          <Text style={styles.title}>{item.body}</Text>
        </View>
      );
    }

    const catLabel =
      NOTIFICATION_CATEGORY_LABELS[item.category] || item.category;
    return (
      <TouchableOpacity
        style={[styles.card, styles.cardUnread]}
        onPress={() => openNotifItem(item)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={item.title}
      >
        <View style={styles.cardTop}>
          <Text style={styles.kindLabel}>
            {catLabel ? `إشعار · ${catLabel}` : "إشعار"}
          </Text>
          <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
        </View>
        <View style={styles.goldLine} />
        <Text style={styles.title}>{item.title}</Text>
        {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
      </TouchableOpacity>
    );
  };

  const listBody = (
    <>
      {unreadNotifCount > 0 ? (
        <TouchableOpacity
          style={styles.markAllBtn}
          onPress={handleMarkAll}
          disabled={markingAll}
          activeOpacity={0.85}
        >
          <Text style={styles.markAllText}>
            {markingAll ? "جاري..." : "تعليم الكل كمقروء"}
          </Text>
        </TouchableOpacity>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={timeline}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Ionicons
                name="notifications-outline"
                size={36}
                color={colors.primary}
              />
              <EmptyState text={listUnknown ? OFFLINE_UNAVAILABLE_MESSAGE : "لا توجد إشعارات"} />
            </View>
          }
          ListHeaderComponent={
            // Une des deux listes non lue hors ligne : l'autre est affichée, mais pas comme complète.
            listUnknown && timeline.length > 0 ? (
              <Text style={styles.unavailableNote}>{OFFLINE_UNAVAILABLE_MESSAGE}</Text>
            ) : null
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                color={colors.primary}
                style={styles.footerLoader}
              />
            ) : moreUnavailable && hasMore ? (
              <Text style={styles.unavailableNote}>{OFFLINE_UNAVAILABLE_MESSAGE}</Text>
            ) : null
          }
        />
      )}
    </>
  );

  if (isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
        <View style={styles.adminTopBar}>
          <TouchableOpacity
            onPress={openSidebar}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="فتح القائمة"
          >
            <Menu size={24} color={colors.text} pointerEvents="none" />
          </TouchableOpacity>
          <Text style={styles.adminTopBarTitle}>الإشعارات</Text>
          <AdminTopBarAvatar
            currentUser={currentUser}
            onPress={() => navigation.navigate("AdminProfile")}
          />
          <TouchableOpacity
            onPress={() => navigation.navigate("AdminRegistrations")}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="طلبات الانضمام والتسجيل"
          >
            <Bell size={24} color={colors.muted} pointerEvents="none" />
          </TouchableOpacity>
        </View>
        {listBody}
        {messagesFab}
        {sidebar}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      <View style={styles.headerWrap}>
        <LinearGradient colors={colors.gradientHeader} style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => navigation.goBack()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="رجوع"
            >
              <Ionicons name={arrowBack} size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>الإشعارات</Text>
            </View>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => navigation.navigate("NotificationSettings")}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="إعدادات الإشعارات"
            >
              <Ionicons name="settings-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      {listBody}
    </SafeAreaView>
  );
}

const alignEdge = isRTL ? "flex-start" : "flex-end";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  adminTopBar: {
    backgroundColor: colors.card,
    padding: 16,
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  adminTopBarTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    color: colors.text,
    fontSize: 16,
    ...rtlText,
  },
  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  header: {
    borderRadius: radii.lg,
    overflow: "hidden",
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 14,
  },
  headerRow: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: {
    flex: 1,
    alignItems: alignEdge,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: fonts.bold,
    textAlign: "right",
    ...rtlText,
  },
  markAllBtn: {
    alignSelf: "flex-end",
    marginHorizontal: 16,
    marginBottom: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  markAllText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 13,
    ...rtlText,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: 28,
    alignItems: "center",
    ...shadows.card,
  },
  card: {
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    ...shadows.card,
  },
  cardUnread: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.borderGreen,
  },
  cardSeen: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  cardTop: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  kindLabel: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  time: {
    fontSize: 11,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  goldLine: {
    height: 2,
    backgroundColor: colors.goldSoft,
    borderRadius: 1,
    marginVertical: 10,
  },
  sender: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.medium,
    marginBottom: 4,
    ...rtlText,
  },
  title: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.text,
    ...rtlText,
  },
  body: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  footerLoader: { marginVertical: 12 },
  unavailableNote: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.muted,
    textAlign: "center",
    marginVertical: 10,
  },
});
