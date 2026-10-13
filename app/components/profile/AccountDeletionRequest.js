import React, { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useApp } from "../../context/AppContext";
import { colors, radii } from "../../constants/theme";
import { fonts, rtlText, rtlTextCenter, row as rtlRow } from "../../constants/rtl";
import { TriangleAlert } from "lucide-react-native";
import { ROLES, userHasRole } from "../../constants/roles";
import { getProfileRoles } from "../../lib/membersApi";

const DELETE_REQUEST_EMAIL = "altruisme.ensao@gmail.com";
const DELETE_REQUEST_SUBJECT = "طلب حذف الحساب";
const DELETE_REQUEST_CONFIRM =
  "سيتم حذف حسابك وبياناته (الملف الشخصي، التقدم، الحضور، الرسائل، الصورة) خلال 30 يومًا من استلام طلبك. سيُفتح تطبيق البريد لإرسال الطلب.";

function displayField(value) {
  const text = String(value ?? "").trim();
  return text || "—";
}

function formatDdMmYyyy(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function buildDeletionRequestBody({ fullName, email, phone, seanceName }) {
  const today = new Date();
  const deadline = new Date(today);
  deadline.setDate(deadline.getDate() + 30);
  return [
    "السلام عليكم ورحمة الله،",
    "",
    "أطلب حذف حسابي في تطبيق «مهندس حامل لكتاب الله» وجميع البيانات المرتبطة به.",
    "",
    "معلومات الحساب:",
    `- الاسم الكامل: ${displayField(fullName)}`,
    `- البريد الإلكتروني: ${displayField(email)}`,
    `- رقم الهاتف: ${displayField(phone)}`,
    `- الحصة: ${displayField(seanceName)}`,
    `- تاريخ الطلب: ${formatDdMmYyyy(today)}`,
    `- آخر أجل للحذف: ${formatDdMmYyyy(deadline)}`,
    "",
    "سبب الطلب (اختياري):",
    "",
    "",
    "أعلم أن الحذف نهائي ولا يمكن التراجع عنه.",
    "",
    "وشكرًا.",
    "",
    "————————————",
    "دليل المعالجة (للإدارة):",
    "1. تحقق أن هذه الرسالة مرسلة من البريد المذكور أعلاه.",
    "2. سجّل الطلب في سجل الطلبات (تاريخ الاستلام وآخر أجل).",
    "3. أرسل إشعار استلام الطلب (النموذج أ).",
    "4. احذف الحساب: الأعضاء ← بطاقة العضو ← «حذف الحساب».",
    "5. تحقق أن العضو لم يعد في القائمة.",
    "6. تُرسل رسالة تأكيد الحذف تلقائيًا. إن ظهر تنبيه بفشل الإرسال، أرسلها يدويًا.",
    "7. سجّل تاريخ الحذف في السجل.",
  ].join("\n");
}

/** Demande de suppression du compte membre connecté. Masqué tant que les rôles ne sont pas lus. */
export default function AccountDeletionRequest({
  fullName,
  email,
  phone,
  seanceName,
}) {
  const { currentUser } = useApp();
  const authId = currentUser?.authId || currentUser?.id || null;
  const [canRequestDeletion, setCanRequestDeletion] = useState(false);
  const [mailFallback, setMailFallback] = useState(false);
  const [trackedAuthId, setTrackedAuthId] = useState(authId);
  if (trackedAuthId !== authId) {
    setTrackedAuthId(authId);
    setCanRequestDeletion(false);
  }

  useEffect(() => {
    if (!authId) return undefined;
    let cancelled = false;
    setCanRequestDeletion(false);
    void (async () => {
      const res = await getProfileRoles(authId);
      if (cancelled || !res.ok) return;
      const account = { role: res.role, roles: res.roles };
      const blocked =
        userHasRole(account, ROLES.ADMIN) || userHasRole(account, ROLES.SUPERVISOR);
      if (!blocked) setCanRequestDeletion(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authId]);

  const openDeletionMailto = async () => {
    const body = buildDeletionRequestBody({
      fullName,
      email,
      phone,
      seanceName,
    });
    const url = `mailto:${DELETE_REQUEST_EMAIL}?subject=${encodeURIComponent(DELETE_REQUEST_SUBJECT)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch {
      setMailFallback(true);
    }
  };

  const confirmDeletionRequest = () => {
    Alert.alert("حذف الحساب", DELETE_REQUEST_CONFIRM, [
      { text: "إلغاء", style: "cancel" },
      { text: "متابعة", onPress: openDeletionMailto },
    ]);
  };

  return (
    <>
      {canRequestDeletion ? (
        <TouchableOpacity
          style={styles.deleteAccountBtn}
          onPress={confirmDeletionRequest}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="حذف الحساب"
        >
          <TriangleAlert size={18} color={colors.red} />
          <Text style={styles.deleteAccountText}>حذف الحساب</Text>
        </TouchableOpacity>
      ) : null}

      <Modal
        visible={mailFallback}
        transparent
        animationType="fade"
        onRequestClose={() => setMailFallback(false)}
      >
        <View style={styles.fallbackOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setMailFallback(false)}
          />
          <View style={styles.fallbackCard}>
            <Text style={styles.fallbackText}>
              أرسل طلب حذف الحساب من بريد حسابك إلى العنوان التالي:
            </Text>
            <Text selectable style={styles.fallbackEmail}>
              {DELETE_REQUEST_EMAIL}
            </Text>
            <TouchableOpacity
              style={styles.fallbackClose}
              onPress={() => setMailFallback(false)}
              activeOpacity={0.75}
            >
              <Text style={styles.fallbackCloseText}>إغلاق</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  deleteAccountBtn: {
    backgroundColor: "#FFEBEE",
    borderRadius: radii.lg,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: rtlRow,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  deleteAccountText: {
    color: colors.red,
    fontFamily: fonts.bold,
    fontSize: 16,
    ...rtlTextCenter,
  },
  fallbackOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  fallbackCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 20,
  },
  fallbackText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    ...rtlText,
  },
  fallbackEmail: {
    marginTop: 12,
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.primary,
    textAlign: "center",
    writingDirection: "ltr",
  },
  fallbackClose: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  fallbackCloseText: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.text,
    ...rtlTextCenter,
  },
});
