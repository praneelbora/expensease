// src/components/BottomSheetGroups.js
import React, { useState, useEffect, useMemo } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import MainBottomSheet from "./mainBottomSheet";
import { useTheme } from "context/ThemeProvider";

const BottomSheetGroups = ({ innerRef, onClose, onCreate, onJoin, busy }) => {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const colors = theme?.colors || {};

    const styles = useMemo(() => createStyles(colors), [colors]);

    const [name, setName] = useState("");
    const [code, setCode] = useState("");

    useEffect(() => {
        if (!innerRef?.current) return;
        // Reset when dismissed
        const reset = () => {
            setName("");
            setCode("");
        };
        // depending on your sheet implementation the event name may differ;
        // this listens if available and cleans up safely.
        innerRef.current?.addListener?.("onDismiss", reset);
        return () => {
            innerRef.current?.removeListener?.("onDismiss", reset);
        };
    }, [innerRef]);

    return (
        <MainBottomSheet innerRef={innerRef} onDismiss={onClose}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Text style={styles.headerText}>Groups</Text>
                <TouchableOpacity
                    onPress={() => innerRef.current?.dismiss()}
                    style={styles.closeBtn}
                >
                    <Text style={styles.closeText}>Cancel</Text>
                </TouchableOpacity>
            </View>

            {/* Create Group */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Create Group</Text>
                <TextInput
                    placeholder="Group name"
                    placeholderTextColor={colors.muted || "#777"}
                    value={name}
                    onChangeText={setName}
                    style={styles.input}
                />
                <TouchableOpacity
                    onPress={() => onCreate?.(name)}
                    disabled={!name.trim() || busy}
                    style={[styles.btn, (!name.trim() || busy) && styles.btnDisabled]}
                >
                    {busy ? (
                        <ActivityIndicator color={colors.text || "#121212"} />
                    ) : (
                        <Text style={[styles.btnText, { color: "#121212" }]}>Create</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Join Group */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Join with Code</Text>
                <TextInput
                    placeholder="Enter code"
                    placeholderTextColor={colors.muted || "#777"}
                    value={code}
                    onChangeText={setCode}
                    autoCapitalize="characters"
                    style={styles.input}
                />
                <TouchableOpacity
                    onPress={() => onJoin?.(code)}
                    disabled={!code.trim() || busy}
                    style={[styles.btn, (!code.trim() || busy) && styles.btnDisabled]}
                >
                    {busy ? (
                        <ActivityIndicator color={colors.text || "#121212"} />
                    ) : (
                        <Text style={[styles.btnText, { color: "#121212" }]}>Join</Text>
                    )}
                </TouchableOpacity>
            </View>

            <View style={{ height: insets.bottom + 16 }} />
        </MainBottomSheet>
    );
};

export default BottomSheetGroups;

/* theme-aware styles factory */
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
        closeBtn: { padding: 4 },

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
            marginBottom: 12,
        },

        btn: {
            borderRadius: 8,
            paddingVertical: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.cta || c.primary || "#00C49F",
        },
        closeText: { color: c.negative || "#EA4335", fontSize: 16 },
        btnText: { fontWeight: "600" },
        btnDisabled: { backgroundColor: c.border || "#555" },
    });
