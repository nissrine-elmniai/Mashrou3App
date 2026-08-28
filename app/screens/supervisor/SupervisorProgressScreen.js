import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, rtlTextBold, row, fonts, textAlignStart } from "../../constants/rtl";
import { EmptyState } from "../../components/ui";
import { LegendDot } from "./components/SupervisorWidgets";
import { TOTAL_QURAN_PAGES, JUZ_STATUS_DEMO, WEEKLY_PROGRESS_DEMO } from "./supervisorHelpers";

/** Données membres fournies par SupervisorDashboard (un seul fetch). */
export default function SupervisorProgressScreen({ members = [] }) {
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!selectedMemberId && members[0]) setSelectedMemberId(members[0].user.id);
  }, [members, selectedMemberId]);

  const selectedMember = members.find((m) => m.user.id === selectedMemberId);
  const selectedHifzPages = selectedMember?.prog?.hifzPages || 0;
  const confirmedName = selectedMember
    ? `${selectedMember.user.firstName} ${selectedMember.user.lastName}`
    : "";

  // Tant que le menu est fermé, le champ affiche toujours le membre confirmé.
  useEffect(() => {
    if (!pickerOpen) setQuery(confirmedName);
  }, [confirmedName, pickerOpen]);

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const full = `${m.user.firstName} ${m.user.lastName}`;
      return !query.trim() || full.includes(query.trim());
    });
  }, [members, query]);

  const handleSelect = (id) => {
    setSelectedMemberId(id);
    setPickerOpen(false);
  };

  const openPicker = () => {
    setQuery("");
    setPickerOpen(true);
  };

  const togglePicker = () => (pickerOpen ? setPickerOpen(false) : openPicker());

  const maxPages = Math.max(...WEEKLY_PROGRESS_DEMO.map((x) => x.pages));

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {members.length === 0 ? (
        <EmptyState text="لا يوجد أعضاء لعرض تقدمهم" />
      ) : (
        <View style={styles.dropdownWrap}>
          <View style={[styles.comboBox, pickerOpen && styles.comboBoxOpen]}>
            <Ionicons name="search-outline" size={18} color={colors.placeholder} />
            <TextInput
              style={styles.comboInput}
              textAlign={textAlignStart}
              placeholder="ابحث أو اختر عضواً..."
              placeholderTextColor={colors.placeholder}
              value={query}
              onFocus={openPicker}
              onChangeText={(t) => {
                setQuery(t);
                if (!pickerOpen) setPickerOpen(true);
              }}
            />
            <TouchableOpacity onPress={togglePicker} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons
                name={pickerOpen ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.placeholder}
              />
            </TouchableOpacity>
          </View>

          {pickerOpen ? (
            <View style={styles.dropdownPanel}>
              <ScrollView
                style={styles.optionsScroll}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {filteredMembers.length === 0 ? (
                  <EmptyState text="لا يوجد نتائج" />
                ) : (
                  filteredMembers.map((item) => {
                    const name = `${item.user.firstName} ${item.user.lastName}`;
                    const active = item.user.id === selectedMemberId;
                    return (
                      <TouchableOpacity
                        key={item.user.id}
                        style={[styles.optionRow, active && styles.optionRowActive]}
                        onPress={() => handleSelect(item.user.id)}
                      >
                        <Text style={[styles.optionText, active && styles.optionTextActive]}>
                          {name}
                        </Text>
                        {active ? (
                          <Ionicons name="checkmark" size={18} color={colors.primary} />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>
          ) : null}
        </View>
      )}

      <View style={[styles.sectionBox, shadows.card]}>
        <Text style={styles.sectionBoxTitle}>حالة الأجزاء</Text>
        <View style={styles.juzGrid}>
          {JUZ_STATUS_DEMO.map((status, index) => {
            const bg =
              status === "memorized"
                ? colors.primarySoft
                : status === "inProgress"
                ? `${colors.gold}26`
                : colors.bg;
            return (
              <View key={index} style={[styles.juzCell, { backgroundColor: bg }]}>
                {status === "memorized" ? (
                  <Ionicons name="checkmark" size={16} color={colors.primary} />
                ) : status === "inProgress" ? (
                  <Ionicons name="time-outline" size={16} color={colors.gold} />
                ) : (
                  <Text style={styles.juzCellText}>{index + 1}</Text>
                )}
              </View>
            );
          })}
        </View>
        <View style={styles.legendRow}>
          <LegendDot color={colors.primarySoft} label="محفوظ" />
          <LegendDot color={`${colors.gold}26`} label="قيد الحفظ" />
          <LegendDot color={colors.bg} label="لم يبدأ" />
        </View>
      </View>

      <Text style={styles.pagesCounter}>
        تم حفظ <Text style={styles.pagesCounterStrong}>{selectedHifzPages}</Text> صفحة من أصل{" "}
        <Text style={styles.pagesCounterBold}>{TOTAL_QURAN_PAGES}</Text>
      </Text>

      <View style={[styles.sectionBox, shadows.card]}>
        <Text style={styles.sectionBoxTitle}>التقدم الأسبوعي</Text>
        <View style={styles.barChart}>
          {WEEKLY_PROGRESS_DEMO.map((d, index) => {
            const h = Math.max(4, Math.round((d.pages / maxPages) * 100));
            return (
              <View key={index} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { height: `${h}%` }]} />
                </View>
                <Text style={styles.barLabel}>{d.week}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 24 },

  dropdownWrap: { marginBottom: 14 },
  comboBox: {
    flexDirection: row,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    gap: 8,
  },
  comboBoxOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  comboInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: fonts.semiBold,
    color: colors.text,
    ...rtlText,
  },

  dropdownPanel: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderTopWidth: 0,
    borderBottomLeftRadius: radii.md,
    borderBottomRightRadius: radii.md,
    backgroundColor: colors.card,
    padding: 10,
    ...shadows.card,
  },
  optionsScroll: { maxHeight: 220 },
  optionRow: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
  },
  optionRowActive: { backgroundColor: colors.primarySoft },
  optionText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.text, ...rtlText },
  optionTextActive: { fontFamily: fonts.semiBold, color: colors.primary },

  sectionBox: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 14,
  },
  sectionBoxTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.text, ...rtlTextBold, marginBottom: 10 },
  juzGrid: { flexDirection: "row", flexWrap: "wrap" },
  juzCell: {
    width: "16.66%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 3,
  },
  juzCellText: { fontSize: 12, fontFamily: fonts.medium, color: colors.muted },
  legendRow: { flexDirection: row, justifyContent: "center", gap: 16, marginTop: 12 },
  pagesCounter: { textAlign: "center", color: colors.muted, marginBottom: 14, ...rtlText },
  pagesCounterStrong: { color: colors.primary, fontFamily: fonts.bold },
  pagesCounterBold: { fontFamily: fonts.bold, color: colors.text },
  barChart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 110, gap: 8 },
  barCol: { flex: 1, alignItems: "center", height: "100%", justifyContent: "flex-end", gap: 6 },
  barTrack: { width: "100%", flex: 1, justifyContent: "flex-end" },
  barFill: { width: "100%", backgroundColor: colors.primary, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barLabel: { fontSize: 9, color: colors.muted, textAlign: "center" },
});
