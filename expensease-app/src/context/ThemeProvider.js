// ThemeProvider.js
import React, { createContext, useContext, useEffect, useState } from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LightTheme, DarkTheme } from "../utils/theme";

const STORAGE_KEY = "user_theme_preference"; // "light" | "dark" | "system" (or null)
const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const systemScheme = Appearance.getColorScheme(); // "light" | "dark" | null
    const [preference, setPreference] = useState("system"); // system | light | dark
    const [theme, setTheme] = useState(systemScheme === "dark" ? DarkTheme : LightTheme);

    // load saved pref on mount
    useEffect(() => {
        (async () => {
            try {
                const saved = await AsyncStorage.getItem(STORAGE_KEY);
                if (saved) setPreference(saved);
            } catch (e) {
                console.warn("Failed to load theme preference", e);
            }
        })();
    }, []);

    // apply effective theme whenever preference or system changes
    useEffect(() => {
        const applyTheme = (pref, system) => {
            let effective = pref === "system" ? (system === "dark" ? "dark" : "light") : pref;
            setTheme(effective === "dark" ? DarkTheme : LightTheme);
        };

        applyTheme(preference, systemScheme);

        // listen to system changes
        const sub = Appearance.addChangeListener(({ colorScheme }) => {
            if (preference === "system") applyTheme(preference, colorScheme);
        });

        return () => sub.remove();
    }, [preference, systemScheme]);

    // helper to set and persist preference
    const setPreferenceAndPersist = async (pref) => {
        setPreference(pref);
        try {
            await AsyncStorage.setItem(STORAGE_KEY, pref);
        } catch (e) {
            console.warn("Failed to save theme preference", e);
        }
    };

    return (
        <ThemeContext.Provider value={{ theme, preference, setPreference: setPreferenceAndPersist }}>
            {children}
        </ThemeContext.Provider>
    );
};

// hook
export const useTheme = () => useContext(ThemeContext);
