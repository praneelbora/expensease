// app/settings/index.js
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
    Modal,
    TextInput,
    ActivityIndicator,
} from "react-native";
import * as Application from "expo-application";
import { checkAppVersion } from "services/UserService";
import * as Linking from "expo-linking";

import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import Header from "~/header";

import Guide from "@/accIcons/guide.svg";
import Logout from "@/accIcons/logout.svg";
import Payment from "@/accIcons/payment.svg";
import Contact from "@/accIcons/contact.svg";
import Instagram from "@/accIcons/instagram.svg";
import Privacy from "@/accIcons/privacy.svg";
import FAQ from "@/accIcons/faq.svg";
import Sun from "@/accIcons/sun.svg";
import Bell from "@/accIcons/bell.svg";
import Edit from "@/accIcons/edit.svg";
import Currency from "@/accIcons/currency.svg";
import LinkIcon from "@/accIcons/link.svg"; // New icon for Linked Accounts

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

    const { logout, user, userToken, defaultCurrency, preferredCurrencies, setUser, loadUserData, version } = useAuth() || {};
    const { theme } = useTheme();

    const styles = useMemo(() => createStyles(theme), [theme]);
    const isIos = Platform.OS === 'ios';
    const platformVersionNumber = typeof Platform.Version === 'string'
        ? parseFloat(Platform.Version) || 0
        : (typeof Platform.Version === 'number' ? Platform.Version : 0);
    const isIosLessThan26 = isIos && platformVersionNumber < 26;

    // state
    const [dc, setDc] = useState(defaultCurrency || "");
    const [dcStatus, setDcStatus] = useState("idle");
    const [dcError, setDcError] = useState("");
    const [loading, setLoading] = useState(!user && !!userToken);
    const [totals, setTotals] = useState({ balance: 0, expense: 0 });
    const [banner, setBanner] = useState(null);

    const [selectedAvatar, setSelectedAvatar] = useState(user?.avatarId || null);
    const [savingAvatar, setSavingAvatar] = useState(false);

    const [updateInfo, setUpdateInfo] = useState(null);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [updateNotes, setUpdateNotes] = useState(null);

    const [showEditNameModal, setShowEditNameModal] = useState(false);
    const [editNameValue, setEditNameValue] = useState(user?.name || "");
    const [savingName, setSavingName] = useState(false);
    const [nameError, setNameError] = useState("");

    // refs
    const scrollerRef = useRef(null);
    const currencySheetRef = useRef(null);
    const avatarSheetRef = useRef(null);

    useEffect(() => setDc(defaultCurrency || ""), [defaultCurrency]);

    useEffect(() => {
        if (typeof loadUserData === "function") {
            loadUserData().catch(() => { });
        }
    }, []);

    useEffect(() => {
        setSelectedAvatar(user?.avatarId || null);
    }, [user?.avatarId]);

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

    const openEditName = () => {
        setEditNameValue(user?.name || "");
        setNameError("");
        setShowEditNameModal(true);
    };
    const closeEditName = () => {
        setShowEditNameModal(false);
        setNameError("");
        setEditNameValue(user?.name || "");
    };
    const saveName = async () => {
        const val = (editNameValue || "").trim();
        if (val.length < 2) {
            setNameError("Name must be at least 2 characters");
            return;
        }
        setSavingName(true);
        setNameError("");
        try {
            const res = await updateUserProfile({ name: val });
            const updatedUser = res?.user || res;
            if (typeof setUser === "function") {
                setUser((prev = {}) => ({ ...prev, name: updatedUser?.name ?? val }));
            } else if (typeof loadUserData === "function") {
                await loadUserData().catch(() => { });
            }
            showBanner("success", "Name updated.", 2000);
            setShowEditNameModal(false);
        } catch (e) {
            const msg = e?.message || "Failed to save name";
            setNameError(msg);
            showBanner("error", msg, 3000);
        } finally {
            setSavingName(false);
        }
    };

    const handleDoUpdate = async () => {
        // try to get store url from admin payload, else fallback to placeholder
        try {
            const admin = await fetchAdminVersionPayload();
            const storeUrl = Platform.OS === "ios"
                ? (admin?.iosStoreUrl || admin?.iosStoreUrlFallback)
                : (admin?.androidStoreUrl || admin?.androidStoreUrlFallback);

            // if releaseNotes exist, show them in modal (quick)
            if (admin?.releaseNotes) setUpdateNotes(admin.releaseNotes);

            const url = updateInfo?.updateURL || 'https://www.expensease.in';
            const opened = await Linking.openURL(url).catch((e) => {
                console.warn("Failed to open store url:", e);
                Alert.alert("Unable to open store", "Please update your app from the App Store / Play Store.");
            });

            // If you use expo-updates and support OTA updates you could attempt to fetch + apply here.
            // For now we just open the store.
        } catch (err) {
            console.warn("handleDoUpdate error:", err);
            Alert.alert("Update", "Could not find update link. Please check the store.");
        }
    };

    const onLogout = () => {
        Alert.alert("Logout", "Log out of Expensease?", [
            { text: "Cancel", style: "cancel" },
            { text: "Logout", style: "destructive", onPress: () => logout?.() },
        ]);
    };

    const onDeleteAccount = async () => {
        Alert.alert("Delete Account", "Delete your account permanently? This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive", onPress: async () => {
                    try {
                        await deleteAccount();
                        router.replace("/");
                    } catch (e) {
                        showBanner("error", e?.message || "Failed to delete account.", 3000);
                    }
                }
            }
        ]);
    };

    const currencyOptions = useMemo(() => {
        const base = new Set([defaultCurrency, ...(preferredCurrencies || [])]);
        return allCurrencies
            .filter((c) => base.has(c.code))
            .concat(allCurrencies.filter((c) => !base.has(c.code)))
            .map((c) => ({ value: c.code, label: `${c.name} (${c.symbol})`, code: c.code }));
    }, [defaultCurrency, preferredCurrencies]);

    const AVATAR_COST = 1;
    const handleSaveAvatar = async (id) => {
        if (!id) return;
        setSavingAvatar(true);
        try {
            const res = await updateUserProfile({ avatarId: id });
            const updatedUser = res?.user || res;
            if (updatedUser && typeof setUser === "function") {
                setUser((prev = {}) => ({
                    ...prev,
                    avatarId: updatedUser.avatarId ?? id,
                    coins: typeof updatedUser.coins === "number" ? updatedUser.coins : prev.coins,
                }));
            }
            setSelectedAvatar(id);
            showBanner("success", "Avatar updated.", 2000);
        } finally {
            setSavingAvatar(false);
        }
    };

    const openAvatarSheet = () => avatarSheetRef.current?.present?.();

    useEffect(() => {
        (async () => {
            try {
                const OS = Platform.OS === "ios" ? "ios" : "android";
                const result = await checkAppVersion(version, OS);
                setUpdateInfo(result || { outdated: false, underReview: false });
                if (result?.outdated) setShowUpdateModal(true);
            } catch (err) {
                console.warn("Version check failed:", err);
            }
        })();
    }, []);

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <StatusBar style={theme.statusBarStyle === "dark-content" ? "dark" : "light"} />
            {!isIos && <Header showBack />}

            <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
                {/* User Card pinned */}
                <View style={{ gap: 12 }}>
                    <View style={{ flexDirection: "row", gap: 16, marginBottom: 14, alignItems: "center", }}>
                        <TouchableOpacity activeOpacity={0.8} onPress={openAvatarSheet} style={styles.avatarTouchable}>
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
                                            return AvatarComp ? <AvatarComp width={58} height={58} /> : <Text style={{ color: theme.colors.muted }}>—</Text>;
                                        })()
                                    ) : (
                                        <View style={[styles.placeholderCircle, { backgroundColor: theme.colors.card }]}>
                                            <Text style={[styles.placeholderText, { color: theme.colors.muted }]}>{getInitials(user?.name || "")}</Text>
                                        </View>
                                    )}
                                </View>
                            </View>

                            <View style={[styles.penBadge, { backgroundColor: theme.colors.primary, borderColor: theme.colors.card }]}>
                                <Edit width={12} height={12} stroke={theme.colors.background} />
                            </View>
                        </TouchableOpacity>

                        <View style={{ flex: 1 }}>
                            <TouchableOpacity onPress={openEditName} activeOpacity={0.85}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text style={styles.strongText}>{user?.name || "—"}</Text>
                                    <View style={{ marginLeft: 6 }}>
                                        <Edit width={16} height={16} stroke={theme.colors.muted} />
                                    </View>
                                </View>
                            </TouchableOpacity>
                            <View>
                                {user?.email && <Text style={[styles.strongText2, { textTransform: "lowercase" }]} numberOfLines={1}>
                                    {user?.email}
                                </Text>}
                                {user?.phone && <Text style={[styles.strongText2, { textTransform: "lowercase" }]} numberOfLines={1}>
                                    {user?.phone}
                                </Text>}
                            </View>
                        </View>
                    </View>
                </View>
                {!updateInfo?.isNewUpdateAvailable ? (
                    <TouchableOpacity
                        style={{
                            backgroundColor: theme.colors.primary,
                            padding: 10,
                            borderRadius: 8,
                            marginVertical: 8,
                        }}
                        onPress={() => setShowUpdateModal(true)}
                    >
                        <Text style={{ color: theme.colors.background, fontWeight: "700" }}>Update available</Text>
                    </TouchableOpacity>
                ) : null}
                {(!user?.phone || (user?.email == user?.appleEmail)) && <TouchableOpacity
                    onPress={() => router.push("settings/link")}
                    style={{
                        marginBottom: 8,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderRadius: 10,
                        backgroundColor: theme.colors.card,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        alignItems: "center",
                    }}
                    activeOpacity={0.8}
                >
                    <Text style={{ color: theme.colors.text, fontWeight: "700", fontSize: 18 }}>
                        Link Your Phone & Email
                    </Text>
                    <Text style={{ color: theme.colors.muted, fontSize: 14, marginTop: 6, textAlign: 'center' }}>
                        Connect phone number and email to use Expensease across devices.
                        Linked accounts help login faster and make it easier for your friends to add you.
                    </Text>


                </TouchableOpacity>}

                {/* Scrollable list of items */}
                <ScrollView ref={scrollerRef} style={styles.scroller} contentContainerStyle={{ paddingBottom: 100 }}>
                    {[
                        { label: "Payment Accounts", icon: <Payment width={24} height={24} stroke={theme.colors.primary} />, onPress: () => router.push("settings/paymentAccounts") },
                        { label: "Linked Accounts", icon: <LinkIcon width={24} height={24} stroke={theme.colors.primary} />, onPress: () => router.push("settings/link") },
                        { label: "Currency", icon: <Currency width={24} height={24} stroke={theme.colors.primary} />, onPress: () => router.push("settings/currency") },
                        { label: "Guide", icon: <Guide width={24} height={24} stroke={theme.colors.primary} />, onPress: () => router.push("settings/guide") },
                        { label: "Theme", icon: <Sun width={24} height={24} stroke={theme.colors.primary} />, onPress: () => router.push("settings/theme") },
                        { label: "Notifications", icon: <Bell width={24} height={24} stroke={theme.colors.primary} />, onPress: () => router.push("settings/notifications") },
                        { label: "Instagram", icon: <Instagram width={24} height={24} stroke={theme.colors.primary} />, onPress: () => Linking.openURL("https://www.instagram.com/_expensease") },
                        { label: "FAQ", icon: <FAQ width={24} height={24} stroke={theme.colors.primary} />, onPress: () => router.push("settings/faq") },
                        { label: "Contact", icon: <Contact width={24} height={24} stroke={theme.colors.primary} />, onPress: () => router.push("settings/contact") },
                        { label: "Privacy", icon: <Privacy width={24} height={24} stroke={theme.colors.primary} />, onPress: () => router.push("settings/privacy") },
                        { label: "Logout", icon: <Logout width={24} height={24} stroke={theme.colors.negative} />, onPress: onLogout },
                    ].map((item, idx) => (
                        <TouchableOpacity key={idx} style={styles.optionRow} onPress={item.onPress}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                                {item.icon}
                                <Text style={{ color: theme.colors.text, fontSize: 16 }}>{item.label}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
            <AvatarPickerSheet
                innerRef={avatarSheetRef}
                currentId={selectedAvatar}
                initialSelection={selectedAvatar}
                onSave={handleSaveAvatar}
                onClose={() => { }}
                userCoins={Number(user?.coins || 0)}
                cost={AVATAR_COST}
            />
            <Modal visible={showEditNameModal} transparent animationType="fade" onRequestClose={closeEditName}>
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)" }}>
                    <View style={{ width: "92%", backgroundColor: theme.colors.card, borderRadius: 12, padding: 16 }}>
                        <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.text }}>Edit name</Text>
                        <View style={{ marginTop: 12 }}>
                            <TextInput
                                value={editNameValue}
                                onChangeText={(t) => setEditNameValue(t)}
                                placeholder="Your name"
                                placeholderTextColor={theme.colors.muted}
                                style={{
                                    height: 44,
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    borderColor: "#E6EEF8",
                                    paddingHorizontal: 12,
                                    color: theme.colors.text,
                                    backgroundColor: theme.colors.background,
                                }}
                                autoCapitalize="words"
                                editable={!savingName}
                            />
                            <Text style={{ marginTop: 8, color: theme.colors.muted }}>This will be visible to friends.</Text>
                            {nameError ? <Text style={{ color: "#F43F5E", marginTop: 8 }}>{nameError}</Text> : null}
                        </View>

                        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 14 }}>
                            <TouchableOpacity onPress={closeEditName} style={{ padding: 8 }}>
                                <Text style={{ color: theme.colors.text }}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={saveName}
                                style={{
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                    backgroundColor: theme.colors.primary,
                                    borderRadius: 8,
                                    marginLeft: 8,
                                    opacity: savingName ? 0.7 : 1,
                                }}
                                disabled={savingName}
                            >
                                {savingName ? <ActivityIndicator color="#fff" /> : <Text style={{ color: theme.colors.background, fontWeight: "700" }}>Save</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
            <Modal visible={showUpdateModal} transparent animationType="fade" onRequestClose={() => setShowUpdateModal(false)}>
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)" }}>
                    <View style={{ width: "92%", backgroundColor: theme.colors.card, borderRadius: 12, padding: 16 }}>
                        <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.text }}>Update available</Text>
                        <Text style={{ marginTop: 8, color: theme.colors.muted }}>
                            {updateNotes || "A new version of the app is available. Please update to get the latest features and fixes."}
                        </Text>

                        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 12 }}>
                            <TouchableOpacity onPress={() => setShowUpdateModal(false)} style={{ padding: 8 }}>
                                <Text style={{ color: theme.colors.text }}>Later</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={async () => {
                                    await handleDoUpdate();
                                }}
                                style={{
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                    backgroundColor: theme.colors.primary,
                                    borderRadius: 8,
                                    marginLeft: 8,
                                }}
                            >
                                <Text style={{ color: theme.colors.background, fontWeight: "700" }}>Update</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const createStyles = (theme) =>
    StyleSheet.create({
        safe: { flex: 1, backgroundColor: theme.colors.background },
        scroller: { flex: 1 },
        strongText: { color: theme.colors.text, fontSize: 22, fontWeight: "700" },
        strongText2: { color: theme.colors.muted, fontSize: 14 },

        avatarTouchable: {
            width: 72,
            height: 72,
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
        },
        avatarBorder: {
            width: 72,
            height: 72,
            borderRadius: 36,
            borderWidth: 2,
            borderColor: theme.colors.card,
            alignItems: "center",
            justifyContent: "center",
        },
        avatarContainer: {
            width: 68,
            height: 68,
            borderRadius: 34,
            overflow: "hidden",
            alignItems: "center",
            backgroundColor: "transparent",
        },
        placeholderCircle: {
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: "center",
            justifyContent: "center",
        },
        placeholderText: { fontSize: 18, fontWeight: "700" },
        penBadge: { position: "absolute", right: -6, bottom: -6, width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2 },
        optionRow: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 14,
            paddingHorizontal: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme.colors.border,
        },
    });
