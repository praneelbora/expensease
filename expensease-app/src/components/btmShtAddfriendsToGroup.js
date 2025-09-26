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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MainBottomSheet from "./mainBottomSheet";
import { getFriends } from "services/FriendService";
import { addMembersToGroup } from "services/GroupService";
import { useAuth } from "context/AuthContext";
import { useTheme } from "context/ThemeProvider";
import Users from "@/accIcons/users.svg";
import Search from "@/accIcons/search.svg";
import CheckCircle from "@/accIcons/circleCheck.svg";
import Circle from "@/accIcons/circle.svg";
export default function BottomSheetAddFriends({
    innerRef,
    groupId,
    onClose,
    onAdded,
    onNoFriends,
    autoTriggerIfEmpty = false,
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
    const [loadedOnce, setLoadedOnce] = useState(false);

    // Load friends when sheet opens
    useEffect(() => {
        if (!innerRef?.current) return;
        let cancelled = false;
        const load = async () => {
            try {
                setLoading(true);
                const list = await getFriends(userToken);
                if (!cancelled) {
                    setFriends(Array.isArray(list) ? list : []);
                }
            } catch (e) {
                console.warn("Failed to load friends", e);
                if (!cancelled) setFriends([]);
            } finally {
                if (!cancelled) {
                    setLoading(false);
                    setLoadedOnce(true);
                }
            }
        };
        load();

        return () => {
            cancelled = true;
        };
    }, [innerRef, userToken]);

    // auto-trigger another sheet if empty and enabled
    useEffect(() => {
        if (!autoTriggerIfEmpty || !loadedOnce) return;
        if (!loading && Array.isArray(friends) && friends.length === 0) {
            if (typeof onNoFriends === "function") {
                try {
                    onNoFriends();
                } catch (e) {
                    console.warn("onNoFriends threw", e);
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoTriggerIfEmpty, loadedOnce, loading, friends]);

    const toggleSelect = (friend) => {
        if (selected.find((s) => s._id === friend?._id)) {
            setSelected((prev) => prev.filter((s) => s._id !== friend?._id));
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
                selected.map((f) => f?._id),
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

    const renderNoFriends = () => (
        <View style={{ padding: 24, alignItems: "center" }}>
            <Users width={48} height={48} color={colors.muted || "#888"} />
            <Text style={{ color: colors.text || "#EBF1D5", fontSize: 18, fontWeight: "700", marginTop: 12 }}>
                You have not added any friends yet
            </Text>
            <Text style={{ color: colors.muted || "#aaa", textAlign: "center", marginTop: 8 }}>
                Add friends to invite them into groups or settle expenses.
            </Text>

            <TouchableOpacity
                style={[styles.btn, { marginTop: 18, paddingHorizontal: 12 }]}
                onPress={() => {
                    if (typeof onNoFriends === "function") onNoFriends();
                }}
            >
                <Text style={styles.btnText}>Invite / Add Friends</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={{ marginTop: 12 }}
                onPress={() => {
                    if (typeof onNoFriends === "function") {
                        onNoFriends();
                    } else {
                        innerRef.current?.dismiss();
                    }
                }}
            >
                <Text style={{ color: colors.muted || "#aaa" }}>Or cancel and try later</Text>
            </TouchableOpacity>
        </View>
    );

    // Build the list shown in the FlatList:
    // - take friends that match the query
    // - show selected ones first (in the order they were selected), then the rest
    const listData = useMemo(() => {
        const q = query.trim().toLowerCase();
        const matchesQuery = (f) =>
            f?.name?.toLowerCase().includes(q) || f.email?.toLowerCase().includes(q) || q === "";

        const visible = friends.filter(matchesQuery);

        // map selected IDs for quick lookup
        const selectedIds = new Set(selected.map((s) => s._id));

        // selected items that are in visible list (preserve selection order)
        const selectedVisible = selected.filter((s) => visible.find((v) => v._id === s._id));

        // remaining visible that are not selected
        const others = visible.filter((v) => !selectedIds.has(v._id));

        return [...selectedVisible, ...others];
    }, [friends, query, selected]);

    return (
        <MainBottomSheet
            innerRef={innerRef}
            onDismiss={onClose}
            snapPoints={["100%"]}
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
                    <Search width={18} height={18} color={colors.muted || "#aaa"} />
                    <TextInput
                        placeholder="Search friends"
                        placeholderTextColor={colors.muted || "#777"}
                        value={query}
                        onChangeText={setQuery}
                        style={styles.searchInput}
                    />
                </View>

                {/* NOTE: chips removed — selected items now show at top of main list */}

                {/* Friends list or no-friends CTA */}
                {loading ? (
                    <ActivityIndicator style={{ marginTop: 20 }} color={colors.cta || colors.primary} />
                ) : Array.isArray(friends) && friends.length === 0 ? (
                    renderNoFriends()
                ) : (
                    <FlatList
                        data={listData}
                        keyExtractor={(f) => f?._id}
                        style={{ flex: 1, marginTop: 12 }}
                        renderItem={({ item }) => {
                            const isSelected = !!selected.find((s) => s._id === item._id);
                            return (
                                <TouchableOpacity
                                    style={[
                                        styles.friendRow,
                                        isSelected ? styles.friendRowSelected : null,
                                    ]}
                                    onPress={() => toggleSelect(item)}
                                >
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={styles.friendName} numberOfLines={1}>
                                            {item?.name}
                                        </Text>
                                        <Text style={styles.friendEmail}>{item?.email}</Text>
                                    </View>

                                    {/* Right-side selected button */}
                                    <TouchableOpacity
                                        onPress={() => toggleSelect(item)}
                                        style={styles.iconWrap}
                                    >
                                        {isSelected ? (
                                            <CheckCircle width={22} height={22} color={colors.cta || colors.primary} />
                                        ) : (
                                            <Circle width={22} height={22} color={colors.muted || "#777"} />
                                        )}
                                    </TouchableOpacity>
                                </TouchableOpacity>
                            );
                        }}
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
                        <Text style={styles.btnText}>Add {selected.length || ""} Friend{selected.length === 1 ? "" : "s"}</Text>
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

        friendRow: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: c.border || "#333",
            backgroundColor: "transparent",
        },
        friendRowSelected: {
            // subtle highlight for selected rows
            backgroundColor: c.card || "#2a2a2a",
        },
        friendName: { color: c.text || "#EBF1D5", fontSize: 15, fontWeight: "600" },
        friendEmail: { color: c.muted || "#888", fontSize: 12 },

        iconWrap: {
            paddingLeft: 12,
            paddingVertical: 4,
            justifyContent: "center",
            alignItems: "center",
        },

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
