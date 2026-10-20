import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { useApp } from "../context/AppContext";
import {
  flushMemberProgressDelta,
  scheduleMemberProgressDelta,
} from "./progressApi";
import { getActiveSeason } from "./seasonScope";
import { isHifzProgram } from "./memberProgramsApi";
import { formatSignedTumunAmount, tumunsToPercent } from "./tumun";
import { useSubmitLock } from "./useSubmitLock";
import { requireOnline } from "./toast";

/**
 * ± ثمن d'un programme avec validation groupée.
 * Les appuis modifient un écart local (pendingDelta) ; rien n'est écrit avant
 * « حفظ ». Une sauvegarde = une écriture member_programs avec le total, puis,
 * pour un programme de حفظ, une seule ligne progression (même delta).
 *
 * @param {object|null} program { id, title?, nom?, type, nbHizb, completedTumuns, totalTumuns }
 * @param {{ locked?: boolean }} [options] locked : écriture interdite (non inscrit)
 */
export function useProgramTumunDraft(program, { locked = false } = {}) {
  const { adjustMemberProgramTumuns, seasons } = useApp();
  const { busy: saving, run } = useSubmitLock();
  const [pendingDelta, setPendingDelta] = useState(0);
  // Lu par les listeners (beforeRemove, fermeture de modal) sans attendre un rendu.
  const pendingRef = useRef(0);

  const updatePending = useCallback((value) => {
    pendingRef.current = value;
    setPendingDelta(value);
  }, []);

  // Autre programme affiché : l'écart ne le suit pas.
  useEffect(() => {
    updatePending(0);
  }, [program?.id, updatePending]);

  const saved = Math.max(0, Number(program?.completedTumuns) || 0);
  const total = Math.max(0, Number(program?.totalTumuns) || 0);
  const predicted = Math.min(total, Math.max(0, saved + pendingDelta));
  const predictedPct = tumunsToPercent(predicted, program?.nbHizb);
  const hifz = isHifzProgram(program);
  const writeLocked = locked && hifz;

  // Bornes inchangées : 0 ≤ valeur prévue ≤ nb_hizb × 8.
  const canDecrement = !writeLocked && !saving && predicted > 0;
  const canIncrement = !writeLocked && !saving && predicted < total;

  const adjust = useCallback(
    (step) => {
      // Hors ligne : bloqué dès l'appui (pas de brouillon impossible à enregistrer).
      if (!requireOnline()) return;
      const next = Math.min(total, Math.max(0, saved + pendingRef.current + step));
      updatePending(next - saved);
    },
    [saved, total, updatePending]
  );

  const discard = useCallback(() => updatePending(0), [updatePending]);

  /** Une écriture avec le total. @returns {Promise<boolean>} true si enregistré. */
  const save = useCallback(() => {
    // Réseau perdu depuis l'appui sur ± : toast, écart conservé, aucun état modifié.
    if (program?.id && pendingRef.current !== 0 && !requireOnline()) {
      return Promise.resolve(false);
    }
    return run(async () => {
        const delta = pendingRef.current;
        if (!program?.id || delta === 0) return true;
        const before = saved;
        const result = await adjustMemberProgramTumuns(program.id, delta);
        if (!result.ok) {
          // Écart conservé : l'utilisateur peut réessayer ou annuler.
          Alert.alert("تنبيه", result.error || "تعذر تحديث التقدم");
          return false;
        }
        updatePending(0);
        const after = Number(result.program?.completedTumuns ?? before);
        const applied = after - before;
        if (applied !== 0 && isHifzProgram(result.program || program)) {
          // Une seule ligne progression : position actuelle + applied.
          // flushMemberProgressDelta affiche lui-même une erreur éventuelle.
          scheduleMemberProgressDelta({
            delta: applied,
            saisonId: getActiveSeason(seasons)?.id ?? null,
            notes: result.program?.title || program.title || program.nom || null,
          });
          await flushMemberProgressDelta();
        }
        return true;
      }).then((ok) => ok === true);
  }, [run, program, saved, adjustMemberProgramTumuns, seasons, updatePending]);

  /**
   * « حفظ » → confirmation, puis une seule écriture.
   * @param {Function} [onSaved] appelé après un enregistrement réussi.
   *   Ignoré si ce n'est pas une fonction (onPress passe l'événement).
   */
  const confirmSave = useCallback(
    (onSaved) => {
      if (pendingRef.current === 0) return;
      // « حفظ » hors ligne : toast, pas de confirmation.
      if (!requireOnline()) return;
      const label = formatSignedTumunAmount(pendingRef.current) || "";
      const message = hifz
        ? `سيتم تسجيل ${label} في البرنامج وسيتم تحديث موضعك في الحفظ. هل تريد المتابعة؟`
        : `سيتم تسجيل ${label} في البرنامج. هل تريد المتابعة؟`;
      Alert.alert("تأكيد الحفظ", message, [
        { text: "رجوع", style: "cancel" },
        {
          text: "حفظ",
          onPress: async () => {
            const ok = await save();
            if (ok && typeof onSaved === "function") onSaved();
          },
        },
      ]);
    },
    [hifz, save]
  );

  /**
   * « إلغاء » → confirmation, aucune écriture.
   * @param {Function} [onDiscarded] appelé après confirmation (même règle).
   */
  const confirmDiscard = useCallback(
    (onDiscarded) => {
      if (pendingRef.current === 0) return;
      Alert.alert(
        "إلغاء التعديلات",
        "سيتم حذف التعديلات غير المحفوظة. هل تريد المتابعة؟",
        [
          { text: "رجوع", style: "cancel" },
          {
            text: "إلغاء التعديلات",
            style: "destructive",
            onPress: () => {
              discard();
              if (typeof onDiscarded === "function") onDiscarded();
            },
          },
        ]
      );
    },
    [discard]
  );

  /**
   * Sortie avec un écart non enregistré : « حفظ » / « تجاهل » / « رجوع ».
   * `proceed` est appelé après un enregistrement réussi ou après « تجاهل ».
   * @returns {boolean} true si une alerte a été affichée (sortie suspendue).
   */
  const guardLeave = useCallback(
    (proceed) => {
      if (pendingRef.current === 0) return false;
      Alert.alert("لديك تعديلات غير محفوظة", undefined, [
        { text: "رجوع", style: "cancel" },
        {
          text: "تجاهل",
          style: "destructive",
          onPress: () => {
            discard();
            proceed();
          },
        },
        {
          text: "حفظ",
          onPress: async () => {
            if (await save()) proceed();
          },
        },
      ]);
      return true;
    },
    [discard, save]
  );

  return {
    pendingDelta,
    pendingRef,
    predicted,
    predictedPct,
    total,
    saving,
    writeLocked,
    canDecrement,
    canIncrement,
    increment: () => adjust(1),
    decrement: () => adjust(-1),
    confirmSave,
    confirmDiscard,
    discard,
    guardLeave,
  };
}
