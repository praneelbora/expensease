// src/screens/CompleteProfile.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "context/ThemeProvider";
import { useAuth } from "context/AuthContext";
import { router } from "expo-router";
import { updateUserProfile, fetchUserData } from "services/UserService";

export default function CompleteProfile() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = createStyles(theme, insets);

  const { user } = useAuth(); // adjust if you also need setUserToken
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [valid, setValid] = useState(false);

  useEffect(() => {
    const v = typeof name === "string" && name.trim().length >= 3;
    setValid(v);
    if (!v && name && name.trim().length > 0) {
      setError("Name must be at least 3 characters");
    } else {
      setError("");
    }
  }, [name]);

  const handleBack = () => {
    try {
      router.back();
    } catch {
      router.replace("login");
    }
  };

  const saveProfile = async (finalName) => {
    setSaving(true);
    try {
      const payload = { name: finalName.trim() };
      await updateUserProfile(payload);
      try {
        await fetchUserData(); // optional re-fetch
      } catch {}
      router.replace("dashboard");
    } catch (err) {
      console.error("CompleteProfile save failed:", err);
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        "Failed to save name. Try again.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!valid) {
      setError("Please enter a valid name (at least 2 characters).");
      return;
    }
    await saveProfile(name);
  };

  const handleSkip = () => {
    Alert.alert(
      "Skip adding your name?",
      "If you skip, a random name will be assigned to you until you edit it in Account Settings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: async () => {
            // generate a simple random display name
            const randomName = `User${Math.floor(1000 + Math.random() * 9000)}`;
            await saveProfile(randomName);
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: "padding", android: undefined })}
      style={styles.wrapper}
    >
      <View style={styles.container}>
        {/* Header: back button + centered title */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>What's your name?</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Priya Sharma"
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
            autoCapitalize="words"
            returnKeyType="done"
            editable={!saving}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.saveBtn, !valid || saving ? { opacity: 0.6 } : null]}
            onPress={handleSave}
            disabled={!valid || saving}
          >
            {saving ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.saveBtnText}>Save and Continue</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn} disabled={saving}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme, insets) =>
  StyleSheet.create({
    wrapper: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingTop: (insets?.top || 0) + 10,
    },
    container: { padding: 20, alignItems: "center" },
    headerRow: {
      width: "100%",
      justifyContent: "center",
      alignItems: "center",
      position: "relative",
      marginBottom: 12,
    },
    backButton: {
      position: "absolute",
      left: 0,
      padding: 6,
      minWidth: 36,
      minHeight: 36,
      justifyContent: "center",
      alignItems: "center",
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: theme.colors.text,
      textAlign: "center",
    },
    card: {
      width: "100%",
      backgroundColor: theme.colors.card,
      padding: 18,
      borderRadius: 14,
      alignItems: "stretch",
      shadowColor: "#000",
      shadowOpacity: 0.03,
      shadowRadius: 12,
      elevation: 4,
    },
    label: {
      color: theme.colors.muted,
      fontSize: 13,
      marginBottom: 6,
      fontWeight: "600",
    },
    input: {
      width: "100%",
      height: 46,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "#E6EEF8",
      paddingHorizontal: 12,
      marginBottom: 12,
      color: theme.colors.text,
      backgroundColor: theme.colors.background,
    },
    error: { color: "#F43F5E", marginBottom: 8, fontSize: 13 },
    saveBtn: {
      height: 44,
      borderRadius: 10,
      backgroundColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 6,
    },
    saveBtnText: { color: "#fff", fontWeight: "700" },
    skipBtn: { marginTop: 12, alignItems: "center", justifyContent: "center" },
    skipText: { color: theme.colors.muted, fontSize: 13 },
  });
