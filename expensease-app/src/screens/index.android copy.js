// src/screens/Login.js
import React, { useEffect, useState } from "react";
import {
    StyleSheet,
    View,
    Text,
    TouchableOpacity,
    Platform,
    ActivityIndicator,
    InteractionManager,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// credential-manager imports (your path)
import { GoogleProvider, GoogleButtonProvider } from "android-credential-manager/build/loginProviders/LoginProviders";
import { CredentialManager } from "android-credential-manager";

const implicitProvider = new GoogleProvider({
    serverClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    authorizedAccountsOnly: false,
    autoSelect: false, // Auto select an authorized Google Account if there is only one

}); const explicitProvider = new GoogleButtonProvider({
    serverClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    authorizedAccountsOnly: false,
    autoSelect: false, // Auto select an authorized Google Account if there is only one
});

export default function Login() {
    const insets = useSafeAreaInsets();
    async function login(provider) {
        try {
            const ret = CredentialManager.loginWithGoogle(provider)
            console.log(ret)
        }
        catch (err) {console.log('Error: ', err)}
    }

    useEffect(() => {
        login(implicitProvider)
    }, [])

    return (
        <View style={[styles.wrapper, { paddingTop: (insets?.top || 0) + 20 }]}>

            <TouchableOpacity onPress={() => login(explicitProvider)}>
                <Text style={styles.buttonText}>Continue with Google</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        flex: 1,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
    },
    title: { fontSize: 22, fontWeight: "700", marginBottom: 16 },
    button: {
        width: "100%",
        height: 56,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#ddd",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
        marginTop: 12,
    },
    buttonText: { fontSize: 16, fontWeight: "700" },
    error: { color: "#ff4444", marginBottom: 12 },
});
