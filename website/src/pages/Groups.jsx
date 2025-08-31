// src/pages/Groups.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import Modal from "../components/GroupsModal";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Plus, Loader, ChevronRight, Search } from "lucide-react";
import {
    getAllGroups,
    getGroupExpenses,
    joinGroup,
} from "../services/GroupService";
import PullToRefresh from "pulltorefreshjs";
import { logEvent } from "../utils/analytics";
import { getSymbol } from "../utils/currencies";
import SEO from "../components/SEO";

const touchMin = "min-h-[28px]"; // accessibility: comfortable touch targets

export default function Groups() {
    const navigate = useNavigate();
    const location = useLocation();
    const { userToken } = useAuth() || {};

    // data
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);

    // ui
    const [showModal, setShowModal] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [banner, setBanner] = useState(null); // {type:'success'|'error'|'info', text:string}

    // search & filter
    const [query, setQuery] = useState("");
    const [activeFilter, setActiveFilter] = useState("all"); // all | owes_me | i_owe | settled

    // refs
    const hasJoinedRef = useRef(false);
    const scrollRef = useRef(null);

    // ===== number helpers =====
    const currencyDigits = (code, locale = "en-IN") => {
        try {
            const fmt = new Intl.NumberFormat(locale, {
                style: "currency",
                currency: code,
            });
            return fmt.resolvedOptions().maximumFractionDigits ?? 2;
        } catch {
            return 2;
        }
    };
    const roundCurrency = (amount, code, locale = "en-IN") => {
        const d = currencyDigits(code, locale);
        const f = 10 ** d;
        return Math.round((Number(amount) + Number.EPSILON) * f) / f;
    };
    const initials = (name = "") => {
        const parts = String(name).trim().split(" ").filter(Boolean);
        if (!parts.length) return "?";
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[1][0]).toUpperCase();
    };

    // ===== fetch: groups + per-currency totals =====
    const hydrateGroups = async (raw = []) => {
        const enhanced = await Promise.all(
            raw.map(async (group) => {
                try {
                    const res = await getGroupExpenses(group._id, userToken);
                    const expenses = res?.expenses || [];
                    const userId = res?.id;

                    // +ve => you owe; -ve => you are owed
                    const byCode = {};
                    for (const exp of expenses) {
                        const code = exp?.currency || "INR";
                        for (const split of exp?.splits || []) {
                            if (String(split?.friendId?._id) !== String(userId)) continue;
                            const owe = Number(split?.oweAmount) || 0;
                            const pay = Number(split?.payAmount) || 0;
                            byCode[code] = (byCode[code] || 0) + owe - pay;
                        }
                    }

                    const list = Object.entries(byCode)
                        .map(([code, amt]) => {
                            const rounded = roundCurrency(amt, code);
                            const minUnit = 1 / 10 ** currencyDigits(code);
                            return Math.abs(rounded) >= minUnit ? { code, amount: rounded } : null;
                        })
                        .filter(Boolean)
                        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)); // largest first

                    return { ...group, totalOweList: list }; // [{code, amount}]
                } catch (e) {
                    console.error("Error fetching group expenses:", e);
                    return { ...group, totalOweList: [] };
                }
            })
        );
        setGroups(enhanced);
    };

    const fetchGroups = async () => {
        try {
            const data = (await getAllGroups(userToken)) || [];
            await hydrateGroups(data);
        } catch (error) {
            console.error("Groups Page - Error loading groups:", error);
        } finally {
            setLoading(false);
        }
    };

    // ===== join via link: ?join=CODE =====
    const handleJoinGroup = async (joinCode) => {
        try {
            const data = await joinGroup(joinCode, userToken);
            if (data?.error) throw new Error(data.error);
            logEvent("group_join", { screen: "groups", source: "link" });

            // strip ?join= from url
            const url = new URL(window.location.href);
            url.searchParams.delete("join");
            window.history.replaceState({}, "", url);

            setBanner({ type: "success", text: "Joined group successfully." });
            setTimeout(() => setBanner(null), 3000);

            await fetchGroups();
        } catch (error) {
            console.error("Join group error:", error?.message);
            setBanner({
                type: "error",
                text: error?.message || "Failed to join group. Try again.",
            });
        }
    };

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const joinCode = params.get("join");
        if (joinCode && !hasJoinedRef.current) {
            hasJoinedRef.current = true; // only once
            handleJoinGroup(joinCode);
        }
    }, [location]);

    useEffect(() => {
        if (!userToken) return;
        fetchGroups();
    }, [userToken]);

    // pull-to-refresh
    const doRefresh = async () => {
        setRefreshing(true);
        try {
            await fetchGroups();
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

    // ===== filters/search =====
    const groupCategory = (g) => {
        const list = g?.totalOweList || [];
        const hasPos = list.some((x) => x.amount > 0); // you owe
        const hasNeg = list.some((x) => x.amount < 0); // you are owed
        if (!hasPos && !hasNeg) return "settled";
        if (hasPos && !hasNeg) return "i_owe";
        if (!hasPos && hasNeg) return "owes_me";
        return "mixed"; // mixed currencies
    };

    const filteredGroups = useMemo(() => {
        const q = query.trim().toLowerCase();
        return groups
            .filter((g) => {
                // text match on group name or member names/emails
                const matchText =
                    !q ||
                    g.name?.toLowerCase().includes(q) ||
                    (g.members || []).some(
                        (m) =>
                            m?.name?.toLowerCase().includes(q) ||
                            m?.email?.toLowerCase().includes(q)
                    );
                if (!matchText) return false;

                if (activeFilter === "all") return true;
                const cat = groupCategory(g);
                if (activeFilter === "settled") return cat === "settled";
                if (activeFilter === "owes_me") return cat === "owes_me";
                if (activeFilter === "i_owe") return cat === "i_owe";
                return true;
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [groups, query, activeFilter]);

    // ===== skeletons =====
    const SkeletonRow = () => (
        <div className="flex items-stretch gap-3 py-3">
            <div className="h-10 w-10 rounded-lg bg-[#1f1f1f] border border-white/10 animate-pulse" />
            <div className="flex-1">
                <div className="h-3 w-1/3 bg-white/10 rounded mb-2 animate-pulse" />
                <div className="h-3 w-1/2 bg-white/5 rounded animate-pulse" />
            </div>
            <div className="mx-3 w-[1px] self-stretch bg-[#212121]" />
            <div className="h-6 w-28 bg-white/5 rounded border border-white/10 animate-pulse" />
        </div>
    );

    const Count = groups?.length || 0;

    return (
        <MainLayout>
            <SEO
                title="Groups | Expensease"
                description="Create and manage groups for trips, events, or households. Track group expenses and simplify settlements with Expensease."
                canonical="https://www.expensease.in/groups"
                schema={{
                    "@context": "https://schema.org",
                    "@type": "WebPage",
                    name: "Groups | Expensease",
                    description:
                        "Create and manage groups for trips, events, or households. Track group expenses and simplify settlements with Expensease.",
                    url: "https://www.expensease.in/groups",
                }}
            />

            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                {/* Sticky Header */}
                <div className="bg-[#121212] sticky -top-[5px] z-20 pb-2 border-b border-[#EBF1D5]">
                    <div className="flex items-center justify-between">
                        <h1 className="text-3xl font-bold capitalize">
                            Groups
                        </h1>
                        <button
                            aria-label="Create group"
                            className="hidden sm:flex items-center justify-center bg-teal-500 text-black w-8 h-8 rounded-full shadow-md"
                            onClick={() => {
                                logEvent("open_add_group_modal", { screen: "groups", source: "plus" });
                                setShowModal(true);
                            }}
                        >
                            <Plus strokeWidth={3} size={20} />
                        </button>
                    </div>

                    {/* Search + filter chips */}
                    <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
                        {/* search */}
                        <div className="relative w-full sm:max-w-xs">
                            <Search
                                size={16}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888]"
                            />
                            <input
                                className="w-full h-11 px-3 pl-9 pr-3 rounded-xl bg-[#1f1f1f] border border-[#55554f] text-[15px] placeholder-[#81827C] focus:outline-none "
                                placeholder="Search groups or members"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                autoCapitalize="none"
                                autoCorrect="off"

                            />
                        </div>

                        {/* filters */}
                        <div className="flex gap-2 overflow-x-auto no-scrollbar">
                            {[
                                { k: "all", label: "All" },
                                { k: "owes_me", label: "Owes me" },
                                { k: "i_owe", label: "I owe" },
                                { k: "settled", label: "Settled" },
                            ].map(({ k, label }) => (
                                <button
                                    key={k}
                                    onClick={() => setActiveFilter(k)}
                                    className={`px-3 rounded-full border text-xs ${touchMin} ${activeFilter === k
                                        ? "bg-[#EBF1D5] text-[#121212] border-[#EBF1D5]"
                                        : "bg-transparent text-[#EBF1D5] border-[#2a2a2a]"
                                        }`}
                                    aria-pressed={activeFilter === k}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* refresh indicator line */}
                <div
                    className={`h-[2px] bg-teal-400 transition-opacity duration-300 ${refreshing ? "opacity-100" : "opacity-0"
                        }`}
                />

                {/* Banners */}
                {banner && (
                    <div
                        className={`mt-2 mb-2 rounded-md px-3 py-2 text-sm border ${banner.type === "success"
                            ? "bg-teal-900/30 border-teal-500 text-teal-200"
                            : banner.type === "error"
                                ? "bg-red-900/30 border-red-500 text-red-200"
                                : "bg-zinc-800 border-zinc-600 text-zinc-200"
                            }`}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <p className="leading-5">{banner.text}</p>
                            <button
                                className="opacity-70 hover:opacity-100"
                                onClick={() => setBanner(null)}
                                aria-label="Dismiss"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}

                {/* Content */}
                <div
                    ref={scrollRef}
                    className="flex flex-col flex-1 w-full overflow-y-auto no-scrollbar scroll-touch"
                >
                    {loading ? (
                        <div className="flex flex-col gap-2 py-4">
                            {[...Array(6)].map((_, i) => (
                                <SkeletonRow key={i} />
                            ))}
                        </div>
                    ) : filteredGroups.length === 0 ? (
                        <div className="flex flex-1 flex-col justify-center">
                            <div className="flex flex-col items-center justify-center p-4 rounded-lg text-center space-y-3 bg-[#1f1f1f] border border-[#333]">
                                <h2 className="text-2xl font-semibold">No groups yet</h2>
                                <p className="text-sm text-[#888] max-w-sm">
                                    To split expenses with multiple people, create a group.
                                </p>
                                <button
                                    onClick={() => {
                                        logEvent("open_add_group_modal", {
                                            screen: "groups",
                                            source: "cta",
                                        });
                                        setShowModal(true);
                                    }}
                                    className={`bg-teal-500 text-black px-4 py-2 rounded hover:bg-teal-400 transition ${touchMin}`}
                                >
                                    Create Group
                                </button>
                            </div>
                        </div>
                    ) : (
                        <section className="mt-1" role="list" aria-label="Groups list">
                            <div className="divide-y divide-[#212121]">
                                {filteredGroups.map((group) => {
                                    const list = group?.totalOweList || [];
                                    const dominant = list[0]; // biggest by absolute value

                                    const otherCount = Math.max(list.length - 1, 0);

                                    const membersCount = group?.members?.length || 0;

                                    return (
                                        <button
                                            key={group._id}
                                            onClick={() => {
                                                logEvent("navigate", {
                                                    fromScreen: "groups",
                                                    toScreen: "group_detail",
                                                    source: "group_list",
                                                });
                                                navigate(`/groups/${group._id}`);
                                            }}
                                            className={`w-full flex items-stretch gap-3 py-3 active:scale-[.99] transition ${touchMin}`}
                                            role="listitem"
                                            aria-label={`Open ${group.name} details`}
                                        >
                                            {/* Left block: logo-ish + text */}
                                            <div className="h-10 w-10 rounded-lg bg-[#1f1f1f] border border-white/10 flex items-center justify-center text-sm uppercase flex-shrink-0">
                                                {initials(group.name)}
                                            </div>

                                            <div className="min-w-0 flex-1 text-left">
                                                <p className="text-[15px] font-semibold capitalize truncate">
                                                    {group.name}
                                                </p>
                                                <p className="text-xs text-[#888] truncate">
                                                    {membersCount} Member{membersCount === 1 ? "" : "s"}
                                                </p>
                                            </div>

                                            {/* Vertical full-height separator */}
                                            {/* <div
                        className="mx-3 w-[1px] self-stretch bg-[#212121]"
                        aria-hidden="true"
                      /> */}

                                            {/* Right block: balances */}
                                            {list.length > 0 && <div className="flex items-center gap-2">
                                                {dominant ? (
                                                    <span
                                                        className={`px-2 py-1 rounded-md border text-xs bg-white/5 border-white/10 ${dominant.amount < 0
                                                            ? "text-teal-400" // you are owed
                                                            : "text-red-400" // you owe
                                                            }`}
                                                    >
                                                        {dominant.amount < 0 ? "you’re owed " : "you owe "}
                                                        ·{" "}
                                                        {getSymbol("en-IN", dominant.code)}
                                                        {Math.abs(dominant.amount).toFixed(
                                                            currencyDigits(dominant.code)
                                                        )}

                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 rounded-md border text-xs text-[#bbb] bg-white/5 border-white/10">
                                                        Settled
                                                    </span>
                                                )}

                                                {otherCount > 0 && (
                                                    <span className="px-2 py-1 rounded-md border border-white/10 text-xs text-[#bbb] bg-white/5">
                                                        +{otherCount}
                                                    </span>
                                                )}

                                                {/* <ChevronRight className="text-[#888]" size={16} /> */}
                                            </div>}
                                        </button>
                                    );
                                })}
                            </div>

                            <p className="text-center text-sm text-teal-500 mt-3">
                                {filteredGroups.length} Group
                                {filteredGroups.length === 1 ? "" : "s"}
                            </p>
                        </section>
                    )}
                </div>
            </div>

            {/* Mobile FAB */}
            <button
                aria-label="Create group"
                className="sm:hidden fixed bottom-5 right-5 bg-teal-500 text-black w-12 h-12 rounded-full shadow-lg flex items-center justify-center"
                onClick={() => {
                    logEvent("open_add_group_modal", { screen: "groups", source: "fab" });
                    setShowModal(true);
                }}
            >
                <Plus strokeWidth={3} size={24} />
            </button>

            <Modal
                setShowModal={setShowModal}
                showModal={showModal}
                fetchGroups={fetchGroups}
            />
        </MainLayout>
    );
}
