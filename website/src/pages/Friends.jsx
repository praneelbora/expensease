import { useEffect, useRef, useState } from "react";
import MainLayout from '../layouts/MainLayout';
import Modal from '../components/FriendsModal';
import FriendExpenseModal from '../components/FriendExpenseModal';
import { useAuth } from "../context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { getFriends, acceptLinkFriendRequest } from "../services/FriendService";
import { fetchReceivedRequests, acceptFriendRequest, rejectFriendRequest } from "../services/FriendService";
import { getAllExpenses } from "../services/ExpenseService";
import {
    Users,
    Wallet,
    Plus,
    List,
    User,
    Loader,
} from "lucide-react";
import PullToRefresh from "pulltorefreshjs";
const Friends = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const { userToken } = useAuth() || {}
    const [friends, setFriends] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState([]); // ✅ Array of expenses
    const [userId, setUserId] = useState(null);
    const [selectedFriend, setSelectedFriend] = useState(null);
    const [showFriendExpenseModal, setShowFriendExpenseModal] = useState(false);
    const round = (val) => Math.round(val * 100) / 100;
    const [receivedRequests, setReceivedRequests] = useState([]);
    const scrollRef = useRef(null);

    const [refreshing, setRefreshing] = useState(false);

    const doRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([fetchReceived(), fetchFriends(), fetchExpenses()]);
        } finally {
            setRefreshing(false);
        }
    };
    useEffect(() => {
        if (!scrollRef.current) return;

        PullToRefresh.init({
            mainElement: scrollRef.current,
            onRefresh: doRefresh,
            distThreshold: 60,
            distMax: 120,
            resistance: 2.5,
            shouldPullToRefresh: () =>
                scrollRef.current && scrollRef.current.scrollTop === 0,
        });

        return () => {
            PullToRefresh.destroyAll(); // correct cleanup
        };
    }, []);

    const handleAccept = async (id) => {
        try {
            setLoading(true)
            await acceptFriendRequest(id, userToken);
            fetchFriends();
            fetchReceived()
            setShowModal(false);
            setLoading(false)
        } catch (err) {
            console.log(err.message || "Error accepting request");
        }
    }; const handleReject = async (id) => {
        try {
            setLoading(true)
            await rejectFriendRequest(id, userToken);
            fetchFriends();
            fetchReceived()
            setShowModal(false);
            setLoading(false)
        } catch (err) {
            console.log(err.message || "Error accepting request");
        }
    };


    // top of Friends component state
    const [banner, setBanner] = useState(null);
    // banner shape: { type: 'success' | 'error' | 'info', text: string }

    const fetchReceived = async () => {
        try {
            const data = await fetchReceivedRequests(userToken);
            setReceivedRequests(data.slice(0, 4)); // show only first 2-4
        } catch (err) {
            console.error("Error fetching received requests:", err);
        }
    };

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
        fetchReceived()
        fetchFriends();
        fetchExpenses();
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

            if (data?.error || data?.message?.toLowerCase?.().includes("error")) {
                const errorMsg = data.message || data.error || "Failed to send friend request.";
                setBanner({ type: 'error', text: errorMsg });
                return;
            }

            // refresh incoming requests (typo fixed)
            await fetchReceived();

            setBanner({
                type: 'success',
                text: "Friend request sent. Ask them to accept it before you can add shared expenses."
            });

            // auto-dismiss after 5s (optional)
            setTimeout(() => setBanner(null), 5000);
        } catch (error) {
            console.error("Error sending link request:", error);
            setBanner({ type: 'error', text: "Something went wrong. Please try again." });
        }
    };


    return (
        <MainLayout>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <h1 className="text-3xl font-bold capitalize">All Friends</h1>
                    <button
                        className={`flex flex-col items-center justify-center z-10 bg-lime-200 text-black w-8 h-8 rounded-full shadow-md text-2xl`}
                        onClick={() => setShowModal(true)}
                    >
                        <Plus strokeWidth={3} size={20} />
                    </button>
                </div>
                {banner && (
                    <div className={`mt-2 mb-2 rounded-md px-3 py-2 text-sm border 
    ${banner.type === 'success' ? 'bg-teal-900/30 border-teal-500 text-teal-200' :
                            banner.type === 'error' ? 'bg-red-900/30 border-red-500 text-red-200' :
                                'bg-zinc-800 border-zinc-600 text-zinc-200'}`}>
                        <div className="flex items-start justify-between gap-4">
                            <p className="leading-5">{banner.text}</p>
                            <button
                                className="opacity-70 hover:opacity-100"
                                onClick={() => setBanner(null)}
                                aria-label="Dismiss"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}
                {refreshing && (
                    <div className="text-center text-xs text-lime-200 py-1">Refreshing…</div>
                )}

                <div
                    ref={scrollRef}
                    className="flex flex-col flex-1 w-full overflow-y-auto pt-2 no-scrollbar scroll-touch"
                >

                    {loading ? (
                        <div className="flex flex-col justify-center items-center flex-1 py-5">
                            <Loader />
                        </div>
                    ) : friends.length === 0 && receivedRequests.length === 0 ? (
                        <div className="flex flex-col flex-1 justify-center">
                            <div className="bg-[#1f1f1f] text-center text-[#EBF1D5] border border-[#333] p-4 rounded-lg mt-4">
                                <p className="text-lg font-semibold mb-2">No friends yet!</p>
                                <p className="text-sm text-[#bbb] mb-4">To split expenses, add friends.</p>
                                <div className="flex justify-center gap-4">
                                    <button
                                        onClick={() => setShowModal(true)}
                                        className="bg-teal-500 text-black px-4 py-2 rounded hover:bg-teal-400 transition"
                                    >
                                        Add Friend
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-3 gap-x-4">
                            {receivedRequests.length > 0 && (
                                <div className="rounded-lg">
                                    <h2 className="text-teal-500 pb-2 uppercase">Friend Requests</h2>
                                    <hr />
                                    {receivedRequests.map((req) => {
                                        return (
                                            <div className="flex flex-col gap-2 mt-2">
                                                <div className="flex flex-row w-full h-[50px] justify-between items-center">
                                                    <div className="flex flex-col h-full justify-around">
                                                        <p className="text-[18px] text-[#EBF1D5] capitalize">{req.sender.name}</p>
                                                        <p className="text-[11px] text-[#EBF1D5] lowercase">{req.sender.email}</p>
                                                    </div>
                                                    <div className="flex flex-row w-min gap-2">
                                                        <button className="border-[#34C759] text-[#34C759] border-[1px] h-[40px] px-2 rounded-md" onClick={() => handleAccept(req._id)}>Accept</button>
                                                        <button className="border-[#EA4335] text-[#EA4335] border-[1px] h-[40px] px-3 rounded-md" onClick={() => handleReject(req._id)}>X</button>
                                                    </div>
                                                </div>
                                                <hr />
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

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
                                                balance += round(split.oweAmount) || 0;
                                            }
                                            if (split.paying) {
                                                balance -= round(split.payAmount) || 0;
                                            }
                                        }
                                    });
                                });

                                return (
                                    <div onClick={() => {
                                        navigate(`/friends/${friend._id}`)
                                    }} key={friend._id} className="flex flex-col gap-2 h-[45px]">
                                        <div className="flex flex-1 flex-row justify-between items-center align-middle">
                                            <h2 className="text-xl font-semibold capitalize">{friend.name}</h2>
                                            {round(balance) !== 0 && !isNaN(balance) && (
                                                <div className="flex flex-col">
                                                    <p className={`${balance < 0 ? 'text-red-500' : 'text-teal-500'} text-[11px] text-right`}>
                                                        {round(balance) < 0 ? 'you owe' : 'you are owed'}
                                                    </p>
                                                    <p className={`${balance < 0 ? 'text-red-500' : 'text-teal-500'} text-[14px] -mt-[4px] text-right`}>
                                                        ₹ {Math.abs(balance.toFixed(2))}
                                                    </p>
                                                </div>
                                            )}

                                        </div>
                                        <hr />
                                    </div>
                                );
                            })}
                            <p className="text-center text-sm text-lime-100">
                                {friends.length} Friends
                            </p>


                        </div>
                    )}
                </div>
            </div>
            <Modal setShowModal={setShowModal} showModal={showModal} fetchFriends={fetchFriends} userToken={userToken} />
            {showFriendExpenseModal && selectedFriend && (
                <FriendExpenseModal
                    show={showFriendExpenseModal}
                    onClose={() => setShowFriendExpenseModal(false)}
                    friend={selectedFriend}
                    expenses={expenses.filter(exp =>
                        exp.splits.some(split => split.friendId?._id === selectedFriend._id)
                    )}
                    userId={userId}
                    userToken={userToken}
                    onSettle={fetchExpenses}
                />
            )}

        </MainLayout>
    );
};

export default Friends;
