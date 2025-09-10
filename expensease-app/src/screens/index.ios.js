// src/screens/Login.ios.js
import React, { useEffect, useState, useContext, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useTheme } from "context/ThemeProvider";
import { useAuth } from "context/AuthContext";
import { NotificationContext } from "context/NotificationContext";
import { router } from "expo-router";
import { checkAppVersion, googleLoginMobile } from "services/UserService";

export default function Login() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme, insets), [theme, insets]);

  const { setUserToken, isLoading, setIsLoading, version, logout } = useAuth();
  const { expoPushToken } = useContext(NotificationContext);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fade] = useState(new Animated.Value(0));

  useEffect(() => {
    // Configure Google Signin - webClientId MUST be your Web OAuth Client ID (server expects same aud)
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      offlineAccess: true,
    });

    Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, []);

  const handleGoogleLogin = async () => {
    setError("");
    try {
      setSubmitting(true);
      setIsLoading?.(true);

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();

      const idToken = userInfo?.idToken || userInfo?.data?.idToken;
      const name = userInfo?.user?.name || userInfo?.data?.user?.name;
      const photo = userInfo?.user?.photo || userInfo?.data?.user?.photo;

      if (!idToken) throw new Error("Could not get Google ID token. Make sure Google Sign-In is configured.");

      const res = await googleLoginMobile(idToken, expoPushToken, Platform.OS, name, photo);
      if (res?.error) throw new Error(res.error || "Server error");

      setUserToken?.(res.userToken);
      const response = await checkAppVersion(version, Platform.OS);
      if (response.outdated) router.replace("updateScreen");
      else router.replace("dashboard");
    } catch (err) {
      console.log("Google login error:", err);
      setError(err?.message || "Google login failed. Please try again.");
      logout?.();
    } finally {
      setSubmitting(false);
      setIsLoading?.(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={{ width: "100%" }}
        contentContainerStyle={{ flexGrow: 1, width: "100%", justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
      >

          <Animated.View style={[styles.container,{ alignItems: "center", opacity: fade }]}>
            <Text style={styles.logo}>Expensease</Text>
            <Text style={styles.subtitle}>Smart expense tracking and effortless splitting.</Text>

            <View style={styles.card}>
              <View style={{ width: "100%" }}>
                <TouchableOpacity
                  style={styles.googleBtn}
                  onPress={handleGoogleLogin}
                  disabled={submitting}
                  accessibilityRole="button"
                >
                  {submitting || isLoading ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={styles.googleText}>Continue with Google</Text>
                  )}
                </TouchableOpacity>
              </View>

               <View style={styles.footerRow}>
                          <Text style={styles.footerText}>By continuing you agree to our</Text>
                          <TouchableOpacity onPress={() => router.push("/terms")}>
                            <Text style={[styles.footerText, styles.linkText]}> Terms & Privacy</Text>
                          </TouchableOpacity>
                        </View>


              {submitting || isLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator />
                  <Text style={styles.loadingText}>Signing you in…</Text>
                </View>
              ) : null}
            </View>
          </Animated.View>
      </ScrollView>
    </View>
  );
}

const createStyles = (theme, insets) =>
  StyleSheet.create({
    wrapper: { flex: 1, backgroundColor: theme.colors.background },
    container: {
      justifyContent: "center",
      alignItems: "center",
      height: "100%",
      padding: 20,
      paddingTop: (insets?.top || 0) + 40,
      paddingBottom: (insets?.bottom || 0) + 24,
    },
    logo: { color: theme.colors.text, fontSize: 32, fontWeight: "800", marginBottom: 6 },
    subtitle: { color: theme.colors.muted, fontSize: 14, marginBottom: 20 },
    card: {
      width: "100%",
      backgroundColor: theme.colors.card,
      padding: 18,
      borderRadius: 14,
      alignItems: "center",
      shadowColor: "#000",
      shadowOpacity: 0.03,
      shadowRadius: 12,
      elevation: 4,
    },
    googleBtn: {
      height: 50,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "#E6EEF8",
      backgroundColor: "#fff",
      alignItems: "center",
      justifyContent: "center",
    },
    googleText: { fontWeight: "700", color: theme.colors.textDark },
    hint: { color: theme.colors.muted, fontSize: 13, marginTop: 12, textAlign: "center" },
    error: { color: "#F43F5E", marginBottom: 12 },
    secondaryBtn: { marginTop: 12 },
    secondaryText: { color: theme.colors.primary, fontWeight: "600" },
    loadingRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
    loadingText: { marginLeft: 8, color: theme.colors.muted },
    footer: { marginTop: 18, flexDirection: "row", alignItems: "center" },
    footerRow: { marginTop: 18, flexDirection: "row", alignItems: "center" },
    footerText: { color: theme?.colors?.muted ?? "#94A3B8", fontSize: 12 },
    linkText: { color: theme?.colors?.primary ?? "#0B5FFF", fontWeight: "700" },
  });
