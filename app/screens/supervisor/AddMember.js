import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function AddMember({ navigation }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");

  const handleAddMember = () => {
    // Ici tu peux ajouter la logique pour sauvegarder le membre
    console.log("Nouveau membre :", { firstName, lastName, birthDate, gender });
    navigation.goBack(); // Retour au dashboard après ajout
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>إضافة عضو جديد</Text>
          <Text style={styles.headerSubtitle}>أدخل معلومات العضو الجديد</Text>
        </View>

        {/* Form */}
        <View style={styles.formContainer}>
          <Text style={styles.label}>الاسم الأول</Text>
          <TextInput
            style={styles.input}
            placeholder="مثال: أمينة"
            placeholderTextColor="#9CA3AF"
            value={firstName}
            onChangeText={setFirstName}
            textAlign="right"
          />

          <Text style={styles.label}>اسم العائلة</Text>
          <TextInput
            style={styles.input}
            placeholder="مثال: بنعلي"
            placeholderTextColor="#9CA3AF"
            value={lastName}
            onChangeText={setLastName}
            textAlign="right"
          />

          <Text style={styles.label}>تاريخ الميلاد</Text>
          <TextInput
            style={styles.input}
            placeholder="jj/mm/aaaa"
            placeholderTextColor="#9CA3AF"
            value={birthDate}
            onChangeText={setBirthDate}
            textAlign="right"
          />

          <Text style={styles.label}>الجنس</Text>
          <TextInput
            style={styles.input}
            placeholder="اختر الجنس"
            placeholderTextColor="#9CA3AF"
            value={gender}
            onChangeText={setGender}
            textAlign="right"
          />

          {/* Buttons */}
          <View style={styles.buttonsContainer}>
            <TouchableOpacity style={styles.addButton} onPress={handleAddMember}>
              <Ionicons name="checkmark-outline" size={20} color="white" />
              <Text style={styles.buttonText}>إضافة العضو</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="close-outline" size={20} color="white" />
              <Text style={styles.buttonText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  header: {
    padding: 20,
    backgroundColor: "#16A34A",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "right",
  },
  headerSubtitle: {
    color: "white",
    marginTop: 4,
    textAlign: "right",
  },
  formContainer: {
    padding: 20,
  },
  label: {
    textAlign: "right",
    fontWeight: "bold",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  buttonsContainer: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginTop: 20,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16A34A",
    padding: 12,
    borderRadius: 12,
    flex: 1,
    marginLeft: 8,
    justifyContent: "center",
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DC2626",
    padding: 12,
    borderRadius: 12,
    flex: 1,
    marginRight: 8,
    justifyContent: "center",
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
    marginLeft: 6,
  },
});
