import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { rtlText, row, textAlignStart } from "../../constants/rtl";

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

const members = ["أحمد خالد", "محمد علي", "عمر حسن", "سعد محمود", "فهد أحمد"];

export default function AdminTestsScreen({ navigation }) {
  const [selectAll, setSelectAll] = useState(false);
  const [notifyMembers, setNotifyMembers] = useState(true);
  const [selectedMembers, setSelectedMembers] = useState([]);

  const toggleMember = (member) => {
    setSelectedMembers((prev) =>
      prev.includes(member) ? prev.filter((m) => m !== member) : [...prev, member]
    );
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedMembers([]);
    } else {
      setSelectedMembers([...members]);
    }
    setSelectAll(!selectAll);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>إنشاء اختبار جديد</Text>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>عنوان الاختبار</Text>
        <TextInput
          style={styles.input}
          placeholder="مثال: اختبار الجزء الأول"
          placeholderTextColor={palette.placeholder}
          textAlign="right"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>الوصف</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="وصف الاختبار..."
          placeholderTextColor={palette.placeholder}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          textAlign="right"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>تاريخ الاختبار</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={palette.placeholder}
          textAlign="right"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>الجلسة</Text>
        <View style={styles.picker}>
          <Text style={styles.pickerPlaceholder}>اختر الجلسة</Text>
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <View style={styles.checklistHeader}>
          <Text style={styles.label}>الأعضاء المشاركون</Text>
          <TouchableOpacity onPress={handleSelectAll}>
            <Text style={styles.selectAllText}>
              {selectAll ? "إلغاء الكل" : "اختيار الكل"}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.checklist}>
          {members.map((member, index) => {
            const isSelected = selectedMembers.includes(member);
            return (
              <TouchableOpacity
                key={index}
                style={[styles.checkItem, isSelected && styles.checkItemSelected]}
                onPress={() => toggleMember(member)}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkLabel}>{member}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>إرسال إشعار للأعضاء</Text>
        <TouchableOpacity
          style={[styles.toggleTrack, notifyMembers && styles.toggleTrackOn]}
          onPress={() => setNotifyMembers(!notifyMembers)}
        >
          <View style={[styles.toggleThumb, notifyMembers && styles.toggleThumbOn]} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.submitBtn}>
        <Text style={styles.submitText}>إنشاء الاختبار</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: palette.textPrimary,
    marginBottom: 20,
    ...rtlText,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: palette.textSecondary,
    marginBottom: 6,
    ...rtlText,
  },
  input: {
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    backgroundColor: "#fff",
    fontSize: 15,
    color: palette.textPrimary,
    ...rtlText,
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  picker: {
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  pickerPlaceholder: {
    color: palette.placeholder,
    fontSize: 15,
    ...rtlText,
  },
  checklistHeader: {
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  selectAllText: {
    color: palette.primary,
    fontSize: 14,
    fontWeight: "500",
  },
  checklist: {
    maxHeight: 160,
  },
  checkItem: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    padding: 10,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 6,
  },
  checkItemSelected: {
    borderColor: palette.primary,
    backgroundColor: palette.softGreen,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: palette.border,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  checkmark: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  checkLabel: {
    color: palette.textPrimary,
    fontSize: 14,
    ...rtlText,
  },
  toggleRow: {
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 20,
  },
  toggleLabel: {
    color: palette.textPrimary,
    fontSize: 14,
    ...rtlText,
  },
  toggleTrack: {
    width: 48,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.border,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleTrackOn: {
    backgroundColor: palette.gold,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
  },
  toggleThumbOn: {
    alignSelf: "flex-end",
  },
  submitBtn: {
    width: "100%",
    paddingVertical: 14,
    backgroundColor: palette.primary,
    borderRadius: 16,
    alignItems: "center",
  },
  submitText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
});