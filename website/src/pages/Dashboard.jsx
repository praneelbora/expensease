import React, { useEffect, useState, useMemo, useRef } from "react";
import MainLayout from "../layouts/MainLayout";
import { getAllExpenses } from "../services/ExpenseService";
import { useAuth } from "../context/AuthContext";
import ExpenseItem from "../components/ExpenseItem";
import ExpenseModal from "../components/ExpenseModal";
import {
    PieChart, Pie, Cell, Tooltip,
    BarChart, Bar, XAxis, YAxis, ResponsiveContainer
} from "recharts";
import { useNavigate } from "react-router-dom";
import { Loader, Menu, Plus } from "lucide-react";
import PullToRefresh from "pulltorefreshjs";
import { logEvent } from "../utils/analytics";
import { getAllCurrencyCodes, getSymbol, toCurrencyOptions } from "../utils/currencies"
import ModalWrapper from "../components/ModalWrapper";
import BalancesModal from "../components/BalancesModal";
import PaymentMethodModal from "../components/PaymentMethodModal";
import { createPaymentMethod } from "../services/PaymentMethodService";
import SEO from "../components/SEO";


const Dashboard = () => {
    // Inside your component:
    const navigate = useNavigate();
    const { user, userToken, defaultCurrency, preferredCurrencies, categories, paymentMethods, fetchPaymentMethods } = useAuth() || {};
    const [expenses, setExpenses] = useState([]);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const didRedirect = useRef(false);
    const pmJustAddedRef = useRef(false);


    const currencyOptions = toCurrencyOptions(getAllCurrencyCodes());
    useEffect(() => {
        if (didRedirect.current) return;
        if (!userToken) return; // treat as logged-in when token exists

        const group = localStorage.getItem("pendingGroupJoin");
        const friend = localStorage.getItem("pendingFriendAdd");

        if (group) {
            localStorage.removeItem("pendingGroupJoin");
            didRedirect.current = true;
            navigate(`/groups?join=${encodeURIComponent(group)}`, { replace: true });
        } else if (friend) {
            localStorage.removeItem("pendingFriendAdd");
            didRedirect.current = true;
            navigate(`/friends?add=${encodeURIComponent(friend)}`, { replace: true });
        }
    }, [userToken, navigate]);

    const fetchExpenses = async () => {
        try {
            const data = await getAllExpenses(userToken);
            setExpenses(data.expenses);
            setUserId(data.id);
            setLoading(false);
        } catch (error) {
            console.error("Failed to load expenses:", error);
        }
    };

    useEffect(() => {
        fetchExpenses();
    }, []);
    const [page, setPage] = useState(0);
    const [showBalances, setShowBalances] = useState(false);
    const [selectedPM, setSelectedPM] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const scrollRef2 = React.useRef(null);

    const itemsPerPage = 2;
    const totalPages = Math.ceil((paymentMethods.length + 1) / itemsPerPage);

    const handleScroll = React.useCallback(() => {
        const el = scrollRef2.current;
        if (!el) return;
        const currentPage = Math.round(el.scrollLeft / el.clientWidth);
        setPage(Math.min(currentPage, totalPages - 1));
    }, [totalPages]);

    React.useEffect(() => {
        const onKey = (e) => e.key === "Escape" && setShowBalances(false);
        if (showBalances) window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [showBalances]);

    function formatMoney(ccy, value = 0) {
        try {
            return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy }).format(value);
        } catch {
            return `${value?.toLocaleString?.() ?? value} ${ccy}`;
        }
    }

    function openBalances(pm) {
        setSelectedPM(pm);
        setShowBalances(true);
    }
    function manageRedirect() {
        setShowBalances(false)
        navigate('/account?section=paymentMethod')
    }


    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const { name, value } = payload[0];
            return (
                <div className="bg-black text-[#EBF1D5] text-sm px-2 py-1 rounded shadow-md">
                    <strong>{name}</strong>: {getSymbol("en-IN", defaultCurrency)}{value.toFixed(2)}
                </div>
            );
        }
        return null;
    };

    const scrollRef = useRef(null);
    const [refreshing, setRefreshing] = useState(false);


    const doRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([fetchExpenses(), fetchPaymentMethods()]);
        } finally {
            setRefreshing(false);
        }
    };
    useEffect(() => {
        if (!scrollRef.current) return;

        PullToRefresh.init({
            mainElement: scrollRef.current,
            onRefresh: doRefresh,
            distThreshold: 60,
            distMax: 120,
            resistance: 2.5,
            shouldPullToRefresh: () =>
                scrollRef.current && scrollRef.current.scrollTop === 0,
        });

        return () => {
            PullToRefresh.destroyAll(); // correct cleanup
        };
    }, []);

    const currencyDigits = (code, locale = "en-IN") => {
        try {
            const fmt = new Intl.NumberFormat(locale, { style: "currency", currency: code });
            return fmt.resolvedOptions().maximumFractionDigits ?? 2;
        } catch {
            return 2;
        }
    };
    const formatAmount = (amount, code) => {
        const d = currencyDigits(code);
        return Number(amount || 0).toLocaleString(undefined, {
            minimumFractionDigits: d,
            maximumFractionDigits: d,
        });
    };
    const onSave = async (payload,) => {
        setSubmitting(true);
        try {
            await createPaymentMethod(payload, userToken);
            setShowPaymentModal(false);
            pmJustAddedRef.current = true;
            await fetchPaymentMethods();
        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to save payment account");
        } finally {
            setSubmitting(false);
        }
    };
    useEffect(() => {
        if (!pmJustAddedRef.current) return;
        pmJustAddedRef.current = false;

        // wait a tick to ensure the new card is rendered
        requestAnimationFrame(() => {
            if (scrollRef2.current) {
                scrollRef2.current.scrollTo({ left: 0, behavior: "smooth" });
            }
            setPage(0);
        });
    }, [paymentMethods?.length]); // react when the number of cards changes

    // === replace your stats useMemo with this ===
    const stats = useMemo(() => {
        const acc = {
            total: {},                         // { [code]: number } - expenses only
            personal: { amount: {}, count: 0 },// { [code]: number }
            group: { amount: {}, count: 0 },
            friend: { amount: {}, count: 0 },
            settle: { amount: {}, count: 0 },// settlements per currency (can be +/-)
        };

        for (const exp of expenses || []) {
            const code = exp?.currency || "INR";

            if (exp.typeOf === "expense") {
                const amt = Number(exp?.amount) || 0;
                const userSplit = exp.splits?.find(s => s.friendId?._id === userId);
                const share = Number(userSplit?.oweAmount);

                if (exp.groupId) {
                    if (userSplit?.owing && Number.isFinite(share)) {
                        acc.group.amount[code] = (acc.group.amount[code] || 0) + share;
                        acc.total[code] = (acc.total[code] || 0) + share;
                    }
                    acc.group.count += 1;
                } else if (exp.splits?.length > 0) {
                    // friend-to-friend split (not in a group)
                    if (userSplit?.owing && Number.isFinite(share)) {
                        acc.friend.amount[code] = (acc.friend.amount[code] || 0) + share;
                        acc.total[code] = (acc.total[code] || 0) + share;
                    }
                    acc.friend.count += 1;
                } else {
                    // purely personal (no group, no splits)
                    acc.personal.amount[code] = (acc.personal.amount[code] || 0) + amt;
                    acc.total[code] = (acc.total[code] || 0) + amt;
                    acc.personal.count += 1;
                }
            } else if (exp.typeOf === "settle") {
                // keep sign if you rely on +/- for direction
                const sAmt = Number(exp?.amount) || 0;
                acc.settle.amount[code] = (acc.settle.amount[code] || 0) + sAmt;
                acc.settle.count += 1;
            }
        }

        return acc;
    }, [expenses, userId]);


    const RADIAN = Math.PI / 180;
    const renderCustomizedLabel = ({ cx, cy, midAngle, outerRadius, percent, name }) => {
        const radius = outerRadius + 10;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);

        return (
            <text
                x={x}
                y={y}
                fill="#EBF1D5"
                textAnchor={x > cx ? "start" : "end"}
                dominantBaseline="central"
                fontSize="12"
            >
                {name} : {(percent * 100).toFixed(2)}%
            </text>
        );
    };


    const categoryChart = useMemo(() => {
        const catTotals = {};

        expenses.forEach(exp => {
            if (exp.typeOf !== "expense") return;

            const category = exp.category || "Uncategorized";

            // Case 1: Split expense (shared with others)
            const userSplit = exp.splits?.find(split => split.friendId?._id === userId);
            if (userSplit?.owing) {
                const owe = userSplit.oweAmount || 0;
                catTotals[category] = (catTotals[category] || 0) + owe;
            }

            // Case 2: Personal expense (no splits)
            if (!exp.groupId && (!exp.splits || exp.splits.length === 0)) {
                catTotals[category] = (catTotals[category] || 0) + exp.amount;
            }
        });

        return Object.entries(catTotals).map(([name, value]) => ({ name, value }));
    }, [expenses, userId]);


    const trendChart = useMemo(() => {
        const monthly = {};

        expenses.forEach(exp => {
            if (exp.typeOf !== "expense") return;

            const month = new Date(exp.createdAt).toLocaleString("default", { month: "short", year: "2-digit" });

            // Case 1: Split expense
            const userSplit = exp.splits?.find(split => split.friendId?._id === userId);
            if (userSplit?.owing) {
                const owe = userSplit.oweAmount || 0;
                monthly[month] = (monthly[month] || 0) + owe;
            }

            // Case 2: Personal expense
            if (!exp.groupId && (!exp.splits || exp.splits.length === 0)) {
                monthly[month] = (monthly[month] || 0) + exp.amount;
            }
        });

        return Object.entries(monthly).map(([name, value]) => ({ name, value }));
    }, [expenses, userId]);
    const generateColors = (count) => {
        const colors = [];
        for (let i = 0; i < count; i++) {
            const hue = Math.floor((360 / count) * i); // evenly spaced hue
            colors.push(`hsl(${hue}, 70%, 60%)`);
        }
        return colors;
    };

    // Example usage:
    const COLORS = useMemo(() => generateColors(categoryChart.length), [categoryChart.length]);


    const renderBarLabel = ({ x, y, width, value }) => {
        return (
            <text
                x={x + width / 2}
                y={y - 5}
                fill="#EBF1D5"
                textAnchor="middle"
                fontSize={12}
            >
                {getSymbol("en-IN", defaultCurrency)}{value}
            </text>
        );
    };



    return (
        <MainLayout>
            <SEO
                title="Dashboard | Expensease"
                description="Track, manage, and analyze your personal and shared expenses with Expensease. Get insights into spending trends and categories."
                canonical="https://www.expensease.in/dashboard"
                schema={{
                    "@context": "https://schema.org",
                    "@type": "WebPage",
                    "name": "Dashboard | Expensease",
                    "description": "Track, manage, and analyze your personal and shared expenses with Expensease. Get insights into spending trends and categories.",
                    "url": "https://www.expensease.in/dashboard"
                }}
            />

            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <h1 className="text-3xl font-bold capitalize">Dashboard</h1>
                    <div className="flex flex-row items-center justify-end align-middle">
                        <button
                            className="flex flex-col items-center justify-center z-10 w-8 h-8 rounded-full shadow-md text-2xl"
                            onClick={() => {
                                logEvent('navigate',
                                    { screen: 'dashboard', to: 'guide', source: 'header' }
                                );
                                navigate(`/guide`)
                            }} >
                            <Menu strokeWidth={2} size={30} />
                        </button>
                    </div>
                </div>
                <div
                    ref={scrollRef}
                    className="flex flex-col flex-1 w-full overflow-y-auto pt-2 no-scrollbar scroll-touch"
                >                    {loading ? (
                    <div className="flex flex-col justify-center items-center flex-1 py-5">
                        <Loader />
                    </div>
                ) : expenses.length === 0 ? (
                    <div className="flex flex-col flex-1 justify-center">
                        <div className="flex flex-col items-center justify-center p-4 rounded-lg  text-center space-y-3 bg-[#1f1f1f]">
                            <h2 className="text-2xl font-semibold">No Expenses Yet</h2>
                            <p className="text-sm text-[#888] max-w-sm">
                                You haven’t added any expenses yet. Start by adding your first one to see stats and insights.
                            </p>
                            <button
                                onClick={() => {
                                    logEvent('navigate', {
                                        screen: 'dashboard', to: 'add_expense', source: 'cta'
                                    })
                                    navigate("/new-expense")
                                }}
                                className="bg-teal-500 text-black px-4 py-2 rounded hover:bg-teal-400 transition"
                            >
                                Add Expense
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2 pb-[75px]">
                        {paymentMethods?.length >= 1 && <div className="flex flex-col gap-2">
                            <p className="text-[13px] text-teal-500 uppercase">Payment Accounts</p>

                            <div
                                ref={scrollRef2}
                                onScroll={handleScroll}
                                className="flex gap-4 overflow-x-auto snap-x snap-mandatory snap-always scroll-smooth no-scrollbar"
                            >
                                {paymentMethods.map((pay) => (
                                    <button
                                        key={pay._id}
                                        type="button"
                                        onClick={() => { setSelectedPM(pay); setShowBalances(true); }}
                                        className="bg-[#1f1f1f] p-4 rounded-xl shadow-md min-w-[calc(50%-8px)] snap-start text-left outline-none "
                                    >
                                        <p className="text-xl font-bold break-words">{pay.label}</p>
                                        <div className="text-[15px] text-[#888] space-y-1">
                                            <div className="capitalize">{pay.type}</div>
                                            <div className="text-xs text-teal-500/80">Tap to view balances</div>
                                        </div>
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => { setShowPaymentModal(true) }}
                                    className="bg-[#1f1f1f] p-4 rounded-xl shadow-md min-w-[calc(50%-8px)] snap-start"
                                >
                                    <div className="w-full flex flex-col justify-center items-center">
                                        <Plus strokeWidth={4} width={30} height={30} />
                                        <p className="text-md text-center break-words text-[#888]">Add New</p>

                                    </div>

                                </button>
                            </div>
                            <BalancesModal
                                show={showBalances}
                                onClose={() => setShowBalances(false)}
                                method={selectedPM}
                                manageRedirect={manageRedirect}
                            />

                            {totalPages > 1 && (
                                <div className="flex justify-center gap-2">
                                    {Array.from({ length: totalPages }).map((_, i) => (
                                        <div
                                            key={i}
                                            className={`h-2 w-2 rounded-full transition-all ${i === page ? "bg-teal-500 scale-110" : "bg-gray-500"}`}
                                        />
                                    ))}
                                </div>
                            )}


                        </div>}

                        {/* Stats */}
                        <div className="flex flex-col gap-2">
                            <p className="text-[13px] text-teal-500 uppercase">Summary</p>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">

                                {/* Total */}
                                <div
                                    className="bg-[#1f1f1f] p-4 rounded-xl shadow-md w-full cursor-pointer"
                                    onClick={() => navigate('/expenses')}
                                >
                                    <p className="text-[15px] text-[#888]">Total Expenses</p>
                                    <div className="text-xl font-bold break-words space-y-1">
                                        {Object.entries(stats.total).map(([code, amt]) => (
                                            <div key={`total-${code}`}>
                                                {getSymbol("en-IN", code)} {formatAmount(amt, code)}
                                            </div>
                                        ))}
                                        {Object.keys(stats.total).length === 0 && <span>—</span>}
                                    </div>
                                </div>

                                {/* Personal */}
                                {Object.keys(stats.personal.amount).length > 0 && (
                                    <div
                                        className="bg-[#1f1f1f] p-4 rounded-xl shadow-md w-full cursor-pointer"
                                        onClick={() => navigate('/expenses?filter=personal')}
                                    >
                                        <p className="text-[15px] text-[#888]">Personal Expenses</p>
                                        <div className="text-xl break-words space-y-1">
                                            {Object.entries(stats.personal.amount).map(([code, amt]) => (
                                                <div key={`personal-${code}`}>
                                                    {getSymbol("en-IN", code)} {formatAmount(amt, code)}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Group */}
                                {Object.keys(stats.group.amount).length > 0 && (
                                    <div
                                        className="bg-[#1f1f1f] p-4 rounded-xl shadow-md w-full cursor-pointer"
                                        onClick={() => navigate('/expenses?filter=group')}
                                    >
                                        <p className="text-[15px] text-[#888]">Group Expenses</p>
                                        <div className="text-xl break-words space-y-1">
                                            {Object.entries(stats.group.amount).map(([code, amt]) => (
                                                <div key={`group-${code}`}>
                                                    {getSymbol("en-IN", code)} {formatAmount(amt, code)}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Friend */}
                                {Object.keys(stats.friend.amount).length > 0 && (
                                    <div
                                        className="bg-[#1f1f1f] p-4 rounded-xl shadow-md w-full cursor-pointer"
                                        onClick={() => navigate('/expenses?filter=friend')}
                                    >
                                        <p className="text-[15px] text-[#888]">Friend Expenses</p>
                                        <div className="text-xl break-words space-y-1">
                                            {Object.entries(stats.friend.amount).map(([code, amt]) => (
                                                <div key={`friend-${code}`}>
                                                    {getSymbol("en-IN", code)} {formatAmount(amt, code)}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                        </div>


                        {/* Last 3 Expenses */}
                        {expenses.length > 0 && <div className="space-y-2">
                            <div className="flex flex-row items-center justify-between mt-2">
                                <h2 className="text-sm text-teal-500 uppercase">Recent Expenses</h2>
                                <button
                                    onClick={() => navigate('/expenses')}
                                    className="text-sm text-teal-500 hover:underline"
                                >
                                    View All
                                </button>
                            </div>

                            <ul className="flex flex-col gap-2">
                                {expenses?.sort((a, b) => new Date(b.date) - new Date(a.date)).filter(f => f.typeOf == 'expense').slice(0, 3).map(exp => (
                                    <ExpenseItem
                                        key={exp._id}
                                        expense={exp}
                                        userId={userId}
                                        onClick={() => { setShowExpenseModal(exp) }}
                                    />
                                ))}
                            </ul>
                        </div>}

                        {/* Charts */}
                        {expenses.length > 0 && <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                            <div className="bg-[#1f1f1f] p-4 rounded-xl shadow-md overflow-hidden">
                                <h3 className="text-lg font-semibold mb-2">Category Distribution</h3>
                                <ResponsiveContainer width="100%" height={250}>
                                    <PieChart>
                                        <Pie
                                            data={categoryChart}
                                            dataKey="value"
                                            nameKey="name"
                                            outerRadius={90}
                                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                            labelLine={false}
                                        >
                                            {categoryChart.map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>

                                        <Tooltip content={<CustomTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="bg-[#1f1f1f] p-4 rounded-xl shadow-md">
                                <h3 className="text-lg font-semibold mb-2">Monthly Trends</h3>
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={trendChart}>
                                        <XAxis dataKey="name" />
                                        <YAxis />
                                        <Tooltip />
                                        <Bar dataKey="value" fill="#00C49F" label={renderBarLabel} />
                                    </BarChart>
                                </ResponsiveContainer>

                            </div>
                        </div>}
                    </div>
                )}
                </div>
                {/* <div className="py-2 text-center text-sm text-[#a0a0a0]">
                    New here?{" "}
                    <button
                        className="text-teal-400 underline"
                        onClick={() => {
                            logEvent('navigate', { screen: 'guide', source: 'cta' });
                            navigate('/guide');
                        }}
                    >
                        Open the Guide
                    </button>
                </div> */}
            </div>
            {showExpenseModal && (
                <ExpenseModal
                    showModal={showExpenseModal}
                    setShowModal={setShowExpenseModal}
                    fetchExpenses={fetchExpenses}
                    userToken={userToken}
                    userId={userId}
                    categories={categories}
                    currencyOptions={currencyOptions}
                    defaultCurrency={defaultCurrency}
                    preferredCurrencies={preferredCurrencies}
                    paymentMethods={paymentMethods}
                />
            )}
            <PaymentMethodModal
                show={showPaymentModal}
                onClose={() => {
                    setShowPaymentModal(false);
                }}
                submitting={submitting}
                onSave={(payload) => onSave(payload)}
            />
        </MainLayout>
    );
};

export default Dashboard;
