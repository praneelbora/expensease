// src/screens/Login.js  (or wherever your Login is)
import React, { useEffect, useContext, useMemo, useState } from "react";
import {
    StyleSheet,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { GoogleSignin, GoogleSigninButton } from "@react-native-google-signin/google-signin";

import { useAuth } from "context/AuthContext";
import { NotificationContext } from "context/NotificationContext";
import { useTheme } from "context/ThemeProvider";

import {
    mobileLogin,
    sendOtp,
    verifyOtp,
    checkAppVersion,
    googleLoginMobile,
} from "services/UserService";

export default function Login() {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme, insets), [theme, insets]);

    const { setUserToken, isLoading, setIsLoading, version, logout } = useAuth();
    const { expoPushToken } = useContext(NotificationContext);

    const [mode, setMode] = useState("email"); // "email" | "phone"
    const [email, setEmail] = useState("praneelbora@gmail.com");
    const [phone, setPhone] = useState("+9174474253497");
    const [otp, setOtp] = useState("");
    const [otpSent, setOtpSent] = useState(false);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

    useEffect(() => {
        GoogleSignin.configure({
            webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
            iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
            offlineAccess: true,
        });
    }, []);

    const handleEmailLogin = async () => {
        try {
            setSubmitting(true);
            setIsLoading?.(true);
            setError("");
            const res = await mobileLogin(email.trim(), expoPushToken, Platform.OS);
            if (res?.error) throw new Error(res.error);
            setUserToken?.(res.userToken);
            const response = await checkAppVersion(version, Platform.OS);
            if (response.outdated) router.replace("updateScreen");
            else router.replace("dashboard");
        } catch (e) {
            setError(e?.message || "Could not sign in with email.");
            logout?.();
        } finally {
            setSubmitting(false);
            setIsLoading?.(false);
        }
    };

    const handleSendOtp = async () => {
        try {
            setSubmitting(true);
            setIsLoading?.(true);
            setError("");
            const res = await sendOtp(phone.trim());
            if (res?.error) throw new Error(res.error);
            setOtpSent(true);
        } catch (e) {
            setError(e?.message || "Could not send OTP.");
        } finally {
            setSubmitting(false);
            setIsLoading?.(false);
        }
    };

    const handleVerifyOtp = async () => {
        try {
            setSubmitting(true);
            setIsLoading?.(true);
            setError("");
            const res = await verifyOtp(phone.trim(), otp.trim(), expoPushToken, Platform.OS);
            setUserToken?.(res.userToken);
            const response = await checkAppVersion(version, Platform.OS);
            if (response.outdated) router.replace("updateScreen");
            else router.replace("dashboard");
        } catch (e) {
            setError(e?.message || "Invalid OTP.");
            logout?.();
        } finally {
            setSubmitting(false);
            setIsLoading?.(false);
        }
    };

    const handleGoogleLogin = async () => {
        try {
            setSubmitting(true);
            setIsLoading?.(true);
            setError("");
            await GoogleSignin.hasPlayServices();
            const userInfo = await GoogleSignin.signIn();
            // userInfo may differ between envs; check console if issues
            const res = await googleLoginMobile(
                userInfo.data.idToken,
                expoPushToken,
                Platform.OS,
                userInfo.data.user?.name,
                userInfo.data.user?.photo
            );
            setUserToken?.(res.userToken);
            const response = await checkAppVersion(version, Platform.OS);
            if (response.outdated) router.replace("updateScreen");
            else router.replace("dashboard");
        } catch (err) {
            console.log("Google login error:", err);
            setError("Google login failed. Please try again.");
        } finally {
            setSubmitting(false);
            setIsLoading?.(false);
        }
    };

    return (
        <View style={styles.wrapper}>
            <ScrollView
                style={{ width: "100%" }}
                contentContainerStyle={{
                    flexGrow: 1,
                    width: "100%",
                    justifyContent: "flex-end",
                }}
                keyboardShouldPersistTaps="handled"
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                    style={styles.container}
                >
                    <Text style={styles.logoFallback}>Expensease</Text>

                    {/* Mode Switch */}
                    <View style={styles.switchRow}>
                        <TouchableOpacity
                            onPress={() => setMode("email")}
                            style={[styles.switchBtn, mode === "email" && styles.switchActive]}
                        >
                            <Text style={[styles.switchText, mode === "email" && styles.switchTextActive]}>
                                Email
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setMode("phone")}
                            style={[styles.switchBtn, mode === "phone" && styles.switchActive]}
                        >
                            <Text style={[styles.switchText, mode === "phone" && styles.switchTextActive]}>
                                Phone
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Email Login */}
                    {mode === "email" && (
                        <View style={styles.form}>
                            <TextInput
                                value={email}
                                onChangeText={setEmail}
                                placeholder="you@example.com"
                                placeholderTextColor={theme.colors.muted}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                style={styles.input}
                            />
                            {error ? <Text style={styles.errorText}>{error}</Text> : null}
                            <TouchableOpacity
                                onPress={handleEmailLogin}
                                disabled={!isValidEmail || submitting || isLoading}
                                style={[
                                    styles.submitBtn,
                                    (!isValidEmail || submitting || isLoading) && { opacity: 0.6 },
                                ]}
                            >
                                <Text style={styles.submitText}>
                                    {submitting || isLoading ? "Signing in..." : "Continue"}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Phone Login */}
                    {mode === "phone" && (
                        <View style={styles.form}>
                            {!otpSent ? (
                                <>
                                    <TextInput
                                        value={phone}
                                        onChangeText={setPhone}
                                        placeholder="Enter phone number"
                                        placeholderTextColor={theme.colors.muted}
                                        keyboardType="phone-pad"
                                        style={styles.input}
                                    />
                                    {error ? <Text style={styles.errorText}>{error}</Text> : null}
                                    <TouchableOpacity
                                        onPress={handleSendOtp}
                                        disabled={!phone || submitting || isLoading}
                                        style={[
                                            styles.submitBtn,
                                            (!phone || submitting || isLoading) && { opacity: 0.6 },
                                        ]}
                                    >
                                        <Text style={styles.submitText}>
                                            {submitting || isLoading ? "Sending OTP..." : "Send OTP"}
                                        </Text>
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <>
                                    <TextInput
                                        value={otp}
                                        onChangeText={setOtp}
                                        placeholder="Enter OTP"
                                        placeholderTextColor={theme.colors.muted}
                                        keyboardType="numeric"
                                        style={styles.input}
                                    />
                                    {error ? <Text style={styles.errorText}>{error}</Text> : null}
                                    <TouchableOpacity
                                        onPress={handleVerifyOtp}
                                        disabled={!otp || submitting || isLoading}
                                        style={[
                                            styles.submitBtn,
                                            (!otp || submitting || isLoading) && { opacity: 0.6 },
                                        ]}
                                    >
                                        <Text style={styles.submitText}>
                                            {submitting || isLoading ? "Verifying..." : "Verify OTP"}
                                        </Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    )}

                    {/* Google Login */}
                    <View style={{ marginTop: 24, width: "100%" }}>
                        <GoogleSigninButton
                            style={{ width: "100%", height: 48 }}
                            size={GoogleSigninButton.Size.Wide}
                            color={GoogleSigninButton.Color.Dark}
                            onPress={handleGoogleLogin}
                        />
                    </View>
                </KeyboardAvoidingView>
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
            paddingTop: (insets?.top || 0) + 20,
            paddingBottom: (insets?.bottom || 0) + 24,
        },
        logoFallback: { color: theme.colors.text, fontSize: 28, fontWeight: "700" },
        switchRow: {
            flexDirection: "row",
            marginVertical: 20,
            borderRadius: 8,
            overflow: "hidden",
        },
        switchBtn: {
            flex: 1,
            padding: 12,
            backgroundColor: theme.colors.card,
            alignItems: "center",
        },
        switchActive: { backgroundColor: theme.colors.border },
        switchText: { color: theme.colors.muted, fontSize: 16 },
        switchTextActive: { color: theme.colors.text, fontWeight: "700" },
        form: { width: "100%", gap: 12, alignItems: "center" },
        input: {
            width: "100%",
            height: 56,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.card,
            color: theme.colors.text,
            paddingHorizontal: 16,
            fontSize: 16,
        },
        submitBtn: {
            width: "100%",
            height: 56,
            borderRadius: 12,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: "center",
            justifyContent: "center",
        },
        submitText: { color: theme.colors.text, fontWeight: "700", fontSize: 16 },
        errorText: { color: "#ff6b6b", fontSize: 13 },
    });
