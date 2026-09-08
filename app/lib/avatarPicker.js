import { requireOptionalNativeModule } from "expo-modules-core";

const REBUILD_MESSAGE =
  "ميزة اختيار الصورة تتطلب إعادة تثبيت تطبيق التطوير (dev client) بعد إضافة expo-image-picker.\n\n" +
  "على جهاز Android متصل:\n" +
  "  npx expo run:android\n\n" +
  "أو عبر EAS:\n" +
  "  eas build --profile development --platform android";

function isMissingNativeModuleError(error) {
  const msg = String(error?.message || error || "");
  return /ExponentImagePicker|native module|NativeModule/i.test(msg);
}

function isImagePickerNativeAvailable() {
  try {
    return requireOptionalNativeModule("ExponentImagePicker") != null;
  } catch {
    return false;
  }
}

/** Charge expo-image-picker à la demande (évite le crash au montage si le dev client est ancien). */
async function loadImagePickerModule() {
  if (!isImagePickerNativeAvailable()) {
    return { ok: false, error: REBUILD_MESSAGE, needsRebuild: true };
  }

  try {
    return await import("expo-image-picker");
  } catch (error) {
    if (isMissingNativeModuleError(error)) {
      return { ok: false, error: REBUILD_MESSAGE, needsRebuild: true };
    }
    throw error;
  }
}

export function getAvatarPickerRebuildMessage() {
  return REBUILD_MESSAGE;
}

/**
 * @returns {Promise<{ ok: true, uri: string } | { ok: false, error: string, needsRebuild?: boolean }>}
 */
export async function pickAvatarImage(source) {
  const ImagePicker = await loadImagePickerModule();
  if (ImagePicker?.ok === false) {
    return ImagePicker;
  }

  try {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      return {
        ok: false,
        error:
          source === "camera"
            ? "لم يتم منح إذن الكاميرا. يمكنك تفعيله من إعدادات الجهاز."
            : "لم يتم منح إذن الوصول إلى المعرض. يمكنك تفعيله من إعدادات الجهاز.",
      };
    }

    const options = {
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    };

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled || !result.assets?.[0]?.uri) {
      return { ok: false, error: null, canceled: true };
    }

    return { ok: true, uri: result.assets[0].uri };
  } catch (error) {
    if (isMissingNativeModuleError(error)) {
      return { ok: false, error: REBUILD_MESSAGE, needsRebuild: true };
    }
    return { ok: false, error: error?.message || "تعذر اختيار الصورة" };
  }
}
