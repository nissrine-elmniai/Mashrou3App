import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
} from "react-native";
import { Search, Trash2, Plus, X } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { ACCOUNT_STATUS, ROLES, userHasRole } from "../../constants/roles";
import { rtlText, row, textAlignStart } from "../../constants/rtl";
import { sendSupervisorInviteEmail } from "../../utils/sendInviteEmail";

const palette = {
  primary: "#2E7D32",
  gold: "#FBC02D",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  blue: "#1976D2",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  placeholder: "#999999",
  border: "#E0E0E0",
};

export default function AdminSupervisorsScreen({ navigation }) {
  const { users, addSupervisor, removeSupervisor, getSupervisorGroups } =
    useApp();
  const supervisors = users.filter((u) => userHasRole(u, ROLES.SUPERVISOR));

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [groupName, setGroupName] = useState("");
  const [sending, setSending] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return supervisors.filter((s) => {
      const fullName = `${s.firstName || ""} ${s.lastName || ""}`.toLowerCase();
      const mail = (s.email || "").toLowerCase();
      if (q && !fullName.includes(q) && !mail.includes(q)) return false;
      if (filter === "pending") {
        return s.accountStatus === ACCOUNT_STATUS.INVITED;
      }
      return true;
    });
  }, [supervisors, search, filter]);

  const handleAdd = async () => {
    if (!groupName.trim()) {
      Alert.alert("تنبيه", "أدخل اسم المجموعة المعنية بالمشرف");
      return;
    }
    setSending(true);
    const result = addSupervisor({
      firstName,
      lastName,
      email,
      groupName: groupName.trim(),
    });
    if (!result.ok) {
      setSending(false);
      Alert.alert("خطأ", result.error);
      return;
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const mail = await sendSupervisorInviteEmail({
      toEmail: email.trim(),
      fullName,
      groupName: result.groupName,
    });
    setSending(false);

    if (mail.ok) {
      Alert.alert(
        "تمت الإضافة",
        `تمت إضافة ${fullName} وإرسال الرسالة إلى:\n${email.trim()}`
      );
    } else {
      Alert.alert(
        "تمت الإضافة — فشل إرسال البريد",
        `${mail.error || ""}\n\nتمت إضافة المشرف. أبلغه أنه يمكنه إنشاء حسابه من التطبيق.`
      );
    }

    setFirstName("");
    setLastName("");
    setEmail("");
    setGroupName("");
    setShowAdd(false);
  };

  const confirmRemove = (supervisor) => {
    const fullName = `${supervisor.firstName} ${supervisor.lastName}`;
    Alert.alert("حذف المشرف", `هل تريد حذف «${fullName}»؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: () => {
          const result = removeSupervisor(supervisor.id);
          if (!result.ok) {
            Alert.alert("خطأ", result.error);
            return;
          }
          Alert.alert("تم الحذف", "تم حذف المشرف بنجاح");
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.searchContainer}>
          <Search size={20} color={palette.placeholder} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="بحث..."
            placeholderTextColor={palette.placeholder}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
        </View>

        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filter === "all" && styles.filterChipActive]}
            onPress={() => setFilter("all")}
          >
            <Text style={[styles.filterChipText, filter === "all" && styles.filterChipTextActive]}>
              الكل
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filter === "pending" && styles.filterChipActive]}
            onPress={() => setFilter("pending")}
          >
            <Text style={[styles.filterChipText, filter === "pending" && styles.filterChipTextActive]}>
              بانتظار التفعيل
            </Text>
          </TouchableOpacity>
        </View>

        {filtered.length === 0 ? (
          <Text style={styles.emptyText}>لا يوجد مشرفون بعد</Text>
        ) : (
          filtered.map((supervisor) => {
            const name = `${supervisor.firstName || ""} ${supervisor.lastName || ""}`.trim();
            const groups = getSupervisorGroups(supervisor.id);
            const pending = supervisor.accountStatus === ACCOUNT_STATUS.INVITED;
            return (
              <View key={supervisor.id} style={styles.card}>
                <View style={styles.cardAvatar}>
                  <Text style={styles.cardAvatarText}>
                    {(supervisor.firstName?.[0] || name.charAt(0) || "?").toUpperCase()}
                  </Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{name}</Text>
                  <Text style={styles.cardEmail}>{supervisor.email}</Text>
                  <View style={styles.sessionBadge}>
                    <Text style={styles.sessionBadgeText}>
                      {groups.length > 0
                        ? groups.map((g) => g.name).join("، ")
                        : pending
                          ? "بانتظار التفعيل"
                          : "بدون مجموعة"}
                    </Text>
                  </View>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#FFEBEE" }]}
                    onPress={() => confirmRemove(supervisor)}
                    accessibilityLabel="حذف المشرف"
                  >
                    <Trash2 size={20} color={palette.red} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Plus size={24} color={palette.textPrimary} />
      </TouchableOpacity>

      <Modal
        visible={showAdd}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdd(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>إضافة مشرف</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <X size={22} color={palette.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="الاسم"
              placeholderTextColor={palette.placeholder}
              value={firstName}
              onChangeText={setFirstName}
              textAlign={textAlignStart}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="اللقب"
              placeholderTextColor={palette.placeholder}
              value={lastName}
              onChangeText={setLastName}
              textAlign={textAlignStart}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="البريد الإلكتروني"
              placeholderTextColor={palette.placeholder}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textAlign={textAlignStart}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="اسم المجموعة (مثال: مجموعة الفجر)"
              placeholderTextColor={palette.placeholder}
              value={groupName}
              onChangeText={setGroupName}
              textAlign={textAlignStart}
            />
            <TouchableOpacity
              style={[styles.modalSubmit, sending && { opacity: 0.6 }]}
              onPress={sending ? undefined : handleAdd}
            >
              <Text style={styles.modalSubmitText}>
                {sending ? "جاري الإرسال..." : "إضافة وإرسال الرسالة"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
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
  filterRow: {
    flexDirection: row,
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: palette.background,
    borderRadius: 20,
  },
  filterChipActive: {
    backgroundColor: palette.primary,
  },
  filterChipText: {
    fontSize: 14,
    color: palette.textSecondary,
  },
  filterChipTextActive: {
    color: "#fff",
  },
  emptyText: {
    ...rtlText,
    color: palette.textSecondary,
    textAlign: "center",
    marginTop: 40,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardAvatar: {
    width: 48,
    height: 48,
    backgroundColor: palette.softGreen,
    borderRadius: 24,
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
    fontWeight: "bold",
    color: palette.textPrimary,
    fontSize: 15,
    ...rtlText,
  },
  cardEmail: {
    color: palette.textSecondary,
    fontSize: 13,
    ...rtlText,
  },
  sessionBadge: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: palette.softGreen,
    borderRadius: 12,
  },
  sessionBadgeText: {
    color: palette.primary,
    fontSize: 12,
  },
  cardActions: {
    flexDirection: row,
    gap: 8,
  },
  actionBtn: {
    padding: 8,
    borderRadius: 8,
  },
  fab: {
    position: "absolute",
    bottom: 20,
    left: 16,
    width: 56,
    height: 56,
    backgroundColor: palette.gold,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: {
    fontWeight: "bold",
    fontSize: 18,
    color: palette.textPrimary,
    ...rtlText,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    fontSize: 15,
    color: palette.textPrimary,
    backgroundColor: palette.background,
  },
  modalSubmit: {
    marginTop: 8,
    backgroundColor: palette.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalSubmitText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
