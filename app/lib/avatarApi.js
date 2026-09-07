import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";

const AVATAR_BUCKET = "avatars";
const SUPABASE_TIMEOUT_MS = 15000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(
        () =>
          reject(new Error(`${label} — انتهت المهلة (${Math.round(ms / 1000)}ث)`)),
        ms
      );
    }),
  ]);
}

function logAvatarError(context, error) {
  if (!error) return;
  console.error(`[avatarApi] ${context}`, {
    code: error.code,
    message: error.message,
    hint: error.hint,
    details: error.details,
  });
}

function mapStorageError(error) {
  const msg = error?.message || "";
  if (/permission|row-level security|RLS|42501|violates row|not allowed/i.test(msg)) {
    return "لا صلاحية كافية لرفع هذه الصورة";
  }
  if (/payload too large|413|file_size_limit/i.test(msg)) {
    return "الصورة كبيرة جداً (الحد الأقصى 2 ميغابايت)";
  }
  if (/invalid mime|mime type/i.test(msg)) {
    return "نوع الصورة غير مدعوم — استخدم JPEG أو PNG";
  }
  if (/bucket.*not found|Bucket not found/i.test(msg)) {
    return "مساحة التخزين غير مهيأة — نفّذ migration 0047 في Supabase";
  }
  return mapSupabaseAuthError(error) || "تعذر رفع الصورة";
}

function mapProfileError(error) {
  const msg = error?.message || "";
  if (/column.*avatar_url.*does not exist/i.test(msg)) {
    return "عمود avatar_url مفقود — نفّذ migration 0047 في Supabase";
  }
  if (/permission|row-level security|RLS|42501|violates row/i.test(msg)) {
    return "لا صلاحية كافية لتحديث الملف الشخصي";
  }
  return mapSupabaseAuthError(error) || "تعذر تحديث الملف الشخصي";
}

function avatarObjectPath(authId) {
  return `${authId}.jpg`;
}

function buildPublicAvatarUrl(authId, cacheBust = Date.now()) {
  const { data } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(avatarObjectPath(authId));
  const base = data?.publicUrl || "";
  if (!base) return null;
  return `${base}?v=${cacheBust}`;
}

/** URL publique de l'avatar à partir de profiles.avatar_url ou du bucket avatars/{authId}.jpg */
export function resolvePublicAvatarUrl(authId, storedUrl = null) {
  if (storedUrl) return storedUrl;
  if (!authId) return null;
  return buildPublicAvatarUrl(authId, 1);
}

/**
 * Compresse une image locale en JPEG 512×512 puis l'upload dans avatars/{authId}.jpg.
 * Met à jour profiles.avatar_url (cache-busting via ?v=timestamp).
 */
export async function uploadOwnAvatar(authId, localUri) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!authId) {
    return { ok: false, error: "معرّف المستخدم مفقود" };
  }
  if (!localUri) {
    return { ok: false, error: "لم يتم اختيار صورة" };
  }

  try {
    const ImageManipulator = await import("expo-image-manipulator");
    const manipulated = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: 512, height: 512 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );

    const response = await fetch(manipulated.uri);
    if (!response.ok) {
      return { ok: false, error: "تعذر قراءة الصورة المختارة" };
    }
    const buffer = await response.arrayBuffer();
    const path = avatarObjectPath(authId);

    const { error: uploadError } = await withTimeout(
      supabase.storage.from(AVATAR_BUCKET).upload(path, buffer, {
        contentType: "image/jpeg",
        upsert: true,
      }),
      SUPABASE_TIMEOUT_MS,
      "رفع الصورة"
    );

    if (uploadError) {
      logAvatarError("uploadOwnAvatar storage", uploadError);
      return { ok: false, error: mapStorageError(uploadError) };
    }

    const cacheBust = Date.now();
    const avatarUrl = buildPublicAvatarUrl(authId, cacheBust);
    if (!avatarUrl) {
      return { ok: false, error: "تعذر بناء رابط الصورة" };
    }

    const { error: profileError } = await withTimeout(
      supabase
        .from("profiles")
        .update({
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", authId),
      SUPABASE_TIMEOUT_MS,
      "تحديث الملف"
    );

    if (profileError) {
      logAvatarError("uploadOwnAvatar profiles", profileError);
      return { ok: false, error: mapProfileError(profileError) };
    }

    return { ok: true, avatarUrl };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر رفع الصورة" };
  }
}

/** Supprime le fichier storage et remet profiles.avatar_url à null. */
export async function removeOwnAvatar(authId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!authId) {
    return { ok: false, error: "معرّف المستخدم مفقود" };
  }

  try {
    const path = avatarObjectPath(authId);
    const { error: removeError } = await withTimeout(
      supabase.storage.from(AVATAR_BUCKET).remove([path]),
      SUPABASE_TIMEOUT_MS,
      "حذف الصورة"
    );

    if (removeError) {
      logAvatarError("removeOwnAvatar storage", removeError);
      return { ok: false, error: mapStorageError(removeError) };
    }

    const { error: profileError } = await withTimeout(
      supabase
        .from("profiles")
        .update({
          avatar_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", authId),
      SUPABASE_TIMEOUT_MS,
      "تحديث الملف"
    );

    if (profileError) {
      logAvatarError("removeOwnAvatar profiles", profileError);
      return { ok: false, error: mapProfileError(profileError) };
    }

    return { ok: true, avatarUrl: null };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر حذف الصورة" };
  }
}
