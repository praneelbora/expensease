import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import { getFriendDetails } from "../services/FriendService";
import { settleFriendExpense, getFriendExpense } from "../services/ExpenseService";
import SettleModal from "../components/SettleModal";
import { ChevronLeft, Loader, Wallet } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import ExpenseModal from "../components/ExpenseModal"; // Adjust import path

const FriendDetails = () => {
    const { userToken } = useAuth();
    const { id } = useParams();
    const navigate = useNavigate();
    const [userId, setUserId] = useState();
    const [loading, setLoading] = useState(true);

    const [friend, setFriend] = useState(null);
    const [expenses, setExpenses] = useState([]);
    const [netBalance, setNetBalance] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [settleType, setSettleType] = useState('partial');

    const fetchData = async () => {
        const data = await getFriendDetails(id, userToken);
        setFriend(data.friend);
        setUserId(data.id);

        const expenseData = await getFriendExpense(id, userToken);
        setExpenses(expenseData);

        const net = calculateFriendBalance(expenseData, data.id, data.friend._id);
        setNetBalance(net);

        setLoading(false);
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
                if (totalDebt[memberId] == NaN)
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
    const handleSettle = async ({ amount, description }) => {
        await settleFriendExpense({ id, amount, description }, userToken);
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
                const id = split.friendId?._id?.toString();

                if (id === userId) {
                    if (split.owing) balance -= split.oweAmount || 0;
                    if (split.paying) balance += split.payAmount || 0;
                } else if (id === friendId) {
                    if (split.owing) balance += split.oweAmount || 0;
                    if (split.paying) balance -= split.payAmount || 0;
                }
            });
        });



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
        const userSplit = splits.find(s => s.friendId && s.friendId._id === userId);

        if (!userSplit) return null;

        const { oweAmount = 0, payAmount = 0 } = userSplit;
        const net = payAmount - oweAmount;

        if (net > 0) {
            return { text: 'You lent', amount: ` ₹${net.toFixed(2)}` };
        } else if (net < 0) {
            return { text: 'You borrowed', amount: ` ₹${Math.abs(net).toFixed(2)}` };
        } else {
            return null;
        }
    };
    return (
        <MainLayout>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <div className="flex flex-row gap-2">
                        <button onClick={() => navigate(`/friends`)}>
                            <ChevronLeft />
                        </button>
                        <h1 className={`${friend?.name ? 'text-[#EBF1D5]' : 'text-[#121212]'} text-3xl font-bold capitalize`}>{friend?.name ? friend?.name : "Loading"}</h1>
                    </div>
                </div>
                <div className="flex flex-col flex-1 w-full overflow-y-auto pt-3 no-scrollbar gap-3">
                    {/* <div className="px-4 pb-2">
                        <div>
                            <p className="text-sm text-gray-400">Net Balance</p>
                            <p className={`text-2xl font-semibold ${netBalance > 0 ? "text-green-400" : netBalance < 0 ? "text-red-400" : "text-white"}`}>
                                ₹{Math.abs(netBalance).toFixed(2)}{" "}
                                {netBalance > 0 ? "They owe you" : netBalance < 0 ? "You owe them" : "All Settled"}
                            </p>
                        </div>

                        {netBalance !== 0 && (
                            <div className="flex flex-col gap-2 mt-2">
                                <button
                                    onClick={() => {
                                        setSettleType("full");
                                        setShowModal(true);
                                    }}
                                    className="bg-green-600 text-white px-4 py-2 rounded-md text-sm"
                                >
                                    Settle All
                                </button>
                                <button
                                    onClick={() => {
                                        setSettleType("partial");
                                        setShowModal(true);
                                    }}
                                    className="border border-green-500 text-green-500 px-4 py-2 rounded-md text-sm"
                                >
                                    Partial Settle
                                </button>
                            </div>
                        )}
                    </div> */}



                    {loading ? (
                        <div className="flex flex-col justify-center items-center flex-1 py-5">
                            <Loader />
                        </div>
                    ) : !expenses ? (
                        <p>Group not found</p>
                    ) : (
                        <div className="flex flex-col gap-y-3 gap-x-4">
                            <h3 className="text-lg font-semibold mb-2">Shared Expenses</h3>
                            {expenses?.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                                ?.filter(exp => exp.typeOf === 'expense')
                                ?.map((exp) => (
                                    <div key={exp._id} onClick={() => setShowModal(exp)} className="flex flex-row w-full items-center gap-3 min-h-[50px]">
                                        <div className="flex flex-col justify-center items-center">
                                            <p className="text-[14px] uppercase">
                                                {(new Date(exp.createdAt)).toLocaleString('default', { month: 'short' })}
                                            </p>
                                            <p className="text-[22px] -mt-[6px]">
                                                {(new Date(exp.createdAt)).getDate().toString().padStart(2, '0')}
                                            </p>
                                        </div>
                                        <div className="w-[2px] my-[2px] bg-[#EBF1D5] opacity-50 self-stretch"></div>
                                        <div className="flex grow flex-row justify-between items-center gap-4 min-w-0">
                                            {/* Left: Description and payer info */}
                                            <div className="flex flex-col justify-center min-w-0">
                                                <p className="text-[22px] capitalize truncate">{exp.description}</p>
                                                <p className="text-[14px] text-[#81827C] capitalize -mt-[6px]">
                                                    {getPayerInfo(exp.splits)} {getPayerInfo(exp.splits) !== "You were not involved" && `₹${exp.amount.toFixed(2)}`}
                                                </p>
                                            </div>

                                            {/* Right: Owe/Paid display */}
                                            <div className="flex flex-col justify-center items-end text-right shrink-0">
                                                <p className="text-[13px] whitespace-nowrap">{getOweInfo(exp.splits)?.text}</p>
                                                <p className="text-[22px] capitalize -mt-[6px] whitespace-nowrap">{getOweInfo(exp.splits)?.amount}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                        </div>)}
                </div>
            </div>

            {showModal && (
                <ExpenseModal showModal={showModal} fetchExpenses={getFriendExpense(id, userToken)} setShowModal={setShowModal} userToken={userToken} />
            )}
        </MainLayout>
    );
};

export default FriendDetails;
