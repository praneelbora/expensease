// src/screens/Login.js
import React, { useEffect, useState, useContext, useMemo, useRef } from "react";
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

import { useAuth } from "context/AuthContext";
import { useTheme } from "context/ThemeProvider";
import { NotificationContext } from "context/NotificationContext";
import { router } from "expo-router";
import { checkAppVersion, googleLoginMobile } from "services/UserService";

export default function Login() {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme, insets), [theme, insets]);

    const { expoPushToken } = useContext(NotificationContext);
    const { setUserToken, authLoading, hydrated, userToken, user, version, logout } = useAuth();

    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // animated value as ref (safer)
    const fade = useRef(new Animated.Value(0)).current;

    // refs to manage mounted state and to avoid repeated silent attempts
    const mountedRef = useRef(true);
    const silentAttemptedRef = useRef(false);

    // store android providers if available
    const implicitProviderRef = useRef(null);
    const explicitProviderRef = useRef(null);

    useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Redirect if already logged in (after bootstrap + user loaded)
    useEffect(() => {
        if (!hydrated) return;
        if (userToken && !authLoading && user) {
            try {
                router.replace("dashboard");
            } catch (e) {
                console.warn("Failed to redirect to dashboard:", e);
            }
        }
    }, [hydrated, userToken, authLoading, user]);

    useEffect(() => {
        Animated.timing(fade, {
            toValue: 1,
            duration: 450,
            useNativeDriver: true,
        }).start();
    }, [fade]);

    // Dynamic import of android-credential-manager and provider creation
    useEffect(() => {
        if (Platform.OS !== "android") return;

        let cancelled = false;
        (async () => {
            try {
                // dynamic import so bundler doesn't crash on other platforms
                const CredModule = await import("android-credential-manager");
                // login providers might live under build/loginProviders depending on package
                const { GoogleProvider, GoogleButtonProvider } = await import(
                    "android-credential-manager/build/loginProviders/LoginProviders"
                );

                if (cancelled) return;

                const serverClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
                // guard against missing env
                if (!serverClientId) {
                    console.warn("No EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID found; skipping native credential provider creation.");
                    return;
                }

                implicitProviderRef.current = new GoogleProvider({
                    serverClientId,
                    authorizedAccountsOnly: false,
                    autoSelect: false,
                });

                explicitProviderRef.current = new GoogleButtonProvider({
                    serverClientId,
                    authorizedAccountsOnly: false,
                    autoSelect: false,
                });
            } catch (e) {
                // If import fails, don't crash the app — log and continue with regular web OAuth flow
                console.warn("android-credential-manager not available or failed to load:", e);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    async function handleCredentialLogin(provider) {
        setError("");
        if (submitting) return;
        setSubmitting(true);

        try {
            if (!provider || typeof provider !== "object") {
                throw new Error("Credential provider not available on this platform.");
            }

            // Some native providers may throw synchronously; guard with try/catch
            let ret;
            try {
                // may throw if native module not properly linked
                ret = await provider.login?.() ?? (await provider.loginWithGoogle?.(provider));
            } catch (nativeErr) {
                // some versions expose different function names; try the global helper method like in original code
                try {
                    const CredentialManager = await import("android-credential-manager");
                    ret = await CredentialManager.loginWithGoogle(provider);
                } catch (e2) {
                    throw nativeErr; // original error is more informative
                }
            }

            const idToken = ret?.idToken || ret?.token || ret?.authToken;
            const displayName = ret?.displayName || ret?.userName;
            const profilePicture = ret?.profilePictureUri || ret?.photoUrl;

            if (!idToken) throw new Error("Failed to obtain Google id token from native provider.");

            const res = await googleLoginMobile(idToken, expoPushToken, Platform.OS, displayName, profilePicture);
            if (res?.error) throw new Error(res.error || "Server returned error during login.");

            if (typeof setUserToken === "function") {
                await setUserToken(res.userToken);
            } else {
                console.warn("setUserToken is not a function");
            }

            const response = await checkAppVersion(version, Platform.OS);
            if (response?.outdated) {
                router.replace("updateScreen");
            } else {
                router.replace("dashboard");
            }
        } catch (err) {
            if (mountedRef.current) {
                setError(err?.message || "Google login failed. Please try again.");
            }
            // clear partial auth state
            try {
                await logout?.();
            } catch (e) {
                console.warn("Logout after failed login errored:", e);
            }
        } finally {
            if (mountedRef.current) setSubmitting(false);
        }
    }

    // Try a silent implicit sign-in on Android, but only once and only if a provider is available.
    useEffect(() => {
        if (Platform.OS !== "android") return;
        if (silentAttemptedRef.current) return;
        const trySilent = async () => {
            silentAttemptedRef.current = true; // mark attempted even if it fails, to avoid loops
            // wait a tick to let providerRef be set by dynamic import effect
            await new Promise((r) => setTimeout(r, 50));

            const provider = implicitProviderRef.current;
            if (!provider) {
                // no native provider available; nothing to do
                return;
            }

            try {
                await handleCredentialLogin(provider);
            } catch (e) {
                // swallow errors from silent attempt — we do not want to crash or set UI visible error
                console.warn("Silent implicit sign-in failed (ignored):", e?.message ?? e);
            }
        };

        trySilent();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                <Animated.View style={[styles.wrapper, { paddingTop: (insets?.top || 0) + 24, opacity: fade }]}>
                    <Text style={styles.appName}>Expensease</Text>
                    <Text style={styles.tagline}>Smart expense tracking and effortless splitting.</Text>

                    <View style={styles.card}>
                        <TouchableOpacity
                            style={styles.googleBtn}
                            onPress={() => {
                                const provider = explicitProviderRef.current;
                                if (provider) {
                                    handleCredentialLogin(provider);
                                } else {
                                    // fallback: show a web-based login or a friendly message
                                    setError("Native Google sign-in not available on this device. Please try the web sign-in.");
                                }
                            }}
                            disabled={submitting || authLoading}
                            accessibilityRole="button"
                        >
                            {submitting || authLoading ? <ActivityIndicator /> : <Text style={styles.googleText}>Continue with Google</Text>}
                        </TouchableOpacity>

                        {error ? <Text style={styles.error}>{error}</Text> : null}

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
