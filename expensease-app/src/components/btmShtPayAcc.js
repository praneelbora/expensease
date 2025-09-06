// components/BottomSheetPaymentAccount.js
import React, { useEffect, useMemo, useState, useRef } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    ScrollView,
    Dimensions,
    PixelRatio,
    FlatList,
    Modal,
    Pressable,
    Platform,
} from "react-native";
import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import MainBottomSheet from "./mainBottomSheet";
import { useTheme } from "context/ThemeProvider";
import { PM_ICON_CHOICES } from "./pmIcons";

/**
 * Props:
 * - innerRef
 * - onClose()
 * - onSave(payload) -> called with { label, type, iconKey, capabilities, notes, isDefaultSend, isDefaultReceive, visibleForOthers }
 * - onDelete(id)
 * - busy (boolean)
 * - initialValues (optional) - when editing: { _id, label, type, iconKey, capabilities, notes, isDefaultSend, isDefaultReceive, visibleForOthers }
 */

const TYPE_OPTIONS = [
    { value: "upi", label: "UPI" },
    { value: "bank", label: "Bank" },
    { value: "debit card", label: "Debit Card" },
    { value: "credit card", label: "Credit Card" },
    { value: "cash", label: "Cash" },
    { value: "wallet", label: "Wallet" },
    { value: "other", label: "Other" },
];

const BottomSheetPaymentAccount = ({
    innerRef,
    onClose,
    onSave,
    onDelete,
    busy = false,
    initialValues,
}) => {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const colors = theme?.colors || {};
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [label, setLabel] = useState(initialValues?.label || "");
    const [type, setType] = useState(initialValues?.type || "upi");
    const [iconKey, setIconKey] = useState(initialValues?.iconKey ?? "auto");
    const [capSend, setCapSend] = useState(
        Boolean(initialValues?.capabilities?.includes("send"))
    );
    const [capReceive, setCapReceive] = useState(
        Boolean(initialValues?.capabilities?.includes("receive"))
    );

    // new fields
    const [notes, setNotes] = useState(initialValues?.notes || "");
    const [isDefaultSend, setIsDefaultSend] = useState(Boolean(initialValues?.isDefaultSend));
    const [isDefaultReceive, setIsDefaultReceive] = useState(Boolean(initialValues?.isDefaultReceive));
    const [visibleForOthers, setVisibleForOthers] = useState(
        initialValues?.visibleForOthers === undefined ? true : Boolean(initialValues?.visibleForOthers)
    );

    const [typeModalVisible, setTypeModalVisible] = useState(false);

    const editing = Boolean(initialValues?._id);

    // responsive icon grid: prefer 5 columns for good screens, fallback to 4
    const [containerWidth, setContainerWidth] = useState(
        Dimensions.get("window").width - 32
    );
    const [cols, setCols] = useState(5); // prefer 5
    const measuredRef = useRef(false);

    useEffect(() => {
        // heuristics: if tiny screen or very low DPR, fall back to 4
        const pr = PixelRatio.get();
        const { width, height } = Dimensions.get("window");
        const minSide = Math.min(width, height);
        // prefer 5 columns when there's reasonable width and DPR; otherwise 4
        const useFive = pr >= 1.5 && minSide >= 360;
        setCols(useFive ? 5 : 4);
    }, []);

    useEffect(() => {
        // sync when initialValues change (edit)
        setLabel(initialValues?.label || "");
        setType(initialValues?.type || "upi");
        setIconKey(initialValues?.iconKey ?? "auto");
        setCapSend(Boolean(initialValues?.capabilities?.includes("send")));
        setCapReceive(Boolean(initialValues?.capabilities?.includes("receive")));
        setNotes(initialValues?.notes || "");
        setIsDefaultSend(Boolean(initialValues?.isDefaultSend));
        setIsDefaultReceive(Boolean(initialValues?.isDefaultReceive));
        setVisibleForOthers(initialValues?.visibleForOthers === undefined ? true : Boolean(initialValues?.visibleForOthers));
    }, [initialValues]);

    useEffect(() => {
        if (!innerRef?.current) return;
        const reset = () => {
            setLabel("");
            setType("upi");
            setIconKey("auto");
            setCapSend(false);
            setCapReceive(false);
            setNotes("");
            setIsDefaultSend(false);
            setIsDefaultReceive(false);
            setVisibleForOthers(true);
        };
        innerRef.current?.addListener?.("onDismiss", reset);
        return () => innerRef.current?.removeListener?.("onDismiss", reset);
    }, [innerRef]);

    const save = () => {
        const payload = {
            label: (label || "").trim(),
            type: (type || "").trim(),
            iconKey: iconKey || "auto",
            capabilities: [...(capSend ? ["send"] : []), ...(capReceive ? ["receive"] : [])],
            notes: (notes || "").trim(),
            isDefaultSend: !!isDefaultSend,
            isDefaultReceive: !!isDefaultReceive,
            visibleForOthers: !!visibleForOthers,
        };
        onSave?.(payload);
    };
    // const backgroundColor = colors.card ?? "#212121";
    const backgroundColor = colors.card ?? "#212121";
    // When hiding from others, defaults must be cleared
    const toggleVisibleForOthers = (val) => {
        const next = typeof val === "boolean" ? val : !visibleForOthers;
        setVisibleForOthers(next);
        if (!next) {
            // hiding clears defaults
            setIsDefaultSend(false);
            setIsDefaultReceive(false);
        }
    };

    // When a default is set, ensure visibleForOthers is true
    const setDefaultSendHandler = (v) => {
        setIsDefaultSend(v);
        if (v) setVisibleForOthers(true);
    };
    const setDefaultReceiveHandler = (v) => {
        setIsDefaultReceive(v);
        if (v) setVisibleForOthers(true);
    };

    // compute icon item size given containerWidth and cols
    const iconGap = 8;
    const horizontalPadding = 16 * 2; // sheet paddingHorizontal
    const effectiveWidth = Math.max(containerWidth - horizontalPadding, 0);
    const itemSize = Math.floor((effectiveWidth - iconGap * (cols - 1)) / cols);

    // render icon item (button-like compact)
    const renderIconItem = ({ item }) => {
        const active = item.key === iconKey;
        const Icon = item.Icon;
        return (
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setIconKey(item.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                    styles.iconButton,                 // new base button style
                    active && styles.iconButtonActive, // active state
                    { width: itemSize },
                ]}
            >
                <Icon
                    size={20}
                    color={colors.text}
                />

                <Text
                    style={[
                        styles.iconButtonLabel,
                        active && { color: colors.text, opacity: 1 },
                    ]}
                    numberOfLines={1}
                >
                    {item.label}
                </Text>
            </TouchableOpacity>
        );
    };

    // small checkbox/toggle row component
    const ToggleRow = ({ label: lbl, value, onToggle, disabled, hint }) => (
        <TouchableOpacity
            onPress={() => !disabled && onToggle(!value)}
            activeOpacity={0.85}
            style={[styles.rowToggle, disabled && { opacity: 0.6 }]}
        >
            <View style={[styles.checkbox, value && styles.checkboxActive, disabled && styles.checkboxDisabled]}>
                {value ? <Feather name="check" size={12} color={colors.cardAltText || "#fff"} /> : null}
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.rowToggleLabel}>{lbl}</Text>
                {hint ? <Text style={styles.rowToggleHint}>{hint}</Text> : null}
            </View>
        </TouchableOpacity>
    );

    return (
        <MainBottomSheet
            innerRef={innerRef}
            onDismiss={onClose}
            addView={false}
        >
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Text style={styles.headerText}>
                    {editing ? "Edit Payment Account" : "Add Payment Account"}
                </Text>
                <TouchableOpacity
                    onPress={() => innerRef.current?.dismiss()}
                    style={styles.closeBtn}
                >
                    <Text style={styles.closeText}>Cancel</Text>
                </TouchableOpacity>
            </View>

            <BottomSheetScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 80 }}>
                {/* Label + Type row */}
                <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                    <View style={{ flex: 1.8 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <Text style={styles.sectionTitle}>Label</Text>
                            <Text style={styles.counterText}>max 15 characters</Text>
                        </View>
                        <TextInput
                            placeholder="e.g. HDFC UPI, Cash"
                            placeholderTextColor={colors.muted || "#777"}
                            value={label}
                            onChangeText={(t) => setLabel(t.slice(0, 15))}
                            style={styles.input}
                            maxLength={15}
                        />
                    </View>

                    <View style={{ flex: 1 }}>
                        <Text style={[styles.sectionTitle, { marginBottom: 6 }]}>Type</Text>
                        <TouchableOpacity
                            onPress={() => setTypeModalVisible(true)}
                            style={styles.customSelect}
                        >
                            <Text style={styles.customSelectText}>
                                {TYPE_OPTIONS.find((o) => o.value === type)?.label || "Select"}
                            </Text>
                            <Feather name="chevron-down" size={18} color={colors.muted || "#999"} />
                        </TouchableOpacity>

                        {/* Type modal */}
                        <Modal
                            visible={typeModalVisible}
                            transparent
                            animationType="fade"
                            onRequestClose={() => setTypeModalVisible(false)}
                        >
                            <Pressable style={styles.modalBackdrop} onPress={() => setTypeModalVisible(false)}>
                                <View style={[styles.modalCardSmall, { marginHorizontal: 24 }]}>
                                    <FlatList
                                        data={TYPE_OPTIONS}
                                        keyExtractor={(it) => it.value}
                                        renderItem={({ item }) => (
                                            <TouchableOpacity
                                                onPress={() => {
                                                    setType(item.value);
                                                    setTypeModalVisible(false);
                                                }}
                                                style={styles.modalOption}
                                            >
                                                <Text style={styles.modalOptionText}>{item.label}</Text>
                                            </TouchableOpacity>
                                        )}
                                        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border || "#333", marginVertical: 4 }} />}
                                    />
                                </View>
                            </Pressable>
                        </Modal>
                    </View>
                </View>

                <Text style={[styles.helperText, { marginTop: 8 }]}>
                    Label and Type will be visible to friends while splitting
                </Text>

                {/* Icon chooser (responsive grid) */}
                <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Icon</Text>

                <View
                    onLayout={(e) => {
                        const w = e?.nativeEvent?.layout?.width ?? Dimensions.get("window").width - 32;
                        // only set once on first measure to avoid layout churn
                        if (!measuredRef.current || Math.abs(w - containerWidth) > 6) {
                            measuredRef.current = true;
                            setContainerWidth(w + 32); // include padding offset
                        }
                    }}
                    style={{ marginTop: 8 }}
                >
                    <FlatList
                        data={PM_ICON_CHOICES}
                        keyExtractor={(i) => i.key}
                        renderItem={renderIconItem}
                        numColumns={cols}
                        columnWrapperStyle={{ justifyContent: "flex-start", gap: iconGap, marginBottom: 12 }}
                        scrollEnabled={false}
                    />
                    <Text style={styles.helperTextSmall}>
                        Tip: choose <Text style={{ fontWeight: "700" }}>Auto</Text> to let the app pick icon based on type.
                    </Text>
                </View>
                {/* Notes */}
                <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Notes (optional)</Text>
                <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Notes about this account (for your reference)"
                    placeholderTextColor={colors.muted || "#777"}
                    style={[styles.input, { minHeight: 80, textAlignVertical: "top", paddingTop: 12 }]}
                    multiline
                    numberOfLines={4}
                />

                {/* Defaults & visibility */}
                <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Visibility & Defaults</Text>

                <View style={{ marginTop: 8, gap: 8 }}>
                    <ToggleRow
                        label="Visible to others"
                        value={visibleForOthers}
                        onToggle={toggleVisibleForOthers}
                        hint="When off, friends won’t see this method in splits but you can still use it."
                    />

                    <ToggleRow
                        label="Default for Expenses"
                        value={isDefaultSend}
                        onToggle={setDefaultSendHandler}
                        disabled={!visibleForOthers}
                        hint={!visibleForOthers ? "Hidden methods can’t be set as defaults." : undefined}
                    />

                    <ToggleRow
                        label="Default for Receiving Money"
                        value={isDefaultReceive}
                        onToggle={setDefaultReceiveHandler}
                        disabled={!visibleForOthers}
                        hint={!visibleForOthers ? "Hidden methods can’t be set as defaults." : undefined}
                    />
                </View>
                <View style={{}}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                        {editing ? (
                            <TouchableOpacity
                                onPress={() => onDelete?.(initialValues._id)}
                                style={[styles.btn, styles.btnDanger, busy && styles.btnDisabled]}
                                disabled={busy}
                            >
                                {busy ? <ActivityIndicator color={colors.text || "#fff"} /> : <Text style={[styles.btnText, { color: "#fff" }]}>Delete</Text>}
                            </TouchableOpacity>
                        ) : null}

                        <View style={{ flex: 1 }} />

                        <TouchableOpacity onPress={() => innerRef.current?.dismiss()} style={[styles.btn, styles.btnMuted]}>
                            <Text style={[styles.btnText,]}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={save}
                            disabled={!label.trim() || busy}
                            style={[styles.btn, (!label.trim() || busy) && styles.btnDisabled, { marginLeft: 8 }]}
                        >
                            {busy ? <ActivityIndicator color={colors.text || "#fff"} /> : <Text style={[styles.btnText, { color: "#121212" }]}>{editing ? "Save" : "Add"}</Text>}
                        </TouchableOpacity>
                    </View>
                </View>


                {/* <View style={{ height: insets.bottom + 16 }} /> */}
            </BottomSheetScrollView>
        </MainBottomSheet>
    );
};

export default BottomSheetPaymentAccount;

/* styles */
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

        section: { paddingHorizontal: 0, paddingTop: 12 },

        sectionTitle: {
            color: c.text || "#EBF1D5",
            fontSize: 14,
            fontWeight: "700",
            marginBottom: 6,
        },

        counterText: { color: c.muted || "#9aa19a", fontSize: 12 },

        input: {
            backgroundColor: c.cardAlt || "#1f1f1f",
            color: c.text || "#EBF1D5",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.border || "#55554f",
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 15,
            marginBottom: 8,
            height: 40,
        },

        customSelect: {
            height: 40,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: c.border || "#555",
            backgroundColor: c.cardAlt || "#1f1f1f",
            paddingHorizontal: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
        },
        customSelectText: { color: c.text || "#EBF1D5" },

        modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center" },
        modalCardSmall: { backgroundColor: c.card || "#1f1f1f", marginHorizontal: 20, borderRadius: 12, padding: 8, maxHeight: "60%" },
        modalOption: { paddingVertical: 12, paddingHorizontal: 12 },
        modalOptionText: { color: c.text || "#EBF1D5", fontSize: 16 },

        // legacy iconChoice compatibility kept but not used
        iconChoice: {
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 6,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "transparent",
            backgroundColor: "transparent",
        },
        iconChoiceActive: {
            backgroundColor: c.primary || "#60DFC9",
            borderColor: c.primary || "#60DFC9",
        },
        iconPreview: {
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.cardAlt || "#262626",
            marginBottom: 4,
        },
        iconLabel: { color: c.text || "#EBF1D5", fontSize: 11, maxWidth: "100%" },

        helperText: { color: c.muted || "#9aa19a", fontSize: 12 },
        helperTextSmall: { color: c.muted || "#9aa19a", fontSize: 11, marginTop: 6 },

        toggle: {
            borderWidth: 1,
            borderColor: c.border || "#444",
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
        },
        toggleActive: { backgroundColor: c.primary || "#60DFC9", borderColor: c.primary || "#60DFC9" },
        toggleText: { color: c.text || "#EBF1D5", fontWeight: "700" },
        toggleTextActive: { color: "#121212", fontWeight: "800" },

        btn: { borderRadius: 8, paddingVertical: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, backgroundColor: c.cardAlt || "#2a2a2a" },
        btnText: { fontWeight: "700", color: c.text || "#EBF1D5" },
        btnMuted: { backgroundColor: c.cardAlt || "#2a2a2a", borderWidth: 1, borderColor: c.border || "#444" },
        btnDisabled: { backgroundColor: c.border || "#555", opacity: 0.8 },
        btnDanger: { backgroundColor: c.danger || "#ef4444" },

        // button-like icon tile (replaces iconChoice/iconPreview/iconLabel)
        iconButton: {
            flexDirection: 'column',
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 10,
            borderRadius: 10,
            gap: 5,
            borderColor: "transparent",
            backgroundColor: "transparent",
            borderWidth: 1,
            borderColor: c.cardAlt || "#262626",
        },
        iconButtonActive: {
            backgroundColor: c.primary ? `${hexToRgba(c.primary, 0.12)}` : "rgba(96,223,201,0.12)", // subtle tint if theme primary exists
            borderColor: c.primary || "#60DFC9",
        },
        iconButtonInner: {
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.cardAlt || "#262626",
            marginBottom: 6,
        },
        iconButtonLabel: {
            color: c.text || "#EBF1D5",
            fontSize: 10,
            maxWidth: "100%",
            textAlign: "center",
        },

        // small toggle row and checkbox
        rowToggle: { flexDirection: "row", gap: 12, paddingVertical: 8 },
        rowToggleLabel: { color: c.text || "#EBF1D5", fontSize: 14, fontWeight: "600" },
        rowToggleHint: { color: c.muted || "#9aa19a", fontSize: 12 },

        checkbox: {
            width: 18,
            height: 18,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: c.border || "#444",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "transparent",
        },
        checkboxActive: {
            backgroundColor: c.primary || "#60DFC9",
            borderColor: c.primary || "#60DFC9",
        },
        closeText: { color: c.negative || "#EA4335", fontSize: 16 },
        checkboxDisabled: {
            opacity: 0.5,
        },
    });

// small helper to create rgba from hex
function hexToRgba(hex = "#000000", alpha = 1) {
    const h = hex.replace("#", "");
    if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// export { BottomSheetPaymentAccount as default };
