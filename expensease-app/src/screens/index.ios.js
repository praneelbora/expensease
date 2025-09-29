// src/screens/Login.ios.js
import React, { useEffect, useState, useContext, useMemo, useRef } from "react";
import {
    StyleSheet,
    View,
    Text,
    TouchableOpacity,
    Platform,
    ScrollView,
    ActivityIndicator,
    Animated,
    TextInput,
    Keyboard,
} from "react-native";
import {
    sendOTP,
    verifyOTP,
    googleLoginMobile,
    checkAppVersion,
    mobileLogin,
    appleLoginMobile
} from "services/UserService";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useTheme } from "context/ThemeProvider";
import { useAuth } from "context/AuthContext";
import { NotificationContext } from "context/NotificationContext";
import { router } from "expo-router";
import * as AppleAuthentication from 'expo-apple-authentication';
import PhoneInput from "react-native-phone-number-input";
import { OtpInput } from "react-native-otp-entry";

export default function Login() {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme, insets), [theme, insets]);

    const { setUserToken, authLoading, hydrated, userToken, user, version, logout } = useAuth();
    const { expoPushToken } = useContext(NotificationContext);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [fade] = useState(new Animated.Value(0));

    // Dev login (email/password) - only show when EXPO_PUBLIC_TEST_MODE === 'true'
    const TEST_MODE = String(process.env.EXPO_PUBLIC_TEST_MODE || "").toLowerCase() === "true";
    const [devEmail, setDevEmail] = useState("");
    const [devPassword, setDevPassword] = useState("");
    const [devSubmitting, setDevSubmitting] = useState(false);
    const [devError, setDevError] = useState("");

    // store country calling code (digits only, e.g. "91") and national number ("9876543210")
    const [callingCode, setCallingCode] = useState(""); // digits only, no '+'
    const [nationalNumber, setNationalNumber] = useState(""); // digits only (no spaces)

    // Phone / OTP states
    const [showSocial, setShowSocial] = useState(false); // NEW: toggles "More ways to login" (Google / Apple)
    const [stage, setStage] = useState("idle"); // 'idle' | 'sent' | 'verifying'
    const [otpDigits, setOtpDigits] = useState(new Array(4).fill(""));
    const [countdown, setCountdown] = useState(0);
    const [otpError, setOtpError] = useState("");
    const [checkingVersion, setCheckingVersion] = useState(true);

    // navigation/loading guard: prevents flashing of login UI while we route away
    const [navigating, setNavigating] = useState(false);

    // phone input
    const phoneInputRef = useRef(null);
    const [phoneInputValue, setPhoneInputValue] = useState(""); // kept for fallback compatibility
    const [defaultCountryCode] = useState("IN");
    const [lastSentPhone, setLastSentPhone] = useState(null);

    const [otpCode, setOtpCode] = useState(""); // full numeric code string
    const [otpActive, setOtpActive] = useState(false); // whether filled

    const [sending, setSending] = useState(false);
    const [verifying, setVerifying] = useState(false);

    const otpInputsRef = React.useRef([]);
    const [appleAvailable, setAppleAvailable] = useState(false);
    useEffect(() => {
        (async () => {
            try {
                const avail = await AppleAuthentication.isAvailableAsync();
                setAppleAvailable(avail);
            } catch (e) {
                setAppleAvailable(false);
            }
        })();
    }, []);

    useEffect(() => {
        Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
        GoogleSignin.configure({
            webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
            iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
            offlineAccess: true,
        });
    }, []);
    useEffect(() => {
        let mounted = true;

        // mark loading before starting
        setCheckingVersion(true);

        (async () => {
            try {
                // run the admin version check
                const resp = await checkAppVersion(version, Platform.OS);

                if (!mounted) return;

                // 1) If outdated -> block everything and route to updateScreen
                if (resp?.outdated) {
                    try {
                        setNavigating(true);
                        router.replace("updateScreen");
                    } catch (e) {
                        console.warn("[Login] Failed to route to updateScreen:", e);
                        setNavigating(false);
                    }
                    return;
                }

                // 2) Not outdated: if user is already logged in, go to dashboard
                if (userToken && !authLoading && user) {
                    try {
                        setNavigating(true);
                        router.replace("dashboard");
                    } catch (e) {
                        console.warn("[Login] Failed to route to dashboard:", e);
                        setNavigating(false);
                    }
                    return;
                }
            } catch (err) {
                console.warn("[Login] Version check failed:", err);

                if (!mounted) return;

                // fallback: allow logged-in users
                if (userToken && !authLoading && user) {
                    try {
                        setNavigating(true);
                        router.replace("dashboard");
                    } catch (e) {
                        console.warn("[Login] Failed to route to dashboard after version-check error:", e);
                        setNavigating(false);
                    }
                }
            } finally {
                if (mounted) setCheckingVersion(false); // allow UI to render
            }
        })();

        return () => {
            mounted = false;
        };
    }, [hydrated, version, userToken, authLoading, user]);

    // helper countdown
    const startCountdown = (seconds = 30) => {
        setCountdown(seconds);
        const iv = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(iv);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const normalizeE164 = (s) => (s || "").replace(/[^\d+]/g, "");

    // quick-ish E.164 check
    const isE164 = (p) => /^\+?[1-9]\d{6,14}$/.test((p || "").replace(/\s+/g, ""));


    // -------------------- New helper: validate parts --------------------
    const validatePhoneParts = (cc, national) => {
        const ccDigits = String(cc || "").replace(/\D/g, "");
        const natDigits = String(national || "").replace(/\D/g, "");

        if (!ccDigits) return { ok: false, reason: "Please select a country code." };
        if (ccDigits.length < 1 || ccDigits.length > 3) return { ok: false, reason: "Invalid country code." };
        if (!natDigits) return { ok: false, reason: "Please enter your phone number." };
        if (natDigits.length < 4) return { ok: false, reason: "Phone number is too short." };

        // Build phone string only for sending. We DO NOT keep this combined in state.
        const phoneToSend = `+${ccDigits}${natDigits}`;
        return { ok: true, phoneToSend };
    };

    // -------------------- Updated handleSendOTP --------------------
    const handleSendOTP = async () => {
        setOtpError("");

        // Prefer canonical cc from the PhoneInput ref if available
        const refCc = phoneInputRef.current?.getCallingCode?.();
        const ccToUse = refCc ? String(refCc).replace(/\D/g, "") : String(callingCode || "").replace(/\D/g, "");
        const nat = String(nationalNumber || "").replace(/\D/g, "");

        const validation = validatePhoneParts(ccToUse, nat);
        if (!validation.ok) {
            setOtpError(validation.reason);
            return;
        }

        const phoneToSend = validation.phoneToSend; // e.g. "+91XXXXXXXXXX"

        try {
            setSending(true);
            const resp = await sendOTP(phoneToSend);

            if (resp && (resp.type === "success" || resp.status === "success" || resp.success || resp.ok)) {
                setStage("sent");
                setOtpDigits(new Array(4).fill(""));
                startCountdown(30);
                setLastSentPhone(phoneToSend);

                // IMPORTANT: keep the split parts in state so we never need to re-parse.
                setCallingCode(ccToUse);
                setNationalNumber(nat);

                setTimeout(() => otpInputsRef.current[0]?.focus && otpInputsRef.current[0].focus(), 200);
            } else {
                setOtpError(resp?.error || resp?.message || "Failed to send OTP. Try again.");
            }
        } catch (err) {
            console.error("sendOTP error", err);
            setOtpError(err?.message || "Failed to send OTP. Try again.");
        } finally {
            setSending(false);
        }
    };

    // -------------------- Updated handleVerifyOtp (use lastSentPhone directly) --------------------
    const handleVerifyOtp = async () => {
        setOtpError("");
        const code = (otpCode || "").trim();
        if (code.length !== 4) {
            setOtpError("Enter the 4 digit code");
            return;
        }

        try {
            setVerifying(true);
            const phoneToVerify = lastSentPhone; // built earlier as +<cc><number>
            if (!phoneToVerify) {
                setOtpError("No phone to verify. Please request a new code.");
                setVerifying(false);
                return;
            }

            const resp = await verifyOTP(phoneToVerify, code, expoPushToken, Platform.OS);

            if (resp?.userToken) {
                await setUserToken(resp.userToken);
                // show loading while we navigate
                setNavigating(true);
                router.replace("dashboard");
            } else {
                setOtpError(resp?.error || "OTP verification failed");
            }
        } catch (err) {
            console.error("verifyOTP error", err);
            setOtpError(err?.message || "OTP verification failed");
        } finally {
            setVerifying(false);
        }
    };

    // -------------------- Updated format for display on OTP screen --------------------
    const formatSentPhone = (phone) => {
        // Prefer the stored split values (we stored them on send); fallback to lastSentPhone or provided phone
        const p = phone || lastSentPhone;
        if (callingCode && nationalNumber) return `${nationalNumber}`;
        if (p) {
            // p should already be "+<cc><number>", show with space after cc for readability
            const onlyDigits = String(p).replace(/\D/g, "");
            const cc = onlyDigits.slice(0, Math.min(3, onlyDigits.length - 4));
            const num = onlyDigits.slice(cc.length);
            return cc ? `${num}` : p;
        }
        return "";
    };

    const handleResend = async () => {
        if (countdown > 0) return;
        await handleSendOTP();
    };


    // Google login handler (primary)
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
            }
            // after login redirect
            const response = await checkAppVersion(version, Platform.OS);
            if (response?.outdated) {
                setNavigating(true);
                router.replace("updateScreen");
            } else {
                setNavigating(true);
                router.replace("dashboard");
            }
        } catch (err) {
            setError(err?.message || "Google login failed. Please try again.");
            try {
                await logout?.();
            } catch (e) {
                console.warn("Logout error:", e);
            }
            setNavigating(false);
        } finally {
            setSubmitting(false);
        }
    };
    // Apple login handler
    const handleAppleLogin = async () => {
        setError("");
        try {
            setSubmitting(true);

            const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
            });

            const identityToken = credential?.identityToken;
            if (!identityToken) {
                throw new Error("No identityToken from Apple. Make sure Sign In with Apple is configured.");
            }

            // Build a display name from fullName if available
            let name = "";
            const fn = credential?.fullName;
            if (fn) {
                name = `${fn.givenName || ""} ${fn.familyName || ""}`.trim();
            }

            // send identityToken to backend (appleLoginMobile implemented above)
            const res = await appleLoginMobile(identityToken, expoPushToken, Platform.OS, name);

            if (res?.userToken) {
                if (typeof setUserToken === "function") {
                    await setUserToken(res.userToken);
                }

                const response = await checkAppVersion(version, Platform.OS);
                if (response?.outdated) {
                    setNavigating(true);
                    router.replace("updateScreen");
                } else {
                    setNavigating(true);
                    router.replace("dashboard");
                }
            } else {
                throw new Error("Apple login failed: invalid server response");
            }
        } catch (err) {
            console.warn("Apple login failed:", {
                message: err?.message,
                code: err?.code,
                name: err?.name,
                raw: err,
            });

            setError(err?.message || "Apple login failed. Please try again.");
            try {
                await logout?.();
            } catch (e) {
                console.warn("Logout error:", e);
            }
            setNavigating(false);
        } finally {
            setSubmitting(false);
        }
    };

    // Dev email/password login for local testing
    const handleDevLogin = async () => {
        setDevError("");
        if (!devEmail || !devPassword) {
            setDevError("Please enter email and password for dev login.");
            return;
        }
        try {
            setDevSubmitting(true);
            const res = await mobileLogin(devEmail, devPassword, expoPushToken, Platform.OS);
            if (res?.userToken) {
                await setUserToken(res.userToken);
                setNavigating(true);
                router.replace("dashboard");
            } else {
                setDevError(res?.error || "Dev login failed.");
            }
        } catch (err) {
            console.error("devLogin error", err);
            setDevError(err?.message || "Dev login failed.");
            setNavigating(false);
        } finally {
            setDevSubmitting(false);
        }
    };

    // UI helpers for navigation/back actions
    const handleShowSocial = () => {
        setShowSocial(true);
    };
    const handleHideSocial = () => {
        setShowSocial(false);
        setStage("idle");
        setPhoneInputValue("");
        setOtpDigits(new Array(4).fill(""));
        setOtpError("");
    };

    const handleBackFromSent = () => {
        setStage("idle");
        setOtpDigits(new Array(4).fill(""));
        setOtpError("");

        setTimeout(() => {
            phoneInputRef.current?.focus && phoneInputRef.current.focus();
        }, 120);
    };

    // Prevent UI flash while auth context bootstraps OR while version check / navigation is in progress
    if (!hydrated || (userToken && (authLoading || !user)) || checkingVersion || navigating) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme?.colors?.background }}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

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
                        {/* Top row: back / close when verifying OTP or when showing social options */}
                        <View style={{ width: "100%", flexDirection: "row", justifyContent: "flex-start" }}>
                            {(stage === "sent") && (
                                <View style={styles.headerRow}>
                                    <TouchableOpacity
                                        onPress={stage === "sent" ? handleBackFromSent : handleHideSocial}
                                        style={styles.backButton}
                                        accessibilityRole="button"
                                    >
                                        <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
                                    </TouchableOpacity>

                                    <Text style={styles.headerTitle}>{stage === "sent" ? "Verify OTP" : showSocial ? "More ways to login" : "Login with Mobile"}</Text>
                                </View>
                            )}
                        </View>

                        {/* Primary area */}
                        <View style={{ width: "100%", alignItems: "center", gap: 12 }}>
                            {/* Dev login (only in test mode) */}
                            {TEST_MODE && (
                                <View style={{ width: "100%", marginBottom: 12 }}>
                                    <Text style={[styles.footerText, { marginBottom: 8 }]}>Test mode — Dev login (local testing)</Text>

                                    <TextInput
                                        placeholder="Email"
                                        placeholderTextColor={theme.colors.muted}
                                        value={devEmail}
                                        onChangeText={setDevEmail}
                                        style={[styles.input, { marginBottom: 8 }]}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                        textContentType="username"
                                    />
                                    <TextInput
                                        placeholder="Password"
                                        placeholderTextColor={theme.colors.muted}
                                        value={devPassword}
                                        onChangeText={setDevPassword}
                                        style={styles.input}
                                        secureTextEntry
                                        textContentType="password"
                                    />

                                    <TouchableOpacity
                                        style={[styles.signInBtn, { marginTop: 12 }]}
                                        onPress={handleDevLogin}
                                        disabled={devSubmitting}
                                    >
                                        {devSubmitting ? <ActivityIndicator /> : <Text style={styles.secondaryText}>Dev Login</Text>}
                                    </TouchableOpacity>
                                    {devError ? <Text style={styles.error}>{devError}</Text> : null}
                                </View>
                            )}

                            {/* --- MOBILE PHONE / OTP (primary, shown by default) --- */}
                            {stage !== "sent" ? (
                                // PHONE ENTRY
                                <>
                                    {/* Phone input */}
                                    <View style={{ flexDirection: "row", alignItems: "center", width: "100%", gap: 8 }}>
                                        <PhoneInput
                                            ref={phoneInputRef}
                                            defaultCode={defaultCountryCode}
                                            layout="first"
                                            value={nationalNumber}
                                            onChangeText={(text) => setNationalNumber(text.replace(/\D/g, ""))}
                                            onChangeFormattedText={(formatted) => {
                                                const cc = phoneInputRef.current?.getCallingCode?.() || "";
                                                const digitsOnly = String(formatted || "").replace(/\D/g, "");
                                                if (cc && digitsOnly.startsWith(cc)) {
                                                    setCallingCode(cc);
                                                    setNationalNumber(digitsOnly.slice(cc.length));
                                                } else {
                                                    setNationalNumber(digitsOnly);
                                                }
                                            }}
                                            containerStyle={styles.phoneContainer}
                                            textContainerStyle={styles.phoneTextContainer}
                                            textInputStyle={styles.phoneTextInput}
                                            flagButtonStyle={styles.flagButton}
                                            codeTextStyle={{ display: "none" }}   // 👈 hides country code
                                            renderDropdownImage={
                                                <Ionicons name="chevron-down" size={18} color={theme.colors.text} />
                                            }
                                            placeholder="9876543210"
                                        />

                                    </View>

                                    <TouchableOpacity style={[styles.signInBtn, { marginTop: 0 }]} onPress={handleSendOTP} disabled={sending}>
                                        {sending ? <ActivityIndicator /> : <Text style={styles.secondaryText}>Send OTP</Text>}
                                    </TouchableOpacity>
                                    {otpError ? <Text style={styles.error}>{otpError}</Text> : null}

                                    {/* "More ways to login" toggles social options (Google / Apple) */}
                                    {!showSocial && <TouchableOpacity onPress={handleShowSocial} style={{ marginTop: 8 }}>
                                        <Text style={[styles.footerText, { fontWeight: "700", color: theme?.colors?.primary }]}>More ways to login</Text>
                                    </TouchableOpacity>}
                                </>
                            ) : (
                                // OTP INPUT (stage === 'sent')
                                <>
                                    <Text style={[styles.hint, { textAlign: "left", marginBottom: 8 }]}>
                                        We sent a 4 digit code to {formatSentPhone(lastSentPhone)}
                                    </Text>

                                    <View style={{ width: "100%", alignItems: "center", marginTop: 8 }}>
                                        <OtpInput
                                            numberOfDigits={4}
                                            onTextChange={(text) => {
                                                setOtpCode(text);
                                                setOtpActive(false);
                                                setOtpError("");
                                            }}
                                            onFilled={() => {
                                                setOtpActive(true);
                                                Keyboard.dismiss();
                                            }}
                                            textInputProps={{
                                                accessibilityLabel: "One-Time Password",
                                                keyboardType: "number-pad",
                                                inputMode: "numeric",
                                                textContentType: Platform.OS === "ios" ? "oneTimeCode" : "none",
                                                autoComplete: Platform.OS === "android" ? "sms-otp" : "off",
                                                importantForAutofill: "yes",
                                            }}
                                            type="numeric"
                                            theme={{
                                                containerStyle: styles.otpContainer,
                                                pinCodeContainerStyle: styles.codeContainer,
                                                pinCodeTextStyle: styles.pinCodeText,
                                                focusStickStyle: styles.focusStick,
                                                focusedPinCodeContainerStyle: styles.activePinCodeContainer,
                                            }}
                                        />
                                    </View>

                                    <TouchableOpacity
                                        style={[styles.signInBtn, { marginTop: 24 }]}
                                        onPress={handleVerifyOtp}
                                        disabled={verifying || !otpActive}
                                    >
                                        {verifying ? <ActivityIndicator /> : <Text style={styles.secondaryText}>Verify OTP</Text>}
                                    </TouchableOpacity>

                                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, width: "100%" }}>
                                        <Text style={styles.footerText}>Didn't get code?</Text>
                                        <TouchableOpacity onPress={handleResend} disabled={countdown > 0}>
                                            <Text style={[styles.linkText, { fontWeight: "600" }]}>{countdown > 0 ? `Resend in ${countdown}s` : "Resend"}</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {otpError ? <Text style={styles.error}>{otpError}</Text> : null}
                                </>
                            )}

                            {/* --- SOCIAL / MORE WAYS (only when user opens More ways to login) --- */}
                            {showSocial && stage !== "sent" && (
                                <>
                                    <TouchableOpacity
                                        style={styles.googleBtn}
                                        onPress={handleGoogleLogin}
                                        disabled={submitting || authLoading}
                                        accessibilityRole="button"
                                    >
                                        {submitting || authLoading ? <ActivityIndicator /> : <Text style={styles.googleText}>Continue with Google</Text>}
                                    </TouchableOpacity>

                                    {appleAvailable && (
                                        <AppleAuthentication.AppleAuthenticationButton
                                            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                                            buttonStyle={theme?.mode != 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                                            cornerRadius={8}
                                            style={styles.appleButton}
                                            onPress={handleAppleLogin}
                                        />
                                    )}
                                </>
                            )}
                        </View>

                        {/* error + footer */}
                        {error ? <Text style={styles.error}>{error}</Text> : null}

                        {authLoading && !submitting ? (
                            <View style={styles.loadingRow}>
                                <ActivityIndicator />
                                <Text style={styles.loadingText}>Signing you in…</Text>
                            </View>
                        ) : null}
                    </View>

                    <View style={styles.footerRow}>
                        <Text style={styles.footerText}>By continuing you agree to our</Text>
                        <TouchableOpacity onPress={() => router.push("/terms")}>
                            <Text style={[styles.footerText, styles.linkText]}> Terms & Privacy</Text>
                        </TouchableOpacity>
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
            width: "100%",
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#E6EEF8",
            backgroundColor: theme?.mode != 'dark' ? "#000" : "#fff",
            alignItems: "center",
            justifyContent: "center",
        },
        googleText: { fontWeight: "500", fontSize: 19, color: theme?.mode != 'dark' ? '#fff' : "#000" },
        hint: { color: theme.colors.muted, fontSize: 13, textAlign: "center" },
        error: { color: "#F43F5E", marginBottom: 12 },
        signInBtn: {
            height: 44,
            width: "100%",
            borderRadius: 10,
            backgroundColor: theme.colors.background,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: theme.colors.border,
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
            backgroundColor: theme.colors.background,
        },
        otpBox: {
            width: 44,
            height: 52,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#E6EEF8",
            textAlign: "center",
            fontSize: 20,
            color: theme.colors.text,
            backgroundColor: theme.colors.background,
        },
        headerRow: {
            width: "100%",
            justifyContent: "center",
            alignItems: "center",
            height: 36,
            position: "relative",
            marginBottom: 8,
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
            color: theme?.colors?.text,
            textAlign: "center",
        },

        // OTP theme bits used by OtpInput (you may tweak sizes)
        otpContainer: {
            width: 280,
        },
        codeContainer: {
            borderWidth: 1,
            width: 60,
            borderColor: "#55554F",
        },
        pinCodeText: {
            color: theme.colors.text,
            fontSize: 20,
        },
        focusStick: {
            width: 20,
            height: 2,
            marginTop: 20,
        },
        activePinCodeContainer: {
            borderColor: theme.colors.primary,
        },
        phoneContainer: {
            width: "100%",
            height: 48,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme.colors.border || "#E6EEF8",
            backgroundColor: theme.colors.background ?? theme.colors.background,
            overflow: "hidden",
            flexDirection: "row",
            alignItems: "center",
        },

        // compact flag + code area so phone number gets most space
        flagButton: {
            width: 80, // smaller than full input
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 8,
            backgroundColor: "transparent",
        },

        codeText: {
            color: theme.colors.text,
            fontSize: 14,
            fontWeight: "600",
        },

        // phone number text area - takes remaining space
        phoneTextContainer: {
            backgroundColor: "transparent",
            flex: 1,
            paddingVertical: 0,
            paddingLeft: 8,
        },

        phoneTextInput: {
            color: theme.colors.text,
            fontSize: 16, // slightly larger than code
            height: 44,
        },
        appleButton: {
            width: "100%",   // full width like your Google button
            height: 50,      // must provide explicit height
            marginBottom: 10,
        },

    });
