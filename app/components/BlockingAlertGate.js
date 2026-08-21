import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "../constants/theme";
import { rtlText, rtlTextBold, fonts } from "../constants/rtl";
import { useApp } from "../context/AppContext";
import { ROLES } from "../constants/roles";
import {
  getUnacknowledgedAlerts,
  acknowledgeAlert,
  subscribeToNewAlerts,
} from "../lib/alertsApi";

const POLL_INTERVAL_MS = 30000;

/**
 * Passerelle bloquante RG9 : tant qu'une alerte non acquittée existe,
 * elle s'affiche en pleine écran et bloque l'usage de l'app.
 *
 * - Requête périodique toutes les 30 s.
 * - Requête immédiate à chaque retour au premier plan (exigence utilisateur :
 *   au réveil de l'app, une alerte doit s'afficher sans attendre le prochain
 *   tick de 30 s).
 * - File FIFO (created_at asc) : la plus ancienne d'abord ; l'acquittement
 *   libère la suivante.
 */
export default function BlockingAlertGate() {
  const { supabaseSession, currentUser } = useApp();
  const isAdmin = currentUser?.role === ROLES.ADMIN;
  const [queue, setQueue] = useState([]);
  const [loadingAck, setLoadingAck] = useState(false);
  const fetchingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!supabaseSession?.user?.id || isAdmin) return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await getUnacknowledgedAlerts();
      if (res.ok) setQueue(res.alerts);
    } catch (e) {
      console.warn("BlockingAlertGate: échec de requête —", e?.message || e);
    } finally {
      fetchingRef.current = false;
    }
  }, [supabaseSession?.user?.id, isAdmin]);

  // Requête immédiate au montage + Realtime (affichage dès l'envoi admin)
  useEffect(() => {
    if (!supabaseSession?.user?.id || isAdmin) return undefined;
    refresh();
    return subscribeToNewAlerts(() => {
      refresh();
    });
  }, [refresh, supabaseSession?.user?.id, isAdmin]);

  // Requête immédiate à chaque retour au premier plan
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Requête périodique tant qu'il reste des alertes (et 30 s sinon)
  useEffect(() => {
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const handleAcknowledge = async () => {
    const current = queue[0];
    if (!current || loadingAck) return;
    setLoadingAck(true);
    const res = await acknowledgeAlert(current.id);
    setLoadingAck(false);
    if (!res.ok) {
      // Erreur silencieuse : on retentera au prochain poll 30 s
      return;
    }
    // FIFO : retirer l'alerte acquittée, afficher la suivante
    setQueue((prev) => prev.filter((a) => a.id !== current.id));
  };

  if (isAdmin || !supabaseSession?.user?.id || queue.length === 0) {
    return null;
  }

  const active = queue[0];
  const total = queue.length;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay} accessibilityViewIsModal>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="megaphone" size={36} color="#fff" />
          </View>
          <Text style={styles.title}>إشعار إداري عاجل</Text>
          <Text style={styles.message}>{active.message}</Text>
          <TouchableOpacity
            style={[styles.button, loadingAck && styles.buttonDisabled]}
            onPress={handleAcknowledge}
            activeOpacity={0.85}
            disabled={loadingAck}
          >
            <Text style={styles.buttonText}>
              {loadingAck ? "جاري التأكيد..." : "تمت القراءة"}
            </Text>
          </TouchableOpacity>
          {total > 1 ? (
            <Text style={styles.counter}>
              تبقّى {total - 1} من الإشعارات غير المقروءة
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 24,
    alignItems: "center",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
    textAlign: "center",
    marginBottom: 12,
    ...rtlTextBold,
  },
  message: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
    ...rtlText,
  },
  button: {
    alignSelf: "stretch",
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#fff",
    ...rtlTextBold,
  },
  counter: {
    marginTop: 12,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    ...rtlText,
  },
});