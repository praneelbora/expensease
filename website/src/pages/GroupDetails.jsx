import { useEffect, useRef, useState } from "react";
import React, { Fragment } from 'react';
import { useNavigate, useParams } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import ExpenseModal from "../components/ExpenseModal"; // Adjust import path
import { useAuth } from "../context/AuthContext";
import SettleModal from '../components/SettleModal';
import { getGroupDetails, getGroupExpenses } from '../services/GroupService';
import ExpenseItem from "../components/ExpenseItem"; // Adjust import path
import PullToRefresh from "pulltorefreshjs";
import { getAllCurrencyCodes, getSymbol, toCurrencyOptions } from "../utils/currencies"
import Cookies from 'js-cookie';
import {
    Users,
    Wallet,
    Share2,
    List,
    User,
    Plus,
    Eye,
    EyeClosed,
    Settings,
    ChevronLeft,
    Loader
} from "lucide-react";
import { settleExpense } from '../services/ExpenseService';
import { logEvent } from "../utils/analytics";

const GroupDetails = () => {
    const { logout, user, userToken, defaultCurrency, preferredCurrencies, categories, paymentMethods } = useAuth() || {};

    const [dc, setDc] = useState(defaultCurrency || '');

    const [showDefaultModal, setShowDefaultModal] = useState(false);

    const [dcStatus, setDcStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
    const [dcError, setDcError] = useState('');
    const [allCodes, setAllCodes] = useState([]);
    useEffect(() => { setAllCodes(getAllCurrencyCodes()); }, []);
    useEffect(() => { setDc(defaultCurrency || ''); }, [defaultCurrency]);
    const currencyOptions = toCurrencyOptions(allCodes); // e.g., [{value:'INR', label:'₹ INR'}, ...]


    const navigate = useNavigate()
    const { id } = useParams();
    const [group, setGroup] = useState(null);
    const [groupExpenses, setGroupExpenses] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingExpenses, setLoadingExpenses] = useState(true);
    const [userId, setUserId] = useState();
    const [selectedMember, setSelectedMember] = useState(null);
    const [showMembers, setShowMembers] = useState(false);
    const [showSettleModal, setShowSettleModal] = useState(false);
    const [settleFrom, setSettleFrom] = useState('');
    const [settleTo, setSettleTo] = useState('');
    const [settleAmount, setSettleAmount] = useState('');
    const [copied, setCopied] = useState(false);
    const [copiedTop, setCopiedTop] = useState(false);
    const [adminEnforcedPrivacy, setAdminEnforcedPrivacy] = useState(false);

    const handleSettle = async ({ payerId, receiverId, amount, description, currency }) => {
        try {
            await settleExpense({ payerId, receiverId, amount, description, groupId: id, currency }, userToken);
            await getGroupExpenses(id, userToken);
            console.log("Settlement recorded successfully!");
            await fetchGroupExpenses()
        } catch (err) {
            console.log(err.message || "Could not settle the amount.");
        }
    };


    // Filtered expenses based on the selected member
    const filteredExpenses = selectedMember
        ? groupExpenses.filter(exp =>
            exp.splits.some(s =>
                s.friendId &&
                s.friendId._id === selectedMember &&
                (s.payAmount > 0 || s.oweAmount > 0)
            )
        )
        : groupExpenses;

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

    const getSettleDirectionText = (splits) => {
        const payer = splits.find(s => s.paying && s.payAmount > 0);
        const receiver = splits.find(s => s.owing && s.oweAmount > 0);

        if (!payer || !receiver) return "Invalid settlement";

        const payerName = payer.friendId._id === userId ? "You" : payer.friendId.name;
        const receiverName = receiver.friendId._id === userId ? "you" : receiver.friendId.name;

        return `${payerName} paid ${receiverName}`;
    };



    const getOweInfo = (splits) => {
        const userSplit = splits.find(s => s.friendId && s.friendId._id === userId);

        if (!userSplit) return null;

        const { oweAmount = 0, payAmount = 0 } = userSplit;
        const net = payAmount - oweAmount;

        if (net > 0) {
            return { text: 'you lent', amount: `${net.toFixed(2)}` };
        } else if (net < 0) {
            return { text: 'you borrowed', amount: `${Math.abs(net).toFixed(2)}` };
        } else {
            return null;
        }
    };

    const fetchGroup = async () => {
        try {
            const data = await getGroupDetails(id, userToken)
            setGroup(data);
            setAdminEnforcedPrivacy(data?.settings?.enforcePrivacy || false);
        } catch (error) {
            // console.error("Group Details Page - Error loading group:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchGroupExpenses = async () => {
        try {
            setLoadingExpenses(true)
            const data = await getGroupExpenses(id, userToken);
            const allExpenses = data.expenses || [];
            const adminPrivacy = data.group?.settings?.enforcePrivacy ?? false;
            const currentUserId = data.id;
            // Filter based on privacy setting
            const filteredExpenses = allExpenses.filter(exp =>
                !adminPrivacy || exp.splits.some(split => (split.friendId?._id === currentUserId && (split.paying || split.owing)))
            );
            setGroupExpenses(filteredExpenses);
            setUserId(currentUserId); // assuming this is declared in useState

        } catch (error) {
            console.error("Error fetching group expenses:", error);
        } finally {
            setLoadingExpenses(false)
        }
    };


    // replace your calculateDebt with this
    const calculateDebt = (groupExpenses, members) => {
        const totalDebt = {}; // memberId -> { [currency]: netAmount }

        // init
        members.forEach(m => { totalDebt[m._id] = {}; });

        groupExpenses.forEach(exp => {
            const code = exp.currency || "INR";
            exp.splits.forEach(split => {
                const memberId = split.friendId._id;
                const curMap = totalDebt[memberId];
                if (curMap[code] == null) curMap[code] = 0;

                if (split.payAmount > 0) curMap[code] += split.payAmount; // paid → is owed
                if (split.oweAmount > 0) curMap[code] -= split.oweAmount; // owes → negative
            });
        });
        return totalDebt;
    };

    const scrollRef = useRef(null);
    const [refreshing, setRefreshing] = useState(false);

    const doRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([fetchGroup(), fetchGroupExpenses()]);
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

    const simplifyDebts = (totalDebt, members, locale = "en-IN") => {
        const transactions = [];
        const currencies = new Set();

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

            for (const memberId in totalDebt) {
                const amt = round(totalDebt[memberId]?.[code] || 0);
                if (amt > 0) owed.push({ memberId, amount: amt });
                else if (amt < 0) owe.push({ memberId, amount: Math.abs(amt) });
            }

            let i = 0, j = 0;
            // safety guard to avoid any unexpected infinite loop
            let guard = 0, guardMax = (owe.length + owed.length + 1) * 5000;

            while (i < owe.length && j < owed.length) {
                if (guard++ > guardMax) { console.warn("simplifyDebts: guard break", code); break; }

                const transfer = Math.min(owe[i].amount, owed[j].amount);
                if (transfer >= minUnit) {
                    transactions.push({
                        from: owe[i].memberId,
                        to: owed[j].memberId,
                        amount: round(transfer),
                        currency: code,
                    });
                }

                // 🔧 subtract the transfer and round
                owe[i].amount = round(owe[i].amount - transfer);
                owed[j].amount = round(owed[j].amount - transfer);

                // clamp tiny residuals to zero so pointers can move
                if (Math.abs(owe[i].amount) < minUnit) owe[i].amount = 0;
                if (Math.abs(owed[j].amount) < minUnit) owed[j].amount = 0;

                if (owe[i].amount === 0) i++;
                if (owed[j].amount === 0) j++;
            }
        });

        return transactions;
    };

    const getMemberName = (memberId) => {
        if (memberId == userId) return "You"
        const member = group.members.find(m => m._id === memberId);
        return member ? member.name : "Unknown";
    };
    const [totalDebt, setTotalDebt] = useState(null);
    const [simplifiedTransactions, setSimplifiedTransactions] = useState(null);

    useEffect(() => {
        if (group && group?.members && groupExpenses?.length > 0) {
            setTotalDebt(calculateDebt(groupExpenses, group.members));
        }
    }, [group, groupExpenses]);

    useEffect(() => {
        if (totalDebt) {
            const tx = simplifyDebts(totalDebt, group.members);
            if (group?.settings?.enforcePrivacy) {
                setSimplifiedTransactions(tx.filter(t => t.from === userId || t.to === userId));
            } else {
                setSimplifiedTransactions(tx);
            }
        }
    }, [totalDebt, group?.settings?.enforcePrivacy, userId]);
    useEffect(() => {
        fetchGroup();
        fetchGroupExpenses();
    }, [id]);
    const round = (val) => Math.round(val * 100) / 100;

    return (
        <MainLayout groupId={id}>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <div className="flex flex-row gap-2">
                        <button onClick={() => {
                            logEvent('back', {
                                screen: 'group_detail', to: 'groups'
                            })
                            navigate(`/groups`)
                        }}>
                            <ChevronLeft />
                        </button>
                        <h1 className={`${group?.name ? 'text-[#EBF1D5]' : 'text-[#121212]'} text-3xl font-bold capitalize`}>{group?.name ? group?.name : "Loading"}</h1>
                    </div>
                    {group && <div className="flex flex-col items-end">
                        <div className="flex flex-row items-end">
                            <button
                                className="flex flex-col items-center justify-center z-10 w-8 h-8 rounded-full shadow-md text-2xl"
                                onClick={() => {
                                    const message1 = `Use this code: ${group.code}

Or just click the link below to join directly:
${import.meta.env.VITE_FRONTEND_URL}/groups/join/${group.code}`;
                                    navigator.clipboard.writeText(message1);
                                    logEvent('invite_group_copy',
                                        { screen: 'group_detail', source: 'header' }
                                    );
                                    setCopiedTop(true);
                                    setTimeout(() => setCopiedTop(false), 2000); // hide after 2 seconds
                                    if (navigator.share) {
                                        navigator
                                            .share({
                                                title: "Join my group on Expensease",
                                                text: message1,
                                                url: `${import.meta.env.VITE_FRONTEND_URL}/groups/join/${group.code}`,
                                            })
                                            .catch((err) => console.error("Sharing failed", err));
                                    }


                                }}
                            >
                                <Share2 strokeWidth={2} size={20} />
                            </button>
                            <button
                                className="flex flex-col items-center justify-center z-10 w-8 h-8 rounded-full shadow-md text-2xl"
                                onClick={() => {
                                    logEvent('navigate',
                                        { screen: 'group_detail', to: 'group_setting', source: 'header' }
                                    );
                                    navigate(`/groups/settings/${group._id}`)
                                }} >
                                <Settings strokeWidth={2} size={20} />
                            </button>


                        </div>
                        {copiedTop && (
                            <p className="text-gray-500 text-[9px] font-semibold transition-opacity">
                                Copied to clipboard!
                            </p>
                        )}
                    </div>}
                </div>
                <div
                    ref={scrollRef}
                    className="flex flex-col flex-1 w-full overflow-y-auto pt-2 no-scrollbar scroll-touch"
                >
                    {loading ? (
                        <div className="flex flex-col justify-center items-center flex-1 py-5">
                            <Loader />
                        </div>
                    ) : !group ? (
                        <p>Group not found</p>
                    ) : (group.members.length == 1 && groupExpenses.length == 0) ? (
                        <div className="flex flex-1 flex-col justify-center gap-2">
                            {group.members.length === 1 && (
                                <div className="flex flex-col items-center justify-center p-4 rounded-lg text-center space-y-4 bg-[#1f1f1f]">
                                    <h2 className="text-2xl font-semibold">No Members Yet</h2>
                                    <p className="text-sm text-gray-[#888] max-w-sm">
                                        Invite friends to get started.
                                    </p>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => {
                                                const message1 = `Use this code: ${group.code}

Or just click the link below to join directly:
${import.meta.env.VITE_FRONTEND_URL}/groups/join/${group.code}`;
                                                navigator.clipboard.writeText(message1);
                                                setCopied(true);
                                                logEvent('invite_group_copy',
                                                    { screen: 'group_detail', source: 'header' }
                                                );
                                                setTimeout(() => setCopied(false), 2000); // hide a
                                                if (navigator.share) {
                                                    navigator
                                                        .share({
                                                            title: "Join my group on Expensease",
                                                            text: message1,
                                                            url: `${import.meta.env.VITE_FRONTEND_URL}/groups/join/${group.code}`,
                                                        })
                                                        .catch((err) => console.error("Sharing failed", err));
                                                }
                                            }}
                                            className="border border-teal-500 text-teal-500 px-6 py-2 rounded-lg hover:bg-teal-900/30 transition flex items-center gap-2"
                                        >
                                            <Share2 size={18} /> Share Invite
                                        </button>
                                    </div>

                                    {copied && (
                                        <p className="text-[11px] text-teal-300">Invite copied to clipboard!</p>
                                    )}
                                </div>
                            )}

                            {groupExpenses.length == 0 && !loadingExpenses && <div className="flex flex-col items-center justify-center p-4 rounded-lg  text-center space-y-3 bg-[#1f1f1f]">
                                <h2 className="text-2xl font-semibold">No Expenses Yet</h2>
                                <p className="text-sm text-gray-[#888] max-w-sm">
                                    You haven’t added any expenses yet. Start by adding your first one to see stats and insights.
                                </p>
                                <button
                                    onClick={() => {
                                        logEvent('navigate',
                                            { screen: 'group_detail', to: 'add_expense', source: 'cta' }
                                        );
                                        navigate('/new-expense', { state: { groupId: id } })
                                    }}
                                    className="bg-teal-500 text-black px-4 py-2 rounded hover:bg-teal-400 transition"
                                >
                                    Add Expense
                                </button>
                            </div>}
                        </div>
                    ) : (
                        <div className="flex flex-1 flex-col gap-y-3 gap-x-4">

                            {/* Toggle Button */}
                            <div className="flex flex-col gap-2">
                                {/* Header Row */}
                                <div className="flex justify-between items-center">
                                    <p className="text-[13px] text-teal-500 uppercase">Members</p>
                                    <button
                                        onClick={() => setShowMembers((prev) => !prev)}
                                        className="text-sm rounded-full uppercase text-teal-500"
                                    >
                                        {showMembers ? <Eye /> : <EyeClosed />}
                                    </button>
                                </div>

                                {/* Members (collapsible) */}
                                {showMembers && (
                                    <div className="flex flex-wrap gap-2">
                                        {group.members.map((member) => (
                                            <button
                                                key={member._id}
                                                onClick={() =>
                                                    selectedMember === member._id
                                                        ? setSelectedMember(null)
                                                        : setSelectedMember(member._id)
                                                }
                                                className={`px-3 py-1 rounded-full font-semibold border text-sm capitalize transition ${selectedMember === member._id
                                                    ? 'bg-teal-300 border-teal-300 text-black'
                                                    : 'text-[#EBF1D5] border-[#EBF1D5]'
                                                    }`}
                                            >
                                                {member.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <hr />

                            {/* Debt Summary */}
                            {groupExpenses && groupExpenses.length > 0 && simplifiedTransactions?.length > 0 && <> <div className="flex flex-col">
                                <div className="flex justify-between items-center">
                                    <p className="text-[13px] text-teal-500 uppercase">Debt Summary</p>
                                    <button
                                        onClick={() => {
                                            logEvent('open_modal_settle', {
                                                screen: 'group_detail'
                                            })
                                            setShowSettleModal(true)
                                        }}
                                        className="text-sm border border-teal-500 rounded-md px-2 py-0.5 uppercase text-teal-500"
                                    >
                                        Settle
                                    </button>
                                </div>
                                {simplifiedTransactions?.map((transaction, index) => {
                                    const sym = getSymbol("en-IN", transaction.currency);
                                    const name1 = getMemberName(transaction.from);
                                    const name2 = getMemberName(transaction.to);
                                    const amt = transaction.amount.toFixed(2);

                                    const isYouPaying = name1 === "You";
                                    const isYouReceiving = name2 === "You";
                                    const isYou = name1 === "You" || name2 === "You";
                                    const amountColor = isYouPaying
                                        ? "text-red-500"
                                        : isYouReceiving
                                            ? "text-green-500"
                                            : ""; // or leave blank for no color
                                    const textColor = isYou ? "" : "text-[#81827C]"
                                    return (
                                        <div key={index} className={textColor}>
                                            {`${name1} ${isYouPaying ? "owe" : "owes"} ${name2} `}
                                            <span className={amountColor}>{getSymbol('en-IN', transaction?.currency)} {amt}</span>
                                        </div>
                                    );
                                })}

                            </div>

                                <hr /></>}

                            {/* Expenses */}
                            <div className="flex flex-1 flex-col">
                                <div className="flex flex-row justify-between">
                                    <p className="text-[13px]
                                          text-teal-500 uppercase">Expenses</p>
                                    <button
                                        className="flex flex-col items-center justify-center z-10 w-8 h-8 rounded-full shadow-md text-2xl"
                                        onClick={() => {
                                            logEvent('navigate', {
                                                screen: 'group_detail', to: 'add_expense', source: 'plus'
                                            })
                                            navigate('/new-expense', { state: { groupId: id } })
                                        }}>
                                        <Plus className="text-teal-500" size={20} />
                                    </button>
                                </div>
                                {filteredExpenses.length>0 && <ul className="flex flex-col w-full gap-2 pb-[75px]">
                                    {filteredExpenses?.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                                        .map((exp) => (
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
                                </ul>}
                                {groupExpenses.length === 0 && !loadingExpenses && (<div className="flex flex-col h-full flex-1 justify-center items-center">
                                    <div className="flex flex-col items-center justify-center p-4 rounded-lg  text-center space-y-3 bg-[#1f1f1f]">
                                <h2 className="text-2xl font-semibold">No Expenses Yet</h2>
                                <p className="text-sm text-gray-[#888] max-w-sm">
                                    You haven’t added any expenses yet. Start by adding your first one to see stats and insights.
                                </p>
                                <button
                                    onClick={() => {
                                        logEvent('navigate',
                                            { screen: 'group_detail', to: 'add_expense', source: 'cta' }
                                        );
                                        navigate('/new-expense', { state: { groupId: id } })
                                    }}
                                    className="bg-teal-500 text-black px-4 py-2 rounded hover:bg-teal-400 transition"
                                >
                                    Add Expense
                                </button>
                            </div>
                            </div>
                            )}
                            </div>

                        </div>
                    )}
                </div>
            </div>


            {showModal && (
                <ExpenseModal
                    showModal={showModal}
                    fetchExpenses={fetchGroupExpenses}
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
                    group={group}
                    simplifiedTransactions={simplifiedTransactions}
                    onSubmit={handleSettle}
                    userId={userId}
                    currencyOptions={currencyOptions}
                    defaultCurrency={defaultCurrency}
                    preferredCurrencies={preferredCurrencies}
                />

            )}
            {!loading && (
                <>
                    {/* Expenses FAB */}
                    {groupExpenses?.length > 0 && (
                        <button
                            onClick={() => {
                                logEvent('navigate', {
                                    screen: 'group_detail', to: 'add_expense', source: 'fab'
                                })
                                navigate('/new-expense', { state: { groupId: id } })
                            }}

                            aria-label="Add Expense"
                            className="fixed right-4 bottom-22 z-50 rounded-full bg-teal-500 hover:bg-teal-600 active:scale-95 transition 
                           text-white px-5 py-4 flex items-center gap-2"
                        >
                            <Plus size={18} />
                            <span className="text-sm font-semibold">Add Expense</span>
                        </button>
                    )}


                </>
            )}

        </MainLayout>
    );
};

export default GroupDetails;
