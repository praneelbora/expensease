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
import {
    ChevronLeft,
    X,
    Bell,
    Filter,
    Search,
    Share2,
} from "lucide-react-native";
// import { logEvent } from "../src/utils/analytics"; // adjust path if needed

// optionally swap with your SVG wordmark:
// import Logo from "@/logo.svg";

const FRONTEND_URL =
    process.env.EXPO_PUBLIC_FRONTEND_URL || "https://www.expensease.in";

/**
 * ExpenseaseHeader
 *
 * Props:
 * - title?: string                    // displayed when not in 'main' mode
 * - main?: boolean                    // brand mode (bigger title)
 * - showBack?: boolean                // show back chevron
 * - showClose?: boolean               // show close "X"
 * - onBack?: () => void               // custom back handler
 * - onClose?: () => void              // custom close handler
 * - showBell?: boolean                // show notifications icon
 * - onBellPress?: () => void
 * - showFilter?: boolean              // show filter icon
 * - onFilterPress?: () => void
 * - showSearch?: boolean              // show search icon
 * - onSearchPress?: () => void
 * - showShare?: boolean               // show share icon
 * - sharePayload?: {                  // constructs a friendly share message
 *     mode: "group" | "app" | "custom",
 *     groupName?: string,
 *     joinCode?: string,
 *     message?: string,               // used when mode === "custom"
 *   }
 * - rightExtras?: React.ReactNode     // anything else on the right (chips, counters)
 * - containerStyle?: any
 * - leftSlot?: React.ReactNode        // inject custom left content (e.g., avatar)
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
    filterBtnActive = false
}) {
    const router = useRouter();

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
                message = `Join my group on Expensease${sharePayload?.groupName ? ` — "${sharePayload.groupName}"` : ""
                    }.\n\nUse code: ${sharePayload.joinCode}\nOr tap the link:\n${link}`;
            } else if (sharePayload?.mode === "app") {
                message =
                    "I’m using Expensease to split expenses, track loans, and settle quickly. Join me: https://www.expensease.in";
            } else if (sharePayload?.mode === "custom" && sharePayload?.message) {
                message = sharePayload.message;
            } else {
                message = "Expensease";
            }

            // logEvent("share_click", { screen: "header", mode: sharePayload?.mode });
            await Share.share({
                title: "Share",
                message,
            });
        } catch {
            // no-op
        }
    };

    return (
        <View style={[styles.header, containerStyle]}>
            {/* Left cluster: back/close + title/brand */}
            <View style={styles.leftWrap}>
                {showClose ? (
                    <Pressable onPress={handleClose} hitSlop={10} style={styles.iconBtn}>
                        <X size={20} color="#EBF1D5" />
                    </Pressable>
                ) : showBack ? (
                    <Pressable onPress={handleBack} hitSlop={10} style={styles.iconBtn}>
                        <ChevronLeft size={22} color="#EBF1D5" />
                    </Pressable>
                ) : null}

                {leftSlot ? leftSlot : null}

                {main ? (
                    // swap this Text with your SVG Logo component if you have it
                    <Text style={styles.brand}>Expensease</Text>
                ) : (
                    !!title && <Text style={styles.title}>{title}</Text>
                )}
            </View>

            {/* Right cluster: actions */}
            <View style={styles.rightWrap}>
                {rightExtras}

                {showShare && (
                    <Pressable onPress={handleShare} hitSlop={10} style={styles.iconBtn}>
                        <Share2 size={18} color="#B8C4A0" />
                    </Pressable>
                )}

                {showFilter && (
                    <Pressable
                        onPress={onFilterPress}
                        hitSlop={10}
                        style={[
                            styles.iconBtn,
                            {
                                padding: 8,
                                borderRadius: 8,
                                borderWidth: filterBtnActive ? 1 : 0,
                                borderColor: filterBtnActive ? "#rgba(0,196,159,0.4)" : "transparent",
                                backgroundColor: filterBtnActive ? "transparent" : "transparent",
                            },
                        ]}

                    >
                        <Filter
                            size={18}
                            color={filterBtnActive ? "#00C49F" : "#B8C4A0"}
                        />

                    </Pressable>
                )}

                {showSearch && (
                    <Pressable
                        onPress={onSearchPress}
                        hitSlop={10}
                        style={styles.iconBtn}
                    >
                        <Search size={18} color="#B8C4A0" />
                    </Pressable>
                )}

                {showBell && (
                    <Pressable onPress={onBellPress} hitSlop={10} style={styles.iconBtn}>
                        <Bell size={18} color="#B8C4A0" />
                    </Pressable>
                )}
                {button ? button : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        backgroundColor: "transparent",
        width: "100%",
        height: 44,
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "space-between",
        borderBottomWidth: Platform.select({ ios: 0, android: 0.5 }),
        borderBottomColor: "#EBF1D5",
        paddingHorizontal: 16
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
    iconBtn: {
        padding: 0,
        borderRadius: 8
    },
    brand: {
        color: "#EBF1D5",
        fontSize: 24,
        fontWeight: "800",
        letterSpacing: -0.5,
    },
    title: {
        color: "#EBF1D5",
        fontWeight: "800",
        fontSize: 24,
        letterSpacing: -0.8,
        textShadowColor: "rgba(240, 255, 78, 0.25)",
        textShadowRadius: 8,
        textShadowOffset: { width: 0, height: 0 },
    },
});
