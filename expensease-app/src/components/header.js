// components/header.js
import React from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Share,
    Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "context/ThemeProvider";
import { ChevronLeft, X, Bell, Filter, Search, Share2 } from "lucide-react-native";

const FRONTEND_URL = process.env.EXPO_PUBLIC_FRONTEND_URL || "https://www.expensease.in";

/**
 * Props same as before; only visual tokens are pulled from theme.
 */
export default function Header({
    title = "",
    main = false,
    showBack = false,
    showClose = false,
    onBack,
    onClose,
    showBell = false,
    onBellPress,
    showFilter = false,
    onFilterPress,
    showSearch = false,
    onSearchPress,
    showShare = false,
    sharePayload,
    rightExtras,
    containerStyle,
    leftSlot,
    button,
    filterBtnActive = false,
    showText,
    onTextPress,
}) {
    const router = useRouter();
    const { theme } = useTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    const handleBack = () => {
        if (onBack) return onBack();
        if (router.canGoBack()) router.back();
        else router.replace("/dashboard");
    };

    const handleClose = () => {
        if (onClose) return onClose();
        router.replace("/dashboard");
    };

    const handleShare = async () => {
        try {
            let message = "";
            if (sharePayload?.mode === "group" && sharePayload?.joinCode) {
                const link = `${FRONTEND_URL}/groups?join=${sharePayload.joinCode}`;
                message = `Join my group on Expensease${sharePayload?.groupName ? ` — "${sharePayload.groupName}"` : ""}.\n\nUse code: ${sharePayload.joinCode}\nOr tap the link:\n${link}`;
            } else if (sharePayload?.mode === "app") {
                message = "I’m using Expensease to split expenses, track loans, and settle quickly. Join me: https://www.expensease.in";
            } else if (sharePayload?.mode === "custom" && sharePayload?.message) {
                message = sharePayload.message;
            } else {
                message = "Expensease";
            }
            await Share.share({ title: "Share", message });
        } catch {
            // ignore
        }
    };

    return (
        <View style={[styles.header, containerStyle]}>
            {/* Left cluster */}
            <View style={styles.leftWrap}>
                {showClose ? (
                    <Pressable onPress={handleClose} hitSlop={10} style={styles.iconBtn}>
                        <X size={20} color={theme.colors.text} />
                    </Pressable>
                ) : showBack ? (
                    <Pressable onPress={handleBack} hitSlop={10} style={styles.iconBtn}>
                        <ChevronLeft size={22} color={theme.colors.text} />
                    </Pressable>
                ) : null}

                {leftSlot ? leftSlot : null}

                {main ? (
                    <Text style={styles.brand}>Expensease</Text>
                ) : (
                    !!title && <Text style={styles.title}>{title}</Text>
                )}
            </View>

            {/* Right cluster */}
            <View style={styles.rightWrap}>
                {rightExtras}

                {showShare && (
                    <Pressable onPress={handleShare} hitSlop={10} style={styles.iconBtn}>
                        <Share2 size={18} color={theme.colors.muted} />
                    </Pressable>
                )}

                {showFilter && (
                    <Pressable
                        onPress={onFilterPress}
                        hitSlop={10}
                        style={[
                            styles.iconBtn,
                            styles.filterBtn,
                            filterBtnActive && styles.filterBtnActive,
                        ]}
                    >
                        <Filter size={18} color={theme.colors.text} />
                    </Pressable>
                )}

                {showSearch && (
                    <Pressable onPress={onSearchPress} hitSlop={10} style={styles.iconBtn}>
                        <Search size={18} color={theme.colors.muted} />
                    </Pressable>
                )}

                {showBell && (
                    <Pressable onPress={onBellPress} hitSlop={10} style={styles.iconBtn}>
                        <Bell size={18} color={theme.colors.muted} />
                    </Pressable>
                )}
                {showText && (
                    <Pressable onPress={onTextPress} hitSlop={10} style={styles.iconBtn}>
                        <Text style={{ color: theme.colors.text, fontWeight: '700', letterSpacing: 0.5 }}>{showText}</Text>
                    </Pressable>
                )}

                {button ? button : null}
            </View>
        </View>
    );
}

const createStyles = (theme) =>
    StyleSheet.create({
        header: {
            backgroundColor: "transparent",
            width: "100%",
            height: 44,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
            borderBottomWidth: Platform.select({ ios: 0, android: 0.5 }),
            borderBottomColor: theme.colors.border,
            paddingHorizontal: 16,
        },
        leftWrap: {
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            overflow: "hidden",
            flexShrink: 1,
        },
        rightWrap: {
            flexDirection: "row-reverse",
            alignItems: "center",
            gap: 16,
            height: "100%",
        },
        filterBtn: {
            padding: 8,
            borderRadius: 8,
            borderWidth: 0.5,
            borderColor: "#00000088",
            backgroundColor: "transparent",
        },
        filterBtnActive: {
            borderWidth: 1,
            borderColor: `${theme.colors.primary}`, // subtle alpha
            backgroundColor: `${theme.colors.primary}44`, // subtle alpha
        },
        brand: {
            color: theme.colors.text,
            fontSize: 24,
            fontWeight: "800",
            letterSpacing: -0.5,
        },
        title: {
            color: theme.colors.text,
            fontWeight: "800",
            fontSize: 24,
            letterSpacing: -0.6,
            textShadowColor: theme.mode === "dark" ? "rgba(0,0,0,0.25)" : "rgba(240,255,78,0.08)",
            textShadowRadius: 6,
            textShadowOffset: { width: 0, height: 0 },
        },
    });
