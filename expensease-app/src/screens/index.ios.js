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
} from "services/UserService";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useTheme } from "context/ThemeProvider";
import { useAuth } from "context/AuthContext";
import { NotificationContext } from "context/NotificationContext";
import { router } from "expo-router";

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

    // Phone / OTP states
    const [showMore, setShowMore] = useState(false); // toggle "More ways to login"
    const [stage, setStage] = useState("idle"); // 'idle' | 'sent' | 'verifying'
    const [otpDigits, setOtpDigits] = useState(new Array(4).fill(""));
    const [countdown, setCountdown] = useState(0);
    const [otpError, setOtpError] = useState("");
    const [checkingVersion, setCheckingVersion] = useState(true);
    // phone input  
    const phoneInputRef = useRef(null);
    const [phoneInputValue, setPhoneInputValue] = useState(""); // displayed input
    const [defaultCountryCode] = useState("IN");
    const [lastSentPhone, setLastSentPhone] = useState(null);

    const [otpCode, setOtpCode] = useState(""); // full numeric code string
    const [otpActive, setOtpActive] = useState(false); // whether filled

    const [sending, setSending] = useState(false);
    const [verifying, setVerifying] = useState(false);

    const otpInputsRef = React.useRef([]);

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

                if (!mounted) return;

                // fallback: allow logged-in users
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
                if (mounted) setCheckingVersion(false); // allow UI to render
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

    const handleSendOTP = async () => {
        setOtpError("");
        // ask phoneInput for formatted number
        let formatted = null;
        try {
            // getNumberAfterPossiblyEliminatingZero is present in many versions
            if (phoneInputRef.current?.getNumberAfterPossiblyEliminatingZero) {
                const info = phoneInputRef.current.getNumberAfterPossiblyEliminatingZero();
                // the method may return an object or a string depending on version
                if (info && typeof info === "object" && info.formattedNumber) {
                    formatted = info.formattedNumber;
                } else if (typeof info === "string") {
                    formatted = info;
                }
            }
            // fallback to getNumber()
            if (!formatted && phoneInputRef.current?.getNumber) {
                const info2 = phoneInputRef.current.getNumber();
                if (info2 && typeof info2 === "object" && info2.formattedNumber) {
                    formatted = info2.formattedNumber;
                } else if (typeof info2 === "string") {
                    formatted = info2;
                }
            }
        } catch (e) {
            // ignore and fallback to raw
        }

        // fallback to raw entry
        if (!formatted) formatted = phoneInputValue;

        const e164Candidate = normalizeE164(formatted);

        if (!isE164(e164Candidate)) {
            setOtpError("Please enter a valid phone number (country + number).");
            return;
        }

        try {
            setSending(true);
            const resp = await sendOTP(e164Candidate);

            if (resp && (resp.type === "success" || resp.status === "success" || resp.success || resp.ok)) {
                setStage("sent");
                setOtpDigits(new Array(4).fill(""));
                startCountdown(30);
                setLastSentPhone(e164Candidate);
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

    const handleResend = async () => {
        if (countdown > 0) return;
        await handleSendOTP();
    };

    const handleVerifyOtp = async () => {
        setOtpError("");
        const code = (otpCode || "").trim();
        if (code.length !== 4) {
            setOtpError("Enter the 4 digit code");
            return;
        }

        try {
            setVerifying(true);
            const phoneToVerify = lastSentPhone;
            if (!phoneToVerify) {
                setOtpError("No phone to verify. Please request a new code.");
                setVerifying(false);
                return;
            }

            const resp = await verifyOTP(phoneToVerify, code, expoPushToken, Platform.OS);

            if (resp?.userToken) {
                await setUserToken(resp.userToken);
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
                router.replace("updateScreen");
            } else {
                router.replace("dashboard");
            }
        } catch (err) {
            setError(err?.message || "Google login failed. Please try again.");
            try {
                await logout?.();
            } catch (e) {
                console.warn("Logout error:", e);
            }
        } finally {
            setSubmitting(false);
        }
    };

    // UI helpers for navigation/back actions
    const handleShowMore = () => {
        setShowMore(true);
        setStage("idle");
    };
    const handleHideMore = () => {
        setShowMore(false);
        setStage("idle");
        setPhoneInputValue("");
        setOtpDigits(new Array(4).fill(""));
        setOtpError("");
    };
    const handleBackFromSent = () => {
        // go back to phone entry (not to Google)
        setStage("idle");
        setOtpDigits(new Array(4).fill(""));
        setOtpError("");
    };

    // Prevent UI flash while auth context bootstraps
    if (!hydrated || (userToken && (authLoading || !user))) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme?.colors?.background }}>
                <ActivityIndicator />
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
                        {/* Top row: back / close when showing more */}
                        <View style={{ width: "100%", flexDirection: "row", justifyContent: "flex-start" }}>
                            {showMore && (
                                <View style={styles.headerRow}>
                                    <TouchableOpacity
                                        onPress={stage === "sent" ? handleBackFromSent : handleHideMore}
                                        style={styles.backButton}
                                        accessibilityRole="button"
                                    >
                                        <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
                                    </TouchableOpacity>

                                    <Text style={styles.headerTitle}>{stage === "sent" ? "Verify OTP" : "Login with Mobile"}</Text>
                                </View>
                            )}
                        </View>

                        {/* Primary area */}
                        <View style={{ width: "100%", alignItems: "center" }}>
                            {/* When OTP is sent we hide the Google UI (requested). When showMore===false show only Google */}
                            {!showMore && (
                                <>
                                    <TouchableOpacity
                                        style={styles.googleBtn}
                                        onPress={handleGoogleLogin}
                                        disabled={submitting || authLoading}
                                        accessibilityRole="button"
                                    >
                                        {submitting || authLoading ? <ActivityIndicator /> : <Text style={styles.googleText}>Continue with Google</Text>}
                                    </TouchableOpacity>

                                    <TouchableOpacity onPress={handleShowMore} style={{ marginTop: 12 }}>
                                        <Text style={[styles.footerText, { fontWeight: "700", color: theme?.colors?.primary }]}>More ways to login</Text>
                                    </TouchableOpacity>
                                </>
                            )}

                            {/* show phone / otp card when user clicked "more" OR stage === 'sent' */}
                            {(showMore || stage === "sent") && (
                                <>
                                    {stage !== "sent" ? (
                                        // PHONE ENTRY
                                        <>
                                            {/* Phone input */}
                                            <View style={{ flexDirection: "row", alignItems: "center", width: "100%", gap: 8 }}>
                                                <PhoneInput
                                                    ref={phoneInputRef}
                                                    value={phoneInputValue}
                                                    defaultValue={phoneInputValue}
                                                    defaultCode={defaultCountryCode}
                                                    layout="first"
                                                    onChangeText={(text) => setPhoneInputValue(text)}
                                                    onChangeFormattedText={(text) => setPhoneInputValue(text)}
                                                    // styling hooks
                                                    containerStyle={styles.phoneContainer}
                                                    textContainerStyle={styles.phoneTextContainer}
                                                    textInputStyle={styles.phoneTextInput}
                                                    codeTextStyle={styles.codeText}
                                                    flagButtonStyle={styles.flagButton}
                                                    // ensure dropdown icon is an element (not a function) and visible in dark mode
                                                    renderDropdownImage={<Ionicons name="chevron-down" size={18} color={theme.colors.text} />}
                                                    // make sure arrow isn't disabled
                                                    disableArrowIcon={false}
                                                    placeholder="9876543210"
                                                />


                                            </View>

                                            <TouchableOpacity style={[styles.signInBtn, { marginTop: 12 }]} onPress={handleSendOTP} disabled={sending}>
                                                {sending ? <ActivityIndicator /> : <Text style={styles.secondaryText}>Send OTP</Text>}
                                            </TouchableOpacity>
                                            {otpError ? <Text style={styles.error}>{otpError}</Text> : null}
                                        </>
                                    ) : (
                                        // OTP INPUT (stage === 'sent')
                                        <>
                                            <Text style={[styles.hint, { textAlign: "left", marginBottom: 8 }]}>
                                                We sent a 4 digit code to {lastSentPhone || phoneInputValue}
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
            backgroundColor: "#fff",
            alignItems: "center",
            justifyContent: "center",
        },
        googleText: { fontWeight: "700", color: theme.colors.textDark },
        hint: { color: theme.colors.muted, fontSize: 13, textAlign: "center" },
        error: { color: "#F43F5E", marginBottom: 12 },
        signInBtn: {
            height: 44,
            width: "100%",
            borderRadius: 10,
            backgroundColor: theme.colors.card,
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
            width: 40,              // smaller than full input
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
    });
