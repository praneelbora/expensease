// app/_tabs.js  (or wherever your TabsLayout lives)
import React, { useMemo } from "react";
import { Tabs } from "expo-router";
import Dash from "@/tabIcons/dash.svg";
import Cog from "@/tabIcons/cog.svg";
import Plus from "@/tabIcons/plus.svg";
import User from "@/tabIcons/user.svg";
import Users from "@/tabIcons/users.svg";
import { View, StyleSheet, Platform } from "react-native";
import { useTheme } from "context/ThemeProvider";

export default function TabsLayout() {
    const { theme } = useTheme();

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
                            // subtle translucent top border using theme border color
                            borderTopColor: `${theme.colors.border}`,
                            marginTop: -5,
                        },
                    ]}
                />
            ),
            tabBarStyle: {
                borderTopWidth: 0,
                backgroundColor: theme.colors.background,
            },
            tabBarLabelStyle: {
                textAlign: "center",
                fontSize: 12,
                fontFamily: "SwitzerRegular",
            },
            tabBarInactiveTintColor: theme.colors.muted,
            tabBarActiveTintColor: theme.colors.primary,
        }),
        [theme]
    );

    return (
        <Tabs screenOptions={opts}>
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
                name="newExpense"
                options={{
                    title: "",
                    tabBarAccessibilityLabel: "New Expense",
                    tabBarIcon: ({ color, size, focused }) => (
                        <View
                            style={{
                                backgroundColor: focused ? theme.colors.primary : theme.colors.muted,
                                width: 60,
                                height: 35,
                                alignContent: "center",
                                alignItems: "center",
                                justifyContent: "center",
                                marginTop: 10,
                                borderRadius: 5,
                                // subtle elevation on iOS/Android
                                ...Platform.select({
                                    ios: { shadowColor: "#000", shadowOpacity: focused ? 0.12 : 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
                                    android: { elevation: focused ? 4 : 1 },
                                }),
                            }}
                        >
                            <Plus width={30} height={30} strokeWidth={3} stroke={theme.mode === "dark" ? "#000" : "#fff"} />
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="dashboard"
                options={{
                    title: "Dashboard",
                    tabBarAccessibilityLabel: "Dashboard",
                    tabBarIcon: ({ color, size }) => <Dash width={size} height={size} stroke={color} fill="none" />,
                }}
            />
            <Tabs.Screen
                name="account"
                options={{
                    title: "Account",
                    tabBarAccessibilityLabel: "Account",
                    tabBarIcon: ({ color, size }) => <Cog width={size} height={size} stroke={color} fill="none" />,
                }}
            />
            <Tabs.Screen name="expenses" options={{ href: null, title: "Expenses" }} />
        </Tabs>
    );
}
