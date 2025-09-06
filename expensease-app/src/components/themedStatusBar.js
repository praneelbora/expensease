// components/themedStatusBar.js
import React from "react";
import { StatusBar as RNStatusBar, Platform } from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { useTheme } from "context/ThemeProvider";

export default function ThemedStatusBar() {
    const { theme } = useTheme();
    // expo-status-bar expects "light" | "dark"
    const expoStyle = theme?.statusBarStyle === "dark-content" ? "dark" : "light";

    return (
        <>
            <ExpoStatusBar style={expoStyle} />
            {/* On Android set the background color so the bar matches your theme */}
            <RNStatusBar
                barStyle={theme?.statusBarStyle || "light-content"}
                backgroundColor={theme?.colors?.background || "#000"}
                translucent={false}
            />
        </>
    );
}
