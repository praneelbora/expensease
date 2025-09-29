// app/settings/PrivacyPolicy.js
import React, { useMemo } from "react";
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Linking,
    Platform,
    useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import Grid from "@/accIcons/grid.svg";
import Privacy from "@/accIcons/privacy.svg";
import Contact from "@/accIcons/contact.svg";
import FAQ from "@/accIcons/faq.svg";
import Header from "~/header";
import { useTheme } from "context/ThemeProvider";
import { useAuth } from "context/AuthContext"; // optional; safe to remove if not present

const UPDATED = "August 27, 2025";
const SUPPORT_EMAIL = "email.expensease@gmail.com";

export default function PrivacyPolicyScreen() {
    const router = useRouter();
    const { theme } = useTheme();
    const { width } = useWindowDimensions();
    const isWide = width >= 700; // breakpoint: tablet / wide phone
    const styles = useMemo(() => createStyles(theme, isWide), [theme, isWide]);

    // simple auth detection (adjust to your hook shape)
    const auth = useAuth?.() ?? null;
    const userToken = auth?.token ?? auth?.user?.token ?? auth?.user ?? null;

    const handleContact = () => {
        const email = SUPPORT_EMAIL;
        const subject = encodeURIComponent("Expensease Support");
        const body = encodeURIComponent("");
        const url = `mailto:${email}?subject=${subject}&body=${body}`;
        Linking.openURL(url).catch(() => {
            const webUrl = `mailto:${email}`;
            Linking.openURL(webUrl).catch(() => null);
        });
    };

    const handleCTA = () => {
        if (userToken) {
            router.push("/home");
        } else {
            router.push("/login");
        }
    };

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <StatusBar style={theme.statusBarStyle === "dark-content" ? "dark" : "light"} />
            <Header showBack title="Privacy & Data" />

            <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
                {/* Hero */}
                <View style={styles.heroRow}>
                    <View style={styles.heroMain}>
                        <Text style={styles.h1}>Privacy Policy</Text>
                        <Text style={styles.updated}>
                            Last updated: <Text style={styles.updatedBold}>{UPDATED}</Text>
                        </Text>

                        <Text style={styles.lead}>
                            We respect your privacy. This policy explains what we collect, how we use it, and the choices you have.
                            If you sign in with Google, we only request the basic profile information (name and email) needed to create your account.
                        </Text>

                        <View style={styles.actionsRow}>
                            <TouchableOpacity style={styles.primaryBtn} onPress={handleCTA} activeOpacity={0.85}>
                                <Grid width={16} height={16} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={styles.primaryBtnText}>{userToken ? "Home Screen" : "Create free account"}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.ghostBtn} onPress={handleContact} activeOpacity={0.85}>
                                <Contact name="mail" height={16} width={16} color={theme.colors.text} style={{ marginRight: 8 }} />
                                <Text style={styles.ghostBtnText}>Contact support</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.heroAside}>
                        <View style={styles.highlight}>
                            <View style={styles.iconWrap}>
                                <Privacy height={20} width={20} color={theme.colors.primary} />
                            </View>
                            <View style={styles.highlightTextWrap}>
                                <Text style={styles.highlightTitle}>Highlights</Text>
                                <Text style={styles.highlightSubtitle}>We collect name & email (Google) • Usage analytics • Support messages</Text>

                                {/* Quick links inside highlight card */}
                                <View style={styles.quickLinks}>
                                    <TouchableOpacity onPress={() => router.push("/settings/faq")} style={styles.quickLinkBtn}>
                                        <FAQ width={14} height={14} color={theme.colors.primary} />
                                        <Text style={styles.quickLinkText}>FAQs</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity onPress={() => router.push("/settings/contact")} style={styles.quickLinkBtn}>
                                        <Contact width={14} height={14} color={theme.colors.primary} />
                                        <Text style={styles.quickLinkText}>Contact</Text>
                                    </TouchableOpacity>


                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Article sections */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Data we collect</Text>

                    <Text style={styles.paragraph}>
                        <Text style={styles.bold}>Account info: </Text>
                        When you sign in with Google we collect your name and email to create and manage your account. We do not request your Google password.
                    </Text>

                    <Text style={styles.paragraph}>
                        <Text style={styles.bold}>Usage data: </Text>
                        We collect anonymous/aggregate analytics and basic usage events to improve the product (page visits, feature usage). We do not tie analytics to sensitive fields beyond normal account identifiers.
                    </Text>

                    <Text style={styles.paragraph}>
                        <Text style={styles.bold}>Support messages: </Text>
                        If you contact support, we retain the message and provided contact details to respond.
                    </Text>

                    <Text style={[styles.paragraph, styles.muted]}>
                        <Text style={styles.bold}>We do not: </Text>
                        collect payment card details, scan receipts, or process bank transfers as part of the core product at this time.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>How we use data</Text>
                    <View style={styles.list}>
                        <Text style={styles.listItem}>• Create and manage your account (authentication via Google).</Text>
                        <Text style={styles.listItem}>• Provide and improve the Service (product analytics, performance).</Text>
                        <Text style={styles.listItem}>• Respond to support requests and security incidents.</Text>
                        <Text style={styles.listItem}>• Comply with legal obligations as required.</Text>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Sharing & service providers</Text>
                    <Text style={styles.paragraph}>
                        We use third-party providers for hosting, authentication (Google), analytics, and email delivery. We limit the data shared to what is necessary for the provider to perform its service.
                    </Text>
                    <Text style={[styles.paragraph, styles.muted]}>We will not sell your personal data.</Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Data retention</Text>
                    <Text style={styles.paragraph}>
                        We retain personal data while your account is active and as needed to provide the Service, resolve disputes, or comply with legal obligations. You can request deletion by contacting support.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Your rights</Text>
                    <Text style={styles.paragraph}>
                        Depending on your jurisdiction you may have rights to access, correct, export, or delete your personal data, or to object to processing. To exercise rights, email:{" "}
                        <Text style={styles.link} onPress={handleContact}>{SUPPORT_EMAIL}</Text>.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Security</Text>
                    <Text style={styles.paragraph}>
                        We use industry-standard measures to protect data in transit and at rest. While we strive to keep data secure, no system is perfect — we will notify affected users in line with applicable law in the event of a material security incident.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Children</Text>
                    <Text style={styles.paragraph}>The Service is not directed at children under 13. We do not knowingly collect personal information from children under 13.</Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Contact</Text>
                    <Text style={styles.paragraph}>
                        Questions or requests? Email:{" "}
                        <Text style={styles.link} onPress={handleContact}>{SUPPORT_EMAIL}</Text>
                    </Text>
                    <Text style={[styles.small, styles.muted]}>
                        This Privacy Policy is a template for convenience and does not replace legal advice. If you plan to handle payments, attachments, or introduce new services, update this policy to reflect those flows.
                    </Text>
                </View>

                {/* CTA */}
                <View style={styles.cta}>
                    <Text style={styles.ctaTitle}>Ready to try Expensease?</Text>
                    <Text style={styles.ctaSubtitle}>Create an account and start splitting expenses with friends — quick and private.</Text>
                    <TouchableOpacity style={styles.ctaBtn} onPress={handleCTA} activeOpacity={0.85}>
                        <Text style={styles.ctaBtnText}>{userToken ? "Home Screen" : "Create free account"}</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const createStyles = (theme, isWide) =>
    StyleSheet.create({
        safe: { flex: 1, backgroundColor: theme.colors.background },
        container: { padding: 16, paddingBottom: 100 },

        /* Hero */
        heroRow: {
            flexDirection: isWide ? "row" : "column",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 12,
        },
        heroMain: { flex: 1, paddingRight: isWide ? 8 : 0, marginBottom: isWide ? 0 : 12 },
        heroAside: { width: isWide ? 180 : "100%" },

        h1: { fontSize: 24, fontWeight: "800", color: theme.colors.primary, marginBottom: 6 },
        updated: { color: theme.colors.muted, fontSize: 12, marginBottom: 8 },
        updatedBold: { fontWeight: "700", color: theme.colors.text },

        lead: { color: theme.colors.text, fontSize: 14, lineHeight: 20, marginBottom: 12 },

        actionsRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
        primaryBtn: {
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.colors.primary,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 12,
        },
        primaryBtnText: { color: "#fff", fontWeight: "700" },
        ghostBtn: {
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: theme.colors.border,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 12,
            marginLeft: 10,
            backgroundColor: theme.colors.card,
        },
        ghostBtnText: { color: theme.colors.text },

        highlight: {
            padding: 12,
            borderRadius: 14,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            flexDirection: "row",
            alignItems: "flex-start",
        },
        iconWrap: {
            width: 44,
            height: 44,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 10,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface ?? theme.colors.card,
        },
        highlightTextWrap: { flex: 1 },
        highlightTitle: { fontSize: 13, fontWeight: "700", color: theme.colors.primary, marginBottom: 4 },
        highlightSubtitle: { fontSize: 12, color: theme.colors.muted, lineHeight: 18 },

        quickLinks: {
            marginTop: 10,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
        },
        quickLinkBtn: {
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 6,
            paddingHorizontal: 8,
            borderRadius: 8,
            backgroundColor: theme.colors.background,
            borderWidth: 1,
            borderColor: theme.colors.border,
            marginRight: 8,
            marginTop: 6,
        },
        quickLinkText: { marginLeft: 6, color: theme.colors.primary, fontSize: 13 },

        /* Sections */
        section: {
            marginTop: 8,
            padding: 12,
            borderRadius: 12,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
        },
        sectionTitle: { fontSize: 16, fontWeight: "700", color: theme.colors.primary, marginBottom: 8 },
        paragraph: { color: theme.colors.text, fontSize: 14, lineHeight: 20, marginBottom: 8 },
        bold: { fontWeight: "700", color: theme.colors.text },
        muted: { color: theme.colors.muted },
        list: { marginTop: 6 },
        listItem: { color: theme.colors.text, fontSize: 14, marginBottom: 6 },

        link: { color: theme.colors.primary, textDecorationLine: "underline" },
        small: { fontSize: 12, marginTop: 8 },

        cta: {
            marginTop: 18,
            padding: 16,
            borderRadius: 14,
            backgroundColor: theme.colors.surface ?? theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: "center",
        },
        ctaTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.primary },
        ctaSubtitle: { marginTop: 6, color: theme.colors.muted, textAlign: "center" },
        ctaBtn: {
            marginTop: 12,
            paddingVertical: 12,
            paddingHorizontal: 28,
            borderRadius: 12,
            backgroundColor: theme.colors.primary,
        },
        ctaBtnText: { color: "#fff", fontWeight: "700" },
    });
