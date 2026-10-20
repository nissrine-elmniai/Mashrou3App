import React, { useEffect, useRef, useState } from "react";
import { Animated, Keyboard, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts } from "../constants/rtl";
import { getLastToast, subscribeToast } from "../lib/toast";

/** Durée d'affichage d'un message. */
const VISIBLE_MS = 2500;
/** Marge au-dessus du bas d'écran : laisse visibles les barres d'onglets des tableaux de bord. */
const BOTTOM_CLEARANCE = 88;

/**
 * Toast global, monté une fois dans App.js.
 * Non bloquant (pointerEvents="none"), RTL, police de l'app.
 * Un nouveau message remplace celui affiché.
 *
 * Une <Modal> RN s'affiche au-dessus du toast global : les modales d'écriture
 * (requireOnline() ou non) montent aussi <AppToast replayPending={false} /> dans
 * leur contenu (pas de nouvel affichage du message émis avant leur ouverture).
 * bottomOffset : distance au bas de l'écran (par ex. au-dessus du clavier).
 * avoidKeyboard : modale sans suivi du clavier, toast placé au-dessus du clavier.
 */
export default function AppToast({
  replayPending = true,
  bottomOffset = null,
  avoidKeyboard = false,
}) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef(null);

  useEffect(() => {
    if (!avoidKeyboard) return undefined;
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const onHide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [avoidKeyboard]);

  useEffect(() => {
    const show = (next) => {
      clearTimeout(hideTimer.current);
      opacity.stopAnimation();
      setToast(next);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
      const remaining = Math.max(0, VISIBLE_MS - (Date.now() - next.shownAt));
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(({ finished }) => {
          // Interrompu par un nouveau message : ne pas l'effacer.
          if (finished) setToast(null);
        });
      }, remaining);
    };

    // Message émis avant le montage (démarrage hors ligne) : encore affichable.
    const pending = replayPending ? getLastToast() : null;
    if (pending && Date.now() - pending.shownAt < VISIBLE_MS) show(pending);

    const unsubscribe = subscribeToast(show);
    return () => {
      unsubscribe();
      clearTimeout(hideTimer.current);
    };
  }, [opacity, replayPending]);

  if (!toast) return null;

  let bottom = insets.bottom + BOTTOM_CLEARANCE;
  if (bottomOffset != null) bottom = bottomOffset;
  else if (keyboardHeight > 0) bottom = keyboardHeight + 16;

  return (
    <View pointerEvents="none" style={[styles.host, { bottom }]}>
      <Animated.View style={[styles.toast, { opacity }]}>
        <Text style={[styles.text, { fontFamily: fonts.medium }]} numberOfLines={3}>
          {toast.message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  toast: {
    maxWidth: "100%",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(31, 41, 55, 0.92)",
  },
  text: {
    color: "#FFFFFF",
    fontSize: 14,
    textAlign: "center",
    writingDirection: "rtl",
  },
});
