import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
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
 */
export default function AppToast() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef(null);

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
    const pending = getLastToast();
    if (pending && Date.now() - pending.shownAt < VISIBLE_MS) show(pending);

    const unsubscribe = subscribeToast(show);
    return () => {
      unsubscribe();
      clearTimeout(hideTimer.current);
    };
  }, [opacity]);

  if (!toast) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.host, { bottom: insets.bottom + BOTTOM_CLEARANCE }]}
    >
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
