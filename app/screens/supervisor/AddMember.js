import React, { useState } from "react";
import { Text, StyleSheet, Alert } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useApp } from "../../context/AppContext";
import {
  AppShell,
  SectionCard,
  QuickButton,
  FormInput,
  SoftButton,
} from "../../components/ui";
import { colors } from "../../constants/theme";
import { rtlText } from "../../constants/rtl";

export default function AddMember({ navigation }) {
  const { addMember, currentUser, getSupervisorGroups } = useApp();
  const groups = getSupervisorGroups(currentUser?.id);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [groupId, setGroupId] = useState(groups[0]?.id || "");

  const handleAddMember = () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert("تنبيه", "املأ الاسم واللقب");
      return;
    }
    if (!groupId) {
      Alert.alert("تنبيه", "ليس لديك مجموعة لإضافة العضو إليها");
      return;
    }

    const genderLabel =
      gender === "male" ? "ذكر" : gender === "female" ? "أنثى" : "غير محدد";

    const result = addMember({
      firstName,
      lastName,
      birthDate: birthDate || "2000/01/01",
      gender: genderLabel,
      groupId,
    });

    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }

    Alert.alert("تم", "تمت إضافة العضو بنجاح");
    navigation.goBack();
  };

  return (
    <AppShell
      title="إضافة عضو جديد"
      subtitle="أدخل معلومات العضو الجديد"
      icon="person-add"
      onBack={() => navigation.goBack()}
    >
      <SectionCard title="بيانات العضو" subtitle="جميع الحقول الأساسية">
        <Text style={styles.label}>الاسم الأول</Text>
        <FormInput
          placeholder="مثال: أمينة"
          value={firstName}
          onChangeText={setFirstName}
        />
        <Text style={styles.label}>اللقب</Text>
        <FormInput
          placeholder="مثال: بنعلي"
          value={lastName}
          onChangeText={setLastName}
        />
        <Text style={styles.label}>تاريخ الميلاد</Text>
        <FormInput
          placeholder="15/03/1995"
          value={birthDate}
          onChangeText={setBirthDate}
        />
        <Text style={styles.label}>الجنس</Text>
        <Picker
          selectedValue={gender}
          onValueChange={setGender}
          style={styles.picker}
        >
          <Picker.Item label="اختر الجنس" value="" />
          <Picker.Item label="ذكر" value="male" />
          <Picker.Item label="أنثى" value="female" />
        </Picker>

        <Text style={styles.label}>المجموعة</Text>
        {groups.map((g) => (
          <SoftButton
            key={g.id}
            label={g.name}
            active={groupId === g.id}
            onPress={() => setGroupId(g.id)}
          />
        ))}

        <QuickButton
          color={colors.primary}
          icon="person-add-outline"
          label="إضافة العضو"
          onPress={handleAddMember}
        />
      </SectionCard>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  label: { ...rtlText, marginBottom: 6, color: colors.muted, marginTop: 4 },
  picker: { marginBottom: 12 },
});
