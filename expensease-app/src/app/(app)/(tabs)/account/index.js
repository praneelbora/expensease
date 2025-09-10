// app/account/index.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    UIManager,
    Platform,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";
import Header from "~/header";
import Guide from "@/accIcons/guide.svg";
import Logout from "@/accIcons/logout.svg";
import Payment from "@/accIcons/payment.svg";

import { allCurrencies } from "utils/currencies";

import { useAuth } from "context/AuthContext";
import { getAllExpenses } from "services/ExpenseService";
import { updateUserProfile, deleteAccount } from "services/UserService";
import SheetCurrencies from "~/shtCurrencies";

import { useTheme } from "context/ThemeProvider";

import avatars from "@/avatars";
import AvatarPickerSheet from "components/btmShtAvatar";

const TEST_MODE = process.env.EXPO_PUBLIC_TEST_MODE === "true";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

function calculateTotals(expenses, userId) {
    let totalOwe = 0;
    let totalPay = 0;
    (expenses || []).forEach((exp) => {
        const share = exp?.splits?.find((s) => s?.friendId?._id === userId);
        if (!share) return;
        if (share.owing) totalOwe += exp.typeOf === "expense" ? (share.oweAmount || 0) : 0;
        if (share.paying) totalPay += share.payAmount || 0;
    });
    return { balance: totalPay - totalOwe, expense: totalOwe };
}

function getInitials(name) {
    if (!name) return "";
    const parts = name.trim().split(" ").filter(Boolean);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default function AccountScreen() {
    const router = useRouter();
    const { logout, user, userToken, defaultCurrency, preferredCurrencies, setUser, loadUserData } = useAuth() || {};
    const { theme, preference, setPreference } = useTheme();

    const styles = useMemo(() => createStyles(theme), [theme]);

    // state
    const [dc, setDc] = useState(defaultCurrency || "");
    const [dcStatus, setDcStatus] = useState("idle");
    const [dcError, setDcError] = useState("");
    const [loading, setLoading] = useState(!user && !!userToken);
    const [totals, setTotals] = useState({ balance: 0, expense: 0 });
    const [banner, setBanner] = useState(null);

    // avatar state
    const [selectedAvatar, setSelectedAvatar] = useState(user?.avatarId || null);
    const [savingAvatar, setSavingAvatar] = useState(false);

    // refs
    const scrollerRef = useRef(null);
    const currencySheetRef = useRef(null);
    const avatarSheetRef = useRef(null);

    useEffect(() => setDc(defaultCurrency || ""), [defaultCurrency]);
    useFocusEffect(
        useCallback(() => {
            loadUserData()
            // optional cleanup when screen loses focus
            return () => {
            };
        }, [loadUserData])
    );


    // sync user avatar when user updates
    useEffect(() => {
        setSelectedAvatar(user?.avatarId || null);
    }, [user?.avatarId]);

    // fetch minimal totals
    const fetchExpenses = useCallback(async () => {
        try {
            const data = await getAllExpenses();
            setTotals(calculateTotals(data?.expenses || [], data?.id));
        } catch (e) {
            console.warn("Error loading expenses:", e?.message || e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchExpenses();
    }, [fetchExpenses]);

    const showBanner = (type, text, ms = 2000) => {
        setBanner({ type, text });
        setTimeout(() => setBanner(null), ms);
    };

    const saveCurrencyPrefs = async (curr) => {
        if (!curr) return;
        setDcStatus("saving");
        setDcError("");
        try {
            await updateUserProfile({ defaultCurrency: curr });
            setDc(curr);
            setDcStatus("saved");
            showBanner("success", "Default currency updated.", 2500);
            setTimeout(() => setDcStatus("idle"), 2000);
        } catch (e) {
            const msg = e?.message || "Failed to save currency";
            setDcStatus("error");
            setDcError(msg);
            showBanner("error", msg, 3000);
            setTimeout(() => {
                setDcStatus("idle");
                setDcError("");
            }, 3000);
        }
    };

    const onCopyEmail = async () => {
        if (!user?.email) return;
        await Clipboard.setStringAsync(user.email);
        showBanner("info", "Email copied.", 1500);
    };

    const onLogout = () => {
        Alert.alert("Logout", "Log out of Expensease?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Logout",
                style: "destructive",
                onPress: () => {
                    logout?.();
                },
            },
        ]);
    };

    const onDeleteAccount = async () => {
        Alert.alert(
            "Delete Account",
            "Delete your account permanently? This cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await deleteAccount();
                            router.replace("/");
                        } catch (e) {
                            showBanner("error", e?.message || "Failed to delete account.", 3000);
                        }
                    },
                },
            ]
        );
    };

    // theme preference helper (kept)
    const setThemePreference = (pref) => {
        setPreference(pref);
        showBanner(
            "info",
            `Theme: ${pref === "system" ? "System" : pref === "dark" ? "Dark" : "Light"}`,
            1200
        );
    };

    // currency options for sheet (small subset + rest)
    const currencyOptions = useMemo(() => {
        const base = new Set([defaultCurrency, ...(preferredCurrencies || [])]);
        return allCurrencies
            .filter((c) => base.has(c.code))
            .concat(allCurrencies.filter((c) => !base.has(c.code)))
            .map((c) => ({ value: c.code, label: `${c.name} (${c.symbol})`, code: c.code }));
    }, [defaultCurrency, preferredCurrencies]);

    // avatar save handler passed to sheet
    // inside AccountScreen.js

    // ---- REPLACE the above handleSaveAvatar with this implementation ----
    const AVATAR_COST = 1; // cost in coins to change avatar
    // Replace the existing handleSaveAvatar in app/account/index.js with this simplified version
    // (confirmation & coin-check moved into the sheet; this avoids asking twice)

    const handleSaveAvatar = async (id) => {
        if (!id) return;
        setSavingAvatar(true);

        try {
            // Server will perform atomic coin deduction & avatar set.
            // Client just sends the requested avatarId and updates local state on success.
            const res = await updateUserProfile({ avatarId: id });

            // If your updateUserProfile returns the updated user, use it to sync local context.
            // Otherwise fall back to setting the avatarId locally and reloading user data.
            const updatedUser = res?.user || res;

            if (updatedUser) {
                setSelectedAvatar(id);

                if (typeof setUser === "function") {
                    // prefer to update auth context with fresh server data if available
                    setUser((prev = {}) => {
                        // merge returned fields where present, but keep previous data as fallback
                        return {
                            ...prev,
                            avatarId: updatedUser.avatarId ?? id,
                            coins: typeof updatedUser.coins === "number" ? updatedUser.coins : prev.coins,
                            name: updatedUser.name ?? prev.name,
                            email: updatedUser.email ?? prev.email,
                            profilePic: updatedUser.profilePic ?? prev.profilePic,
                        };
                    });
                } else if (typeof loadUserData === "function") {
                    // fallback: reload full user data
                    try {
                        await loadUserData();
                    } catch (err) {
                        // ignore reload error; we've already updated avatar locally
                    }
                }
            } else {
                // if response shape is unexpected, still update local avatar to keep UI snappy
                setSelectedAvatar(id);
                if (typeof loadUserData === "function") {
                    try { await loadUserData(); } catch (_) { }
                }
            }

            showBanner("success", "Avatar updated.", 2000);
        } catch (e) {
            // server may return insufficient-coins or other errors -> surface to user
            const msg = e?.message || (e?.error || "Failed to save avatar.");
            showBanner("error", msg, 3000);
            throw e; // rethrow so caller (sheet) can react if needed
        } finally {
            setSavingAvatar(false);
        }
    };

    // open avatar sheet
    const openAvatarSheet = () => {
        // present method depends on your MainBottomSheet API; using present() per earlier snippets
        avatarSheetRef.current?.present?.();
    };

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <StatusBar style={theme.statusBarStyle === "dark-content" ? "dark" : "light"} />
            <Header title="Account" showCoins coins={user?.coins || 0} />
            <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
                <ScrollView ref={scrollerRef} style={styles.scroller} contentContainerStyle={{ paddingBottom: 24 }}>
                    {loading ? (
                        <View style={{ paddingTop: 16 }}>
                            <View style={styles.skeletonLine} />
                            <View style={[styles.skeletonLine, { width: "60%" }]} />
                            <View style={[styles.skeletonLine, { width: "40%" }]} />
                        </View>
                    ) : user || userToken ? (
                        <View style={{ gap: 12 }}>
                            {/* Account card */}
                            <View style={styles.cardBox}>
                                <View style={{ gap: 6 }}>
                                    <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            onPress={openAvatarSheet}
                                            style={styles.avatarTouchable}
                                        >
                                            <View style={styles.avatarBorder}>
                                                <View
                                                    /* dynamically center placeholder, bottom-align selected avatar */
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
                                                                <AvatarComp width={50} height={50} />
                                                            ) : (
                                                                <Text style={{ color: theme.colors.muted }}>—</Text>
                                                            );
                                                        })()
                                                    ) : (
                                                        <View style={[styles.placeholderCircle, { backgroundColor: theme.colors.card }]}>
                                                            <Text style={[styles.placeholderText, { color: theme.colors.muted }]}>
                                                                {getInitials(user?.name || "")}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                            </View>

                                            {/* pen badge bottom-right (always visible) */}
                                            <View style={[styles.penBadge, { backgroundColor: theme.colors.primary, borderColor: theme.colors.card }]}>
                                                <Feather name="edit" size={12} color={theme.mode === "dark" ? "#000" : "#fff"} />
                                            </View>
                                        </TouchableOpacity>


                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.strongText}>{user?.name || "—"}</Text>
                                            <View style={styles.rowBetween}>
                                                <View style={{ flex: 1, paddingRight: 8 }}>
                                                    <Text style={[styles.strongText2, { textTransform: "lowercase" }]} numberOfLines={1}>
                                                        {user?.email || "—"}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            </View>
                            {banner && (
                                <View
                                    style={[
                                        styles.banner,
                                        banner.type === "success" && styles.bannerSuccess,
                                        banner.type === "error" && styles.bannerError,
                                        banner.type === "info" && styles.bannerInfo,
                                    ]}
                                >
                                    <Text style={styles.bannerText}>{banner.text}</Text>
                                </View>
                            )}
                            <View style={{ marginTop: 0 }}>
                                <View style={styles.grid}>
                                    <TouchableOpacity style={styles.gridItem} activeOpacity={0.8} onPress={() => router.push("account/guide")}>
                                        <View style={styles.iconWrap}>
                                            <Guide width={30} height={30} stroke={theme.colors.primary} />
                                        </View>
                                        <Text style={styles.gridLabel}>Guide</Text>
                                    </TouchableOpacity>

                                    {/* Theme tile */}
                                    <TouchableOpacity style={styles.gridItem} activeOpacity={0.8} onPress={() => router.push("account/theme")}>
                                        <View style={styles.iconWrap}>
                                            <Feather name="sun" size={30} color={theme.colors.primary} />
                                        </View>
                                        <Text style={styles.gridLabel}>Theme</Text>
                                    </TouchableOpacity>

                                    {/* Notifications tile (new) */}
                                    <TouchableOpacity style={styles.gridItem} activeOpacity={0.8} onPress={() => router.push("account/notifications")}>
                                        <View style={styles.iconWrap}>
                                            <Feather name="bell" size={30} color={theme.colors.primary} />
                                        </View>
                                        <Text style={styles.gridLabel}>Notifications</Text>
                                    </TouchableOpacity>

                                    {/* Payment Accounts */}
                                    <TouchableOpacity style={styles.gridItem} activeOpacity={0.8} onPress={() => router.push("account/paymentAccounts")}>
                                        <View style={styles.iconWrap}>
                                            <Payment width={30} height={30} stroke={theme.colors.primary} />
                                        </View>
                                        <Text style={styles.gridLabel}>Payment Accounts</Text>
                                    </TouchableOpacity>

                                    {/* Currency tile */}
                                    <TouchableOpacity style={styles.gridItem} activeOpacity={0.8} onPress={() => router.push("account/currency")}>
                                        <View style={styles.iconWrap}>
                                            <Feather name="dollar-sign" size={30} color={theme.colors.primary} />
                                        </View>
                                        <Text style={styles.gridLabel}>Currency</Text>
                                    </TouchableOpacity>

                                    {/* FAQ tile */}
                                    <TouchableOpacity style={styles.gridItem} activeOpacity={0.8} onPress={() => router.push("account/faq")}>
                                        <View style={styles.iconWrap}>
                                            <Feather name="help-circle" size={30} color={theme.colors.primary} />
                                        </View>
                                        <Text style={styles.gridLabel}>FAQ</Text>
                                    </TouchableOpacity>

                                    {/* Privacy tile */}
                                    <TouchableOpacity style={styles.gridItem} activeOpacity={0.8} onPress={() => router.push("account/privacy")}>
                                        <View style={styles.iconWrap}>
                                            <Feather name="shield" size={30} color={theme.colors.primary} />
                                        </View>
                                        <Text style={styles.gridLabel}>Privacy</Text>
                                    </TouchableOpacity>

                                    {/* Contact tile */}
                                    <TouchableOpacity style={styles.gridItem} activeOpacity={0.8} onPress={() => router.push("account/contact")}>
                                        <View style={styles.iconWrap}>
                                            <Feather name="mail" size={30} color={theme.colors.primary} />
                                        </View>
                                        <Text style={styles.gridLabel}>Contact</Text>
                                    </TouchableOpacity>

                                    {/* Logout */}
                                    <TouchableOpacity style={styles.gridItem} activeOpacity={0.8} onPress={onLogout}>
                                        <View style={styles.iconWrap}>
                                            <Logout width={30} height={30} stroke={theme.colors.primary} />
                                        </View>
                                        <Text style={styles.gridLabel}>Logout</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {TEST_MODE ? (
                                <View style={[styles.cardBox, { borderColor: "#7a1f1f", borderWidth: 1, backgroundColor: "rgba(122,31,31,0.1)" }]}>
                                    <View style={styles.rowBetween}>
                                        <Text style={[styles.sectionLabel, { color: "#ff6b6b" }]}>Danger Zone</Text>
                                    </View>
                                    <TouchableOpacity onPress={onDeleteAccount} style={[styles.modalBtn, { borderColor: "#ff6b6b" }]} activeOpacity={0.8}>
                                        <Text style={[styles.modalBtnText, { color: "#ff6b6b" }]}>Delete Account</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : null}
                        </View>
                    ) : (
                        <Text style={[styles.mutedText, { padding: 16, color: "#ff8a8a" }]}>User not logged in.</Text>
                    )}

                    <SheetCurrencies innerRef={currencySheetRef} value={dc} options={currencyOptions} onSelect={setDc} onClose={(val) => saveCurrencyPrefs(val)} />
                </ScrollView>
            </View>

            {/* Avatar picker sheet */}
            <AvatarPickerSheet
                innerRef={avatarSheetRef}
                currentId={selectedAvatar}
                initialSelection={selectedAvatar}
                onSave={handleSaveAvatar}
                onClose={() => { }}
                userCoins={Number(user?.coins || 0)}
                cost={1}
            />
        </SafeAreaView>
    );
}

const createStyles = (theme) =>
    StyleSheet.create({
        safe: { flex: 1, backgroundColor: theme.colors.background },
        header: {
            paddingHorizontal: 16,
            paddingBottom: 10,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme.colors.border,
        },
        headerTitle: { color: theme.colors.text, fontSize: 24, fontWeight: "700" },

        scroller: { flex: 1 },

        banner: {
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.card,
        },
        bannerSuccess: { backgroundColor: "rgba(0,150,136,0.12)", borderColor: theme.colors.primary },
        bannerError: { backgroundColor: "rgba(244,67,54,0.12)", borderColor: "#f44336" },
        bannerInfo: { backgroundColor: "rgba(158,158,158,0.06)", borderColor: theme.colors.border },
        bannerText: { color: theme.colors.text },

        sectionLabel: { color: theme.colors.primary, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
        sectionLabelSmall: { color: theme.colors.muted, fontSize: 12, marginBottom: 6 },
        dividerV: { width: 1, height: 18, backgroundColor: theme.colors.border },

        cardBox: { gap: 8 },
        rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

        hintText: { color: theme.colors.muted, fontSize: 12 },
        strongText: { color: theme.colors.text, fontSize: 22, fontWeight: "700", textTransform: "capitalize" },
        strongText2: { color: theme.colors.text, fontSize: 16, fontWeight: "500", textTransform: "lowercase" },
        mutedText: { color: theme.colors.muted, fontSize: 13 },

        selectBtn: {
            backgroundColor: theme.colors.card,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderWidth: 1,
            borderColor: theme.colors.border,
            marginTop: 8,
        },
        selectBtnText: { color: theme.colors.text, fontSize: 15 },

        // Quick links grid
        grid: {
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: 'space-between',
            columnGap: 8,
            rowGap: 4,
            marginTop: 6,
        },
        gridItem: {
            width: "23%",
            alignItems: "center",
            marginBottom: 12,
        },
        iconWrap: {
            borderRadius: 12,
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 1,
            borderColor: "transparent",
            width: 56,
            height: 56,
            backgroundColor: theme.colors.background,
        },
        gridLabel: { color: theme.colors.text, fontSize: 12, textAlign: "center" },

        // avatar styles
        /* ---- ADD / UPDATE these style rules ---- */
        /* ---- MERGE / REPLACE these style rules in createStyles ---- */
        avatarTouchable: {
            width: 64,
            height: 64,
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
        },
        avatarBorder: {
            width: 64,
            height: 64,
            borderRadius: 32,
            borderWidth: 2,
            borderColor: theme.colors.card,
            alignItems: "center",
            justifyContent: "center",
        },
        avatarContainer: {
            width: 60,
            height: 60,
            borderRadius: 30,
            overflow: "hidden",
            alignItems: "center",
            backgroundColor: "transparent",
        },
        placeholderCircle: {
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
        },
        placeholderText: { fontSize: 18, fontWeight: "700" },
        penBadge: {
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.12,
            shadowRadius: 1,
            elevation: 2,
        },


        // Theme toggle
        themeToggleRow: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: theme.colors.background,
            borderRadius: 10,
            padding: 4,
        },
        themeToggleBtn: {
            flex: 1,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.card,
            marginHorizontal: 4,
        },
        themeToggleBtnActive: {
            backgroundColor: theme.colors.primary,
            borderColor: theme.colors.primary,
        },
        themeToggleText: {
            color: theme.colors.text,
            fontSize: 14,
            fontWeight: "600",
        },
        themeToggleTextActive: {
            color: theme.mode === "dark" ? "#000" : "#121212",
        },

        // Modal / option styles reused
        modalBtn: { backgroundColor: theme.colors.card, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, alignSelf: "flex-start", borderColor: theme.colors.border, borderWidth: 1 },
        modalBtnText: { color: theme.colors.text, fontWeight: "600" },
        optionRow: { backgroundColor: theme.colors.card, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

        // Skeletons
        skeletonLine: { height: 16, backgroundColor: theme.colors.card, borderRadius: 6, marginBottom: 8, width: "80%" },

        mutedText: { color: theme.colors.muted, fontSize: 13 },

        highlight: { borderWidth: 2, borderColor: theme.colors.primary },
    });
