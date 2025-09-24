// app/_layout.js
import React from "react";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "context/AuthContext";

/**
 * This layout chooses which stack to render based on auth state:
 * - while bootstrap (!hydrated) -> show full-screen loader
 * - when hydrated:
 *    - if logged in (userToken && user) -> render Stack with (tabs) as the first screen
 *    - if NOT logged in -> render Stack with index (login) as the first screen
 *
 * By conditionally rendering the Stack we avoid mounting the login screen when the user is already authenticated.
 */

const RootLayout = () => {
    const { hydrated, authLoading, userToken, user } = useAuth();

    // show loader while bootstrap is running so we don't flash the wrong screen
    if (!hydrated || authLoading) {
        return (
            <>
                <StatusBar style={"light"} />
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                    <ActivityIndicator size="large" />
                </View>
            </>
        );
    }

    // If user is logged in and user data loaded, mount stack with (tabs) first
    if (userToken && user && !authLoading) {

        return (
            <>
                <StatusBar style={"light"} />
                <Stack
                    screenOptions={{
                        headerShown: false,
                    }}
                >
                    {/* (tabs) first so it becomes the visible screen immediately */}
                    <Stack.Screen name="(tabs)" options={{ title: "Home", headerShown: false }} />
                    <Stack.Screen name="updateScreen" options={{ title: "Update", headerShown: false }} />
                    <Stack.Screen name="index" options={{ title: "Login", headerShown: false }} />
                    <Stack.Screen name="completeProfile" options={{ title: "Complete Profile", headerShown: false }} />
                    <Stack.Screen name="terms" options={{ title: "Terms & privacy", headerShown: false }} />
                </Stack>
            </>
        );
    }

    // Otherwise (not logged in) mount stack with index (login) first
    return (
        <>
            <StatusBar style={"light"} />
            <Stack
                screenOptions={{
                    headerShown: false,
                }}
            >
                <Stack.Screen name="index" options={{ title: "Login", headerShown: false, animationTypeForReplace: "pop" }} />
                <Stack.Screen name="updateScreen" options={{ title: "Update", headerShown: false, animationTypeForReplace: "pop" }} />
                <Stack.Screen name="(tabs)" options={{ title: "Home", headerShown: false }} />
                <Stack.Screen name="terms" options={{ title: "Terms & privacy", headerShown: false, animationTypeForReplace: "pop" }} />
            </Stack>
        </>
    );
};

export default RootLayout;
