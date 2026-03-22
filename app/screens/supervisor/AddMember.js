// AddMember.js

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  ScrollView
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";

export default function AddMember({ navigation }) {

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");

  const handleClose = () => {
    navigation.goBack();
  };

  const handleAddMember = () => {
    console.log("Member Added:", {
      firstName,
      lastName,
      birthDate,
      gender,
    });

    navigation.goBack();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
      <Modal animationType="fade" transparent={true} visible={true}>
        <View style={styles.overlay}>
          <View style={styles.modalContainer}>
            <ScrollView showsVerticalScrollIndicator={false}>

              {/* Close Button */}
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={handleClose}
              >
                <Ionicons name="close" size={24} color="#777" />
              </TouchableOpacity>

              <Text style={styles.title}>إضافة عضو جديد</Text>
              <Text style={styles.subtitle}>أدخل معلومات العضو الجديد</Text>

              <Text style={styles.label}>الاسم الأول</Text>
              <TextInput
                style={styles.input}
                placeholder="مثال: أمينة"
                textAlign="right"
                value={firstName}
                onChangeText={setFirstName}
              />

              <Text style={styles.label}>اسم العائلة</Text>
              <TextInput
                style={styles.input}
                placeholder="مثال: بنعلي"
                textAlign="right"
                value={lastName}
                onChangeText={setLastName}
              />

              <Text style={styles.label}>تاريخ الميلاد</Text>
              <TextInput
                style={styles.input}
                placeholder="jj/mm/aaaa"
                textAlign="right"
                value={birthDate}
                onChangeText={setBirthDate}
              />

              <Text style={styles.label}>الجنس</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={gender}
                  onValueChange={(itemValue) => setGender(itemValue)}
                >
                  <Picker.Item label="اختر الجنس" value="" />
                  <Picker.Item label="ذكر" value="male" />
                  <Picker.Item label="أنثى" value="female" />
                </Picker>
              </View>

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={handleAddMember}
                >
                  <Text style={styles.addButtonText}>إضافة العضو</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleClose}
                >
                  <Text style={styles.cancelButtonText}>إلغاء</Text>
                </TouchableOpacity>
              </View>

            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalContainer: {
    width: "90%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
  },

  closeBtn: {
    alignSelf: "flex-start",
  },

  title: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    color: "#16A34A",
    marginBottom: 5,
  },

  subtitle: {
    textAlign: "center",
    color: "#777",
    marginBottom: 20,
  },

  label: {
    marginTop: 10,
    marginBottom: 6,
    textAlign: "right",
  },

  input: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#cde7d8",
  },

  pickerContainer: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cde7d8",
  },

  buttonContainer: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginTop: 25,
  },

  addButton: {
    backgroundColor: "#16A34A",
    padding: 12,
    borderRadius: 10,
    width: "48%",
    alignItems: "center",
  },

  addButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },

  cancelButton: {
    borderWidth: 1,
    borderColor: "#16A34A",
    padding: 12,
    borderRadius: 10,
    width: "48%",
    alignItems: "center",
  },

  cancelButtonText: {
    color: "#16A34A",
    fontWeight: "bold",
  },
});