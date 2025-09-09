// src/screens/Login.js
import React, { useEffect, useState, useContext, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// If android-credential-manager isn't installed for other platforms, keep these imports
// only if you're sure Android builds include the library. Otherwise consider dynamic require.
import { CredentialManager } from "android-credential-manager";
import { GoogleProvider, GoogleButtonProvider } from "android-credential-manager/build/loginProviders/LoginProviders";

import { useAuth } from "context/AuthContext";
import { useTheme } from "context/ThemeProvider";
import { NotificationContext } from "context/NotificationContext";
import { router } from "expo-router";
import { checkAppVersion, googleLoginMobile } from "services/UserService";

// Providers for android-credential-manager (only used on Android)
const implicitProvider = new GoogleProvider({
  serverClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  authorizedAccountsOnly: false,
  autoSelect: false,
});
const explicitProvider = new GoogleButtonProvider({
  serverClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  authorizedAccountsOnly: false,
  autoSelect: false,
});

export default function Login() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme, insets), [theme, insets]);

  const { expoPushToken } = useContext(NotificationContext);
  const { setUserToken, isLoading, setIsLoading, version, logout } = useAuth();

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fade] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
  }, []);

  async function handleCredentialLogin(provider) {
    setError("");
    try {
      setSubmitting(true);
      setIsLoading?.(true);

      const ret = await CredentialManager.loginWithGoogle(provider);
      console.log("credential manager response:", ret);

      const idToken = ret?.idToken || ret?.token || ret?.authToken;
      const displayName = ret?.displayName || ret?.userName;
      const profilePicture = ret?.profilePictureUri || ret?.photoUrl;
      console.log("parsed idToken/name/photo:", idToken, displayName, profilePicture);

      if (!idToken) throw new Error("Failed to obtain Google id token from native provider.");

      const res = await googleLoginMobile(idToken, expoPushToken, Platform.OS, displayName, profilePicture);
      if (res?.error) throw new Error(res.error);

      setUserToken?.(res.userToken);
      const response = await checkAppVersion(version, Platform.OS);
      if (response.outdated) router.replace("updateScreen");
      else router.replace("dashboard");
    } catch (err) {
      console.log("Google login error:", err);
      setError(err?.message || "Google login failed. Please try again.");
    } finally {
      setSubmitting(false);
      setIsLoading?.(false);
    }
  }

  useEffect(() => {
    if (Platform.OS === "android") {
      // Try a silent implicit sign-in (non-blocking). Errors are swallowed.
      handleCredentialLogin(implicitProvider).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Animated.View style={[styles.wrapper, { paddingTop: (insets?.top || 0) + 24, opacity: fade }]}>
          <Text style={styles.appName}>Expensease</Text>
          <Text style={styles.tagline}>Smart expense tracking and effortless splitting.</Text>

          <View style={styles.card}>
            <TouchableOpacity
              style={styles.googleBtn}
              onPress={() => handleCredentialLogin(explicitProvider)}
              disabled={submitting}
              accessibilityRole="button"
            >
              {submitting || isLoading ? (
                <ActivityIndicator />
              ) : (
                <Text style={styles.googleText}>Continue with Google</Text>
              )}
            </TouchableOpacity>
            <View style={styles.footerRow}>
            <Text style={styles.footerText}>By continuing you agree to our</Text>
            <TouchableOpacity onPress={() => router.push("/terms")}>
              <Text style={[styles.footerText, styles.linkText]}> Terms & Privacy</Text>
            </TouchableOpacity>
          </View>
          </View>

          
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme, insets) =>
  StyleSheet.create({
    wrapper: {
      flex: 1,
      backgroundColor: theme?.colors?.background ?? "#F7FAFC",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
    },
    appName: { fontSize: 24, fontWeight: "800", color: theme?.colors?.text ?? "#0F172A", marginBottom: 6 },
    tagline: { fontSize: 14, color: theme?.colors?.muted ?? "#475569", marginBottom: 20 },
    card: {
      width: "100%",
      backgroundColor: theme?.colors?.card ?? "#fff",
      borderRadius: 16,
      padding: 18,
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 6,
      alignItems: "center",
    },
    googleBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      height: 50,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme?.colors?.border ?? "#E6EEF8",
      backgroundColor: theme?.colors?.background ?? "#fff",
      width: "100%",
    },
    googleText: { fontWeight: "700", color: theme?.colors?.text ?? "#0F172A" },
    error: { color: "#F43F5E", marginVertical: 6 },
    footerRow: { marginTop: 18, flexDirection: "row", alignItems: "center" },
    footerText: { color: theme?.colors?.muted ?? "#94A3B8", fontSize: 12 },
    linkText: { color: theme?.colors?.primary ?? "#0B5FFF", fontWeight: "700" },
  });
