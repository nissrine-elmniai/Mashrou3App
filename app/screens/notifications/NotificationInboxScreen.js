import React, { useCallback, useEffect, useState } from "react";
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
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, fonts, arrowBack, row, isRTL } from "../../constants/rtl";
import { EmptyState } from "../../components/ui";
import {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeMyNotifications,
  NOTIFICATION_CATEGORY_LABELS,
} from "../../lib/notificationsApi";
import { navigateFromNotificationPayload } from "../../lib/notificationNavigation";

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

export default function NotificationInboxScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async ({ reset = true } = {}) => {
    const offset = reset ? 0 : items.length;
    const res = await listMyNotifications({ offset });
    if (!res.ok) {
      if (reset) {
        Alert.alert("تنبيه", res.error || "تعذر تحميل الإشعارات");
      }
      return;
    }
    setHasMore(!!res.hasMore);
    setItems((prev) =>
      reset ? res.notifications : [...prev, ...res.notifications]
    );
  }, [items.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await listMyNotifications({ offset: 0 });
      if (cancelled) return;
      if (res.ok) {
        setItems(res.notifications);
        setHasMore(!!res.hasMore);
      } else {
        Alert.alert("تنبيه", res.error || "تعذر تحميل الإشعارات");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeMyNotifications(() => {
      listMyNotifications({ offset: 0 }).then((res) => {
        if (res.ok) {
          setItems(res.notifications);
          setHasMore(!!res.hasMore);
        }
      });
    });
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const res = await listMyNotifications({ offset: 0 });
    if (res.ok) {
      setItems(res.notifications);
      setHasMore(!!res.hasMore);
    }
    setRefreshing(false);
  }, []);

  const onEndReached = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    await load({ reset: false });
    setLoadingMore(false);
  }, [hasMore, loadingMore, loading, load]);

  const openItem = async (item) => {
    if (item.unread) {
      await markNotificationRead(item.id);
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? { ...row, unread: false, readAt: new Date().toISOString() }
            : row
        )
      );
    }
    navigateFromNotificationPayload(navigation, item.payload);
  };

  const handleMarkAll = () => {
    Alert.alert("تعليم الكل كمقروء", "هل تريد تعليم كل الإشعارات كمقروءة؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "نعم",
        onPress: async () => {
          setMarkingAll(true);
          const res = await markAllNotificationsRead();
          setMarkingAll(false);
          if (!res.ok) {
            Alert.alert("تنبيه", res.error || "تعذر التحديث");
            return;
          }
          const now = new Date().toISOString();
          setItems((prev) =>
            prev.map((row) => ({ ...row, unread: false, readAt: row.readAt || now }))
          );
        },
      },
    ]);
  };

  const unreadCount = items.filter((i) => i.unread).length;

  const renderItem = ({ item }) => {
    const catLabel =
      NOTIFICATION_CATEGORY_LABELS[item.category] || item.category;
    return (
      <TouchableOpacity
        style={[styles.card, item.unread ? styles.cardNew : styles.cardRead]}
        onPress={() => openItem(item)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={item.title}
      >
        <View style={styles.cardTop}>
          <View style={styles.senderRow}>
            <View style={styles.iconBadge}>
              <Ionicons
                name={item.unread ? "mail-unread-outline" : "mail-open-outline"}
                size={16}
                color={colors.primary}
              />
            </View>
            <Text style={styles.category}>{catLabel}</Text>
          </View>
          <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
        </View>
        <View style={styles.goldLine} />
        <Text style={styles.title}>{item.title}</Text>
        {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
      </TouchableOpacity>
    );
  };

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

      {unreadCount > 0 ? (
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
          data={items}
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
                name="mail-outline"
                size={36}
                color={colors.primary}
              />
              <EmptyState text="لا توجد إشعارات" />
              <Text style={styles.emptyHint}>
                ستظهر هنا التنبيهات والتحديثات الخاصة بحسابك
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                color={colors.primary}
                style={styles.footerLoader}
              />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const alignEdge = isRTL ? "flex-start" : "flex-end";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
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
  emptyHint: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 20,
    ...rtlText,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    ...shadows.card,
  },
  cardNew: {
    borderColor: colors.borderGreen,
    backgroundColor: colors.primarySoft,
  },
  cardRead: {
    borderColor: colors.border,
  },
  cardTop: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  senderRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  category: {
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
});
