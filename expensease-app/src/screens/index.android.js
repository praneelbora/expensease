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
    TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Keep native imports only if Android builds include the library
import { CredentialManager } from "android-credential-manager";
import { GoogleProvider, GoogleButtonProvider } from "android-credential-manager/build/loginProviders/LoginProviders";

import { useAuth } from "context/AuthContext";
import { useTheme } from "context/ThemeProvider";
import { NotificationContext } from "context/NotificationContext";
import { router } from "expo-router";
import { checkAppVersion, googleLoginMobile, mobileLogin } from "services/UserService"; // add mobileLogin

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
    const { setUserToken, authLoading, hydrated, userToken, user, version, logout } = useAuth();

    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [checkingVersion, setCheckingVersion] = useState(true);

    // Animated value as ref and mounted guard
    const fade = useRef(new Animated.Value(0)).current;
    const mountedRef = useRef(true);

    // Prevent repeating silent attempts
    const silentAttemptedRef = useRef(false);
    // Count attempts for debugging
    const attemptCounterRef = useRef(0);

    // New: under-review flows and username/password state
    const [underReview, setUnderReview] = useState(false);
    const [reviewVersion, setReviewVersion] = useState(null);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Redirect if already logged in (after bootstrap + user loaded)
    // Consolidated version-check + logged-in redirect effect for src/screens/Login.js
    useEffect(() => {
        // only act after auth bootstrap so we know logged-in state
        if (!hydrated) return;

        let mounted = true;

        (async () => {
            try {
                const resp = await checkAppVersion(version, Platform.OS);
                if (!mounted) return;

                // 1) If admin marks the app outdated -> redirect to update screen
                if (resp?.outdated) {
                    try {
                        router.replace("updateScreen");
                    } catch (e) {
                        console.warn("[Login] Failed to route to updateScreen:", e);
                    }
                    return;
                }

                // 2) If not outdated and user is already logged in -> go to dashboard
                if (userToken && !authLoading && user) {
                    try {
                        router.replace("dashboard");
                    } catch (e) {
                        console.warn("[Login] Failed to route to dashboard:", e);
                    }
                    return;
                }

                // 3) Otherwise surface underReview flag to show username/password fallback
                setUnderReview(!!resp?.underReview);
            } catch (err) {
                console.warn("[Login] Version check failed:", err);
                // conservative fallback: if logged in, redirect to dashboard; else allow login
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
        // dependencies: wait for hydrated, re-run when version or auth state changes
    }, [hydrated, version, userToken, authLoading, user]);


    useEffect(() => {
        Animated.timing(fade, {
            toValue: 1,
            duration: 450,
            useNativeDriver: true,
        }).start();
    }, [fade]);

    // Conservative detection of "no account / cancelled" errors
    function isNoAccountOrCancelledError(err) {
        if (!err) return false;
        const msg = String(err?.message || err).toLowerCase();
        const indicators = [
            "no account",
            "no accounts",
            "account not found",
            "user canceled",
            "user cancelled",
            "canceled",
            "cancelled",
            "sign in canceled",
            "sign-in aborted",
            "operation canceled",
            "not authorized",
            "status code: 12500",
            "developer error",
            "sign in failed",
        ];
        return indicators.some((i) => msg.includes(i));
    }

    // THE native login flow (Google via CredentialManager)
    async function handleCredentialLogin(provider, { isSilent = false } = {}) {
        if (!isSilent) setError("");
        // rate limit duplicate submits
        if (submitting) {
            return;
        }

        if (!provider) {
            const msg = "Native Google sign-in not available on this device.";
            console.warn("[Login] " + msg);
            if (!isSilent && mountedRef.current) setError(msg);
            return;
        }
        if (userToken && !isSilent) {
            return;
        }
        attemptCounterRef.current += 1;
        try {
            setSubmitting(true);
            const ret = await CredentialManager.loginWithGoogle(provider);
            const idToken = ret?.idToken || ret?.token || ret?.authToken;
            const displayName = ret?.displayName || ret?.userName;
            const profilePicture = ret?.profilePictureUri || ret?.photoUrl;

            if (!idToken) {
                throw new Error("Failed to obtain Google id token from native provider.");
            }

            const res = await googleLoginMobile(idToken, expoPushToken, Platform.OS, displayName, profilePicture);
            if (res?.error) throw new Error(res.error || "Server returned error during login.");

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
            console.warn("[Login] Credential login error:", err?.message || err);

            const noAccountOrCancelled = isNoAccountOrCancelledError(err);

            if (isSilent && noAccountOrCancelled) {
            } else {
                if (mountedRef.current) setError(err?.message || "Google login failed. Please try again.");

                if (!isSilent) {
                    try {
                        await logout?.();
                    } catch (e) {
                        console.warn("[Login] logout after failed explicit login errored:", e);
                    }
                }
            }
        } finally {
            if (mountedRef.current) setSubmitting(false);
        }
    }

    // Silent implicit sign-in - run only once, and only after AuthContext is hydrated & not loading
    useEffect(() => {
        if (Platform.OS !== "android") {
            return;
        }

        if (!hydrated || authLoading) {
            return;
        }

        if (userToken) {
            return;
        }

        if (silentAttemptedRef.current) {
            return;
        }

        silentAttemptedRef.current = true;

        handleCredentialLogin(implicitProvider, { isSilent: true }).catch((e) => {
            console.warn("[Login] silent implicit sign-in threw (should be handled):", e?.message || e);
        });

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hydrated, authLoading, userToken]);

    // New: check app version on mount and whenever `version` changes
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const resp = await checkAppVersion(version, Platform.OS);
                if (!mounted) return;
                const rv = resp?.underReview || null;
                setUnderReview(rv);
            } catch (e) {
                console.warn("[Login] Failed to check app version:", e);
                setUnderReview(false);
                setReviewVersion(null);
            }
        })();
        return () => {
            mounted = false;
        };
    }, [version]);

    // New: username/password login handler (shown only when underReview === true)
    const handleUsernameLogin = async () => {
        setError("");
        if (!username?.trim() || !password) {
            setError("Please enter username and password.");
            return;
        }

        if (submitting) return;

        try {
            setSubmitting(true);
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
                console.warn("[Login] logout after failed username login errored:", e);
            }
        } finally {
            if (mountedRef.current) setSubmitting(false);
        }
    };

    if (checkingVersion) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme?.colors?.background }}>
                <ActivityIndicator />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                <Animated.View style={[styles.wrapper, { paddingTop: (insets?.top || 0) + 24, opacity: fade }]}>
                    <Text style={styles.appName}>Expensease</Text>
                    <Text style={styles.tagline}>Smart expense tracking and effortless splitting.</Text>

                    <View style={styles.card}>
                        <TouchableOpacity
                            style={styles.googleBtn}
                            onPress={() => handleCredentialLogin(explicitProvider, { isSilent: false })}
                            disabled={submitting || authLoading}
                            accessibilityRole="button"
                        >
                            {submitting || authLoading ? <ActivityIndicator /> : <Text style={styles.googleText}>Continue with Google</Text>}
                        </TouchableOpacity>

                        {/* If under review, show username/password form */}
                        {underReview ? (
                            <>
                                <TextInput
                                    value={username}
                                    onChangeText={setUsername}
                                    placeholder="Email"
                                    placeholderTextColor={theme?.colors?.muted}
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
                                    placeholderTextColor={theme?.colors?.muted}
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
                                    {submitting ? <ActivityIndicator /> : <Text style={styles.secondaryText}>Sign in</Text>}
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
        hint: { color: theme?.colors?.muted ?? "#475569", fontSize: 13 },
        input: {
            width: "100%",
            height: 44,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#E6EEF8",
            paddingHorizontal: 12,
            marginTop: 10,
            color: theme?.colors?.text ?? "#0F172A",
            backgroundColor: theme?.colors?.background ?? "#fff",
        },
        secondaryBtn: { marginTop: 12 },
        signInBtn: {
            height: 44,
            width: "100%",
            borderRadius: 10,
            backgroundColor: theme?.colors?.card ?? "#fff",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "#E6EEF8",
        },
        secondaryText: { color: theme?.colors?.primary ?? "#0B5FFF", fontWeight: "600" },
    });
