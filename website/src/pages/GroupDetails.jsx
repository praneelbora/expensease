import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import ExpenseModal from "../components/ExpenseModal"; // Adjust import path
import { useAuth } from "../context/AuthContext";
import SettleModal from '../components/SettleModal';
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
} from "lucide-react";
const GroupDetails = () => {
    const { userToken } = useAuth()
    const navigate = useNavigate()
    const { id } = useParams();
    const [group, setGroup] = useState(null);
    const [groupExpenses, setGroupExpenses] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [userID, setUserId] = useState();
    const [selectedMember, setSelectedMember] = useState(null);
    const [showMembers, setShowMembers] = useState(false);
    const [showSettleModal, setShowSettleModal] = useState(false);
    const [settleFrom, setSettleFrom] = useState('');
    const [settleTo, setSettleTo] = useState('');
    const [settleAmount, setSettleAmount] = useState('');
    const [copied, setCopied] = useState(false);

    const handleSettle = async ({ payerId, receiverId, amount, description }) => {
        if (!payerId || !receiverId || !amount) {
            alert("Please fill all required fields.");
            return;
        }

        try {
            const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/expenses/settle`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-auth-token': userToken
                },
                body: JSON.stringify({
                    fromUserId: payerId,
                    toUserId: receiverId,
                    amount: parseFloat(amount),
                    description,
                    groupId: id
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || "Failed to settle");
            }

            await fetchGroupExpenses();
            alert("Settlement recorded successfully!");
        } catch (err) {
            console.error("Error in settlement:", err);
            alert("Could not settle the amount.");
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
        const userSplit = splits.find(s => s.friendId && s.friendId._id === userID);

        if (!userSplit || (!userSplit.payAmount && !userSplit.oweAmount)) {
            return "You were not involved";
        }

        const payers = splits.filter(s => s.paying && s.payAmount > 0);
        if (payers.length === 1) {
            return `${payers[0].friendId._id == userID ? 'You' : payers[0].friendId.name} paid`;
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

        const payerName = payer.friendId._id === userID ? "You" : payer.friendId.name;
        const receiverName = receiver.friendId._id === userID ? "you" : receiver.friendId.name;

        return `${payerName} paid ${receiverName}`;
    };



    const getOweInfo = (splits) => {
        const userSplit = splits.find(s => s.friendId && s.friendId._id === userID);

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

    const fetchGroup = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/groups/${id}`, {
                headers: {
                    "Content-Type": "application/json",
                    "x-auth-token": Cookies.get('userToken')
                },
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.message || "Failed to fetch group");

            setGroup(data);
        } catch (error) {
            console.error("Group Details Page - Error loading group:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchGroupExpenses = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/expenses/group/${id}`, {
                headers: {
                    "Content-Type": "application/json",
                    "x-auth-token": userToken
                },
            });

            const data = await response.json();
            console.log(data);

            if (!response.ok) throw new Error(data.message || "Failed to fetch group");

            setGroupExpenses(data.expenses);
            setUserId(data.id);
        } catch (error) {
            console.error("Group Details Page - Error loading group expenses:", error);
        } finally {
            setLoading(false);
        }
    };

    const calculateDebt = (groupExpenses, members) => {
        const totalDebt = {};

        // Initialize all members' total debts to 0
        members.forEach(member => {
            totalDebt[member._id] = 0;
        });
        console.log(totalDebt);

        // Calculate the total amount each member owes or is owed
        groupExpenses.forEach(exp => {
            exp.splits.forEach(split => {
                const { friendId, oweAmount, payAmount } = split;
                const memberId = friendId._id;

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
        console.log(totalDebt);

        return totalDebt;
    };

    // Simplify debts
    const simplifyDebts = (totalDebt, members) => {
        const owe = [];
        const owed = [];

        // Separate the people who owe money and the ones who are owed money
        for (let memberId in totalDebt) {
            if (totalDebt[memberId] > 0) {
                owed.push({ memberId, amount: totalDebt[memberId] });
            } else if (totalDebt[memberId] < 0) {
                owe.push({ memberId, amount: Math.abs(totalDebt[memberId]) });
            }
        }

        // Simplify the debts
        const transactions = [];
        let i = 0, j = 0;

        while (i < owe.length && j < owed.length) {
            const oweAmount = owe[i].amount;
            const owedAmount = owed[j].amount;

            // Determine how much is transferred between them
            const transactionAmount = Math.min(oweAmount, owedAmount);

            transactions.push({
                from: owe[i].memberId,
                to: owed[j].memberId,
                amount: transactionAmount
            });

            // Adjust the amounts
            owe[i].amount -= transactionAmount;
            owed[j].amount -= transactionAmount;

            if (owe[i].amount === 0) i++;
            if (owed[j].amount === 0) j++;
        }

        return transactions;
    };
    const [totalDebt, setTotalDebt] = useState(null);
    const [simplifiedTransactions, setSimplifiedTransactions] = useState(null);
    const getMemberName = (memberId) => {
        const member = group.members.find(m => m._id === memberId);
        return member ? member.name : "Unknown";
    };
    const userDebts = simplifiedTransactions?.filter(t => t.from === userID) || [];

    const groupedDebts = userDebts.reduce((acc, curr) => {
        if (!acc[curr.to]) acc[curr.to] = 0;
        acc[curr.to] += curr.amount;
        return acc;
    }, {});

    useEffect(() => {
        if (group && group?.members && groupExpenses?.length > 0) {
            setTotalDebt(calculateDebt(groupExpenses, group.members)); // Always recalculate
        }
    }, [group, groupExpenses]);

    useEffect(() => {
        if (totalDebt) {
            setSimplifiedTransactions(simplifyDebts(totalDebt, group.members));
        }
    }, [totalDebt])
    useEffect(() => {
        fetchGroup();
        fetchGroupExpenses();
    }, [id]);

    return (
        <MainLayout groupId={id}>
            <div className="text-[#EBF1D5] flex flex-col overflow-y-auto no-scrollbar">
                {loading ? (
                    <p>Loading...</p>
                ) : !group ? (
                    <p>Group not found</p>
                ) : (
                    <>
                        {/* Sticky Group Name */}
                        <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                            <div className="flex flex-row gap-2">
                        <button onClick={()=>navigate(`/groups`)}>
                                    <ChevronLeft />
                                </button>
                                <h1 className="text-3xl font-bold capitalize">{group.name}</h1>
                                </div>
                            <div className="flex flex-col items-end">
                            <div className="flex flex-row items-end">
                                <button
                                    className="flex flex-col items-center justify-center z-10 w-8 h-8 rounded-full shadow-md text-2xl"
                                    onClick={() => {
                                        const message = `You're invited to join my group on SplitFree! 🎉
Use this code to join: ${group.code}

Or simply tap the link below to log in and join instantly:
${import.meta.env.VITE_FRONTEND_URL}/groups/join/${group.code}`;
                                        const message1 = `Use this code: ${group.code}

Or just click the link below to join directly:
${import.meta.env.VITE_FRONTEND_URL}/groups/join/${group.code}`;

                                        if (navigator.share) {
                                            navigator
                                                .share({
                                                    title: "Join my group on SplitFree",
                                                    text: message1,
                                                    url: `${import.meta.env.VITE_FRONTEND_URL}/groups/join/${group.code}`,
                                                })
                                                .then(() => console.log("Shared successfully"))
                                                .catch((err) => console.error("Sharing failed", err));
                                        } else {
                                            navigator.clipboard.writeText(message);
                                            setCopied(true);
                                            setTimeout(() => setCopied(false), 2000); // hide after 2 seconds
                                        }
                                    }}
                                >
                                    <Share2 strokeWidth={2} size={20} />
                                </button>
                                <button
                                    className="flex flex-col items-center justify-center z-10 w-8 h-8 rounded-full shadow-md text-2xl"
                                    onClick={() => {navigate(`/groups/settings/${group._id}`)}} >
                                         <Settings strokeWidth={2} size={20} />
                                </button>
                                

                                    </div>
                                {copied && (
                                    <p className="text-gray-500 text-[9px] font-semibold transition-opacity">
                                        Copied to clipboard!
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Scrollable Content */}
                        <div className="flex-1 overflow-y-auto no-scrollbar pt-3 pb-[20px] flex flex-col gap-3">

                            {/* Toggle Button */}
                            <div className="flex flex-col gap-2">
                                {/* Header Row */}
                                <div className="flex justify-between items-center">
                                    <p className="text-[14px] uppercase">Members</p>
                                    <button
                                        onClick={() => setShowMembers((prev) => !prev)}
                                        className="text-sm rounded-full uppercase"
                                    >
                                        {showMembers ? <Eye/>:<EyeClosed/>}
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
                                                    ? 'bg-green-300 border-green-300 text-black'
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
                            {groupExpenses && groupExpenses.length>0 &&<> <div className="flex flex-col">
                                <div className="flex justify-between items-center">
                                    <p className="text-[14px] uppercase">Debt Summary</p>
                                    <button
                                        onClick={() => setShowSettleModal(true)}
                                        className="text-sm border border-[#EBF1D5] rounded-full px-4 py-1 uppercase"
                                    >
                                        Settle
                                    </button>
                                </div>
                                {simplifiedTransactions?.map((transaction, index) => (
                                    <div key={index}>
                                        {`${getMemberName(transaction.from)} owes ${getMemberName(transaction.to)} ₹${transaction.amount.toFixed(2)}`}
                                    </div>
                                ))}
                            </div>

                            <hr /></>}

                            {/* Expenses */}
                            <div className="flex flex-col">
                                <div className="flex flex-row justify-between">
                                    <p className="text-[14px] my-2 uppercase">Expenses</p>
                                    <button
                                    className="flex flex-col items-center justify-center z-10 w-8 h-8 rounded-full shadow-md text-2xl"
                                    onClick={() => navigate('/add-expense', { state: { groupId: id } })}>
                                        <Plus size={20}/>
                                    </button>
                                    </div>
                                <ul className="flex flex-col w-full gap-2">
                                    {filteredExpenses?.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                                        .map((exp) => (
                                            <>

                                                {exp.typeOf != 'settle' ?
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

                                                            {/* Right: Owe info */}
                                                            <div className="flex flex-col justify-center items-end text-right shrink-0">
                                                                <p className="text-[13px] whitespace-nowrap">{getOweInfo(exp.splits)?.text}</p>
                                                                <p className="text-[22px] capitalize -mt-[6px] whitespace-nowrap">{getOweInfo(exp.splits)?.amount}</p>
                                                            </div>
                                                        </div>

                                                    </div> :
                                                    <div key={exp._id} onClick={() => setShowModal(exp)} className="flex flex-row w-full items-center gap-3 min-h-[20px]">
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
                                                                <p className="text-[14px] text-[#81827C] capitalize">
                                                                    {getSettleDirectionText(exp.splits)} {`₹${exp.amount.toFixed(2)}`}
                                                                </p>
                                                            </div>
                                                        </div>

                                                    </div>
                                                }
                                            </>

                                        ))}
                                </ul>
                            </div>
                        </div>
                    </>
                )}
            </div>


            {showModal && (
                <ExpenseModal showModal={showModal} setShowModal={setShowModal} />
            )}
            {showSettleModal && (
                <SettleModal
                    setShowModal={setShowSettleModal}
                    group={group}
                    onSubmit={handleSettle}
                />
            )}


        </MainLayout>
    );
};

export default GroupDetails;
