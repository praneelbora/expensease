// components/BtmShtSettle.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    TextInput,
    Platform,
    FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MainBottomSheet from "./mainBottomSheet";
import CurrenciesSheet from "./shtCurrencies";
import { getSymbol } from "utils/currencies";
import { useTheme } from "context/ThemeProvider";

/**
 * BtmShtSettle
 *
 * Props:
 * - innerRef (ref to MainBottomSheet)
 * - transactions (array)  -- expect settlementLists from FriendDetails (net/all_personal/all_groups/group items)
 * - onSubmit ({ payerId, receiverId, amount, description, currency, meta? })
 * - onSubmitAll () -> called for "Settle All"
 * - onClose ()
 * - group, userId, friends []
 * - prefill (optional settlement to prefill custom mode)
 * - currencyOptions, defaultCurrency, preferredCurrencies
 */


const BtmShtSettle = ({
    innerRef,
    transactions = [],
    onSubmit,
    onSubmitAll,
    onClose,
    group,
    userId,
    friends = [],
    prefill,
    currencyOptions = [],
    defaultCurrency = "INR",
    preferredCurrencies = [], }) => {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme?.() || {};
    const colors = theme?.colors || {};
    const styles = useMemo(() => createStyles(colors), [colors]);
    console.log('transaction: ', transactions);

    // UI state 
    const [settleMode, setSettleMode] = useState("suggested"); // 'suggested' | 'custom'
    const [confirmationVisible, setConfirmationVisible] = useState(false);
    const [confirming, setConfirming] = useState(false);

    // form state
    const [payerId, setPayerId] = useState("");
    const [receiverId, setReceiverId] = useState("");
    const [amount, setAmount] = useState("");
    const [description, setDescription] = useState("");
    const [currency, setCurrency] = useState(defaultCurrency);
    // add near other UI state
    const [groupContext, setGroupContext] = useState(false);

    // selection state (for suggested)
    const [selectedKey, setSelectedKey] = useState(null);
    const [selectedMeta, setSelectedMeta] = useState(null); // stable meta object for the selection
    const [selectedTxnIndex, setSelectedTxnIndex] = useState(null);

    // nested sheets
    const payerSheetRef = useRef(null);
    const receiverSheetRef = useRef(null);
    const currencySheetRef = useRef(null);

    const members = useMemo(() => {
        if (group?.members?.length) {
            return group.members.map((m) => ({ id: m._id, name: m.name }));
        }
        return friends;
    }, [group, friends]);

    const getMemberName = (id) => {
        if (!id) return "Unknown";
        const m = members.find((x) => x.id === id);
        if (!m) return "Unknown";
        return m.id === userId ? "You" : (m.name || "Unknown");
    };

    const resetForm = useCallback(() => {
        setPayerId("");
        setReceiverId("");
        setAmount("");
        setDescription("");
        setCurrency(defaultCurrency);
        setSettleMode("suggested");
        setSelectedTxnIndex(null);
        setSelectedKey(null);
        setSelectedMeta(null);
        setConfirmationVisible(false);
    }, [defaultCurrency]);
    // detect if we're being opened from a group and all txns belong to that group
    useEffect(() => {
        if (!group || !prunedTxns?.length) {
            setGroupContext(false);
            return;
        }
        const gid = group._id || group.id || null;
        if (!gid) {
            setGroupContext(false);
            return;
        }
        const allSameGroup = prunedTxns.every((t) => {
            const tgid = t.groupId || t.group?._id || t.groupId?._id || null;
            return String(tgid) === String(gid);
        });

        if (allSameGroup) {
            // set group context and prefill a group meta
            setGroupContext(true);
            const currencyFromTx = prunedTxns[0]?.currency || defaultCurrency;
            setSelectedMeta((prev) => ({
                ...(prev || {}),
                type: "group",
                name: group.name || "",
                ids: [gid],
                currency: prev?.currency || currencyFromTx,
                groupId: gid,
            }));
            // prefer the group's currency (or first txn) for UI
            setCurrency((c) => c || currencyFromTx);
            // keep suggested mode by default
            setSettleMode("suggested");
        } else {
            setGroupContext(false);
        }
    }, [group, prunedTxns, defaultCurrency]);

    useEffect(() => {
        if (prefill) {
            setPayerId(prefill.payerId || "");
            setReceiverId(prefill.receiverId || "");
            setAmount(Number(prefill.amount || 0) > 0 ? Number(prefill.amount).toFixed(2) : "");
            setDescription(prefill.description || "");
            setCurrency(prefill.currency || defaultCurrency);
            setSettleMode("suggested");
            if (prefill.meta) setSelectedMeta(prefill.meta);
        } else {
            // don't auto-reset on open (let sheet consumer decide). but if no prefill, keep defaults.
            // resetForm();
        }
    }, [prefill, defaultCurrency]);

    const isValid =
        payerId &&
        receiverId &&
        payerId !== receiverId &&
        Number(amount) > 0 &&
        !Number.isNaN(Number(amount));

    // stable key generator for transactions
    const keyOf = (tx) => {
        const gid = tx.groupId || tx?.group?._id || "";
        const gname = tx.name || "";
        return `${tx.type || "tx"}|${tx.currency || ""}|${tx.from || ""}|${tx.to || ""}|${Number(tx.amount || 0)}|${gid}|${gname}`;
    };
    const keyTuple = (t) => `${t.currency}|${t.from}|${t.to}|${Number(t.amount || 0)}`;

    // prune identical/duplicate rows like web version
    const pruneSettlementLists = (list = []) => {
        const byType = { net: [], all_personal: [], all_groups: [], group: [] };
        for (const x of list || []) {
            (byType[x.type] ||= []).push(x);
        }

        const hasGroups = byType.group.length > 0;
        const hasPersonal = byType.all_personal.length > 0;

        // Only one group, no personal: drop all_groups/net identical to that single group
        if (hasGroups && byType.group.length === 1 && !hasPersonal) {
            const g = byType.group[0];
            const gKey = keyTuple(g);
            byType.all_groups = byType.all_groups.filter(a => keyTuple(a) !== gKey);
            byType.net = byType.net.filter(n => keyTuple(n) !== gKey);
        }

        // Only personal, no groups: drop net rows identical to personal rows
        if (hasPersonal && !hasGroups) {
            const pKeys = new Set(byType.all_personal.map(keyTuple));
            byType.net = byType.net.filter(n => !pKeys.has(keyTuple(n)));
        }

        // One all_groups and one group identical → keep group, drop all_groups
        if (byType.all_groups.length === 1 && byType.group.length === 1) {
            if (keyTuple(byType.all_groups[0]) === keyTuple(byType.group[0])) {
                byType.all_groups = [];
            }
        }

        return [
            ...byType.net,
            ...byType.all_personal,
            // ...byType.all_groups,
            ...byType.group,
        ];
    };

    // ensure incoming transactions is an array
    // ensure incoming transactions is an array and normalize missing fields
    const normalizedTxns = useMemo(() => {
        let arr = [];
        if (!transactions) return [];
        if (Array.isArray(transactions)) arr = transactions.slice();
        else if (Array.isArray(transactions.items)) arr = transactions.items.slice();
        else return [];

        // canonical group id if parent passed group
        const gid = group?._id || group?.id || null;

        return arr.map((t) => {
            // shallow copy
            const tx = { ...t };

            // If no explicit type, default to 'group' when we have a parent group,
            // otherwise default to 'net' (you can change to 'all_personal' if desired).
            if (!tx.type) {
                tx.type = gid ? "group" : "net";
            }

            // If parent group provided and tx has no groupId, set it so pruning/grouping logic sees it
            if (gid && !tx.groupId) {
                tx.groupId = gid;
                // also set a name for group rows if useful
                if (!tx.name) tx.name = group?.name || "";
            }

            // normalize currency, amount to expected shapes
            if (tx.currency == null) tx.currency = defaultCurrency;
            tx.amount = Number(tx.amount || 0);

            return tx;
        });
    }, [transactions, group, defaultCurrency]);

    const prunedTxns = useMemo(() => pruneSettlementLists(normalizedTxns), [normalizedTxns]);

    // (optional) small debug logs — remove when happy
    useEffect(() => {
        // helpful while debugging to ensure normalization worked
        // eslint-disable-next-line no-console
        console.log("BtmShtSettle: prunedTxns:", prunedTxns);
        // eslint-disable-next-line no-console
        console.log("BtmShtSettle: grouped:", (prunedTxns || []).reduce((acc, tx) => {
            (acc[tx.type] ||= []).push(tx);
            return acc;
        }, {}));
    }, [prunedTxns]);

    // grouped by type for sections order
    const grouped = useMemo(() => {
        const g = (prunedTxns || []).reduce((acc, tx) => {
            (acc[tx.type] ||= []).push(tx);
            return acc;
        }, {});
        if (g.group) {
            g.group.sort((a, b) => {
                const an = (a.name || "Unnamed Group").localeCompare(b.name || "Unnamed Group");
                if (an !== 0) return an;
                return Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0));
            });
        }
        return g;
    }, [prunedTxns]);

    // formatting helpers
    const countGroupIds = (meta) => {
        if (!meta) return 0;
        if (Array.isArray(meta.ids)) return meta.ids.length;
        if (meta.ids && typeof meta.ids === "object") return Object.keys(meta.ids).length;
        if (meta.groups && typeof meta.groups === "object") return Object.keys(meta.groups).length;
        return 0;
    };

    const formatSettlementDetail = (meta) => {
        if (!meta?.type) return { badge: "CUSTOM", title: "Custom settlement", sub: "" };
        const gCount = countGroupIds(meta);
        const gText = gCount ? ` • ${gCount} group${gCount > 1 ? "s" : ""}` : "";

        switch (meta.type) {
            case "net":
                return { badge: "NET", title: "Settling all personal & group", sub: (meta.currency || "") + gText };
            case "all_personal":
                return { badge: "PERSONAL", title: "Settling personal", sub: meta.currency || "" };
            case "all_groups":
                return { badge: "GROUPS", title: "Settling all groups", sub: (meta.currency || "") + gText };
            case "group":
                return { badge: "GROUP", title: `Settling group${meta.name ? `: ${meta.name}` : ""}`, sub: meta.currency || "" };
            default:
                return { badge: "OTHER", title: "Settling", sub: meta.currency || "" };
        }
    };

    // on row tap from suggested list
    const handlePrefill = (txn) => {
        setPayerId(txn.from);
        setReceiverId(txn.to);
        setAmount(Number(txn.amount || 0).toFixed(2));
        setCurrency(txn.currency || defaultCurrency);
        setDescription(`Settling between ${getMemberName(txn.from)} and ${getMemberName(txn.to)}`);

        const key = keyOf(txn);
        setSelectedKey(key);

        // ensure meta has type, and if groupContext prefer group meta
        const normalized = { ...txn };
        if (!normalized.type) {
            normalized.type = groupContext ? "group" : "custom";
        }
        if (groupContext) {
            normalized.groupId = group._id || group.id;
            normalized.name = group.name || normalized.name;
            normalized.ids = normalized.ids || [group._id || group.id];
        }
        setSelectedMeta(normalized);
    };


    const handleToggle = (mode) => {
        setSettleMode(mode);
        // keep selection? web version resets selection; we'll clear
        setSelectedKey(null);
        setSelectedMeta(null);
        setSelectedTxnIndex(null);
        setConfirmationVisible(false);
    };

    const handleConfirmClick = () => {
        if (!isValid) return;
        if (!selectedMeta && settleMode === "custom") {
            setSelectedMeta({ type: "custom", currency }); // small default meta
        }
        setConfirmationVisible(true);
    };

    const handleFinalSubmit = async () => {
        if (!isValid) return;
        setConfirming(true);
        try {
            // clone current selectedMeta (if any)
            let metaToSend = selectedMeta ? { ...selectedMeta } : undefined;

            // If we're in custom mode and no meta exists, create a small default custom meta
            if (settleMode === "custom" && !metaToSend) {
                metaToSend = { type: "custom", currency: currency || defaultCurrency };
            }

            // If meta exists but has no explicit type, treat it as custom by default
            if (metaToSend && !metaToSend.type) {
                metaToSend.type = "custom";
            }

            // If groupContext (or selectedMeta references a group), force minimal group meta
            const gid = group?._id || group?.id || null;
            const metaRefsGroup = metaToSend && (metaToSend.groupId || (Array.isArray(metaToSend.ids) && metaToSend.ids.length));
            if (groupContext || metaRefsGroup) {
                metaToSend = {
                    type: "group",
                    currency: (metaToSend && metaToSend.currency) || currency || defaultCurrency,
                };
            }

            const payload = {
                payerId,
                receiverId,
                amount: parseFloat(amount),
                description,
                currency,
                meta: metaToSend,
            };
            console.log('payload', payload);

            await onSubmit?.(payload);

            // reset + close
            resetForm();
            onClose?.();
            innerRef?.current?.dismiss?.();
        } catch (e) {
            console.error("Settle submit error:", e);
        } finally {
            setConfirming(false);
        }
    };



    const handleSettleAll = async () => {
        setConfirming(true);
        try {
            // Build a sensible meta for Settle All
            let metaToSend = selectedMeta ? { ...selectedMeta } : undefined;

            if (groupContext) {
                metaToSend = {
                    ...(metaToSend || {}),
                    type: "group",
                    name: group?.name || "",
                    ids: [(group._id || group.id)],
                    groupId: group._id || group.id,
                    currency: metaToSend?.currency || (prunedTxns[0]?.currency || defaultCurrency),
                };
            } else {
                // generic all-personal/net scenario: if meta missing, mark as 'net'
                metaToSend = metaToSend || { type: "net", currency: prunedTxns[0]?.currency || defaultCurrency };
            }

            // allow parent to accept meta param (optional) - older parents may ignore it
            await onSubmitAll?.(metaToSend);
            resetForm();
            onClose?.();
            innerRef?.current?.dismiss?.();
        } catch (e) {
            console.error("Settle all error:", e);
        } finally {
            setConfirming(false);
        }
    };


    // render helpers
    const sectionOrder = ["net", "all_personal", "all_groups", "group"];
    const sectionLabels = {
        net: "Settle ALL (Net)",
        all_personal: "Settle Personal",
        all_groups: "Settle Groups (Total)",
        group: "Per-Group Settlements",
    };

    return (
        <MainBottomSheet
            innerRef={innerRef}
            onDismiss={() => {
                resetForm();
                onClose?.();
            }}
        >
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Text style={styles.headerText}>
                    {groupContext && group?.name ? `${group.name}` : "Settle Up"}
                </Text>
                <TouchableOpacity
                    onPress={() => {
                        resetForm();
                        innerRef.current?.dismiss?.();
                    }}
                >
                    <Text style={styles.closeText}>Close</Text>
                </TouchableOpacity>
            </View>


            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: insets.bottom + 120, paddingHorizontal: 16 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Mode Switch */}
                {!confirmationVisible && (
                    <View style={styles.modeContainer}>
                        <TouchableOpacity
                            onPress={() => handleToggle("suggested")}
                            style={[styles.modeBtn, settleMode === "suggested" && styles.modeBtnActive]}
                        >
                            <Text style={[styles.modeText, settleMode === "suggested" && styles.modeTextActive]}>
                                Suggested
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => handleToggle("custom")}
                            style={[styles.modeBtn, settleMode === "custom" && styles.modeBtnActive]}
                        >
                            <Text style={[styles.modeText, settleMode === "custom" && styles.modeTextActive]}>
                                Custom
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* CONTENT */}
                {confirmationVisible ? (
                    <View style={styles.confirmWrap}>
                        {(() => {
                            const { badge, title, sub } = formatSettlementDetail(selectedMeta);
                            return (
                                <View style={{ alignItems: "center", marginBottom: 12 }}>
                                    <View style={styles.badgeRow}>
                                        <Text style={styles.badge}>{badge}</Text>
                                        <Text style={styles.confirmTitle}>{title}</Text>
                                    </View>
                                    {sub ? <Text style={styles.confirmSub}>{sub}</Text> : null}
                                </View>
                            );
                        })()}

                        <Text style={styles.confirmText}>{getMemberName(payerId)} → {getMemberName(receiverId)}</Text>
                        <Text style={styles.confirmAmount}>
                            {getSymbol(currency)} {Number(amount || 0).toFixed(2)}
                        </Text>
                        {description ? <Text style={styles.confirmDesc}>{description}</Text> : null}
                        {selectedMeta?.ids && Array.isArray(selectedMeta.ids) && selectedMeta.ids.length ? (
                            <Text style={styles.confirmSmall}>
                                Applies to {selectedMeta.ids.length} group{selectedMeta.ids.length > 1 ? "s" : ""}.
                            </Text>
                        ) : null}
                    </View>
                ) : settleMode === "suggested" ? (
                    <View style={{ marginTop: 12 }}>
                        {sectionOrder.map((type) => {
                            const txns = grouped[type] || [];
                            if (!txns.length) return null;
                            return (
                                <View key={type} style={{ marginBottom: 12 }}>
                                    <Text style={styles.sectionLabel}>{sectionLabels[type]}</Text>
                                    <View style={{ marginTop: 6 }}>
                                        {txns.map((txn) => {
                                            const rowKey = keyOf(txn);
                                            const from = getMemberName(txn.from);
                                            const to = getMemberName(txn.to);
                                            const amt = Number(txn.amount || 0).toFixed(2);
                                            const sym = getSymbol(txn.currency);
                                            const theyPayYou = txn.to === userId;
                                            const amtStyle = theyPayYou ? styles.amtPositive : styles.amtNegative;
                                            const isSelected = rowKey === selectedKey;

                                            return (
                                                <TouchableOpacity
                                                    key={rowKey}
                                                    onPress={() => {
                                                        setSelectedKey(rowKey);
                                                        handlePrefill(txn);
                                                        setConfirmationVisible(false);
                                                    }}
                                                    style={[styles.txRow, isSelected && styles.txRowSelected]}
                                                >
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={styles.txLabel}>{from} → {to}</Text>
                                                        {/* only show group name in the row when not opened from that same group */}
                                                        {type === "group" && !groupContext && (
                                                            <Text style={styles.txSub}>{txn.name || "Unnamed Group"}</Text>
                                                        )}
                                                    </View>

                                                    <Text style={[styles.txAmount, amtStyle]}>{sym} {amt}</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>
                            );
                        })}

                        {(!prunedTxns || prunedTxns.length === 0) && (
                            <Text style={styles.emptyText}>Nothing to settle — all clear! 🎉</Text>
                        )}

                        <Text style={styles.hintText}>
                            Select a transaction or create a{" "}
                            <Text style={styles.linkText} onPress={() => handleToggle("custom")}>custom one</Text>.
                        </Text>
                    </View>

                ) : (
                    // CUSTOM MODE UI
                    <View style={{ marginTop: 12 }}>
                        <Text style={styles.sectionLabel}>Paid By</Text>
                        <TouchableOpacity style={styles.select} onPress={() => payerSheetRef.current?.present?.()}>
                            <Text style={{ color: payerId ? colors.text : colors.muted }}>
                                {payerId ? getMemberName(payerId) : "Select payer"}
                            </Text>
                        </TouchableOpacity>

                        <Text style={styles.sectionLabel}>Received By</Text>
                        <TouchableOpacity style={styles.select} onPress={() => receiverSheetRef.current?.present?.()}>
                            <Text style={{ color: receiverId ? colors.text : colors.muted }}>
                                {receiverId ? getMemberName(receiverId) : "Select receiver"}
                            </Text>
                        </TouchableOpacity>

                        <Text style={styles.sectionLabel}>Currency</Text>
                        <TouchableOpacity style={styles.select} onPress={() => currencySheetRef.current?.present?.()}>
                            <Text style={{ color: currency ? colors.text : colors.muted }}>
                                {currency || "Select currency"}
                            </Text>
                        </TouchableOpacity>

                        <Text style={styles.sectionLabel}>Amount</Text>
                        <TextInput
                            keyboardType="numeric"
                            value={amount}
                            onChangeText={setAmount}
                            placeholder="0.00"
                            placeholderTextColor={colors.muted}
                            style={[styles.amountInput, { color: colors.text }]}
                        />

                        <Text style={styles.sectionLabel}>Description (optional)</Text>
                        <TextInput
                            value={description}
                            onChangeText={setDescription}
                            placeholder="Description"
                            placeholderTextColor={colors.muted}
                            style={[styles.textInput, { color: colors.text }]}
                        />
                    </View>
                )}
            </ScrollView>

            {/* Footer */}
            {/* Footer */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
                {/* LEFT (Settle All) */}
                <View style={styles.footerLeft}>
                    {settleMode === "suggested" && !confirmationVisible ? (
                        <TouchableOpacity
                            style={[styles.btnPrimary, { backgroundColor: colors.cta }]}
                            onPress={handleSettleAll}
                            disabled={confirming}
                        >
                            <Text style={[styles.btnText, { color: colors.background, fontWeight: "700" }]}>
                                {confirming ? "Recording..." : "Settle All"}
                            </Text>
                        </TouchableOpacity>
                    ) : null}
                </View>

                {/* RIGHT (other controls) */}
                <View style={styles.footerRight}>
                    {confirmationVisible ? (
                        <>
                            <TouchableOpacity style={styles.btnSecondary} onPress={() => setConfirmationVisible(false)}>
                                <Text style={styles.btnText}>Back</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                disabled={!isValid || confirming}
                                style={[styles.btnPrimary, (!isValid || confirming) && { opacity: 0.6 }]}
                                onPress={handleFinalSubmit}
                            >
                                <Text style={[styles.btnText, { color: colors.background, fontWeight: "700" }]}>
                                    {confirming ? "Recording..." : "Confirm"}
                                </Text>
                            </TouchableOpacity>
                        </>
                    ) : settleMode === "suggested" ? (
                        <>
                            {/* Cancel */}
                            <TouchableOpacity
                                style={styles.btnSecondary}
                                onPress={() => {
                                    resetForm();
                                    onClose?.();
                                    innerRef?.current?.dismiss?.();
                                }}
                            >
                                <Text style={styles.btnText}>Cancel</Text>
                            </TouchableOpacity>

                            {/* Confirm selection */}
                            <TouchableOpacity
                                disabled={!selectedKey}
                                style={[styles.btnPrimary, !selectedKey && { opacity: 0.4 }]}
                                onPress={() => setConfirmationVisible(true)}
                            >
                                <Text style={[styles.btnText, { color: colors.background, fontWeight: "700" }]}>
                                    Confirm
                                </Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        /* custom mode buttons (Cancel | Confirm) */
                        <>
                            <TouchableOpacity
                                style={styles.btnSecondary}
                                onPress={() => {
                                    resetForm();
                                    onClose?.();
                                    innerRef?.current?.dismiss?.();
                                }}
                            >
                                <Text style={styles.btnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                disabled={!isValid}
                                style={[styles.btnPrimary, !isValid && { opacity: 0.4 }]}
                                onPress={() => setConfirmationVisible(true)}
                            >
                                <Text style={[styles.btnText, { color: colors.background, fontWeight: "700" }]}>
                                    Confirm
                                </Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>


            {/* Payer select sheet */}
            <MainBottomSheet innerRef={payerSheetRef} onDismiss={() => { }}>
                <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                    <Text style={styles.headerText}>Select Payer</Text>
                    <TouchableOpacity onPress={() => payerSheetRef.current?.dismiss?.()}>
                        <Text style={styles.closeText}>Close</Text>
                    </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={{ padding: 16 }}>
                    {members.map((m) => (
                        <TouchableOpacity
                            key={m.id}
                            style={[styles.chip, payerId === m.id && styles.chipActive]}
                            onPress={() => {
                                setPayerId(m.id);
                                payerSheetRef.current?.dismiss?.();
                            }}
                        >
                            <Text style={[styles.chipText, payerId === m.id && styles.chipTextActive]}>
                                {m.id === userId ? "You" : m.name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </MainBottomSheet>

            {/* Receiver select sheet */}
            <MainBottomSheet innerRef={receiverSheetRef} onDismiss={() => { }}>
                <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                    <Text style={styles.headerText}>Select Receiver</Text>
                    <TouchableOpacity onPress={() => receiverSheetRef.current?.dismiss?.()}>
                        <Text style={styles.closeText}>Close</Text>
                    </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={{ padding: 16 }}>
                    {members.map((m) => (
                        <TouchableOpacity
                            key={m.id}
                            style={[styles.chip, receiverId === m.id && styles.chipActive]}
                            onPress={() => {
                                setReceiverId(m.id);
                                receiverSheetRef.current?.dismiss?.();
                            }}
                        >
                            <Text style={[styles.chipText, receiverId === m.id && styles.chipTextActive]}>
                                {m.id === userId ? "You" : m.name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </MainBottomSheet>

            {/* Currency picker */}
            <CurrenciesSheet
                innerRef={currencySheetRef}
                value={currency}
                options={currencyOptions}
                onSelect={(val) => {
                    setCurrency(val);
                    currencySheetRef.current?.dismiss?.();
                }}
                onClose={() => currencySheetRef.current?.dismiss?.()}
            />
        </MainBottomSheet>
    );
};

export default BtmShtSettle;

/* Styles */
const createStyles = (colors = {}) =>
    StyleSheet.create({
        header: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border ?? "#333",
            backgroundColor: colors.card ?? "#1f1f1f",
        },
        headerText: { color: colors.text ?? "#EBF1D5", fontSize: 18, fontWeight: "700" },
        closeText: { color: colors.negative ?? "#EA4335", fontSize: 16, fontWeight: "600" },

        modeContainer: {
            alignSelf: "center",
            marginTop: 8,
            flexDirection: "row",
            borderRadius: 999,
            backgroundColor: colors.card ?? "#1f1f1f",
            borderWidth: 1,
            borderColor: colors.text ?? "#EBF1D5",
            padding: 4,
        },
        modeBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999 },
        modeBtnActive: { backgroundColor: colors.text ?? "#EBF1D5" },
        modeText: { color: colors.text ?? "#EBF1D5", fontWeight: "600" },
        modeTextActive: { color: colors.background ?? "#121212", fontWeight: "700" },

        sectionLabel: { color: colors.muted ?? "#9aa090", fontSize: 12, marginBottom: 6, textTransform: "uppercase" },
        txRow: {
            borderWidth: 1,
            borderColor: colors.border ?? "#333",
            borderRadius: 12,
            padding: 12,
            marginBottom: 8,
            backgroundColor: colors.card ?? "#1f1f1f",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
        },
        txRowSelected: { backgroundColor: colors.primary ? `${colors.primary}22` : "#0d3b36", borderColor: colors.cta ?? "#00C49F" },
        txLabel: { color: colors.text ?? "#EBF1D5", fontSize: 14, fontWeight: "600" },
        txSub: { color: colors.muted ?? "#9aa090", fontSize: 12, marginTop: 4 },
        txAmount: { fontWeight: "700", fontSize: 15 },
        amtPositive: { color: colors.positive ?? "#60DFC9" },
        amtNegative: { color: colors.negative ?? "#EA4335" },

        emptyText: { color: colors.muted ?? "#c9c9c9", textAlign: "center", marginVertical: 20 },

        hintText: { color: colors.muted ?? "#9aa090", textAlign: "center", marginTop: 8 },
        linkText: { color: colors.text ?? "#EBF1D5", textDecorationLine: "underline" },

        select: { borderBottomWidth: 2, borderColor: colors.border ?? "#55554f", paddingVertical: 10, paddingHorizontal: 8, marginBottom: 8 },

        amountInput: { borderBottomWidth: 2, borderColor: colors.border ?? "#55554f", paddingVertical: 10, paddingHorizontal: 8, marginBottom: 8, fontSize: 18 },
        textInput: { borderBottomWidth: 2, borderColor: colors.border ?? "#55554f", paddingVertical: 10, paddingHorizontal: 8, marginBottom: 8, fontSize: 16 },

        confirmWrap: { alignItems: "center", paddingVertical: 20 },
        badgeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
        badge: { color: colors.muted ?? "#cfcfcf", fontSize: 12, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: colors.border ?? "#333" },
        confirmTitle: { color: colors.text ?? "#EBF1D5", fontSize: 14, marginLeft: 8 },
        confirmSub: { color: colors.muted ?? "#9aa090", fontSize: 12 },

        confirmText: { fontSize: 16, color: colors.text ?? "#EBF1D5", marginTop: 6 },
        confirmAmount: { fontSize: 22, color: colors.cta ?? "#00C49F", fontWeight: "700", marginTop: 6 },
        confirmDesc: { color: colors.muted ?? "#c9c9c9", marginTop: 6 },
        confirmSmall: { color: colors.muted ?? "#9aa090", marginTop: 6 },

        chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border ?? "#333", marginBottom: 8 },
        chipActive: { backgroundColor: colors.primary ? `${colors.primary}22` : "#DFF3E8", borderColor: colors.cta ?? "#00C49F" },
        chipText: { color: colors.text ?? "#EBF1D5" },
        chipTextActive: { color: colors.background ?? "#121212", fontWeight: "700" },

        footer: {
            flexDirection: "row",
            justifyContent: "space-between", // <--- changed to space-between
            alignItems: "center",
            gap: 12,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border ?? "#333",
            backgroundColor: colors.card ?? "#212121",
            paddingTop: 12,
            paddingHorizontal: 16,
        },
        footerLeft: {
            flex: 1,
            alignItems: "flex-start",
            justifyContent: "center",
        },
        footerRight: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 12,
        },

        btnSecondary: {
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: colors.cardAlt ?? "#2a2a2a",
        },
        btnPrimary: {
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: colors.cta ?? "#00C49F",
        },
        btnText: { color: colors.text ?? "#EBF1D5", fontWeight: "600" },
    });

