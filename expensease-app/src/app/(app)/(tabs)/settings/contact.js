// app/settings/Contact.js
import React, { useEffect, useMemo, useState } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Alert,
    Keyboard,
    Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import Contact from "@/accIcons/contact.svg"; // Example SVG import
import Send from "@/accIcons/send.svg"; // Example SVG import
import Copy from "@/accIcons/copy.svg"; // Example SVG import
import { useRouter } from "expo-router";

import Header from "~/header";
import { useTheme } from "context/ThemeProvider";
// import { useAuth } from "context/AuthContext"; // optional

const SUPPORT_EMAIL = "email.expensease@gmail.com";
const UPDATED = "August 27, 2025"; // keep if you want to show update date

export default function ContactScreen() {
    const router = useRouter();
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    // Optional: get user info from auth context
    // const { user } = useAuth?.() ?? {};
    // const prefillEmail = user?.email ?? "";

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [topic, setTopic] = useState("general");
    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [status, setStatus] = useState(null); // { type: 'success'|'error', msg: string }
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        // If you have user info stored in context or storage, prefill here:
        // if (prefillEmail) setEmail(prefillEmail);
    }, []);

    function validate() {
        if (!message.trim()) {
            setStatus({ type: "error", msg: "Please write a short message describing your request." });
            return false;
        }
        if (!email.trim()) {
            setStatus({ type: "error", msg: "Please include your email so we can respond." });
            return false;
        }
        // simple email regex
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            setStatus({ type: "error", msg: "Please enter a valid email address." });
            return false;
        }
        return true;
    }

    async function handleSendMail() {
        setStatus(null);
        Keyboard.dismiss();
        if (!validate()) return;

        setSubmitting(true);
        // Build mailto body
        const subject = `[Expensease] ${topic === "general" ? "Support request" : topic}`;
        const bodyLines = [
            `Name: ${name || "—"}`,
            `Email: ${email}`,
            `Topic: ${topic}`,
            "",
            "Message:",
            message.trim(),
            "",
            "—",
            "Sent from Expensease mobile app",
        ];
        const body = bodyLines.join("\n");

        // Use Linking to open mail client (mailto:)
        const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        try {
            const supported = await Linking.canOpenURL(mailto);
            if (supported) {
                await Linking.openURL(mailto);
                setStatus({ type: "success", msg: "Your mail client should open — hit Send to deliver your message." });
            } else {
                // Fallback: copy email and show instructions
                await Clipboard.setStringAsync(SUPPORT_EMAIL);
                setCopied(true);
                setStatus({ type: "error", msg: "Couldn't open mail app. Support email copied to clipboard." });
                setTimeout(() => setCopied(false), 2500);
            }
        } catch (err) {
            console.error("mailto error:", err);
            await Clipboard.setStringAsync(SUPPORT_EMAIL);
            setCopied(true);
            setStatus({ type: "error", msg: "Couldn't open mail app. Support email copied to clipboard." });
            setTimeout(() => setCopied(false), 2500);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleCopyEmail() {
        try {
            await Clipboard.setStringAsync(SUPPORT_EMAIL);
            setCopied(true);
            setStatus({ type: "success", msg: `Support email copied: ${SUPPORT_EMAIL}` });
            setTimeout(() => setCopied(false), 2500);
        } catch (err) {
            console.error("copy failed", err);
            setStatus({ type: "error", msg: "Copy failed — please manually email " + SUPPORT_EMAIL });
        }
    }

    function StatusPill() {
        if (!status) return null;
        const isError = status.type === "error";
        return (
            <View
                accessibilityLiveRegion="polite"
                style={[styles.statusPill, isError ? styles.statusError : styles.statusSuccess]}
            >

                <Text style={[styles.statusText, isError ? { color: "#9b1c1c" } : { color: "#0f766e" }]}>{status.msg}</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <StatusBar style={theme.statusBarStyle === "dark-content" ? "dark" : "light"} />
            <Header showBack title="Contact support" />
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <View style={styles.hero}>
                    <View style={styles.heroIcon}>
                        <Contact height={20} width={20} color={theme.colors.textDark ?? "#000"} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.lead}>
                            Need help, found a bug, or want to suggest a feature? Fill the quick form below and we'll get back to you.
                        </Text>
                    </View>
                </View>
                <Text style={styles.small}>
                    Or email us directly:{" "}
                    <Text style={styles.link} onPress={handleCopyEmail}>
                        {SUPPORT_EMAIL}
                    </Text>
                    {copied ? " — Copied!" : ""}
                </Text>
                <Text style={styles.small}>Typical response time: 1–2 business days.</Text>

                <View style={styles.formCard}>
                    <View style={styles.field}>
                        <Text style={styles.label}>Your name (optional)</Text>
                        <TextInput
                            value={name}
                            onChangeText={setName}
                            placeholder="e.g., Priya Sharma"
                            placeholderTextColor={theme.colors.muted}
                            style={styles.input}
                            returnKeyType="next"
                            accessibilityLabel="Your name"
                        />
                    </View>

                    <View style={styles.field}>
                        <Text style={styles.label}>Email (so we can reply)</Text>
                        <TextInput
                            value={email}
                            onChangeText={setEmail}
                            placeholder="you@domain.com"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            placeholderTextColor={theme.colors.muted}
                            style={styles.input}
                            accessibilityLabel="Your email"
                        />
                    </View>

                    <View style={styles.field}>
                        <Text style={styles.label}>Topic</Text>
                        <View style={styles.selectRow}>
                            {[
                                { key: "general", label: "General" },
                                { key: "bug", label: "Bug" },
                                { key: "feature", label: "Feature" },
                                { key: "billing", label: "Billing" },
                                { key: "partnership", label: "Partnership" },
                            ].map((opt) => {
                                const active = topic === opt.key;
                                return (
                                    <TouchableOpacity
                                        key={opt.key}
                                        onPress={() => setTopic(opt.key)}
                                        style={[styles.topicBtn, active && styles.topicBtnActive]}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active }}
                                    >
                                        <Text style={[styles.topicText, active && styles.topicTextActive]}>{opt.label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    <View style={styles.field}>
                        <Text style={styles.label}>Message</Text>
                        <TextInput
                            value={message}
                            onChangeText={setMessage}
                            placeholder="Tell us what's happening — include steps to reproduce bugs or details about your feature idea."
                            placeholderTextColor={theme.colors.muted}
                            style={[styles.input, styles.textArea]}
                            multiline
                            numberOfLines={6}
                            textAlignVertical="top"
                            accessibilityLabel="Message"
                        />
                    </View>

                    <View style={styles.row}>
                        <TouchableOpacity
                            onPress={handleSendMail}
                            style={[styles.primaryBtn, submitting && { opacity: 0.7 }]}
                            disabled={submitting}
                            accessibilityRole="button"
                            accessibilityLabel="Send message"
                        >
                            <Send width={16} height={16} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.primaryBtnText}>{submitting ? "Preparing..." : "Email support"}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={handleCopyEmail} style={styles.ghostBtn} accessibilityRole="button" accessibilityLabel="Copy support email">
                            <Copy width={16} height={16} color={theme.colors.text} style={{ marginRight: 8 }} />
                            <Text style={styles.ghostBtnText}>{copied ? "Copied!" : "Copy email"}</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.note}>Do not include passwords, one-time codes, or full credit card numbers here.</Text>

                    <View style={{ marginTop: 10, }}>
                        <StatusPill />
                    </View>
                </View>

                <View style={styles.tipsCard}>
                    <Text style={styles.tipTitle}>Tips for faster support</Text>
                    <View style={styles.tipList}>
                        <Text style={styles.tipItem}>• Include steps to reproduce bugs (device, OS, version, steps).</Text>
                        <Text style={styles.tipItem}>• Attach any transaction IDs or timestamps for account-related issues.</Text>
                        <Text style={styles.tipItem}>• Mention the Google email used to sign in if it's an account issue.</Text>
                    </View>
                </View>

                <View style={styles.ctaRow}>
                    <TouchableOpacity style={styles.ctaCard} onPress={() => router.push("/settings/faq")}>
                        <Text style={styles.ctaTitle}>Check FAQs</Text>
                        <Text style={styles.ctaSubtitle}>Many common questions are answered in the help center — the fastest way to get help for general topics.</Text>
                    </TouchableOpacity>

                    {/* <TouchableOpacity style={[styles.ctaCard, styles.ctaCardAlt]} onPress={() => router.push("/feedback")}>
            <Text style={styles.ctaTitle}>Business & partnerships</Text>
            <Text style={styles.ctaSubtitle}>Interested in partnerships or integrations? Tell us more via the form above and choose Partnership.</Text>
          </TouchableOpacity> */}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

/* ---------- Styles ---------- */

const createStyles = (theme) =>
    StyleSheet.create({
        safe: { flex: 1, backgroundColor: theme.colors.background },
        container: { padding: 16, paddingBottom: 48 },
        hero: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 6 },
        heroIcon: {
            width: 48,
            height: 48,
            borderRadius: 12,
            backgroundColor: theme.colors.primary,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
        },
        h1: { fontSize: 20, fontWeight: "800", color: theme.colors.primary },
        lead: { marginTop: 4, color: theme.colors.text, fontSize: 13, lineHeight: 18 },
        small: { color: theme.colors.muted, fontSize: 12, marginBottom: 6 },
        link: { color: theme.colors.primary, textDecorationLine: "underline" },

        formCard: {
            marginTop: 6,
            padding: 14,
            borderRadius: 12,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
        },
        field: { marginBottom: 12 },
        label: { fontSize: 13, fontWeight: "600", color: theme.colors.text },
        input: {
            marginTop: 8,
            paddingHorizontal: 12,
            paddingVertical: Platform.OS === "android" ? 8 : 10,
            borderRadius: 10,
            backgroundColor: theme.colors.surface,
            color: theme.colors.text,
            borderWidth: 1,
            borderColor: theme.colors.border,
        },
        textArea: { height: 120 },

        selectRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
        topicBtn: {
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 999,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            marginRight: 8,
            marginTop: 8,
        },
        topicBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
        topicText: { color: theme.colors.text, fontSize: 13 },
        topicTextActive: { color: "#fff" },

        row: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 10, marginTop: 6 },
        primaryBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: theme.colors.primary },
        primaryBtnText: { color: "#fff", fontWeight: "700" },
        ghostBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card },
        ghostBtnText: { color: theme.colors.text },

        note: { marginTop: 8, fontSize: 12, color: theme.colors.muted },

        statusPill: { marginTop: 8, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", paddingVertical: 6, marginRight: 10, paddingHorizontal: 10, borderRadius: 999, maxWidth: '100%' },
        statusText: { fontSize: 13 },
        statusError: { backgroundColor: "#fff1f2", borderColor: "#fecaca" },
        statusSuccess: { backgroundColor: "#ecfdf5", borderColor: "#bbf7d0" },

        tipsCard: {
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
        },
        tipTitle: { fontWeight: "700", color: theme.colors.text },
        tipList: { marginTop: 8 },
        tipItem: { color: theme.colors.text, marginTop: 6, fontSize: 13 },

        ctaRow: { marginTop: 12, flexDirection: "row", gap: 12 },
        ctaCard: {
            flex: 1,
            padding: 12,
            borderRadius: 12,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
        },
        ctaCardAlt: { backgroundColor: theme.colors.surface },
        ctaTitle: { fontWeight: "700", color: theme.colors.text },
        ctaSubtitle: { marginTop: 6, color: theme.colors.muted },
    });
