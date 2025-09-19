// app/account/currency.js
import React, { useMemo, useState, useEffect } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    FlatList,
    Alert,
    ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import Currency from "@/accIcons/currency.svg"; // Example SVG import
import Check from "@/accIcons/check.svg"; // Example SVG import
import Header from "~/header";
import SearchBar from "~/searchBar";
import { useTheme } from "context/ThemeProvider";
import { useAuth } from "context/AuthContext";
import { allCurrencies } from "utils/currencies";
import { updateUserProfile } from "services/UserService";
import { useRouter } from "expo-router";

export default function CurrencySettingsScreen() {
    const router = useRouter();
    const { theme } = useTheme();
    const { defaultCurrency: authDefaultCurrency, setDefaultCurrency } = useAuth() || {};
    const styles = useMemo(() => createStyles(theme), [theme]);

    // local busy state for saving
    const [busy, setBusy] = useState(false);
    // search query
    const [query, setQuery] = useState("");
    // local selected to reflect choice immediately (optimistic UI).
    const [selected, setSelected] = useState(authDefaultCurrency || "");

    // keep local selected in sync if auth changes externally
    useEffect(() => {
        setSelected(authDefaultCurrency || "");
    }, [authDefaultCurrency]);

    // helper: lookup currency meta
    const findCurrency = (code) => allCurrencies.find((c) => c.code === code) || null;

    // filtered & ordered list:
    // 1) filter by query if present
    // 2) ensure selected (if present) is moved to top
    const currencies = useMemo(() => {
        const q = (query || "").trim().toLowerCase();
        let list = [...allCurrencies].sort((a, b) => a.code.localeCompare(b.code));

        if (q) {
            list = list.filter(
                (c) =>
                    c.code.toLowerCase().includes(q) ||
                    c.name.toLowerCase().includes(q) ||
                    (c.symbol || "").toLowerCase().includes(q)
            );
        }

        if (selected) {
            const idx = list.findIndex((c) => c.code === selected);
            if (idx > 0) {
                const [found] = list.splice(idx, 1);
                list.unshift(found);
            } else if (idx === -1) {
                // selected not in filtered list (e.g., query filtered it out) —
                // bring the selected to top anyway by looking it up in master list
                const selMeta = findCurrency(selected);
                if (selMeta) {
                    list.unshift(selMeta);
                }
            }
        }

        return list;
    }, [query, selected]);

    const onSelect = async (code) => {
        if (busy) return;
        // Confirm with the user
        Alert.alert("Set default", `Use ${code} as default currency?`, [
            { text: "Cancel", style: "cancel" },
            {
                text: "Set",
                onPress: async () => {
                    try {
                        setBusy(true);
                        // optimistic update: reflect immediately in UI
                        setSelected(code);

                        await updateUserProfile({ defaultCurrency: code });
                        // update auth context if available
                        try {
                            setDefaultCurrency && setDefaultCurrency(code);
                        } catch (e) {
                            // ignore if not provided
                        }

                        // saved — give a small confirmation then go back
                        Alert.alert("Saved", `Default currency set to ${code}`);
                        router.back();
                    } catch (e) {
                        // revert optimistic update on error
                        setSelected(authDefaultCurrency || "");
                        Alert.alert("Error", e?.message || "Failed to save currency");
                    } finally {
                        setBusy(false);
                    }
                },
            },
        ]);
    };

    // convenience to render the label under the info row
    const currentDefaultMeta = useMemo(() => findCurrency(selected || authDefaultCurrency), [selected, authDefaultCurrency]);

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <StatusBar style={theme.statusBarStyle === "dark-content" ? "dark" : "light"} />
            <Header showBack title="Default Currency" />
            <View style={{ padding: 16, flex: 1 }}>
                {/* Info Row */}
                <View style={styles.infoRow}>
                    <View style={styles.iconWrap}>
                        {currentDefaultMeta && currentDefaultMeta.symbol ? (
                            <Text style={styles.symbolText}>{currentDefaultMeta.symbol}</Text>
                        ) : (
                            <Currency height={26} width={26} color={theme.colors.primary} />
                        )}
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.title}>
                            {currentDefaultMeta ? `${currentDefaultMeta.name} (${currentDefaultMeta.code})` : (selected || authDefaultCurrency || "—")}
                        </Text>
                        <Text style={styles.subtitle}>
                            This currency will be used for summaries and new expenses.
                        </Text>
                    </View>
                </View>

                {/* Search */}
                <SearchBar
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search currencies..."
                    style={{ marginTop: 16, marginBottom: 8 }}
                />

                {/* Loading overlay for saving */}
                {busy ? (
                    <View style={{ marginTop: 16, alignItems: "center", justifyContent: "center" }}>
                        <ActivityIndicator size="small" />
                        <Text style={{ color: theme.colors.muted, marginTop: 8 }}>Saving…</Text>
                    </View>
                ) : null}

                {/* List */}
                <FlatList
                    data={currencies}
                    keyExtractor={(i) => i.code}
                    style={{}}
                    renderItem={({ item }) => {
                        const active = String(item.code) === String(selected || authDefaultCurrency);
                        return (
                            <TouchableOpacity
                                style={[styles.optionRow, active && styles.optionRowActive, busy && { opacity: 0.6 }]}
                                onPress={() => onSelect(item.code)}
                                activeOpacity={0.8}
                                disabled={busy}
                            >
                                <View>
                                    <Text style={styles.optionText}>
                                        {item.name} ({item.symbol})
                                    </Text>
                                    <Text style={styles.subtitleSmall}>{item.code}</Text>
                                </View>
                                {active ? <Check height={18} width={18} color={theme.colors.primary} /> : null}
                            </TouchableOpacity>
                        );
                    }}
                    // small optimization: keep selected visible at top
                    initialNumToRender={20}
                    keyboardShouldPersistTaps="handled"
                />
            </View>
        </SafeAreaView>
    );
}

const createStyles = (theme) =>
    StyleSheet.create({
        safe: { flex: 1, backgroundColor: theme.colors.background },
        infoRow: { flexDirection: "row", gap: 12, alignItems: "center" },
        iconWrap: {
            width: 56,
            height: 56,
            borderRadius: 12,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 8,
        },
        symbolText: {
            fontSize: 25,
            fontWeight: "700",
            color: theme.colors.primary,
        },
        title: { color: theme.colors.primary, fontSize: 16, fontWeight: "700" },
        subtitle: { color: theme.colors.muted, fontSize: 13, marginTop: 3 },
        currentDefaultText: { marginTop: 4, color: theme.colors.muted, fontSize: 13 },
        subtitleSmall: { color: theme.colors.muted, fontSize: 12, marginTop: 4 },

        optionRow: {
            marginBottom: 8,
            paddingVertical: 12,
            paddingHorizontal: 12,
            borderRadius: 10,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: "transparent",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
        },
        optionRowActive: { borderColor: theme.colors.primary },
        optionText: { color: theme.colors.text, fontSize: 15 },
    });
