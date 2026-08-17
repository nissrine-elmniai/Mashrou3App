import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Bell, Plus, X, SquarePen, Archive } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { rtlText, row, textAlignStart } from "../../constants/rtl";
import {
  getAllSeances,
  createSeance,
  updateSeance,
  archiveSeance,
  getSupervisorProfiles,
} from "../../lib/seancesApi";

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

const EMPTY_FORM = {
  nom: "",
  saisonId: "",
  jour: "",
  heureDebut: "",
  heureFin: "",
  superviseurId: null,
};

export default function AdminSeasonsScreen({ navigation }) {
  const { currentUser, stats } = useApp();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);
  const fabBottom = Math.max(insets.bottom, 16) + 16;

  const [seances, setSeances] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = displayName.charAt(0) || "م";
  const pendingCount = stats?.pendingRegs ?? 0;

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [seancesRes, supervisorsRes] = await Promise.all([
      getAllSeances(),
      getSupervisorProfiles(),
    ]);
    if (seancesRes.ok) setSeances(seancesRes.seances);
    if (supervisorsRes.ok) setSupervisors(supervisorsRes.supervisors);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEdit = (seance) => {
    setEditingId(seance.id);
    setForm({
      nom: seance.nom || "",
      saisonId: seance.saison_id || "",
      jour: seance.jour || "",
      heureDebut: seance.heure_debut ? String(seance.heure_debut).slice(0, 5) : "",
      heureFin: seance.heure_fin ? String(seance.heure_fin).slice(0, 5) : "",
      superviseurId: seance.superviseur_id || null,
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      nom: form.nom,
      saisonId: form.saisonId || null,
      jour: form.jour || null,
      heureDebut: form.heureDebut || null,
      heureFin: form.heureFin || null,
      superviseurId: form.superviseurId || null,
    };
    let result;
    if (editingId) {
      result = await updateSeance({
        seanceId: editingId,
        patch: {
          nom: payload.nom,
          saison_id: payload.saisonId,
          jour: payload.jour,
          heure_debut: payload.heureDebut,
          heure_fin: payload.heureFin,
          superviseur_id: payload.superviseurId,
        },
      });
    } else {
      result = await createSeance(payload);
    }
    setSaving(false);
    if (!result.ok) {
      Alert.alert("تنبيه", result.error);
      return;
    }
    setModalVisible(false);
    Alert.alert(
      editingId ? "تم التحديث" : "تم الإنشاء",
      editingId ? "تم تحديث الحصة بنجاح" : "تم إنشاء الحصة بنجاح"
    );
    loadAll();
  };

  const confirmArchive = (seance) => {
    Alert.alert(
      "أرشفة الحصة",
      `هل تريد أرشفة «${seance.nom}»؟ لن تُلغى البيانات المرتبطة بها.`,
      [
        { text: "تراجع", style: "cancel" },
        {
          text: "أرشفة",
          style: "destructive",
          onPress: async () => {
            const result = await archiveSeance(seance.id);
            if (!result.ok) {
              Alert.alert("خطأ", result.error);
              return;
            }
            Alert.alert("تمت الأرشفة", "تمت أرشفة الحصة بنجاح");
            loadAll();
          },
        },
      ]
    );
  };

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="رجوع"
        >
          <Menu size={24} color={palette.textPrimary} pointerEvents="none" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>الحصص</Text>
        <TouchableOpacity
          style={styles.topBarAvatar}
          onPress={() => navigation.navigate("AdminProfile")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="الملف الشخصي"
        >
          <Text style={styles.topBarAvatarText}>{initial}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminRegistrations")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="التنبيهات"
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
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: fabBottom + 72 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="large" color={palette.primary} />
          </View>
        ) : seances.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد حصص بعد — أضف حصة أولاً</Text>
        ) : (
          seances.map((seance) => {
            const memberCount = (seance.inscriptions || []).filter(
              (i) => i.statut === "accepte"
            ).length;
            const sup = seance.superviseur || null;
            const supName = sup
              ? `${sup.first_name || ""} ${sup.last_name || ""}`.trim() ||
                sup.email
              : "";
            const time =
              seance.heure_debut && seance.heure_fin
                ? `${String(seance.heure_debut).slice(0, 5)} - ${String(
                    seance.heure_fin
                  ).slice(0, 5)}`
                : seance.heure_debut
                  ? String(seance.heure_debut).slice(0, 5)
                  : "";
            const archived = seance.statut === "archivee";
            return (
              <View
                key={seance.id}
                style={[
                  styles.card,
                  archived && { borderRightColor: palette.placeholder },
                ]}
              >
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{seance.nom}</Text>
                    <View style={styles.cardBadges}>
                      {archived ? (
                        <View style={styles.badgeArchived}>
                          <Text style={styles.badgeArchivedText}>مؤرشفة</Text>
                        </View>
                      ) : (
                        <View style={styles.badgeActive}>
                          <Text style={styles.badgeActiveText}>نشطة</Text>
                        </View>
                      )}
                      {seance.saison_id ? (
                        <Text style={styles.cardMeta}>{seance.saison_id}</Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.editBtn]}
                      onPress={() => openEdit(seance)}
                      accessibilityLabel="تعديل الحصة"
                    >
                      <SquarePen size={18} color={palette.textSecondary} />
                    </TouchableOpacity>
                    {!archived ? (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.archiveBtn]}
                        onPress={() => confirmArchive(seance)}
                        accessibilityLabel="أرشفة الحصة"
                      >
                        <Archive size={18} color={palette.primary} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>

                {seance.jour ? (
                  <Text style={styles.cardDay}>{seance.jour}</Text>
                ) : null}
                {time ? <Text style={styles.cardTime}>{time}</Text> : null}
                {supName ? (
                  <Text style={styles.cardSup}>المشرف: {supName}</Text>
                ) : null}

                <View style={styles.badgesRow}>
                  <View style={styles.badgeMember}>
                    <Text style={styles.badgeMemberText}>
                      👥 {memberCount} عضو
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { bottom: fabBottom }]}
        onPress={openCreate}
      >
        <Plus size={24} color={palette.textPrimary} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View
          style={[
            styles.modalOverlay,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? "تعديل الحصة" : "إضافة حصة"}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={22} color={palette.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="اسم الحصة (مثال: حصة الفجر)"
              placeholderTextColor={palette.placeholder}
              value={form.nom}
              onChangeText={(v) => setField("nom", v)}
              textAlign={textAlignStart}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="الموسم (مثال: 2025-2026)"
              placeholderTextColor={palette.placeholder}
              value={form.saisonId}
              onChangeText={(v) => setField("saisonId", v)}
              textAlign={textAlignStart}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="اليوم (مثال: السبت - الاثنين - الأربعاء)"
              placeholderTextColor={palette.placeholder}
              value={form.jour}
              onChangeText={(v) => setField("jour", v)}
              textAlign={textAlignStart}
            />
            <View style={styles.modalRow}>
              <TextInput
                style={[styles.modalInput, styles.modalInputHalf]}
                placeholder="بداية (مثال: 05:30)"
                placeholderTextColor={palette.placeholder}
                value={form.heureDebut}
                onChangeText={(v) => setField("heureDebut", v)}
                textAlign={textAlignStart}
              />
              <TextInput
                style={[styles.modalInput, styles.modalInputHalf]}
                placeholder="نهاية (مثال: 06:30)"
                placeholderTextColor={palette.placeholder}
                value={form.heureFin}
                onChangeText={(v) => setField("heureFin", v)}
                textAlign={textAlignStart}
              />
            </View>

            <Text style={styles.modalLabel}>المشرف (اختياري)</Text>
            <View style={styles.supervisorChips}>
              <TouchableOpacity
                style={[
                  styles.supervisorChip,
                  !form.superviseurId && styles.supervisorChipActive,
                ]}
                onPress={() => setField("superviseurId", null)}
              >
                <Text
                  style={[
                    styles.supervisorChipText,
                    !form.superviseurId && styles.supervisorChipTextActive,
                  ]}
                >
                  بدون مشرف
                </Text>
              </TouchableOpacity>
              {supervisors.map((s) => {
                const name = `${s.first_name || ""} ${s.last_name || ""}`.trim();
                const active = form.superviseurId === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.supervisorChip,
                      active && styles.supervisorChipActive,
                    ]}
                    onPress={() => setField("superviseurId", s.id)}
                  >
                    <Text
                      style={[
                        styles.supervisorChipText,
                        active && styles.supervisorChipTextActive,
                      ]}
                    >
                      {name || s.email}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {supervisors.length === 0 ? (
              <Text style={styles.supervisorHint}>
                لا يوجد مشرفون بعد — عيّن مشرفاً أولاً من شاشة «المشرفون»
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.modalSubmit, saving && { opacity: 0.6 }]}
              onPress={saving ? undefined : handleSave}
            >
              <Text style={styles.modalSubmitText}>
                {saving
                  ? "جاري الحفظ..."
                  : editingId
                    ? "حفظ التعديلات"
                    : "إضافة الحصة"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    paddingVertical: 14,
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  emptyText: {
    ...rtlText,
    color: palette.textSecondary,
    textAlign: "center",
    marginTop: 40,
  },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 48,
    alignItems: "center",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderRightWidth: 4,
    borderRightColor: palette.primary,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: row,
    alignItems: "flex-start",
    gap: 8,
  },
  cardTitle: {
    fontWeight: "bold",
    color: palette.textPrimary,
    fontSize: 16,
    marginBottom: 4,
    ...rtlText,
  },
  cardBadges: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  badgeActive: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: palette.softGreen,
    borderRadius: 10,
  },
  badgeActiveText: {
    color: palette.primary,
    fontSize: 11,
    fontWeight: "600",
    ...rtlText,
  },
  badgeArchived: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "#EEEEEE",
    borderRadius: 10,
  },
  badgeArchivedText: {
    color: palette.placeholder,
    fontSize: 11,
    fontWeight: "600",
    ...rtlText,
  },
  cardMeta: {
    color: palette.placeholder,
    fontSize: 12,
    ...rtlText,
  },
  cardActions: {
    flexDirection: row,
    gap: 8,
  },
  actionBtn: {
    padding: 8,
    borderRadius: 8,
  },
  editBtn: {
    backgroundColor: "#F5F5F5",
  },
  archiveBtn: {
    backgroundColor: palette.softGreen,
  },
  cardDay: {
    color: palette.textSecondary,
    fontSize: 14,
    marginBottom: 4,
    ...rtlText,
  },
  cardTime: {
    color: palette.primary,
    fontWeight: "600",
    fontSize: 15,
    marginBottom: 4,
    ...rtlText,
  },
  cardSup: {
    color: palette.textSecondary,
    fontSize: 13,
    marginBottom: 8,
    ...rtlText,
  },
  badgesRow: {
    flexDirection: row,
    gap: 8,
  },
  badgeMember: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#E3F2FD",
    borderRadius: 12,
  },
  badgeMemberText: {
    color: palette.blue,
    fontSize: 12,
    ...rtlText,
  },
  fab: {
    position: "absolute",
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
  modalRow: {
    flexDirection: row,
    gap: 10,
  },
  modalInputHalf: {
    flex: 1,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.textSecondary,
    marginBottom: 6,
    ...rtlText,
  },
  supervisorChips: {
    flexDirection: row,
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  supervisorChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: palette.background,
    borderWidth: 1,
    borderColor: palette.border,
  },
  supervisorChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  supervisorChipText: {
    fontSize: 13,
    color: palette.textSecondary,
    ...rtlText,
  },
  supervisorChipTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  supervisorHint: {
    color: palette.placeholder,
    fontSize: 12,
    marginBottom: 8,
    ...rtlText,
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
