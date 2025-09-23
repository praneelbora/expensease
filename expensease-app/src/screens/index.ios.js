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
    TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useTheme } from "context/ThemeProvider";
import { useAuth } from "context/AuthContext";
import { NotificationContext } from "context/NotificationContext";
import { router } from "expo-router";
import { checkAppVersion, googleLoginMobile, mobileLogin } from "services/UserService"; // add usernamePasswordLogin in your service

export default function Login() {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme, insets), [theme, insets]);

    const { setUserToken, authLoading, hydrated, userToken, user, version, logout } = useAuth();
    const { expoPushToken } = useContext(NotificationContext);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [fade] = useState(new Animated.Value(0));

    // New states for under-review + username/password flow
    const [underReview, setUnderReview] = useState(false);
    const [reviewVersion, setReviewVersion] = useState(null);

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [checkingVersion, setCheckingVersion] = useState(true);

    // Consolidated redirect + version-check logic
    useEffect(() => {
        let mounted = true;

        // Only act after AuthContext bootstrap so we know logged-in state
        if (!hydrated) return;

        (async () => {
            try {
                // run the admin version check
                const resp = await checkAppVersion(version, Platform.OS);

                if (!mounted) return;

                // 1) If outdated -> block everything and route to updateScreen
                if (resp?.outdated) {
                    try {
                        router.replace("updateScreen");
                    } catch (e) {
                        console.warn("[Login] Failed to route to updateScreen:", e);
                    }
                    return;
                }

                // 2) Not outdated: if user is already logged in, go to dashboard
                if (userToken && !authLoading && user) {
                    try {
                        router.replace("dashboard");
                    } catch (e) {
                        console.warn("[Login] Failed to route to dashboard:", e);
                    }
                    return;
                }

                // 3) Otherwise surface underReview flag (username/password flow)
                setUnderReview(!!resp?.underReview);
            } catch (err) {
                console.warn("[Login] Version check failed:", err);
                // conservative fallback: do not block login; allow logged-in redirect if present
                if (userToken && !authLoading && user) {
                    try {
                        router.replace("dashboard");
                    } catch (e) {
                        console.warn("[Login] Failed to route to dashboard after version-check error:", e);
                    }
                } else {
                    setUnderReview(false);
                }
            } finally {
                if (mounted) setCheckingVersion(false); // DONE: allow UI to render
            }
        })();

        return () => {
            mounted = false;
        };
        // dependencies:
        // - hydrated to wait for auth bootstrap before deciding
        // - version to re-run when remote version policy changes
        // - userToken/authLoading/user to immediately redirect when login state becomes available
    }, [hydrated, version, userToken, authLoading, user]);

    // Configure Google Signin and animate
    useEffect(() => {
        GoogleSignin.configure({
            webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
            iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
            offlineAccess: true,
        });

        Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
    }, []);

    // NOTE: removed the duplicate "check app version on mount" useEffect that used to re-run checkAppVersion.
    // Having both caused racing and UI flashes.

    const handleGoogleLogin = async () => {
        setError("");
        try {
            setSubmitting(true);

            await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
            const userInfo = await GoogleSignin.signIn();

            const idToken = userInfo?.idToken || userInfo?.data?.idToken;
            const name = userInfo?.user?.name || userInfo?.data?.user?.name;
            const photo = userInfo?.user?.photo || userInfo?.data?.user?.photo;

            if (!idToken) throw new Error("Could not get Google ID token. Make sure Google Sign-In is configured.");

            const res = await googleLoginMobile(idToken, expoPushToken, Platform.OS, name, photo);
            if (res?.error) throw new Error(res.error || "Server error");

            if (typeof setUserToken === "function") {
                await setUserToken(res.userToken);
            } else {
                console.warn("setUserToken is not a function");
            }

            // After login, re-check version and redirect
            const response = await checkAppVersion(version, Platform.OS);
            if (response?.outdated) {
                router.replace("updateScreen");
            } else {
                router.replace("dashboard");
            }
        } catch (err) {
            setError(err?.message || "Google login failed. Please try again.");
            try {
                await logout?.();
            } catch (e) {
                console.warn("Logout after failed login errored:", e);
            }
        } finally {
            setSubmitting(false);
        }
    };

    // Handler for username/password login (shown when underReview === true)
    const handleUsernameLogin = async () => {
        setError("");
        if (!username?.trim() || !password) {
            setError("Please enter email and password.");
            return;
        }

        try {
            setSubmitting(true);
            // Replace usernamePasswordLogin with your actual service function.
            // Expected to return { userToken } on success or { error } on failure.
            const res = await mobileLogin(username.trim(), password, expoPushToken, Platform.OS);
            if (res?.error) throw new Error(res.error || "Login failed");

            if (typeof setUserToken === "function") {
                await setUserToken(res.userToken);
            }

            const response = await checkAppVersion(version, Platform.OS);
            if (response?.outdated) {
                router.replace("updateScreen");
            } else {
                router.replace("dashboard");
            }
        } catch (err) {
            setError(err?.message || "Login failed. Please try again.");
            try {
                await logout?.();
            } catch (e) {
                console.warn("Logout after failed login errored:", e);
            }
        } finally {
            setSubmitting(false);
        }
    };

    // -------- Prevent UI flash: show loader while we're deciding redirect -----------
    // Show loading when:
    // - Auth bootstrap not finished (hydrated === false), or
    // - We're checking app-version from server, or
    // - The app thinks there's a logged-in token but user/authLoading still resolving.
    if (!hydrated || checkingVersion || (userToken && (authLoading || !user))) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme?.colors?.background }}>
                <ActivityIndicator />
            </View>
        );
    }
    // -------------------------------------------------------------------------------

    return (
        <View style={styles.wrapper}>
            <ScrollView
                style={{ width: "100%" }}
                contentContainerStyle={{ flexGrow: 1, width: "100%", justifyContent: "center" }}
                keyboardShouldPersistTaps="handled"
            >
                <Animated.View style={[styles.container, { alignItems: "center", opacity: fade }]}>
                    <Text style={styles.logo}>Expensease</Text>
                    <Text style={styles.subtitle}>Smart expense tracking and effortless splitting.</Text>

                    <View style={styles.card}>
                        <View style={{ width: "100%" }}>
                            <TouchableOpacity
                                style={styles.googleBtn}
                                onPress={handleGoogleLogin}
                                disabled={submitting || authLoading}
                                accessibilityRole="button"
                            >
                                {submitting || authLoading ? (
                                    <ActivityIndicator />
                                ) : (
                                    <Text style={styles.googleText}>Continue with Google</Text>
                                )}
                            </TouchableOpacity>
                        </View>

                        {/* If version is under review, show username/password fields */}
                        {underReview ? (
                            <>
                                <TextInput
                                    value={username}
                                    onChangeText={setUsername}
                                    placeholder="Email"
                                    placeholderTextColor={theme.colors.muted}
                                    style={styles.input}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    textContentType="username"
                                    editable={!submitting}
                                />
                                <TextInput
                                    value={password}
                                    onChangeText={setPassword}
                                    placeholder="Password"
                                    placeholderTextColor={theme.colors.muted}
                                    style={styles.input}
                                    secureTextEntry
                                    textContentType="password"
                                    editable={!submitting}
                                />

                                <TouchableOpacity
                                    style={[styles.secondaryBtn, styles.signInBtn]}
                                    onPress={handleUsernameLogin}
                                    disabled={submitting || authLoading}
                                >
                                    {submitting ? (
                                        <ActivityIndicator />
                                    ) : (
                                        <Text style={styles.secondaryText}>Sign in</Text>
                                    )}
                                </TouchableOpacity>
                            </>
                        ) : null}

                        {error ? <Text style={styles.error}>{error}</Text> : null}

                        <View style={styles.footerRow}>
                            <Text style={styles.footerText}>By continuing you agree to our</Text>
                            <TouchableOpacity onPress={() => router.push("/terms")}>
                                <Text style={[styles.footerText, styles.linkText]}> Terms & Privacy</Text>
                            </TouchableOpacity>
                        </View>

                        {authLoading && !submitting ? (
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
        signInBtn: {
            height: 44,
            width: "100%",
            borderRadius: 10,
            backgroundColor: theme.colors.card, // subtle background; adjust if you want a primary button
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "#E6EEF8",
        },
        secondaryText: { color: theme.colors.primary, fontWeight: "600" },
        loadingRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
        loadingText: { marginLeft: 8, color: theme.colors.muted },
        footer: { marginTop: 18, flexDirection: "row", alignItems: "center" },
        footerRow: { marginTop: 18, flexDirection: "row", alignItems: "center" },
        footerText: { color: theme?.colors?.muted ?? "#94A3B8", fontSize: 12 },
        linkText: { color: theme?.colors?.primary ?? "#0B5FFF", fontWeight: "700" },
        input: {
            width: "100%",
            height: 44,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#E6EEF8",
            paddingHorizontal: 12,
            marginTop: 10,
            color: theme.colors.text,
            backgroundColor: theme.colors.background, // keep it subtle
        },
    });
