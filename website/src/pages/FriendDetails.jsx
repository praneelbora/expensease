import { useEffect, useMemo, useRef, useState } from "react";
import React, { Fragment } from 'react';
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import { getFriendDetails } from "../services/FriendService";
import { settleExpense, getFriendExpense } from "../services/ExpenseService";
import SettleModal from "../components/SettleModal";
import { ChevronLeft, Loader, Wallet, Plus } from "lucide-react";
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
    const [netBalance, setNetBalance] = useState(0);
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
    const [netExpenseBalanceMap, setNetExpenseBalanceMap] = useState({}); // new state


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
        setExpenses(expenseData);

        const net = calculateFriendBalanceByCurrency(expenseData, data.id, data.friend._id);
        setNetExpenseBalanceMap(net);

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

    const handleSettle = async ({ payerId, receiverId, amount, description }) => {
        await settleExpense({ payerId, receiverId, amount, description }, userToken);
        await fetchData();
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
    return (
        <MainLayout>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <div className="flex flex-row gap-2">
                        <button onClick={() => {
                            logEvent('back', {
                                screen: 'friend_detail', to: 'friends'
                            })
                            navigate(`/friends`)
                        }
                        }>
                            <ChevronLeft />
                        </button>
                        <h1 className={`${friend?.name ? 'text-[#EBF1D5]' : 'text-[#121212]'} text-3xl font-bold capitalize`}>{friend?.name ? friend?.name : "Loading"}</h1>
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
                    <div className="flex flex-col flex-1 w-full overflow-y-auto pt-1 no-scrollbar gap-3">

                        {/* ---- LOANS SECTION ---- */}
                        {activeSection === "loans" && (<>

                            {loans.length !== 0 && (
                                <div className="pt-2">
                                    <div className="mb-3">
                                        <p className="text-sm text-gray-400">Net Loan Balance</p>

                                        {/* Per-currency lines */}
                                        {Object.keys(netLoanBalanceMap || {}).length > 0 ? (
                                            <div className="flex flex-col gap-1">
                                                {Object.entries(netLoanBalanceMap).map(([code, amt]) => {
                                                    const sym = getSymbol("en-IN", code);
                                                    const d = currencyDigits(code);
                                                    const cls = amt > 0 ? "text-teal-500" : amt < 0 ? "text-red-400" : "text-white";
                                                    return (
                                                        <p key={code} className={`text-2xl font-semibold ${cls}`}>
                                                            {amt > 0 ? "they owe you" : amt < 0 ? "you owe them" : "All Settled"}{" "}
                                                            {sym} {Math.abs(amt).toFixed(d)}
                                                        </p>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-2xl font-semibold text-white">All Settled</p>
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
                                                    screen: 'friend_detail', to: 'add_loan', source: 'cta'
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
                                        const sym = getSymbol("en-IN", loanCode);
                                        const d = currencyDigits(loanCode);

                                        // outstanding for this loan
                                        const { code: outCode, amount: outstanding } = getOutstandingByCurrency(loan); // <- use your currency-aware helper
                                        const outSym = getSymbol("en-IN", outCode);
                                        const outD = currencyDigits(outCode);

                                        const youAreLender = loan.lenderId?._id === userId;
                                        const dirText = youAreLender ? "You lent" : "You borrowed";

                                        return (
                                            <div
                                                key={loan._id}
                                                className={`border ${outstanding > 0 ? "border-teal-500" : "border-[#333]"} rounded-lg p-3 bg-[#171717] flex flex-col gap-1 cursor-pointer`}
                                                onClick={() => {
                                                    logEvent("open_modal_loan", { screen: "friend_detail" });
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
                                                            const rSym = getSymbol("en-IN", rCode);
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
                                            <p className="text-sm text-gray-400">Net Expenses Balance</p>

                                            {/* Per-currency lines */}
                                            {Object.keys(netExpenseBalanceMap || {}).length > 0 ? (
                                                <div className="flex flex-col gap-1">
                                                    {Object.entries(netExpenseBalanceMap).map(([code, amt]) => {
                                                        const sym = getSymbol("en-IN", code);
                                                        const d = currencyDigits(code);
                                                        const cls = amt > 0 ? "text-teal-500" : amt < 0 ? "text-red-400" : "text-white";
                                                        return (
                                                            <p key={code} className={`text-2xl font-semibold ${cls}`}>
                                                                {amt > 0 ? "you are owed" : amt < 0 ? "you owe" : "All Settled"}{" "}
                                                                {sym} {Math.abs(amt).toFixed(d)}
                                                            </p>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <p className="text-2xl font-semibold text-white">All Settled</p>
                                            )}
                                        </div>

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
                                                                logEvent("open_modal_payment", { screen: "friend_detail" });
                                                                setShowPaymentModal(true);
                                                            }}
                                                            className="bg-teal-600 text-white px-4 py-2 rounded-md text-sm"
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
                                                                    logEvent("navigate", { screen: "friend_detail", to: "account_upi" });
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
                                                            logEvent("open_modal_settle", { screen: "friend_detail" });
                                                            setSettleType("full");
                                                            setShowSettleModal(true);
                                                        }}
                                                        className="bg-teal-600 text-white px-4 py-2 rounded-md text-sm"
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
                                                        screen: 'friend_detail', to: 'add_expense', source: 'cta'
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
                                        <h3 className="text-lg font-semibold mb-2">Shared Expenses</h3>
                                        {expenses
                                            ?.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                                            ?.map((exp) => (
                                                <ExpenseItem
                                                    key={exp._id}
                                                    expense={exp}
                                                    onClick={setShowModal}
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
                    simplifiedTransactions={generateSimplifiedTransactionsByCurrency(netBalance, userId, friend._id)}
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
                                    screen: 'friend_detail', to: 'add_expense', source: 'fab'
                                });
                                navigate('/new-expense', { state: { friendId: id } })
                            }
                            }
                            aria-label="Add Expense"
                            className="fixed right-4 bottom-22 z-50 rounded-full bg-teal-500 hover:bg-teal-600 active:scale-95 transition text-white px-5 py-4 flex items-center gap-2"
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
                                    screen: 'friend_detail', to: 'add_loan', source: 'fab'
                                });
                                navigate(`/new-loan`, { state: { friendId: friend._id } })
                            }
                            }
                            aria-label="Add a Loan"
                            className="fixed right-4 bottom-22 z-50 rounded-full bg-teal-500 hover:bg-teal-600 active:scale-95 transition text-white px-5 py-4 flex items-center gap-2"
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
