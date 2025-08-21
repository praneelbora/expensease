// src/pages/Guide.jsx
import React, { useRef } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
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
    ChevronLeft,
} from "lucide-react";

const Guide = () => {
    const navigate = useNavigate();

    const sections = [
        { id: "overview", label: "Overview", icon: Info },
        { id: "quickstart", label: "Quick Start", icon: Rocket },
        { id: "features", label: "Key Features", icon: ListChecks },
        { id: "workflows", label: "Common Workflows", icon: SplitSquareHorizontal },
        { id: "tips", label: "Tips & Shortcuts", icon: RefreshCcw },
        { id: "faq", label: "FAQ", icon: HelpCircle },
    ];

    const refs = Object.fromEntries(sections.map(s => [s.id, useRef(null)]));

    const jump = (id) => {
        refs[id]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    return (
        <MainLayout>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <div className="flex flex-row gap-2">
                        {/* <button onClick={() => navigate(`account`)}> */}
                        {/* <ChevronLeft /> */}
                        {/* </button> */}
                        <h1 className="text-3xl font-bold capitalize">Guide</h1>
                    </div>
                </div>

                <div className="flex flex-col flex-1 w-full overflow-y-auto pt-3 no-scrollbar gap-4">
                    <div className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl p-3">
                        <p className="text-[13px] text-teal-500 uppercase mb-2">On this page</p>
                        <div className="flex flex-wrap gap-2">
                            {sections.map(({ id, label, icon: Icon }) => (
                                <button
                                    key={id}
                                    onClick={() => jump(id)}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#2a2a2a] bg-[#181818] hover:border-teal-700/40"
                                >
                                    <Icon size={16} className="opacity-80" />
                                    <span className="text-sm">{label}</span>
                                </button>
                            ))}
                        </div>
                    </div>


                    {/* Overview */}
                    <Section ref={refs.overview} id="overview" title="Overview" icon={Info}>
                        <p className="text-[#B8C4A0]">
                            Track personal and shared expenses, split fairly, and keep balances tidy. Privacy is built-in:
                            balances are blurred by default and revealed only when you choose.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                            <StatCard icon={IndianRupee} title="Multi-Currency" desc="Set your default, save expenses in their own currency, and see clear totals." />
                            <StatCard icon={Wallet} title="Payment Accounts" desc="UPI, bank, card, cash, wallet—add balances, blur by default, tap to reveal." />
                            <StatCard icon={Users} title="Groups & Friends" desc="Split with friends or whole groups. Settle up later with clear audit trails." />
                        </div>
                    </Section>

                    {/* Quick Start */}
                    <Section ref={refs.quickstart} id="quickstart" title="Quick Start" icon={Rocket}>
                        <ol className="list-decimal ml-5 space-y-2 text-[#cfdac0]">
                            <li>
                                Add a <NavLink onClick={() => navigate("/paymentMethods")}>Payment Account</NavLink> (e.g., UPI or bank).
                            </li>
                            <li>
                                Set your <NavLink onClick={() => navigate("/account?section=currency")}>Default Currency</NavLink>.
                            </li>
                            <li>
                                Add your first expense from <NavLink onClick={() => navigate("/new-expense")}>New Expense</NavLink>.
                            </li>
                            <li>
                                Invite <NavLink onClick={() => navigate("/friends")}>Friends</NavLink> or create a <NavLink onClick={() => navigate("/groups")}>Group</NavLink> to split.
                            </li>
                            <li>
                                Review balances on the Dashboard and tap a method to view blurred balances.
                            </li>
                        </ol>
                        <div className="mt-3 flex flex-col gap-2">
                            <Primary onClick={() => navigate("/new-expense")} icon={Plus}>Add Expense</Primary>
                            <Ghost onClick={() => navigate("/paymentMethods")} icon={Wallet}>Payment Accounts</Ghost>
                        </div>
                    </Section>

                    {/* Key Features */}
                    <Section ref={refs.features} id="features" title="Key Features" icon={ListChecks}>
                        <FeatureGrid>
                            <Feature
                                icon={SplitSquareHorizontal}
                                title="Personal & Split Expenses"
                                points={[
                                    "Personal: one payer, quick add.",
                                    "Split: multiple payers and owe-ers.",
                                    "Modes: Equal, By Value, By Percent.",
                                ]}
                                action={{ label: "Add Expense", onClick: () => navigate("/new-expense") }}
                            />
                            <Feature
                                icon={Wallet}
                                title="Payment Accounts & Balances"
                                points={[
                                    "Support UPI, bank, card, cash, wallets.",
                                    "Balances always rendered but blurred.",
                                    "Tap “View balances” to reveal for 5s.",
                                ]}
                                action={{ label: "Manage Methods", onClick: () => navigate("/paymentMethods") }}
                            />
                            <Feature
                                icon={Coins}
                                title="Per-Payer Method in Splits"
                                points={[
                                    "Payers can pick their own method.",
                                    "If they have >1 method, selection is required.",
                                    "Prevents ambiguous or wrong debits.",
                                ]}
                            />
                            <Feature
                                icon={IndianRupee}
                                title="Multi-Currency"
                                points={[
                                    "Default currency for summaries.",
                                    "Each expense saved in its own currency.",
                                    "Clear totals and formatted amounts.",
                                ]}
                                action={{ label: "Default Currency", onClick: () => navigate("/account?section=currency") }}
                            />
                            <Feature
                                icon={PieChart}
                                title="Categories & Insights"
                                points={[
                                    "Create your own categories.",
                                    "Dashboard shows recent items & summaries.",
                                    "Drill into personal, friend, or group totals.",
                                ]}
                                action={{ label: "Manage Categories", onClick: () => navigate("/account?section=category") }}
                            />
                            <Feature
                                icon={RefreshCcw}
                                title="Pull-to-Refresh & Snappy UI"
                                points={[
                                    "Pull down on lists to refresh.",
                                    "Escape to close balance modals quickly.",
                                    "Cards, chips, and compact controls.",
                                ]}
                            />
                            <Feature
                                icon={ShieldCheck}
                                title="Privacy & Safety"
                                points={[
                                    "Balances blurred by default.",
                                    "Guided errors prevent wrong splits.",
                                    "Audit logs on updates.",
                                ]}
                            />
                        </FeatureGrid>
                    </Section>

                    {/* Common Workflows */}
                    <Section ref={refs.workflows} id="workflows" title="Common Workflows" icon={SplitSquareHorizontal}>
                        <Workflow
                            title="Split dinner with friends"
                            steps={[
                                "Tap New Expense → add description, amount, category, date.",
                                "Choose Currency if different from default.",
                                "Select who paid (one or more). Amounts auto-split; adjust if needed.",
                                "If any payer has multiple methods, pick one for them.",
                                "Select who owes, choose Equal/Value/Percent, ensure totals match.",
                                "Save. Everyone’s shares are recorded, your payment account debited if applicable.",
                            ]}
                            cta={{ label: "Try it now", onClick: () => navigate("/new-expense") }}
                        />
                        <Workflow
                            title="Record a personal purchase"
                            steps={[
                                "New Expense → Personal mode.",
                                "Fill in description, amount, category, currency.",
                                "Pick your payment account (required if you have >1).",
                                "Save — done.",
                            ]}
                        />
                        <Workflow
                            title="Check balances quickly"
                            steps={[
                                "Dashboard → Payment Accounts section.",
                                "Tap a card → balances reveal for 5 seconds, then auto-blur.",
                                "Add/adjust balances from the Payment Account page.",
                            ]}
                            cta={{ label: "Open Dashboard", onClick: () => navigate("/") }}
                        />
                    </Section>

                    {/* Tips & Shortcuts */}
                    <Section ref={refs.tips} id="tips" title="Tips & Shortcuts" icon={RefreshCcw}>
                        <ul className="list-disc ml-5 space-y-2 text-[#cfdac0]">
                            <li>
                                <b>Inline Coach:</b> the form shows a teal guidance bar telling you the next step (e.g., “select payers”, “assign percentages”).
                            </li>
                            <li>
                                <b>Escape</b> closes balance modals swiftly.
                            </li>
                            <li>
                                If someone has exactly one method, it auto-selects; if they have multiple, they must choose.
                            </li>
                            <li>
                                Groups are perfect for recurring splits (roommates, trips, teams).
                            </li>
                        </ul>
                    </Section>

                    {/* FAQ */}
                    <Section ref={refs.faq} id="faq" title="FAQ" icon={HelpCircle}>
                        <Faq
                            q="Why are balances blurred?"
                            a="Privacy by default. Tap “View balances” to reveal for 5 seconds; they auto-blur again."
                        />
                        <Faq
                            q="I can’t Save in Split mode — what did I miss?"
                            a="Make sure: payers’ amounts add up to the total, each payer with multiple methods has chosen one, and owed amounts (or percentages) match the total or 100%."
                        />
                        <Faq
                            q="Do I have to set a default currency?"
                            a="It’s recommended for clean summaries. Each expense still stores its own currency."
                        />
                    </Section>

                    {/* Footer CTA */}
                    <div className="">
                        <div className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-xl font-semibold">Ready to add your next expense?</h3>
                                <p className="text-[#B8C4A0] text-sm">Quick add for personal, or split with friends & groups.</p>
                            </div>
                            <div className="flex flex-col w-full gap-2">
                                <Primary onClick={() => navigate("/new-expense")} icon={Plus}>Add Expense</Primary>
                                <Ghost onClick={() => navigate("/paymentMethods")} icon={Wallet}>Manage Methods</Ghost>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

/* ---------- Small UI helpers (match your style) ---------- */

const Section = React.forwardRef(({ id, title, icon: Icon, children }, ref) => (
    <section ref={ref} id={id} className="">
        <div className="flex items-center gap-2 mb-2">
            <Icon size={20} className="text-teal-400" />
            <h2 className="text-2xl font-semibold">{title}</h2>
        </div>
        <div className="bg-[#1f1f1f] border border-[#2a2a2a] rounded-xl p-4">{children}</div>
    </section>
));
Section.displayName = "Section";

const StatCard = ({ icon: Icon, title, desc }) => (
    <div className="rounded-xl bg-[#181818] border border-[#2a2a2a] p-3">
        <div className="flex items-center gap-2 mb-1">
            <Icon size={18} className="opacity-80" />
            <h3 className="font-semibold">{title}</h3>
        </div>
        <p className="text-sm text-[#B8C4A0]">{desc}</p>
    </div>
);

const FeatureGrid = ({ children }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
);

const Feature = ({ icon: Icon, title, points = [], action }) => (
    <div className="rounded-xl bg-[#181818] border border-[#2a2a2a] p-4">
        <div className="flex items-center gap-2 mb-2">
            <Icon size={18} className="opacity-80" />
            <h3 className="font-semibold">{title}</h3>
        </div>
        <ul className="list-disc ml-5 space-y-1 text-sm text-[#cfdac0]">
            {points.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
        {action && (
            <button
                onClick={action.onClick}
                className="mt-3 inline-flex items-center gap-2 text-sm text-teal-300 hover:text-teal-200 underline underline-offset-4"
            >
                {action.label} <ChevronRight size={16} />
            </button>
        )}
    </div>
);

const Workflow = ({ title, steps = [], cta }) => (
    <div className="rounded-xl bg-[#181818] border border-[#2a2a2a] p-4 mb-3">
        <h3 className="font-semibold mb-2">{title}</h3>
        <ol className="list-decimal ml-5 space-y-1 text-sm text-[#cfdac0]">
            {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
        {cta && (
            <div className="mt-3">
                <Primary onClick={cta.onClick}>{cta.label}</Primary>
            </div>
        )}
    </div>
);

const Faq = ({ q, a }) => (
    <details className="rounded-xl bg-[#181818] border border-[#2a2a2a] p-4 mb-2">
        <summary className="font-semibold cursor-pointer">{q}</summary>
        <p className="text-sm text-[#cfdac0] mt-2">{a}</p>
    </details>
);

const Primary = ({ children, onClick, icon: Icon }) => (
    <button
        onClick={onClick}
        className="inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-black font-semibold px-4 py-2 rounded-xl"
    >
        {Icon && <Icon size={18} />} {children}
    </button>
);

const Ghost = ({ children, onClick, icon: Icon }) => (
    <button
        onClick={onClick}
        className="inline-flex items-center gap-2 border border-[#2a2a2a] hover:bg-[#1d1d1d] px-4 py-2 rounded-xl"
    >
        {Icon && <Icon size={18} />} {children}
    </button>
);

const NavLink = ({ children, onClick }) => (
    <button
        onClick={onClick}
        className="text-teal-300 hover:text-teal-200 underline underline-offset-4"
    >
        {children}
    </button>
);

export default Guide;
