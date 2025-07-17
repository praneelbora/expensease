import { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import ExpenseModal from "../components/ExpenseModal";

import { useAuth } from "../context/AuthContext";
const Expenses = () => {
    const { userToken } = useAuth()
    const [expenses, setExpenses] = useState([]);
    const [userID, setUserId] = useState();
    const [showModal, setShowModal] = useState(false);

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

    const fetchExpenses = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/expenses`, {
                headers: {
                    "Content-Type": "application/json",
                    "x-auth-token": userToken
                },
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.message || "Failed to fetch expenses");
            console.log(data);

            setExpenses(data.expenses);
            setUserId(data.id);
        } catch (error) {
            console.error("Error loading expenses:", error);
        }
    };

    useEffect(() => {
        fetchExpenses();
    }, []);

    return (
        <MainLayout>
            <div className="text-[#EBF1D5]">
                <h1 className="text-3xl font-bold mb-4">All Expenses</h1>
                <ul className="flex flex-col w-full gap-2">
                    {expenses.map((exp) => (
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
            {showModal && (
                <ExpenseModal showModal={showModal} setShowModal={setShowModal} />
            )}
        </MainLayout>
    );
};

export default Expenses;
