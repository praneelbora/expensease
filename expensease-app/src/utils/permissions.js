// import statements
import React from "react";
import { Alert, Linking, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

/**
 * Helper: ensure permission for camera or media library and if needed show prompt.
 * - kind: "camera" | "mediaLibrary"
 * Returns: true if permission is (now) granted, false otherwise.
 */
async function ensurePermission(kind = "camera") {
  try {
    if (kind === "camera") {
      // camera permission (Android & iOS)
      const cur = await ImagePicker.getCameraPermissionsAsync();
      // cur.status is "granted" | "denied" | "undetermined"
      if (cur.status === "granted") return true;

      // If undetermined or denied -> request
      const req = await ImagePicker.requestCameraPermissionsAsync();
      if (req.status === "granted") return true;

      // If still denied -> show settings alert
      Alert.alert(
        "Camera permission required",
        "We need access to your camera to take a photo. Please enable Camera permission in settings.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open settings",
            onPress: () => {
              // open app settings
              if (Platform.OS === "ios") Linking.openURL("app-settings:");
              else Linking.openSettings();
            },
          },
        ],
        { cancelable: true }
      );
      return false;
    } else {
      // media library permission
      // NOTE: getMediaLibraryPermissionsAsync exists in expo-image-picker
      const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (cur.status === "granted") return true;

      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (req.status === "granted") return true;

      Alert.alert(
        "Photos permission required",
        "We need access to your photos so you can pick an image. Please enable Photos permission in settings.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open settings",
            onPress: () => {
              if (Platform.OS === "ios") Linking.openURL("app-settings:");
              else Linking.openSettings();
            },
          },
        ],
        { cancelable: true }
      );
      return false;
    }
  } catch (err) {
    console.warn("permission check failed", err);
    return false;
  }
}

/**
 * Example handlers to call from your button press
 * - If user grants permission, the camera/gallery opens.
 * - If permission is denied permanently they get an Alert to go to Settings.
 */
export async function handlePickFromCamera({ onImagePicked } = {}) {
  const ok = await ensurePermission("camera");
  if (!ok) return;

  try {
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: false,
      allowsEditing: false,
    });
    if (!result.cancelled) {
      onImagePicked && onImagePicked(result);
    }
  } catch (err) {
    console.warn("launchCamera error", err);
    Alert.alert("Error", "Could not open camera.");
  }
}

export async function handlePickFromGallery({ onImagePicked } = {}) {
  const ok = await ensurePermission("mediaLibrary");
  if (!ok) return;

  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      base64: false,
      allowsEditing: false,
    });
    if (!result.cancelled) {
      onImagePicked && onImagePicked(result);
    }
  } catch (err) {
    console.warn("launchGallery error", err);
    Alert.alert("Error", "Could not open gallery.");
  }
}
