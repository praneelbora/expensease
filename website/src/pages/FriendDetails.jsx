import { useEffect, useMemo, useRef, useState } from "react";
import React from 'react';
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import { getFriendDetails } from "../services/FriendService";
import { settleExpense, getFriendExpense } from "../services/ExpenseService";
import SettleModal from "../components/SettleModal";
import { ChevronLeft, Loader, Plus, Settings } from "lucide-react";
import LoanModal from "../components/LoanModal";
import { deleteLoan as deleteLoanApi } from "../services/LoanService";
import { useAuth } from "../context/AuthContext";
import ExpenseModal from "../components/ExpenseModal";
import PaymentModal from "../components/PaymentModal";
import ExpenseItem from "../components/ExpenseItem";
import { getAllCurrencyCodes, getSymbol, toCurrencyOptions } from "../utils/currencies";
import { fetchFriendsPaymentMethods } from "../services/PaymentMethodService";
import { getLoans, closeLoan as closeLoanApi } from "../services/LoanService";
import PullToRefresh from "pulltorefreshjs";
import { logEvent } from "../utils/analytics";
import UnifiedPaymentModal from "../components/UnifiedPaymentModal";
import SEO from "../components/SEO";

const FriendDetails = () => {
    const { user, userToken, defaultCurrency, preferredCurrencies, categories, paymentMethods, fetchPaymentMethods } = useAuth() || {};
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const tab = searchParams.get("tab"); // "loan" or null

    // UI state
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [allCodes, setAllCodes] = useState([]);
    useEffect(() => { setAllCodes(getAllCurrencyCodes()); }, []);
    const currencyOptions = toCurrencyOptions(allCodes);
    const [paymentModal, setPaymentModal] = useState({ open: false, context: '', friendId: null });
    const openPaymentModal = ({ context, friendId = null }) => setPaymentModal({ open: true, context, friendId });
    const closePaymentModal = () => setPaymentModal({ open: false, context: '', friendId: null });

    const navigate = useNavigate();
    const [userId, setUserId] = useState();
    const [loading, setLoading] = useState(true);
    const [friend, setFriend] = useState(null);
    const [expenses, setExpenses] = useState([]);
    const [simplifiedTransactions, setSimplifiedTransactions] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [showSettleModal, setShowSettleModal] = useState(false);
    const [settleType, setSettleType] = useState('partial');
    const [loanLoading, setLoanLoading] = useState(true);
    const [activeSection, setActiveSection] = useState(tab === "loan" ? "loans" : "expenses");
    const [prefillSettle, setPrefillSettle] = useState(null);
    const [loans, setLoans] = useState([]);
    const [netLoanBalanceMap, setNetLoanBalanceMap] = useState({});
    const [personalExpenseBalanceMap, setPersonalExpenseBalanceMap] = useState({});
    const [showLoanView, setShowLoanView] = useState(false);
    const [activeLoan, setActiveLoan] = useState(null);
    const [party, setParty] = useState();
    const [counterParty, setCounterParty] = useState();
    const [paymentMethodsUpdated, setPaymentMethodsUpdated] = useState(false);
    const [showSettled, setShowSettled] = useState(false);
    const [hasSettled, setHasSettled] = useState(false);

    const [paymentMethod, setPaymentMethod] = useState();

    const pmLabel = (m) => `${m?.label || m?.type || "Method"}`;

    // Unified payment options
    const unifiedOptions = useMemo(() => {
        if (!paymentModal.open) return [];
        if (paymentModal.context === 'lender') {
            return (party?.paymentMethods || []).map(m => ({ _id: m.paymentMethodId, ...m }));
        }
        return (counterParty?.paymentMethods || []).map(m => ({ _id: m.paymentMethodId, ...m }));
    }, [paymentModal, party, counterParty]);

    const unifiedValue = useMemo(() => {
        if (paymentModal.context === 'lender') return paymentMethod || null;
        return counterParty?.selectedPaymentMethodId ?? null;
    }, [paymentModal, paymentMethod, counterParty]);

    const handleSelectUnified = (id) => {
        if (paymentModal.context === 'lender') {
            setParty(prev => ({ ...prev, selectedPaymentMethodId: id }));
        } else {
            setCounterParty(prev => ({ ...prev, selectedPaymentMethodId: id }));
        }
    };

    const paymentMethodRedirect = () => {
        setShowLoanView(false);
        setShowPaymentModal(false);
        navigate('/account?section=paymentMethod');
    };

    const updateFriendsPaymentMethods = async (list) => {
        try {
            const map = await fetchFriendsPaymentMethods(list, userToken);
            setCounterParty((prev) => {
                if (!prev) return prev;
                const raw = map?.[prev._id] || [];
                const methods = raw;
                const selectedPaymentMethodId = methods.length === 1 ? methods[0].paymentMethodId : prev.selectedPaymentMethodId ?? null;
                return { ...prev, paymentMethods: methods, selectedPaymentMethodId };
            });
            setParty((prev) => {
                if (!prev) return prev;
                const raw = map?.[prev._id] || [];
                const methods = raw;
                const selectedPaymentMethodId = methods.length === 1 ? methods[0].paymentMethodId : prev.selectedPaymentMethodId ?? null;
                return { ...prev, paymentMethods: methods, selectedPaymentMethodId };
            });
            setPaymentMethodsUpdated(true);
        } catch (e) {
            console.error("Failed to update friends' payment methods", e);
        }
    };

    useEffect(() => {
        if (counterParty && !paymentMethodsUpdated && party) {
            updateFriendsPaymentMethods([party._id, counterParty._id]);
        }
    }, [counterParty, party, paymentMethodsUpdated]);

    // Pull-to-refresh
    const scrollRef = useRef(null);
    const [refreshing, setRefreshing] = useState(false);

    const doRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([fetchData()]);
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
            shouldPullToRefresh: () => scrollRef.current && scrollRef.current.scrollTop === 0,
        });

        return () => {
            PullToRefresh.destroyAll();
        };
        // intentionally no deps beyond initial mount where scrollRef.current is available
    }, []);

    // Currency helpers
    const currencyDigits = (code, locale = "en-IN") => {
        try {
            const fmt = new Intl.NumberFormat(locale, { style: "currency", currency: code });
            return fmt.resolvedOptions().maximumFractionDigits ?? 2;
        } catch {
            return 2;
        }
    };
    const roundCurrency = (amount, code) => {
        const d = currencyDigits(code);
        const f = 10 ** d;
        return Math.round((Number(amount) + Number.EPSILON) * f) / f;
    };

    const generateSimplifiedTransactionsByCurrency = (netByCode, userId, friendId) => {
        const tx = [];
        for (const [code, amt] of Object.entries(netByCode || {})) {
            if (!amt) continue;
            const from = amt < 0 ? userId : friendId;
            const to = amt < 0 ? friendId : userId;
            tx.push({ from, to, amount: Math.abs(amt), currency: code });
        }
        return tx;
    };

    // Loans helpers
    const getOutstandingByCurrency = (loan) => {
        const code = loan?.currency || loan?.principalCurrency || "INR";
        const principal = Number(loan?.principal) || 0;
        let paid = 0;
        for (const r of (loan?.repayments || [])) {
            const rCode = r?.currency || code;
            if (rCode !== code) continue;
            paid += Number(r?.amount) || 0;
        }
        const outstanding = Math.max(0, roundCurrency(principal - paid, code));
        return { code, amount: outstanding };
    };

    const computeNetLoanBalanceByCurrency = (friendId, userIdLocal, friendLoans) => {
        const totals = {};
        for (const loan of (friendLoans || [])) {
            const { code, amount } = getOutstandingByCurrency(loan);
            if (amount === 0) continue;

            const youAreLender = loan.lenderId?._id?.toString?.() === userIdLocal;
            const friendBorrower = loan.borrowerId?._id?.toString?.() === friendId;
            const youAreBorrower = loan.borrowerId?._id?.toString?.() === userIdLocal;
            const friendLender = loan.lenderId?._id?.toString?.() === friendId;

            if (youAreLender && friendBorrower) {
                totals[code] = roundCurrency((totals[code] || 0) + amount, code);
            }
            if (youAreBorrower && friendLender) {
                totals[code] = roundCurrency((totals[code] || 0) - amount, code);
            }
        }
        for (const code of Object.keys(totals)) {
            const minUnit = 1 / (10 ** currencyDigits(code));
            if (Math.abs(totals[code]) < minUnit) delete totals[code];
        }
        return totals;
    };

    // Fetch loans
    const fetchLoansForFriend = async (meId, frId) => {
        setLoanLoading(true);
        try {
            const res = await getLoans(userToken, { role: "all" });
            const all = res?.loans || res || [];
            const friendLoans = all.filter(l =>
                (l.lenderId?._id === meId && l.borrowerId?._id === frId) ||
                (l.lenderId?._id === frId && l.borrowerId?._id === meId)
            );
            setLoans(friendLoans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
            const nlMap = computeNetLoanBalanceByCurrency(frId, meId, friendLoans);
            setNetLoanBalanceMap(nlMap);
        } catch (e) {
            console.error("Failed to fetch loans", e);
        } finally {
            setLoanLoading(false);
        }
    };

    useEffect(() => {
        if (user) setParty(user);
    }, [user]);

    // Fetch core data
    const fetchData = async () => {
        try {
            const data = await getFriendDetails(id, userToken);
            setFriend(data.friend);
            setCounterParty(data.friend);
            setUserId(data.id);

            const expenseData = await getFriendExpense(id, userToken);
            setExpenses(expenseData.expenses || []);
            setSimplifiedTransactions(expenseData.simplifiedTransactions || []);
            const personal = calculateFriendBalanceByCurrency(expenseData.expenses || [], data.id, data.friend._id);
            setPersonalExpenseBalanceMap(personal);

            await fetchLoansForFriend(data.id, data.friend._id);
        } catch (e) {
            console.error("Failed to fetch friend data", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Settlement helpers
    const getSettleDirectionText = (splits) => {
        const payer = splits.find(s => s.paying && s.payAmount > 0);
        const receiver = splits.find(s => s.owing && s.oweAmount > 0);
        if (!payer || !receiver) return "Invalid settlement";

        const payerName = payer.friendId._id === userId ? "You" : payer.friendId.name;
        const receiverName = receiver.friendId._id === userId ? "you" : receiver.friendId.name;
        return `${payerName} paid ${receiverName}`;
    };

    const handlePaymentClose = (amt) => {
        setShowPaymentModal(false);
        const finalAmt = Number(amt || 0);
        if (finalAmt > 0 && friend?._id && userId) {
            setPrefillSettle({
                payerId: userId,
                receiverId: friend._id,
                amount: finalAmt,
                description: "Settlement",
            });
            setShowSettleModal(true);
            logEvent('open_modal_settle', { screen: 'friend_detail' });
        }
    };

    const handleSettle = async ({ payerId, receiverId, amount, description, currency, meta }) => {
        try {
            const responseJson = await settleExpense({ payerId, receiverId, amount, description, currency, meta }, userToken);
            if (responseJson?.allSettled) {
                // optionally handle UI change
            }
            await fetchData();
        } catch (e) {
            console.error("Failed to settle", e);
        }
    };

    const handleHasSettled = () => {
        if (hasSettled) return true;
        setHasSettled(true);
    };

    const calculateFriendBalanceByCurrency = (expensesList, userIdLocal, friendIdLocal) => {
        const totals = {};
        const filtered = (expensesList || []).filter(exp => {
            let youPay = false, frPay = false, youOwe = false, frOwe = false;
            (exp.splits || []).forEach(s => {
                const id = s.friendId?._id?.toString();
                if (id === userIdLocal) { if (s.paying) youPay = true; if (s.owing) youOwe = true; }
                if (id === friendIdLocal) { if (s.paying) frPay = true; if (s.owing) frOwe = true; }
            });
            const oneIsPaying = youPay || frPay;
            const otherIsOwing = (youPay && frOwe) || (frPay && youOwe);
            return oneIsPaying && otherIsOwing;
        });

        for (const exp of filtered) {
            const code = exp?.currency || "INR";
            for (const s of exp.splits || []) {
                const id = s?.friendId?._id?.toString();
                if (id !== friendIdLocal) continue;
                const add = (s.owing ? Number(s.oweAmount) || 0 : 0);
                const sub = (s.paying ? Number(s.payAmount) || 0 : 0);
                totals[code] = roundCurrency((totals[code] || 0) + add - sub, code);
            }
        }

        for (const code of Object.keys(totals)) {
            const minUnit = 1 / (10 ** currencyDigits(code));
            if (Math.abs(totals[code]) < minUnit) delete totals[code];
        }
        return totals;
    };

    const getPayerInfo = (splits) => {
        const userSplit = splits.find(s => s.friendId && s.friendId._id === userId);
        if (!userSplit || (!userSplit.payAmount && !userSplit.oweAmount)) return "You were not involved";
        const payers = splits.filter(s => s.paying && s.payAmount > 0);
        if (payers.length === 1) {
            return `${payers[0].friendId._id == userId ? 'You' : payers[0].friendId.name} paid`;
        } else if (payers.length > 1) {
            return `${payers.length} people paid`;
        } else {
            return `No one paid`;
        }
    };

    const getOweInfo = (splits) => {
        const userSplit = splits.find(s => s.friendId && s.friendId._id === friend?._id);
        if (!userSplit) return null;
        const { oweAmount = 0, payAmount = 0 } = userSplit;
        const net = payAmount - oweAmount;
        if (net > 0) return { text: 'lent', amount: ` ${net.toFixed(2)}` };
        if (net < 0) return { text: 'borrowed', amount: ` ${Math.abs(net).toFixed(2)}` };
        return null;
    };

    // groupBalanceMap (from simplifiedTransactions)
    const groupBalanceMap = useMemo(() => {
        const totals = {};
        if (!userId || !counterParty?._id) return totals;

        for (const tx of simplifiedTransactions || []) {
            const code = tx?.currency || "INR";
            const amt = Number(tx?.amount) || 0;
            if (!amt) continue;

            const involvesFriend =
                (tx.from === String(userId) && tx.to === String(counterParty._id)) ||
                (tx.to === String(userId) && tx.from === String(counterParty._id));
            if (!involvesFriend) continue;

            if (tx.to === String(userId)) totals[code] = (totals[code] || 0) + amt;
            if (tx.from === String(userId)) totals[code] = (totals[code] || 0) - amt;
        }

        for (const code of Object.keys(totals)) {
            const rounded = roundCurrency(totals[code], code);
            const minUnit = 1 / (10 ** currencyDigits(code));
            totals[code] = Math.abs(rounded) >= minUnit ? rounded : 0;
            if (totals[code] === 0) delete totals[code];
        }
        return totals;
    }, [simplifiedTransactions, userId, counterParty?._id]);

    const mergeCurrencyMaps = (a = {}, b = {}) => {
        const out = { ...a };
        for (const [code, amt] of Object.entries(b)) {
            out[code] = roundCurrency((out[code] || 0) + (amt || 0), code);
            const minUnit = 1 / (10 ** currencyDigits(code));
            if (Math.abs(out[code]) < minUnit) delete out[code];
        }
        return out;
    };

    const netExpenseBalanceMap = useMemo(() => mergeCurrencyMaps(personalExpenseBalanceMap, groupBalanceMap), [personalExpenseBalanceMap, groupBalanceMap]);

    // Helpers for group breakdowns
    const collectGroupPartiesByCurrency = (simplifiedTransactionsList, userIdLocal, friendIdLocal, roundCurrencyFn, currencyDigitsFn) => {
        const uid = String(userIdLocal || "");
        const fid = String(friendIdLocal || "");
        const byCode = {};

        for (const tx of simplifiedTransactionsList || []) {
            const from = String(tx?.from || "");
            const to = String(tx?.to || "");
            if (!from || !to) continue;
            const isPair = (from === uid && to === fid) || (from === fid && to === uid);
            if (!isPair) continue;

            const code = tx?.currency || "INR";
            const gid = String(tx?.groupId || tx?.group?._id || "");
            if (!gid) continue;

            const amt = Number(tx?.amount || 0);
            if (!amt) continue;

            const sign = (to === uid) ? +1 : -1;
            (byCode[code] ||= {});
            (byCode[code][gid] ||= { net: 0, name: tx?.name || tx?.group?.name || "Unnamed Group" });
            byCode[code][gid].net += sign * amt;
        }

        const out = {};
        for (const [code, groups] of Object.entries(byCode)) {
            const resPerCode = {};
            const minUnit = 1 / (10 ** currencyDigitsFn(code));
            for (const [gid, info] of Object.entries(groups)) {
                const rounded = roundCurrencyFn(info.net, code);
                if (Math.abs(rounded) < minUnit) continue;
                const from = rounded < 0 ? uid : fid;
                const to = rounded < 0 ? fid : uid;
                resPerCode[gid] = { from, to, amount: Math.abs(rounded), currency: code, groupId: gid, name: info.name };
            }
            if (Object.keys(resPerCode).length) out[code] = resPerCode;
        }
        return out;
    };

    const collectGroupIdsByCurrency = (simplifiedTransactionsList, userIdLocal, friendIdLocal) => {
        const uid = String(userIdLocal || "");
        const fid = String(friendIdLocal || "");
        const byCode = {};
        for (const tx of simplifiedTransactionsList || []) {
            const from = String(tx?.from || "");
            const to = String(tx?.to || "");
            const isPair = (from === uid && to === fid) || (from === fid && to === uid);
            if (!isPair) continue;
            const code = tx?.currency || "INR";
            const gid = tx?.group?._id;
            if (!gid) continue;
            (byCode[code] ||= new Set()).add(String(gid));
        }
        const out = {};
        for (const [code, set] of Object.entries(byCode)) out[code] = Array.from(set);
        return out;
    };

    // txFromCurrencyMap reused
    const txFromCurrencyMap = (byCode = {}, userIdLocal, friendIdLocal, roundCurrencyFn, currencyDigitsFn, type, idsByCode) => {
        const out = [];
        for (const [code, amtRaw] of Object.entries(byCode)) {
            const amt = roundCurrencyFn(amtRaw, code);
            const minUnit = 1 / (10 ** currencyDigitsFn(code));
            if (Math.abs(amt) < minUnit) continue;
            const from = amt < 0 ? userIdLocal : friendIdLocal;
            const to = amt < 0 ? friendIdLocal : userIdLocal;
            out.push({ from: String(from), to: String(to), amount: Math.abs(amt), currency: code, type, ids: idsByCode?.[code] || null });
        }
        return out;
    };

    const computeGroupAggregateMap = (simplifiedTransactionsList, userIdLocal, friendIdLocal) => {
        const totals = {};
        for (const tx of simplifiedTransactionsList || []) {
            const code = tx?.currency || "INR";
            const amt = Number(tx?.amount) || 0;
            const from = String(tx?.from || "");
            const to = String(tx?.to || "");
            const uid = String(userIdLocal);
            const fid = String(friendIdLocal);
            const pair = (from === uid && to === fid) || (from === fid && to === uid);
            if (!pair || !amt) continue;
            if (to === uid) totals[code] = (totals[code] || 0) + amt;
            if (from === uid) totals[code] = (totals[code] || 0) - amt;
        }
        return totals;
    };

    // Build settlement lists (top-level useMemo so render can access)
    const settlementLists = useMemo(() => {
        if (!userId || !friend?._id) return [];

        const signedForUser = (from, to, amount, uid) => (to === String(uid) ? +Number(amount || 0) : -Number(amount || 0));
        const minUnitFor = (code) => 1 / (10 ** currencyDigits(code));

        // Build NET rows with detailed breakdown
        const buildNetWithBreakdown = (netByCode, groupsByCur, userIdLocal, friendIdLocal) => {
            const out = [];
            for (const [code, netSignedRaw] of Object.entries(netByCode || {})) {
                const netSigned = roundCurrency(netSignedRaw, code);
                const minUnit = minUnitFor(code);
                if (Math.abs(netSigned) < minUnit) continue;

                const netFrom = netSigned < 0 ? userIdLocal : friendIdLocal;
                const netTo = netSigned < 0 ? friendIdLocal : userIdLocal;

                const perCodeGroups = groupsByCur?.[code] || {};
                let groupSignedSum = 0;
                for (const g of Object.values(perCodeGroups)) {
                    groupSignedSum += signedForUser(String(g.from), String(g.to), Number(g.amount || 0), String(userIdLocal));
                }

                const personalSigned = roundCurrency(netSigned - groupSignedSum, code);
                const hasPersonal = Math.abs(personalSigned) >= minUnit;
                const personal = hasPersonal ? {
                    from: personalSigned < 0 ? String(userIdLocal) : String(friendIdLocal),
                    to: personalSigned < 0 ? String(friendIdLocal) : String(userIdLocal),
                    amount: Math.abs(personalSigned),
                    currency: code
                } : null;

                out.push({
                    from: String(netFrom),
                    to: String(netTo),
                    amount: Math.abs(netSigned),
                    currency: code,
                    type: "net",
                    groups: perCodeGroups,
                    ids: Object.keys(perCodeGroups),
                    personal
                });
            }
            return out;
        };

        const groupsByCur = collectGroupPartiesByCurrency(simplifiedTransactions, userId, friend._id, roundCurrency, currencyDigits);
        const net = buildNetWithBreakdown(netExpenseBalanceMap, groupsByCur, userId, friend._id);
        const personal = txFromCurrencyMap(personalExpenseBalanceMap, userId, friend._id, roundCurrency, currencyDigits, "all_personal");
        const allGrp = txFromCurrencyMap(computeGroupAggregateMap(simplifiedTransactions, userId, friend._id), userId, friend._id, roundCurrency, currencyDigits, "all_groups", groupsByCur);
        const perGrp = (simplifiedTransactions || []).map(tx => {
            const from = String(tx?.from || "");
            const to = String(tx?.to || "");
            const isPair = (from === String(userId) && to === String(friend._id)) || (from === String(friend._id) && to === String(userId));
            if (!isPair) return null;
            return {
                from,
                to,
                amount: Number(tx?.amount) || 0,
                currency: tx?.currency || "INR",
                type: 'group',
                groupId: tx?.group?._id,
                name: tx?.group?.name || "Unnamed Group"
            };
        }).filter(Boolean);

        return [...net, ...personal, ...allGrp, ...perGrp];
    }, [userId, friend?._id, netExpenseBalanceMap, personalExpenseBalanceMap, simplifiedTransactions]);

    // UI actions
    const openLoanView = (loan) => {
        setActiveLoan(loan);
        setShowLoanView(true);
    };

    // Effects: fetch payment methods if needed
    // useEffect(() => {
    //     // Keep user's own payment methods up to date
    //     if (fetchPaymentMethods) fetchPaymentMethods();
    // }, [fetchPaymentMethods]);

    return (
        <MainLayout>
            <SEO
                title={`Friend - Expense Details | Expensease`}
                description={`Track your shared expenses, loans, and settlements with your friend on Expensease.`}
                canonical={`https://www.expensease.in/friends/:id`}
                schema={{
                    "@context": "https://schema.org",
                    "@type": "ProfilePage",
                    "name": "Friend - Expense Details | Expensease",
                    "description": `Track your shared expenses, loans, and settlements with your friend on Expensease.`,
                    "url": `https://www.expensease.in/friends/:id`
                }}
            />
            <div className="max-w-full h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                <div className="max-w-full bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <div className="max-w-full flex flex-1 flex-row gap-2">
                        <button onClick={() => {
                            logEvent('navigate', { fromScreen: 'friend_detail', toScreen: 'friends', source: 'back' });
                            navigate(`/friends`);
                        }}>
                            <ChevronLeft />
                        </button>
                        <h1 className={`${friend?.name ? 'text-[#EBF1D5]' : 'text-[#121212]'} text-3xl font-bold capitalize text-wrap break-words max-w-[80%]`}>
                            {friend?.name ? friend?.name : "Loading"}
                        </h1>
                        <div className="flex flex-1 justify-end flex-row items-center">
                            <button
                                className="flex flex-col items-center justify-center z-10 w-8 h-8 rounded-full shadow-md text-2xl"
                                onClick={() => {
                                    logEvent('navigate', { fromScreen: 'friend_detail', toScreen: 'friend_setting', source: 'setting' });
                                    navigate(`/friends/settings/${id}`);
                                }}>
                                <Settings strokeWidth={2} size={20} />
                            </button>
                        </div>
                    </div>
                </div>

                <div ref={scrollRef} className="flex flex-col flex-1 w-full overflow-y-auto pt-3 no-scrollbar scroll-touch gap-3">
                    <div className="w-full flex justify-center">
                        <div className="inline-flex border border-[#EBF1D5] rounded-full p-1 bg-[#1f1f1f]">
                            <button
                                onClick={() => {
                                    logEvent('tab_select', { screen: 'friend_detail', tab: 'expenses' });
                                    setActiveSection("expenses");
                                }}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeSection === "expenses" ? "bg-[#EBF1D5] text-[#121212]" : "text-[#EBF1D5] hover:bg-[#2a2a2a]"}`}>
                                Expenses
                            </button>
                            <button
                                onClick={() => {
                                    logEvent('tab_select', { screen: 'friend_detail', tab: 'loans' });
                                    setActiveSection("loans");
                                }}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeSection === "loans" ? "bg-[#EBF1D5] text-[#121212]" : "text-[#EBF1D5] hover:bg-[#2a2a2a]"}`}>
                                Loans
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col flex-1 w-full overflow-y-auto pt-1 no-scrollbar gap-3 pb-16">

                        {/* LOANS */}
                        {activeSection === "loans" && (
                            <>
                                {loans.length !== 0 && (
                                    <div className="pt-2">
                                        <div className="mb-3">
                                            <p className="text-sm text-[#888]">Net Loan Balance</p>
                                            {Object.keys(netLoanBalanceMap || {}).length > 0 ? (
                                                <div className="flex flex-col gap-1">
                                                    {Object.entries(netLoanBalanceMap).map(([code, amt]) => {
                                                        const sym = getSymbol(code);
                                                        const d = currencyDigits(code);
                                                        const cls = amt > 0 ? "text-teal-500" : amt < 0 ? "text-red-400" : "text-[#EBF1D5]";
                                                        return (
                                                            <p key={code} className={`text-2xl font-semibold ${cls}`}>
                                                                {amt > 0 ? "they owe you" : amt < 0 ? "you owe them" : "All Settled"}{" "}
                                                                {sym} {Math.abs(amt).toFixed(d)}
                                                            </p>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <p className="text-2xl font-semibold text-[#EBF1D5]">All Settled</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {loanLoading ? (
                                    <div className="flex items-center gap-2 text-sm text-[#a0a0a0]">
                                        <Loader className="animate-spin" size={16} /> Loading loans…
                                    </div>
                                ) : loans.length === 0 ? (
                                    <div className="flex flex-1 flex-col justify-center">
                                        <div className="flex flex-col items-center justify-center p-4 rounded-lg text-center space-y-3 bg-[#1f1f1f]">
                                            <h2 className="text-2xl font-semibold">No Loans Yet</h2>
                                            <p className="text-sm text-[#888] max-w-sm">You haven’t added any loans yet. Start by adding your first one to see stats and insights.</p>
                                            <button
                                                onClick={() => {
                                                    logEvent('navigate', { fromScreen: 'friend_detail', toScreen: 'new-loan', source: 'cta' });
                                                    navigate(`/new-loan`, { state: { friendId: friend?._id } });
                                                }}
                                                className="bg-teal-500 text-black px-4 py-2 rounded hover:bg-teal-400 transition">
                                                Add a Loan
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        {loans.map((loan) => {
                                            const loanCode = loan.currency || loan.principalCurrency || "INR";
                                            const sym = getSymbol(loanCode);
                                            const d = currencyDigits(loanCode);
                                            const { code: outCode, amount: outstanding } = getOutstandingByCurrency(loan);
                                            const outSym = getSymbol(outCode);
                                            const outD = currencyDigits(outCode);
                                            const youAreLender = loan.lenderId?._id === userId;
                                            const dirText = youAreLender ? "You lent" : "You borrowed";

                                            return (
                                                <div
                                                    key={loan._id}
                                                    className={`border ${outstanding > 0 ? "border-teal-500" : "border-[#333]"} rounded-lg p-3 bg-[#171717] flex flex-col gap-1 cursor-pointer`}
                                                    onClick={() => { logEvent("open_loan_modal", { screen: "friend_detail" }); openLoanView(loan); }}>
                                                    <div className="flex justify-between items-center">
                                                        <div className="text-sm">
                                                            <div className="font-semibold">
                                                                {dirText} {sym} {Number(loan.principal || 0).toFixed(d)} {youAreLender ? "to" : "from"} {friend?.name}
                                                            </div>
                                                            <div className="text-[#a0a0a0]">
                                                                Outstanding: {outSym} {Number(outstanding || 0).toFixed(outD)} • Status: {loan.status}
                                                            </div>
                                                            {loan.description && (<div className="text-[#a0a0a0] italic">{loan.description}</div>)}
                                                        </div>
                                                    </div>

                                                    {loan.repayments?.length > 0 && (
                                                        <div className="mt-2 text-xs text-[#a0a0a0]">
                                                            <p>Repayments:</p>
                                                            {loan.repayments.slice().reverse().map((r, idx) => {
                                                                const rCode = r.currency || loanCode;
                                                                const rSym = getSymbol(rCode);
                                                                const rD = currencyDigits(rCode);
                                                                return (<p key={idx} className="mr-2">{rSym} {Number(r.amount || 0).toFixed(rD)} on {new Date(r.at).toLocaleDateString()}</p>);
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}

                        {/* EXPENSES */}
                        {activeSection === "expenses" && (
                            <>
                                {expenses.length !== 0 && (
                                    <div className="pb-2 pt-2">
                                        <div>
                                            <p className="text-sm text-[#888]">Net Expenses Balance</p>
                                            {Object.keys(netExpenseBalanceMap || {}).length > 0 ? (
                                                <div className="flex flex-col gap-1">
                                                    {Object.entries(netExpenseBalanceMap).map(([code, amt]) => {
                                                        const sym = getSymbol(code);
                                                        const d = currencyDigits(code);
                                                        const cls = amt > 0 ? "text-teal-500" : amt < 0 ? "text-red-400" : "text-[#EBF1D5]";
                                                        return (<p key={code} className={`text-2xl font-semibold ${cls}`}>{amt > 0 ? "you are owed" : amt < 0 ? "you owe" : "All Settled"} {sym} {Math.abs(amt).toFixed(d)}</p>);
                                                    })}
                                                </div>
                                            ) : (<p className="text-2xl font-semibold text-[#EBF1D5]">All Settled</p>)}
                                        </div>

                                        {Object.keys(netExpenseBalanceMap || {}).length > 0 && (
                                            <div>
                                                <p className="text-sm text-[#888] mt-2">Personal Expenses Balance</p>
                                                {Object.keys(personalExpenseBalanceMap || {}).length > 0 ? (
                                                    <div className="flex flex-col gap-1">
                                                        {Object.entries(personalExpenseBalanceMap).map(([code, amt]) => {
                                                            const sym = getSymbol(code);
                                                            const d = currencyDigits(code);
                                                            return (<p key={code} className="text-lg font-semibold">{amt > 0 ? "you are owed" : amt < 0 ? "you owe" : "All Settled"} {sym} {Math.abs(amt).toFixed(d)}</p>);
                                                        })}
                                                    </div>
                                                ) : (<p className="text-2xl font-semibold text-[#EBF1D5]">All Settled</p>)}
                                            </div>
                                        )}

                                        {simplifiedTransactions?.length > 0 && (
                                            <div className="mt-1">
                                                <p className="text-sm text-[#888] mb-1">Group Settlements</p>
                                                <div className="flex flex-col gap-2">
                                                    {simplifiedTransactions.map((tx, idx) => {
                                                        const sym = getSymbol(tx.currency);
                                                        const d = currencyDigits(tx.currency);
                                                        const fromName = tx.from === userId ? "You" : friend?.name;
                                                        const toName = tx.to === userId ? "You" : friend?.name;
                                                        return (
                                                            <div key={idx} onClick={() => navigate(`/groups/${tx?.group?._id}`)} className="p-2 rounded-lg bg-[#1f1f1f] border border-[#2a2a2a] text-sm">
                                                                <p><span className="font-semibold">{fromName}</span> owes <span className="font-semibold">{toName}</span> {sym} {tx.amount.toFixed(d)}</p>
                                                                {tx.group?.name && (<p className="text-xs text-[#888]">From group: {tx.group.name}</p>)}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        <div>
                                            {((netExpenseBalanceMap?.INR || 0) < 0) && (
                                                <div className="flex flex-col gap-2 mt-2">
                                                    {!friend?.upiId ? (<p className="text-xs text-gray-500 mt-2 italic">💡 Ask your friend to enter their UPI ID in their Account page.</p>) : (
                                                        <button onClick={() => { logEvent("open_payment_modal", { screen: "friend_detail" }); setShowPaymentModal(true); }} className="bg-teal-600 text-[#EBF1D5] px-4 py-2 rounded-md text-sm">Make Payment</button>
                                                    )}
                                                </div>
                                            )}

                                            {((netExpenseBalanceMap?.INR || 0) > 0) && (
                                                <div className="flex flex-col gap-2 mt-2">
                                                    {!user?.upiId && (
                                                        <p className="text-xs text-gray-500 mt-2 italic">
                                                            💡 To make settlements faster, add your UPI ID here —{" "}
                                                            <button onClick={() => { logEvent("navigate", { fromScreen: "friend_detail", toScreen: "account", section: "upi", source: "cta" }); navigate("/account?section=upi"); }} className="underline underline-offset-2 text-teal-400 hover:text-teal-300">Account Page</button>. Friends can pay you instantly.
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {Object.values(netExpenseBalanceMap || {}).some(v => Math.abs(v) > 0) && (
                                                <div className="flex flex-col gap-2 mt-2">
                                                    <button onClick={() => { logEvent("open_settle_modal", { screen: "friend_detail" }); setSettleType("full"); setShowSettleModal(true); }} className="bg-teal-600 text-[#EBF1D5] px-4 py-2 rounded-md text-sm">Settle</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {loading ? (<div className="flex flex-col justify-center items-center flex-1 py-5"><Loader /></div>) : !expenses ? (<p>Group not found</p>) : expenses.length === 0 ? (
                                    <div className="flex flex-1 flex-col justify-center">
                                        <div className="flex flex-col items-center justify-center p-4 rounded-lg text-center space-y-3 bg-[#1f1f1f]">
                                            <h2 className="text-2xl font-semibold">No Expenses Yet</h2>
                                            <p className="text-sm text-[#888] max-w-sm">You haven’t added any expenses yet. Start by adding your first one to see stats and insights.</p>
                                            <button onClick={() => { logEvent('navigate', { fromScreen: 'friend_detail', toScreen: 'new-expense', source: 'cta' }); navigate('/new-expense', { state: { friendId: id } }); }} className="bg-teal-500 text-black px-4 py-2 rounded hover:bg-teal-400 transition">Add Expense</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-y-3 gap-x-4 ">
                                        <div className="flex flex-row justify-between items-center">
                                            <h3 className="text-lg font-semibold mb-2">Shared Expenses</h3>
                                            {hasSettled && (
                                                <div className="flex justify-end mb-2">
                                                    <button onClick={() => setShowSettled(prev => !prev)} className="text-xs px-3 py-1 rounded-full border border-[#EBF1D5] hover:bg-[#2a2a2a] transition">
                                                        {showSettled ? "Hide Settled" : "Show Settled"}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {expenses
                                            ?.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                                            ?.filter((exp) => {
                                                if (showSettled) return true;
                                                if (exp?.settled !== true) return true;
                                                if (!exp?.settledAt) return false;
                                                const settledAt = new Date(exp.settledAt);
                                                const now = new Date();
                                                const diffDays = (now - settledAt) / (1000 * 60 * 60 * 24);
                                                const compareTo = 3;
                                                if (diffDays > compareTo) handleHasSettled();
                                                return diffDays <= compareTo;
                                            })
                                            ?.map((exp) => (
                                                <ExpenseItem
                                                    key={exp._id}
                                                    expense={exp}
                                                    onClick={() => { logEvent('open_expense_modal', { screen: 'friend_detail' }); setShowModal(exp); }}
                                                    getPayerInfo={getPayerInfo}
                                                    getOweInfo={getOweInfo}
                                                    getSettleDirectionText={getSettleDirectionText}
                                                    userId={userId}
                                                />
                                            ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Modals */}
            {showModal && (
                <ExpenseModal
                    showModal={showModal}
                    fetchExpenses={() => fetchData()}
                    setShowModal={setShowModal}
                    userToken={userToken}
                    userId={userId}
                    categories={categories}
                    currencyOptions={currencyOptions}
                    defaultCurrency={defaultCurrency}
                    preferredCurrencies={preferredCurrencies}
                    paymentMethods={paymentMethods}
                />
            )}

            {showSettleModal && (
                <SettleModal
                    showModal={showSettleModal}
                    setShowModal={setShowSettleModal}
                    simplifiedTransactions={simplifiedTransactions}
                    settlementLists={settlementLists}
                    defaultSettleMode="net"
                    friends={[{ id: userId, name: 'You' }, { id: friend?._id, name: friend?.name, upiId: friend?.upiId }]}
                    onSubmit={handleSettle}
                    prefill={prefillSettle}
                    userId={userId}
                    currencyOptions={currencyOptions}
                    defaultCurrency={defaultCurrency}
                    preferredCurrencies={preferredCurrencies}
                />
            )}

            {showPaymentModal && (
                <PaymentModal
                    show={showPaymentModal}
                    onClose={handlePaymentClose}
                    receiverName={friend?.name}
                    receiverUpi={friend?.upiId}
                    note={"Settlement"}
                    currencyOptions={currencyOptions}
                    defaultCurrency={defaultCurrency}
                    preferredCurrencies={preferredCurrencies}
                />
            )}

            {showLoanView && activeLoan && (
                <LoanModal
                    showModal={showLoanView}
                    loan={activeLoan}
                    friend={friend}
                    userId={userId}
                    user={user}
                    userToken={userToken}
                    onClose={() => setShowLoanView(false)}
                    onCloseLoan={async () => {
                        await closeLoanApi(activeLoan._id, {}, userToken);
                        await fetchLoansForFriend(userId, friend._id);
                        setShowLoanView(false);
                    }}
                    onDeleteLoan={async () => {
                        await deleteLoanApi(activeLoan._1, userToken); // safe-guard key - your API might expect activeLoan._id
                        await fetchLoansForFriend(userId, friend._id);
                        setShowLoanView(false);
                    }}
                    onAfterChange={async () => { await fetchLoansForFriend(userId, friend._id); }}
                    currencyOptions={currencyOptions}
                    defaultCurrency={defaultCurrency}
                    preferredCurrencies={preferredCurrencies}
                    paymentModal={paymentModal}
                    setPaymentModal={setPaymentModal}
                    openPaymentModal={openPaymentModal}
                    closePaymentModal={closePaymentModal}
                    party={party}
                    setParty={setParty}
                    counterParty={counterParty}
                    setCounterParty={setCounterParty}
                />
            )}

            {/* Floating FABs */}
            {!loading && (
                <>
                    {activeSection === "expenses" && expenses?.length > 0 && (
                        <button
                            onClick={() => { logEvent('navigate', { fromScreen: 'friend_detail', toScreen: 'new-expense', source: 'fab' }); navigate('/new-expense', { state: { friendId: id } }); }}
                            aria-label="Add Expense"
                            className="fixed right-4 bottom-22 z-50 rounded-full bg-teal-500 hover:bg-teal-600 active:scale-95 transition text-[#EBF1D5] px-5 py-4 flex items-center gap-2"
                        >
                            <Plus size={18} />
                            <span className="text-sm font-semibold">Add Expense</span>
                        </button>
                    )}

                    {activeSection === "loans" && loans?.length > 0 && (
                        <button
                            onClick={() => { logEvent('navigate', { fromScreen: 'friend_detail', toScreen: 'new-loan', source: 'fab' }); navigate(`/new-loan`, { state: { friendId: friend?._id } }); }}
                            aria-label="Add a Loan"
                            className="fixed right-4 bottom-22 z-50 rounded-full bg-teal-500 hover:bg-teal-600 active:scale-95 transition text-[#EBF1D5] px-5 py-4 flex items-center gap-2"
                        >
                            <Plus size={18} />
                            <span className="text-sm font-semibold">New Loan</span>
                        </button>
                    )}
                </>
            )}

            <UnifiedPaymentModal
                show={paymentModal.open}
                onClose={closePaymentModal}
                context={paymentModal.context}
                privacy={'private'}
                options={unifiedOptions}
                value={unifiedValue}
                onSelect={(id, close) => { handleSelectUnified(id); if (close) closePaymentModal(); }}
                defaultSendId={paymentMethods?.find(a => a.isDefaultSend)?._id}
                defaultReceiveId={paymentMethods?.find(a => a.isDefaultReceive)?._id}
                paymentMethodRedirect={paymentMethodRedirect}
            />
        </MainLayout>
    );
};

export default FriendDetails;
