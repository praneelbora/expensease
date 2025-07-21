import { useEffect, useRef, useState } from "react";
import MainLayout from '../layouts/MainLayout';
import Modal from '../components/FriendsModal';
import { useAuth } from "../context/AuthContext";
import { useLocation } from "react-router-dom";
import { getFriends,acceptLinkFriendRequest } from "../services/FriendService";
import { getAllExpenses } from "../services/ExpenseService";
import {
    Users,
    Wallet,
    Plus,
    List,
    User,
    Loader,
} from "lucide-react";
const Friends = () => {
    const location = useLocation();

    const { userToken } = useAuth() || {}
    const [friends, setFriends] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState([]); // ✅ Array of expenses
    const [userId, setUserId] = useState(null);

    const fetchFriends = async () => {
        try {
            const data = await getFriends(userToken)
            if (data.length > 0)
                setFriends(data);
        } catch (error) {
            console.error("Error loading friends:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFriends();
    }, []);
    const fetchExpenses = async () => {
        try {
            const data = await getAllExpenses(userToken);
            setExpenses(data.expenses.filter(exp => exp.groupId == undefined));
            setUserId(data.id);

        } catch (error) {
            console.error("Error loading expenses:", error);
        }
    };
    const hasRequestedRef = useRef(false);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const toId = params.get("add");

        if (toId && !hasRequestedRef.current) {
            hasRequestedRef.current = true; // ensure it runs only once
            handleLinkRequest(toId);
        }
    }, [location]);
const handleLinkRequest = async (toId) => {
    try {
        const data = await acceptLinkFriendRequest(toId, userToken);

        if (data.error || data.message?.toLowerCase().includes("error")) {
            // Show error from backend if present
            const errorMsg = data.message || data.error || "Failed to send friend request.";
            alert(errorMsg); // You can replace with toast(errorMsg)
            return;
        }

        alert(data.message || "Friend request sent successfully."); // Success feedback
    } catch (error) {
        console.error("Error sending link request:", error);
        alert("Something went wrong. Please try again.");
    }
};

    useEffect(() => {
        fetchExpenses();
    }, []);

    return (
        <MainLayout>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <h1 className="text-3xl font-bold capitalize">All Friends</h1>
                    <button
                        className={`flex flex-col items-center justify-center z-10 bg-lime-200 text-black w-8 h-8 rounded-full shadow-md text-2xl`}
                        onClick={() => setShowModal(true)}
                    >
                        <Plus strokeWidth={3} size={20} />
                    </button>
                </div>
                <div className="flex flex-col flex-1 w-full overflow-y-auto pt-2 no-scrollbar">

                    {loading ? (
                        <div className="flex flex-col justify-center items-center flex-1 py-5">
                            <Loader />
                        </div>
                    ) : friends.length === 0 ? (
                        <div className="flex flex-col justify-center items-center flex-1 py-5">

                            <p>No friends found.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-3 gap-x-4">
                            {friends.map((friend) => {
                                const friendExpenses = expenses?.filter(exp =>
                                    exp.splits.some(split => {
                                        return split.friendId?._id?.toString() === friend._id?.toString()
                                    })
                                );
                                // Compute net balance (user - friend) for those expenses
                                let balance = 0;
                                friendExpenses.forEach(exp => {
                                    exp.splits.forEach(split => {
                                        if (split.friendId?._id?.toString() === friend._id?.toString()) {
                                            if (split.owing) {
                                                balance += split.oweAmount || 0;
                                            }
                                            if (split.paying) {
                                                balance -= split.payAmount || 0;
                                            }
                                        }
                                    });
                                });

                                return (
                                    <div key={friend._id} className="flex flex-col gap-2 h-[45px]">
                                        <div className="flex flex-1 flex-row justify-between items-center align-middle">
                                            <h2 className="text-xl font-semibold capitalize">{friend.name}</h2>
                                            {balance !== 0 && !isNaN(balance) && (
                                                <div className="flex flex-col">
                                                    <p className={`${balance < 0 ? 'text-red-500' : 'text-teal-500'} text-[12px] text-right`}>
                                                        {balance < 0 ? 'you owe' : 'you are owed'}
                                                    </p>
                                                    <p className={`${balance < 0 ? 'text-red-500' : 'text-teal-500'} text-[16px] -mt-[4px] text-right`}>
                                                        ₹ {Math.abs(balance.toFixed(2))}
                                                    </p>
                                                </div>
                                            )}

                                        </div>
                                        <hr />
                                    </div>
                                );
                            })}


                        </div>
                    )}
                </div>
            </div>
            <Modal setShowModal={setShowModal} showModal={showModal} fetchFriends={fetchFriends} userToken={userToken}/>
        </MainLayout>
    );
};

export default Friends;
