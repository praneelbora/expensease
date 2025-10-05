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
    Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PhoneInput from "@linhnguyen96114/react-native-phone-input";
import { OtpInput } from "react-native-otp-entry";
import { Ionicons } from "@expo/vector-icons";

// Keep native imports only if Android builds include the library
import { CredentialManager } from "android-credential-manager";
import { GoogleProvider, GoogleButtonProvider } from "android-credential-manager/build/loginProviders/LoginProviders";

import { useAuth } from "context/AuthContext";
import { useTheme } from "context/ThemeProvider";
import { NotificationContext } from "context/NotificationContext";
import { router } from "expo-router";
import { checkAppVersion, googleLoginMobile, mobileLogin, sendOTP, verifyOTP } from "services/UserService";

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

    const fade = useRef(new Animated.Value(0)).current;
    const mountedRef = useRef(true);
    const silentAttemptedRef = useRef(false);
    const attemptCounterRef = useRef(0);

    // Phone / OTP states
    const [showSocial, setShowSocial] = useState(false);
    const [callingCode, setCallingCode] = useState(""); // digits only (e.g. "91")
    const [nationalNumber, setNationalNumber] = useState(""); // digits only
    const [sending, setSending] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [stage, setStage] = useState("idle"); // 'idle' | 'sent' | 'verifying'
    const [lastSentPhone, setLastSentPhone] = useState(null);
    const [otpCode, setOtpCode] = useState("");
    const [otpError, setOtpError] = useState("");
    const [countdown, setCountdown] = useState(0);
    const [otpActive, setOtpActive] = useState(false);

    // under-review + username/password
    const [underReview, setUnderReview] = useState(false);
    const [reviewVersion, setReviewVersion] = useState(null);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    const phoneInputRef = useRef(null);
    const otpInputsRef = useRef([]);

    const [defaultCountryCode] = useState("IN");

    const normalizeDigits = (s) => String(s || "").replace(/\D/g, "");
    const validatePhoneParts = (cc, national) => {
        const ccDigits = normalizeDigits(cc);
        const natDigits = normalizeDigits(national);
        if (!ccDigits) return { ok: false, reason: "Please select a country code." };
        if (ccDigits.length > 3) return { ok: false, reason: "Invalid country code." };
        if (!natDigits) return { ok: false, reason: "Please enter your phone number." };
        if (natDigits.length < 4) return { ok: false, reason: "Phone number is too short." };
        return { ok: true, phoneToSend: `+${ccDigits}${natDigits}` };
    };

    const startCountdown = (secs = 30) => {
        setCountdown(secs);
        const iv = setInterval(() => {
            setCountdown((p) => {
                if (p <= 1) {
                    clearInterval(iv);
                    return 0;
                }
                return p - 1;
            });
        }, 1000);
    };

    const handleSendOTP = async () => {
        setOtpError("");
        // prefer the canonical calling code from the phone input
        const ccFromRef = phoneInputRef.current?.getCallingCode?.();
        const cc = normalizeDigits(ccFromRef || callingCode || "");
        const nat = normalizeDigits(nationalNumber || "");
        const validation = validatePhoneParts(cc, nat);
        if (!validation.ok) {
            setOtpError(validation.reason);
            return;
        }
        const phoneToSend = validation.phoneToSend;
        try {
            setSending(true);
            const resp = await sendOTP(phoneToSend);
            if (resp && (resp.type === "success" || resp.status === "success" || resp.ok || resp.success)) {
                setStage("sent");
                setLastSentPhone(phoneToSend);
                setOtpCode("");
                setOtpActive(false);
                startCountdown(30);

                // persist split parts so formatting on OTP verify is stable
                setCallingCode(cc);
                setNationalNumber(nat);

                // focus OTP input after a short delay
                setTimeout(() => {
                    otpInputsRef.current?.[0]?.focus?.();
                    Keyboard.dismiss(); // sometimes on Android focusing immediately is odd; OtpInput handles focus
                }, 200);
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

    const handleVerifyOtp = async () => {
        setOtpError("");
        const code = (otpCode || "").trim();
        if (code.length < 3) {
            setOtpError("Enter the code you received.");
            return;
        }
        if (!lastSentPhone) {
            setOtpError("No phone to verify. Please request a new code.");
            return;
        }
        try {
            setVerifying(true);
            const resp = await verifyOTP(lastSentPhone, code, expoPushToken, Platform.OS);
            if (resp?.userToken) {
                await setUserToken(resp.userToken);
                router.replace("home");
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

    const handleResend = async () => {
        if (countdown > 0) return;
        await handleSendOTP();
    };

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        // only act after auth bootstrap so we know logged-in state
        if (!hydrated) return;

        let mounted = true;
        (async () => {
            try {
                const resp = await checkAppVersion(version, Platform.OS);
                if (!mounted) return;

                if (resp?.outdated) {
                    try {
                        router.replace("updateScreen");
                    } catch (e) {
                        console.warn("[Login] Failed to route to updateScreen:", e);
                    }
                    return;
                }

                if (userToken && !authLoading && user) {
                    try {
                        router.replace("home");
                    } catch (e) {
                        console.warn("[Login] Failed to route to home:", e);
                    }
                    return;
                }

                setUnderReview(!!resp?.underReview);
            } catch (err) {
                console.warn("[Login] Version check failed:", err);
                if (userToken && !authLoading && user) {
                    try {
                        router.replace("home");
                    } catch (e) {
                        console.warn("[Login] Failed to route to home after version-check error:", e);
                    }
                } else {
                    setUnderReview(false);
                }
            } finally {
                if (mounted) setCheckingVersion(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, [hydrated, version, userToken, authLoading, user]);

    useEffect(() => {
        Animated.timing(fade, {
            toValue: 1,
            duration: 450,
            useNativeDriver: true,
        }).start();
    }, [fade]);

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

    async function handleCredentialLogin(provider, { isSilent = false } = {}) {
        if (!isSilent) setError("");
        if (submitting) return;
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
                router.replace("home");
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
                router.replace("home");
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
                        {stage !== "sent" ? (
                            <>
                                <View style={{ width: "100%", marginTop: 8 }}>
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
                                        codeTextStyle={styles.codeText}   // 👈 hides country code
                                        renderDropdownImage={
                                            <Ionicons name="chevron-down" size={18} color={theme.colors.text} />
                                        }
                                        placeholder="9876543210"
                                    />


                                    <TouchableOpacity style={[styles.signInBtn, { marginTop: 12 }]} onPress={handleSendOTP} disabled={sending}>
                                        {sending ? <ActivityIndicator /> : <Text style={styles.secondaryText}>Send OTP</Text>}
                                    </TouchableOpacity>
                                    {otpError ? <Text style={styles.error}>{otpError}</Text> : null}
                                    {!showSocial && (
                                        <TouchableOpacity onPress={() => setShowSocial(true)} style={{ marginTop: 8 }}>
                                            <Text style={[styles.footerText, { fontWeight: "700", color: theme?.colors?.primary, textAlign: "center" }]}>More ways to login</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </>
                        ) : (
                            <View style={{ width: "100%", marginTop: 8 }}>
                                <Text style={[styles.hint, { textAlign: "left" }]}>We sent a code to {formatSentPhone(lastSentPhone)}</Text>

                                <View style={{ width: "100%", alignItems: "center", marginTop: 12 }}>
                                    <OtpInput
                                        ref={otpInputsRef}
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

                                <TouchableOpacity style={[styles.signInBtn, { marginTop: 12 }]} onPress={handleVerifyOtp} disabled={verifying || !otpActive}>
                                    {verifying ? <ActivityIndicator /> : <Text style={styles.secondaryText}>Verify OTP</Text>}
                                </TouchableOpacity>

                                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
                                    <Text style={styles.footerText}>Didn't get code?</Text>
                                    <TouchableOpacity onPress={handleResend} disabled={countdown > 0}>
                                        <Text style={[styles.linkText, { fontWeight: "600" }]}>{countdown > 0 ? `Resend in ${countdown}s` : "Resend"}</Text>
                                    </TouchableOpacity>
                                </View>

                                {otpError ? <Text style={styles.error}>{otpError}</Text> : null}
                            </View>
                        )}

                        {showSocial && stage !== "sent" && (
                            <View style={{ width: "100%", marginTop: 12 }}>
                                <TouchableOpacity
                                    style={styles.googleBtn}
                                    onPress={() => handleCredentialLogin(explicitProvider, { isSilent: false })}
                                    disabled={submitting || authLoading}
                                    accessibilityRole="button"
                                >
                                    {submitting || authLoading ? <ActivityIndicator /> : <Text style={styles.googleText}>Continue with Google</Text>}
                                </TouchableOpacity>
                            </View>
                        )}

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

    // helper for display formatting
    function formatSentPhone(phone) {
        if (callingCode && nationalNumber) return `+${callingCode} ${nationalNumber}`;
        if (phone) {
            const onlyDigits = String(phone).replace(/\D/g, "");
            const cc = onlyDigits.slice(0, Math.min(3, onlyDigits.length - 4));
            const num = onlyDigits.slice(cc.length);
            return cc ? `+${cc} ${num}` : phone;
        }
        return "";
    }
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

        // OTP theme bits used by OtpInput
        otpContainer: {
            width: 280,
        },
        codeContainer: {
            borderWidth: 1,
            width: 60,
            borderColor: "#55554F",
        },
        pinCodeText: {
            color: theme?.colors?.text ?? "#0F172A",
            fontSize: 20,
        },
        focusStick: {
            width: 20,
            height: 2,
            marginTop: 20,
        },
        activePinCodeContainer: {
            borderColor: theme?.colors?.primary ?? "#0B5FFF",
        },

        // PhoneInput styles
        phoneContainer: {
            width: "100%",
            height: 48,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme?.colors?.border ?? "#E6EEF8",
            backgroundColor: theme?.colors?.background ?? "#fff",
            overflow: "hidden",
            flexDirection: "row",
            alignItems: "center",
        },
        flagButton: {
            width: 40,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 8,
            backgroundColor: "transparent",
        },
        codeText: {
            color: theme?.colors?.text ?? "#0F172A",
            fontSize: 14,
            fontWeight: "600",
        },
        phoneTextContainer: {
            backgroundColor: "transparent",
            flex: 1,
            paddingVertical: 0,
            paddingLeft: 8,
        },
        phoneTextInput: {
            color: theme?.colors?.text ?? "#0F172A",
            fontSize: 16,
            height: 44,
        },
    });
