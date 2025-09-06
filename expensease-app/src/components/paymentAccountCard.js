// components/PaymentMethodCard.js
import React, { useMemo, useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Platform,
    Pressable,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "context/ThemeProvider";
import { getSymbol } from "utils/currencies";
import { getPMIcon } from "./pmIcons";

/**
 * Props:
 * - method (payment method object)
 * - balancesPeek: object mapping methodId -> { bucket: { CCY: amt } }
 * - onPeekBalances(id)
 * - onEdit(method)
 * - onAddBalance(method)
 * - onDelete(id)
 * - onUpdate(id, patch)
 */
export default function PaymentMethodCard({
    method = {},
    balancesPeek = {},
    onPeekBalances,
    onEdit,
    onAddBalance,
    onDelete,
    onUpdate,
}) {
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    const Icon = getPMIcon({ iconKey: method.iconKey, type: method.type });

    const peek = balancesPeek?.[method._id] || method?.balances || {};
    const caps = Array.isArray(method.capabilities) ? method.capabilities : [];

    // mimic reveal toggle for amounts (like Eye/EyeOff)
    const [revealed, setRevealed] = useState(true);
    const timerRef = useRef(null);
    useEffect(() => () => timerRef.current && clearTimeout(timerRef.current), []);

    const currencyCode = method.defaultCurrency || "INR";
    const symbol = useMemo(() => {
        try {
            return getSymbol?.(currencyCode) || "";
        } catch {
            return "";
        }
    }, [currencyCode]);

    const handleToggleReveal = () => {
        setRevealed((s) => !s);
        // optional: auto-hide after X seconds
        if (!revealed) {
            timerRef.current = setTimeout(() => setRevealed(false), 6000);
        } else {
            timerRef.current && clearTimeout(timerRef.current);
        }
    };

    const isDefaultSend = Boolean(method.isDefaultSend);
    const isDefaultReceive = Boolean(method.isDefaultReceive);

    return (
        <View style={styles.wrap}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.left}>
                    <View style={styles.iconBox}>
                        <Icon size={20} color={theme.colors.primary} />
                    </View>

                    <View style={{ marginLeft: 10, minWidth: 0, flex: 1 }}>
                        <Text style={styles.title} numberOfLines={1}>
                            {method.label || "Payment Account"}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            {method.type ? (
                                <View style={styles.typeChip}>
                                    <Text style={styles.typeChipText}>{String(method.type).toUpperCase()}</Text>
                                </View>
                            ) : null}
                        </View>
                    </View>
                </View>

                {/* Right badges & actions */}
                <View style={styles.right}>
                    {/* default badges */}
                    <View style={{ marginTop: 0, alignItems: "flex-end" }}>
                        {isDefaultSend && <View style={[styles.badge, styles.badgeTeal]}><Text style={styles.badgeText}>Expenses Default</Text></View>}
                        {isDefaultReceive && <View style={[styles.badge, styles.badgeTeal, { marginTop: 6 }]}><Text style={styles.badgeText}>Receiving Default</Text></View>}
                        {method.visibleForOthers === false && <View style={[styles.badge, , { marginTop: 6, borderColor: styles.palette.negative }]}><Text style={[styles.badgeText, { color: styles.palette.negative }]}>Hidden</Text></View>}
                    </View>
                </View>
            </View>

            {/* Balances preview */}
            {peek && Object.keys(peek).length > 0 && (
                <View style={styles.peekWrap}>
                    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignContent: 'center', alignItems: 'center' }}>
                        <Text style={styles.peekTitle}>Current Balances</Text>
                        <View style={styles.peekActions}>
                            <TouchableOpacity onPress={handleToggleReveal} style={styles.iconBtnSmall} accessibilityLabel="Toggle reveal">
                                <Feather name={revealed ? "eye" : "eye-off"} size={16} color={styles.palette.primaryFallback} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.peekList}>
                        {Object.entries(peek).filter(([ccy, obj]) => (obj.available.toFixed(2) !== "0.00")).map(([ccy, obj]) => (
                            <View key={ccy} style={styles.peekItem}>
                                <Text style={[styles.peekAmount, !revealed && styles.peekBlur]}>
                                    {obj?.available != null ? revealed ? Number(obj.available).toFixed(2) : "XXX" : "0.00"}
                                </Text>
                                <Text style={styles.peekCcy}>{ccy}</Text>
                            </View>
                        ))}
                    </View>


                </View>
            )}
            <View>
                <Text style={styles.notes}>Notes: {method?.notes}</Text>
            </View>
            {/* Footer actions */}
            <View style={styles.footer}>
                <TouchableOpacity onPress={() => onAddBalance?.(method)} style={styles.footerBtn}>
                    <Text style={styles.footerBtnText}>Manage Balances</Text>
                </TouchableOpacity>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Pressable onPress={() => onEdit?.(method)} style={styles.iconBtnSquare} android_ripple={{ color: "#00000010" }}>
                        <Feather name="edit-2" size={18} color={styles.palette.textFallback} />
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

/* Styles */
const createStyles = (theme = {}) => {
    const palette = {
        background: theme?.colors?.background ?? "#121212",
        card: theme?.colors?.card ?? "#141414",
        cardAlt: theme?.colors?.cardAlt ?? "#262626",
        border: theme?.colors?.border ?? "#2a2a2a",
        text: theme?.colors?.text ?? "#E7F0D7",
        muted: theme?.colors?.muted ?? "#b9c29f",
        primary: theme?.colors?.primary ?? "#60DFC9",
        negative: theme?.colors?.negative
    };

    const s = StyleSheet.create({
        wrap: {
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: 14,
            padding: 14,
            marginBottom: 12,
        },
        header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
        left: { flexDirection: "row", alignItems: "center", flex: 1 },
        iconBox: {
            width: 44,
            height: 44,
            borderRadius: 10,
            backgroundColor: palette.background,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: palette.border,
        },
        title: { color: palette.text, fontSize: 16, fontWeight: "700" },
        sub: { color: palette.muted, fontSize: 12, marginTop: 4 },

        typeChip: {
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.border,
            paddingHorizontal: 8,
            paddingVertical: Platform.OS === "android" ? 4 : 6,
            marginRight: 6,
            backgroundColor: "transparent",
        },
        typeChipText: { color: palette.text, fontSize: 11, fontWeight: "700" },

        right: { marginLeft: 12, alignItems: "flex-end" },
        iconBtn: { backgroundColor: palette.cardAlt, padding: 6, borderRadius: 8 },
        iconBtnSmall: { padding: 6, borderRadius: 8 },

        badge: {
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.primary,
            paddingHorizontal: 6,
            paddingVertical: 4,
            backgroundColor: "transparent",
        },
        badgeTeal: { borderColor: palette.primary },
        badgeIndigo: { borderColor: "#7c3aed" },
        badgeText: { color: palette.primary, fontSize: 11, fontWeight: "700" },

        peekWrap: { marginTop: 12 },
        peekTitle: { color: palette.muted, fontSize: 13, fontWeight: "700" },
        peekList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
        peekItem: { flexDirection: "row", alignItems: "baseline", gap: 8, backgroundColor: palette.background, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: palette.border, marginRight: 8 },
        peekAmount: { color: palette.text, fontSize: 15, fontWeight: "700" },
        peekCcy: { color: palette.text, fontSize: 12 },

        linkBtn: { paddingVertical: 4 },
        linkText: { color: palette.primary, fontWeight: "700" },
        notes: { color: palette.muted, marginTop: 6, },

        peekBlur: { opacity: 0.35 },
        footer: { marginTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
        footerBtn: { borderRadius: 8, borderWidth: 1, borderColor: palette.text, paddingHorizontal: 12, paddingVertical: 8 },
        footerBtnText: { color: palette.text, fontWeight: "700" },

        iconBtnSquare: { backgroundColor: palette.cardAlt, padding: 8, borderRadius: 8 },

        palette: {
            backgroundFallback: palette.background,
            cardFallback: palette.card,
            cardAltFallback: palette.cardAlt,
            borderFallback: palette.border,
            textFallback: palette.text,
            mutedFallback: palette.muted,
            primaryFallback: palette.primary,
            negative: palette.negative
        },
    });

    s.palette = s.palette;
    return s;
};
