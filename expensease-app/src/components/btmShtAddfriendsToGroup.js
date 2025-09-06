// src/components/BottomSheetAddFriends.js
import React, { useEffect, useMemo, useState } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    FlatList,
    ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MainBottomSheet from "./mainBottomSheet";
import { getFriends } from "services/FriendService";
import { addMembersToGroup } from "services/GroupService";
import { useAuth } from "context/AuthContext";
import { useTheme } from "context/ThemeProvider";

export default function BottomSheetAddFriends({
    innerRef,
    groupId,
    onClose,
    onAdded,
}) {
    const insets = useSafeAreaInsets();
    const { userToken } = useAuth() || {};
    const { theme } = useTheme();
    const colors = theme?.colors || {};

    const styles = useMemo(() => createStyles(colors), [colors]);

    const [friends, setFriends] = useState([]);
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    // Load friends when sheet opens
    useEffect(() => {
        if (!innerRef?.current) return;
        const load = async () => {
            try {
                setLoading(true);
                const list = await getFriends(userToken);
                setFriends(Array.isArray(list) ? list : []);
            } catch (e) {
                console.warn("Failed to load friends", e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [innerRef, userToken]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return friends.filter(
            (f) =>
                !selected.find((s) => s._id === f._id) &&
                (f.name?.toLowerCase().includes(q) || f.email?.toLowerCase().includes(q))
        );
    }, [friends, query, selected]);

    const toggleSelect = (friend) => {
        if (selected.find((s) => s._id === friend._id)) {
            setSelected((prev) => prev.filter((s) => s._id !== friend._id));
        } else {
            setSelected((prev) => [...prev, friend]);
        }
    };

    const handleAdd = async () => {
        if (!groupId || selected.length === 0) return;
        try {
            setBusy(true);
            await addMembersToGroup(
                groupId,
                selected.map((f) => f._id),
                userToken
            );
            setSelected([]);
            innerRef.current?.dismiss();
            onAdded?.();
        } catch (e) {
            setError(e?.message || "Failed to add members");
        } finally {
            setBusy(false);
        }
    };

    return (
        <MainBottomSheet
            innerRef={innerRef}
            onDismiss={onClose}
            snapPoints={["100%"]} // full screen
        >
            <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerText}>Add Friends</Text>
                    <TouchableOpacity onPress={() => innerRef.current?.dismiss()}>
                        <Text style={styles.closeText}>Cancel</Text>
                    </TouchableOpacity>
                </View>

                {/* Search input */}
                <View style={styles.searchWrap}>
                    <Feather name="search" size={18} color={colors.muted || "#aaa"} />
                    <TextInput
                        placeholder="Search friends"
                        placeholderTextColor={colors.muted || "#777"}
                        value={query}
                        onChangeText={setQuery}
                        style={styles.searchInput}
                    />
                </View>

                {/* Selected chips */}
                {selected.length > 0 && (
                    <View style={styles.chipsContainer}>
                        {selected.map((f) => (
                            <View key={f._id} style={styles.chip}>
                                <Text style={styles.chipText} numberOfLines={1}>
                                    {f?.name}
                                </Text>
                                <TouchableOpacity
                                    onPress={() => toggleSelect(f)}
                                    style={styles.removeBtn}
                                >
                                    Cancel
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}

                {/* Friends list */}
                {loading ? (
                    <ActivityIndicator style={{ marginTop: 20 }} color={colors.cta || colors.primary} />
                ) : (
                    <FlatList
                        data={filtered}
                        keyExtractor={(f) => f._id}
                        style={{ flex: 1, marginTop: 12 }}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={styles.friendRow}
                                onPress={() => toggleSelect(item)}
                            >
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={styles.friendName} numberOfLines={1}>
                                        {item?.name}
                                    </Text>
                                    <Text style={styles.friendEmail}>{item?.email}</Text>
                                </View>
                                {selected.find((s) => s._id === item._id) ? (
                                    <Feather name="check-circle" size={22} color={colors.cta || colors.primary} />
                                ) : (
                                    <Feather name="circle" size={22} color={colors.muted || "#777"} />
                                )}
                            </TouchableOpacity>
                        )}
                    />
                )}

                {error ? (
                    <Text style={{ color: colors.negative || "#f87171", textAlign: "center", marginTop: 6 }}>
                        {error}
                    </Text>
                ) : null}

                {/* Action button */}
                <TouchableOpacity
                    style={[styles.btn, (selected.length === 0 || busy) && styles.btnDisabled]}
                    disabled={selected.length === 0 || busy}
                    onPress={handleAdd}
                >
                    {busy ? (
                        <ActivityIndicator color={colors.text || "#121212"} />
                    ) : (
                        <Text style={styles.btnText}>
                            Add {selected.length || ""} Friend{selected.length === 1 ? "" : "s"}
                        </Text>
                    )}
                </TouchableOpacity>

                <View style={{ height: insets.bottom + 20 }} />
            </View>
        </MainBottomSheet>
    );
}

/* theme-aware styles factory */
const createStyles = (c = {}) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: c.background || "#1f1f1f" },
        header: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingBottom: 8,
        },
        headerText: { color: c.text || "#EBF1D5", fontSize: 18, fontWeight: "700" },
        closeText: { color: c.negative || "#EA4335", fontSize: 16 },

        searchWrap: {
            flexDirection: "row",
            alignItems: "center",
            marginHorizontal: 16,
            marginTop: 12,
            paddingHorizontal: 12,
            borderRadius: 8,
            backgroundColor: c.card || "#2a2a2a",
        },
        searchInput: { flex: 1, color: c.text || "#EBF1D5", paddingVertical: 8, fontSize: 16 },

        chipsContainer: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            paddingHorizontal: 16,
            marginTop: 6,
        },
        chip: {
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: c.border || "#333",
            borderRadius: 20,
            paddingHorizontal: 10,
            paddingVertical: 4,
        },
        chipText: { color: c.text || "#EBF1D5", fontSize: 13, fontWeight: "600" },
        removeBtn: {
            marginLeft: 6,
            backgroundColor: c.card || "#555",
            borderRadius: 999,
            padding: 2,
        },

        friendRow: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: c.border || "#333",
        },
        friendName: { color: c.text || "#EBF1D5", fontSize: 15, fontWeight: "600" },
        friendEmail: { color: c.muted || "#888", fontSize: 12 },

        btn: {
            marginHorizontal: 16,
            marginTop: 16,
            borderRadius: 10,
            paddingVertical: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.cta || c.primary || "#00C49F",
        },
        btnText: { color: c.text || "#121212", fontWeight: "700", fontSize: 16 },
        btnDisabled: { backgroundColor: c.border || "#555" },
    });
