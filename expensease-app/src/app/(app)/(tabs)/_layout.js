// app/_layout.js
import React, { useMemo } from 'react';
import { Tabs } from "expo-router";
import {
    View,
    StyleSheet,
    Platform,
    DynamicColorIOS,
    Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "context/ThemeProvider";

import Dash from "@/tabIcons/dash.svg";
import Cog from "@/tabIcons/cog.svg";
import Plus from "@/tabIcons/plus.svg";
import User from "@/tabIcons/user.svg";
import Users from "@/tabIcons/users.svg";

import { NativeTabs, Label, Icon } from 'expo-router/unstable-native-tabs';

export default function TabsLayout() {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();

    // --- detect "iOS < 26" conservatively
    const isIos = Platform.OS === 'ios';
    // Platform.Version is number on Android, string or number on iOS — normalize
    const platformVersionNumber = (() => {
        const v = Platform.Version;
        if (typeof v === 'string') return parseFloat(v) || 0;
        if (typeof v === 'number') return v;
        return 0;
    })();
    const isIosLessThan26 = isIos && platformVersionNumber < 26;

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

    // Android: keep your JS Tabs implementation (unchanged)
    if (Platform.OS === 'android' || isIosLessThan26) {
        return (
            <Tabs initialRouteName="home" screenOptions={opts}>
                <Tabs.Screen
                    name="home"
                    options={{
                        title: "Home",
                        tabBarAccessibilityLabel: "Home",
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
                        title: "Settings",
                        tabBarAccessibilityLabel: "Settings",
                        tabBarIcon: ({ color, size }) => <Cog width={size} height={size} stroke={color} fill="none" />,
                    }}
                />
                <Tabs.Screen name="expenses" options={{ href: null, title: "Expenses" }} />
            </Tabs>
        );
    }

    // iOS branch
    const tintColor = DynamicColorIOS({ light: '#000', dark: '#fff' });

    // Height of the tab bar background to render for iOS < 26.
    // Keep it a bit taller to ensure full coverage on various devices.
    const tabBarBackgroundHeight = 56 + (insets.bottom || 0) + 8;

    return (
        <NativeTabs
            blurEffect={Platform.OS === 'ios' ? 'systemUltraThinMaterial' : undefined}
            labelStyle={{
                // For the text color
                color: DynamicColorIOS({
                    dark: theme.mode == 'dark' ? 'white' : 'black',
                    light: theme.mode == 'dark' ? 'white' : 'black',
                }),
                // For the selected icon color
                tintColor: DynamicColorIOS({
                    dark: theme.mode == 'dark' ? 'white' : 'black',
                    light: theme.mode == 'dark' ? 'white' : 'black',
                }),
            }}
            tintColor={tintColor}
        >
            <NativeTabs.Trigger name="home" >
                <Icon sf={{ default: 'house', selected: 'house.fill' }} />
                <Label>Home</Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="friends">
                <Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} />
                <Label>Friends</Label>
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="groups">
                <Icon sf={{ default: 'person.3', selected: 'person.3.fill' }} />
                <Label>Groups</Label>
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="settings">
                <Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
                <Label>Settings</Label>
            </NativeTabs.Trigger>

            {/* NOTE: no 'settings' trigger here — settings is a separate route */}
        </NativeTabs>
    );
}
