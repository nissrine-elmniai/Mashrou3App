import React, { useState } from "react";
import {
  Text,
  StyleSheet,
  Alert,
  View,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../../context/AppContext";
import {
  AppShell,
  SectionCard,
  QuickButton,
  FormInput,
  EmptyState,
} from "../../components/ui";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, row } from "../../constants/rtl";

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export default function AdminGroupsScreen({ navigation }) {
  const {
    seasons,
    groups,
    createGroup,
    updateGroup,
    deleteGroup,
    getSupervisors,
    getUserById,
  } = useApp();

  const supervisors = getSupervisors();
  const defaultSeasonId =
    seasons.find((s) => s.active)?.id || seasons[0]?.id || "";

  const [name, setName] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editSupervisorName, setEditSupervisorName] = useState("");

  const findSupervisorByName = (typed) => {
    const target = normalizeName(typed);
    if (!target) return null;
    return (
      supervisors.find((s) => {
        const full = normalizeName(`${s.firstName} ${s.lastName}`);
        const rev = normalizeName(`${s.lastName} ${s.firstName}`);
        return full === target || rev === target;
      }) || null
    );
  };

  const handleCreate = () => {
    if (!defaultSeasonId) {
      Alert.alert("تنبيه", "أنشئ موسماً أولاً قبل إضافة مجموعة");
      return;
    }
    if (!name.trim()) {
      Alert.alert("تنبيه", "أدخل اسم المجموعة");
      return;
    }
    if (!supervisorName.trim()) {
      Alert.alert("تنبيه", "أدخل اسم المشرف");
      return;
    }
    const supervisor = findSupervisorByName(supervisorName);
    if (!supervisor) {
      Alert.alert(
        "تنبيه",
        "لم يُعثر على مشرف بهذا الاسم — تأكد من الاسم الكامل كما في قائمة المشرفين"
      );
      return;
    }
    createGroup({
      seasonId: defaultSeasonId,
      name: name.trim(),
      freeTimeSlot: "",
      supervisorId: supervisor.id,
      schedule: "",
      remote: false,
    });
    setName("");
    setSupervisorName("");
    Alert.alert("تم", "تم إنشاء المجموعة وربطها بالمشرف");
  };

  const startEdit = (group) => {
    const supervisor = getUserById(group.supervisorId);
    setEditingId(group.id);
    setEditName(group.name);
    setEditSupervisorName(
      supervisor ? `${supervisor.firstName} ${supervisor.lastName}` : ""
    );
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditSupervisorName("");
  };

  const saveEdit = () => {
    if (!editingId) return;
    if (!editName.trim()) {
      Alert.alert("تنبيه", "أدخل اسم المجموعة");
      return;
    }
    if (!editSupervisorName.trim()) {
      Alert.alert("تنبيه", "أدخل اسم المشرف");
      return;
    }
    const supervisor = findSupervisorByName(editSupervisorName);
    if (!supervisor) {
      Alert.alert(
        "تنبيه",
        "لم يُعثر على مشرف بهذا الاسم — تأكد من الاسم الكامل"
      );
      return;
    }
    const result = updateGroup(editingId, {
      name: editName,
      supervisorId: supervisor.id,
    });
    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }
    cancelEdit();
    Alert.alert("تم", "تم تحديث المجموعة");
  };

  const confirmDelete = (group) => {
    Alert.alert("حذف المجموعة", `هل تريد حذف «${group.name}»؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: () => {
          const result = deleteGroup(group.id);
          if (!result.ok) {
            Alert.alert("خطأ", result.error);
            return;
          }
          if (editingId === group.id) cancelEdit();
        },
      },
    ]);
  };

  return (
    <AppShell
      title="إدارة المجموعات"
      subtitle="المجموعات والمشرفون المرتبطون بها"
      icon="people"
      onBack={() => navigation.goBack()}
    >
      <SectionCard title="إضافة مجموعة" subtitle="اسم المجموعة واسم المشرف">
        <Text style={styles.label}>اسم المجموعة</Text>
        <FormInput
          placeholder="اكتب اسم المجموعة"
          value={name}
          onChangeText={setName}
        />
        <Text style={styles.label}>اسم المشرف</Text>
        <FormInput
          placeholder="اكتب الاسم الكامل للمشرف"
          value={supervisorName}
          onChangeText={setSupervisorName}
        />
        {supervisors.length === 0 ? (
          <EmptyState text="لا يوجد مشرفون — أضف مشرفاً أولاً" />
        ) : null}
        <QuickButton
          label="إضافة المجموعة"
          color={colors.primary}
          icon="add"
          onPress={handleCreate}
        />
      </SectionCard>

      <Text style={styles.listTitle}>كل المجموعات</Text>
      {groups.length === 0 ? (
        <EmptyState text="لا توجد مجموعات بعد" />
      ) : (
        groups.map((g) => {
          const supervisor = getUserById(g.supervisorId);
          const isEditing = editingId === g.id;

          if (isEditing) {
            return (
              <View key={g.id} style={styles.editCard}>
                <Text style={styles.label}>اسم المجموعة</Text>
                <FormInput
                  placeholder="اسم المجموعة"
                  value={editName}
                  onChangeText={setEditName}
                />
                <Text style={styles.label}>اسم المشرف</Text>
                <FormInput
                  placeholder="الاسم الكامل للمشرف"
                  value={editSupervisorName}
                  onChangeText={setEditSupervisorName}
                />
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={[styles.iconBtn, styles.saveBtn]}
                    onPress={saveEdit}
                    accessibilityLabel="حفظ"
                  >
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.iconBtn, styles.cancelBtn]}
                    onPress={cancelEdit}
                    accessibilityLabel="إلغاء"
                  >
                    <Ionicons name="close" size={20} color={colors.muted} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }

          return (
            <View key={g.id} style={styles.groupCard}>
              <View style={styles.groupInfo}>
                <Text style={styles.groupName} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text style={styles.supervisorName} numberOfLines={1}>
                  {supervisor
                    ? `${supervisor.firstName} ${supervisor.lastName}`
                    : "—"}
                </Text>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => startEdit(g)}
                  accessibilityLabel="تعديل"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="create-outline"
                    size={20}
                    color={colors.primary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => confirmDelete(g)}
                  accessibilityLabel="حذف"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={colors.orange}
                  />
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  label: {
    ...rtlText,
    color: colors.muted,
    marginBottom: 6,
    marginTop: 4,
    fontWeight: "600",
  },
  listTitle: {
    fontSize: 17,
    fontWeight: "bold",
    ...rtlText,
    color: colors.text,
    marginBottom: 12,
    marginTop: 8,
  },
  groupCard: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    ...shadows.card,
  },
  groupInfo: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
  },
  groupName: {
    ...rtlText,
    fontSize: 16,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 2,
  },
  supervisorName: {
    ...rtlText,
    fontSize: 13,
    color: colors.muted,
  },
  cardActions: {
    flexDirection: row,
    alignItems: "center",
    flexShrink: 0,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    marginHorizontal: 2,
  },
  editCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderGold,
    padding: 14,
    marginBottom: 10,
    ...shadows.card,
  },
  editActions: {
    flexDirection: row,
    justifyContent: "flex-end",
    marginTop: 8,
  },
  saveBtn: {
    backgroundColor: colors.primary,
  },
  cancelBtn: {
    backgroundColor: colors.soft,
  },
});
