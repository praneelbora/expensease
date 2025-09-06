// app/guide.js
import React, { useRef, useMemo } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import {
    Info,
    Rocket,
    ListChecks,
    Users,
    Wallet,
    SplitSquareHorizontal,
    PieChart,
    RefreshCcw,
    ShieldCheck,
    IndianRupee,
    Plus,
    ChevronRight,
    HelpCircle,
    Coins,
} from "lucide-react-native";
import Header from "~/header";
import { SafeAreaView } from "react-native-safe-area-context";

// Optional theme hook
import { useTheme } from "context/ThemeProvider";

export default function GuideScreen() {
    const router = useRouter();
    const themeCtx = useTheme?.() || {};
    const styles = useMemo(() => createStyles(themeCtx?.theme), [themeCtx?.theme]);

    const sections = [
        { id: "overview", label: "Overview", icon: Info },
        { id: "quickstart", label: "Quick Start", icon: Rocket },
        { id: "features", label: "Key Features", icon: ListChecks },
        { id: "workflows", label: "Workflows", icon: SplitSquareHorizontal },
        { id: "tips", label: "Tips", icon: RefreshCcw },
        { id: "faq", label: "FAQ", icon: HelpCircle },
    ];

    const refs = Object.fromEntries(sections.map((s) => [s.id, useRef(null)]));

    const jump = (id) => {
        // RN ScrollView doesn't support scrollIntoView; kept for web compatibility if needed
        refs[id]?.current?.scrollIntoView?.({ behavior: "smooth" });
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Header title="Guide" showBack />
            <ScrollView
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
            >
                {/* Overview */}
                <Section ref={refs.overview} title="Overview" icon={Info} styles={styles}>
                    <Text style={styles.text}>
                        Track personal and shared expenses, split fairly, and keep balances
                        tidy. Privacy is built-in: balances are blurred by default and
                        revealed only when you choose.
                    </Text>
                    <View style={styles.rowWrap}>
                        <StatCard
                            icon={IndianRupee}
                            title="Multi-Currency"
                            desc="Set your default, save expenses in their own currency, and see clear totals."
                            styles={styles}
                        />
                        <StatCard
                            icon={Wallet}
                            title="Payment Accounts"
                            desc="UPI, bank, card, cash, wallet—add balances, blur by default, tap to reveal."
                            styles={styles}
                        />
                        <StatCard
                            icon={Users}
                            title="Groups & Friends"
                            desc="Split with friends or whole groups. Settle later with clear audit trails."
                            styles={styles}
                        />
                    </View>
                </Section>

                {/* Quick Start */}
                <Section ref={refs.quickstart} title="Quick Start" icon={Rocket} styles={styles}>
                    <View style={styles.list}>
                        <Text style={styles.listItem}>1. Add a Payment Account.</Text>
                        <Text style={styles.listItem}>2. Set your Default Currency.</Text>
                        <Text style={styles.listItem}>3. Add your first Expense.</Text>
                        <Text style={styles.listItem}>
                            4. Invite Friends or create a Group.
                        </Text>
                        <Text style={styles.listItem}>
                            5. Review balances on the Dashboard.
                        </Text>
                    </View>
                    <View style={{ marginTop: 10 }}>
                        <Primary onPress={() => router.push("/new-expense")} icon={Plus} styles={styles}>
                            Add Expense
                        </Primary>
                        <Ghost onPress={() => router.push("/paymentAccounts")} icon={Wallet} styles={styles}>
                            Payment Accounts
                        </Ghost>
                    </View>
                </Section>

                {/* Features */}
                <Section ref={refs.features} title="Key Features" icon={ListChecks} styles={styles}>
                    <Feature
                        icon={SplitSquareHorizontal}
                        title="Personal & Split Expenses"
                        points={[
                            "Personal: one payer, quick add.",
                            "Split: multiple payers and owe-ers.",
                            "Modes: Equal, Value, Percent.",
                        ]}
                        styles={styles}
                    />
                    <Feature
                        icon={Wallet}
                        title="Payment Accounts"
                        points={[
                            "Support UPI, bank, card, cash, wallets.",
                            "Balances blurred by default.",
                            "Tap 'View balances' to reveal.",
                        ]}
                        styles={styles}
                    />
                    <Feature
                        icon={Coins}
                        title="Per-Payer Methods"
                        points={[
                            "Payers pick their own method.",
                            "If >1 method, selection required.",
                            "Prevents ambiguous debits.",
                        ]}
                        styles={styles}
                    />
                    <Feature
                        icon={IndianRupee}
                        title="Multi-Currency"
                        points={[
                            "Default currency for summaries.",
                            "Each expense saved in own currency.",
                            "Clear totals and formatting.",
                        ]}
                        styles={styles}
                    />
                    <Feature
                        icon={RefreshCcw}
                        title="Snappy UI"
                        points={[
                            "Pull down to refresh lists.",
                            "Quick close gestures.",
                            "Cards & compact controls.",
                        ]}
                        styles={styles}
                    />
                    <Feature
                        icon={ShieldCheck}
                        title="Privacy & Safety"
                        points={[
                            "Balances blurred by default.",
                            "Guided errors prevent mistakes.",
                            "Audit logs track changes.",
                        ]}
                        styles={styles}
                    />
                </Section>

                {/* Workflows */}
                <Section ref={refs.workflows} title="Workflows" icon={SplitSquareHorizontal} styles={styles}>
                    <Workflow
                        title="Split dinner with friends"
                        steps={[
                            "Tap New Expense → add details.",
                            "Choose Currency if different.",
                            "Select who paid, adjust amounts.",
                            "Assign who owes, set Equal/Value/Percent.",
                            "Save — everyone’s shares recorded.",
                        ]}
                        styles={styles}
                    />
                    <Workflow
                        title="Record a personal purchase"
                        steps={[
                            "New Expense → Personal mode.",
                            "Fill details: description, amount, date.",
                            "Pick payment account.",
                            "Save — done.",
                        ]}
                        styles={styles}
                    />
                    <Workflow
                        title="Check balances quickly"
                        steps={[
                            "Dashboard → Payment Accounts.",
                            "Tap card → reveal balances briefly.",
                            "Adjust balances in Accounts page.",
                        ]}
                        styles={styles}
                    />
                </Section>

                {/* Tips */}
                <Section ref={refs.tips} title="Tips" icon={RefreshCcw} styles={styles}>
                    <Text style={styles.listItem}>• Inline Coach guides your next step.</Text>
                    <Text style={styles.listItem}>• Escape closes modals quickly.</Text>
                    <Text style={styles.listItem}>• Groups are perfect for recurring splits.</Text>
                </Section>

                {/* FAQ */}
                <Section ref={refs.faq} title="FAQ" icon={HelpCircle} styles={styles}>
                    <Faq
                        q="Why can't I Save in Split mode?"
                        a="Ensure payers’ totals match, methods selected, and owed amounts/percents add up."
                        styles={styles}
                    />
                    <Faq
                        q="Do I need a default currency?"
                        a="Recommended for clean summaries, but each expense stores its own currency."
                        styles={styles}
                    />
                </Section>

                {/* Footer */}
                <View style={styles.sectionCard}>
                    <Text style={styles.header2}>Ready to add your next expense?</Text>
                    <Primary onPress={() => router.push("/new-expense")} icon={Plus} styles={styles}>
                        Add Expense
                    </Primary>
                    <Ghost onPress={() => router.push("/paymentAccounts")} icon={Wallet} styles={styles}>
                        Manage Accounts
                    </Ghost>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

/* --- Helpers --- */

const Section = React.forwardRef(({ title, icon: Icon, children, styles }, ref) => (
    <View ref={ref} style={{ marginBottom: 0 }}>
        <View style={styles.sectionHeader}>
            <Icon size={20} color={styles.colors.primaryFallback} />
            <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <View style={styles.sectionCard}>{children}</View>
    </View>
));
Section.displayName = "Section";

const StatCard = ({ icon: Icon, title, desc, styles }) => (
    <View style={styles.statCard}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <Icon size={16} color={styles.colors.mutedFallback} />
            <Text style={styles.statTitle}>{title}</Text>
        </View>
        <Text style={styles.text}>{desc}</Text>
    </View>
);

const Feature = ({ icon: Icon, title, points, styles }) => (
    <View style={styles.featureCard}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <Icon size={16} color={styles.colors.mutedFallback} />
            <Text style={styles.statTitle}>{title}</Text>
        </View>
        {points.map((p, i) => (
            <Text key={i} style={styles.text}>
                • {p}
            </Text>
        ))}
    </View>
);

const Workflow = ({ title, steps, styles }) => (
    <View style={styles.featureCard}>
        <Text style={styles.statTitle}>{title}</Text>
        {steps.map((s, i) => (
            <Text key={i} style={styles.text}>
                {i + 1}. {s}
            </Text>
        ))}
    </View>
);

const Faq = ({ q, a, styles }) => (
    <View style={styles.featureCard}>
        <Text style={styles.statTitle}>{q}</Text>
        <Text style={styles.text}>{a}</Text>
    </View>
);

const Primary = ({ children, onPress, icon: Icon, styles }) => (
    <TouchableOpacity style={styles.primaryBtn} onPress={onPress}>
        {Icon && <Icon size={16} color={styles.colors.text} />}
        <Text style={styles.primaryBtnText}>{children}</Text>
    </TouchableOpacity>
);

const Ghost = ({ children, onPress, icon: Icon, styles }) => (
    <TouchableOpacity style={styles.ghostBtn} onPress={onPress}>
        {Icon && <Icon size={16} color={styles.colors.mutedFallback} />}
        <Text style={styles.ghostBtnText}>{children}</Text>
    </TouchableOpacity>
);

/* --- Theme-aware styles factory --- */
const createStyles = (theme = {}) => {
    const palette = {
        background: theme?.colors?.background ?? "#121212",
        card: theme?.colors?.card ?? "#1f1f1f",
        cardAlt: theme?.colors?.cardAlt ?? "#181818",
        border: theme?.colors?.border ?? "#2a2a2a",
        text: theme?.colors?.text ?? "#EBF1D5",
        muted: theme?.colors?.muted ?? "#cfdac0",
        primary: theme?.colors?.primary ?? "#60DFC9",
        cta: theme?.colors?.cta ?? "#00C49F",
        danger: theme?.colors?.danger ?? "#ef4444",
    };

    const s = StyleSheet.create({
        safe: { flex: 1, backgroundColor: palette.background },
        container: { padding: 16, gap: 16 },
        header: { fontSize: 28, fontWeight: "700", color: palette.text, marginBottom: 12 },
        header2: { fontSize: 20, fontWeight: "700", color: palette.text, marginBottom: 8 },
        sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
        sectionTitle: { fontSize: 20, fontWeight: "600", color: palette.text },
        subHeader: { color: palette.cta, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", paddingBottom: 8 },
        sectionCard: { backgroundColor: palette.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: palette.border },
        statCard: { backgroundColor: palette.cardAlt, borderRadius: 12, padding: 10, marginBottom: 10 },
        statTitle: { color: palette.text, fontWeight: "600", marginLeft: 6 },
        text: { color: palette.muted, fontSize: 14, marginVertical: 2 },
        featureCard: { backgroundColor: palette.cardAlt, borderRadius: 12, padding: 10, marginBottom: 10 },
        list: { marginTop: 6 },
        listItem: { color: palette.muted, fontSize: 14, marginVertical: 2 },
        rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
        chip: { flexDirection: "row", alignItems: "center", borderRadius: 20, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: palette.cardAlt },
        chipText: { color: palette.text, fontSize: 13, marginLeft: 6 },
        primaryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: palette.cta, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginTop: 6 },
        primaryBtnText: { color: "#000", fontWeight: "700" },
        ghostBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginTop: 6 },
        ghostBtnText: { color: palette.text, fontWeight: "500" },
    });

    // colors helper for inline components/icons
    s.colors = {
        backgroundFallback: palette.background,
        cardFallback: palette.card,
        cardAltFallback: palette.cardAlt,
        borderFallback: palette.border,
        textFallback: palette.text,
        mutedFallback: palette.muted,
        primaryFallback: palette.primary,
        ctaFallback: palette.cta,
        dangerFallback: palette.danger,
    };

    return s;
};
