// app/account/FAQ.js
import React, { useMemo, useState, useEffect } from "react";
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    FlatList,
    LayoutAnimation,
    Platform,
    UIManager,
    Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import ChevronUp from "@/accIcons/chevronUp.svg"; // Example SVG import
import ChevronDown from "@/accIcons/chevronDown.svg"; // Example SVG import
import Header from "~/header";
import { useTheme } from "context/ThemeProvider";
import SearchBar from "~/searchBar"; // <-- using your component

// --- Data (same as before) ---
const FAQS = [
    { id: 1, q: "How do I add a personal expense?", category: "Getting started", a: [{ type: "text", value: "On mobile: Tap the + action button in the navbar and choose New expense." }, { type: "text", value: "Required fields: Description, Amount & currency, Date. Tap Save — the expense will appear in your timeline." }] },
    { id: 2, q: "How do I create a group or add friends?", category: "Groups", a: [{ type: "text", value: "Create a group from the Groups page and invite people by link or 4-digit code. Friends can also be added using their email." }] },
    { id: 3, q: "How do I split an expense?", category: "Features", a: [{ type: "text", value: "Choose a group or friend, create New expense, enter amount and choose split type (Equal / Percent / Manual)." }, { type: "list", value: ["Equal — everyone pays the same", "Percent — set percentages per person", "Manual — enter exact amounts per person"] }] },
    { id: 4, q: "Can I record loans or IOUs?", category: "Features", a: [{ type: "text", value: "Yes — use New loan to record borrow/lend money. Loans appear alongside expenses and can be settled." }] },
    { id: 5, q: "How does privacy work for groups?", category: "Privacy", a: [{ type: "text", value: "Group admins control visibility. By default only members see group expenses. You can export your data anytime." }] },
    { id: 6, q: "Are there any charges?", category: "Account", a: [{ type: "text", value: "Expensease is free for small groups. We'll announce pricing for advanced features and show pricing before you opt in." }] },
    { id: 7, q: "How do I manage payment methods?", category: "Payments", a: [{ type: "text", value: "Go to Account → Payment methods to add or remove saved payment accounts. They are never charged without your consent." }] },
    { id: 10, q: "You still have a query?", category: "Support", a: [{ type: "text", value: "Yes! Use the Help → Contact support link or email email.expensease@gmail.com. For quick issues, try the in-app chat." }] },
];

const CATEGORIES = ["All", "Getting started", "Groups", "Features", "Payments", "Privacy", "Account", "Support"];

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function FAQScreen() {
    const router = useRouter();
    const { theme } = useTheme();
    const [query, setQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState("All");
    const [openId, setOpenId] = useState(null);
    const [feedback, setFeedback] = useState({});
    const styles = useMemo(() => createStyles(theme), [theme]);

    useEffect(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }, [openId]);

    const normalizedQuery = query.trim().toLowerCase();

    const filtered = useMemo(() => {
        return FAQS.filter((f) => {
            if (activeCategory !== "All" && f.category !== activeCategory) return false;
            if (!normalizedQuery) return true;
            const hay = (f.q + " " + f.a.map((p) => (typeof p.value === "string" ? p.value : p.value.join(" "))).join(" ")).toLowerCase();
            return hay.includes(normalizedQuery);
        });
    }, [query, activeCategory]);

    const popular = FAQS.slice(0, 3);

    function toggle(id) {
        setOpenId((prev) => (prev === id ? null : id));
    }

    function markHelpful(id, type) {
        setFeedback((s) => ({ ...s, [id]: s[id] === type ? undefined : type }));
    }

    function renderAnswer(a) {
        return a.map((block, idx) => {
            if (block.type === "text") {
                return (
                    <Text key={idx} style={styles.paragraph}>
                        {block.value}
                    </Text>
                );
            }
            if (block.type === "list") {
                return (
                    <View key={idx} style={{ marginVertical: 8 }}>
                        {block.value.map((li, i) => (
                            <Text key={i} style={styles.listItem}>
                                • {li}
                            </Text>
                        ))}
                    </View>
                );
            }
            return null;
        });
    }

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <StatusBar style={theme.statusBarStyle === "dark-content" ? "dark" : "light"} />
            <Header showBack title="Help & FAQs" />
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <View style={styles.hero}>
                    <Text style={styles.lead}>Search the help center or browse popular topics below.</Text>

                    {/* Replaced inline search with SearchBar component */}
                    <View style={{ marginTop: 12 }}>
                        <SearchBar
                            value={query}
                            onChangeText={setQuery}
                            placeholder="Search help: e.g. 'split', 'privacy', 'loan'"
                            style={{ borderRadius: 12 }}
                        />
                    </View>
                </View>

                <View style={{ marginTop: 10 }}>
                    {filtered.length === 0 ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyTitle}>No results found</Text>
                            <Text style={styles.emptyText}>Try different keywords or contact support.</Text>
                            <TouchableOpacity style={styles.contactBtn} onPress={() => router.push("account/contact")}>
                                <Text style={styles.contactBtnText}>Contact support</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <FlatList
                            data={filtered}
                            keyExtractor={(item) => String(item.id)}
                            scrollEnabled={false}
                            renderItem={({ item }) => {
                                const isOpen = openId === item.id;
                                return (
                                    <View style={styles.faqCard}>
                                        <TouchableOpacity onPress={() => toggle(item.id)} style={styles.faqHeader} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}>
                                            <View>
                                                <Text style={styles.faqQ}>{item.q}</Text>
                                            </View>
                                            <View>
                                                {isOpen?
                                                <ChevronUp height={20} width={20} color={theme.colors.muted}/>
                                                :
                                                <ChevronDown height={20} width={20} color={theme.colors.muted}/>
                                                }
                                            </View>
                                        </TouchableOpacity>

                                        {isOpen && (
                                            <View style={styles.faqBody}>
                                                {renderAnswer(item.a)}

                                                {/* <View style={styles.helpRow}>
                                                    <Text style={styles.helpText}>Was this helpful?</Text>

                                                    <TouchableOpacity onPress={() => markHelpful(item.id, "up")} style={[styles.helpBtn, feedback[item.id] === "up" && styles.helpBtnActiveUp]} accessibilityRole="button">
                                                    //FEATHER DOESNT WORK FOR ANDROID
                                                        <Feather name="thumbs-up" size={16} color={feedback[item.id] === "up" ? "#0f766e" : theme.colors.text} />
                                                        <Text style={[styles.helpBtnText, feedback[item.id] === "up" && { color: "#0f766e" }]}>Yes</Text>
                                                    </TouchableOpacity>

                                                    <TouchableOpacity onPress={() => markHelpful(item.id, "down")} style={[styles.helpBtn, feedback[item.id] === "down" && styles.helpBtnActiveDown]} accessibilityRole="button">
                                                        <Feather name="thumbs-down" size={16} color={feedback[item.id] === "down" ? "#be123c" : theme.colors.text} />
                                                        <Text style={[styles.helpBtnText, feedback[item.id] === "down" && { color: "#be123c" }]}>No</Text>
                                                    </TouchableOpacity>

                                                </View> */}
                                                {/* {feedback[item.id] && <Text style={styles.feedbackThanks}>Thanks — your feedback helps us improve.</Text>} */}
                                            </View>
                                        )}
                                    </View>
                                );
                            }}
                        />
                    )}
                </View>

                <View style={styles.ctaRow}>
                    <View style={styles.ctaCard}>
                        <Text style={styles.ctaTitle}>Still have a question?</Text>
                        <Text style={styles.ctaSubtitle}>Reach out to our support team — we usually reply within a business day.</Text>
                        <TouchableOpacity style={styles.ctaBtn} onPress={() => router.push("account/contact")}>
                            <Text style={styles.ctaBtnText}>Contact support</Text>
                        </TouchableOpacity>
                    </View>

                    {/* <View style={styles.ctaCardAlt}>
            <Text style={styles.ctaTitle}>Want to request a feature?</Text>
            <Text style={styles.ctaSubtitle}>Your feature requests directly influence our roadmap.</Text>
            <TouchableOpacity style={styles.ctaBtnOutline} onPress={() => router.push("/feedback")}>
              <Text style={styles.ctaBtnOutlineText}>Suggest a feature</Text>
            </TouchableOpacity>
          </View> */}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const createStyles = (theme) =>
    StyleSheet.create({
        safe: { flex: 1, backgroundColor: theme.colors.background },
        container: { paddingHorizontal: 16, paddingBottom: 48 },
        hero: { marginBottom: 6 },
        h1: { fontSize: 22, fontWeight: "800", color: theme.colors.primary },
        lead: { marginTop: 6, color: theme.colors.muted },
        searchRow: {
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.colors.card,
            borderRadius: 12,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderWidth: 1,
            borderColor: theme.colors.border,
        },
        searchInput: { flex: 1, fontSize: 14, color: theme.colors.text },
        clearBtn: { padding: 6, marginLeft: 6 },

        categories: { flexDirection: "row", flexWrap: "wrap", columnGap: 0, marginTop: 6 },
        chip: {
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 999,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            marginRight: 8,
            marginTop: 8,
        },
        chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
        chipText: { color: theme.colors.text, fontSize: 13 },
        chipTextActive: { color: "#fff" },

        sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 8, color: theme.colors.primary },
        popularGrid: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
        popularCard: {
            flex: 1,
            padding: 12,
            borderRadius: 10,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            marginRight: 8,
        },
        popularQ: { fontWeight: "700", color: theme.colors.text },
        popularCat: { marginTop: 6, color: theme.colors.muted, fontSize: 12 },

        empty: { padding: 16, borderRadius: 12, backgroundColor: theme.colors.card, alignItems: "center", marginTop: 12 },
        emptyTitle: { fontWeight: "700", fontSize: 16, color: theme.colors.text },
        emptyText: { marginTop: 6, color: theme.colors.muted },
        contactBtn: {
            marginTop: 10,
            backgroundColor: theme.colors.primary,
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 10,
        },
        contactBtnText: { color: "#fff", fontWeight: "700" },

        faqCard: { backgroundColor: theme.colors.card, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 10 },
        faqHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14 },
        faqQ: { fontWeight: "700", color: theme.colors.text },
        faqCat: { marginTop: 4, color: theme.colors.muted, fontSize: 12 },
        faqBody: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: theme.colors.border },
        paragraph: { color: theme.colors.text, marginTop: 8, lineHeight: 20 },
        listItem: { color: theme.colors.text, marginTop: 6 },

        helpRow: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8 },
        helpText: { color: theme.colors.muted, marginRight: 8 },
        helpBtn: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderRadius: 8,
            paddingVertical: 6,
            paddingHorizontal: 10,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
        },
        helpBtnText: { marginLeft: 6, color: theme.colors.text },
        helpBtnActiveUp: { backgroundColor: "#ecfeff", borderColor: "#5eead4" },
        helpBtnActiveDown: { backgroundColor: "#ffe4e6", borderColor: "#fb7185" },
        feedbackThanks: { marginTop: 4, color: theme.colors.muted },

        ctaRow: { marginTop: 14, flexDirection: "row", gap: 12 },
        ctaCard: {
            flex: 1,
            padding: 14,
            borderRadius: 12,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
        },
        ctaCardAlt: {
            flex: 1,
            padding: 14,
            borderRadius: 12,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
        },
        ctaTitle: { fontWeight: "700", color: theme.colors.text },
        ctaSubtitle: { marginTop: 6, color: theme.colors.muted },
        ctaBtn: { marginTop: 10, backgroundColor: theme.colors.primary, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
        ctaBtnText: { color: "#fff", fontWeight: "700" },
        ctaBtnOutline: { marginTop: 10, paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: theme.colors.border },
        ctaBtnOutlineText: { color: theme.colors.text, fontWeight: "700" },
    });
