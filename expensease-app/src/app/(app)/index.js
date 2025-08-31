// app/(auth)/login.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { AuthContext } from "context/AuthContext";
import { mobileLogin, checkAppVersion } from "services/UserService";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
// Change this to your actual dev endpoint path:
const DEV_EMAIL_LOGIN_PATH = "/v1/auth/dev-email-login"; // expects { email } => { token }

export default function Login() {
  const insets = useSafeAreaInsets();
  const {
    userToken,
    setUserToken,
    isLoading,
    setIsLoading,
    version,
    logout, // in case you want to clear on error
  } = useContext(AuthContext);

  const [email, setEmail] = useState("praneelbora@gmail.com");

  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isValidEmail = useMemo(() => {
    // simple but solid dev validation
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }, [email]);

  useEffect(() => {
    // if (isValidEmail) 
    // router.replace('/updateScreen')
    // handleSubmit();
  }, [email]);

  const handleSubmit = async () => {
    setTouched(true);
    setError("");
    if (!isValidEmail) return;

    try {
      setSubmitting(true);
      setIsLoading?.(true);

      const res = await mobileLogin(email.trim());
      if (res?.error) throw new Error(res.error);

      // Save in context if you keep token there too
      setUserToken?.(res.userToken);

      // If you care about first-time users:
      // if (res.newUser) router.replace("/onboarding");
      // else
      // router.replace("/dashboard");
      const response = await checkAppVersion(version, Platform.OS)
      if (response.outdated)
        router.replace({ pathname: 'updateScreen' });
      else
        router.replace({ pathname: 'dashboard' });

    } catch (e) {
      console.error(e);
      setError(e?.message || "Could not sign in with that email. Please try again.");
      logout?.(); // optional: clear any partial state
    } finally {
      setSubmitting(false);
      setIsLoading?.(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={{ width: "100%" }}
        contentContainerStyle={{ flexGrow: 1, width: "100%", justifyContent: "flex-end" }}
        keyboardShouldPersistTaps="handled"
      >
        {/* <Image
          style={[styles.bgImg, { marginTop: insets.top }]}
          resizeMode="contain"
          source={require("@/bg.png")}
        /> */}

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.container}
        >
          <View style={{ width: "100%", alignItems: "center" }}>
            <Text style={styles.logoFallback}>Expensease</Text>
            <View style={{width: "100%", alignItems: "center"}}>
            <Text style={styles.tagline}>Dev login — enter your email</Text>
            <Text style={styles.tagline}>Backend Server: {process.env.EXPO_PUBLIC_BACKEND_URL}</Text>
            <Text style={styles.tagline}>Version: {version}</Text>
            </View>
          </View>

          <View style={styles.form}>
            <TextInput
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (error) setError("");
              }}
              onBlur={() => setTouched(true)}
              placeholder="you@example.com"
              placeholderTextColor="#81827C99"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              inputMode="email"
              style={[
                styles.input,
                touched && !isValidEmail ? styles.inputError : null,
              ]}
              cursorColor="#EBF1D5"
              selectionColor="#EBF1D5CC"
            />

            {touched && !isValidEmail ? (
              <Text style={styles.helperText}>Enter a valid email address.</Text>
            ) : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleSubmit}
              disabled={!isValidEmail || submitting || isLoading}
              style={[
                styles.submitBtn,
                (!isValidEmail || submitting || isLoading) && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.submitText}>
                {submitting || isLoading ? "Signing in..." : "Continue"}
              </Text>
            </TouchableOpacity>

            {/* {(submitting || isLoading) && (
              <ActivityIndicator size="small" style={{ marginTop: 10 }} />
            )} */}
          </View>
        </KeyboardAvoidingView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "#171717",
  },
  container: {
    justifyContent: "space-around",
    height: "75%",
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  bgImg: {
    position: "absolute",
    top: 15,
    width: "100%",
  },
  logoFallback: {
    color: "#EBF1D5",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  tagline: {
    color: "#81827C",
    fontWeight: "400",
    fontSize: 16,
    paddingTop: 8,
  },
  form: {
    width: "90%",
    gap: 12,
    alignItems: "center",
  },
  input: {
    width: "100%",
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#55554F",
    backgroundColor: "#1E1E1E",
    color: "#EBF1D5",
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: "600",
  },
  inputError: {
    borderColor: "#ff6b6b",
  },
  helperText: {
    alignSelf: "flex-start",
    color: "#ffb3b3",
    fontSize: 12,
    marginTop: -6,
  },
  errorText: {
    alignSelf: "flex-start",
    color: "#ff6b6b",
    fontSize: 13,
  },
  submitBtn: {
    width: "100%",
    height: 56,
    borderRadius: 12,
    backgroundColor: "#1E1E1E",
    borderWidth: 1,
    borderColor: "#55554F",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  submitText: {
    color: "#EBF1D5",
    fontWeight: "700",
    fontSize: 16,
  },
});
