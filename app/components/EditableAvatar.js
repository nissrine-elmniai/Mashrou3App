import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../constants/theme";
import { fonts } from "../constants/rtl";
import { uploadOwnAvatar, removeOwnAvatar } from "../lib/avatarApi";
import { pickAvatarImage } from "../lib/avatarPicker";

export default function EditableAvatar({
  authId,
  avatarUrl,
  fallbackLetter = "؟",
  size = 76,
  softBackgroundColor = colors.primarySoft,
  letterColor = colors.primary,
  onChanged,
}) {
  const [uploading, setUploading] = useState(false);
  const letter = String(fallbackLetter || "؟").trim().charAt(0) || "؟";
  const radius = size / 2;
  const fontSize = Math.round(size * 0.34);
  const badgeSize = Math.max(24, Math.round(size * 0.32));

  const handleUpload = async (uri) => {
    if (!authId || !uri) return;
    setUploading(true);
    const res = await uploadOwnAvatar(authId, uri);
    setUploading(false);
    if (!res.ok) {
      Alert.alert("خطأ", res.error || "تعذر تحديث الصورة");
      return;
    }
    onChanged?.(res.avatarUrl);
  };

  const pickImage = async (source) => {
    if (!authId || uploading) return;

    const result = await pickAvatarImage(source);
    if (result.canceled) return;
    if (!result.ok) {
      Alert.alert(
        result.needsRebuild ? "تحديث التطبيق مطلوب" : "تنبيه",
        result.error || "تعذر اختيار الصورة"
      );
      return;
    }
    await handleUpload(result.uri);
  };

  const handleRemove = () => {
    if (!authId || uploading) return;
    Alert.alert("حذف الصورة", "هل تريد حذف صورة ملفك الشخصي؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          setUploading(true);
          const res = await removeOwnAvatar(authId);
          setUploading(false);
          if (!res.ok) {
            Alert.alert("خطأ", res.error || "تعذر حذف الصورة");
            return;
          }
          onChanged?.(null);
        },
      },
    ]);
  };

  const openMenu = () => {
    if (!authId || uploading) return;

    const actions = [
      { text: "التقاط صورة", onPress: () => pickImage("camera") },
      { text: "اختيار من المعرض", onPress: () => pickImage("library") },
    ];
    if (avatarUrl) {
      actions.push({
        text: "حذف الصورة",
        style: "destructive",
        onPress: handleRemove,
      });
    }
    actions.push({ text: "إلغاء", style: "cancel" });

    Alert.alert("صورة الملف الشخصي", "اختر إجراءً", actions);
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={openMenu}
      disabled={!authId || uploading}
      accessibilityRole="button"
      accessibilityLabel="تغيير صورة الملف الشخصي"
    >
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: softBackgroundColor,
          },
        ]}
      >
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: size, height: size, borderRadius: radius }}
            resizeMode="cover"
          />
        ) : (
          <Text style={[styles.letter, { color: letterColor, fontSize }]}>
            {letter}
          </Text>
        )}

        {uploading ? (
          <View style={[styles.overlay, { borderRadius: radius }]}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}

        <View
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
            },
          ]}
        >
          <Ionicons name="camera" size={Math.round(badgeSize * 0.5)} color="#fff" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  circle: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    position: "relative",
  },
  letter: {
    fontFamily: fonts.bold,
    textAlign: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
    position: "absolute",
    end: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
});
