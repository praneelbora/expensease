import { useAuth } from '../context/AuthContext';
import MainLayout from '../layouts/MainLayout';
import { useEffect, useState } from 'react';

const Account = () => {
    const { logout, user, userToken } = useAuth();
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(user?.name || '');
    const [profilePic, setProfilePic] = useState(user?.profilePic || '');
    const [expenses, setExpenses] = useState([]); // ✅ Array of expenses
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(!user && !!userToken);
    const [totals, setTotals] = useState(0); // 💰 net balance

    const calculateTotals = (expenses, userId) => {
        let totalOwe = 0;
        let totalPay = 0;

        expenses.forEach(exp => {
            const share = exp.splits.find(s => s.friendId._id === userId);
            if (!share) return;
            if (share.owing) totalOwe += share.oweAmount;
            if (share.paying) totalPay += share.payAmount;
        });
        console.log({ balance: totalPay - totalOwe, expense: totalOwe });

        return { balance: totalPay - totalOwe, expense: totalOwe };
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
            setUserId(data.id);
            setTotals(calculateTotals(data.expenses, data.id))

        } catch (error) {
            console.error("Error loading expenses:", error);
        }
    };

    useEffect(() => {
        fetchExpenses();
    }, []);
    const handleSave = () => {
        // call update API here
        setEditing(false);
    };

    return (
        <MainLayout>
            <div className="text-[#EBF1D5] bg-[#121212] flex flex-col gap-6">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                            <h1 className="text-3xl font-bold capitalize">My Account</h1>
                            </div>

                {(loading) ? (
                    <div className="animate-pulse space-y-4">
                        <div className="h-6 bg-gray-700 rounded w-1/3" />
                        <div className="h-4 bg-gray-700 rounded w-1/2" />
                        <div className="h-4 bg-gray-700 rounded w-2/3" />
                    </div>
                ) : (user || userToken) ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Edit Profile */}
                        <div className="bg-[#1E1E1E] p-4 rounded-xl shadow">
                            {/* <div className="flex justify-between items-center mb-2">
                                <h2 className="text-xl font-semibold">Edit Profile Info</h2>
                                {!editing ? (
                                    <button onClick={() => setEditing(true)} className="text-sm text-blue-400">Edit</button>
                                ) : (
                                    <button onClick={handleSave} className="text-sm text-green-400">Save</button>
                                )}
                            </div> */}
                            <div className="flex flex-col gap-3">
                                <div>
                                    <label className="text-sm font-medium">Name</label>
                                    {editing ? (
                                        <input
                                            type="text"
                                            className="bg-[#2A2A2A] text-white px-2 py-1 rounded w-full mt-1"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                        />
                                    ) : (
                                        <p className="text-base text-[#BBBBBB]">{name}</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Email */}
                        <div className="bg-[#1E1E1E] p-4 rounded-xl shadow">
                            <h2 className="text-xl font-semibold mb-2">Email</h2>
                            <p className="text-base text-[#BBBBBB]">{user?.email}</p>
                        </div>

                        <div className="bg-[#1E1E1E] p-4 rounded-xl shadow space-y-4">
                            {/* Net Balance */}
                            <div>
                                <h2 className="text-xl font-semibold mb-2">Net Balance</h2>
                                <p className={`text-lg ${totals?.balance < 0 ? 'text-red-500' : 'text-green-500'}`}>
                                    {totals?.balance < 0 ? 'You owe' : 'You are owed'}
                                </p>
                                <p className="text-2xl font-bold">
                                    ₹ {Math.abs(totals?.balance).toFixed(2)}
                                </p>
                            </div>

                            {/* Totals */}
                            <div className="grid grid-cols-2 gap-4 text-sm text-gray-400">
                                <div className="flex flex-col bg-[#2A2A2A] p-3 rounded-lg">
                                    <span className="text-xs text-gray-400">Expenses</span>
                                    <span className="text-red-500 text-lg font-semibold">₹ {totals?.expense?.toFixed(2)}</span>
                                </div>
                                <div className="flex flex-col bg-[#2A2A2A] p-3 rounded-lg">
                                    <span className="text-xs text-gray-400">Paid</span>
                                    <span className="text-green-500 text-lg font-semibold">
                                        ₹ {(totals?.balance + totals?.expense).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>



                        {/* Monthly Summary */}
                        <div className="bg-[#1E1E1E] p-4 rounded-xl shadow">
                            <h2 className="text-xl font-semibold mb-2">Monthly Expense Summary</h2>
                            <p className="text-[#BBBBBB] text-sm">
                                Coming soon: Charts, categories, trends, etc.
                            </p>
                        </div>

                        {/* Logout */}
                        <div className="bg-[#1E1E1E] p-4 rounded-xl shadow flex flex-col justify-end">
                            <button
                                className="text-red-500 border border-red-500 px-4 py-2 rounded-md w-full"
                                onClick={logout}
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                ) : (
                    <p className="text-red-500">User not logged in.</p>
                )}
            </div>
        </MainLayout>
    );
};

export default Account;
