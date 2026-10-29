import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, shadows } from "../constants/theme";
import { rtlText, rtlTextBold, fonts } from "../constants/rtl";
import { uploadOwnAvatar, removeOwnAvatar } from "../lib/avatarApi";
import { pickAvatarImage } from "../lib/avatarPicker";
import { requireOnline } from "../lib/toast";
import ProfileAvatar from "./ProfileAvatar";

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
  const [menuVisible, setMenuVisible] = useState(false);
  const radius = size / 2;
  const badgeSize = Math.max(24, Math.round(size * 0.32));

  const handleUpload = async (uri) => {
    if (!authId || !uri) return;
    // Réseau perdu pendant le choix de l'image : toast, rien d'autre.
    if (!requireOnline()) return;
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
          if (!requireOnline()) return;
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
    // Changer ou supprimer l'avatar (tous rôles) : hors ligne, toast dès l'appui.
    if (!requireOnline()) return;
    setMenuVisible(true);
  };

  const closeMenu = () => setMenuVisible(false);

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={openMenu}
        disabled={!authId || uploading}
        accessibilityRole="button"
        accessibilityLabel="تغيير صورة الملف الشخصي"
      >
        <View style={{ width: size, height: size, borderRadius: radius }}>
          <ProfileAvatar
            userId={authId}
            avatarUrl={avatarUrl}
            cacheKey={avatarUrl || authId}
            fallbackLetter={fallbackLetter}
            size={size}
            softBackgroundColor={softBackgroundColor}
            letterColor={letterColor}
          />

          {uploading ? (
            <View style={[styles.uploadingOverlay, { borderRadius: radius }]}>
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

      <Modal
        transparent
        animationType="fade"
        visible={menuVisible}
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.menuOverlay} onPress={closeMenu}>
          <View style={styles.menuStack}>
            <TouchableOpacity
              style={styles.menuCloseBtn}
              onPress={closeMenu}
              activeOpacity={0.85}
              hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
              accessibilityRole="button"
              accessibilityLabel="إغلاق"
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>

            <Pressable style={styles.menuCard} onPress={() => {}}>
              <Text style={styles.menuTitle}>صورة الملف الشخصي</Text>

              <TouchableOpacity
                style={styles.menuAction}
                activeOpacity={0.7}
                onPress={() => {
                  setMenuVisible(false);
                  pickImage("camera");
                }}
              >
                <Text style={styles.menuActionText}>التقاط صورة</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuAction}
                activeOpacity={0.7}
                onPress={() => {
                  setMenuVisible(false);
                  pickImage("library");
                }}
              >
                <Text style={styles.menuActionText}>اختيار من المعرض</Text>
              </TouchableOpacity>

              {avatarUrl ? (
                <TouchableOpacity
                  style={styles.menuAction}
                  activeOpacity={0.7}
                  onPress={() => {
                    setMenuVisible(false);
                    handleRemove();
                  }}
                >
                  <Text style={[styles.menuActionText, styles.menuActionDanger]}>
                    حذف الصورة
                  </Text>
                </TouchableOpacity>
              ) : null}
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  uploadingOverlay: {
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
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  menuStack: {
    width: "100%",
    maxWidth: 360,
  },
  menuCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
    marginBottom: 12,
    ...shadows.card,
  },
  menuCard: {
    width: "100%",
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
    alignItems: "stretch",
    ...shadows.card,
  },
  menuTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.text,
    paddingBottom: 12,
    ...rtlTextBold,
  },
  menuAction: {
    paddingVertical: 14,
    alignItems: "stretch",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  menuActionText: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    ...rtlText,
  },
  menuActionDanger: {
    color: colors.red,
  },
});
