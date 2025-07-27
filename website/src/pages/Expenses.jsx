import { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import ExpenseModal from "../components/ExpenseModal";
import { useNavigate } from "react-router-dom"; // ✅ Correct import
import { useAuth } from "../context/AuthContext";
import { Loader, Plus } from "lucide-react";
import { getAllExpenses } from '../services/ExpenseService';
import ExpenseItem from "../components/ExpenseItem"; // Adjust import path

const Expenses = () => {
    const { userToken } = useAuth() || {}
    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState([]);
    const [userId, setUserId] = useState();
    const [showModal, setShowModal] = useState(false);
    const navigate = useNavigate();
    const getSettleDirectionText = (splits) => {
        const payer = splits.find(s => s.paying && s.payAmount > 0);
        const receiver = splits.find(s => s.owing && s.oweAmount > 0);

        if (!payer || !receiver) return "Invalid settlement";

        const payerName = payer.friendId._id === userId ? "You" : payer.friendId.name;
        const receiverName = receiver.friendId._id === userId ? "you" : receiver.friendId.name;

        return `${payerName} paid ${receiverName}`;
    };

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
            return { text: 'you lent', amount: ` ₹${net.toFixed(2)}` };
        } else if (net < 0) {
            return { text: 'you borrowed', amount: ` ₹${Math.abs(net).toFixed(2)}` };
        } else {
            return null;
        }
    };

    const fetchExpenses = async () => {
        try {
            const data = await getAllExpenses(userToken);
            setUserId(data.id);
            setExpenses(data.expenses)
            setLoading(false)
        } catch (error) {
            console.error("Error loading expenses:", error);
        }
    };

    useEffect(() => {
        fetchExpenses();
    }, []);

    return (
        <MainLayout>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <h1 className="text-3xl font-bold capitalize">All Expenses</h1>
                    <button
                        className={`flex flex-col items-center justify-center z-10 bg-lime-200 text-black w-8 h-8 rounded-full shadow-md text-2xl`}
                        onClick={() => navigate('/add-expense')}
                    >
                        <Plus strokeWidth={3} size={20} />
                    </button>
                </div>
                <div className="flex flex-col flex-1 w-full overflow-y-auto pt-2 no-scrollbar">
                    <ul className="h-full flex flex-col w-full gap-2">
                        {loading ? (
                            <div className="flex flex-col justify-center items-center flex-1 py-5">
                                <Loader />
                            </div>
                        ) : expenses?.length === 0 ? (
                            <div className="flex flex-col justify-center items-center flex-1 py-5">
                                <p>No expenses found.</p>
                            </div>
                        ) : expenses?.map((exp) => (
                            <ExpenseItem
        key={exp._id}
        expense={exp}
        onClick={setShowModal}
        getPayerInfo={getPayerInfo}
        getOweInfo={getOweInfo}
        getSettleDirectionText={getSettleDirectionText}
    />
                        ))}
                    </ul>
                </div>
            </div>
            {showModal && (
                <ExpenseModal showModal={showModal} setShowModal={setShowModal} fetchExpenses={fetchExpenses} userToken={userToken} />
            )}
        </MainLayout>
    );
};

export default Expenses;
