
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Loader } from "lucide-react";
import MainLayout from "../layouts/MainLayout";
import { useAuth } from "../context/AuthContext";
import {
    getFriendDetails,
    removeFriend,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
} from "../services/FriendService";
import { getFriendExpense } from "../services/ExpenseService"; // 👈 create this
import { getSymbol } from "../utils/currencies";
import { logEvent } from "../utils/analytics";

export default function FriendSettings() {
    const { id } = useParams(); // friendId
    const navigate = useNavigate();
    const { user, userToken } = useAuth();

    const [friend, setFriend] = useState(null);
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totals, setTotals] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchFriend();
        fetchExpenses();
    }, [id]);

    const fetchFriend = async () => {
        try {
            setLoading(true);
            const data = await getFriendDetails(id, userToken);
            setFriend(data);
        } catch (err) {
            console.error("Error fetching friend:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchExpenses = async () => {
        try {
            const data = await getFriendExpense(id, userToken);
            setExpenses(data.expenses);
        } catch (err) {
            console.error("Error fetching friend expenses:", err);
        }
    };

    useEffect(() => {
        if (!expenses || !user?._id) return;

        const totals = {
            balance: {},
            yourExpense: {},
            friendExpense: {},
        };

        expenses.forEach((exp) => {
            const code = exp.currency || "INR";
            exp.splits.forEach((split) => {
                if (split.friendId?._id === user._id) {
                    // my side
                    totals.balance[code] =
                        (totals.balance[code] || 0) +
                        ((split.payAmount || 0) - (split.oweAmount || 0));
                    totals.yourExpense[code] =
                        (totals.yourExpense[code] || 0) + (split.oweAmount || 0);
                } else {
                    totals.friendExpense[code] =
                        (totals.friendExpense[code] || 0) + (split.oweAmount || 0);
                }
            });
        });

        setTotals(totals);
    }, [expenses, user?._id]);

    const handleRemoveFriend = async () => {
        if (!confirm("Are you sure you want to remove this friend?")) return;
        logEvent('remove_friend')
        try {
            await removeFriend(id, userToken);
            navigate("/friends");

        } catch (error) {
            if (error.message) setError(error.message);
            else setError("Failed to remove friend. Please try again.");
        }
    };

    const handleAccept = async () => {
        await acceptFriendRequest(id, userToken);
        fetchFriend();
    };

    const handleReject = async () => {
        await rejectFriendRequest(id, userToken);
        navigate("/friends");
    };

    const handleCancel = async () => {
        await cancelFriendRequest(id, userToken);
        navigate("/friends");
    };

    return (
        <MainLayout>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                {/* Header */}
                <div className="sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row items-center gap-2">
                    <button onClick={() => navigate(`/friends/${id}`)}>
                        <ChevronLeft />
                    </button>
                    <h1 className="text-3xl font-bold capitalize">Friend Settings</h1>
                </div>

                {loading ? (
                    <div className="flex flex-1 justify-center items-center">
                        <Loader />
                    </div>
                ) : !friend ? (
                    <p>Friend not found</p>
                ) : (
                    <div className="flex flex-1 flex-col gap-6 pt-4 justify-end">
                        <div className="flex flex-1 flex-col gap-1">
                            <p className="text-[#888]">
                                More Features coming soon! Meanwhile you can view all expenses with this friend{" "}
                                <span
                                    onClick={() => navigate(`/friends/${id}`)}
                                    className="text-teal-500 hover:underline cursor-pointer"
                                >here
                                </span>.
                            </p>
                        </div>

                        {/* Expenses Summary */}
                        {/* {totals && (
                            <div className="bg-[#1E1E1E] p-4 rounded-xl shadow">
                                <h2 className="text-xl font-semibold mb-2">Summary</h2>
                                {Object.keys(totals?.balance)?.map((code) => {
                                    const bal = totals?.balance[code] || 0;
                                    const sym = getSymbol("en-IN", code);

                                    return (
                                        <div key={code} className="pt-3 border-t border-[#2A2A2A]">
                                            <p
                                                className={`text-lg ${bal < 0 ? "text-red-500" : "text-teal-500"
                                                    }`}
                                            >
                                                {bal < 0 ? "You owe" : "You are owed"}
                                            </p>
                                            <p className="text-2xl font-bold">
                                                {sym} {Math.abs(bal).toFixed(2)}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        )} */}

                        <div className="border border-[#2C2C2C] rounded-xl ">
                            <div className="bg-[#201f1f] px-4 py-3 border-b border-[#2C2C2C]">
                                <h3 className="text-sm tracking-wide uppercase text-red-400">Danger Zone</h3>
                            </div>
                            <hr className="border-[#2C2C2C]" />
                            <div className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-base font-medium">Remove Friend</p>
                                    <p className="text-sm text-[#9aa08e]">
                                        Removes this friend and all related expenses between you. You can add them again later if needed.
                                    </p>
                                </div>
                                <button
                                    onClick={() => {

                                        handleRemoveFriend()
                                    }}
                                    className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm"
                                >
                                    Remove Friend
                                </button>
                            </div>
                        </div>
                        {error && (
                            <div className="text-sm text-red-400 bg-red-900/20 border border-red-700 rounded px-3 py-2 mb-2 text-center">
                                {error}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </MainLayout>
    );
}
