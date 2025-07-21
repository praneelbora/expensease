import { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import ExpenseModal from "../components/ExpenseModal";
import { useNavigate } from "react-router-dom"; // ✅ Correct import
import { useAuth } from "../context/AuthContext";
import { Loader, Plus } from "lucide-react";
import { getAllExpenses } from '../services/ExpenseService';

const Expenses = () => {
    const { userToken } = useAuth() || {}
    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState([]);
    const [userID, setUserId] = useState();
    const [showModal, setShowModal] = useState(false);
    const navigate = useNavigate();

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
            </div>
            {showModal && (
                <ExpenseModal showModal={showModal} setShowModal={setShowModal} fetchExpenses={fetchExpenses} userToken={userToken}/>
            )}
        </MainLayout>
    );
};

export default Expenses;
