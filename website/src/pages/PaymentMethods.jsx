// src/pages/PaymentMethods.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    listPaymentMethods,
    createPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    setDefaultSend,
    setDefaultReceive,
    getBalances, // used in "View Balances"
    creditBalance,
    debitBalance,
    holdBalance,
    releaseBalance,
} from "../services/PaymentMethodService";
import { useAuth } from "../context/AuthContext";
import MainLayout from "../layouts/MainLayout";
import { ChevronLeft, Loader, Plus } from "lucide-react";
import PaymentMethodModal from "../components/PaymentMethodModal";
import PaymentMethodCard from "../components/PaymentMethodCard";
import PaymentMethodBalanceModal from "../components/PaymentMethodBalanceModal";
import { useNavigate } from "react-router-dom";
import { getAllCurrencyCodes, getSymbol, toCurrencyOptions } from "../utils/currencies"
import PullToRefresh from "pulltorefreshjs";
import { logEvent } from "../utils/analytics";
import SEO from "../components/SEO";


const PaymentMethods = () => {
    const { userToken, defaultCurrency, preferredCurrencies = [], paymentMethods, fetchPaymentMethods, loadingPaymentMethods } = useAuth() || {};
    const navigate = useNavigate();
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [filter, setFilter] = useState("all"); // all | send | receive | upi | bank | card | cash | wallet | other
    const [editing, setEditing] = useState(null); // paymentMethod being edited
    const [index, setIndex] = useState(null); // paymentMethod being edited
    const [balancesPeek, setBalancesPeek] = useState({}); // { [paymentMethodId]: { ...balances } }
    const currencyOptions = toCurrencyOptions(getAllCurrencyCodes());

    // Add Balance modal
    const [showAddBalance, setShowAddBalance] = useState(false);
    const [selectedPM, setSelectedPM] = useState(null);
    const scrollRef = useRef(null);
    const [refreshing, setRefreshing] = useState(false);
    console.log(paymentMethods);

    const doRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([fetchPaymentMethods(true)]);
        } finally {
            setRefreshing(false);
        }
    };
    useEffect(() => {
        if (!scrollRef.current) return;

        const options = {
            mainElement: scrollRef.current,
            onRefresh: doRefresh,
            distThreshold: 60,
            distMax: 80,
            distReload: 50,
            resistance: 2.5,
            // small instruction texts for pull/release; keep or remove as you like
            instructionsPullToRefresh: "",
            instructionsReleaseToRefresh: "",
            // hide the default refreshing text (we'll use iconRefreshing instead)
            instructionsRefreshing: "",
            // spinner shown while refreshing — Tailwind classes (animate-spin) will apply if Tailwind is loaded
            iconRefreshing: `
                <div class="flex flex-row justify-center w-full items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 animate-spin text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" stroke-opacity="0.15"></circle>
                    <path d="M22 12a10 10 0 0 0-10-10" stroke-linecap="round"></path>
                    </svg>
                </div>
            `,
            // keep your custom shouldPullToRefresh logic
            shouldPullToRefresh: () =>
                scrollRef.current && scrollRef.current.scrollTop === 0,
        };

        PullToRefresh.init(options);

        return () => {
            try { PullToRefresh.destroyAll(); } catch (e) { /* ignore */ }
        };
    }, [doRefresh]);



    const filtered = useMemo(() => {
        let list = [...paymentMethods];
        if (filter === "send") list = list.filter((a) => (a.capabilities || []).includes("send"));
        else if (filter === "receive") list = list.filter((a) => (a.capabilities || []).includes("receive"));
        else if (["upi", "bank", "card", "cash", "wallet", "other"].includes(filter))
            list = list.filter((a) => a.type === filter);

        return list.sort((a, b) => {
            // prioritize defaults on top
            const aScore = (a.isDefaultSend ? 2 : 0) + (a.isDefaultReceive ? 2 : 0);
            const bScore = (b.isDefaultSend ? 2 : 0) + (b.isDefaultReceive ? 2 : 0);
            return bScore - aScore;
        });
    }, [paymentMethods, filter]);

    // ---------- actions ----------
    const onSetDefault = async (paymentMethodId, mode) => {
        try {
            if (mode === "send") await setDefaultSend(paymentMethodId, userToken);
            else if (mode === "receive") await setDefaultReceive(paymentMethodId, userToken);
            else throw new Error("Invalid default mode");
            await fetchPaymentMethods();
        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to set default");
        }
    };

    // No dedicated /verify route; use PATCH to set status:"verified"
    const onVerify = async (paymentMethodId) => {
        try {
            await updatePaymentMethod(paymentMethodId, { status: "verified" }, userToken);
            await fetchPaymentMethods();
        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to verify payment account");
        }
    };

    const onDelete = async (paymentMethodId) => {
        if (!window.confirm("Delete this payment account? This cannot be undone.")) return;
        try {
            await deletePaymentMethod(paymentMethodId, userToken);
            await fetchPaymentMethods();
            setShowModal(false)
        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to delete payment account");
        }
    };

    const onSave = async (payload, paymentMethodId = null) => {
        setSubmitting(true);
        try {

            if (paymentMethodId) await updatePaymentMethod(paymentMethodId, payload, userToken);
            else await createPaymentMethod(payload, userToken);
            setShowModal(false);
            setEditing(null);
            await fetchPaymentMethods();
        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to save payment account");
        } finally {
            setSubmitting(false);
        }
    };

    const peekBalances = async (paymentMethodId) => {
        try {
            const data = await getBalances(paymentMethodId, userToken);
            setBalancesPeek((prev) => ({ ...prev, [paymentMethodId]: data || {} }));
        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to load balances");
        }
    };

    // --- Add Balance flow ---
    const onAddBalance = (pm) => {
        setSelectedPM(pm);
        logEvent('open_add_balance_modal', {
            screen: 'payment_accounts'
        })
        setShowAddBalance(true);
    };

    const submitAddBalance = async ({ action, currency, amountMajor, bucket }) => {
        if (!selectedPM?._id) throw new Error("No payment account selected");
        const bodyBase = {
            currency,
            amount: amountMajor
        };
        try {
            if (action === "credit") {
                await creditBalance(selectedPM._id, { ...bodyBase, bucket }, userToken);
            } else if (action === "debit") {
                await debitBalance(selectedPM._id, { ...bodyBase, bucket }, userToken);
            } else if (action === "hold") {
                await holdBalance(selectedPM._id, bodyBase, userToken);
            } else if (action === "release") {
                await releaseBalance(selectedPM._id, bodyBase, userToken);
            } else {
                throw new Error("Invalid action");
            }
            await peekBalances(selectedPM._id);
            await fetchPaymentMethods();
            setShowAddBalance(false);
            setSelectedPM(null);
        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to update balance");
        }
    };
    // ---------- ui ----------
    return (
        <MainLayout>
            <SEO
                title="Payment Accounts | Expensease"
                description="Manage your payment accounts in Expensease. Add bank accounts, UPI, cards, wallets, or cash methods for sending and receiving money."
                canonical="https://www.expensease.in/paymentAccounts"
                schema={{
                    "@context": "https://schema.org",
                    "@type": "WebPage",
                    "name": "Payment Accounts | Expensease",
                    "description": "Manage your payment accounts in Expensease. Add bank accounts, UPI, cards, wallets, or cash methods for sending and receiving money.",
                    "url": "https://www.expensease.in/paymentAccounts"
                }}
            />

            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <div className="flex flex-row gap-2">
                        <button onClick={() => {
                            logEvent('navigate', {
                                fromScreen: 'payment_accounts', toScreen: 'account', source: 'back'
                            })
                            navigate(`/account`)
                        }
                        }>
                            <ChevronLeft />
                        </button>
                        <h1 className="text-3xl font-bold capitalize">Payment Account</h1>
                    </div>
                </div>
                <div ref={scrollRef} className="flex flex-col flex-1 w-full overflow-y-auto pt-3 no-scrollbar scroll-touch gap-3 pb-[15px]">

                    {loadingPaymentMethods ? (
                        <div className="flex flex-col justify-center items-center flex-1 py-5">
                            <Loader />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-sm ">No payment accounts yet.</div>
                    ) : (
                        <ul className="space-y-3"><div className="flex w-full justify-end">
                            <button
                                onClick={() => {
                                    logEvent('open_add_payment_method_modal', {
                                        screen: 'payment_accounts',
                                    }
                                    )
                                    setEditing(null);
                                    setShowModal(true);
                                }}
                                aria-label="Add Payment Account"
                                className="z-50 rounded-sm bg-teal-500 hover:bg-teal-600 active:scale-95 transition text-[#EBF1D5] px-3 py-2 flex items-center gap-2"
                            >
                                <Plus size={18} />
                                <span className="text-sm font-semibold">Add Account</span>
                            </button>
                        </div>
                            {filtered.map((a, i) => (
                                <PaymentMethodCard
                                    key={a._id}
                                    paymentMethod={a}
                                    balancesPeek={balancesPeek}
                                    onPeekBalances={peekBalances}
                                    onSetDefault={onSetDefault}
                                    onVerify={onVerify}
                                    index={i}
                                    onEdit={(acc) => {
                                        setEditing(acc);
                                        setShowModal(true);
                                        setIndex(i)
                                    }}
                                    onAddBalance={() => onAddBalance(a)}
                                />
                            ))}
                        </ul>
                    )}
                </div>

                {/* add button */}


                {/* Create / Edit modal */}
                <PaymentMethodModal
                    show={showModal}
                    onClose={() => {
                        setShowModal(false);
                        setEditing(null);
                    }}
                    index={index}
                    editing={editing}
                    submitting={submitting}
                    initialValues={editing || undefined}
                    onSave={(payload) => onSave(payload, editing?._id || null)}
                    onDelete={onDelete}
                />

                {/* Add Balance bottom sheet */}
                <PaymentMethodBalanceModal
                    show={showAddBalance}
                    onClose={() => {
                        setShowAddBalance(false);
                        setSelectedPM(null);
                    }}
                    method={selectedPM}
                    defaultCurrency={defaultCurrency}
                    preferredCurrencies={preferredCurrencies}
                    currencyOptions={currencyOptions}
                    onSubmit={submitAddBalance}
                />
            </div>
        </MainLayout>
    );
};

export default PaymentMethods;