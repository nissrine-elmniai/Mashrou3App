import React, { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * Image d'une bulle de message. Échec de chargement (hors ligne, URL expirée) :
 * emplacement neutre de même taille, sans erreur. Les fichiers d'images ne
 * sont pas mis en cache par l'application.
 */
export default function ChatBubbleImage({ uri, style, iconColor = "rgba(0,0,0,0.35)" }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (!uri || failed) {
    return (
      <View
        style={[style, { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.06)" }]}
        accessibilityLabel="صورة غير متاحة"
      >
        <Ionicons name="image-outline" size={28} color={iconColor} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}
