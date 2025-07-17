import { useEffect, useRef, useState } from "react";
import MainLayout from '../layouts/MainLayout';
import Modal from '../components/FriendsModal';
import { useAuth } from "../context/AuthContext";
import { useLocation } from "react-router-dom";

import {
    Users,
    Wallet,
    Plus,
    List,
    User,
} from "lucide-react";
const Friends = () => {
    const location = useLocation();

    const { userToken } = useAuth()
    const [friends, setFriends] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState([]); // ✅ Array of expenses
    const [userId, setUserId] = useState(null);

    const fetchFriends = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/friends/`, {
                headers: {
                    "Content-Type": "application/json",
                    'x-auth-token': userToken
                },
            });

            if (!response.ok) {
                throw new Error("Failed to fetch friends");
            }
            else {
                const data = await response.json();
                if (data.length > 0)
                    setFriends(data);
            }

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
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/expenses`, {
                headers: {
                    "Content-Type": "application/json",
                    "x-auth-token": userToken
                },
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.message || "Failed to fetch expenses");
            console.log(data);
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
                handleSendRequest(toId);
            }
        }, [location]);
        const handleSendRequest = async (toId) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/friends/request-link`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-auth-token': userToken,
                },
                body: JSON.stringify({ toId }),
            });

            const data = await response.json();

            if (!response.ok) {
                // Show meaningful message from backend if exists
                const errorMsg = data.message || data.error || "Failed to send friend request";
                alert(errorMsg); // or use toast(errorMsg)
                return;
            }

            // Success: refresh lists and close modal
            // fetchFriends();
            // sentRequests();
            // receivedRequests();
            // setShowModal(false);
            alert(data.message || "Friend request sent"); // Optional success message

        } catch (error) {
            console.error("Error Sending Request:", error);
            alert("Something went wrong. Please try again.");
        }
    };
    useEffect(() => {
        fetchExpenses();
    }, []);

    return (
        <MainLayout>
            <div className="max-h-screen bg-[#121212] text-[#EBF1D5] overflow-hidden">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                            <h1 className="text-3xl font-bold capitalize">All Friends</h1>
                    <button
                        className={`flex flex-col items-center justify-center z-10 bg-lime-200 text-black w-8 h-8 rounded-full shadow-md text-2xl`}
                        onClick={() => setShowModal(true)}
                    >
                        <Plus strokeWidth={3} size={20} />
                    </button>
                </div>


                {loading ? (
                    <p>Loading friends...</p>
                ) : friends.length === 0 ? (
                    <p>No friends found.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {friends.map((friend) => {
                            const friendExpenses = expenses?.filter(exp =>
                                exp.splits.some(split => {
                                    return split.friendId?._id?.toString() === friend._id?.toString()
                                })
                            );
                            console.log(friendExpenses);

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
                                <div key={friend._id} className="flex flex-col gap-2">
                                    <div className="flex flex-1 flex-row justify-between items-center align-middle">
                                        <h2 className="text-xl font-semibold capitalize">{friend.name}</h2>
                                        {balance !== 0 && !isNaN(balance) && (
                                            <div className="flex flex-col">
                                                <p className={`${balance < 0 ? 'text-red-500' : 'text-green-500'} text-[12px] text-right`}>
                                                    {balance < 0 ? 'you owe' : 'you are owed'}
                                                </p>
                                                <p className={`${balance < 0 ? 'text-red-500' : 'text-green-500'} text-[16px] -mt-[4px] text-right`}>
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
            <Modal setShowModal={setShowModal} showModal={showModal} fetchFriends={fetchFriends} />
        </MainLayout>
    );
};

export default Friends;
