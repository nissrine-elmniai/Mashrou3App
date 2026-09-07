import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { fonts } from "../constants/rtl";
import { SUPABASE_URL } from "../lib/supabase";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * URL candidates pour un avatar.
 * Les fichiers du bucket sont nommés {auth_uuid}.jpg : un id non-UUID
 * (mock local, pseudo-contact "admin") ne génère aucune requête storage.
 * @param {string|null} userId
 * @param {string|null} avatarUrl
 * @param {string|number|null} cacheKey — change pour forcer le rechargement (anti-cache 404 Android)
 */
export function buildAvatarUrlCandidates(userId, avatarUrl, cacheKey = null) {
  const candidates = [];
  const stored = avatarUrl ? String(avatarUrl).trim() : "";
  if (/^https?:\/\//i.test(stored)) {
    candidates.push(stored);
  }
  if (userId) {
    const id = String(userId).trim();
    if (id && UUID_RE.test(id)) {
      const root = `${String(SUPABASE_URL).replace(/\/+$/, "")}/storage/v1/object/public/avatars/${id}.jpg`;
      let cacheBust = "1";
      const fromStored = stored.match(/[?&]v=(\d+)/);
      if (fromStored) cacheBust = fromStored[1];
      else if (cacheKey != null && String(cacheKey).length > 0) {
        const digits = String(cacheKey).replace(/\D/g, "");
        cacheBust = digits.slice(-12) || String(cacheKey).length;
      }
      const withBust = `${root}?v=${cacheBust}`;
      if (!candidates.includes(withBust)) candidates.push(withBust);
      if (!candidates.includes(root)) candidates.push(root);
    }
  }
  return candidates;
}

export default function ProfileAvatar({
  avatarUrl,
  userId = null,
  cacheKey = null,
  fallbackLetter = "؟",
  size = 32,
  softBackgroundColor = "#E8F5E9",
  letterColor = "#2E7D32",
  style,
}) {
  const candidates = useMemo(
    () => buildAvatarUrlCandidates(userId, avatarUrl, cacheKey),
    [userId, avatarUrl, cacheKey]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidates]);

  const letter = String(fallbackLetter || "؟").trim().charAt(0) || "؟";
  const radius = size / 2;
  const fontSize = Math.max(12, Math.round(size * 0.44));
  const uri = candidates[candidateIndex] || null;
  const showImage = Boolean(uri);

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
          key={uri}
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
          onError={() => {
            setCandidateIndex((i) =>
              i + 1 < candidates.length ? i + 1 : candidates.length
            );
          }}
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
