// src/pages/Transactions.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import { useAuth } from "../context/AuthContext";
import { listPaymentMethods, listPaymentTxns } from "../services/PaymentMethodService";
import { ChevronLeft } from "lucide-react";
import { getSymbol } from "../utils/currencies";
import PullToRefresh from "pulltorefreshjs";
import { logEvent } from "../utils/analytics";
import SEO from "../components/SEO";



const KIND_OPTIONS = [
    "all", "debit", "credit", "hold", "release", "capture", "transfer_in", "transfer_out", "adjustment", "topup", "withdrawal"
];

const KindBadge = ({ kind }) => {
    const base = "px-2 py-[2px] rounded text-[10px] border";
    const map = {
        debit: "border-red-500 text-red-400",
        credit: "border-teal-500 text-teal-400",
        hold: "border-yellow-600 text-yellow-400",
        release: "border-emerald-600 text-emerald-400",
        capture: "border-blue-600 text-blue-400",
        transfer_in: "border-teal-600 text-teal-400",
        transfer_out: "border-purple-600 text-purple-400",
        adjustment: "border-zinc-600 text-zinc-300",
        topup: "border-lime-600 text-lime-400",
        withdrawal: "border-orange-600 text-orange-400",
    };
    return <span className={`${base} ${map[kind] || "border-zinc-600 text-zinc-300"}`}>{kind}</span>;
};

export default function Transactions() {
    const navigate = useNavigate();
    const { userToken, defaultCurrency, paymentMethods, fetchPaymentMethods } = useAuth() || {};
    const [loading, setLoading] = useState(true);

    const [methodId, setMethodId] = useState("all");
    const [currency, setCurrency] = useState("all");
    const [kind, setKind] = useState("all");

    const [txns, setTxns] = useState([]);
    const [nextCursor, setNextCursor] = useState(null);
    const [fetchingMore, setFetchingMore] = useState(false);
    const scrollRef = useRef(null);
    const [refreshing, setRefreshing] = useState(false);

    const doRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([await fetchTxns(null, false), await fetchPaymentMethods()])
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

    const currencyChoices = useMemo(() => {
        const set = new Set(["all"]);
        paymentMethods.forEach(pm => {
            if (pm.defaultCurrency) set.add(pm.defaultCurrency.toUpperCase());
            if (Array.isArray(pm.supportedCurrencies)) pm.supportedCurrencies.forEach(c => set.add(String(c).toUpperCase()));
            if (pm.balances) {
                // Map or plain object
                const entries = pm.balances instanceof Map ? Array.from(pm.balances.keys()) : Object.keys(pm.balances);
                entries.forEach(c => set.add(String(c).toUpperCase()));
            }
        });
        return Array.from(set);
    }, [paymentMethods]);

    const symbol = getSymbol((currency !== "all" && currency) || defaultCurrency || "INR");

    const fetchTxns = async (cursor = null, append = false) => {
        setLoading(!append);
        if (append) setFetchingMore(true);
        try {
            const params = {
                limit: 50,
            };
            if (methodId !== "all") params.paymentMethodId = methodId;
            if (currency !== "all") params.currency = currency;
            if (kind !== "all") params.kind = kind;
            if (cursor) params.before = cursor;

            const { items, nextCursor: nc } = await listPaymentTxns(params, userToken);
            setTxns(prev => append ? prev.concat(items) : items);
            setNextCursor(nc);
        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to load transactions");
        } finally {
            setLoading(false);
            setFetchingMore(false);
        }
    };

    // initial + when filters change
    useEffect(() => {
        if (!userToken) return;
        fetchTxns(null, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userToken, methodId, currency, kind]);

    return (
        <MainLayout>
            <SEO
                title="Transactions | Expensease"
                description="View your Expensease transactions including debits, credits, transfers, and settlements across all your payment accounts."
                canonical="https://www.expensease.in/transactions"
                schema={{
                    "@context": "https://schema.org",
                    "@type": "CollectionPage",
                    "name": "Transactions | Expensease",
                    "description": "View your Expensease transactions including debits, credits, transfers, and settlements across all your payment accounts.",
                    "url": "https://www.expensease.in/transactions"
                }}
            />

            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#2a2a2a] flex flex-row justify-between items-center">
                    <div className="flex items-center gap-2">
                        <button onClick={() => {
                            logEvent('navigate', {
                                fromScreen: 'transactions', toScreen: 'account', source: 'back'
                            })
                            navigate(`/account`)
                        }}>
                            <ChevronLeft />
                        </button>
                        <h1 className="text-3xl font-bold">Transactions</h1>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-2 py-3">
                    <select
                        value={methodId}
                        onChange={(e) => setMethodId(e.target.value)}
                        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm"
                    >
                        <option value="all">All Methods</option>
                        {paymentMethods.map(pm => (
                            <option key={pm._id} value={pm._id}>
                                {pm.label} {pm.isDefaultSend ? "• Send" : ""} {pm.isDefaultReceive ? "• Receive" : ""}
                            </option>
                        ))}
                    </select>

                    <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm"
                    >
                        {currencyChoices.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <select
                        value={kind}
                        onChange={(e) => setKind(e.target.value)}
                        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm"
                    >
                        {KIND_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                </div>

                {/* List */}
                <div className="flex-1">
                    {loading ? (
                        <div className="text-sm text-[#B8C4A0]">Loading…</div>
                    ) : txns.length === 0 ? (
                        <div className="text-sm text-[#B8C4A0]">No transactions found.</div>
                    ) : (
                        <ul className="space-y-2">
                            {txns.map(t => {
                                const major = t.amount
                                const positive = major > 0;
                                const amtStr = new Intl.NumberFormat(undefined, { style: 'currency', currency: t.currency }).format(Math.abs(major));
                                const when = new Date(t.createdAt);
                                return (
                                    <li key={t._id} className="w-full rounded-lg border border-[#2a2a2a] bg-[#151515] p-3 flex items-center justify-between">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <KindBadge kind={t.kind} />
                                                <span className="text-xs text-[#9aa08e]">{t.currency}</span>
                                            </div>
                                            <div className="text-sm text-[#d6ddc5] mt-1 truncate">
                                                {t.related?.type ? `${t.related.type}` : "—"}{t.related?.id ? ` • ${t.related.id}` : ""}{t.related?.note ? ` • ${t.related.note}` : ""}
                                            </div>
                                            <div className="text-[11px] text-[#81827C] mt-0.5">
                                                {when.toLocaleDateString()} {when.toLocaleTimeString()}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0 ml-3">
                                            <div className={`font-semibold ${positive ? "text-teal-400" : "text-red-400"}`}>
                                                {positive ? "+" : "-"}{amtStr}
                                            </div>
                                            {typeof t.balanceAfter === 'number' && (
                                                <div className="text-[11px] text-[#9aa08e]">
                                                    bal: {new Intl.NumberFormat(undefined, { style: 'currency', currency: t.currency }).format(t.balanceAfter)}
                                                </div>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* Pagination */}
                <div className="py-3">
                    {nextCursor ? (
                        <button
                            disabled={fetchingMore}
                            onClick={() => fetchTxns(nextCursor, true)}
                            className="w-full px-4 py-2 rounded border border-[#2a2a2a] hover:border-teal-600"
                        >
                            {fetchingMore ? "Loading…" : "Load more"}
                        </button>
                    ) : (
                        !loading && <div className="text-center text-xs text-[#81827C]">End of results</div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
