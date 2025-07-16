import { useEffect, useState } from "react";
import { useParams } from "react-router";
import MainLayout from "../layouts/MainLayout";
import ExpenseModal from "../components/ExpenseModal"; // Adjust import path
import Cookies from 'js-cookie'

const GroupDetails = () => {
    const { id } = useParams();
    const [group, setGroup] = useState(null);
    const [groupExpenses, setGroupExpenses] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [userID, setUserID] = useState();
    const [selectedMember, setSelectedMember] = useState(null);

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
            return `${payers[0].friendId._id==userID?'You':payers[0].friendId.name} paid`;
        } else if (payers.length > 1) {
            return `${payers.length} people paid`;
        } else {
            return `No one paid`;
        }
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
                    "x-auth-token": Cookies.get('userToken'),
                },
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.message || "Failed to fetch group");

            setGroup(data);
        } catch (error) {
            console.error("Error loading group:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchGroupExpenses = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/expenses/group/${id}`, {
                headers: {
                    "Content-Type": "application/json",
                    "x-auth-token": Cookies.get('userToken'),
                },
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.message || "Failed to fetch group");

            setGroupExpenses(data.group.expenses);
            setUserID(data.id);
        } catch (error) {
            console.error("Error loading group:", err);
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

    useEffect(() => {
        if (group && group.members && groupExpenses.length > 0) {
            if (totalDebt == null) {
                setTotalDebt(calculateDebt(groupExpenses, group.members));
            }
        }
    }, [group, groupExpenses])
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
        <MainLayout>
            <div className="text-[#EBF1D5]">
                {loading ? (
                    <p>Loading...</p>
                ) : !group ? (
                    <p>Group not found</p>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <p className="text-[14px] uppercase">Group Name</p>
                            <h1 className="text-3xl font-bold">{group.name}</h1>
                        </div>
                        <hr />
                        <div className="flex flex-col">
                            <p className="text-[14px] my-2 uppercase">Members</p>
                            <div className="flex flex-wrap gap-2">
                                {group.members.map((member) => (
                                    <button
                                        key={member._id}
                                        onClick={() => (selectedMember === member._id) ? setSelectedMember(null) : setSelectedMember(member._id)}
                                        className={`px-3 py-1 rounded-full font-semibold border text-sm capitalize transition ${selectedMember === member._id
                                                ? 'bg-green-300 border-green-300 text-black'
                                                : 'text-[#EBF1D5] border-[#EBF1D5]'
                                            }`}
                                    >
                                        {member.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <hr />
                        {/* Debt summary display */}
                        <div className="flex flex-col">
                            <p className="text-[14px] my-2 uppercase">Debt Summary</p>
                            {simplifiedTransactions?.map((transaction, index) => (
                                <div key={index}>
                                    {`${getMemberName(transaction.from)} owes ${getMemberName(transaction.to)} ₹${transaction.amount.toFixed(2)}`}
                                </div>
                            ))}
                            <ul className="flex flex-col gap-2">
                                {/* {group.members.map((member) => {
                  const debt = debtSummary[member._id];
                  const netAmount = debt.lent - debt.owed;

                  return (
                    <li key={member._id} className="flex flex-row justify-between items-center">
                      <div className="flex flex-col">
                        <p className="text-[16px]">{member.name}</p>
                        <p className="text-[14px] text-[#81827C]">Lent: ₹{debt.lent.toFixed(2)}</p>
                        <p className="text-[14px] text-[#81827C]">Owed: ₹{debt.owed.toFixed(2)}</p>
                      </div>
                      <div className="flex flex-col items-end">
                        <p className="text-[14px]">Net: ₹{netAmount.toFixed(2)}</p>
                        {netAmount > 0 ? (
                          <p className="text-[14px] text-green-500">You are owed ₹{netAmount.toFixed(2)}</p>
                        ) : netAmount < 0 ? (
                          <p className="text-[14px] text-red-500">You owe ₹{Math.abs(netAmount).toFixed(2)}</p>
                        ) : (
                          <p className="text-[14px] text-gray-500">Settled</p>
                        )}
                      </div>
                    </li>
                  );
                })} */}
                            </ul>
                        </div>
                        <hr />
                        {/* Display Expenses */}
                        <div className="flex flex-col">
                            <p className="text-[14px] my-2 uppercase">Expenses</p>
                            <ul className="flex flex-col w-full gap-2">
                                {filteredExpenses.map((exp) => (
                                    <div key={exp._id} onClick={() => setShowModal(exp)} className="flex flex-row w-full items-center gap-3 min-h-[50px]">
                                        <div className="flex flex-col justify-center items-center">
                                            <p className="text-[14px] uppercase">{(new Date(exp.createdAt)).toLocaleString('default', { month: 'short' })}</p>
                                            <p className="text-[22px] -mt-[6px]">{(new Date(exp.createdAt)).getDate().toString().padStart(2, '0')}</p>
                                        </div>
                                        <div className="w-[2px] my-[2px] bg-[#EBF1D5] opacity-50 self-stretch"></div>
                                        <div className="flex grow flex-row justify-between">
                                            <div className="flex flex-col justify-center">
                                                <p className="text-[22px] capitalize">{exp.description}</p>
                                                <p className="text-[14px] text-[#81827C] capitalize -mt-[6px]">
                                                    {getPayerInfo(exp.splits)} {getPayerInfo(exp.splits) !== "You were not involved" && `₹${exp.amount.toFixed(2)}`}
                                                </p>
                                            </div>
                                            <div className="flex flex-col justify-center items-end">
                                                <p className="text-[14px]">{getOweInfo(exp.splits)?.text}</p>
                                                <p className="text-[22px] capitalize -mt-[6px]">{getOweInfo(exp.splits)?.amount}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </ul>
                        </div>
                        <hr />
                    </div>
                )}
            </div>
            {showModal && (
                <ExpenseModal showModal={showModal} setShowModal={setShowModal} />
            )}
        </MainLayout>
    );
};

export default GroupDetails;
