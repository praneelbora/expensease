import React, { useState, useMemo } from "react";
import SEO from "../../components/SEO";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import {
    Users,
    PieChart,
    Handshake,
    DollarSign,
    Lock,
    CreditCard,
    Calendar,
    Repeat,
    Bell,
    Search as SearchIcon,
    X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Expensease — Features page (improved)
// UX goals:
// - Filterable & searchable features so users find relevant functionality quickly
// - Clear categories and microcopy that ties features to real use-cases
// - Lightweight slide-over for deeper details (no route changes required)
// - Honest badges (New / Beta / Coming soon) to manage expectations
// - Accessible markup (buttons, aria attributes)

const FEATURES = [
    {
        id: "splits",
        title: "Easy expense splitting",
        description: "Create equal, percent, or manual splits. Add description for clear context.",
        category: "Splitting",
        icon: Users,
        badge: "Core",
        details: (
            <>
                <p className="mb-2">Quick flows focused on reducing friction — add an expense, pick who pays, and save. Splits are remembered for repeat events.</p>
                <ol className="list-decimal ml-6 mt-2 text-sm text-slate-600">
                    <li>Create an expense with amount & receipt.</li>
                    <li>Choose split type: equal / percent / manual.</li>
                    <li>Save — everyone gets an itemized line in the group.</li>
                </ol>
            </>
        ),
    },
    {
        id: "tracking",
        title: "Track personal & group spending",
        description: "Visualize trends for budgeting.",
        category: "Tracking",
        icon: PieChart,
        badge: "Core",
        details: (
            <>
                <p className="mb-2">Charts, category breakdowns, and time-range filters to understand where money goes.</p>
                <p className="text-sm text-slate-600 mt-2">Use export if you want to analyze data in spreadsheets.</p>
            </>
        ),
    },
    {
        id: "loans",
        title: "Loan & IOU management",
        description: "Record loans withcan notes; treat them like expenses for easy settlement.",
        category: "Loans",
        icon: Handshake,
        badge: "Beta",
        details: (
            <>
                <p className="mb-2">Track who lent or borrowed, set an optional due date, and mark repayments when they come through.</p>
            </>
        ),
    },
    {
        id: "payments",
        title: "Payment method management",
        description: "Save multiple payment accounts and record settlements faster (UPI / bank / cash).",
        category: "Payments",
        icon: CreditCard,
        details: (
            <>
                <p className="mb-2">We will provide a simple way to add payment accounts and mark settlements with one tap.</p>
            </>
        ),
    },
    {
        id: "multi-currency",
        title: "Multiple currencies support",
        description: "Add expenses in any currency and view converted totals for group convenience.",
        category: "Payments",
        icon: DollarSign,
        badge: "Core",
        details: (
            <>
                <p className="mb-2">Automatic conversion on display — original currency is always preserved for audit clarity.</p>
            </>
        ),
    },
    {
        id: "privacy",
        title: "Group privacy controls",
        description: "Admins can hide expenses from members not involved in a transaction — ideal for sensitive payments.",
        category: "Privacy",
        icon: Lock,
        badge: "Core",
        details: (
            <>
                <p className="mb-2">Choose who sees what. Default is private to the group; admins can restrict visibility for sensitive items.</p>
            </>
        ),
    },
    //   {
    //     id: "reminders",
    //     title: "Reminders & notifications",
    //     description: "Automated reminders for unpaid splits and due loans — configurable per group.",
    //     category: "Notifications",
    //     icon: Bell,
    //     badge: "Beta",
    //     details: (
    //       <>
    //         <p className="mb-2">Friendly nudges reduce late repayments without awkward messages — turn them off anytime.</p>
    //       </>
    //     ),
    //   },
    //   {
    //     id: "recurring",
    //     title: "Recurring expenses & templates",
    //     description: "Set repeat expenses (rent, subscriptions) and use templates for frequent events.",
    //     category: "Tracking",
    //     icon: Repeat,
    //     badge: "Coming soon",
    //     details: (
    //       <>
    //         <p className="mb-2">Create repeat schedules and save templates for trips, dinners, or regular bills.</p>
    //       </>
    //     ),
    //   },
    //   {
    //     id: "timeline",
    //     title: "Clear timeline & audit log",
    //     description: "See chronological transactions, edits, and who resolved or settled items.",
    //     category: "Tracking",
    //     icon: Calendar,
    //     badge: "Core",
    //     details: (
    //       <>
    //         <p className="mb-2">Every change is visible in the timeline — transparency builds trust among group members.</p>
    //       </>
    //     ),
    //   },
];

const CATEGORIES = ["All", "Splitting", "Tracking", "Payments", "Privacy", "Loans", "Notifications"];

export default function Features() {
    const [query, setQuery] = useState("");
    const [active, setActive] = useState("All");
    const [selected, setSelected] = useState(null);

    const normalized = query.trim().toLowerCase();
    const filtered = useMemo(() => {
        return FEATURES.filter((f) => {
            if (active !== "All" && f.category !== active) return false;
            if (!normalized) return true;
            return (f.title + " " + f.description).toLowerCase().includes(normalized);
        });
    }, [query, active]);

    return (
        <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
            <SEO title="Features | Expensease" description="Discover Expensease features: split bills, track spending, manage loans, and protect privacy." canonical="https://www.expensease.in/features" />
            <NavBar />

            <main className="max-w-7xl mx-auto px-6 py-16 mt-16">
                {/* HERO */}
                <header className="text-center mb-12">
                    <h1 className="text-4xl font-extrabold">Features that help groups manage money without drama</h1>
                    <p className="mt-3 text-slate-600 max-w-2xl mx-auto">From one-off trips to ongoing household bills — clear flows, honest defaults, and fewer awkward money conversations.</p>

                    <div className="mt-6 flex items-center justify-center gap-4">
                        <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1 text-sm">
                            <span className="font-semibold">10+</span>
                            <span className="text-slate-500">beta users</span>
                        </div>

                        <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1 text-sm">
                            <span className="font-semibold">30s</span>
                            <span className="text-slate-500">average split time</span>
                        </div>

                        <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1 text-sm">
                            <span className="font-semibold">3 steps</span>
                            <span className="text-slate-500">Add → split → settle</span>
                        </div>
                    </div>
                </header>

                {/* Search & Filters */}
                <section className="mb-8 grid gap-4 sm:grid-cols-2 items-center">
                    <div className="relative max-w-2xl">
                        <SearchIcon className="absolute left-3 top-3 text-slate-400" size={18} />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search features — e.g., 'recurring', 'UPI', 'privacy'"
                            className="pl-10 pr-4 w-full rounded-xl border border-slate-200 p-3 shadow-sm"
                            aria-label="Search features"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {CATEGORIES.map((c) => (
                            <button
                                key={c}
                                onClick={() => setActive(c)}
                                className={`px-3 py-1 rounded-full text-sm font-medium ${active === c ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700"}`}
                                aria-pressed={active === c}
                            >
                                {c}
                            </button>
                        ))}
                    </div>
                </section>

                {/* Features grid */}
                <section>
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {filtered.map((f) => {
                            const Icon = f.icon;
                            return (
                                <motion.article
                                    key={f.id}
                                    whileHover={{ y: -6 }}
                                    className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md cursor-pointer"
                                >
                                    <div className="flex justify-center">
                                        <div className="p-3 rounded-lg bg-slate-50">
                                            <Icon className="h-8 w-8 text-teal-600" />
                                        </div>
                                    </div>

                                    <div className="mt-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <h3 className="font-semibold text-lg">{f.title}</h3>
                                            {f.badge && <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">{f.badge}</span>}
                                        </div>
                                        <p className="mt-2 text-sm text-slate-600">{f.description}</p>
                                    </div>

                                    <div className="mt-4 flex items-center justify-between">
                                        <div className="text-sm text-slate-500">{f.category}</div>
                                        {/* <div className="text-sm font-medium text-slate-900">Learn more →</div> */}
                                    </div>
                                </motion.article>
                            );
                        })}
                    </div>
                </section>

                {/* Use cases */}
                <section className="mt-12">
                    <h3 className="text-xl font-semibold mb-4">Use cases</h3>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            { title: "Personal Budgeting", sub: "Log daily expenses and monitor categories like food, travel, and shopping." },
                            { title: "Trips & Vacations", sub: "Split shared costs, manage receipts, templates" },
                            { title: "Roommates & Flatmates", sub: "Manage rent, utilities, and shared groceries" },
                            { title: "Events & Parties", sub: "Plan birthdays, or celebrations and settle quickly" },
                            { title: "Finance Tracking", sub: "Get a clear picture of where your money goes with insights and reports." },
                            { title: "Small teams", sub: "Expense tracking for informal team budgets" },
                        ].map((u) => (
                            <div key={u.title} className="bg-white p-4 rounded-xl shadow-sm">
                                <div className="font-medium">{u.title}</div>
                                <div className="text-sm text-slate-500 mt-2">{u.sub}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* CTA */}
                <section className="mt-12 grid md:grid-cols-2 gap-6 items-center">
                    <div className="bg-white rounded-2xl p-6 shadow-sm">
                        <h4 className="font-semibold">Want to see it in action?</h4>
                        <p className="mt-2 text-sm text-slate-600">Create a free account and invite friends.</p>
                        <div className="mt-4 flex gap-3">
                            <a href="/login" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-2">Create account</a>
                            {/* <a href="/demo" className="inline-flex items-center gap-2 rounded-xl border px-4 py-2">Request demo</a> */}
                        </div>
                    </div>

                    {/* <div className="rounded-2xl p-6 bg-gradient-to-r from-teal-50 to-indigo-50 text-center">
                        <h4 className="font-semibold">Roadmap & feedback</h4>
                        <p className="mt-2 text-sm text-slate-700">Many features are shaped by user feedback, tell us what matters and we’ll prioritize it.</p>
                        <div className="mt-4">
                            <a href="/feedback" className="inline-flex items-center gap-2 rounded-xl border px-4 py-2">Give feedback</a>
                        </div>
                    </div> */}
                </section>
            </main>

            <Footer />

            {/* Slide-over detail */}
            <AnimatePresence>
                {selected && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40 flex items-end md:items-center justify-center p-4 md:p-8"
                    >
                        <motion.div
                            initial={{ y: 40 }}
                            animate={{ y: 0 }}
                            exit={{ y: 40 }}
                            className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-auto"
                        >
                            <div className="p-5 border-b border-slate-100 flex items-start gap-4">
                                <div className="p-2 rounded-md bg-slate-50">
                                    <selected.icon className="h-6 w-6 text-teal-600" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-lg">{selected.title}</h3>
                                    <div className="text-sm text-slate-500">{selected.category} • {selected.badge}</div>
                                </div>
                                <button onClick={() => setSelected(null)} aria-label="Close" className="p-2 rounded-md hover:bg-slate-100">
                                    <X />
                                </button>
                            </div>

                            <div className="p-6">
                                <div className="prose max-w-none text-slate-700">{selected.details}</div>

                                <div className="mt-6 flex gap-3">
                                    <a href="/login" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-2">Try this feature</a>
                                    <a href="/learn-more" className="inline-flex items-center gap-2 rounded-xl border px-4 py-2">Learn more</a>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
