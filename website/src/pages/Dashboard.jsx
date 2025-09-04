// src/pages/Dashboard.jsx
import React, { useEffect, useState, useMemo, useRef } from "react";
import MainLayout from "../layouts/MainLayout";
import { getAllExpenses } from "../services/ExpenseService";
import { useAuth } from "../context/AuthContext";
import ExpenseItem from "../components/ExpenseItem";
import ExpenseModal from "@/components/ExpenseModal";
import MonthlyTrends from "@/components/ui/MonthlyTrends";
import CategoryDistribution from "@/components/ui/CategoryDistribution";
import WeeklyExpenseTrends from "@/components/ui/WeeklyTrends"

import { getCategoryOptions, getCategoryLabel } from "../utils/categoryOptions";

import { useNavigate } from "react-router-dom";
import { Loader, Menu, Plus } from "lucide-react";
import PullToRefresh from "pulltorefreshjs";
import { logEvent } from "../utils/analytics";
import { getAllCurrencyCodes, getSymbol, toCurrencyOptions } from "../utils/currencies";
import ModalWrapper from "../components/ModalWrapper";
import BalancesModal from "../components/BalancesModal";
import PaymentMethodModal from "../components/PaymentMethodModal";
import { createPaymentMethod } from "../services/PaymentMethodService";
import SEO from "../components/SEO";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Utility: format currency safely
function safeFormatMoney(ccy, value = 0) {
    try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy }).format(value);
    } catch {
        return `${value?.toLocaleString?.() ?? value} ${ccy}`;
    }
}

const Dashboard = () => {
    const navigate = useNavigate();
    const {
        user,
        userToken,
        defaultCurrency,
        preferredCurrencies,
        categories,
        paymentMethods = [],
        fetchPaymentMethods
    } = useAuth() || {};

    const [expenses, setExpenses] = useState([]);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);

    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedPM, setSelectedPM] = useState(null);
    const [showBalances, setShowBalances] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [summaryRange, setSummaryRange] = useState("thisMonth"); // default

    const didRedirect = useRef(false);
    const pmJustAddedRef = useRef(false);

    const scrollRef = useRef(null);
    const scrollRef2 = useRef(null);

    const [refreshing, setRefreshing] = useState(false);

    const currencyOptions = toCurrencyOptions(getAllCurrencyCodes());

    // --- guide / link redirects on first load ---
    useEffect(() => {
        if (didRedirect.current) return;
        if (!userToken) return;

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

    // --- data fetch ---
    const fetchExpenses = async () => {
        try {
            const data = await getAllExpenses(userToken);
            setExpenses(data.expenses);
            setUserId(data.id);
        } catch (error) {
            console.error("Failed to load expenses:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchExpenses();
    }, []);

    // --- pull to refresh ---
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
        return () => PullToRefresh.destroyAll();
    }, []);

    // --- carousel page dots ---
    const [page, setPage] = useState(0);
    const itemsPerPage = 2;
    const totalPages = Math.ceil((paymentMethods.length + 1) / itemsPerPage);

    const handleScroll = React.useCallback(() => {
        const el = scrollRef2.current;
        if (!el) return;
        const currentPage = Math.round(el.scrollLeft / el.clientWidth);
        setPage(Math.min(currentPage, totalPages - 1));
    }, [totalPages]);

    useEffect(() => {
        if (!pmJustAddedRef.current) return;
        pmJustAddedRef.current = false;
        requestAnimationFrame(() => {
            if (scrollRef2.current) {
                scrollRef2.current.scrollTo({ left: 0, behavior: "smooth" });
            }
            setPage(0);
        });
    }, [paymentMethods?.length]);

    // --- create payment method ---
    const onSave = async (payload) => {
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

    // digits for currency
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
    //     const filteredExpenses = useMemo(() => {
    //   const now = new Date();
    //   const start = new Date(now);

    //   if (summaryRange === "thisMonth") {
    //     start.setMonth(now.getMonth(), 1);
    //   } else if (summaryRange === "last3m") {
    //     start.setMonth(now.getMonth() - 2, 1); // includes this + 2 prev months
    //   } else if (summaryRange === "thisYear") {
    //     start.setMonth(0, 1);
    //   }

    //   start.setHours(0, 0, 0, 0);

    //   return (expenses || []).filter((exp) => new Date(exp.date) >= start);
    // }, [expenses, summaryRange]);

    function getRangeStart(range) {
        const now = new Date();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);

        if (range === "thisMonth") {
            start.setMonth(now.getMonth(), 1);
        } else if (range === "last3m") {
            start.setMonth(now.getMonth() - 2, 1);
        } else if (range === "thisYear") {
            start.setMonth(0, 1);
        }
        start.setHours(0, 0, 0, 0);
        return start;
    }


    const filteredExpenses = useMemo(() => {
        const start = getRangeStart(summaryRange);
        return (expenses || []).filter((exp) => {
            if (exp.typeOf !== "expense") return false;
            const d = new Date(exp.date);
            return d >= start;
        });
    }, [expenses, summaryRange]);


    const stats = useMemo(() => {
        const acc = {
            total: {},
            personal: { amount: {}, count: 0 },
            group: { amount: {}, count: 0 },
            friend: { amount: {}, count: 0 },
            settle: { amount: {}, count: 0 },
        };

        for (const exp of filteredExpenses || []) {
            const code = exp?.currency || "INR";

            if (exp.typeOf === "expense") {
                const amt = Number(exp?.amount) || 0;
                const userSplit = exp.splits?.find((s) => s.friendId?._id === userId);
                const share = Number(userSplit?.oweAmount);

                if (exp.groupId) {
                    if (userSplit?.owing && Number.isFinite(share)) {
                        acc.group.amount[code] = (acc.group.amount[code] || 0) + share;
                        acc.total[code] = (acc.total[code] || 0) + share;
                    }
                    acc.group.count += 1;
                } else if (exp.splits?.length > 0) {
                    if (userSplit?.owing && Number.isFinite(share)) {
                        acc.friend.amount[code] = (acc.friend.amount[code] || 0) + share;
                        acc.total[code] = (acc.total[code] || 0) + share;
                    }
                    acc.friend.count += 1;
                } else {
                    acc.personal.amount[code] = (acc.personal.amount[code] || 0) + amt;
                    acc.total[code] = (acc.total[code] || 0) + amt;
                    acc.personal.count += 1;
                }
            } else if (exp.typeOf === "settle") {
                const sAmt = Number(exp?.amount) || 0;
                acc.settle.amount[code] = (acc.settle.amount[code] || 0) + sAmt;
                acc.settle.count += 1;
            }
        }

        return acc;
    }, [filteredExpenses, userId]);
    function computeAverage(expenses, userId, filter) {
        const totalsByPeriod = {};

        for (const exp of expenses || []) {
            if (exp.typeOf !== "expense") continue;

            const d = new Date(exp.date);
            const code = exp.currency || "INR";
            const userSplit = exp.splits?.find((s) => s.friendId?._id === userId);
            const share = exp.groupId
                ? (userSplit?.owing ? Number(userSplit?.oweAmount) || 0 : 0)
                : exp.splits?.length > 0
                    ? (userSplit?.owing ? Number(userSplit?.oweAmount) || 0 : 0)
                    : Number(exp.amount) || 0;

            if (share <= 0) continue;

            let key;
            if (filter === "thisMonth" || filter === "last3m") {
                // group by month
                key = `${d.getFullYear()}-${d.getMonth()}`;
            } else if (filter === "thisYear") {
                // group by year
                key = d.getFullYear();
            }

            if (!totalsByPeriod[key]) totalsByPeriod[key] = { total: 0, days: new Set() };
            totalsByPeriod[key].total += share;
            totalsByPeriod[key].days.add(d.toDateString());
        }

        // convert to array with averages
        return Object.entries(totalsByPeriod).map(([k, v]) => {
            const avg =
                filter === "thisMonth"
                    ? v.total / v.days.size // daily average
                    : v.total / (filter === "last3m" ? 3 : 12); // monthly average
            return { key: k, avg };
        }).sort((a, b) => a.key > b.key ? 1 : -1);
    }


    const deltas = useMemo(() => {
        if (!expenses?.length) return { total: null, personal: null, group: null, friend: null };

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        function avgForRange(range, typeKey) {
            const now = new Date();

            // always include at least 6 months of data for month-based ranges
            const start = new Date(now);
            if (range === "thisMonth" || range === "last3m") {
                start.setMonth(now.getMonth() - 6, 1);
            } else if (range === "thisYear") {
                start.setFullYear(now.getFullYear() - 1, 0, 1);
            }
            start.setHours(0, 0, 0, 0);

            const data = (expenses || []).filter((exp) => {
                if (exp.typeOf !== "expense") return false;
                const d = new Date(exp.date);
                if (d < start) return false;

                // --- filter by typeKey ---
                if (typeKey === "group") return !!exp.groupId;
                if (typeKey === "friend") return !exp.groupId && exp.splits?.length > 0;
                if (typeKey === "personal") return !exp.groupId && (!exp.splits || exp.splits.length === 0);
                return true; // total
            });

            const totalsByPeriod = {};
            for (const exp of data) {
                const d = new Date(exp.date);
                const userSplit = exp.splits?.find((s) => s.friendId?._id === userId);
                let share = exp.groupId
                    ? (userSplit?.owing ? Number(userSplit?.oweAmount) || 0 : 0)
                    : exp.splits?.length > 0
                        ? (userSplit?.owing ? Number(userSplit?.oweAmount) || 0 : 0)
                        : Number(exp.amount) || 0;
                if (share <= 0) continue;

                let bucketKey, bucketDate;
                if (range === "thisMonth" || range === "last3m") {
                    bucketKey = `${d.getFullYear()}-${d.getMonth()}`;
                    bucketDate = new Date(d.getFullYear(), d.getMonth(), 1);
                } else {
                    bucketKey = `${d.getFullYear()}`;
                    bucketDate = new Date(d.getFullYear(), 0, 1);
                }

                if (!totalsByPeriod[bucketKey]) {
                    totalsByPeriod[bucketKey] = { key: bucketKey, date: bucketDate, total: 0, personal: 0, group: 0, friend: 0, days: new Set() };
                }
                totalsByPeriod[bucketKey][typeKey] += share;
                totalsByPeriod[bucketKey].total += share;
                totalsByPeriod[bucketKey].days.add(d.toDateString());
            }
            const arr = Object.values(totalsByPeriod).sort((a, b) => a.date - b.date);

            // ----- delta logic -----
            if (range === "thisMonth") {
                const last = arr[arr.length - 1];
                const prev = arr[arr.length - 2]; // now this exists!

                if (!last || !prev || prev.days.size === 0) return null;
                const lastAvg = last[typeKey] / last.days.size;
                const prevAvg = prev[typeKey] / prev.days.size;
                if (prevAvg === 0) return null;
                const pct = ((lastAvg - prevAvg) / prevAvg) * 100;
                return {
                    text: `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}% from last month`,
                    color: pct <= 0 ? "text-teal-500" : "text-red-500"
                }
            }

            if (range === "last3m") {
                const last3 = arr.slice(-3);
                const prev2 = arr.slice(-5, -3);
                if (last3.length < 3 || prev2.length < 2) return null;

                const lastAvg = last3.reduce((s, x) => s + x[typeKey], 0) / 3;
                const prevAvg = prev2.reduce((s, x) => s + x[typeKey], 0) / 2;
                if (prevAvg === 0) return null;

                const pct = ((lastAvg - prevAvg) / prevAvg) * 100;

                return {
                    text: `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}% from last 3 months`,
                    color: pct >= 0 ? "text-green-500" : "text-red-500"
                };
            }

            if (range === "thisYear") {
                const thisYear = arr.filter((a) => a.date.getFullYear() === currentYear);
                const prevYear = arr.filter((a) => a.date.getFullYear() === currentYear - 1);
                if (!thisYear.length || !prevYear.length) return null;

                const thisAvg = thisYear.reduce((s, x) => s + x[typeKey], 0) / thisYear.length;
                const prevAvg = prevYear.reduce((s, x) => s + x[typeKey], 0) / prevYear.length;
                if (prevAvg === 0) return null;

                const pct = ((thisAvg - prevAvg) / prevAvg) * 100;
                return {
                    text: `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}% vs last year`,
                    color: pct >= 0 ? "text-green-500" : "text-red-500"
                };
            }

            return null;
        }



        return {
            total: avgForRange(summaryRange, "total"),
            personal: avgForRange(summaryRange, "personal"),
            group: avgForRange(summaryRange, "group"),
            friend: avgForRange(summaryRange, "friend"),
        };
    }, [expenses, userId, summaryRange]);

    // --- date-grouped recent expenses ---
    const recentByDay = useMemo(() => {
        const bucket = {};
        (expenses || [])
            .filter(e => e.typeOf === "expense")
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 3)
            .forEach(e => {
                const d = new Date(e.date);
                const key = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(d);
                (bucket[key] ||= []).push(e);
            });
        return bucket;
    }, [expenses]);


    function manageRedirect() {
        setShowBalances(false);
        logEvent('navigate', {
            fromScreen: 'dashboard', toScreen: 'account_settings', source: 'balances_modal', section: 'payment_accounts'
        });
        navigate('/account?section=paymentMethod');
    }
    // --- micro trend chart (per month, per type) ---


    // micro trend (very lightweight): change vs previous bucket
    // const totalDeltaText = useMemo(() => {
    //     const vals = Object.values(stats.total || {});
    //     if (!vals.length) return null;
    //     // compute a naive month delta from trendChart
    //     if (!trendChart || trendChart.length < 2) return null;
    //     const last = trendChart[trendChart.length - 1]?.value || 0;
    //     const prev = trendChart[trendChart.length - 2]?.value || 0;
    //     if (prev <= 0) return null;
    //     const pct = ((last - prev) / prev) * 100;
    //     const arrow = pct >= 0 ? "▲" : "▼";
    //     return `${arrow} ${Math.abs(pct).toFixed(0)}% vs previous`;
    // }, [stats.total, trendChart]);

    // --- accessible page dots ---
    const dotsAnnounceRef = useRef(null);
    useEffect(() => {
        if (!dotsAnnounceRef.current) return;
        dotsAnnounceRef.current.textContent = `Page ${page + 1} of ${Math.max(totalPages, 1)}`;
    }, [page, totalPages]);


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
                {/* top refresh indicator */}
                <div className={`h-[2px] bg-teal-400 transition-opacity ${refreshing ? "opacity-100" : "opacity-0"}`} />

                {/* header */}
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row items-center justify-between">
                    <h1 className="text-3xl font-bold capitalize">Dashboard</h1>

                    <div className="flex items-center gap-3">
                        {/* vertical separator (full height inside row) */}
                        <div className="w-[1px] self-stretch bg-[#212121]" aria-hidden="true" />
                        <button
                            aria-label="Open guide"
                            className="flex items-center justify-center w-8 h-8 rounded-full"
                            onClick={() => {
                                logEvent('navigate', { fromScreen: 'dashboard', toScreen: 'guide', source: 'header' });
                                navigate(`/guide`);
                            }}
                        >
                            <Menu strokeWidth={2} size={26} />
                            <span className="sr-only">Open guide</span>
                        </button>
                    </div>
                </div>

                <div
                    ref={scrollRef}
                    className="flex flex-col flex-1 w-full overflow-y-auto pt-2 no-scrollbar scroll-touch"
                    aria-busy={loading}
                >
                    {loading ? (
                        <div className="flex flex-col justify-center items-center flex-1 py-5">
                            <Loader />
                        </div>
                    ) : expenses.length === 0 ? (
                        <div className="flex flex-col flex-1 justify-center">
                            <div className="flex flex-col items-center justify-center p-4 rounded-lg text-center space-y-3 bg-[#1f1f1f]">
                                <h2 className="text-2xl font-semibold">No Expenses Yet</h2>
                                <p className="text-sm text-[#888] max-w-sm">
                                    You haven’t added any expenses yet. Start by adding your first one to see stats and insights.
                                </p>
                                <button
                                    onClick={() => {
                                        logEvent('navigate', { fromScreen: 'dashboard', toScreen: 'new-expense', source: 'cta' });
                                        navigate("/new-expense");
                                    }}
                                    className="bg-teal-500 text-black px-4 py-2 rounded hover:bg-teal-400 transition"
                                >
                                    Add Expense
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3 pb-[15px]">
                            {/* Payment accounts carousel */}
                            {paymentMethods.length >= 1 && (
                                <div className="flex flex-col gap-2">
                                    <p className="text-[13px] text-teal-500 uppercase">Payment Accounts</p>


                                    <div
                                        ref={scrollRef2}
                                        onScroll={handleScroll}
                                        className="flex gap-3 overflow-x-auto snap-x snap-mandatory snap-always scroll-smooth no-scrollbar"
                                        aria-label="Payment accounts carousel"
                                    >
                                        {paymentMethods.sort((a, b) => {
                                            const aDefault = a.isDefaultSend || a.isDefaultReceive;
                                            const bDefault = b.isDefaultSend || b.isDefaultReceive;
                                            return bDefault - aDefault; // puts defaults first
                                        }).map((pay) => (
                                            <button
                                                key={pay._id}
                                                type="button"
                                                role="button"
                                                aria-label={`Open balances for ${pay.label}`}
                                                onClick={() => {
                                                    logEvent('open_balances_modal', {
                                                        screen: 'dashboard', source: 'payment_accounts', paymentMethodType: pay.type
                                                    });
                                                    setSelectedPM(pay);
                                                    setShowBalances(true);
                                                }}
                                                className="bg-[#1f1f1f] p-4 rounded-xl min-w-[calc(50%-8px)] snap-start text-left outline-none"
                                            >
                                                {console.log(pay)}
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-xl font-bold break-words">{pay.label}</p>
                                                        <div className="text-[15px] text-[#888] space-y-1">
                                                            <div className="capitalize">{pay.type}</div>
                                                            <div className="text-xs text-teal-500/80">Tap to view balances</div>
                                                        </div>
                                                    </div>
                                                    {/* vertical separator */}
                                                    {/* <div className="w-[1px] self-stretch bg-[#212121]" aria-hidden="true" /> */}
                                                </div>

                                                {/* mini balances (up to two) */}
                                                {/* {!!(pay?.balances && Object.keys(pay.balances).length) && (
                            <div className="mt-3 flex gap-1 flex-wrap">
                              {Object.entries(pay.balances)
                                .slice(0, 2)
                                .map(([code, obj]) => {
                                  const val = Number(obj?.available || 0);
                                  return (
                                    <span
                                      key={code}
                                      className="px-2 py-0.5 rounded-md text-xs bg-white/5 border border-white/10"
                                    >
                                      {getSymbol(code)} {formatAmount(val, code)}
                                    </span>
                                  );
                                })}
                              {Object.keys(pay.balances).length > 2 && (
                                <span className="px-2 py-0.5 rounded-md text-xs text-[#999] bg-white/5 border border-white/10">
                                  +{Object.keys(pay.balances).length - 2}
                                </span>
                              )}
                            </div>
                          )} */}
                                            </button>
                                        ))}

                                        {/* Add new card */}
                                        <button
                                            type="button"
                                            role="button"
                                            aria-label="Add new payment account"
                                            onClick={() => {
                                                logEvent('open_add_payment_method_modal', {
                                                    screen: 'dashboard', source: 'add_payment_account'
                                                });
                                                setShowPaymentModal(true);
                                            }}
                                            className="bg-[#1f1f1f] p-4 rounded-xl shadow-md min-w-[calc(50%-8px)] snap-start"
                                        >
                                            <div className="w-full flex flex-col justify-center items-center">
                                                <Plus strokeWidth={4} width={30} height={30} />
                                                <p className="text-md text-center break-words text-[#888]">Add New</p>
                                            </div>
                                        </button>
                                    </div>

                                    {/* edge fades */}
                                    <div className="pointer-events-none absolute left-0 top-0 h-full w-6 bg-gradient-to-r from-[#121212] to-transparent" />
                                    <div className="pointer-events-none absolute right-0 top-0 h-full w-6 bg-gradient-to-l from-[#121212] to-transparent" />


                                    {/* page dots + aria-live status */}
                                    {totalPages > 1 && (
                                        <div className="flex justify-center gap-2" aria-label="Carousel pagination">
                                            {Array.from({ length: totalPages }).map((_, i) => (
                                                <div
                                                    key={i}
                                                    className={`h-2 w-2 rounded-full transition-all ${i === page ? "bg-teal-500 scale-110" : "bg-gray-500"}`}
                                                />
                                            ))}
                                            <span ref={dotsAnnounceRef} className="sr-only" aria-live="polite" />
                                        </div>
                                    )}

                                    <BalancesModal
                                        show={showBalances}
                                        onClose={() => setShowBalances(false)}
                                        method={selectedPM}
                                        manageRedirect={manageRedirect}
                                    />
                                </div>
                            )}

                            {/* Summary */}
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-[13px] text-teal-500 uppercase">Summary</p>
                                    {/* small currency legend when multiple currencies exist */}
                                    {Object.keys(stats.total || {}).length > 1 && (
                                        <div className="flex items-center gap-2">
                                            {Object.keys(stats.total).map((code) => (
                                                <span
                                                    key={code}
                                                    className="px-2 py-0.5 rounded-md text-[11px] bg-white/5 border border-white/10"
                                                    title={code}
                                                >
                                                    {code} {getSymbol(code)}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <Select value={summaryRange} onValueChange={setSummaryRange}>
                                    <SelectTrigger className="w-[160px] h-8 text-xs">
                                        <SelectValue placeholder="Select range" />
                                    </SelectTrigger>
                                    <SelectContent className="border-[#EBF1D5] bg-[#212121]">
                                        <SelectItem className="text-[#EBF1D5]" value="thisMonth">This Month</SelectItem>
                                        <SelectItem className="text-[#EBF1D5]" value="last3m">Last 3 Months</SelectItem>
                                        <SelectItem className="text-[#EBF1D5]" value="thisYear">This Year</SelectItem>
                                    </SelectContent>
                                </Select>

                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                                    {/* Total */}
                                    <div
                                        className="bg-[#1f1f1f] p-4 rounded-xl shadow-md w-full cursor-pointer"
                                        role="button"
                                        aria-label="Open all expenses"
                                        onClick={() => {
                                            logEvent('navigate', { fromScreen: 'dashboard', toScreen: 'expenses', source: 'total_expenses' });
                                            navigate('/expenses');
                                        }}
                                    >
                                        <p className="text-[15px] text-[#888]">Total Expenses</p>
                                        <div className="text-xl font-bold break-words space-y-1">
                                            {Object.entries(stats.total).map(([code, amt]) => (
                                                <div key={`total-${code}`}>
                                                    {getSymbol(code)} {formatAmount(amt, code)}
                                                </div>
                                            ))}
                                            {Object.keys(stats.total).length === 0 && <span>—</span>}
                                        </div>
                                        <p className={`text-[11px] ${deltas?.total?.color ? deltas.total.color : 'text-[#888]'} mt-1`}>
                                            {deltas.total ? <> {deltas.total.text}</> : null}
                                        </p>
                                        {(stats.personal.count + stats.group.count + stats.friend.count) > 0 && (<>
                                            <p className="text-[11px] text-[#888]">
                                                {stats.personal.count + stats.group.count + stats.friend.count} transactions
                                            </p>
                                        </>
                                        )}
                                    </div>

                                    {/* Personal */}
                                    {Object.keys(stats.personal.amount).length > 0 && (
                                        <div
                                            className="bg-[#1f1f1f] p-4 rounded-xl shadow-md w-full cursor-pointer"
                                            role="button"
                                            aria-label="Open personal expenses"
                                            onClick={() => {
                                                logEvent('navigate', { fromScreen: 'dashboard', toScreen: 'personal_expenses', source: 'personal_expenses' });
                                                navigate('/expenses?type=personal');
                                            }}
                                        >
                                            <p className="text-[15px] text-[#888]">Personal Expenses</p>
                                            <div className="text-xl break-words space-y-1">
                                                {Object.entries(stats.personal.amount).map(([code, amt]) => (
                                                    <div key={`personal-${code}`}>
                                                        {getSymbol(code)} {formatAmount(amt, code)}
                                                    </div>
                                                ))}
                                            </div>
                                            <p className={`text-[11px] ${deltas?.personal?.color ? deltas.personal.color : 'text-[#888]'} mt-1`}>
                                                {deltas.personal ? <> {deltas.personal.text}</> : null}
                                            </p>
                                            <p className="text-[11px] text-[#888]">{stats.personal.count} transactions</p>
                                        </div>
                                    )}

                                    {/* Group */}
                                    {Object.keys(stats.group.amount).length > 0 && (
                                        <div
                                            className="bg-[#1f1f1f] p-4 rounded-xl shadow-md w-full cursor-pointer"
                                            role="button"
                                            aria-label="Open group expenses"
                                            onClick={() => {
                                                logEvent('navigate', { fromScreen: 'dashboard', toScreen: 'expenses', source: 'group_expenses' });
                                                navigate('/expenses?type=group');
                                            }}
                                        >
                                            <p className="text-[15px] text-[#888]">Group Expenses</p>
                                            <div className="text-xl break-words space-y-1">
                                                {Object.entries(stats.group.amount).map(([code, amt]) => (
                                                    <div key={`group-${code}`}>
                                                        {getSymbol(code)} {formatAmount(amt, code)}
                                                    </div>
                                                ))}
                                            </div>
                                            <p className={`text-[11px] ${deltas?.group?.color ? deltas.group.color : 'text-[#888]'} mt-1`}>
                                                {deltas.group ? <> {deltas.group.text}</> : null}
                                            </p>
                                            <p className="text-[11px] text-[#888]">{stats.group.count} transactions</p>
                                        </div>
                                    )}

                                    {/* Friend */}
                                    {Object.keys(stats.friend.amount).length > 0 && (
                                        <div
                                            className="bg-[#1f1f1f] p-4 rounded-xl shadow-md w-full cursor-pointer"
                                            role="button"
                                            aria-label="Open friend expenses"
                                            onClick={() => navigate('/expenses?type=friend')}
                                        >
                                            <p className="text-[15px] text-[#888]">Friend Expenses</p>
                                            <div className="text-xl break-words space-y-1">
                                                {Object.entries(stats.friend.amount).map(([code, amt]) => (
                                                    <div key={`friend-${code}`}>
                                                        {getSymbol(code)} {formatAmount(amt, code)}
                                                    </div>
                                                ))}
                                            </div>
                                            <p className={`text-[11px] ${deltas?.friend?.color ? deltas.friend.color : 'text-[#888]'} mt-1`}>
                                                {deltas.friend ? <> {deltas.friend.text}</> : null}
                                            </p>
                                            <p className="text-[11px] text-[#888]">{stats.friend.count} transactions</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Recent Expenses (date grouped) */}
                            {expenses.length > 0 && (
                                <div className="">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-sm text-teal-500 uppercase">Recent Expenses</h2>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => {
                                                    logEvent('navigate', { fromScreen: 'dashboard', toScreen: 'expenses', source: 'view_all' });
                                                    navigate('/expenses');
                                                }}
                                                className="text-sm text-teal-500 hover:underline py-2"
                                            >
                                                View All
                                            </button>
                                        </div>
                                    </div>

                                    {Object.entries(recentByDay).map(([day, list]) => (
                                        <div key={day}>
                                            <div className="flex items-center gap-3">
                                                <p className="mt-2 mb-1 text-[11px] uppercase tracking-wide text-teal-500">{day}</p>
                                                {/* full-height thin separator beside header */}
                                                {/* <div className="w-[1px] self-stretch bg-[#212121]" aria-hidden="true" /> */}
                                            </div>
                                            <ul className="flex flex-col gap-2">
                                                {list.slice(0, 3).map(exp => (
                                                    <ExpenseItem
                                                        key={exp._id}
                                                        expense={exp}
                                                        userId={userId}
                                                        onClick={() => {
                                                            logEvent('open_expense_modal', { screen: 'dashboard' });
                                                            setShowExpenseModal(exp);
                                                        }}
                                                    />
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Charts */}
                            {expenses.length > 0 && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                    <CategoryDistribution
                                        expenses={expenses}
                                        userId={userId}
                                        defaultCurrency={defaultCurrency}
                                    />

                                    <MonthlyTrends
                                        expenses={expenses}
                                        userId={userId}
                                        defaultCurrency={defaultCurrency}
                                    />

                                    <WeeklyExpenseTrends
                                        expenses={expenses}
                                        userId={userId}
                                        defaultCurrency={defaultCurrency}
                                    />
                                </div>

                            )}
                        </div>
                    )}
                </div>
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
                onClose={() => setShowPaymentModal(false)}
                submitting={submitting}
                onSave={(payload) => onSave(payload)}
            />
        </MainLayout>
    );
};

export default Dashboard;
