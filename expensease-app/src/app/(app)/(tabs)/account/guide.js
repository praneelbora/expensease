// app/guide.js
import React, { useRef } from "react";
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
import Header from "~/header"
import { SafeAreaView } from "react-native-safe-area-context";
export default function GuideScreen() {
    const router = useRouter();

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
        refs[id]?.current?.scrollIntoView?.({ behavior: "smooth" });
    };

    return (
        <SafeAreaView style={styles.safe}>
            <Header title="Guide" showBack />
            <ScrollView
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}

                {/* On this page */}
                {/* <View style={styles.sectionCard}>
          <Text style={styles.subHeader}>On this page</Text>
          <View style={styles.rowWrap}>
            {sections.map(({ id, label, icon: Icon }) => (
              <TouchableOpacity
                key={id}
                style={styles.chip}
                onPress={() => jump(id)}
              >
                <Icon size={16} color="#ccc" />
                <Text style={styles.chipText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View> */}

                {/* Overview */}
                <Section ref={refs.overview} title="Overview" icon={Info}>
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
                        />
                        <StatCard
                            icon={Wallet}
                            title="Payment Accounts"
                            desc="UPI, bank, card, cash, wallet—add balances, blur by default, tap to reveal."
                        />
                        <StatCard
                            icon={Users}
                            title="Groups & Friends"
                            desc="Split with friends or whole groups. Settle later with clear audit trails."
                        />
                    </View>
                </Section>

                {/* Quick Start */}
                <Section ref={refs.quickstart} title="Quick Start" icon={Rocket}>
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
                        <Primary onPress={() => router.push("/new-expense")} icon={Plus}>
                            Add Expense
                        </Primary>
                        <Ghost onPress={() => router.push("/paymentAccounts")} icon={Wallet}>
                            Payment Accounts
                        </Ghost>
                    </View>
                </Section>

                {/* Features */}
                <Section ref={refs.features} title="Key Features" icon={ListChecks}>
                    <Feature
                        icon={SplitSquareHorizontal}
                        title="Personal & Split Expenses"
                        points={[
                            "Personal: one payer, quick add.",
                            "Split: multiple payers and owe-ers.",
                            "Modes: Equal, Value, Percent.",
                        ]}
                    />
                    <Feature
                        icon={Wallet}
                        title="Payment Accounts"
                        points={[
                            "Support UPI, bank, card, cash, wallets.",
                            "Balances blurred by default.",
                            "Tap 'View balances' to reveal.",
                        ]}
                    />
                    <Feature
                        icon={Coins}
                        title="Per-Payer Methods"
                        points={[
                            "Payers pick their own method.",
                            "If >1 method, selection required.",
                            "Prevents ambiguous debits.",
                        ]}
                    />
                    <Feature
                        icon={IndianRupee}
                        title="Multi-Currency"
                        points={[
                            "Default currency for summaries.",
                            "Each expense saved in own currency.",
                            "Clear totals and formatting.",
                        ]}
                    />
                    <Feature
                        icon={RefreshCcw}
                        title="Snappy UI"
                        points={[
                            "Pull down to refresh lists.",
                            "Quick close gestures.",
                            "Cards & compact controls.",
                        ]}
                    />
                    <Feature
                        icon={ShieldCheck}
                        title="Privacy & Safety"
                        points={[
                            "Balances blurred by default.",
                            "Guided errors prevent mistakes.",
                            "Audit logs track changes.",
                        ]}
                    />
                </Section>

                {/* Workflows */}
                <Section ref={refs.workflows} title="Workflows" icon={SplitSquareHorizontal}>
                    <Workflow
                        title="Split dinner with friends"
                        steps={[
                            "Tap New Expense → add details.",
                            "Choose Currency if different.",
                            "Select who paid, adjust amounts.",
                            "Assign who owes, set Equal/Value/Percent.",
                            "Save — everyone’s shares recorded.",
                        ]}
                    />
                    <Workflow
                        title="Record a personal purchase"
                        steps={[
                            "New Expense → Personal mode.",
                            "Fill details: description, amount, date.",
                            "Pick payment account.",
                            "Save — done.",
                        ]}
                    />
                    <Workflow
                        title="Check balances quickly"
                        steps={[
                            "Dashboard → Payment Accounts.",
                            "Tap card → reveal balances briefly.",
                            "Adjust balances in Accounts page.",
                        ]}
                    />
                </Section>

                {/* Tips */}
                <Section ref={refs.tips} title="Tips" icon={RefreshCcw}>
                    <Text style={styles.listItem}>
                        • Inline Coach guides your next step.
                    </Text>
                    <Text style={styles.listItem}>• Escape closes modals quickly.</Text>
                    <Text style={styles.listItem}>
                        • Groups are perfect for recurring splits.
                    </Text>
                </Section>

                {/* FAQ */}
                <Section ref={refs.faq} title="FAQ" icon={HelpCircle}>
                    <Faq
                        q="Why can't I Save in Split mode?"
                        a="Ensure payers’ totals match, methods selected, and owed amounts/percents add up."
                    />
                    <Faq
                        q="Do I need a default currency?"
                        a="Recommended for clean summaries, but each expense stores its own currency."
                    />
                </Section>

                {/* Footer */}
                <View style={styles.sectionCard}>
                    <Text style={styles.header2}>Ready to add your next expense?</Text>
                    <Primary onPress={() => router.push("/new-expense")} icon={Plus}>
                        Add Expense
                    </Primary>
                    <Ghost onPress={() => router.push("/paymentAccounts")} icon={Wallet}>
                        Manage Accounts
                    </Ghost>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

/* --- Helpers --- */

const Section = React.forwardRef(({ title, icon: Icon, children }, ref) => (
    <View ref={ref} style={{ marginBottom: 0 }}>
        <View style={styles.sectionHeader}>
            <Icon size={20} color="#60DFC9" />
            <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <View style={styles.sectionCard}>{children}</View>
    </View>
));
Section.displayName = "Section";

const StatCard = ({ icon: Icon, title, desc }) => (
    <View style={styles.statCard}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <Icon size={16} color="#ccc" />
            <Text style={styles.statTitle}>{title}</Text>
        </View>
        <Text style={styles.text}>{desc}</Text>
    </View>
);

const Feature = ({ icon: Icon, title, points }) => (
    <View style={styles.featureCard}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <Icon size={16} color="#ccc" />
            <Text style={styles.statTitle}>{title}</Text>
        </View>
        {points.map((p, i) => (
            <Text key={i} style={styles.text}>
                • {p}
            </Text>
        ))}
    </View>
);

const Workflow = ({ title, steps }) => (
    <View style={styles.featureCard}>
        <Text style={styles.statTitle}>{title}</Text>
        {steps.map((s, i) => (
            <Text key={i} style={styles.text}>
                {i + 1}. {s}
            </Text>
        ))}
    </View>
);

const Faq = ({ q, a }) => (
    <View style={styles.featureCard}>
        <Text style={styles.statTitle}>{q}</Text>
        <Text style={styles.text}>{a}</Text>
    </View>
);

const Primary = ({ children, onPress, icon: Icon }) => (
    <TouchableOpacity style={styles.primaryBtn} onPress={onPress}>
        {Icon && <Icon size={16} color="#000" />}
        <Text style={styles.primaryBtnText}>{children}</Text>
    </TouchableOpacity>
);

const Ghost = ({ children, onPress, icon: Icon }) => (
    <TouchableOpacity style={styles.ghostBtn} onPress={onPress}>
        {Icon && <Icon size={16} color="#ccc" />}
        <Text style={styles.ghostBtnText}>{children}</Text>
    </TouchableOpacity>
);

/* --- Styles --- */
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#121212" },
    container: { padding: 16, gap: 16 },
    header: { fontSize: 28, fontWeight: "700", color: "#EBF1D5", marginBottom: 12 },
    header2: { fontSize: 20, fontWeight: "700", color: "#EBF1D5", marginBottom: 8 },
    sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
    sectionTitle: { fontSize: 20, fontWeight: "600", color: "#EBF1D5" },
    subHeader: { color: "#00C49F", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", paddingBottom: 8 },
    sectionCard: { backgroundColor: "#1f1f1f", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#2a2a2a" },
    statCard: { backgroundColor: "#181818", borderRadius: 12, padding: 10, marginBottom: 10 },
    statTitle: { color: "#EBF1D5", fontWeight: "600", marginLeft: 6 },
    text: { color: "#cfdac0", fontSize: 14, marginVertical: 2 },
    featureCard: { backgroundColor: "#181818", borderRadius: 12, padding: 10, marginBottom: 10 },
    list: { marginTop: 6 },
    listItem: { color: "#cfdac0", fontSize: 14, marginVertical: 2 },
    rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    chip: { flexDirection: "row", alignItems: "center", borderRadius: 20, borderWidth: 1, borderColor: "#2a2a2a", paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#181818" },
    chipText: { color: "#EBF1D5", fontSize: 13, marginLeft: 6 },
    primaryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#00C49F", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginTop: 6 },
    primaryBtnText: { color: "#000", fontWeight: "700" },
    ghostBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#2a2a2a", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginTop: 6 },
    ghostBtnText: { color: "#EBF1D5", fontWeight: "500" },
});
