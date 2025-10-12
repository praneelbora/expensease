// app/settings/link.js
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
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import PhoneInput from "@linhnguyen96114/react-native-phone-input";
import { Ionicons } from "@expo/vector-icons";
import Header from "~/header";
import { useTheme } from "context/ThemeProvider";
import { useAuth } from "context/AuthContext";
import { sendOTP, verifyPhoneLink, linkGoogle } from "services/UserService";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

/**
 * LinkContactScreen
 * + Additional (secondary) phone support that can be added/changed anytime
 * + Primary phone flow preserved (only if not linked)
 * + Uses Login screen's phone input UI (flag/code + separate number field)
 */
export default function LinkContactScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user, loadUserData, setUser, userToken } = useAuth() || {};

  // --- Google verify state ---
  const [googleLoading, setGoogleLoading] = useState(false);

  // --- Primary phone states (uses Login UI pattern) ---
  const phoneRef = useRef(null);
  const [callingCode, setCallingCode] = useState(""); // digits only
  const [nationalNumber, setNationalNumber] = useState(
    user?.phone ? String(user.phone).replace(/[^\d]/g, "").slice(-10) : ""
  );
  const callingCodeRef = useRef(callingCode);
  useEffect(() => {
    callingCodeRef.current = String(callingCode || "");
  }, [callingCode]);

  const [sendingOtp, setSendingOtp] = useState(false);

  // --- Secondary phone states (uses Login UI pattern) ---
  const secPhoneRef = useRef(null);
  const [secCallingCode, setSecCallingCode] = useState(""); // digits only
  const [secNationalNumber, setSecNationalNumber] = useState(
    user?.secondaryPhone ? String(user.secondaryPhone).replace(/[^\d]/g, "") : ""
  );
  const secCallingCodeRef = useRef(secCallingCode);
  useEffect(() => {
    secCallingCodeRef.current = String(secCallingCode || "");
  }, [secCallingCode]);

  const [sendingSecOtp, setSendingSecOtp] = useState(false);
  const [isEditingSecondary, setIsEditingSecondary] = useState(!user?.secondaryPhone);

  // --- OTP Modal (shared) ---
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [phoneToVerify, setPhoneToVerify] = useState(null); // full E.164
  const [verifyTarget, setVerifyTarget] = useState("primary"); // 'primary' | 'secondary'

  // --- Google configuration ---
  useEffect(() => {
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
      offlineAccess: false,
    });
  }, []);

  // keep primary input synced if user.phone arrives later
  useEffect(() => {
    if (user?.phone) {
      const digits = String(user.phone).replace(/[^\d]/g, "");
      setNationalNumber(digits.slice(-10));
    }
  }, [user?.phone]);

  // Helpers
  const normalizeE164 = (natDigits, getCode) => {
    const digs = String(natDigits || "").replace(/[^\d]/g, "");
    const cc = getCode?.() || "";
    const ccDigits = String(cc).replace(/[^\d]/g, "");
    if (!digs) return "";
    if (!ccDigits) return `+${digs}`;
    return digs.startsWith(ccDigits) ? `+${digs}` : `+${ccDigits}${digs}`;
  };

  // --- Apple email / relay logic helpers ---
  const appleRelayRegex = /@privaterelay\.appleid\.com$/i;
  const userEmail = user?.email ? String(user.email).trim().toLowerCase() : null;
  const appleEmail = user?.appleEmail ? String(user.appleEmail).trim().toLowerCase() : null;

  const emailMatchesApple = !!(userEmail && appleEmail && userEmail === appleEmail);
  const appleEmailIsRelay = !!(appleEmail && appleRelayRegex.test(appleEmail));

  // Email link rules (unchanged)
  const canLinkEmail = !userEmail || (emailMatchesApple && appleEmailIsRelay);

  // Primary phone rule: only if not present
  const canLinkPrimaryPhone = !user?.phone;

  // Secondary phone can always be added/changed
  const canLinkSecondaryPhone = true;

  const getEmailStatus = () => {
    if (userEmail) {
      if (emailMatchesApple) {
        if (appleEmailIsRelay) {
          return {
            status: "linked_relay",
            title: "Apple provided a private relay email",
            message: "To link a personal email, verify with Google",
          };
        } else {
          return {
            status: "linked_personal",
            title: "Verified & linked",
            message:
              "This email came from Apple and is a personal (non-relay) address. It's verified and linked.",
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
            message: "To link a personal email, verify with Google",
          };
        } else {
          return {
            status: "apple_personal_unlinked",
            title: "Apple provided a verified email",
            message:
              "Apple provided this verified email. You can link it to your account.",
          };
        }
      } else {
        return {
          status: "no_email",
          title: "No email linked",
          message:
            "Add or verify an email to receive receipts and notifications.",
        };
      }
    }
  };

  const emailStatus = getEmailStatus();

  // --- Google-based email verification/linking ---
  const handleVerifyEmailWithGoogle = async () => {
    if (!canLinkEmail) {
      Alert.alert(
        "Already linked",
        "A verified email is already linked to this account. To change it, unlink or contact support."
      );
      return;
    }

    setGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      const idToken =
        userInfo?.data?.idToken || userInfo?.idToken || userInfo?.serverAuthCode || null;
      const googleEmail = userInfo?.data?.user?.email || userInfo?.email || null;

      if (!idToken) throw new Error("Could not obtain Google ID token. Ensure Google Sign-In is configured.");
      if (!userToken) throw new Error("Not authenticated. Please login to your account first.");

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
      console.error("Google link error:", err);
      const status = err?.status;
      const body = err?.body;
      const message = err?.message || body?.error || body?.message || "Could not verify Google email.";

      if (status === 409) {
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

  // --- PRIMARY Phone: request OTP (only if primary missing) ---
  const handleRequestPrimaryOtp = async () => {
    if (!canLinkPrimaryPhone) {
      Alert.alert(
        "Phone already linked",
        "A primary phone number is already linked to this account."
      );
      return;
    }

    setSendingOtp(true);
    setOtpCode("");
    setPhoneToVerify(null);
    try {
      const e164 = normalizeE164(
        nationalNumber,
        () => phoneRef.current?.getCallingCode?.()
      );

      if (!e164 || e164 === "+") {
        Alert.alert("Invalid phone", "Please select a country and enter a phone number.");
        setSendingOtp(false);
        return;
      }

      await sendOTP(e164, { target: "primary" }); // harmless if server ignores options
      setVerifyTarget("primary");
      setPhoneToVerify(e164);
      setOtpModalVisible(true);
      Keyboard.dismiss();
    } catch (err) {
      console.error("send OTP (primary) failed", err);
      const msg = err?.message || "Failed to send OTP. Try again.";
      Alert.alert("Failed to send OTP", msg);
    } finally {
      setSendingOtp(false);
    }
  };

  // --- SECONDARY Phone: request OTP (can always add/change) ---
  const handleRequestSecondaryOtp = async () => {
    setSendingSecOtp(true);
    setOtpCode("");
    setPhoneToVerify(null);
    try {
      const e164 = normalizeE164(
        secNationalNumber,
        () => secPhoneRef.current?.getCallingCode?.()
      );
      if (!e164 || e164 === "+") {
        Alert.alert("Invalid phone", "Please select a country and enter a phone number.");
        setSendingSecOtp(false);
        return;
      }

      await sendOTP(e164, { target: "secondary" });
      setVerifyTarget("secondary");
      setPhoneToVerify(e164);
      setOtpModalVisible(true);
      Keyboard.dismiss();
    } catch (err) {
      console.error("send OTP (secondary) failed", err);
      const msg = err?.message || "Failed to send OTP. Try again.";
      Alert.alert("Failed to send OTP", msg);
    } finally {
      setSendingSecOtp(false);
    }
  };

  // --- Verify and link for either target ---
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
      await verifyPhoneLink(phoneToVerify, otpCode.trim(), { target: verifyTarget });
      // Update local user
      if (typeof setUser === "function") {
        setUser((prev = {}) => ({
          ...prev,
          ...(verifyTarget === "primary"
            ? { phone: phoneToVerify }
            : { secondaryPhone: phoneToVerify }),
        }));
      } else {
        await loadUserData?.();
      }

      setOtpModalVisible(false);
      setOtpCode("");
      setPhoneToVerify(null);

      if (verifyTarget === "secondary") {
        setIsEditingSecondary(false);
      }

      Alert.alert(
        "Phone linked",
        `Your ${verifyTarget === "secondary" ? "additional" : "primary"} phone number was linked.`
      );
    } catch (err) {
      console.error("verify & link error:", err);
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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar style={theme.statusBarStyle === "dark-content" ? "dark" : "light"} />
      <Header showBack title="Link Account" />

      <View style={{ padding: 16, gap: 4 }}>
        {/* EMAIL */}
        <Text style={styles.sectionLabel}>Email</Text>

        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: theme.colors.muted, marginBottom: 6 }}>
            {user?.email && appleEmail !== userEmail
              ? "Linked email:"
              : "No personal email linked"}
          </Text>
          {user?.email && appleEmail !== userEmail && (
            <Text style={{ color: theme.colors.text, fontWeight: "600" }}>
              {user?.email ?? "—"}
            </Text>
          )}
          {appleEmail ? (
            <Text style={{ color: theme.colors.muted, marginTop: 6 }}>
              Apple provided: {appleEmail}
            </Text>
          ) : null}
        </View>

        {canLinkEmail && (
          <View
            style={{
              padding: 10,
              borderRadius: 8,
              backgroundColor: theme.colors.card,
              marginBottom: 8,
            }}
          >
            <Text
              style={{
                color: theme.colors.primary,
                fontWeight: "700",
                marginBottom: 6,
              }}
            >
              {emailStatus.title}
            </Text>
            <Text style={{ color: theme.colors.muted }}>
              {emailStatus.message}
            </Text>
          </View>
        )}

        {canLinkEmail && (
          <View>
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { flexDirection: "row", justifyContent: "center", alignItems: "center" },
              ]}
              onPress={handleVerifyEmailWithGoogle}
              disabled={googleLoading}
              activeOpacity={0.85}
            >
              {googleLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Verify with Google</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* PRIMARY PHONE */}
        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Primary phone</Text>

        {user?.phone ? (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "600" }}>
              {user.phone}
            </Text>
          </View>
        ) : (
          <>
            {/* Login-style phone UI: flag/code box + number box */}
            <View style={{ flexDirection: "row", alignItems: "center", width: "100%", gap: 8 }}>
              {/* Left flag/code box */}
              <View style={[styles.inputBox, { width: 88, paddingHorizontal: 8, justifyContent: "center" }]}>
                <PhoneInput
                  ref={phoneRef}
                  defaultCode="IN"
                  layout="first"
                  textContainerStyle={{ width: 0, height: 0, padding: 0, margin: 0 }}
                  textInputStyle={{ width: 0, height: 0, padding: 0, margin: 0 }}
                  containerStyle={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
                  flagButtonStyle={{ width: 80, justifyContent: "center", alignItems: "center", backgroundColor: "transparent" }}
                  codeTextStyle={{ fontSize: 12, fontWeight: "600" }}
                  renderDropdownImage={<Ionicons name="chevron-down" size={18} color={theme.colors.text} />}
                  onSelectCountry={(country) => {
                    const newCc = (country?.callingCode && country.callingCode[0]) || "";
                    const newCcDigits = String(newCc).replace(/\D/g, "");
                    setCallingCode(newCcDigits);
                    callingCodeRef.current = newCcDigits;
                  }}
                />
              </View>

              {/* Right number input */}
              <TextInput
                style={[styles.inputBox, { flex: 1, paddingHorizontal: 12, height: 48 }]}
                placeholder="9876543210"
                placeholderTextColor={theme.colors.muted}
                keyboardType="phone-pad"
                value={nationalNumber}
                onChangeText={(t) => {
                  const raw = String(t || "");
                  const onlyDigits = raw.replace(/\D/g, "");
                  if (raw.trim().startsWith("+")) {
                    const ccNow = String(phoneRef.current?.getCallingCode?.() || callingCodeRef.current || "");
                    if (ccNow && onlyDigits.startsWith(ccNow)) {
                      setCallingCode(ccNow);
                      callingCodeRef.current = ccNow;
                      setNationalNumber(onlyDigits.slice(ccNow.length));
                      return;
                    }
                    setNationalNumber(onlyDigits);
                    return;
                  }
                  setNationalNumber(onlyDigits);
                }}
                returnKeyType="done"
                importantForAutofill="no"
                editable
              />
            </View>

            {canLinkPrimaryPhone && (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleRequestPrimaryOtp}
                disabled={sendingOtp}
                activeOpacity={0.85}
              >
                {sendingOtp ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Send OTP</Text>
                )}
              </TouchableOpacity>
            )}
          </>
        )}

        {/* SECONDARY PHONE */}
        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Additional phone</Text>

        {user?.secondaryPhone && !isEditingSecondary ? (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ color: theme.colors.text, fontWeight: "600" }}>
              {user.secondaryPhone}
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                style={styles.primaryBtnAlt}
                onPress={() => {
                  setIsEditingSecondary(true);
                  setSecNationalNumber(
                    String(user.secondaryPhone || "").replace(/[^\d]/g, "")
                  );
                }}
              >
                <Text style={styles.primaryBtnAltText}>Change</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* Login-style phone UI for secondary */}
            <View style={{ flexDirection: "row", alignItems: "center", width: "100%", gap: 8 }}>
              <View style={[styles.inputBox, { width: 88, paddingHorizontal: 8, justifyContent: "center" }]}>
                <PhoneInput
                  ref={secPhoneRef}
                  defaultCode="IN"
                  layout="first"
                  textContainerStyle={{ width: 0, height: 0, padding: 0, margin: 0 }}
                  textInputStyle={{ width: 0, height: 0, padding: 0, margin: 0 }}
                  containerStyle={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
                  flagButtonStyle={{ width: 80, justifyContent: "center", alignItems: "center", backgroundColor: "transparent" }}
                  codeTextStyle={{ fontSize: 12, fontWeight: "600" }}
                  renderDropdownImage={<Ionicons name="chevron-down" size={18} color={theme.colors.text} />}
                  onSelectCountry={(country) => {
                    const newCc = (country?.callingCode && country.callingCode[0]) || "";
                    const newCcDigits = String(newCc).replace(/\D/g, "");
                    setSecCallingCode(newCcDigits);
                    secCallingCodeRef.current = newCcDigits;
                  }}
                />
              </View>

              <TextInput
                style={[styles.inputBox, { flex: 1, paddingHorizontal: 12, height: 48 }]}
                placeholder="Alternate number"
                placeholderTextColor={theme.colors.muted}
                keyboardType="phone-pad"
                value={secNationalNumber}
                onChangeText={(t) => {
                  const raw = String(t || "");
                  const onlyDigits = raw.replace(/\D/g, "");
                  if (raw.trim().startsWith("+")) {
                    const ccNow = String(secPhoneRef.current?.getCallingCode?.() || secCallingCodeRef.current || "");
                    if (ccNow && onlyDigits.startsWith(ccNow)) {
                      setSecCallingCode(ccNow);
                      secCallingCodeRef.current = ccNow;
                      setSecNationalNumber(onlyDigits.slice(ccNow.length));
                      return;
                    }
                    setSecNationalNumber(onlyDigits);
                    return;
                  }
                  setSecNationalNumber(onlyDigits);
                }}
                returnKeyType="done"
                importantForAutofill="no"
                editable
              />
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleRequestSecondaryOtp}
                disabled={sendingSecOtp}
                activeOpacity={0.85}
              >
                {sendingSecOtp ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {user?.secondaryPhone ? "Send OTP to Change" : "Send OTP"}
                  </Text>
                )}
              </TouchableOpacity>
              {user?.secondaryPhone ? (
                <TouchableOpacity
                  style={styles.primaryBtnAlt}
                  onPress={() => {
                    setIsEditingSecondary(false);
                    setSecNationalNumber(
                      String(user.secondaryPhone || "").replace(/[^\d]/g, "")
                    );
                  }}
                >
                  <Text style={styles.primaryBtnAltText}>Cancel</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={[styles.hintText, { marginTop: 6 }]}>
              Your additional number helps friends find you and aids in recovery.
            </Text>
          </>
        )}
      </View>

      {/* OTP modal (shared) */}
      <Modal
        visible={otpModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setOtpModalVisible(false);
          setOtpCode("");
          setPhoneToVerify(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              Enter OTP
            </Text>
            <Text style={[styles.mutedText, { marginBottom: 8 }]}>
              We sent an SMS with a code to {phoneToVerify}
            </Text>

            <TextInput
              value={otpCode}
              onChangeText={setOtpCode}
              placeholder="1234"
              keyboardType="number-pad"
              style={[styles.input, { marginBottom: 12 }]}
              maxLength={8}
            />

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  setOtpModalVisible(false);
                  setOtpCode("");
                  setPhoneToVerify(null);
                }}
                style={styles.modalCancel}
              >
                <Text style={{ color: theme.colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleVerifyAndLink}
                style={styles.primaryBtn}
                disabled={verifyingOtp}
              >
                {verifyingOtp ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    Verify & {verifyTarget === "secondary" ? "Save" : "Link"}
                  </Text>
                )}
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
      paddingHorizontal: 12,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 120,
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
      paddingHorizontal: 12,
      minWidth: 96,
    },
    primaryBtnAltText: { color: theme.colors.primary, fontWeight: "700" },
    error: { color: "#F43F5E", marginBottom: 8 },
    hintText: { color: theme.colors.muted, fontSize: 13 },

    // --- Login-style phone UI pieces ---
    inputBox: {
      height: 48,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme?.colors?.border,
      backgroundColor: theme.colors.background,
      color: theme.colors.text,
      alignItems: "center",
      flexDirection: "row",
    },
    // (the library container is kept transparent; we style the wrapper inputBox)
    phoneContainer: {
      width: "100%",
      height: 48,
      backgroundColor: "transparent",
      borderRadius: 8,
      overflow: "hidden",
      justifyContent: "center",
      alignItems: "center",
    },
    flagButton: {
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 8,
      backgroundColor: "transparent",
    },
    codeText: { color: theme.colors.text, fontSize: 14, fontWeight: "600" },
    phoneTextContainer: { backgroundColor: "transparent", flex: 1, paddingVertical: 0, paddingLeft: 8 },
    phoneTextInput: { color: theme.colors.text, fontSize: 16, height: 44 },

    // modal
    modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)" },
    modalCard: { width: "92%", padding: 16, borderRadius: 12 },
    modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
    modalCancel: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8, alignItems: "center", justifyContent: "center" },
    mutedText: { color: theme.colors.muted },
  });
