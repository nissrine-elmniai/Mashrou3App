import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Modal,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  X,
  Home,
  Users,
  UserCog,
  Calendar,
  CalendarPlus,
  ClipboardList,
  FileText,
  Bell,
  MessageSquare,
  Settings,
  LogOut,
  BarChart3,
} from "lucide-react-native";
import { useApp } from "../context/AppContext";
import { rtlText, row, isRTL } from "../constants/rtl";
import { useInboxThreads } from "../hooks/useInboxThreads";
import { formatUnreadBadge } from "../lib/messagesApi";
import AdminMessagesFab from "./AdminMessagesFab";

const palette = {
  primary: "#2E7D32",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  textSecondary: "#666666",
  textPrimary: "#333333",
  border: "#E0E0E0",
};

const SIDEBAR_WIDTH = 280;

const MENU_ITEMS = [
  { id: "home", label: "الرئيسية", icon: Home },
  { id: "supervisors", label: "المشرفون", icon: UserCog },
  { id: "members", label: "الأعضاء", icon: Users },
  { id: "newSeason", label: "انطلاق موسم جديد", icon: CalendarPlus },
  { id: "registrations", label: "طلبات التسجيل", icon: FileText },
  { id: "sessions", label: "الحصص", icon: Calendar },
  { id: "tests", label: "الاختبارات", icon: ClipboardList },
  { id: "stats", label: "الإحصائيات", icon: BarChart3 },
  { id: "notifications", label: "التنبيهات", icon: Bell },
  { id: "chat", label: "المحادثات", icon: MessageSquare },
  { id: "settings", label: "الإعدادات", icon: Settings },
];

const ROUTE_MAP = {
  home: "AdminDashboard",
  supervisors: "AdminSupervisors",
  members: "AdminMembers",
  newSeason: "AdminNewSeason",
  registrations: "AdminRegistrations",
  sessions: "AdminSeasons",
  tests: "AdminTests",
  stats: "AdminStats",
  notifications: "AdminNotifications",
  chat: "AdminChat",
  settings: "AdminSettings",
};

export function AdminSidebar({
  isOpen,
  onClose,
  navigation,
  currentUser,
  onLogout,
  activeItem = "home",
  unreadTotal = 0,
}) {
  const translateX = useRef(new Animated.Value(SIDEBAR_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: SIDEBAR_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen, overlayOpacity, translateX]);

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "محمد أحمد";
  const initial = displayName.charAt(0) || "م";

  const handlePress = (id) => {
    onClose();
    if (id === activeItem) return;
    const routeName = ROUTE_MAP[id];
    if (!routeName) return;

    if (id === "home" || activeItem === "home") {
      navigation.navigate(routeName);
      return;
    }

    navigation.replace(routeName);
  };

  return (
    <Modal visible={isOpen} transparent animationType="none" onRequestClose={onClose}>
      <View style={sbStyles.modalContainer}>
        <Animated.View
          style={[sbStyles.overlay, { opacity: overlayOpacity }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={onClose}
          />
        </Animated.View>

        <Animated.View
          style={[
            sbStyles.sidebar,
            isRTL ? { left: 0 } : { right: 0 },
            {
              top: insets.top,
              bottom: Math.max(insets.bottom, 16),
              transform: [{ translateX }],
            },
          ]}
        >
          <View style={sbStyles.header}>
            <View style={sbStyles.avatar}>
              <Text style={sbStyles.avatarText}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={sbStyles.role}>مشرف عام</Text>
              <Text style={sbStyles.name}>{displayName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <X size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={sbStyles.menuScroll}
            contentContainerStyle={sbStyles.menuList}
            showsVerticalScrollIndicator={false}
          >
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeItem;
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => handlePress(item.id)}
                  style={[
                    sbStyles.menuItem,
                    isActive && sbStyles.menuItemActive,
                  ]}
                >
                  <Icon
                    size={20}
                    color={isActive ? palette.primary : palette.textSecondary}
                    pointerEvents="none"
                  />
                  <Text
                    style={[
                      sbStyles.menuItemText,
                      isActive && sbStyles.menuItemTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {item.id === "chat" && unreadTotal > 0 ? (
                    <View style={sbStyles.unreadBadge}>
                      <Text style={sbStyles.unreadBadgeText}>
                        {formatUnreadBadge(unreadTotal)}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={sbStyles.logoutWrap}>
            <TouchableOpacity
              style={sbStyles.logoutBtn}
              onPress={onLogout}
              activeOpacity={0.7}
            >
              <LogOut size={20} color={palette.red} pointerEvents="none" />
              <Text style={sbStyles.logoutText}>تسجيل الخروج</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function AdminChatFab({ navigation, hidden = false }) {
  const insets = useSafeAreaInsets();
  if (hidden) return null;

  return (
    <TouchableOpacity
      style={[
        fabStyles.fab,
        { bottom: Math.max(insets.bottom, 16) + 16 },
      ]}
      onPress={() => navigation.navigate("AdminChat")}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="المحادثات"
    >
      <Ionicons
        name="chatbubble-ellipses"
        size={24}
        color="#fff"
        pointerEvents="none"
      />
    </TouchableOpacity>
  );
}

export function useAdminSidebar(navigation, activeItem = "home") {
  const [isOpen, setIsOpen] = useState(false);
  const { currentUser, logout } = useApp();
  const { threads, loading: threadsLoading } = useInboxThreads();
  const unreadTotal = useMemo(
    () => (threads || []).reduce((sum, t) => sum + (Number(t.unreadCount) || 0), 0),
    [threads]
  );

  const handleLogout = () => {
    Alert.alert("تسجيل الخروج", "هل تريد تسجيل الخروج من الحساب؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "خروج",
        style: "destructive",
        onPress: async () => {
          setIsOpen(false);
          await logout();
          navigation.reset({ index: 0, routes: [{ name: "Login" }] });
        },
      },
    ]);
  };

  return {
    openSidebar: () => setIsOpen(true),
    threads,
    threadsLoading,
    unreadTotal,
    messagesFab: (
      <AdminMessagesFab
        navigation={navigation}
        unreadTotal={unreadTotal}
        hidden={activeItem === "chat"}
      />
    ),
    sidebar: (
      <AdminSidebar
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        navigation={navigation}
        currentUser={currentUser}
        onLogout={handleLogout}
        activeItem={activeItem}
        unreadTotal={unreadTotal}
      />
    ),
  };
}

const fabStyles = StyleSheet.create({
  fab: {
    position: "absolute",
    end: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    zIndex: 5,
  },
});

const sbStyles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sidebar: {
    position: "absolute",
    width: SIDEBAR_WIDTH,
    backgroundColor: "#fff",
    elevation: 10,
    zIndex: 2,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  header: {
    backgroundColor: palette.primary,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: row,
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    backgroundColor: "#fff",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: palette.primary,
    fontWeight: "bold",
    fontSize: 18,
  },
  role: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    ...rtlText,
  },
  name: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
    ...rtlText,
  },
  menuScroll: {
    flex: 1,
  },
  menuList: {
    padding: 8,
    paddingBottom: 16,
  },
  menuItem: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  menuItemActive: {
    backgroundColor: palette.softGreen,
    borderRightWidth: 3,
    borderRightColor: palette.primary,
  },
  menuItemText: {
    fontWeight: "500",
    color: palette.textSecondary,
    fontSize: 14,
    ...rtlText,
  },
  menuItemTextActive: {
    color: palette.primary,
  },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: "#EAB308",
    justifyContent: "center",
    alignItems: "center",
    marginStart: "auto",
  },
  unreadBadgeText: {
    color: "#1F2937",
    fontSize: 10,
    fontWeight: "bold",
  },
  logoutWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: "#fff",
  },
  logoutBtn: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    backgroundColor: "#FFEBEE",
    borderRadius: 12,
  },
  logoutText: {
    color: palette.red,
    fontWeight: "600",
    ...rtlText,
  },
});
