import { useEffect, useMemo, useRef, useState } from "react";
import React, { Fragment } from 'react';
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import { getFriendDetails } from "../services/FriendService";
import { settleExpense, getFriendExpense } from "../services/ExpenseService";
import SettleModal from "../components/SettleModal";
import { ChevronLeft, Loader, Wallet, Plus, Settings } from "lucide-react";
import LoanModal from "../components/LoanModal";
import { deleteLoan as deleteLoanApi } from "../services/LoanService";
import { useAuth } from "../context/AuthContext";
import ExpenseModal from "../components/ExpenseModal"; // Adjust import path
import PaymentModal from "../components/PaymentModal"; // Adjust import path
import ExpenseItem from "../components/ExpenseItem"; // Adjust import path
import { getAllCurrencyCodes, getSymbol, toCurrencyOptions } from "../utils/currencies"
import { fetchFriendsPaymentMethods } from "../services/PaymentMethodService";
import {
    getLoans,
    addRepayment as addLoanRepayment,
    closeLoan as closeLoanApi,
} from "../services/LoanService";

import PullToRefresh from "pulltorefreshjs";
import { logEvent } from "../utils/analytics";
import UnifiedPaymentModal from "../components/UnifiedPaymentModal";
import SEO from "../components/SEO";

const FriendDetails = () => {
    const { user, userToken, defaultCurrency, preferredCurrencies, categories, paymentMethods, fetchPaymentMethods } = useAuth() || {};
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const tab = searchParams.get("tab"); // "loan" or null
    // inside SettleModal (after confirm step), when YOU are payer:
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [allCodes, setAllCodes] = useState([]);
    useEffect(() => { setAllCodes(getAllCurrencyCodes()); }, []);
    const currencyOptions = toCurrencyOptions(allCodes); // e.g., [{value:'INR', label:'₹ INR'}, ...]
    const [paymentModal, setPaymentModal] = useState({ open: false, context: '', friendId: null });
    const openPaymentModal = ({ context, friendId = null }) => setPaymentModal({ open: true, context, friendId });
    const closePaymentModal = () => setPaymentModal({ open: false, context: '', friendId: null });


    const navigate = useNavigate();
    const [userId, setUserId] = useState();
    const [loading, setLoading] = useState(true);
    const round = (val) => Math.round(val * 100) / 100;
    const [friend, setFriend] = useState(null);
    const [expenses, setExpenses] = useState([]);
    const [simplifiedTransactions, setSimplifiedTransactions] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [showSettleModal, setShowSettleModal] = useState(false);
    const [settleType, setSettleType] = useState('partial');
    const [loanLoading, setLoanLoading] = useState(true);
    const [activeSection, setActiveSection] = useState(tab === "loan" ? "loans" : "expenses"); // 'loans' | 'expenses'
    const [prefillSettle, setPrefillSettle] = useState(null);
    const [loans, setLoans] = useState([]);
    const [netLoanBalance, setNetLoanBalance] = useState(0);
    // repayment modal
    const [showLoanModal, setShowLoanModal] = useState(false);
    const [activeLoan, setActiveLoan] = useState(null);
    const [repayAmount, setRepayAmount] = useState("");
    const [repayNote, setRepayNote] = useState("");
    const [showLoanView, setShowLoanView] = useState(false);
    const [party, setParty] = useState(); // selected friend object
    const [counterParty, setCounterParty] = useState(); // selected friend object
    const [paymentMethodsUpdated, setPaymentMethodsUpdated] = useState(false);
    const [showSettled, setShowSettled] = useState(false);
    const [hasSettled, setHasSettled] = useState(false);


    const [paymentMethod, setPaymentMethod] = useState();
    const pmLabel = (m) => {
        return `${m?.label || m?.type || "Method"}`;
    };


    const unifiedOptions = useMemo(() => {
        if (!paymentModal.open) return [];
        if (paymentModal.context === 'lender') {
            // raw docs from Auth — already rich
            return (party?.paymentMethods || []).map(m => ({ _id: m.paymentMethodId, ...m }))
        }
        return (counterParty?.paymentMethods || []).map(m => ({ _id: m.paymentMethodId, ...m }));
    }, [paymentModal, party, counterParty]);

    const unifiedValue = useMemo(() => {
        if (paymentModal.context === 'lender') return paymentMethod || null;
        const f = counterParty
        return f?.selectedPaymentMethodId ?? null;
    }, [paymentModal, paymentMethod, counterParty]);

    const handleSelectUnified = (id) => {
        if (paymentModal.context === 'lender') {
            setParty(prev => ({ ...prev, selectedPaymentMethodId: id }));
        } else {
            setCounterParty(prev => ({ ...prev, selectedPaymentMethodId: id }));
        }
    };
    const paymentMethodRedirect = () => {
        setShowLoanModal(false)
        setShowPaymentModal(false)
        navigate('/account?section=paymentMethod')
    };
    const updateFriendsPaymentMethods = async (list) => {
        const map = await fetchFriendsPaymentMethods(list, userToken); // { [friendId]: PaymentMethod[] }        
        setCounterParty((prev) => {
            const raw = map[prev._id];
            const methods = raw;
            let selectedPaymentMethodId;
            selectedPaymentMethodId = methods.length === 1 ? methods[0].paymentMethodId : null; // auto-pick when only one

            return { ...prev, paymentMethods: methods, selectedPaymentMethodId };
        })
        setParty((prev) => {
            const raw = map[prev._id];
            const methods = raw;
            let selectedPaymentMethodId;
            selectedPaymentMethodId = methods.length === 1 ? methods[0].paymentMethodId : null; // auto-pick when only one

            return { ...prev, paymentMethods: methods, selectedPaymentMethodId };
        })
        setPaymentMethodsUpdated(true)
    };
    useEffect(() => {
        if (counterParty && !paymentMethodsUpdated && party)
            updateFriendsPaymentMethods([party._id, counterParty._id])
    }, [counterParty, party])
    // helpers:
    const openLoanView = (loan) => {
        setActiveLoan(loan);
        setShowLoanView(true);
    };

    // open from a button on a loan card
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


    const getOutstandingByCurrency = (loan) => {
        // assume loan + repayments use same currency; fall back to INR
        const code = loan?.currency || loan?.principalCurrency || "INR";
        const principal = Number(loan?.principal) || 0;
        let paid = 0;
        for (const r of (loan?.repayments || [])) {
            const rCode = r?.currency || code;
            if (rCode !== code) continue; // skip mismatched currency lines
            paid += Number(r?.amount) || 0;
        }
        const outstanding = Math.max(0, roundCurrency(principal - paid, code));
        return { code, amount: outstanding };
    };

    // +ve => friend owes you (you lent)
    // -ve => you owe friend (you borrowed)
    const computeNetLoanBalanceByCurrency = (friendId, userId, friendLoans) => {
        const totals = {}; // { [code]: number }
        for (const loan of (friendLoans || [])) {
            const { code, amount } = getOutstandingByCurrency(loan);
            if (amount === 0) continue;

            const youAreLender = loan.lenderId?._id?.toString?.() === userId;
            const friendBorrower = loan.borrowerId?._id?.toString?.() === friendId;
            const youAreBorrower = loan.borrowerId?._id?.toString?.() === userId;
            const friendLender = loan.lenderId?._id?.toString?.() === friendId;

            if (youAreLender && friendBorrower) {
                totals[code] = roundCurrency((totals[code] || 0) + amount, code);
            }
            if (youAreBorrower && friendLender) {
                totals[code] = roundCurrency((totals[code] || 0) - amount, code);
            }
        }
        // drop near-zero dust
        for (const code of Object.keys(totals)) {
            const minUnit = 1 / (10 ** currencyDigits(code));
            if (Math.abs(totals[code]) < minUnit) delete totals[code];
        }
        return totals; // e.g., { INR: 1200, USD: -50 }
    };
    const [netLoanBalanceMap, setNetLoanBalanceMap] = useState({}); // new state
    const [personalExpenseBalanceMap, setPersonalExpenseBalanceMap] = useState({}); // new state
    // const [netExpenseBalanceMap, setNetExpenseBalanceMap] = useState({}); // new state


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
        if (user) setParty(user)
    }, [])
    const fetchData = async () => {

        const data = await getFriendDetails(id, userToken);
        setFriend(data.friend);
        setCounterParty(data.friend)
        setUserId(data.id);

        const expenseData = await getFriendExpense(id, userToken);
        console.log(expenseData);

        setExpenses(expenseData.expenses);
        setSimplifiedTransactions(expenseData.simplifiedTransactions)
        const personal = calculateFriendBalanceByCurrency(expenseData.expenses, data.id, data.friend._id);
        setPersonalExpenseBalanceMap(personal);

        // 🔹 fetch loans tied to this friend
        await fetchLoansForFriend(data.id, data.friend._id);

        setLoading(false);
    };

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
            // You paid friend → record settlement: payer = you, receiver = friend
            setPrefillSettle({
                payerId: userId,
                receiverId: friend._id,
                amount: finalAmt,
                description: "Settlement",
            });
            setShowSettleModal(true);
            logEvent('open_modal_settle', {
                screen: 'friend_detail'
            })
        }
    };

    const handleSettle = async ({ payerId, receiverId, amount, description, currency, meta }) => {
        const responseJson = await settleExpense({ payerId, receiverId, amount, description, currency, meta }, userToken);
        if (responseJson.allSettled) {

        }
        await fetchData();
    };

    const handleHasSettled = () => {
        if (hasSettled) return true;
        else setHasSettled(true)
    };

    const calculateFriendBalanceByCurrency = (expenses, userId, friendId) => {
        const totals = {}; // { [code]: number }
        // consider only expenses where one is paying and the other is owing
        const filtered = (expenses || []).filter(exp => {
            let youPay = false, frPay = false, youOwe = false, frOwe = false;
            (exp.splits || []).forEach(s => {
                const id = s.friendId?._id?.toString();
                if (id === userId) { if (s.paying) youPay = true; if (s.owing) youOwe = true; }
                if (id === friendId) { if (s.paying) frPay = true; if (s.owing) frOwe = true; }
            });
            const oneIsPaying = youPay || frPay;
            const otherIsOwing = (youPay && frOwe) || (frPay && youOwe);
            return oneIsPaying && otherIsOwing;
        });

        for (const exp of filtered) {
            const code = exp?.currency || "INR";
            for (const s of exp.splits || []) {
                const id = s?.friendId?._id?.toString();
                if (id !== friendId) continue;
                const add = (s.owing ? Number(s.oweAmount) || 0 : 0);
                const sub = (s.paying ? Number(s.payAmount) || 0 : 0);
                totals[code] = roundCurrency((totals[code] || 0) + add - sub, code);
            }
        }

        // drop near-zero dust by currency step
        for (const code of Object.keys(totals)) {
            const minUnit = 1 / (10 ** currencyDigits(code));
            if (Math.abs(totals[code]) < minUnit) delete totals[code];
        }
        return totals; // e.g., { INR: 250, USD: -10 }
    };


    useEffect(() => {
        if (id)
            fetchData();
    }, [id]);
    const getPayerInfo = (splits) => {
        const userSplit = splits.find(s => s.friendId && s.friendId._id === userId);

        if (!userSplit || (!userSplit.payAmount && !userSplit.oweAmount)) {
            return "You were not involved";
        }
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
        const userSplit = splits.find(s => s.friendId && s.friendId._id === friend._id);
        if (!userSplit) return null;
        const { oweAmount = 0, payAmount = 0 } = userSplit;
        const net = payAmount - oweAmount;

        if (net > 0) {
            return { text: 'lent', amount: ` ${net.toFixed(2)}` };
        } else if (net < 0) {
            return { text: 'borrowed', amount: ` ${Math.abs(net).toFixed(2)}` };
        } else {
            return null;
        }
    };
    const groupBalanceMap = useMemo(() => {
        const totals = {}; // { [code]: number }
        if (!userId || !counterParty?._id) return totals;

        for (const tx of simplifiedTransactions || []) {
            const code = tx?.currency || "INR";
            const amt = Number(tx?.amount) || 0;
            if (!amt) continue;

            // only tx between you and this friend
            const involvesFriend =
                (tx.from === String(userId) && tx.to === String(counterParty._id)) ||
                (tx.to === String(userId) && tx.from === String(counterParty._id));

            if (!involvesFriend) continue;

            if (tx.to === String(userId)) {
                // friend -> you
                totals[code] = (totals[code] || 0) + amt;
            } else if (tx.from === String(userId)) {
                // you -> friend
                totals[code] = (totals[code] || 0) - amt;
            }
        }

        // round & drop dust
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
    const netExpenseBalanceMap = useMemo(() => {
        return mergeCurrencyMaps(personalExpenseBalanceMap, groupBalanceMap);
    }, [personalExpenseBalanceMap, groupBalanceMap]);
    const collectGroupPartiesByCurrency = (
        simplifiedTransactions,
        userId,
        friendId,
        roundCurrency,
        currencyDigits
    ) => {
        const uid = String(userId || "");
        const fid = String(friendId || "");
        const byCode = {}; // { [code]: { [groupId]: { net:number, name?:string } } }

        for (const tx of simplifiedTransactions || []) {
            const from = String(tx?.from || "");
            const to = String(tx?.to || "");
            if (!from || !to) continue;

            // only the selected pair
            const isPair = (from === uid && to === fid) || (from === fid && to === uid);
            if (!isPair) continue;

            const code = tx?.currency || "INR";
            const gid = String(tx?.groupId || tx?.group?._id || "");
            if (!gid) continue;

            const amt = Number(tx?.amount || 0);
            if (!amt) continue;

            // net sign from *your* perspective: + means they owe you; - means you owe them
            const sign = (to === uid) ? +1 : -1;

            (byCode[code] ||= {});
            (byCode[code][gid] ||= { net: 0, name: tx?.name || tx?.group?.name || "Unnamed Group" });
            byCode[code][gid].net += sign * amt;
        }

        // Convert to final shape with from/to and rounded amount
        const out = {}; // { [code]: { [gid]: { from,to,amount,currency,groupId,name } } }
        for (const [code, groups] of Object.entries(byCode)) {
            const resPerCode = {};
            const minUnit = 1 / (10 ** currencyDigits(code));

            for (const [gid, info] of Object.entries(groups)) {
                const rounded = roundCurrency(info.net, code);
                if (Math.abs(rounded) < minUnit) continue; // drop dust/settled

                const from = rounded < 0 ? uid : fid; // negative -> you owe friend
                const to = rounded < 0 ? fid : uid;

                resPerCode[gid] = {
                    from,
                    to,
                    amount: Math.abs(rounded),
                    currency: code,
                    groupId: gid,
                    name: info.name
                };
            }

            if (Object.keys(resPerCode).length) out[code] = resPerCode;
        }

        return out;
    };
    const collectGroupIdsByCurrency = (simplifiedTransactions, userId, friendId) => {
        const uid = String(userId || "");
        const fid = String(friendId || "");
        const byCode = {}; // { [code]: Set<groupId> }
        for (const tx of simplifiedTransactions || []) {
            const from = String(tx?.from || "");
            const to = String(tx?.to || "");
            const isPair = (from === uid && to === fid) || (from === fid && to === uid);
            if (!isPair) continue;

            const code = tx?.currency || "INR";
            const gid = tx?.group?._id;
            if (!gid) continue;

            (byCode[code] ||= new Set()).add(String(gid));
        }

        // convert Set -> Array
        const out = {};
        for (const [code, set] of Object.entries(byCode)) out[code] = Array.from(set);
        return out; // { INR: ["g1","g2"], AED: ["g3"], ... }
    };


    // 0) Small helper — same direction/signs as your UI
    // byCode -> list of tx; `idsByCode` can be undefined or { [code]: string[] }
    const txFromCurrencyMap = (byCode = {}, userId, friendId, roundCurrency, currencyDigits, type, idsByCode) => {
        const out = [];
        for (const [code, amtRaw] of Object.entries(byCode)) {
            const amt = roundCurrency(amtRaw, code);
            const minUnit = 1 / (10 ** currencyDigits(code));
            if (Math.abs(amt) < minUnit) continue;

            const from = amt < 0 ? userId : friendId;
            const to = amt < 0 ? friendId : userId;

            out.push({
                from: String(from),
                to: String(to),
                amount: Math.abs(amt),
                currency: code,
                type,
                ids: idsByCode?.[code] || null
            });
        }
        return out;
    };



    const computeGroupAggregateMap = (simplifiedTransactions, userId, friendId) => {
        const totals = {}; // { [code]: number } (+ you’re owed, - you owe)
        for (const tx of simplifiedTransactions || []) {
            const code = tx?.currency || "INR";
            const amt = Number(tx?.amount) || 0;
            const from = String(tx?.from || "");
            const to = String(tx?.to || "");
            const uid = String(userId);
            const fid = String(friendId);

            // only the pair you <-> friend
            const pair = (from === uid && to === fid) || (from === fid && to === uid);
            if (!pair || !amt) continue;

            if (to === uid) totals[code] = (totals[code] || 0) + amt;      // friend -> you
            if (from === uid) totals[code] = (totals[code] || 0) - amt;    // you -> friend
        }
        return totals;
    };
    // +ve means they owe *you*; -ve means you owe *them*
    const signedForUser = (from, to, amount, userId) => {
        return to === String(userId) ? +Number(amount || 0) : -Number(amount || 0);
    };

    const minUnitFor = (code, currencyDigits) => 1 / (10 ** currencyDigits(code));

    // Build NET rows with detailed breakdown:
    // returns array of tx like:
    // { from, to, amount, currency, type: 'net', groups: {...}, ids: [...], personal: {from,to,amount,currency} | null }
    const buildNetWithBreakdown = (
        netByCode,                 // your netExpenseBalanceMap (signed, +ve => you’re owed)
        groupsByCur,               // from collectGroupPartiesByCurrency
        userId,
        friendId,
        roundCurrency,
        currencyDigits
    ) => {
        const out = [];
        for (const [code, netSignedRaw] of Object.entries(netByCode || {})) {
            const netSigned = roundCurrency(netSignedRaw, code);
            const minUnit = minUnitFor(code, currencyDigits);
            if (Math.abs(netSigned) < minUnit) continue;

            // direction for the *net* row
            const netFrom = netSigned < 0 ? userId : friendId;
            const netTo = netSigned < 0 ? friendId : userId;

            // sum groups (signed from user's perspective)
            const perCodeGroups = groupsByCur?.[code] || {};
            let groupSignedSum = 0;
            for (const g of Object.values(perCodeGroups)) {
                groupSignedSum += signedForUser(String(g.from), String(g.to), Number(g.amount || 0), String(userId));
            }

            // personalSigned = netSigned - sum(groups)
            const personalSigned = roundCurrency(netSigned - groupSignedSum, code);
            const hasPersonal = Math.abs(personalSigned) >= minUnit;

            const personal = hasPersonal
                ? {
                    from: personalSigned < 0 ? String(userId) : String(friendId),
                    to: personalSigned < 0 ? String(friendId) : String(userId),
                    amount: Math.abs(personalSigned),
                    currency: code
                }
                : null;

            out.push({
                from: String(netFrom),
                to: String(netTo),
                amount: Math.abs(netSigned),
                currency: code,
                type: "net",
                // detailed groups + quick ids
                groups: perCodeGroups,
                ids: Object.keys(perCodeGroups),
                // NEW: personal component inside NET
                personal
            });
        }
        return out;
    };


    const generateSettleAllNet = (
        netExpenseBalanceMap,
        userId,
        friendId,
        simplifiedTransactions
    ) => {
        const groupsByCur = collectGroupPartiesByCurrency(
            simplifiedTransactions, userId, friendId, roundCurrency, currencyDigits
        );
        console.log(buildNetWithBreakdown(
            netExpenseBalanceMap,
            groupsByCur,
            userId,
            friendId,
            roundCurrency,
            currencyDigits
        ));

        // Build NET rows with both groups + personal parts
        return buildNetWithBreakdown(
            netExpenseBalanceMap,
            groupsByCur,
            userId,
            friendId,
            roundCurrency,
            currencyDigits
        );
    };

    const generateSettleGroupAggregate = (simplifiedTransactions, userId, friendId) => {
        const totalsByCode = computeGroupAggregateMap(simplifiedTransactions, userId, friendId);
        const groupsByCur = collectGroupPartiesByCurrency(
            simplifiedTransactions, userId, friendId, roundCurrency, currencyDigits
        );
        // Reuse txFromCurrencyMap but pass groupsByCur so each currency row gets its groups attached
        return txFromCurrencyMap(
            totalsByCode, userId, friendId, roundCurrency, currencyDigits, "all_groups", groupsByCur
        );
    };

    // Personal stays simple (no groups)
    const generateSettlePersonal = (personalExpenseBalanceMap, userId, friendId) => {
        return txFromCurrencyMap(
            personalExpenseBalanceMap, userId, friendId, roundCurrency, currencyDigits, "all_personal"
        );
    };

    // const generateSettleGroupAggregate = (simplifiedTransactions, userId, friendId) => {
    //     const map = computeGroupAggregateMap(simplifiedTransactions, userId, friendId);
    //     const idsByCode = collectGroupIdsByCurrency(simplifiedTransactions, userId, friendId);
    //     const groupsByCur = collectGroupPartiesByCurrency(
    //     simplifiedTransactions, userId, friendId, roundCurrency, currencyDigits
    //     );  
    //     console.log(groupsByCur);

    //     return txFromCurrencyMap(map, userId, friendId, roundCurrency, currencyDigits, "all_groups", groupsByCur);
    // };

    // // Personal: no groupIds
    // const generateSettlePersonal = (personalExpenseBalanceMap, userId, friendId) => {
    //     return txFromCurrencyMap(personalExpenseBalanceMap, userId, friendId, roundCurrency, currencyDigits, "all_personal");
    // };

    // Returns: [{ group: { _id, name }, items: [{from,to,amount,currency}], totals: { [code]: number }}]
    const listPerGroupSimplifiedWithFriend = (simplifiedTransactions, userId, friendId) => {
        const uid = String(userId || "");
        const fid = String(friendId || "");
        const out = [];

        for (const tx of simplifiedTransactions || []) {
            const from = String(tx?.from || "");
            const to = String(tx?.to || "");
            if (!from || !to) continue;

            const isPair =
                (from === uid && to === fid) ||
                (from === fid && to === uid);
            if (!isPair) continue;

            out.push({
                from,
                to,
                amount: Number(tx?.amount) || 0,
                currency: tx?.currency || "INR",
                type: 'group',
                groupId: tx?.group?._id,
                name: tx?.group?.name || "Unnamed Group"
            });
        }

        return out;
    };

    const settlementLists = useMemo(() => {
        if (!userId || !friend?._id) return [];
        console.log(netExpenseBalanceMap);

        const net = generateSettleAllNet(netExpenseBalanceMap, userId, friend._id, simplifiedTransactions);
        const personal = generateSettlePersonal(personalExpenseBalanceMap, userId, friend._id);
        const allGrp = generateSettleGroupAggregate(simplifiedTransactions, userId, friend._id);
        const perGrp = listPerGroupSimplifiedWithFriend(simplifiedTransactions, userId, friend._id);

        return [...net, ...personal, ...allGrp, ...perGrp];
    }, [userId, friend?._id, netExpenseBalanceMap, personalExpenseBalanceMap, simplifiedTransactions]);

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
                            logEvent('navigate', {
                                fromScreen: 'friend_detail', toScreen: 'friends', source: 'back'
                            });
                            navigate(`/friends`)
                        }
                        }>
                            <ChevronLeft />
                        </button>
                        <h1 className={`${friend?.name ? 'text-[#EBF1D5]' : 'text-[#121212]'} text-3xl font-bold capitalize text-wrap break-words max-w-[80%]`}>{friend?.name ? friend?.name : "Loading"}</h1>
                        <div className="flex flex-1 justify-end flex-row items-center">
                            <button
                                className="flex flex-col items-center justify-center z-10 w-8 h-8 rounded-full shadow-md text-2xl"
                                onClick={() => {
                                    logEvent('navigate',
                                        { fromScreen: 'friend_detail', toScreen: 'friend_setting', source: 'setting' }
                                    );
                                    navigate(`/friends/settings/${id}`)
                                }} >
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
                                    logEvent('tab_select', {
                                        screen: 'friend_detail', tab: 'expenses'
                                    });
                                    setActiveSection("expenses")
                                }}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeSection === "expenses"
                                    ? "bg-[#EBF1D5] text-[#121212]"
                                    : "text-[#EBF1D5] hover:bg-[#2a2a2a]"
                                    }`}
                            >
                                Expenses
                            </button>
                            <button
                                onClick={() => {
                                    logEvent('tab_select', {
                                        screen: 'friend_detail', tab: 'loans'
                                    });
                                    setActiveSection("loans")
                                }}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeSection === "loans"
                                    ? "bg-[#EBF1D5] text-[#121212]"
                                    : "text-[#EBF1D5] hover:bg-[#2a2a2a]"
                                    }`}
                            >
                                Loans
                            </button>

                        </div>
                    </div>
                    <div className="flex flex-col flex-1 w-full overflow-y-auto pt-1 no-scrollbar gap-3  pb-16">

                        {/* ---- LOANS SECTION ---- */}
                        {activeSection === "loans" && (<>

                            {loans.length !== 0 && (
                                <div className="pt-2">
                                    <div className="mb-3">
                                        <p className="text-sm text-[#888]">Net Loan Balance</p>

                                        {/* Per-currency lines */}
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
                                    <div className="flex flex-col items-center justify-center p-4 rounded-lg  text-center space-y-3 bg-[#1f1f1f]">
                                        <h2 className="text-2xl font-semibold">No Loans Yet</h2>
                                        <p className="text-sm text-[#888] max-w-sm">
                                            You haven’t added any loans yet. Start by adding your first one to see stats and insights.
                                        </p>
                                        <button
                                            onClick={() => {
                                                logEvent('navigate', {
                                                    fromScreen: 'friend_detail', toScreen: 'new-loan', source: 'cta'
                                                });
                                                navigate(`/new-loan`, { state: { friendId: friend._id } })
                                            }}
                                            className="bg-teal-500 text-black px-4 py-2 rounded hover:bg-teal-400 transition"
                                        >
                                            Add a Loan
                                        </button>
                                    </div></div>

                            ) : (
                                <div className="flex flex-col gap-2">
                                    {loans.map((loan) => {
                                        // principal currency fallback
                                        const loanCode = loan.currency || loan.principalCurrency || "INR";
                                        const sym = getSymbol(loanCode);
                                        const d = currencyDigits(loanCode);

                                        // outstanding for this loan
                                        const { code: outCode, amount: outstanding } = getOutstandingByCurrency(loan); // <- use your currency-aware helper
                                        const outSym = getSymbol(outCode);
                                        const outD = currencyDigits(outCode);

                                        const youAreLender = loan.lenderId?._id === userId;
                                        const dirText = youAreLender ? "You lent" : "You borrowed";

                                        return (
                                            <div
                                                key={loan._id}
                                                className={`border ${outstanding > 0 ? "border-teal-500" : "border-[#333]"} rounded-lg p-3 bg-[#171717] flex flex-col gap-1 cursor-pointer`}
                                                onClick={() => {
                                                    logEvent("open_loan_modal", { screen: "friend_detail" });
                                                    openLoanView(loan);
                                                }}
                                            >
                                                <div className="flex justify-between items-center">
                                                    <div className="text-sm">
                                                        <div className="font-semibold">
                                                            {dirText} {sym} {Number(loan.principal || 0).toFixed(d)} {youAreLender ? "to" : "from"} {friend?.name}
                                                        </div>
                                                        <div className="text-[#a0a0a0]">
                                                            Outstanding: {outSym} {Number(outstanding || 0).toFixed(outD)} • Status: {loan.status}
                                                        </div>
                                                        {loan.description && (
                                                            <div className="text-[#a0a0a0] italic">{loan.description}</div>
                                                        )}
                                                    </div>
                                                </div>

                                                {loan.repayments?.length > 0 && (
                                                    <div className="mt-2 text-xs text-[#a0a0a0]">
                                                        <p>Repayments:</p>
                                                        {loan.repayments.slice().reverse().map((r, idx) => {
                                                            const rCode = r.currency || loanCode;
                                                            const rSym = getSymbol(rCode);
                                                            const rD = currencyDigits(rCode);
                                                            return (
                                                                <p key={idx} className="mr-2">
                                                                    {rSym} {Number(r.amount || 0).toFixed(rD)} on {new Date(r.at).toLocaleDateString()}
                                                                </p>
                                                            );
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

                        {/* ---- EXPENSES SECTION ---- */}
                        {activeSection === "expenses" && (
                            <>
                                {expenses.length !== 0 && (
                                    <div className="pb-2 pt-2">
                                        <div>
                                            <p className="text-sm text-[#888]">Net Expenses Balance</p>

                                            {/* Per-currency lines */}
                                            {Object.keys(netExpenseBalanceMap || {}).length > 0 ? (
                                                <div className="flex flex-col gap-1">
                                                    {Object.entries(netExpenseBalanceMap).map(([code, amt]) => {
                                                        const sym = getSymbol(code);
                                                        const d = currencyDigits(code);
                                                        const cls = amt > 0 ? "text-teal-500" : amt < 0 ? "text-red-400" : "text-[#EBF1D5]";
                                                        return (
                                                            <p key={code} className={`text-2xl font-semibold ${cls}`}>
                                                                {amt > 0 ? "you are owed" : amt < 0 ? "you owe" : "All Settled"}{" "}
                                                                {sym} {Math.abs(amt).toFixed(d)}
                                                            </p>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <p className="text-2xl font-semibold text-[#EBF1D5]">All Settled</p>
                                            )}
                                        </div>
                                        {Object.keys(netExpenseBalanceMap || {}).length > 0 && <div>
                                            <p className="text-sm text-[#888] mt-2">Personal Expenses Balance</p>
                                            {Object.keys(personalExpenseBalanceMap || {}).length > 0 ? (
                                                <div className="flex flex-col gap-1">
                                                    {Object.entries(personalExpenseBalanceMap).map(([code, amt]) => {
                                                        const sym = getSymbol(code);
                                                        const d = currencyDigits(code);
                                                        const cls = amt > 0 ? "text-teal-500" : amt < 0 ? "text-red-400" : "text-[#EBF1D5]";
                                                        return (
                                                            <p key={code} className={`text-lg font-semibold`}>
                                                                {amt > 0 ? "you are owed" : amt < 0 ? "you owe" : "All Settled"}{" "}
                                                                {sym} {Math.abs(amt).toFixed(d)}
                                                            </p>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <p className="text-2xl font-semibold text-[#EBF1D5]">All Settled</p>
                                            )}
                                        </div>}
                                        {/* Simplified Transactions from Groups */}
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
                                                            <div
                                                                key={idx}
                                                                onClick={() => navigate(`/groups/${tx?.group?._id}`)}
                                                                className="p-2 rounded-lg bg-[#1f1f1f] border border-[#2a2a2a] text-sm"
                                                            >
                                                                <p>
                                                                    <span className="font-semibold">{fromName}</span> owes{" "}
                                                                    <span className="font-semibold">{toName}</span>{" "}
                                                                    {sym} {tx.amount.toFixed(d)}
                                                                </p>
                                                                {tx.group?.name && (
                                                                    <p className="text-xs text-[#888]">
                                                                        From group: {tx.group.name}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}


                                        {/* Actions (gate UPI to INR only) */}
                                        <div>
                                            {/* If INR balance is negative, you owe in INR => show Pay CTA */}
                                            {((netExpenseBalanceMap?.INR || 0) < 0) && (
                                                <div className="flex flex-col gap-2 mt-2">
                                                    {!friend?.upiId ? (
                                                        <p className="text-xs text-gray-500 mt-2 italic">
                                                            💡 Ask your friend to enter their UPI ID in their Account page.
                                                        </p>
                                                    ) : (
                                                        <button
                                                            onClick={() => {
                                                                logEvent("open_payment_modal", { screen: "friend_detail" });
                                                                setShowPaymentModal(true);
                                                            }}
                                                            className="bg-teal-600 text-[#EBF1D5] px-4 py-2 rounded-md text-sm"
                                                        >
                                                            Make Payment
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            {/* If INR balance is positive, suggest adding your UPI for faster settlements */}
                                            {((netExpenseBalanceMap?.INR || 0) > 0) && (
                                                <div className="flex flex-col gap-2 mt-2">
                                                    {!user?.upiId && (
                                                        <p className="text-xs text-gray-500 mt-2 italic">
                                                            💡 To make settlements faster, add your UPI ID here —{" "}
                                                            <button
                                                                onClick={() => {
                                                                    logEvent("navigate", { fromScreen: "friend_detail", toScreen: "account", section: "upi", source: "cta" });
                                                                    navigate("/account?section=upi");
                                                                }}
                                                                className="underline underline-offset-2 text-teal-400 hover:text-teal-300"
                                                            >
                                                                Account Page
                                                            </button>
                                                            . Friends can pay you instantly.
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {/* Show Settle button if ANY currency has a non-zero balance */}
                                            {Object.values(netExpenseBalanceMap || {}).some(v => Math.abs(v) > 0) && (
                                                <div className="flex flex-col gap-2 mt-2">
                                                    <button
                                                        onClick={() => {
                                                            logEvent("open_settle_modal", { screen: "friend_detail" });
                                                            setSettleType("full");
                                                            setShowSettleModal(true);
                                                        }}
                                                        className="bg-teal-600 text-[#EBF1D5] px-4 py-2 rounded-md text-sm"
                                                    >
                                                        Settle
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {loading ? (
                                    <div className="flex flex-col justify-center items-center flex-1 py-5">
                                        <Loader />
                                    </div>
                                ) : !expenses ? (
                                    <p>Group not found</p>
                                ) : expenses.length === 0 ? (
                                    <div className="flex flex-1 flex-col justify-center">
                                        <div className="flex flex-col items-center justify-center p-4 rounded-lg  text-center space-y-3 bg-[#1f1f1f]">
                                            <h2 className="text-2xl font-semibold">No Expenses Yet</h2>
                                            <p className="text-sm text-[#888] max-w-sm">
                                                You haven’t added any expenses yet. Start by adding your first one to see stats and insights.
                                            </p>
                                            <button
                                                onClick={() => {
                                                    logEvent('navigate', {
                                                        fromScreen: 'friend_detail', toScreen: 'new-expense', source: 'cta'
                                                    });
                                                    navigate('/new-expense', { state: { friendId: id } })
                                                }}
                                                className="bg-teal-500 text-black px-4 py-2 rounded hover:bg-teal-400 transition"
                                            >
                                                Add Expense
                                            </button>
                                        </div></div>

                                ) : (
                                    <div className="flex flex-col gap-y-3 gap-x-4 ">
                                        <div className="flex flex-row justify-between items-center">
                                            <h3 className="text-lg font-semibold mb-2">Shared Expenses</h3>
                                            {hasSettled && <div className="flex justify-end mb-2">
                                                <button
                                                    onClick={() => setShowSettled(prev => !prev)}
                                                    className="text-xs px-3 py-1 rounded-full border border-[#EBF1D5] hover:bg-[#2a2a2a] transition"
                                                >
                                                    {showSettled ? "Hide Settled" : "Show Settled"}
                                                </button>
                                            </div>}
                                        </div>

                                        {expenses
                                            ?.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                                            ?.filter((exp) => {
                                                // Show only unsettled expenses, or if settled, only if settled less than 3 days ago
                                                if (showSettled) return true;
                                                if (exp?.settled !== true) return true;
                                                if (!exp?.settledAt) return false;
                                                const settledAt = new Date(exp.settledAt);
                                                const now = new Date();
                                                const diffDays = (now - settledAt) / (1000 * 60 * 60 * 24);
                                                const diffTime = (now - settledAt);
                                                const compareTo = 3
                                                if (diffDays > compareTo)
                                                    handleHasSettled()
                                                return diffDays <= compareTo;
                                            }) // show only unsettled expenses or recently settled (<=3 days)
                                            ?.map((exp) => (
                                                <ExpenseItem
                                                    key={exp._id}
                                                    expense={exp}
                                                    onClick={() => {
                                                        logEvent('open_expense_modal', {
                                                            screen: 'friend_detail',
                                                        });
                                                        setShowModal(exp)
                                                    }}
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
                    // simplifiedTransactions={generateSimplifiedTransactionsByCurrency(netExpenseBalanceMap, userId, friend._id)}
                    simplifiedTransactions={settlementLists}
                    settlementLists={settlementLists}
                    defaultSettleMode="net"
                    friends={[{ id: userId, name: 'You' }, { id: friend._id, name: friend.name, upiId: friend?.upiId }]}
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
                    receiverUpi={friend?.upiId}  // ensure your member has .upiid
                    note={"Settlement"}
                    currencyOptions={currencyOptions}
                    defaultCurrency={defaultCurrency}
                    preferredCurrencies={preferredCurrencies}
                // amount={}
                // bank={{ accountName: "Amit Sharma", accountNumber: "1234567890", ifsc: "HDFC0001234", bankName: "HDFC Bank" }}
                />
            )}
            {showLoanView && activeLoan && (
                <LoanModal
                    showModal={showLoanView}            // ✅ add this
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
                        await deleteLoanApi(activeLoan._id, userToken);
                        await fetchLoansForFriend(userId, friend._id);
                        setShowLoanView(false);
                    }}
                    onAfterChange={async () => {
                        await fetchLoansForFriend(userId, friend._id);
                    }}
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


            {/* Floating Add Button – shows only when list isn't empty */}
            {!loading && (
                <>
                    {/* Expenses FAB */}
                    {activeSection === "expenses" && expenses?.length > 0 && (
                        <button
                            onClick={() => {
                                logEvent('navigate', {
                                    fromScreen: 'friend_detail', toScreen: 'new-expense', source: 'fab'
                                });
                                navigate('/new-expense', { state: { friendId: id } })
                            }
                            }
                            aria-label="Add Expense"
                            className="fixed right-4 bottom-22 z-50 rounded-full bg-teal-500 hover:bg-teal-600 active:scale-95 transition text-[#EBF1D5] px-5 py-4 flex items-center gap-2"
                        >
                            <Plus size={18} />
                            <span className="text-sm font-semibold">Add Expense</span>
                        </button>
                    )}

                    {/* Loans FAB */}
                    {activeSection === "loans" && loans?.length > 0 && (
                        <button
                            onClick={() => {
                                logEvent('navigate', {
                                    fromScreen: 'friend_detail', toScreen: 'new-loan', source: 'fab'
                                });
                                navigate(`/new-loan`, { state: { friendId: friend._id } })
                            }
                            }
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
                context={paymentModal.context}                       // 'personal' | 'split'
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
