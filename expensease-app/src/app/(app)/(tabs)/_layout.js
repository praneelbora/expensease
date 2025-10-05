// app/_tabs.js
import React, { useMemo } from "react";
import { Tabs } from "expo-router";
import { View, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "context/ThemeProvider";

import Dash from "@/tabIcons/dash.svg";
import Cog from "@/tabIcons/cog.svg";
import Plus from "@/tabIcons/plus.svg";
import User from "@/tabIcons/user.svg";
import Users from "@/tabIcons/users.svg";

export default function TabsLayout() {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();

    const opts = useMemo(
        () => ({
            headerShown: false,
            sceneContainerStyle: { backgroundColor: theme.colors.background },
            tabBarShowLabel: true,
            tabBarBackground: () => (
                <View
                    style={[
                        StyleSheet.absoluteFillObject,
                        {
                            backgroundColor: theme.colors.background,
                            borderTopWidth: Platform.OS === "android" ? 1 : 0.5,
                            borderTopColor: theme.colors.border,
                            marginTop: -5,
                        },
                    ]}
                />
            ),
            tabBarStyle: {
                borderTopWidth: 0,
                backgroundColor: theme.colors.background,
                paddingHorizontal: 4,
                paddingBottom: Platform.OS === "android" ? (insets.bottom || 8) + 6 : insets.bottom || 6,
                height: 52 + (Platform.OS === "android" ? (insets.bottom || 8) : (insets.bottom || 0)),
            },
            tabBarLabelStyle: {
                textAlign: "center",
                fontSize: 12,
                fontFamily: "SwitzerRegular",
            },
            tabBarInactiveTintColor: theme.colors.muted,
            tabBarActiveTintColor: theme.colors.primary,
        }),
        [theme, insets]
    );


    return (
        <Tabs initialRouteName="home" screenOptions={opts}>
            <Tabs.Screen
                name="home"
                options={{
                    title: "Home",
                    tabBarAccessibilityLabel: "home",
                    tabBarIcon: ({ color, size }) => <Dash width={size} height={size} stroke={color} fill="none" />,
                }}
            />
            <Tabs.Screen
                name="friends"
                options={{
                    title: "Friends",
                    tabBarAccessibilityLabel: "Friends",
                    tabBarIcon: ({ color, size }) => <User width={size} height={size} stroke={color} fill="none" />,
                }}
            />
            <Tabs.Screen
                name="groups"
                options={{
                    title: "Groups",
                    tabBarAccessibilityLabel: "Groups",
                    tabBarIcon: ({ color, size }) => <Users width={size} height={size} stroke={color} fill="none" />,
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    href: null,
                    title: "Settings",
                    tabBarAccessibilityLabel: "Settings",
                    tabBarIcon: ({ color, size }) => <Cog width={size} height={size} stroke={color} fill="none" />,
                }}
            />
        </Tabs>
    );
}
