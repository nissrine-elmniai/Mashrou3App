import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Alert,
  Modal,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { colors, radii } from "../../constants/theme";
import {
  row,
  rtlText,
  rtlTextBold,
  fonts,
  arrowBack,
  textAlignStart,
} from "../../constants/rtl";
import { EmptyState } from "../../components/ui";
import ProfileAvatar from "../../components/ProfileAvatar";
import { pickAvatarImage } from "../../lib/avatarPicker";
import {
  getChatGroup,
  getGroupMembers,
  getEligibleMembers,
  addGroupMember,
  removeGroupMember,
  updateGroupName,
  uploadGroupAvatar,
  removeGroupAvatar,
} from "../../lib/chatGroupsApi";

export default function GroupInfoScreen({ navigation, route }) {
  const {
    groupId,
    groupName: routeName,
    groupAvatarUrl: routeAvatar,
  } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [name, setName] = useState(routeName || "");
  const [editName, setEditName] = useState(routeName || "");
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(routeAvatar || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [members, setMembers] = useState([]);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [eligible, setEligible] = useState([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    const [groupRes, membersRes] = await Promise.all([
      getChatGroup(groupId),
      getGroupMembers(groupId),
    ]);
    if (groupRes.ok && groupRes.group) {
      setName(groupRes.group.name || "");
      setEditName(groupRes.group.name || "");
      setAvatarUrl(groupRes.group.avatarUrl || null);
      setIsAdmin(!!groupRes.group.isAdmin);
    }
    if (membersRes.ok) {
      setMembers(membersRes.members || []);
    }
    setLoading(false);
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const propagateToChat = (nextName, nextAvatar) => {
    navigation.setParams({
      groupName: nextName ?? name,
      groupAvatarUrl: nextAvatar !== undefined ? nextAvatar : avatarUrl,
    });
  };

  const saveName = async () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      Alert.alert("تنبيه", "اكتب اسم المجموعة");
      return;
    }
    setSavingName(true);
    const res = await updateGroupName({ groupId, nom: trimmed });
    setSavingName(false);
    if (!res.ok) {
      Alert.alert("خطأ", res.error || "تعذر تحديث الاسم");
      return;
    }
    setName(trimmed);
    setEditingName(false);
    propagateToChat(trimmed, undefined);
  };

  const pickGroupImage = async (source) => {
    if (!isAdmin || uploadingAvatar) return;
    const result = await pickAvatarImage(source);
    if (result.canceled) return;
    if (!result.ok) {
      Alert.alert(
        result.needsRebuild ? "تحديث التطبيق مطلوب" : "تنبيه",
        result.error || "تعذر اختيار الصورة"
      );
      return;
    }
    setUploadingAvatar(true);
    const res = await uploadGroupAvatar(groupId, result.uri);
    setUploadingAvatar(false);
    if (!res.ok) {
      Alert.alert("خطأ", res.error || "تعذر رفع الصورة");
      return;
    }
    setAvatarUrl(res.avatarUrl);
    propagateToChat(undefined, res.avatarUrl);
  };

  const openAvatarMenu = () => {
    if (!isAdmin || uploadingAvatar) return;
    const actions = [
      { text: "التقاط صورة", onPress: () => pickGroupImage("camera") },
      { text: "اختيار من المعرض", onPress: () => pickGroupImage("library") },
    ];
    if (avatarUrl) {
      actions.push({
        text: "حذف الصورة",
        style: "destructive",
        onPress: () => {
          Alert.alert("حذف الصورة", "هل تريد حذف صورة المجموعة؟", [
            { text: "إلغاء", style: "cancel" },
            {
              text: "حذف",
              style: "destructive",
              onPress: async () => {
                setUploadingAvatar(true);
                const res = await removeGroupAvatar(groupId);
                setUploadingAvatar(false);
                if (!res.ok) {
                  Alert.alert("خطأ", res.error || "تعذر حذف الصورة");
                  return;
                }
                setAvatarUrl(null);
                propagateToChat(undefined, null);
              },
            },
          ]);
        },
      });
    }
    actions.push({ text: "إلغاء", style: "cancel" });
    Alert.alert("صورة المجموعة", "اختر إجراءً", actions);
  };

  const confirmRemove = (member) => {
    if (!isAdmin || member.isAdmin) return;
    Alert.alert(
      "إزالة العضو",
      `هل تريد إزالة ${member.name} من المجموعة؟`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "إزالة",
          style: "destructive",
          onPress: async () => {
            const res = await removeGroupMember({
              groupId,
              membreId: member.id,
            });
            if (!res.ok) {
              Alert.alert("خطأ", res.error || "تعذر إزالة العضو");
              return;
            }
            setMembers((prev) => prev.filter((m) => m.id !== member.id));
          },
        },
      ]
    );
  };

  const openAddModal = async () => {
    setAddModalVisible(true);
    setEligibleLoading(true);
    const res = await getEligibleMembers(groupId);
    setEligibleLoading(false);
    if (!res.ok) {
      Alert.alert("خطأ", res.error || "تعذر تحميل الأعضاء");
      setEligible([]);
      return;
    }
    setEligible(res.members || []);
  };

  const handleAdd = async (member) => {
    const res = await addGroupMember({ groupId, membreId: member.id });
    if (!res.ok) {
      Alert.alert("خطأ", res.error || "تعذر إضافة العضو");
      return;
    }
    setEligible((prev) => prev.filter((m) => m.id !== member.id));
    setMembers((prev) => [
      ...prev,
      {
        ...member,
        groupRole: "member",
        isAdmin: false,
      },
    ]);
  };

  const avatarLetter = (name || "م").trim().charAt(0) || "م";

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.card} />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name={arrowBack} size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>معلومات المجموعة</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <TouchableOpacity
              activeOpacity={isAdmin ? 0.85 : 1}
              onPress={isAdmin ? openAvatarMenu : undefined}
              disabled={!isAdmin || uploadingAvatar}
            >
              <View style={styles.avatarBox}>
                {avatarUrl ? (
                  <ProfileAvatar
                    userId={groupId}
                    avatarUrl={avatarUrl}
                    cacheKey={avatarUrl || groupId}
                    fallbackLetter={avatarLetter}
                    size={88}
                    softBackgroundColor={colors.primarySoft}
                    letterColor={colors.primary}
                  />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Ionicons name="people" size={40} color={colors.primary} />
                  </View>
                )}
                {uploadingAvatar ? (
                  <View style={styles.avatarOverlay}>
                    <ActivityIndicator color="#fff" />
                  </View>
                ) : null}
                {isAdmin ? (
                  <View style={styles.cameraBadge}>
                    <Ionicons name="camera" size={14} color="#fff" />
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>

            {editingName && isAdmin ? (
              <View style={styles.nameEditRow}>
                <TextInput
                  style={styles.nameInput}
                  value={editName}
                  onChangeText={setEditName}
                  textAlign={textAlignStart}
                  autoFocus
                  maxLength={80}
                />
                <TouchableOpacity
                  style={styles.saveNameBtn}
                  onPress={saveName}
                  disabled={savingName}
                >
                  {savingName ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelNameBtn}
                  onPress={() => {
                    setEditName(name);
                    setEditingName(false);
                  }}
                >
                  <Ionicons name="close" size={20} color={colors.muted} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.nameRow}
                onPress={() => isAdmin && setEditingName(true)}
                disabled={!isAdmin}
                activeOpacity={isAdmin ? 0.7 : 1}
              >
                <Text style={styles.groupName}>{name || "مجموعة الحصة"}</Text>
                {isAdmin ? (
                  <Ionicons name="pencil" size={16} color={colors.muted} />
                ) : null}
              </TouchableOpacity>
            )}

            <Text style={styles.memberCount}>
              {members.length}{" "}
              {members.length === 1 ? "عضو" : "أعضاء"}
            </Text>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>الأعضاء</Text>
            {isAdmin ? (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={openAddModal}
                activeOpacity={0.8}
              >
                <Ionicons name="person-add" size={16} color="#fff" />
                <Text style={styles.addBtnText}>إضافة</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {members.length === 0 ? (
            <EmptyState text="لا يوجد أعضاء في المجموعة" />
          ) : (
            members.map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <ProfileAvatar
                  userId={m.id}
                  avatarUrl={m.avatarUrl}
                  cacheKey={m.avatarUrl || m.id}
                  fallbackLetter={(m.firstName || m.name || "؟").charAt(0)}
                  size={40}
                  softBackgroundColor={colors.primarySoft}
                  letterColor={colors.primary}
                />
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {m.name}
                  </Text>
                  {m.isAdmin ? (
                    <Text style={styles.adminBadge}>المشرف · مسؤول المجموعة</Text>
                  ) : null}
                </View>
                {isAdmin && !m.isAdmin ? (
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => confirmRemove(m)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="remove-circle" size={22} color={colors.red} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal
        visible={addModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>إضافة عضو</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>
              الأعضاء المقبولون في الحصة وغير الموجودين في المجموعة
            </Text>
            {eligibleLoading ? (
              <ActivityIndicator
                style={{ marginVertical: 24 }}
                color={colors.primary}
              />
            ) : eligible.length === 0 ? (
              <EmptyState text="لا يوجد أعضاء لإضافتهم" />
            ) : (
              <FlatList
                data={eligible}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.eligibleRow}
                    onPress={() => handleAdd(item)}
                    activeOpacity={0.7}
                  >
                    <ProfileAvatar
                      userId={item.id}
                      avatarUrl={item.avatarUrl}
                      cacheKey={item.avatarUrl || item.id}
                      fallbackLetter={(item.firstName || item.name || "؟").charAt(0)}
                      size={36}
                      softBackgroundColor={colors.primarySoft}
                      letterColor={colors.primary}
                    />
                    <Text style={styles.eligibleName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Ionicons name="add-circle" size={22} color={colors.primary} />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: 2 },
  headerTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    ...rtlTextBold,
  },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { paddingBottom: 32 },
  hero: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatarBox: { width: 88, height: 88, borderRadius: 44 },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 44,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  cameraBadge: {
    position: "absolute",
    end: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  nameRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    marginTop: 14,
  },
  groupName: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.text,
    ...rtlTextBold,
  },
  nameEditRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    width: "100%",
  },
  nameInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    fontFamily: fonts.medium,
    color: colors.text,
    backgroundColor: colors.bg,
    ...rtlText,
  },
  saveNameBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelNameBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.soft,
    justifyContent: "center",
    alignItems: "center",
  },
  memberCount: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 13,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  sectionHeader: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.gold,
    ...rtlTextBold,
  },
  addBtn: {
    flexDirection: row,
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  addBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: fonts.bold,
  },
  memberRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  memberInfo: { flex: 1 },
  memberName: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.text,
    ...rtlTextBold,
  },
  adminBadge: {
    fontSize: 12,
    color: colors.primary,
    marginTop: 2,
    fontFamily: fonts.medium,
    ...rtlText,
  },
  removeBtn: { padding: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingBottom: 24,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.text,
    ...rtlTextBold,
  },
  modalHint: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.muted,
    fontSize: 13,
    ...rtlText,
  },
  eligibleRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  eligibleName: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.text,
    ...rtlText,
  },
});
