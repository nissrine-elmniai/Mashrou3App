import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { computeWeekDeltaTumuns } from "../../lib/progressApi";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import {
  ENROLLMENT_LOCK_INITIAL,
  cachedCurrentInscription,
  cachedMyEnrollment,
  cachedMyObjectif,
  cachedMyProgressHistory,
  cachedMyProgressPosition,
  cachedMySeasonProgress,
  cachedPresenceSummary,
  cachedProfileFields,
  enrollmentLockFromResult,
  memberInfoFromUser,
  unknownDataMessage,
} from "../../lib/memberOfflineReads";
import { useOfflineReload } from "../../hooks/useOfflineReload";
import PersonalInfoSection from "../../components/PersonalInfoSection";
import ProfileHero from "../../components/profile/ProfileHero";
import ProfileNotificationsCard from "../../components/profile/ProfileNotificationsCard";
import SessionCard from "../../components/profile/SessionCard";
import ProgressCard from "../../components/profile/ProgressCard";
import AttendanceCard from "../../components/profile/AttendanceCard";

/**
 * Self-view membre — الملف الشخصي.
 * Props conceptuelles : showRemove=false, headerLeft="logout".
 */
export default function MemberProfileScreen({ navigation }) {
  const {
    currentUser,
    logout,
    isLoggingOut,
    seasons,
    updateCurrentUserAvatar,
  } = useApp();
  const authId = currentUser?.authId || currentUser?.id || null;

  const [memberInfo, setMemberInfo] = useState(null);
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
    // Inscription inconnue : texte à la place de « لم يتم تعيينك في حصة بعد ».
    unknownMessage: null,
  });
  /** Inscription inconnue = saisie verrouillée avec message « inconnu ». */
  const [enrollmentLock, setEnrollmentLock] = useState(ENROLLMENT_LOCK_INITIAL);
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
    // Déconnexion déjà en cours : pas de nouvelle confirmation.
    if (isLoggingOut) return;
    Alert.alert("تسجيل الخروج", "هل تريد تسجيل الخروج من الحساب؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "خروج",
        style: "destructive",
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  // Retour du réseau : rechargement (tout est rechargé au focus, pas de différé).
  const reloadRef = useRef(null);
  const markOffline = useOfflineReload(() => reloadRef.current?.());

  const loadProfileData = useCallback(async () => {
    if (!authId) {
      setMemberInfo(null);
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

    const [fieldsRes, currentInscRes] = await Promise.all([
      cachedProfileFields(authId),
      cachedCurrentInscription(authId),
    ]);
    markOffline(fieldsRes, currentInscRes);

    if (fieldsRes.ok) {
      setMemberInfo(fieldsRes);
      setContactFields({
        phone: fieldsRes.telephone || currentUser?.phone || null,
        school: fieldsRes.ecole || currentUser?.school || null,
        level: fieldsRes.niveau || currentUser?.level || null,
        hifzAmount: fieldsRes.quantiteHifz || currentUser?.hifzAmount || null,
      });
    } else {
      // Champs inconnus : profil du compte (AppContext) plutôt que des « — ».
      setMemberInfo((prev) => prev || memberInfoFromUser(currentUser));
    }

    // Inscription inconnue (échec sans cache) ≠ aucune séance.
    const unknownMessage = currentInscRes.ok
      ? null
      : unknownDataMessage(currentInscRes);
    const seance = currentInscRes.ok ? currentInscRes.seance : null;
    const inscription = currentInscRes.ok ? currentInscRes.inscription : null;
    const seanceId = seance?.id || null;
    const saisonId = seance?.saison_id || inscription?.saisonId || null;

    setSessionState({
      loading: false,
      groupName: seance?.nom || null,
      jour: seance?.jour || null,
      heureDebut: seance?.heure_debut || null,
      heureFin: seance?.heure_fin || null,
      seanceId,
      saisonId,
      registrationDate: inscription?.dateInscription || null,
      unknownMessage,
    });

    const objectifSaisonId = getActiveRegularSeason(seasons)?.id ?? null;
    const [posRes, histRes, objRes, progressRes, presRes, enrollRes] =
      await Promise.all([
      cachedMyProgressPosition(),
      cachedMyProgressHistory(objectifSaisonId),
      objectifSaisonId
        ? cachedMyObjectif(objectifSaisonId)
        : Promise.resolve({ ok: true, objectif: null }),
      cachedMySeasonProgress(objectifSaisonId),
      seanceId
        ? cachedPresenceSummary(authId, seanceId)
        : // Séance inconnue : présence inconnue (pas de « لا يوجد سجل حضور »).
          Promise.resolve(
            unknownMessage
              ? { ok: false, error: unknownMessage }
              : {
                  ok: true,
                  hasData: false,
                  rate: null,
                  presentCount: 0,
                  absentCount: 0,
                  records: [],
                }
          ),
      cachedMyEnrollment(objectifSaisonId),
    ]);
    markOffline(posRes, histRes, objRes, progressRes, presRes, enrollRes);

    setEnrollmentLock(enrollmentLockFromResult(enrollRes));

    const objectif =
      objRes.ok && objRes.objectif ? objRes.objectif : null;
    const seasonGain =
      progressRes.ok && progressRes.progress?.gain != null
        ? progressRes.progress.gain
        : null;

    if (!posRes.ok) {
      setProgressState({
        loading: false,
        // Position inconnue : message, pas « لم يتم تسجيل أي تقدم بعد ».
        error: unknownDataMessage(posRes),
        hasData: false,
        metrics: null,
        note: null,
        objectif,
        seasonDeltaTumuns: seasonGain,
        weekDeltaTumuns: null,
      });
    } else {
      const metrics = posRes.hasData ? posRes.metrics : null;
      const weekDelta = histRes.ok
        ? computeWeekDeltaTumuns(histRes.entries || [])
        : null;
      setProgressState({
        loading: false,
        error: null,
        hasData: !!metrics,
        metrics,
        note: metrics?.notes || null,
        objectif,
        seasonDeltaTumuns: seasonGain,
        weekDeltaTumuns: weekDelta,
      });
    }

    if (!presRes.ok) {
      setPresenceState({
        loading: false,
        error: unknownDataMessage(presRes),
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
  }, [authId, currentUser?.phone, currentUser?.school, currentUser?.level, currentUser?.hifzAmount, seasons, markOffline]);

  useFocusEffect(
    useCallback(() => {
      loadProfileData();
    }, [loadProfileData])
  );
  reloadRef.current = loadProfileData;

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
          disabled={isLoggingOut}
          activeOpacity={0.7}
          accessibilityLabel="تسجيل الخروج"
        >
          {isLoggingOut ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Ionicons name="log-out-outline" size={22} color="white" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {sessionState.loading && !contactFields.phone ? (
          <ActivityIndicator color={colors.primary} style={styles.pageLoader} />
        ) : null}

        <ProfileHero
          firstName={currentUser?.firstName}
          fullName={`${currentUser?.firstName || ""} ${currentUser?.lastName || ""}`.trim()}
          avatarUrl={currentUser?.avatarUrl}
          editable
          authId={authId}
          onAvatarChanged={updateCurrentUserAvatar}
        />

        <View style={styles.cards}>
          <PersonalInfoSection member={memberInfo} />

          <SessionCard
            groupName={sessionState.groupName}
            jour={sessionState.jour}
            heureDebut={sessionState.heureDebut}
            heureFin={sessionState.heureFin}
            registrationDate={sessionState.registrationDate}
            {...(sessionState.unknownMessage
              ? { emptyText: sessionState.unknownMessage }
              : {})}
          />

          <ProgressCard
            progressState={progressState}
            onUpdate={() => navigation.navigate("MemberProgress")}
            lockedMessage={enrollmentLock.locked ? enrollmentLock.message : null}
          />

          <AttendanceCard
            key={`${authId || ""}_${sessionState.seanceId || ""}`}
            presenceState={presenceState}
          />

          <ProfileNotificationsCard
            onPress={() => navigation.navigate("NotificationSettings")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  cards: {
    gap: 14,
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
