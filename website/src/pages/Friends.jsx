// src/pages/Friends.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import Modal from "../components/FriendsModal";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import {
    getFriends,
    acceptLinkFriendRequest,
    fetchReceivedRequests,
    acceptFriendRequest,
    rejectFriendRequest,
} from "../services/FriendService";
import { getAllExpenses, getFriendsExpense } from "../services/ExpenseService";
import { getLoans } from "../services/LoanService";
import { getSymbol } from "../utils/currencies";
import PullToRefresh from "pulltorefreshjs";
import { logEvent } from "../utils/analytics";
import SEO from "../components/SEO";
import {
    Plus,
    Search,
} from "lucide-react";

const touchMin = "min-h-[28px]"; // accessibility: comfortable touch targets

const Friends = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { userToken } = useAuth() || {};

    // data
    const [friends, setFriends] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [loans, setLoans] = useState([]);
    const [receivedRequests, setReceivedRequests] = useState([]);
    const [userId, setUserId] = useState(null);

    // ui
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [banner, setBanner] = useState(null); // {type, text}

    // search & filters
    const [query, setQuery] = useState("");
    const [activeFilter, setActiveFilter] = useState("all"); // all | owes_me | i_owe | settled

    const scrollRef = useRef(null);
    const hasRequestedRef = useRef(false);

    // ===== utils =====
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

    // ===== fetchers =====
    const fetchReceived = async () => {
        try {
            const data = await fetchReceivedRequests(userToken);
            setReceivedRequests((data || []).slice(0, 4));
        } catch (err) {
            console.error("Error fetching received requests:", err);
        }
    };
    const fetchFriends = async () => {
        try {
            const data = await getFriends(userToken);
            if (data?.length > 0) setFriends(data);
        } catch (error) {
            console.error("Error loading friends:", error);
        } finally {
            setLoading(false);
        }
    };
    const fetchExpenses = async () => {
        try {
            const data = await getAllExpenses(userToken);
            setExpenses((data?.expenses || []));
            setUserId(data?.id || null);
        } catch (error) {
            console.error("Error loading expenses:", error);
        }
    };
    const fetchLoansData = async () => {
        try {
            const data = await getLoans(userToken);
            setLoans(data || []);
        } catch (error) {
            console.error("Error loading loans:", error);
        }
    };

    const doRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([
                fetchReceived(),
                fetchFriends(),
                fetchExpenses(),
                fetchLoansData(),
            ]);
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

    useEffect(() => {
        fetchReceived();
        fetchFriends();
        fetchExpenses();
        fetchLoansData();
    }, []);

    // handle friend link accept from ?add=
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const toId = params.get("add");
        if (toId && !hasRequestedRef.current) {
            hasRequestedRef.current = true;
            handleLinkRequest(toId);
        }
    }, [location]);

    const handleLinkRequest = async (toId) => {
        try {
            const data = await acceptLinkFriendRequest(toId, userToken);
            if (data?.error || data?.message?.toLowerCase?.().includes("error")) {
                const errorMsg = data.message || data.error || "Failed to send friend request.";
                setBanner({ type: "error", text: errorMsg });
                return;
            }
            logEvent("friend_request_send", {
                screen: "friends",
                surface: "modal",
                source: "link",
            });
            await fetchReceived();
            setBanner({
                type: "success",
                text:
                    "Friend request sent. Ask them to accept it before you can add shared expenses.",
            });
            setTimeout(() => setBanner(null), 5000);
        } catch (error) {
            console.error("Error sending link request:", error);
            setBanner({ type: "error", text: "Something went wrong. Please try again." });
        }
    };

    const handleAccept = async (id) => {
        try {
            logEvent("friend_request_accept", { screen: "friends" });
            await acceptFriendRequest(id, userToken);
            await Promise.all([fetchFriends(), fetchReceived()]);
            setBanner({ type: "success", text: "Friend request accepted." });
            setTimeout(() => setBanner(null), 3000);
        } catch (err) {
            console.log(err.message || "Error accepting request");
            setBanner({ type: "error", text: "Could not accept the request." });
        }
    };
    const handleReject = async (id) => {
        try {
            logEvent("friend_request_reject", { screen: "friends" });
            await rejectFriendRequest(id, userToken);
            await fetchReceived();
            setBanner({ type: "info", text: "Friend request declined." });
            setTimeout(() => setBanner(null), 3000);
        } catch (err) {
            console.log(err.message || "Error rejecting request");
            setBanner({ type: "error", text: "Could not decline the request." });
        }
    };

    function simplifyDebts(totalDebt, members, locale = "en-IN") {
        const transactions = [];
        const currencies = new Set();

        // Collect all currencies across all members
        Object.values(totalDebt).forEach(map =>
            Object.keys(map || {}).forEach(c => currencies.add(c))
        );

        currencies.forEach(code => {
            // precision + thresholds
            let digits = 2;
            try {
                const fmt = new Intl.NumberFormat(locale, { style: "currency", currency: code });
                digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
            } catch { }
            const pow = 10 ** digits;
            const round = v => Math.round((Number(v) + Number.EPSILON) * pow) / pow;
            const minUnit = 1 / pow;

            const owe = [];
            const owed = [];

            // Split members into owe/owed
            for (const memberId in totalDebt) {
                const amt = round(totalDebt[memberId]?.[code] || 0);
                if (amt > 0) {
                    owed.push({ memberId, amount: amt });
                } else if (amt < 0) {
                    owe.push({ memberId, amount: Math.abs(amt) });
                }
            }

            let i = 0, j = 0;
            // safety guard to avoid infinite loops
            let guard = 0, guardMax = (owe.length + owed.length + 1) * 5000;

            while (i < owe.length && j < owed.length) {
                if (guard++ > guardMax) {
                    console.warn("simplifyDebts: guard break", code);
                    break;
                }

                const transfer = Math.min(owe[i].amount, owed[j].amount);
                if (transfer >= minUnit) {
                    transactions.push({
                        from: owe[i].memberId,
                        to: owed[j].memberId,
                        amount: round(transfer),
                        currency: code,
                    });
                }

                // subtract the transfer
                owe[i].amount = round(owe[i].amount - transfer);
                owed[j].amount = round(owed[j].amount - transfer);

                // clamp tiny residuals
                if (Math.abs(owe[i].amount) < minUnit) owe[i].amount = 0;
                if (Math.abs(owed[j].amount) < minUnit) owed[j].amount = 0;

                if (owe[i].amount === 0) i++;
                if (owed[j].amount === 0) j++;
            }
        });

        return transactions;
    }

    // console.log(groupedByGroup);

    function simplifyDebts(totalDebt, members) {
        // totalDebt: { memberId: { [code]: net } }
        // net > 0 => others owe this member; net < 0 => this member owes others
        const out = [];

        // collect all currency codes present
        const codes = new Set();
        for (const m of members) {
            const map = totalDebt[m._id] || {};
            Object.keys(map).forEach((c) => codes.add(c));
        }

        for (const code of codes) {
            const creditors = []; // {id, amt>0}
            const debtors = [];   // {id, amt<0}
            for (const m of members) {
                const v = roundCurrency((totalDebt[m._id]?.[code] ?? 0), code);
                if (v > 0) creditors.push({ id: String(m._id), amt: v });
                else if (v < 0) debtors.push({ id: String(m._id), amt: v }); // negative
            }

            // Greedy match biggest abs values
            creditors.sort((a, b) => b.amt - a.amt);
            debtors.sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt));

            let ci = 0, di = 0;
            while (ci < creditors.length && di < debtors.length) {
                const c = creditors[ci];
                const d = debtors[di];
                const pay = Math.min(c.amt, -d.amt);
                const amt = roundCurrency(pay, code);

                if (amt > 0) {
                    out.push({ from: d.id, to: c.id, amount: amt, currency: code });
                    c.amt = roundCurrency(c.amt - amt, code);
                    d.amt = roundCurrency(d.amt + amt, code); // d.amt is negative; moves toward 0
                }

                if (c.amt <= 0) ci++;
                if (d.amt >= 0) di++;
            }
        }

        return out;
    }

    // ===== STATE TO HOLD SIMPLIFIED TX =====
    const [simplifiedTransactions, setSimplifiedTransactions] = useState([]);

    // ===== MAIN EFFECT =====
    useEffect(() => {
        if (!Array.isArray(expenses) || expenses.length === 0) {
            setSimplifiedTransactions([]);
            return;
        }

        const groupExpenses = expenses.filter((exp) => exp?.groupId != null);

        const calculateDebt = (groupExpenses, members) => {
            // memberId -> { [currency]: netAmount }
            const totalDebt = {};
            members.forEach((m) => { totalDebt[m._id] = {}; });

            for (const exp of groupExpenses) {
                const code = exp?.currency || "INR";
                const splits = Array.isArray(exp?.splits) ? exp.splits : [];
                for (const split of splits) {
                    const memberId = String(split?.friendId?._id || "");
                    if (!memberId) continue;
                    const curMap = totalDebt[memberId] || (totalDebt[memberId] = {});
                    if (curMap[code] == null) curMap[code] = 0;

                    const pay = Number(split?.payAmount) || 0;
                    const owe = Number(split?.oweAmount) || 0;

                    // convention: +ve means is owed, -ve means owes
                    if (pay > 0) curMap[code] += pay;
                    if (owe > 0) curMap[code] -= owe;
                }
            }
            return totalDebt;
        };

        // group -> collect expenses and members
        const groupedByGroup = groupExpenses.reduce((acc, exp) => {
            const gid = String(exp?.groupId?._id || "");
            if (!gid) return acc;
            if (!acc[gid]) acc[gid] = { group: exp.groupId, members: [], expenses: [] };
            acc[gid].expenses.push(exp);

            const splits = Array.isArray(exp?.splits) ? exp.splits : [];
            for (const s of splits) {
                const sid = String(s?.friendId?._id || "");
                if (!sid) continue;
                if (!acc[gid].members.find((m) => String(m._id) === sid)) {
                    acc[gid].members.push(s.friendId);
                }
            }
            return acc;
        }, {});

        const allTx = [];

        for (const gid of Object.keys(groupedByGroup)) {
            const { group, members, expenses: gx } = groupedByGroup[gid];

            // Safety: skip degenerate groups
            if (!Array.isArray(members) || members.length === 0) continue;

            const totalDebt = calculateDebt(gx, members);
            const simplified = simplifyDebts(totalDebt, members)
                .map((tx) => ({
                    ...tx,
                    group: { _id: String(group?._id || gid), name: group?.name || "Unnamed Group" },
                }));

            allTx.push(...simplified);
        }

        setSimplifiedTransactions(allTx);
    }, [expenses]);

    // ====== FRIEND BALANCES (non-group + loans) — keep your code as-is =====
    const friendBalances = useMemo(() => {
        const map = new Map();

        // only non-group expenses
        for (const exp of expenses.filter((e) => e?.groupId == null)) {
            const code = exp?.currency || "INR";
            for (const split of exp?.splits || []) {
                const fId = String(split?.friendId?._id || "");
                if (!fId) continue;
                const owe = Number(split?.oweAmount) || 0;
                const pay = Number(split?.payAmount) || 0;
                // Your original delta logic (kept)
                const delta = (split.owing ? owe : 0) - (split.paying ? pay : 0);
                const byCode = map.get(fId) || {};
                byCode[code] = (byCode[code] || 0) + delta;
                map.set(fId, byCode);
            }
        }

        // loans
        for (const loan of loans || []) {
            if (loan?.status === "closed") continue;
            const code = loan?.currency || "INR";
            const principal = Number(loan?.principal) || 0;
            const paid = (loan?.repayments || []).reduce((n, r) => n + (r.amount || 0), 0);
            const remaining = Math.max(principal - paid, 0);

            const borrowerId = String(loan?.borrowerId?._id || "");
            const lenderId = String(loan?.lenderId?._id || "");

            if (borrowerId) {
                const x = map.get(borrowerId) || {};
                x[code] = (x[code] || 0) + remaining; // borrower owes you (+)
                map.set(borrowerId, x);
            }
            if (lenderId) {
                const x = map.get(lenderId) || {};
                x[code] = (x[code] || 0) - remaining; // you owe lender (-)
                map.set(lenderId, x);
            }
        }

        const out = {};
        for (const [friendId, byCode] of map.entries()) {
            const list = Object.entries(byCode)
                .map(([code, amt]) => {
                    const rounded = roundCurrency(amt, code);
                    const minUnit = 1 / 10 ** currencyDigits(code);
                    return Math.abs(rounded) >= minUnit ? { code, amount: rounded } : null;
                })
                .filter(Boolean)
                .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
            out[friendId] = list;
        }
        return out;
    }, [expenses, loans]);

    // Group-derived friend balances (numbers). Positive => you're owed; Negative => you owe.
    const groupFriendBalancesRaw = useMemo(() => {
        if (!userId) return {};
        const map = {}; // friendId -> { [code]: amount }

        for (const tx of simplifiedTransactions || []) {
            const code = tx?.currency || "INR";
            const amt = Number(tx?.amount) || 0;
            const from = String(tx?.from || "");
            const to = String(tx?.to || "");

            if (!from || !to || !amt) continue;

            if (to === String(userId)) {
                // friend -> you
                const m = map[from] || {};
                m[code] = (m[code] || 0) + amt;
                map[from] = m;
            } else if (from === String(userId)) {
                // you -> friend
                const m = map[to] || {};
                m[code] = (m[code] || 0) - amt;
                map[to] = m;
            }
        }
        return map;
    }, [simplifiedTransactions, userId]);

    // Merge friendBalances (list form) with groupFriendBalancesRaw (number map) into the same "list" shape your UI expects.
    const mergedBalances = useMemo(() => {
        // Seed with friendBalances (convert list -> number map)
        const base = {};
        for (const friendId of Object.keys(friendBalances || {})) {
            const m = {};
            for (const item of friendBalances[friendId] || []) {
                const code = item.code;
                const amt = Number(item.amount) || 0;
                m[code] = (m[code] || 0) + amt;
            }
            base[friendId] = m;
        }

        // Add group balances
        for (const [friendId, byCode] of Object.entries(groupFriendBalancesRaw || {})) {
            const m = base[friendId] || {};
            for (const [code, amt] of Object.entries(byCode || {})) {
                m[code] = (m[code] || 0) + (Number(amt) || 0);
            }
            base[friendId] = m;
        }

        // Convert back to UI list shape, with rounding & sorting identical to your friendBalances logic
        const out = {};
        for (const [friendId, byCode] of Object.entries(base)) {
            const list = Object.entries(byCode)
                .map(([code, amt]) => {
                    const rounded = roundCurrency(amt, code);
                    const minUnit = 1 / 10 ** currencyDigits(code);
                    return Math.abs(rounded) >= minUnit ? { code, amount: rounded } : null;
                })
                .filter(Boolean)
                .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
            out[friendId] = list;
        }
        return out;
    }, [friendBalances, groupFriendBalancesRaw]);

    // filter helpers
    const friendCategory = (friendId) => {
        const list = mergedBalances[friendId] || [];

        const hasPos = list.some((b) => b.amount > 0);
        const hasNeg = list.some((b) => b.amount < 0);
        if (!hasPos && !hasNeg) return "settled";
        if (hasPos && !hasNeg) return "owes_me";
        if (!hasPos && hasNeg) return "i_owe";
        // both pos & neg across currencies -> show as "mixed", include under "all"
        return "mixed";
    };

    const filteredFriends = useMemo(() => {
        const q = query.trim().toLowerCase();
        return friends
            .filter((f) => {
                // text match
                const matchText =
                    !q ||
                    f.name?.toLowerCase().includes(q) ||
                    f.email?.toLowerCase().includes(q);

                if (!matchText) return false;

                if (activeFilter === "all") return true;

                const cat = friendCategory(String(f._id));
                if (activeFilter === "settled") return cat === "settled";
                if (activeFilter === "owes_me") return cat === "owes_me";
                if (activeFilter === "i_owe") return cat === "i_owe";
                return true;
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [friends, friendBalances, activeFilter, query]);

    // ===== skeletons =====
    const SkeletonRow = () => (
        <div className="flex items-center gap-3 py-3">
            <div className="h-10 w-10 rounded-full bg-[#1f1f1f] border border-white/10 animate-pulse" />
            <div className="flex-1">
                <div className="h-3 w-1/3 bg-white/10 rounded mb-2 animate-pulse" />
                <div className="h-3 w-1/2 bg-white/5 rounded animate-pulse" />
            </div>
            <div className="h-6 w-24 bg-white/5 rounded border border-white/10 animate-pulse" />
        </div>
    );

    // ===== UI bits =====
    const Count = friends?.length || 0;

    return (
        <MainLayout>
            <SEO
                title="Friends | Expensease"
                description="Manage friends, track shared expenses, and simplify settlements with Expensease. Easily split bills and settle balances."
                canonical="https://www.expensease.in/friends"
                schema={{
                    "@context": "https://schema.org",
                    "@type": "WebPage",
                    name: "Friends | Expensease",
                    description:
                        "Manage friends, track shared expenses, and simplify settlements with Expensease. Easily split bills and settle balances.",
                    url: "https://www.expensease.in/friends",
                }}
            />

            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                {/* Sticky header */}
                <div className="bg-[#121212] sticky -top-[5px] z-20 pb-2 border-b border-[#EBF1D5]">
                    <div className="flex items-center justify-between">
                        <h1 className="text-3xl font-bold capitalize">
                            Friends
                        </h1>

                        {/* Desktop add button (we also have a FAB on mobile) */}
                        <button
                            aria-label="Add friend"
                            className={`flex items-center justify-center bg-teal-500 text-black w-8 h-8 rounded-full shadow-md`}
                            onClick={() => {
                                logEvent("open_add_friends_modal", { screen: "friends" });
                                setShowModal(true);
                            }}
                        >
                            <Plus strokeWidth={3} size={20} />
                        </button>
                    </div>

                    {/* Subheader: search + filter chips */}
                    <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
                        <div className="relative w-full sm:max-w-xs">
                            <Search
                                size={16}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888]"
                            />
                            <input
                                className="w-full h-11 px-3 pl-9 pr-3 rounded-xl bg-[#1f1f1f] border border-[#55554f] text-[15px] placeholder-[#81827C] focus:outline-none "
                                placeholder="Search friends"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                autoCapitalize="none"
                                autoCorrect="off"

                            />
                        </div>

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
                                    <p>{label}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* refresh top bar */}
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

                {/* Scrollable content */}
                <div
                    ref={scrollRef}
                    className="flex flex-col flex-1 w-full overflow-y-auto no-scrollbar scroll-touch"
                >
                    {/* Requests */}
                    {receivedRequests.length > 0 && (
                        <section className="mt-1 border border-[#212121] rounded-xl">
                            <div className="bg-[#212121] px-4 py-3 border-b border-[#212121] rounded-t-xl">
                                <h3 className="text-sm tracking-wide uppercase text-teal-500">
                                    Friend Requests
                                </h3>
                            </div>

                            <ul className="px-4 pb-3 pt-1" role="list">
                                {receivedRequests.map((req) => (
                                    <li
                                        key={req._id}
                                        className="flex items-center justify-between py-2"
                                        role="listitem"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="h-9 w-9 rounded-full bg-[#1f1f1f] border border-white/10 flex items-center justify-center text-xs uppercase">
                                                {initials(req?.sender?.name)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium capitalize truncate">
                                                    {req?.sender?.name}
                                                </p>
                                                <p className="text-xs text-[#888] truncate lowercase">
                                                    {req?.sender?.email}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleAccept(req._id)}
                                                className={`h-9 px-3 rounded-md border border-teal-500 text-teal-400 text-sm ${touchMin}`}
                                                aria-label={`Accept friend request from ${req?.sender?.name}`}
                                            >
                                                Accept
                                            </button>
                                            <button
                                                onClick={() => handleReject(req._id)}
                                                className={`h-9 px-3 rounded-md border border-[#EA4335] text-[#EA4335] text-sm ${touchMin}`}
                                                aria-label={`Decline friend request from ${req?.sender?.name}`}
                                            >
                                                Decline
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {/* Empty state */}
                    {!loading &&
                        friends.length === 0 &&
                        receivedRequests.length === 0 ? (
                        <div className="flex flex-col flex-1 justify-center">
                            <div className="bg-[#1f1f1f] text-center text-[#EBF1D5] border border-[#333] p-4 rounded-lg mt-4">
                                <p className="text-lg font-semibold mb-2">No friends yet!</p>
                                <p className="text-sm text-[#888] mb-4">
                                    To split expenses, add friends.
                                </p>
                                <div className="flex justify-center">
                                    <button
                                        onClick={() => {
                                            logEvent("open_add_friends_modal", { screen: "friends" });
                                            setShowModal(true);
                                        }}
                                        className={`bg-teal-500 text-black px-4 py-2 rounded hover:bg-teal-400 transition ${touchMin}`}
                                    >
                                        Add Friend
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {/* Loading skeletons */}
                    {loading ? (
                        <div className="flex flex-col gap-2 py-4">
                            {[...Array(6)].map((_, i) => (
                                <SkeletonRow key={i} />
                            ))}
                        </div>
                    ) : null}

                    {/* Friends list */}
                    {!loading && friends.length > 0 && (
                        <section className="" role="list" aria-label="Friends list">
                            {/* subtle divider if requests above */}
                            {receivedRequests.length > 0 && (
                                <div className="py-2">
                                    <h2 className="text-teal-500 uppercase text-sm">Friends</h2>
                                    <hr className="border-[#212121] mt-1" />
                                </div>
                            )}

                            <div className="divide-y divide-[#212121]">
                                {filteredFriends.map((friend) => {
                                    const list = mergedBalances[String(friend._id)] || [];
                                    const dominant = list[0]; // largest absolute
                                    const otherCount = Math.max(list.length - 1, 0);

                                    return (
                                        <button
                                            key={friend._id}
                                            onClick={() => {
                                                logEvent("navigate", {
                                                    fromScreen: "friends",
                                                    toScreen: "friend_detail",
                                                    source: "friend_list",
                                                });
                                                navigate(`/friends/${friend._id}`);
                                            }}
                                            className={`w-full flex items-center gap-3 py-3 active:scale-[.99] transition ${touchMin}`}
                                            role="listitem"
                                            aria-label={`Open ${friend.name} details`}
                                        >
                                            {/* avatar */}
                                            <div className="h-10 w-10 rounded-full bg-[#1f1f1f] border border-white/10 flex items-center justify-center text-sm uppercase">
                                                {initials(friend.name)}
                                            </div>

                                            {/* text */}
                                            <div className="min-w-0 flex-1 text-left">
                                                <p className="text-[15px] font-semibold capitalize truncate">
                                                    {friend.name}
                                                </p>
                                                <p className="text-xs text-[#888] truncate lowercase">
                                                    {friend.email}
                                                </p>
                                            </div>

                                            {/* right chips */}
                                            <div className="flex items-center gap-2">
                                                {dominant ? (
                                                    <span
                                                        className={`px-2 py-1 rounded-md border text-xs bg-white/5 border-white/10 ${dominant.amount < 0
                                                            ? "text-red-400"
                                                            : "text-teal-400"
                                                            }`}
                                                    >
                                                        {dominant.amount < 0 ? "you owe " : "you’re owed "}
                                                        ·{" "}
                                                        {getSymbol(dominant.code)}
                                                        {Math.abs(dominant.amount).toFixed(
                                                            currencyDigits(dominant.code)
                                                        )}
                                                    </span>
                                                ) : (
                                                    list.length > 0 && <span className="px-2 py-1 rounded-md border text-xs text-[#bbb] bg-white/5 border-white/10">
                                                        Settled
                                                    </span>
                                                )}
                                                {otherCount > 0 && (
                                                    <span className="px-2 py-1 rounded-md border border-white/10 text-xs text-[#bbb] bg-white/5">
                                                        +{otherCount}
                                                    </span>
                                                )}
                                                {/* <ChevronRight className="text-[#888]" size={16} /> */}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <p className="text-center text-sm text-teal-500 mt-3">
                                {filteredFriends.length} Friend
                                {filteredFriends.length === 1 ? "" : "s"}
                            </p>
                        </section>
                    )}
                </div>
            </div>

            {/* Mobile FAB */}
            {/* <button
                aria-label="Add friend"
                className="md:hidden fixed bottom-20 right-5 bg-teal-500 text-black w-12 h-12 rounded-full shadow-lg flex items-center justify-center"
                onClick={() => {
                    logEvent("open_add_friends_modal", { screen: "friends" });
                    setShowModal(true);
                }}
            >
                <Plus strokeWidth={3} size={24} />
            </button> */}

            <Modal
                setShowModal={setShowModal}
                showModal={showModal}
                fetchFriends={fetchFriends}
                userToken={userToken}
            />
        </MainLayout>
    );
};

export default Friends;
