// app/account/link.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Modal,
    Keyboard,
    Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import PhoneInput from "react-native-phone-number-input";
import Header from "~/header";
import { useTheme } from "context/ThemeProvider";
import { useAuth } from "context/AuthContext";
import { sendOTP, verifyPhoneLink, linkGoogle } from "services/UserService";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

/**
 * LinkContactScreen
 * - Prevents linking another verified email/phone if one already exists.
 * - Allows Google verification when only an Apple private relay email is present.
 * - Clear copy + disabled CTAs when action is blocked.
 */
export default function LinkContactScreen() {
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { user, loadUserData, setUser, userToken } = useAuth() || {};

    // google verify state
    const [googleLoading, setGoogleLoading] = useState(false);

    // phone states
    const phoneRef = useRef(null);
    const [callingCode, setCallingCode] = useState("");
    const [nationalNumber, setNationalNumber] = useState(
        user?.phone ? String(user.phone).replace(/^\+?\d+/, "") : ""
    );
    const [sendingOtp, setSendingOtp] = useState(false);
    const [otpModalVisible, setOtpModalVisible] = useState(false);
    const [otpCode, setOtpCode] = useState("");
    const [verifyingOtp, setVerifyingOtp] = useState(false);
    const [phoneToVerify, setPhoneToVerify] = useState(null); // full E.164 used for verify

    useEffect(() => {
        GoogleSignin.configure({
            webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
            iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
            offlineAccess: false,
        });
    }, []);

    useEffect(() => {
        setNationalNumber((prev) => {
            if (user?.phone) {
                const digits = String(user.phone).replace(/[^\d]/g, "");
                return digits.length > 10 ? digits.slice(-10) : digits;
            }
            return prev;
        });
    }, [user?.phone]);

    // Helpers
    const normalizeE164 = (s) => {
        const digs = String(s || "").replace(/[^\d]/g, "");
        if (!digs) return "";
        const cc = phoneRef.current?.getCallingCode?.();
        if (cc) {
            if (digs.startsWith(String(cc))) return `+${digs}`;
            return `+${String(cc)}${digs}`;
        }
        return `+${digs}`;
    };

    // --- Apple email / relay logic helpers ---
    const appleRelayRegex = /@privaterelay\.appleid\.com$/i;
    const userEmail = user?.email ? String(user.email).trim().toLowerCase() : null;
    const appleEmail = user?.appleEmail ? String(user.appleEmail).trim().toLowerCase() : null;

    const emailMatchesApple = !!(userEmail && appleEmail && userEmail === appleEmail);
    const appleEmailIsRelay = !!(appleEmail && appleRelayRegex.test(appleEmail));

    // Determine if user can link a new email:
    // Disallow if user.email exists and is NOT an Apple private-relay (i.e. there's already a valid personal/linked email).
    // Allow if no user.email OR user.email exists but equals an Apple private relay (we want personal email in that case).
    const canLinkEmail = !userEmail || (emailMatchesApple && appleEmailIsRelay);

    // Determine if user can link a phone: only if no phone is already attached
    const canLinkPhone = !user?.phone;

    // Human friendly status and message
    const getEmailStatus = () => {
        if (userEmail) {
            if (emailMatchesApple) {
                if (appleEmailIsRelay) {
                    return {
                        status: "linked_relay",
                        title: "Apple provided a private relay email",
                        message:
                            "To link a personal email, verify with Google",
                    };
                } else {
                    return {
                        status: "linked_personal",
                        title: "Verified & linked",
                        message: "This email came from Apple and is a personal (non-relay) address. It's verified and linked.",
                    };
                }
            } else {
                return {
                    status: "linked_other",
                    title: "Linked",
                    message: "This email is linked to your account.",
                };
            }
        } else {
            if (appleEmail) {
                if (appleEmailIsRelay) {
                    return {
                        status: "apple_relay_unlinked",
                        title: "Apple provided a private relay email",
                        message: "To link a personal email, verify with Google"
                    };
                } else {
                    return {
                        status: "apple_personal_unlinked",
                        title: "Apple provided a verified email",
                        message: "Apple provided this verified email. You can link it to your account.",
                    };
                }
            } else {
                return {
                    status: "no_email",
                    title: "No email linked",
                    message: "Add or verify an email to receive receipts and notifications.",
                };
            }
        }
    };

    const emailStatus = getEmailStatus();

    // Google-based email verification/linking
    const handleVerifyEmailWithGoogle = async () => {
        if (!canLinkEmail) {
            // Defensive guard — UI should have disabled the button anyway
            Alert.alert("Already linked", "A verified email is already linked to this account. To change it, unlink or contact support.");
            return;
        }

        setGoogleLoading(true);
        try {
            await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
            const userInfo = await GoogleSignin.signIn();
            // idToken usually in userInfo.idToken
            const idToken = userInfo?.data?.idToken || userInfo?.idToken || userInfo?.serverAuthCode || null;
            const googleEmail = userInfo?.data?.user?.email || userInfo?.email || null;

            if (!idToken) throw new Error("Could not obtain Google ID token. Ensure Google Sign-In is configured.");
            if (!userToken) throw new Error("Not authenticated. Please login to your account first.");

            // call service wrapper that posts to /v1/users/link-google
            const body = await linkGoogle(idToken);

            const newEmail = body?.user?.email ?? body?.email ?? googleEmail;
            if (newEmail) {
                if (typeof setUser === "function") {
                    setUser((prev = {}) => ({ ...prev, email: newEmail }));
                } else {
                    await loadUserData?.();
                }
            }

            Alert.alert("Email linked", "Your email has been verified and linked to your account.");
        } catch (err) {
            // surface server message (409, 401, etc)
            console.error("Google link error:", err);
            const status = err?.status;
            const body = err?.body;
            const message = err?.message || body?.error || body?.message || "Could not verify Google email.";

            if (status === 409) {
                // conflict: email exists on another account
                Alert.alert("Already in use", message);
            } else if (status === 401) {
                Alert.alert("Session error", "Please sign in again.");
            } else {
                Alert.alert("Google verification failed", message);
            }
        } finally {
            setGoogleLoading(false);
        }
    };

    // Phone: request OTP
    const handleRequestOtp = async () => {
        if (!canLinkPhone) {
            Alert.alert("Phone already linked", "A phone number is already linked to this account. To change it, unlink or contact support.");
            return;
        }

        setSendingOtp(true);
        setOtpCode("");
        setPhoneToVerify(null);
        try {
            const refCc = phoneRef.current?.getCallingCode?.();
            const cc = refCc ? String(refCc).replace(/\D/g, "") : String(callingCode || "").replace(/\D/g, "");
            const nat = String(nationalNumber || "").replace(/\D/g, "");
            if (!cc || !nat) {
                Alert.alert("Invalid phone", "Please select a country and enter a phone number.");
                setSendingOtp(false);
                return;
            }
            const e164 = `+${cc}${nat}`;
            await sendOTP(e164);
            setPhoneToVerify(e164);
            setOtpModalVisible(true);
            Keyboard.dismiss();
        } catch (err) {
            console.error("send OTP failed", err);
            const msg = err?.message || "Failed to send OTP. Try again.";
            Alert.alert("Failed to send OTP", msg);
        } finally {
            setSendingOtp(false);
        }
    };

    // Phone: verify and link
    const handleVerifyAndLink = async () => {
        if (!phoneToVerify) {
            Alert.alert("Error", "No phone to verify. Please request OTP.");
            return;
        }
        if (!otpCode || otpCode.trim().length === 0) {
            Alert.alert("Invalid", "Enter the OTP.");
            return;
        }

        setVerifyingOtp(true);
        try {
            const normalized = phoneToVerify;
            await verifyPhoneLink(normalized, otpCode.trim()); // uses api wrapper tokens

            // success -> update local user
            if (typeof setUser === "function") {
                setUser((prev = {}) => ({ ...prev, phone: normalized }));
            } else {
                await loadUserData?.();
            }

            // cleanup + feedback
            setOtpModalVisible(false);
            setOtpCode("");
            setPhoneToVerify(null);
            Alert.alert("Phone linked", "Your phone number was linked to your account.");
        } catch (err) {
            console.error("verify & link error:", err);

            // Always close the modal and clear OTP on error
            setOtpModalVisible(false);
            setOtpCode("");
            setPhoneToVerify(null);

            const status = err?.status;
            const body = err?.body;
            const message = err?.message || body?.error || body?.message || "Could not verify OTP. Try again.";

            if (status === 409) {
                Alert.alert("Already linked", message);
            } else if (status === 401) {
                Alert.alert("Session error", "Please sign in again.");
            } else {
                Alert.alert("Verification failed", message);
            }
        } finally {
            setVerifyingOtp(false);
        }
    };

    // UI helpers for disabled CTA subtitle
    const emailBlockedSubtitle = "A verified email is already linked. To use a different email, unlink it first or contact support.";
    const phoneBlockedSubtitle = "A phone number is already linked to this account. To use a different number, unlink it first or contact support.";

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <StatusBar style={theme.statusBarStyle === "dark-content" ? "dark" : "light"} />
            <Header showBack title="Link Account" />

            <View style={{ padding: 16, gap: 4 }}>
                
                <Text style={styles.sectionLabel}>Email</Text>

                {/* Show the currently linked email (if any) */}
                <View style={{ marginBottom: 8 }}>
                    <Text style={{ color: theme.colors.muted, marginBottom: 6 }}>
                        {user?.email && appleEmail !==userEmail ? "Linked email:" : "No personal email linked"}
                    </Text>
                    {user?.email && appleEmail !== userEmail && <Text style={{ color: theme.colors.text, fontWeight: "600" }}>{user?.email ?? "—"}</Text>}

                    {/* If there is an Apple-provided email display it too (for transparency) */}
                    {appleEmail ? (
                        <Text style={{ color: theme.colors.muted, marginTop: 6 }}>Apple provided: {appleEmail}</Text>
                    ) : null}
                </View>

                {/* Email status message */}
                {canLinkEmail && (<View style={{ padding: 10, borderRadius: 8, backgroundColor: theme.colors.card, marginBottom: 8 }}>
                    <Text style={{ color: theme.colors.primary, fontWeight: "700", marginBottom: 6 }}>{emailStatus.title}</Text>
                    <Text style={{ color: theme.colors.muted }}>{emailStatus.message}</Text>
                </View>)}

                {/* Verify with Google CTA */}
                {canLinkEmail && (
                    <View>
                        <TouchableOpacity
                            style={[styles.primaryBtn, { flexDirection: "row", justifyContent: "center", alignItems: "center" }]}
                            onPress={handleVerifyEmailWithGoogle}
                            disabled={googleLoading}
                            activeOpacity={0.85}
                        >
                            {googleLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify with Google</Text>}
                        </TouchableOpacity>
                    </View>
                )}


                <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Phone number</Text>

                {/* If phone already linked show readonly display, else show input */}
                {user?.phone ? (
                    <View style={{ marginBottom: 8 }}>
                        <Text style={{ color: theme.colors.text, fontWeight: "600" }}>{user.phone}</Text>
                    </View>
                ) : (
                    <PhoneInput
                        ref={phoneRef}
                        defaultCode="IN"
                        value={nationalNumber}
                        onChangeText={(t) => setNationalNumber(String(t || "").replace(/\D/g, ""))}
                        onChangeFormattedText={() => {
                            try {
                                const cc = phoneRef.current?.getCallingCode?.() || "";
                                setCallingCode(String(cc).replace(/\D/g, ""));
                            } catch (e) { }
                        }}
                        containerStyle={styles.phoneContainer}
                        textContainerStyle={styles.phoneTextContainer}
                        textInputStyle={styles.phoneTextInput}
                        codeTextStyle={styles.codeText}
                        flagButtonStyle={styles.flagButton}
                    />
                )}

                {canLinkPhone && (
                    <>
                        <TouchableOpacity
                            style={styles.primaryBtn}
                            onPress={handleRequestOtp}
                            disabled={sendingOtp}
                            activeOpacity={0.85}
                        >
                            {sendingOtp ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send OTP</Text>}
                        </TouchableOpacity>
                    </>
                )}
                {(canLinkEmail || canLinkPhone) && <View style={{ padding: 10, borderRadius: 8, backgroundColor: theme.colors.card, marginTop: 8 }}>
                    <Text
                        accessibilityRole="text"
                        accessibilityLabel="Link contact hint"
                        style={[styles.hintText,{fontWeight: '500'}]}
                    >
                        Link your email and phone so friends can find you and you can recover your account easily.
                    </Text>
                </View>}
            </View>

            {/* OTP modal */}
            <Modal visible={otpModalVisible} transparent animationType="fade" onRequestClose={() => {
                setOtpModalVisible(false);
                setOtpCode("");
                setPhoneToVerify(null);
            }}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, { backgroundColor: theme.colors.card }]}>
                        <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Enter OTP</Text>
                        <Text style={[styles.mutedText, { marginBottom: 8 }]}>We sent an SMS with a code to {phoneToVerify}</Text>

                        <TextInput
                            value={otpCode}
                            onChangeText={setOtpCode}
                            placeholder="1234"
                            keyboardType="number-pad"
                            style={[styles.input, { marginBottom: 12 }]}
                            maxLength={8}
                        />

                        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                            <TouchableOpacity onPress={() => {
                                setOtpModalVisible(false);
                                setOtpCode("");
                                setPhoneToVerify(null);
                            }} style={styles.modalCancel}>
                                <Text style={{ color: theme.colors.text }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleVerifyAndLink} style={styles.primaryBtn} disabled={verifyingOtp}>
                                {verifyingOtp ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify & Link</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const createStyles = (theme) =>
    StyleSheet.create({
        safe: { flex: 1, backgroundColor: theme.colors.background },
        sectionLabel: { color: theme.colors.primary, fontSize: 12, fontWeight: "700", marginBottom: 6 },
        input: {
            height: 44,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#E6EEF8",
            paddingHorizontal: 12,
            color: theme.colors.text,
            backgroundColor: theme.colors.background,
            marginBottom: 8,
        },
        primaryBtn: {
            backgroundColor: theme.colors.primary,
            paddingVertical: 12,
            borderRadius: 8,
            paddingHorizontal: 8,
            alignItems: "center",
            justifyContent: "center",
        },
        primaryBtnText: { color: "#fff", fontWeight: "700" },
        primaryBtnAlt: {
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            paddingVertical: 12,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
        },
        primaryBtnAltText: { color: theme.colors.primary, fontWeight: "700" },
        error: { color: "#F43F5E", marginBottom: 8 },
        hintText: { color: theme.colors.muted, fontSize: 13 },
        // phone styles
        phoneContainer: {
            width: "100%",
            height: 48,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#E6EEF8",
            backgroundColor: theme.colors.background,
            overflow: "hidden",
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 8,
        },
        phoneTextContainer: {
            backgroundColor: "transparent",
            flex: 1,
            paddingVertical: 0,
            paddingLeft: 8,
        },
        phoneTextInput: {
            color: theme.colors.text,
            fontSize: 16,
            height: 44,
        },
        codeText: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
        flagButton: { width: 40, justifyContent: "center", alignItems: "center", paddingHorizontal: 8 },
        // modal
        modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)" },
        modalCard: { width: "92%", padding: 16, borderRadius: 12 },
        modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
        modalCancel: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8, alignItems: "center", justifyContent: "center" },
        mutedText: { color: theme.colors.muted },
    });
