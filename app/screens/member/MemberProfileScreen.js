import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useApp } from "../../context/AppContext";
import { colors } from "../../constants/theme";
import { rtlTextBold, fonts, arrowBack, row as rtlRow } from "../../constants/rtl";
import {
  getMemberProfileFields,
  formatGenderLabel,
} from "../../lib/membersApi";
import { getMySeance, getMyInscriptionDate } from "../../lib/messagesApi";
import {
  getMyProgress,
  computeProgressMetrics,
  computeProgressPace,
  latestProgressionRow,
  getMemberSeasonObjectif,
} from "../../lib/progressApi";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import { getMemberPresenceSummary } from "../../lib/presenceApi";
import ProfileInfoCard from "../../components/profile/ProfileInfoCard";
import SessionCard from "../../components/profile/SessionCard";
import ProgressCard from "../../components/profile/ProgressCard";
import AttendanceCard from "../../components/profile/AttendanceCard";

/** Genre depuis currentUser uniquement — pas de fetch member_applications. */
function displayGenderFromUser(gender) {
  const raw = String(gender || "").trim();
  if (!raw || raw === "غير محدد") return null;
  return formatGenderLabel(raw) || null;
}

/**
 * Self-view membre — الملف الشخصي.
 * Props conceptuelles : showRemove=false, headerLeft="logout".
 */
export default function MemberProfileScreen({ navigation }) {
  const { currentUser, logout, seasons } = useApp();
  const authId = currentUser?.authId || currentUser?.id || null;

  const [contactFields, setContactFields] = useState({
    phone: currentUser?.phone || null,
    school: currentUser?.school || null,
    level: currentUser?.level || null,
    hifzAmount: currentUser?.hifzAmount || null,
  });
  const [sessionState, setSessionState] = useState({
    loading: !!authId,
    groupName: null,
    jour: null,
    heureDebut: null,
    seanceId: null,
    saisonId: null,
    registrationDate: null,
  });
  const [progressState, setProgressState] = useState({
    loading: !!authId,
    error: null,
    hasData: false,
    metrics: null,
    note: null,
    objectif: null,
    seasonDeltaTumuns: null,
    weekDeltaTumuns: null,
  });
  const [presenceState, setPresenceState] = useState({
    loading: !!authId,
    error: null,
    hasData: false,
    rate: null,
    presentCount: 0,
    absentCount: 0,
    records: [],
  });

  const handleLogout = () => {
    Alert.alert("تسجيل الخروج", "هل تريد تسجيل الخروج من الحساب؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "خروج",
        style: "destructive",
        onPress: async () => {
          await logout();
          navigation.reset({ index: 0, routes: [{ name: "Login" }] });
        },
      },
    ]);
  };

  const loadProfileData = useCallback(async () => {
    if (!authId) {
      setSessionState({
        loading: false,
        groupName: null,
        jour: null,
        heureDebut: null,
        seanceId: null,
        saisonId: null,
        registrationDate: null,
      });
      setProgressState({
        loading: false,
        error: null,
        hasData: false,
        metrics: null,
        note: null,
        objectif: null,
        seasonDeltaTumuns: null,
        weekDeltaTumuns: null,
      });
      setPresenceState({
        loading: false,
        error: null,
        hasData: false,
        rate: null,
        presentCount: 0,
        absentCount: 0,
        records: [],
      });
      return;
    }

    setProgressState((s) => ({ ...s, loading: true, error: null }));
    setPresenceState((s) => ({ ...s, loading: true, error: null }));
    setSessionState((s) => ({ ...s, loading: true }));

    const [fieldsRes, seanceRes, inscRes] = await Promise.all([
      getMemberProfileFields(authId),
      getMySeance(),
      getMyInscriptionDate(authId),
    ]);

    if (fieldsRes.ok) {
      setContactFields({
        phone: fieldsRes.telephone || currentUser?.phone || null,
        school: fieldsRes.ecole || currentUser?.school || null,
        level: fieldsRes.niveau || currentUser?.level || null,
        hifzAmount: fieldsRes.quantiteHifz || currentUser?.hifzAmount || null,
      });
    }

    const seance = seanceRes.ok ? seanceRes.seance : null;
    const seanceId = seance?.id || null;
    const saisonId = seance?.saison_id || null;

    setSessionState({
      loading: false,
      groupName: seance?.nom || null,
      jour: seance?.jour || null,
      heureDebut: seance?.heure_debut || null,
      seanceId,
      saisonId,
      registrationDate: inscRes.ok ? inscRes.dateInscription : null,
    });

    const [progRes, objRes, presRes] = await Promise.all([
      getMyProgress(),
      saisonId
        ? getMemberSeasonObjectif(authId, saisonId)
        : Promise.resolve({ ok: true, objectif: null }),
      getMemberPresenceSummary(authId, seanceId),
    ]);

    if (!progRes.ok) {
      setProgressState({
        loading: false,
        error: progRes.error,
        hasData: false,
        metrics: null,
        note: null,
        objectif: null,
        seasonDeltaTumuns: null,
        weekDeltaTumuns: null,
      });
    } else {
      const entries = progRes.entries || [];
      const latest = latestProgressionRow(entries);
      const metrics = latest ? computeProgressMetrics(latest) : null;
      const pace = computeProgressPace(
        entries,
        getActiveRegularSeason(seasons)?.id ?? null
      );
      setProgressState({
        loading: false,
        error: null,
        hasData: !!metrics,
        metrics,
        note: metrics?.notes || null,
        objectif: objRes.ok && objRes.objectif ? objRes.objectif : null,
        seasonDeltaTumuns: pace.seasonDeltaTumuns,
        weekDeltaTumuns: pace.weekDeltaTumuns,
      });
    }

    if (!presRes.ok) {
      setPresenceState({
        loading: false,
        error: presRes.error,
        hasData: false,
        rate: null,
        presentCount: 0,
        absentCount: 0,
        records: [],
      });
    } else {
      setPresenceState({
        loading: false,
        error: null,
        hasData: presRes.hasData,
        rate: presRes.rate,
        presentCount: presRes.presentCount ?? 0,
        absentCount: presRes.absentCount ?? 0,
        records: presRes.records || [],
      });
    }
  }, [authId, currentUser?.phone, currentUser?.school, currentUser?.level, currentUser?.hifzAmount, seasons]);

  useFocusEffect(
    useCallback(() => {
      loadProfileData();
    }, [loadProfileData])
  );

  useEffect(() => {
    setContactFields((prev) => ({
      phone: prev.phone || currentUser?.phone || null,
      school: prev.school || currentUser?.school || null,
      level: prev.level || currentUser?.level || null,
      hifzAmount: prev.hifzAmount || currentUser?.hifzAmount || null,
    }));
  }, [currentUser?.phone, currentUser?.school, currentUser?.level, currentUser?.hifzAmount]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityLabel="رجوع"
        >
          <Ionicons name={arrowBack} size={22} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الملف الشخصي</Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={handleLogout}
          activeOpacity={0.7}
          accessibilityLabel="تسجيل الخروج"
        >
          <Ionicons name="log-out-outline" size={22} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {sessionState.loading && !contactFields.phone ? (
          <ActivityIndicator color={colors.primary} style={styles.pageLoader} />
        ) : null}

        <ProfileInfoCard
          email={currentUser?.email || null}
          gender={displayGenderFromUser(currentUser?.gender)}
          phone={contactFields.phone}
          school={contactFields.school}
          level={contactFields.level}
          hifzAmount={contactFields.hifzAmount}
        />

        <SessionCard
          groupName={sessionState.groupName}
          jour={sessionState.jour}
          heureDebut={sessionState.heureDebut}
          registrationDate={sessionState.registrationDate}
        />

        <ProgressCard
          progressState={progressState}
          onUpdate={() => navigation.navigate("MemberProgress")}
        />

        <AttendanceCard
          key={`${authId || ""}_${sessionState.seanceId || ""}`}
          presenceState={presenceState}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  header: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.primary,
  },
  headerBtn: {
    padding: 4,
    minWidth: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: "white",
    fontSize: 18,
    fontFamily: fonts.bold,
    ...rtlTextBold,
  },
  pageLoader: { marginVertical: 8 },
});
