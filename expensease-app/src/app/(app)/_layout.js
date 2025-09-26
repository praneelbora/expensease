// app/_layout.js
import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Stack, SplashScreen as RouterSplashScreen } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "context/AuthContext";

/* call early so native splash doesn't auto-hide */
(async () => {
  try {
    await RouterSplashScreen?.preventAutoHideAsync?.();
  } catch (e) {
    console.warn("preventAutoHideAsync failed:", e);
  }
})();

const RootLayout = () => {
  const { hydrated, authLoading, userToken, user } = useAuth();

  // local stable state: set once when we know initial auth, then update on real auth changes only
  const [initialAuthChecked, setInitialAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Hide splash once bootstrap finished (same as before)
  useEffect(() => {
    if (!hydrated || authLoading) return;

    (async () => {
      try {
        await RouterSplashScreen?.hideAsync?.();
      } catch (e) {
        console.warn("hideAsync failed:", e);
      }
    })();
  }, [hydrated, authLoading]);

  // When hydration completes for the first time, capture a stable initial auth decision
  useEffect(() => {
    if (!hydrated) return;

    const loggedIn = Boolean(userToken && user);
    setIsAuthenticated(loggedIn);
    setInitialAuthChecked(true);
    // Note: we intentionally don't early-return here — later effects will update isAuthenticated on real auth changes
  }, [hydrated]); // only run once when hydrated becomes true

  // After initial check, keep isAuthenticated in sync with real auth changes (login/logout)
  useEffect(() => {
    if (!initialAuthChecked) return;
    setIsAuthenticated(Boolean(userToken && user));
  }, [initialAuthChecked, userToken, user]);

  // While auth bootstrap running (or we haven't captured initial auth) -> keep splash / show fallback loader
  if (!hydrated || authLoading || !initialAuthChecked) {
    return (
      <>
        <StatusBar style="light" />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" }}>
          <ActivityIndicator size="large" />
        </View>
      </>
    );
  }

  // ---------------- Authenticated Stack ----------------
  if (isAuthenticated) {
    console.log("auth");
    return (
      <>
        <StatusBar style="light" />
        <Stack
          screenOptions={{ headerShown: false }}
          initialRouteName="(tabs)"
        >
          {/* only include screens relevant to logged-in flow */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="updateScreen" options={{ headerShown: false }} />
          <Stack.Screen name="completeProfile" options={{ headerShown: false }} />
          <Stack.Screen name="terms" options={{ headerShown: false }} />
        </Stack>
      </>
    );
  }

  // ---------------- Unauthenticated Stack ----------------
  console.log("unauth");
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{ headerShown: false }}
        initialRouteName="index"
      >
        {/* only include login / onboarding screens; no (tabs) here so it won't mount */}
        <Stack.Screen name="index" options={{ headerShown: false, animationTypeForReplace: "pop" }} />
        <Stack.Screen name="updateScreen" options={{ headerShown: false, animationTypeForReplace: "pop" }} />
        <Stack.Screen name="terms" options={{ headerShown: false, animationTypeForReplace: "pop" }} />
      </Stack>
    </>
  );
};

export default RootLayout;
