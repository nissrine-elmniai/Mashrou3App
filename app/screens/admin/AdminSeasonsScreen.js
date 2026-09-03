import { useFocusEffect } from "@react-navigation/native";
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
  Keyboard,
  Platform,
  Pressable,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { Menu, Bell, Plus, X, SquarePen } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import ActiveSeasonBanner from "../../components/ActiveSeasonBanner";
import { getActiveRegularSeason, filterSeancesForSeason } from "../../lib/seasonScope";
import { rtlText, row, textAlignStart, arrowForward } from "../../constants/rtl";
import {
  getAllSeances,
  createSeance,
  updateSeance,
  getSupervisorProfiles,
  JOUR_SEMAINE_VALUES,
  sortSeancesByJour,
} from "../../lib/seancesApi";
import { GENDER_OPTIONS } from "../../constants/roles";

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
  superviseurId: null,
  jour: null,
  genre: null,
  dateDebut: "",
  dateFin: "",
};

function dateToStorage(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function storageToDate(str) {
  const raw = String(str || "").trim().replace(/\//g, "-");
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatDateDisplay(str) {
  if (!str) return "";
  const date = storageToDate(str);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function seasonDateToStorage(value) {
  if (!value) return "";
  return String(value).trim().replace(/\//g, "-").slice(0, 10);
}

export default function AdminSeasonsScreen({ navigation }) {
  const { openSidebar, sidebar } = useAdminSidebar(navigation, "sessions");
  const { currentUser, stats, seasons } = useApp();
  const activeSeason = getActiveRegularSeason(seasons);
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
  const [datePickerField, setDatePickerField] = useState(null);

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
    if (seancesRes.ok) {
      const scoped = activeSeason?.id
        ? filterSeancesForSeason(seancesRes.seances, activeSeason.id)
        : [];
      setSeances(sortSeancesByJour(scoped));
    } else {
      Alert.alert("تنبيه", seancesRes.error || "تعذر تحميل الحصص");
      setSeances([]);
    }
    if (supervisorsRes.ok) setSupervisors(supervisorsRes.supervisors);
    setLoading(false);
  }, [activeSeason?.id]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    if (!modalVisible) {
      setKeyboardHeight(0);
      return undefined;
    }
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const onHide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [modalVisible]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      dateDebut: seasonDateToStorage(activeSeason?.startDate),
      dateFin: seasonDateToStorage(activeSeason?.endDate),
    });
    setDatePickerField(null);
    setModalVisible(true);
  };

  const openEdit = (seance) => {
    setEditingId(seance.id);
    setForm({
      nom: seance.nom || "",
      superviseurId: seance.superviseur_id || null,
      jour: JOUR_SEMAINE_VALUES.includes(seance.jour) ? seance.jour : null,
      genre: seance.genre || null,
      dateDebut: seasonDateToStorage(seance.date_debut),
      dateFin: seasonDateToStorage(seance.date_fin),
    });
    setDatePickerField(null);
    setModalVisible(true);
  };

  const onDateChange = (event, selected) => {
    if (Platform.OS !== "ios") setDatePickerField(null);
    if (event.type === "dismissed") return;
    if (selected && datePickerField) {
      setField(datePickerField, dateToStorage(selected));
    }
  };

  const handleSave = async () => {
    const nom = String(form.nom || "").trim();
    if (!nom) {
      Alert.alert("تنبيه", "أدخل اسم الحصة");
      return;
    }
    if (!form.superviseurId) {
      Alert.alert("تنبيه", "اختر مشرفاً للحصة");
      return;
    }
    if (!form.jour) {
      Alert.alert("تنبيه", "اختر يوم الحصة");
      return;
    }
    if (!form.genre) {
      Alert.alert("تنبيه", "اختر جنس الحصة (ذكر أو أنثى)");
      return;
    }
    if (!form.dateDebut) {
      Alert.alert("تنبيه", "أدخل تاريخ بداية الحصة");
      return;
    }
    if (!form.dateFin) {
      Alert.alert("تنبيه", "أدخل تاريخ نهاية الحصة");
      return;
    }
    if (form.dateFin < form.dateDebut) {
      Alert.alert("تنبيه", "تاريخ النهاية يجب أن يكون بعد تاريخ البداية");
      return;
    }
    if (!activeSeason?.id) {
      Alert.alert("تنبيه", "أنشئ موسماً جديداً أولاً من لوحة التحكم");
      return;
    }
    setSaving(true);
    let result;
    if (editingId) {
      result = await updateSeance({
        seanceId: editingId,
        patch: {
          nom,
          superviseur_id: form.superviseurId,
          jour: form.jour,
          genre: form.genre,
          date_debut: form.dateDebut,
          date_fin: form.dateFin,
        },
      });
    } else {
      result = await createSeance({
        nom,
        superviseurId: form.superviseurId,
        jour: form.jour,
        genre: form.genre,
        saisonId: activeSeason.id,
        dateDebut: form.dateDebut,
        dateFin: form.dateFin,
      });
    }
    setSaving(false);
    if (!result.ok) {
      Alert.alert("تنبيه", result.error);
      return;
    }
    if (result.seance) {
      setSeances((prev) =>
        sortSeancesByJour([
          result.seance,
          ...prev.filter((s) => s.id !== result.seance.id),
        ])
      );
    }
    setModalVisible(false);
    Alert.alert(
      editingId ? "تم التحديث" : "تم الإنشاء",
      editingId ? "تم تحديث الحصة بنجاح" : "تم إنشاء الحصة بنجاح"
    );
    loadAll();
  };

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={openSidebar}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="فتح القائمة"
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
        <ActiveSeasonBanner
          season={activeSeason}
          hint="الحصص والمشرفون والأعضاء المعروضون هنا خاصون بهذا الموسم فقط"
        />
        {loading ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="large" color={palette.primary} />
          </View>
        ) : !activeSeason ? (
          <Text style={styles.emptyText}>أنشئ موسماً جديداً لإضافة الحصص</Text>
        ) : seances.length === 0 ? (
          <Text style={styles.emptyText}>
            لا توجد حصص لهذا الموسم — أضف حصة أولاً
          </Text>
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
            const archived = seance.statut === "archivee";
            return (
              <TouchableOpacity
                key={seance.id}
                style={[
                  styles.card,
                  archived && { borderRightColor: palette.placeholder },
                ]}
                activeOpacity={0.85}
                onPress={() =>
                  navigation.navigate("AdminSeanceDetail", { seance })
                }
                accessibilityRole="button"
                accessibilityLabel={`تفاصيل حصة ${seance.nom || ""}`}
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
                  </View>
                </View>

                {supName ? (
                  <Text style={styles.cardSup}>المشرف: {supName}</Text>
                ) : null}
                {seance.jour ? (
                  <Text style={styles.cardSup}>اليوم: {seance.jour}</Text>
                ) : null}
                {seance.genre ? (
                  <Text style={styles.cardSup}>الجنس: {seance.genre}</Text>
                ) : null}
                {seance.date_debut || seance.date_fin ? (
                  <Text style={styles.cardSup}>
                    الفترة: {formatDateDisplay(seance.date_debut) || "—"} —{" "}
                    {formatDateDisplay(seance.date_fin) || "—"}
                  </Text>
                ) : null}

                <View style={styles.badgesRow}>
                  <View style={styles.badgeMember}>
                    <Text style={styles.badgeMemberText}>
                      👥 {memberCount} عضو
                    </Text>
                  </View>
                  <Ionicons
                    name={arrowForward}
                    size={18}
                    color={palette.placeholder}
                    style={{ marginStart: "auto" }}
                  />
                </View>
              </TouchableOpacity>
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
            {
              paddingBottom:
                keyboardHeight > 0
                  ? keyboardHeight
                  : Math.max(insets.bottom, 16),
            },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              Keyboard.dismiss();
              setModalVisible(false);
            }}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? "تعديل الحصة" : "إضافة حصة"}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  setModalVisible(false);
                }}
              >
                <X size={22} color={palette.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
            <Text style={styles.modalLabel}>اسم الحصة</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="مثال: حصة الفجر"
              placeholderTextColor={palette.placeholder}
              value={form.nom}
              onChangeText={(v) => setField("nom", v)}
              textAlign={textAlignStart}
            />

            <Text style={styles.modalLabel}>يوم الحصة</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.jourChipsRow}
            >
              {JOUR_SEMAINE_VALUES.map((jour) => {
                const active = form.jour === jour;
                return (
                  <TouchableOpacity
                    key={jour}
                    style={[styles.jourChip, active && styles.jourChipActive]}
                    onPress={() => setField("jour", jour)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.jourChipText,
                        active && styles.jourChipTextActive,
                      ]}
                    >
                      {jour}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.modalLabel}>جنس الحصة</Text>
            <View style={styles.jourChipsRow}>
              {GENDER_OPTIONS.map((opt) => {
                const active = form.genre === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.jourChip, active && styles.jourChipActive]}
                    onPress={() => setField("genre", opt.value)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.jourChipText,
                        active && styles.jourChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.modalLabel}>تاريخ البداية</Text>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setDatePickerField("dateDebut")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.dateBtnText,
                  !form.dateDebut && styles.dateBtnPlaceholder,
                ]}
              >
                {form.dateDebut
                  ? formatDateDisplay(form.dateDebut)
                  : "اختر تاريخ البداية"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.modalLabel}>تاريخ النهاية</Text>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setDatePickerField("dateFin")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.dateBtnText,
                  !form.dateFin && styles.dateBtnPlaceholder,
                ]}
              >
                {form.dateFin
                  ? formatDateDisplay(form.dateFin)
                  : "اختر تاريخ النهاية"}
              </Text>
            </TouchableOpacity>

            {datePickerField ? (
              <DateTimePicker
                value={storageToDate(
                  form[datePickerField] || dateToStorage(new Date())
                )}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onDateChange}
              />
            ) : null}
            {Platform.OS === "ios" && datePickerField ? (
              <TouchableOpacity
                style={styles.dateDoneBtn}
                onPress={() => setDatePickerField(null)}
              >
                <Text style={styles.dateDoneBtnText}>تم</Text>
              </TouchableOpacity>
            ) : null}

            <Text style={styles.modalLabel}>المشرف</Text>
            <View style={styles.supervisorChips}>
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
            </ScrollView>
          </View>
        </View>
      </Modal>
      {sidebar}
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    maxHeight: "88%",
  },
  modalScrollContent: {
    paddingBottom: 12,
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
  dateBtn: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    backgroundColor: palette.background,
  },
  dateBtnText: {
    fontSize: 15,
    color: palette.textPrimary,
    ...rtlText,
  },
  dateBtnPlaceholder: {
    color: palette.placeholder,
  },
  dateDoneBtn: {
    alignSelf: "flex-end",
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: palette.softGreen,
  },
  dateDoneBtnText: {
    color: palette.primary,
    fontWeight: "700",
    ...rtlText,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.textSecondary,
    marginBottom: 6,
    ...rtlText,
  },
  jourChipsRow: {
    flexDirection: row,
    gap: 8,
    paddingBottom: 10,
  },
  jourChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: palette.background,
    borderWidth: 1,
    borderColor: palette.border,
  },
  jourChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  jourChipText: {
    fontSize: 13,
    color: palette.textSecondary,
    ...rtlText,
  },
  jourChipTextActive: {
    color: "#fff",
    fontWeight: "600",
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
