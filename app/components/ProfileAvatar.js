import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { fonts } from "../constants/rtl";

export default function ProfileAvatar({
  avatarUrl,
  fallbackLetter = "؟",
  size = 32,
  softBackgroundColor = "#E8F5E9",
  letterColor = "#2E7D32",
  style,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const letter = String(fallbackLetter || "؟").trim().charAt(0) || "؟";
  const radius = size / 2;
  const fontSize = Math.max(12, Math.round(size * 0.44));
  const showImage = Boolean(avatarUrl) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: softBackgroundColor,
        },
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Text style={[styles.letter, { color: letterColor, fontSize }]}>
          {letter}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  letter: {
    fontFamily: fonts.bold,
    textAlign: "center",
  },
});
