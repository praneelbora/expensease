import { useEffect, useRef, useState } from "react";
import React, { Fragment } from 'react';
import { useParams, useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import { getFriendDetails } from "../services/FriendService";
import { settleExpense, getFriendExpense } from "../services/ExpenseService";
import SettleModal from "../components/SettleModal";
import { ChevronLeft, Loader, Wallet, Plus } from "lucide-react";

import { useAuth } from "../context/AuthContext";
import ExpenseModal from "../components/ExpenseModal"; // Adjust import path

import ExpenseItem from "../components/ExpenseItem"; // Adjust import path
import {
    getLoans,
    addRepayment as addLoanRepayment,
    closeLoan as closeLoanApi,
} from "../services/LoanService";
import LoanRepayModal from "../components/LoanRepayModal";
import PullToRefresh from "pulltorefreshjs";

const FriendDetails = () => {
    const { userToken } = useAuth();
    const { id } = useParams();
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
    const [activeSection, setActiveSection] = useState("expenses"); // 'loans' | 'expenses'

    const [loans, setLoans] = useState([]);
    const [netLoanBalance, setNetLoanBalance] = useState(0);
    // repayment modal
    const [showLoanModal, setShowLoanModal] = useState(false);
    const [activeLoan, setActiveLoan] = useState(null);
    const [repayAmount, setRepayAmount] = useState("");
    const [repayNote, setRepayNote] = useState("");

    // state you already have (or add)
    const [showRepayModal, setShowRepayModal] = useState(false);

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

    const generateSimplifiedTransaction = (netBalance, userId, friendId) => {
        if (netBalance === 0) return [];

        const from = netBalance < 0 ? userId : friendId;
        const to = netBalance < 0 ? friendId : userId;
        const amount = Math.abs(netBalance);

        return [{ from, to, amount }];
    };

    const getOutstanding = (loan) => {
        const paid = (loan.repayments || []).reduce((s, r) => s + (r.amount || 0), 0);
        return Math.max(0, (loan.principal || 0) - paid);
    };

    // +ve => friend owes you (you lent)
    // -ve => you owe friend (you borrowed)
    const computeNetLoanBalance = (friendId, userId, friendLoans) => {
        let net = 0;
        for (const loan of friendLoans) {
            const outstanding = getOutstanding(loan);
            if (outstanding === 0) continue;
            const youAreLender = loan.lenderId?._id?.toString?.() === userId;
            const friendIsBorrower = loan.borrowerId?._id?.toString?.() === friendId;
            const youAreBorrower = loan.borrowerId?._id?.toString?.() === userId;
            const friendIsLender = loan.lenderId?._id?.toString?.() === friendId;

            if (youAreLender && friendIsBorrower) net += outstanding;   // friend owes you
            if (youAreBorrower && friendIsLender) net -= outstanding;   // you owe friend
        }
        return Math.round(net * 100) / 100;
    };

    const fetchLoansForFriend = async (meId, frId) => {
        setLoanLoading(true);
        try {
            // fetch all your loans and filter by this friend
            const res = await getLoans(userToken, { role: "all" });
            const all = res?.loans || res || [];
            const friendLoans = all.filter(l =>
                (l.lenderId?._id === meId && l.borrowerId?._id === frId) ||
                (l.lenderId?._id === frId && l.borrowerId?._id === meId)
            );
            setLoans(friendLoans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));

            const nl = computeNetLoanBalance(frId, meId, friendLoans);
            setNetLoanBalance(nl);
        } catch (e) {
            console.error("Failed to fetch loans", e);
        } finally {
            setLoanLoading(false);
        }
    };

    const fetchData = async () => {
        const data = await getFriendDetails(id, userToken);
        setFriend(data.friend);
        setUserId(data.id);

        const expenseData = await getFriendExpense(id, userToken);
        setExpenses(expenseData);

        const net = calculateFriendBalance(expenseData, data.id, data.friend._id);
        setNetBalance(net);

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
    const openRepay = (loan) => {
        setActiveLoan(loan);
        setRepayAmount("");
        setRepayNote("");
        setShowRepayModal(true);
    };

    const submitRepayment = async () => {
        if (!activeLoan || !(Number(repayAmount) > 0)) return;
        try {
            await addLoanRepayment(activeLoan._id, { amount: Number(repayAmount), note: repayNote }, userToken);
            setShowLoanModal(false);
            await fetchLoansForFriend(userId, friend._id);
        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to add repayment");
        }
    };

    const closeLoan = async (loan) => {
        try {
            await closeLoanApi(loan._id, {}, userToken);
            await fetchLoansForFriend(userId, friend._id);
        } catch (e) {
            console.error(e);
            alert(e.message || "Failed to close loan");
        }
    };

    const [simplifiedTransactions, setSimplifiedTransactions] = useState(null);

    const calculateDebt = (expenses, friend) => {
        const totalDebt = {};

        // Initialize all members' total debts to 0
        // members.forEach(member => {
        //     totalDebt[member._id] = 0;
        // });
        // Calculate the total amount each member owes or is owed
        expenses.forEach(exp => {
            exp.splits.forEach(split => {
                const { friendId, oweAmount, payAmount } = split;
                const memberId = friendId._id;
                if (Number.isNaN(totalDebt[memberId])) {
                    totalDebt[memberId] = 0;
                }

                totalDebt[memberId] = 0
                if (payAmount > 0) {
                    // This person paid, so they are owed money
                    totalDebt[memberId] += payAmount;
                }

                if (oweAmount > 0) {
                    // This person owes money, so they have a negative debt
                    totalDebt[memberId] -= oweAmount;
                }
            });
        });
        return totalDebt;
    };
    const handleSettle = async ({ payerId, receiverId, amount, description }) => {
        await settleExpense({ payerId, receiverId, amount, description }, userToken);
        await fetchData();
    };

    const calculateFriendBalance = (expenses, userId, friendId) => {
        let balance = 0;

        const filteredExpenses = expenses.filter(exp => {
            let userIsPaying = false;
            let friendIsPaying = false;
            let userIsOwing = false;
            let friendIsOwing = false;

            exp.splits.forEach(split => {
                const id = split.friendId?._id?.toString();
                if (id === userId) {
                    if (split.paying) userIsPaying = true;
                    if (split.owing) userIsOwing = true;
                } else if (id === friendId) {
                    if (split.paying) friendIsPaying = true;
                    if (split.owing) friendIsOwing = true;
                }
            });

            const oneIsPaying = userIsPaying || friendIsPaying;
            const otherIsOwing = (userIsPaying && friendIsOwing) || (friendIsPaying && userIsOwing);

            return oneIsPaying && otherIsOwing;
        });
        filteredExpenses.forEach(exp => {
            exp.splits.forEach(split => {
                if (split?.friendId?._id?.toString() === friendId) {
                    if (split.owing) {
                        balance += round(split.oweAmount) || 0;
                    }
                    if (split.paying) {
                        balance -= round(split.payAmount) || 0;
                    }
                }
            });
        });
        // filteredExpenses.forEach(exp => {
        //     exp.splits.forEach(split => {
        //         const id = split.friendId?._id?.toString();
        //         if (id === userId) {
        //             if (split.owing) balance -= split.oweAmount || 0;
        //             if (split.paying) balance += split.payAmount || 0;
        //         } else if (id === friendId) {
        //             if (split.owing) balance += split.oweAmount || 0;
        //             if (split.paying) balance -= split.payAmount || 0;
        //         }
        //     });
        // });



        return Math.round(balance * 100) / 100; // rounded to 2 decimals
    };

    useEffect(() => {
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
            return { text: 'lent', amount: ` ₹${net.toFixed(2)}` };
        } else if (net < 0) {
            return { text: 'borrowed', amount: ` ₹${Math.abs(net).toFixed(2)}` };
        } else {
            return null;
        }
    };
    return (
        <MainLayout>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <div className="flex flex-row gap-2">
                        <button onClick={() => navigate(`/friends`)}>
                            <ChevronLeft />
                        </button>
                        <h1 className={`${friend?.name ? 'text-[#EBF1D5]' : 'text-[#121212]'} text-3xl font-bold capitalize`}>{friend?.name ? friend?.name : "Loading"}</h1>
                    </div>
                </div>
                <div ref={scrollRef} className="flex flex-col flex-1 w-full overflow-y-auto pt-3 no-scrollbar scroll-touch gap-3">
                    <div className="w-full flex justify-center">
                        <div className="inline-flex border border-[#EBF1D5] rounded-full p-1 bg-[#1f1f1f]">
                            <button
                                onClick={() => setActiveSection("expenses")}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeSection === "expenses"
                                    ? "bg-[#EBF1D5] text-[#121212]"
                                    : "text-[#EBF1D5] hover:bg-[#2a2a2a]"
                                    }`}
                            >
                                Expenses
                            </button>
                            <button
                                onClick={() => setActiveSection("loans")}
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

                            {loans.length !== 0 && <div className="pt-2">
                                {/* Net Loan Balance */}
                                <div className="mb-3">
                                    <p className="text-sm text-gray-400">Net Loan Balance</p>
                                    <p
                                        className={`text-2xl font-semibold ${netLoanBalance > 0
                                            ? "text-teal-500"
                                            : netLoanBalance < 0
                                                ? "text-red-400"
                                                : "text-white"
                                            }`}
                                    >
                                        {netLoanBalance > 0
                                            ? "they owe you"
                                            : netLoanBalance < 0
                                                ? "you owe them"
                                                : "All Settled"}{" "}
                                        ₹{Math.abs(netLoanBalance).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                            }




                            {loanLoading ? (
                                <div className="flex items-center gap-2 text-sm text-[#a0a0a0]">
                                    <Loader className="animate-spin" size={16} /> Loading loans…
                                </div>
                            ) : loans.length === 0 ? (
                                <div className="flex flex-1 flex-col justify-center">
                                    <div className="flex flex-col items-center justify-center p-4 rounded-lg  text-center space-y-4 bg-[#1f1f1f]">
                                        <h2 className="text-2xl font-semibold">No Loans Yet</h2>
                                        <p className="text-sm text-gray-400 max-w-sm">
                                            You haven’t added any loans yet. Start by adding your first one to see stats and insights.
                                        </p>
                                        <button
                                            onClick={() => navigate(`/new-loan`, { state: { friendId: friend._id } })}
                                            className="bg-teal-500 text-white px-6 py-2 rounded-lg hover:bg-teal-600 transition"
                                        >
                                            Create Loan
                                        </button>
                                    </div></div>

                            ) : (
                                <div className="flex flex-col gap-2">
                                    {loans.map((loan) => {
                                        const outstanding = getOutstanding(loan);
                                        const youAreLender = loan.lenderId?._id === userId;
                                        const dirText = youAreLender ? "You lent" : "You borrowed";
                                        return (
                                            <div
                                                key={loan._id}
                                                className="border border-[#333] rounded-lg p-3 bg-[#171717] flex flex-col gap-1"
                                            >
                                                <div className="flex justify-between items-center">
                                                    <div className="text-sm">
                                                        <div className="font-semibold">
                                                            {dirText} ₹{loan.principal?.toFixed(2)}{" "}
                                                            {youAreLender ? "to" : "from"} {friend?.name}
                                                        </div>
                                                        <div className="text-[#a0a0a0]">
                                                            Outstanding: ₹{outstanding.toFixed(2)} • Status: {loan.status}
                                                        </div>
                                                        {loan.description && (
                                                            <div className="text-[#a0a0a0] italic">{loan.description}</div>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        {outstanding != 0 ? <button
                                                            onClick={() => openRepay(loan)}
                                                            className="px-3 py-1 rounded-md border border-[#55554f] text-sm hover:bg-[#222]"
                                                        >
                                                            Add Repayment
                                                        </button> :
                                                            <button
                                                                onClick={() => closeLoan(loan)}
                                                                disabled={outstanding > 0}
                                                                className={`px-3 py-1 rounded-md text-sm ${outstanding > 0
                                                                    ? "border border-[#333] text-[#666] cursor-not-allowed"
                                                                    : "border border-[#55554f] hover:bg-[#222]"
                                                                    }`}
                                                                title={
                                                                    outstanding > 0
                                                                        ? "Repay fully before closing"
                                                                        : "Close loan"
                                                                }
                                                            >
                                                                Close
                                                            </button>}
                                                    </div>
                                                </div>
                                                {loan.repayments?.length > 0 && (
                                                    <div className="mt-2 text-xs text-[#a0a0a0]">
                                                        <p>
                                                            Repayments:{" "}
                                                        </p>
                                                        {loan.repayments
                                                            .slice()
                                                            .reverse()
                                                            .map((r, idx) => (
                                                                <p key={idx} className="mr-2">
                                                                    ₹{r.amount} on {new Date(r.at).toLocaleDateString()}
                                                                </p>
                                                            ))}
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
                                {expenses.length !== 0 && <div className="pb-2 pt-2">
                                    <div>
                                        <p className="text-sm text-gray-400">Net Expenses Balance</p>
                                        <p
                                            className={`text-2xl font-semibold ${netBalance > 0
                                                ? "text-teal-500"
                                                : netBalance < 0
                                                    ? "text-red-400"
                                                    : "text-white"
                                                }`}
                                        >
                                            {netBalance > 0 ? "you are owed" : netBalance < 0 ? "you owe" : "All Settled"}{" "}
                                            ₹{Math.abs(netBalance).toFixed(2)}
                                        </p>
                                    </div>

                                    {netBalance !== 0 && (
                                        <div className="flex flex-col gap-2 mt-2">
                                            <button
                                                onClick={() => {
                                                    setSettleType("full");
                                                    setShowSettleModal(true);
                                                }}
                                                className="bg-teal-600 text-white px-4 py-2 rounded-md text-sm"
                                            >
                                                Settle
                                            </button>
                                        </div>
                                    )}
                                </div>}

                                {loading ? (
                                    <div className="flex flex-col justify-center items-center flex-1 py-5">
                                        <Loader />
                                    </div>
                                ) : !expenses ? (
                                    <p>Group not found</p>
                                ) : expenses.length === 0 ? (
                                    <div className="flex flex-1 flex-col justify-center">
                                        <div className="flex flex-col items-center justify-center p-4 rounded-lg  text-center space-y-4 bg-[#1f1f1f]">
                                            <h2 className="text-2xl font-semibold">No Expenses Yet</h2>
                                            <p className="text-sm text-gray-400 max-w-sm">
                                                You haven’t added any expenses yet. Start by adding your first one to see stats and insights.
                                            </p>
                                            <button
                                                onClick={() => navigate('/new-expense', { state: { friendId: id } })}
                                                className="bg-teal-500 text-white px-6 py-2 rounded-lg hover:bg-teal-600 transition"
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


                    {/* <div className="px-4 pb-2">
                        <div>
                            <p className="text-sm text-gray-400">Net Balance</p>
                            <p className={`text-2xl font-semibold ${netBalance > 0 ? "text-teal-500" : netBalance < 0 ? "text-red-400" : "text-white"}`}>
                                {netBalance > 0 ? "you are owed" : netBalance < 0 ? "you owe" : "All Settled"}{" "}
                                ₹{Math.abs(netBalance).toFixed(2)}
                            </p>
                        </div>

                        {netBalance !== 0 && (
                            <div className="flex flex-col gap-2 mt-2">
                                <button
                                    onClick={() => {
                                        setSettleType("full");
                                        setShowSettleModal(true);
                                    }}
                                    className="bg-teal-600 text-white px-4 py-2 rounded-md text-sm"
                                >
                                    Settle
                                </button>
                            </div>
                        )}
                    </div> */}




                </div>
            </div>

            {showModal && (
                <ExpenseModal showModal={showModal} fetchExpenses={() => getFriendExpense(id, userToken)} setShowModal={setShowModal} userToken={userToken} />
            )}
            {showSettleModal && (
                <SettleModal
                    setShowModal={setShowSettleModal}
                    simplifiedTransactions={generateSimplifiedTransaction(netBalance, userId, friend._id)}
                    friends={[{ id: userId, name: 'You' }, { id: friend._id, name: friend.name }]}
                    onSubmit={handleSettle}
                    userId={userId}
                />
            )}{showRepayModal && activeLoan && (
                <LoanRepayModal
                    setShowModal={setShowRepayModal}
                    loan={activeLoan}
                    userId={userId}
                    onSubmitRepayment={async ({ amount, note, closeAfter }) => {
                        await addLoanRepayment(activeLoan._id, { amount, note }, userToken);
                        // optionally auto-close when fully repaid
                        if (closeAfter) {
                            await closeLoanApi(activeLoan._id, {}, userToken);
                        }
                        await fetchLoansForFriend(userId, friend._id); // refresh the list + balances
                    }}
                    onCloseLoan={async () => {
                        await closeLoanApi(activeLoan._id, {}, userToken);
                        await fetchLoansForFriend(userId, friend._id);
                    }}
                />

            )}
            {/* Floating Add Button – shows only when list isn't empty */}
            {!loading && (
                <>
                    {/* Expenses FAB */}
                    {activeSection === "expenses" && expenses?.length > 0 && (
                        <button
                            onClick={() => navigate('/new-expense', { state: { friendId: id } })}
                            aria-label="Add Expense"
                            className="fixed right-4 bottom-24 z-50 rounded-full bg-teal-500 hover:bg-teal-600 active:scale-95 transition 
                   text-white px-5 py-4 flex items-center gap-2"
                        >
                            <Plus size={18} />
                            <span className="text-sm font-semibold">Add Expense</span>
                        </button>
                    )}

                    {/* Loans FAB */}
                    {activeSection === "loans" && loans?.length > 0 && (
                        <button
                            onClick={() => navigate(`/new-loan`, { state: { friendId: friend._id } })}
                            aria-label="Create Loan"
                            className="fixed right-4 bottom-24 z-50 rounded-full bg-teal-500 hover:bg-teal-600 active:scale-95 transition 
                   text-white px-5 py-4 flex items-center gap-2"
                        >
                            <Plus size={18} />
                            <span className="text-sm font-semibold">New Loan</span>
                        </button>
                    )}
                </>
            )}

        </MainLayout>
    );
};

export default FriendDetails;
