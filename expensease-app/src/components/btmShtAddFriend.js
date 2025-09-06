// components/BottomSheetFriendManager.js
import React, { useState, useEffect, useMemo } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import MainBottomSheet from "./mainBottomSheet";

import {
    sendFriendRequest,
    fetchReceivedRequests,
    fetchSentRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
} from "services/FriendService";

import { useTheme } from "context/ThemeProvider"; // adjust path if needed

const BottomSheetFriendManager = ({ innerRef, userToken }) => {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const colors = theme?.colors || {};

    // memoized themed styles
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [email, setEmail] = useState("");
    const [saving, setSaving] = useState(false);

    const [incoming, setIncoming] = useState([]);
    const [outgoing, setOutgoing] = useState([]);
    const [loading, setLoading] = useState(true);

    const pullRequests = async () => {
        try {
            setLoading(true);
            const [received, sent] = await Promise.all([
                fetchReceivedRequests(userToken),
                fetchSentRequests(userToken),
            ]);
            setIncoming(received || []);
            setOutgoing(sent || []);
        } catch (e) {
            console.warn("Failed to fetch requests:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (userToken) pullRequests();
    }, [userToken]);

    const send = async () => {
        const v = String(email || "").trim().toLowerCase();
        if (!v || !v.includes("@")) {
            Alert.alert("Invalid email", "Please enter a valid email address.");
            return;
        }
        try {
            setSaving(true);
            await sendFriendRequest(v, userToken);
            setEmail("");
            await pullRequests();
            Alert.alert("Request sent", "Friend request sent successfully.");
        } catch (e) {
            Alert.alert("Error", e?.message || "Failed to send request");
        } finally {
            setSaving(false);
        }
    };

    const handleAccept = async (id) => {
        try {
            await acceptFriendRequest(id, userToken);
            await pullRequests();
        } catch (e) {
            Alert.alert("Error", "Could not accept request.");
        }
    };

    const handleReject = async (id) => {
        try {
            await rejectFriendRequest(id, userToken);
            await pullRequests();
        } catch (e) {
            Alert.alert("Error", "Could not decline request.");
        }
    };

    const handleCancel = async (id) => {
        try {
            await cancelFriendRequest(id, userToken);
            await pullRequests();
        } catch (e) {
            Alert.alert("Error", "Could not cancel request.");
        }
    };

    return (
        <MainBottomSheet innerRef={innerRef}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Text style={styles.headerText}>Manage Friends</Text>
                <TouchableOpacity onPress={() => innerRef.current?.dismiss()}>
                    <Text style={styles.closeText}>Cancel</Text>
                </TouchableOpacity>
            </View>

            {/* Add Friend Form */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Add Friend</Text>
                <TextInput
                    placeholder="friend@example.com"
                    placeholderTextColor={colors.muted || "#777"}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    style={styles.input}
                />
                <TouchableOpacity
                    style={[styles.btn, { backgroundColor: colors.cta || colors.primary }]}
                    onPress={send}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color={colors.text || "#121212"} />
                    ) : (
                        <Text style={[styles.btnText, { color: colors.text || "#121212" }]}>Send</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Incoming Requests */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Incoming Requests</Text>
                {loading ? (
                    <ActivityIndicator color={colors.primary || colors.cta} />
                ) : incoming.length === 0 ? (
                    <Text style={styles.emptyText}>No incoming requests</Text>
                ) : (
                    incoming.map((req) => (
                        <View key={req._id} style={styles.reqRow}>
                            <View>
                                <Text style={styles.reqName}>{req?.sender?.name || req?.email}</Text>
                                <Text style={styles.reqEmail}>{req?.sender?.email}</Text>
                            </View>
                            <View style={{ flexDirection: "row", gap: 8 }}>
                                <TouchableOpacity
                                    onPress={() => handleAccept(req._id)}
                                    style={[styles.reqBtn, { borderColor: colors.cta || colors.primary }]}
                                >
                                    <Text style={{ color: colors.cta || colors.primary }}>Accept</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => handleReject(req._id)}
                                    style={[styles.reqBtn, { borderColor: colors.negative || "#ef4444" }]}
                                >
                                    <Text style={{ color: colors.negative || "#ef4444" }}>Decline</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))
                )}
            </View>

            {/* Outgoing Requests */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Outgoing Requests</Text>
                {loading ? (
                    <ActivityIndicator color={colors.primary || colors.cta} />
                ) : outgoing.length === 0 ? (
                    <Text style={styles.emptyText}>No outgoing requests</Text>
                ) : (
                    outgoing.map((req) => (
                        <View key={req._id} style={styles.reqRow}>
                            <View>
                                <Text style={styles.reqName}>{req?.receiver?.name || req?.email}</Text>
                                <Text style={styles.reqEmail}>{req?.receiver?.email}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => handleCancel(req._id)}
                                style={[styles.reqBtn, { borderColor: colors.negative || "#ef4444" }]}
                            >
                                <Text style={{ color: colors.negative || "#ef4444" }}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    ))
                )}
            </View>

            <View style={{ height: insets.bottom + 16 }} />
        </MainBottomSheet>
    );
};

export default BottomSheetFriendManager;

/* themed styles factory */
const createStyles = (c = {}) =>
    StyleSheet.create({
        header: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingBottom: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: c.border || "#333",
        },
        headerText: { color: c.text || "#EBF1D5", fontSize: 18, fontWeight: "700" },
        closeText: { color: c.negative || "#EA4335", fontSize: 16 },

        section: { paddingHorizontal: 16, paddingVertical: 16 },
        sectionTitle: {
            color: c.text || "#EBF1D5",
            fontSize: 16,
            fontWeight: "600",
            marginBottom: 8,
        },

        input: {
            backgroundColor: c.cardAlt || "#1f1f1f",
            color: c.text || "#EBF1D5",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.border || "#55554f",
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 15,
        },

        btn: {
            borderRadius: 8,
            paddingVertical: 10,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 10,
        },
        btnText: { fontWeight: "600" },

        reqRow: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingVertical: 10,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: c.border || "#333",
        },
        reqName: { color: c.text || "#EBF1D5", fontSize: 15, fontWeight: "600" },
        reqEmail: { color: c.muted || "#888", fontSize: 13 },
        reqBtn: {
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 6,
        },

        emptyText: { color: c.muted || "#888", fontSize: 14, marginTop: 4 },
    });
