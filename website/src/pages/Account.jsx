import { useAuth } from '../context/AuthContext';
import MainLayout from '../layouts/MainLayout';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getAllExpenses } from '../services/ExpenseService';
import { updateUserProfile } from '../services/UserService'; // make sure this exists
import CategoriesManage from '../components/SettingsCategoryManager';
import { logEvent } from "../utils/analytics";

const Account = () => {
    const { logout, user, userToken } = useAuth() || {};
    const location = useLocation();

    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(user?.name || '');
    const [profilePic, setProfilePic] = useState(user?.profilePic || '');
    const [expenses, setExpenses] = useState([]);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(!user && !!userToken);
    const [totals, setTotals] = useState(0);

    // ---- UPI section state ----
    const [upiId, setUpiId] = useState(user?.upiId || '');
    const upiRef = useRef(null);
    const upiInputRef = useRef(null);

    const calculateTotals = (expenses, userId) => {
        let totalOwe = 0;
        let totalPay = 0;
        expenses.forEach(exp => {
            const share = exp.splits.find(s => s.friendId._id === userId);
            if (!share) return;
            if (share.owing) totalOwe += exp.typeOf === 'expense' ? share.oweAmount : 0;
            if (share.paying) totalPay += share.payAmount;
        });
        return { balance: totalPay - totalOwe, expense: totalOwe };
    };

    const fetchExpenses = async () => {
        try {
            const data = await getAllExpenses(userToken);
            setUserId(data.id);
            setTotals(calculateTotals(data.expenses, data.id));
        } catch (error) {
            console.error("Error loading expenses:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchExpenses();
    }, []);

    // Auto-scroll to UPI section if /account?section=upi
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('section') === 'upi' && upiRef.current) {
            setTimeout(() => {
                upiRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // focus the input for convenience
                upiInputRef.current?.focus();
            }, 100);
        }
    }, [location.search]);

    const handleSave = () => {
        setEditing(false);
    };

    const saveUpi = async () => {
        const v = (upiId || '').trim();
        if (!v) {
            alert('Please enter a valid UPI ID (e.g., name@bank).');
            return;
        }
        const upiRegex = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z0-9.\-]{2,}$/;
        if (!upiRegex.test(v)) {
            alert('That UPI ID does not look right. Example: username@bank');
            return;
        }
        try {
            await updateUserProfile(userToken, { upiId: v }); // adjust field name if your API expects something else
            alert('UPI ID saved');
        } catch (e) {
            console.error(e);
            alert(e?.message || 'Failed to save UPI ID');
        }
    };

    return (
        <MainLayout>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <h1 className="text-3xl font-bold capitalize">My Account</h1>
                </div>

                <div className="flex flex-col flex-1 w-full overflow-y-auto pt-3 no-scrollbar gap-3">
                    {loading ? (
                        <div className="animate-pulse space-y-4 mt-3">
                            <div className="h-6 bg-gray-700 rounded w-1/3" />
                            <div className="h-4 bg-gray-700 rounded w-1/2" />
                            <div className="h-4 bg-gray-700 rounded w-2/3" />
                        </div>
                    ) : (user || userToken) ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Basic info */}
                            <div className="bg-[#1E1E1E] p-4 rounded-xl shadow">
                                <p className="text-base text-[#BBBBBB]">Name</p>
                                <h2 className="text-xl font-semibold mb-2">{user?.name}</h2>
                                <p className="text-base text-[#BBBBBB]">Email</p>
                                <h2 className="text-xl font-semibold">{user?.email}</h2>
                            </div>

                            {/* --- UPI Section --- */}
                            <div ref={upiRef} id="upi-section" className="bg-[#1E1E1E] p-4 rounded-xl shadow">
                                <div className="flex items-center justify-between mb-2">
                                    <h2 className="text-xl font-semibold">UPI for Quick Payments</h2>
                                </div>

                                <p className="text-xs text-gray-500 mb-1 italic">
                                    💡 Add your UPI ID so friends can pay you instantly — no back-and-forth.
                                    If you’re the one paying, ask your friend to add their UPI ID so you can transfer in seconds.
                                </p>

                                <label className="text-xs text-gray-400">Your UPI ID</label>
                                <div className="mt-1 flex gap-2">
                                    <input
                                        ref={upiInputRef}
                                        value={upiId}
                                        onChange={(e) => setUpiId(e.target.value)}
                                        placeholder="yourname@bank"
                                        className="flex-1 bg-[#2A2A2A] text-white px-3 py-2 rounded border border-transparent focus:outline-none focus:border-teal-600"
                                    />
                                    <button
                                        onClick={() => {
                                            logEvent('update_upi', {
                                                screen: 'account'
                                            });
                                            saveUpi()
                                        }}
                                        className="px-4 py-2 rounded bg-teal-600 hover:bg-teal-700 font-semibold"
                                    >
                                        Save
                                    </button>
                                </div>

                                {!upiId && (
                                    <p className="text-[11px] text-gray-500 mt-2">
                                        Don’t have one yet? Most banking apps let you create a UPI ID in minutes.
                                    </p>
                                )}
                            </div>

                            {/* Categories manager */}
                            <CategoriesManage userToken={userToken} />

                            {/* Support the Developer */}
                            <div
                                onClick={() => (window.location.href = '/supportdeveloper')}
                                className="bg-[#1E1E1E] p-4 rounded-xl shadow flex flex-col justify-between cursor-pointer"
                            >
                                <div>
                                    <h2 className="text-xl font-semibold mb-2">Support the Developer ☕</h2>
                                    <p className="text-[#BBBBBB] text-sm">
                                        If you find this platform helpful, consider supporting its development!
                                    </p>
                                </div>
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
            </div>
        </MainLayout>
    );
};

export default Account;
