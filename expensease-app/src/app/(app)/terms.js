// app/settings/TermsAndConditions.js
import React, { useMemo } from "react";
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import UserCheck from "@/accIcons/userCheck.svg";
import FileText from "@/accIcons/fileText.svg";
import Header from "~/header";
import { useTheme } from "context/ThemeProvider";
import { useAuth } from "context/AuthContext"; // optional

const UPDATED = "August 27, 2025";
const SUPPORT_EMAIL = "email.expensease@gmail.com";

export default function TermsScreen() {
    const router = useRouter();
    const { theme } = useTheme();
    const { width } = useWindowDimensions();
    const isWide = width >= 700;
    const styles = useMemo(() => createStyles(theme, isWide), [theme, isWide]);

    const auth = useAuth?.() ?? null;
    const userToken = auth?.token ?? auth?.user?.token ?? auth?.user ?? null;

    const handleCTA = () => {
        if (userToken) router.push("/home");
        else router.push("/");
    };

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <StatusBar style={theme.statusBarStyle === "dark-content" ? "dark" : "light"} />
            <Header showBack title="Terms of Service" />

            <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
                <View style={styles.heroRow}>
                    <View style={styles.heroMain}>
                        <Text style={styles.h1}>Terms of Service</Text>
                        <Text style={styles.updated}>
                            Last updated: <Text style={styles.updatedBold}>{UPDATED}</Text>
                        </Text>

                        <Text style={styles.lead}>
                            These terms govern your use of Expensease. By using the Service you agree to these Terms. Please read them carefully.
                        </Text>

                        <View style={styles.actionsRow}>
                            <TouchableOpacity style={styles.primaryBtn} onPress={handleCTA} activeOpacity={0.85}>
                                <UserCheck width={16} height={16} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={styles.primaryBtnText}>{userToken ? "Open Home" : "Create free account"}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.heroAside}>
                        <View style={styles.highlight}>
                            <View style={styles.iconWrap}>
                                <FileText width={18} height={18} color={theme.colors.primary} />
                            </View>
                            <View style={styles.highlightTextWrap}>
                                <Text style={styles.highlightTitle}>Quick summary</Text>
                                <Text style={styles.highlightSubtitle}>Use the app responsibly • Be accurate with data • We may suspend accounts for abuse</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Sections */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Using the Service</Text>
                    <Text style={styles.paragraph}>
                        You must follow all applicable laws when using Expensease. Do not misuse the Service (for example, don't upload illegal content, attempt unauthorized access, or harass others).
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Accounts</Text>
                    <Text style={styles.paragraph}>
                        Accounts are created using Google Sign-In. You are responsible for any activity under your account. Keep your account details accurate and notify support if you suspect unauthorized access.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Content & responsibility</Text>
                    <Text style={styles.paragraph}>
                        You retain ownership of content you create. By submitting content you grant Expensease a license to operate the Service (store, display, transmit). We are not responsible for user-generated content and may remove content that violates these Terms.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Fees & payments</Text>
                    <Text style={[styles.paragraph, styles.muted]}>At present, Expensease is free and does not process payments. If we introduce paid features, terms and pricing will be shared and consent gathered separately.</Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Termination & suspension</Text>
                    <Text style={styles.paragraph}>
                        We may suspend or terminate accounts that violate these Terms or for operational reasons. You may delete your account by contacting support; some information may be retained for legal purposes.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Changes to terms</Text>
                    <Text style={styles.paragraph}>
                        We may update these Terms. When material changes occur we will notify users. Continued use after updates means you accept the new terms.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Governing law</Text>
                    <Text style={styles.paragraph}>
                        These Terms are governed by the laws of the jurisdiction in which Expensease operates. For support or legal requests email: {SUPPORT_EMAIL}
                    </Text>
                </View>

                <View style={styles.cta}>
                    <Text style={styles.ctaTitle}>Agree & continue</Text>
                    <Text style={styles.ctaSubtitle}>By creating an account you confirm you have read and accepted these Terms of Service.</Text>
                    <TouchableOpacity style={styles.ctaBtn} onPress={handleCTA} activeOpacity={0.85}>
                        <Text style={styles.ctaBtnText}>{userToken ? "Open Home" : "Create free account"}</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const createStyles = (theme, isWide) =>
    StyleSheet.create({
        safe: { flex: 1, backgroundColor: theme.colors.background },
        container: { padding: 16, paddingBottom: 48 },

        heroRow: { flexDirection: isWide ? "row" : "column", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 },
        heroMain: { flex: 1, paddingRight: isWide ? 8 : 0, marginBottom: isWide ? 0 : 12 },
        heroAside: { width: isWide ? 180 : "100%" },

        h1: { fontSize: 24, fontWeight: "800", color: theme.colors.primary, marginBottom: 6 },
        updated: { color: theme.colors.muted, fontSize: 12, marginBottom: 8 },
        updatedBold: { fontWeight: "700", color: theme.colors.text },

        lead: { color: theme.colors.text, fontSize: 14, lineHeight: 20, marginBottom: 12 },

        actionsRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
        primaryBtn: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.primary, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
        primaryBtnText: { color: "#fff", fontWeight: "700" },
        ghostBtn: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginLeft: 10, backgroundColor: theme.colors.card },
        ghostBtnText: { color: theme.colors.text },

        highlight: { padding: 12, borderRadius: 14, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, flexDirection: "row", alignItems: "flex-start" },
        iconWrap: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface ?? theme.colors.card },
        highlightTextWrap: { flex: 1 },
        highlightTitle: { fontSize: 13, fontWeight: "700", color: theme.colors.primary, marginBottom: 4 },
        highlightSubtitle: { fontSize: 12, color: theme.colors.muted, lineHeight: 18 },

        section: { marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
        sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.primary, marginBottom: 8 },
        paragraph: { color: theme.colors.text, fontSize: 14, lineHeight: 20, marginBottom: 8 },
        muted: { color: theme.colors.muted },

        cta: { marginTop: 18, padding: 16, borderRadius: 14, backgroundColor: theme.colors.surface ?? theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center" },
        ctaTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.primary },
        ctaSubtitle: { marginTop: 6, color: theme.colors.muted, textAlign: "center" },
        ctaBtn: { marginTop: 12, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 12, backgroundColor: theme.colors.primary },
        ctaBtnText: { color: "#fff", fontWeight: "700" },
    });