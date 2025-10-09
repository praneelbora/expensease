// components/header.js
import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Share,
    Platform,
    TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "context/ThemeProvider";
import { useAuth } from "context/AuthContext";
import { ChevronLeft, X, Bell, Filter, Search, Share2 } from "lucide-react-native";
import avatars from "@/avatars";
import UserIcon from "@/tabIcons/user.svg";

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
    showProfile
}) {
    const router = useRouter();
    const { theme } = useTheme();
    const { user } = useAuth();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const [selectedAvatar, setSelectedAvatar] = useState(user?.avatarId || null);
    const handleBack = () => {
        if (onBack) return onBack();
        if (router.canGoBack()) router.back();
        else router.replace("/home");
    };
    useEffect(() => {
        setSelectedAvatar(user?.avatarId || null)
    }, [user])
    function getInitials(name) {
        if (!name) return "";
        const parts = name.trim().split(" ").filter(Boolean);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    const handleClose = () => {
        if (onClose) return onClose();
        router.replace("/home");
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
                {showProfile && (
                    <TouchableOpacity
                        onPress={() => router.push('settings')}>
                        <View style={styles.avatarBorder}>
                            <View
                                style={[
                                    styles.avatarContainer,
                                    selectedAvatar ? { justifyContent: "flex-end" } : { justifyContent: "center" },
                                ]}
                            >
                                {selectedAvatar ? (
                                    (() => {
                                        const found = avatars.find((a) => a.id === selectedAvatar);
                                        const AvatarComp = found?.Component || null;
                                        return AvatarComp ? (
                                            <AvatarComp width={33} height={33} />
                                        ) : (
                                            <UserIcon size={26} color={theme.colors.muted} />
                                        );
                                    })()
                                ) : user?.name ? (
                                    <View style={[styles.placeholderCircle, { backgroundColor: theme.colors.card }]}>
                                        <Text style={[styles.placeholderText, { color: theme.colors.muted }]}>
                                            {getInitials(user?.name)}
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={[styles.placeholderCircle, { backgroundColor: theme.colors.card }]}>
                                        <UserIcon size={22} color={theme.colors.muted} />
                                    </View>
                                )}

                            </View>
                        </View>
                    </TouchableOpacity>
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
            height: 48,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
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
        avatarTouchable: {
            width: 52,
            height: 52,
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
        },
        avatarBorder: {
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 2,
            borderColor: theme.colors.cardAlt,
            alignItems: "center",
            justifyContent: "center",
        },
        avatarContainer: {
            width: 36,
            height: 36,
            borderRadius: 18,
            overflow: "hidden",
            alignItems: "center",
            backgroundColor: "transparent",
        },
        placeholderCircle: {
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
        },
        placeholderText: { fontSize: 18, fontWeight: "700" },
    });
