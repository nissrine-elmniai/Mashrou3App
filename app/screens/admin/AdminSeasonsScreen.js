import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { Menu, Bell, Plus, X, SquarePen, Users } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import {
  filterSeancesForSeason,
  supervisorIdsForSeason,
} from "../../lib/seasonScope";
import { SEASON_TYPES, SEASON_TYPE_LABELS } from "../../constants/roles";
import { rtlText, row, textAlignStart, arrowForward } from "../../constants/rtl";
import { displayProfileEmail } from "../../lib/authEmail";
import {
  getAllSeances,
  createSeance,
  updateSeance,
  findOccupiedSeanceForSuperviseur,
  getAssignableSupervisors,
  excludeDuplicateSupervisorAccounts,
  JOUR_SEMAINE_VALUES,
  sortSeancesByJour,
  normalizePgTime,
} from "../../lib/seancesApi";
import { GENDER_OPTIONS } from "../../constants/roles";
import { colors, radii } from "../../constants/theme";
import AdminTopBarAvatar from "../../components/admin/AdminTopBarAvatar";
import InboxHeaderButton from "../../components/InboxHeaderButton";

/** Chips genre : le thème n'a pas de rose, ni de bleu doux apparié à un texte foncé. */
const GENRE_FEMALE_CHIP = { background: "#FDE8EF", text: "#9D174D" };
const GENRE_MALE_CHIP = { background: "#E8F1FE", text: "#1D4ED8" };

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
  heureDebut: "",
  heureFin: "",
};

function timeToStorage(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function storageToTime(str) {
  const normalized = normalizePgTime(str);
  const date = new Date();
  if (!normalized) {
    date.setHours(18, 0, 0, 0);
    return date;
  }
  const [h, m] = normalized.split(":").map((n) => Number(n) || 0);
  date.setHours(h, m, 0, 0);
  return date;
}

function formatTimeDisplay(str) {
  const normalized = normalizePgTime(str);
  return normalized ? normalized.slice(0, 5) : "";
}

function seasonDateToStorage(value) {
  if (!value) return "";
  return String(value).trim().replace(/\//g, "-").slice(0, 10);
}

function confirmSuperviseurSwap({ nomB }) {
  const message = `هذا المشرف مكلف حالياً بحصة «${nomB}». هل تريد تبديل المشرفين بين الحصتين؟`;
  return new Promise((resolve) => {
    Alert.alert(
      "تبديل المشرفين",
      message,
      [
        { text: "إلغاء", style: "cancel", onPress: () => resolve(false) },
        { text: "تبديل", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

/** Affichage court du genre, sans le préfixe « الجنس ». */
function genreLineLabel(genre) {
  if (genre === "أنثى") return "إناث";
  if (genre === "ذكر") return "ذكور";
  return "";
}

function cardSupervisor(profile) {
  if (!profile) return null;
  const first = profile.first_name || "";
  const last = profile.last_name || "";
  const email = displayProfileEmail(profile);
  if (!first && !last && !email) return null;
  return {
    first_name: first,
    last_name: last,
    email,
    canonical_email: profile.canonical_email || "",
  };
}

export default function AdminSeasonsScreen({ navigation }) {
  const { openSidebar, sidebar, messagesFab } = useAdminSidebar(navigation, "sessions");
  const { currentUser, stats, seasons } = useApp();
  const activeSeasons = useMemo(() => {
    const list = (seasons || []).filter((season) => season?.active);
    return [...list].sort((a, b) => {
      const rank = (season) =>
        season?.type === SEASON_TYPES.REGULAR
          ? 0
          : season?.type === SEASON_TYPES.SUMMER
            ? 1
            : 2;
      return rank(a) - rank(b);
    });
  }, [seasons]);
  const defaultSeasonId = useMemo(() => {
    const regular = activeSeasons.find(
      (season) => season.type === SEASON_TYPES.REGULAR
    );
    return regular?.id || activeSeasons[0]?.id || null;
  }, [activeSeasons]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const activeSeason =
    activeSeasons.find((season) => season.id === selectedSeasonId) ||
    activeSeasons.find((season) => season.id === defaultSeasonId) ||
    null;
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);
  const fabBottom = Math.max(insets.bottom, 16) + 16;

  useEffect(() => {
    if (!activeSeasons.some((season) => season.id === selectedSeasonId)) {
      setSelectedSeasonId(defaultSeasonId);
    }
  }, [activeSeasons, selectedSeasonId, defaultSeasonId]);

  const [seances, setSeances] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [timePickerField, setTimePickerField] = useState(null);

  const pendingCount = stats?.pendingRegs ?? 0;

  const pickerSupervisors = useMemo(() => {
    const ids = supervisorIdsForSeason(seances, activeSeason?.id || null);
    return excludeDuplicateSupervisorAccounts(supervisors, ids).filter(
      (s) => s.account_status !== "inactive" || s.id === form.superviseurId
    );
  }, [seances, supervisors, activeSeason?.id, form.superviseurId]);

  const loadAll = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const [seancesRes, supervisorsRes] = await Promise.all([
      getAllSeances(),
      getAssignableSupervisors({ saisonId: activeSeason?.id || null }),
    ]);
    if (seancesRes.ok) {
      const scoped = activeSeason?.id
        ? filterSeancesForSeason(seancesRes.seances, activeSeason.id).filter(
            (seance) => seance.statut === "active"
          )
        : [];
      setSeances(sortSeancesByJour(scoped));
    } else if (!silent) {
      Alert.alert("تنبيه", seancesRes.error || "تعذر تحميل الحصص");
      setSeances([]);
    }
    if (supervisorsRes.ok) {
      const ids = supervisorIdsForSeason(
        seancesRes.ok ? seancesRes.seances : [],
        activeSeason?.id || null
      );
      setSupervisors(
        excludeDuplicateSupervisorAccounts(supervisorsRes.supervisors, ids).filter(
          (s) => s.account_status !== "inactive" || ids.has(s.id)
        )
      );
    } else {
      setSupervisors([]);
    }
    if (!silent) setLoading(false);
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
    setForm({ ...EMPTY_FORM });
    setTimePickerField(null);
    setModalVisible(true);
  };

  const openEdit = (seance) => {
    setEditingId(seance.id);
    setForm({
      nom: seance.nom || "",
      superviseurId: seance.superviseur_id || null,
      jour: JOUR_SEMAINE_VALUES.includes(seance.jour) ? seance.jour : null,
      genre: seance.genre || null,
      heureDebut: formatTimeDisplay(seance.heure_debut),
      heureFin: formatTimeDisplay(seance.heure_fin),
    });
    setTimePickerField(null);
    setModalVisible(true);
  };

  const onTimeChange = (event, selected) => {
    if (Platform.OS !== "ios") setTimePickerField(null);
    if (event.type === "dismissed") return;
    if (selected && timePickerField) {
      setField(timePickerField, timeToStorage(selected));
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
    if (!form.heureDebut) {
      Alert.alert("تنبيه", "أدخل ساعة بداية الحصة");
      return;
    }
    if (!form.heureFin) {
      Alert.alert("تنبيه", "أدخل ساعة نهاية الحصة");
      return;
    }
    if (form.heureFin <= form.heureDebut) {
      Alert.alert("تنبيه", "ساعة النهاية يجب أن تكون بعد ساعة البداية");
      return;
    }
    if (!activeSeason?.id) {
      Alert.alert("تنبيه", "أنشئ موسماً جديداً أولاً");
      return;
    }

    const current = editingId ? seances.find((s) => s.id === editingId) : null;
    const supervisorChanged = Boolean(
      editingId && current && form.superviseurId !== current.superviseur_id
    );
    const saisonId = current?.saison_id || activeSeason.id;
    let swapPartner = null;
    const assigningSupervisor = !editingId || supervisorChanged;

    if (assigningSupervisor) {
      const occupiedRes = await findOccupiedSeanceForSuperviseur(form.superviseurId, {
        excludeSeanceId: editingId,
        saisonId,
      });
      if (!occupiedRes.ok) {
        Alert.alert("تنبيه", occupiedRes.error);
        return;
      }
      if (occupiedRes.conflict === "swap") {
        const nomB = String(occupiedRes.seance?.nom || "").trim() || "الحصة";
        if (!editingId) {
          Alert.alert(
            "تنبيه",
            `هذا المشرف مكلف حالياً بحصة «${nomB}». لإنشاء حصة جديدة اختر مشرفاً بدون حصة. لتبديله، عدّل حصة موجودة.`
          );
          return;
        }
        const accepted = await confirmSuperviseurSwap({ nomB });
        if (!accepted) return;
        swapPartner = occupiedRes.seance;
      }
    }

    setSaving(true);
    const seasonStart = seasonDateToStorage(activeSeason?.startDate) || null;
    const seasonEnd = seasonDateToStorage(activeSeason?.endDate) || null;
    let result;
    if (editingId) {
      result = await updateSeance({
        seanceId: editingId,
        patch: {
          nom,
          jour: form.jour,
          genre: form.genre,
          heure_debut: form.heureDebut,
          heure_fin: form.heureFin,
          superviseur_id: form.superviseurId,
        },
      });
    } else {
      result = await createSeance({
        nom,
        superviseurId: form.superviseurId,
        jour: form.jour,
        genre: form.genre,
        saisonId: activeSeason.id,
        heureDebut: form.heureDebut,
        heureFin: form.heureFin,
        dateDebut: seasonStart,
        dateFin: seasonEnd,
      });
    }
    if (!result.ok) {
      setSaving(false);
      Alert.alert("تنبيه", result.error);
      return;
    }

    const swapped = result.assignment?.action === "swap";
    const swappedSeanceId =
      result.assignment?.other_seance_id || swapPartner?.id || null;

    setSaving(false);
    const nextSupervisor = supervisors.find((s) => s.id === form.superviseurId);
    const previousSupervisor =
      supervisors.find((s) => s.id === current?.superviseur_id) ||
      current?.superviseur ||
      null;
    setSeances((prev) => {
      let next = prev.map((s) => {
        if (editingId && s.id === editingId) {
          const base = result.seance
            ? { ...s, ...result.seance, inscriptions: s.inscriptions }
            : s;
          if (!result.assignment || result.assignment.action === "none") return base;
          return {
            ...base,
            superviseur_id: form.superviseurId,
            superviseur: cardSupervisor(nextSupervisor) || base.superviseur,
          };
        }
        if (swapped && swappedSeanceId && s.id === swappedSeanceId) {
          return {
            ...s,
            superviseur_id: current?.superviseur_id || null,
            superviseur: cardSupervisor(previousSupervisor) || s.superviseur,
          };
        }
        return s;
      });
      if (!editingId && result.seance) {
        next = [
          {
            ...result.seance,
            superviseur: cardSupervisor(nextSupervisor),
          },
          ...next.filter((s) => s.id !== result.seance.id),
        ];
      }
      return sortSeancesByJour(next);
    });
    setModalVisible(false);
    Alert.alert(
      editingId ? "تم التحديث" : "تم الإنشاء",
      editingId
        ? swapped
          ? "تم تبديل المشرفين بين الحصتين"
          : "تم تحديث الحصة بنجاح"
        : "تم إنشاء الحصة بنجاح"
    );
    loadAll({ silent: true });
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
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: fabBottom + 72 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {activeSeasons.length > 1 ? (
          <View style={styles.seasonChipsRow}>
            {activeSeasons.map((season) => {
              const selected = season.id === activeSeason?.id;
              const label =
                SEASON_TYPE_LABELS[season.type] || season.name || season.type;
              return (
                <TouchableOpacity
                  key={season.id}
                  style={[
                    styles.seasonChip,
                    selected && styles.seasonChipActive,
                  ]}
                  onPress={() => setSelectedSeasonId(season.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text
                    style={[
                      styles.seasonChipText,
                      selected && styles.seasonChipTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
        {loading ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="large" color={palette.primary} />
          </View>
        ) : !activeSeason ? (
          <Text style={styles.emptyText}>أنشئ موسماً جديداً أولاً</Text>
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
                displayProfileEmail(sup)
              : "";
            const genreLabel = genreLineLabel(seance.genre);
            return (
              <TouchableOpacity
                key={seance.id}
                style={styles.card}
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
                {seance.heure_debut || seance.heure_fin ? (
                  <Text style={styles.cardSup}>
                    التوقيت: {formatTimeDisplay(seance.heure_debut) || "—"} –{" "}
                    {formatTimeDisplay(seance.heure_fin) || "—"}
                  </Text>
                ) : null}
                <View style={styles.badgesRow}>
                  {genreLabel ? (
                    <View
                      style={[
                        styles.genreChip,
                        {
                          backgroundColor:
                            seance.genre === "أنثى"
                              ? GENRE_FEMALE_CHIP.background
                              : GENRE_MALE_CHIP.background,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.genreChipText,
                          {
                            color:
                              seance.genre === "أنثى"
                                ? GENRE_FEMALE_CHIP.text
                                : GENRE_MALE_CHIP.text,
                          },
                        ]}
                      >
                        {genreLabel}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.badgeMember}>
                    <Users size={14} color={colors.primary} />
                    <Text style={styles.badgeMemberText}>{memberCount} عضو</Text>
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

            <Text style={styles.modalLabel}>ساعة البداية</Text>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setTimePickerField("heureDebut")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.dateBtnText,
                  !form.heureDebut && styles.dateBtnPlaceholder,
                ]}
              >
                {form.heureDebut
                  ? formatTimeDisplay(form.heureDebut)
                  : "اختر ساعة البداية"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.modalLabel}>ساعة النهاية</Text>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setTimePickerField("heureFin")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.dateBtnText,
                  !form.heureFin && styles.dateBtnPlaceholder,
                ]}
              >
                {form.heureFin
                  ? formatTimeDisplay(form.heureFin)
                  : "اختر ساعة النهاية"}
              </Text>
            </TouchableOpacity>

            {timePickerField ? (
              <DateTimePicker
                value={storageToTime(form[timePickerField])}
                mode="time"
                is24Hour
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onTimeChange}
              />
            ) : null}
            {Platform.OS === "ios" && timePickerField ? (
              <TouchableOpacity
                style={styles.dateDoneBtn}
                onPress={() => setTimePickerField(null)}
              >
                <Text style={styles.dateDoneBtnText}>تم</Text>
              </TouchableOpacity>
            ) : null}

            <Text style={styles.modalLabel}>المشرف</Text>
            <View style={styles.supervisorChips}>
              {pickerSupervisors.map((s) => {
                const name = `${s.first_name || ""} ${s.last_name || ""}`.trim();
                const takenOnCreate = !editingId && !!s.seanceId;
                const active = !takenOnCreate && form.superviseurId === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.supervisorChip,
                      active && styles.supervisorChipActive,
                      takenOnCreate && styles.supervisorChipDisabled,
                    ]}
                    onPress={
                      takenOnCreate
                        ? undefined
                        : () => setField("superviseurId", s.id)
                    }
                    disabled={takenOnCreate}
                    accessibilityState={{ disabled: takenOnCreate }}
                  >
                    <Text
                      style={[
                        styles.supervisorChipText,
                        active && styles.supervisorChipTextActive,
                      ]}
                    >
                      {name || displayProfileEmail(s)}
                    </Text>
                    <Text
                      style={[
                        styles.supervisorChipMeta,
                        active && styles.supervisorChipMetaActive,
                      ]}
                    >
                      {s.seanceNom || "بدون حصة"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {pickerSupervisors.length === 0 ? (
              <Text style={styles.supervisorHint}>
                لا يوجد مشرفون مفعّلون — فعّل مشرفاً أولاً من شاشة «المشرفون»
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
      {messagesFab}
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
  seasonChipsRow: {
    flexDirection: row,
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  seasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: palette.border,
  },
  seasonChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  seasonChipText: {
    ...rtlText,
    color: palette.textPrimary,
    fontWeight: "600",
  },
  seasonChipTextActive: {
    color: "#fff",
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
    alignItems: "center",
    gap: 8,
  },
  genreChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  genreChipText: {
    fontSize: 13,
    ...rtlText,
  },
  badgeMember: {
    flexDirection: row,
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
  },
  badgeMemberText: {
    color: colors.primary,
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
  supervisorChipDisabled: {
    opacity: 0.45,
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
  supervisorChipMeta: {
    marginTop: 2,
    fontSize: 11,
    color: palette.placeholder,
    ...rtlText,
  },
  supervisorChipMetaActive: {
    color: "rgba(255,255,255,0.9)",
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
