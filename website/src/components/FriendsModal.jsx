// components/FriendsModal.jsx
import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import ModalWrapper from "./ModalWrapper";
import {
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    fetchSentRequests,
    fetchReceivedRequests,
} from "../services/FriendService";
import { logEvent } from "../utils/analytics";

// Small copy helper with auto-hide flag
function useCopy(timeoutMs = 1800) {
    const [copied, setCopied] = useState(false);
    const copy = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), timeoutMs);
            return true;
        } catch {
            setCopied(false);
            return false;
        }
    };
    return { copied, copy };
}

export default function FriendsModal({ setShowModal, showModal, fetchFriends }) {
    const { userToken, loadUserData, user } = useAuth();
    const [val, setVal] = useState("");
    const [sent, setSent] = useState([]);
    const [received, setReceived] = useState([]);

    // Invite link + message
    const friendLink = `${import.meta.env.VITE_FRONTEND_URL}/friends/add/${user?._id || ""}`;
    const message = `Let's connect on Expensease! 🤝

Tap this link to login and send me a friend request:
${friendLink}`;

    const { copied, copy } = useCopy();

    // Share handler with copy fallback
    const handleShare = async () => {
        logEvent('invite_friend_share',
            { screen: 'friends', surface: 'modal' }
        );
        if (navigator.share) {
            try {
                await navigator.share({
                    title: "Add me on Expensease!",
                    text: "Join me on Expensease and send me a friend request:",
                    url: friendLink,
                });
                return;
            } catch {
                // fall through to copy
            }
        }
        const ok = await copy(message);
        if (!ok) alert("Could not copy. Please copy the link manually.");
    };

    // Actions
    const handleAddFriend = async () => {
        if (!val?.trim()) return;
        logEvent('friend_request_send', {
            screen: 'friends', surface: 'modal', source: 'email'
        });
        try {
            const data = await sendFriendRequest(val.trim(), userToken);
            console.log(data.message || "Friend request sent!");
            fetchFriends?.();
            handleSentRequests();
            handleReceivedRequests();
            setVal("");
        } catch (err) {
            console.log(err.message || "Something went wrong.");
        }
    };

    const handleAccept = async (id) => {
        try {
            logEvent('friend_request_accept', {
                screen: 'friends', surface: 'modal'
            });
            await acceptFriendRequest(id, userToken);
            fetchFriends?.();
            handleSentRequests();
            handleReceivedRequests();
        } catch (err) {
            console.log(err.message || "Error accepting request");
        }
    };

    const handleReject = async (id) => {
        try {
            logEvent('friend_request_reject', {
                screen: 'friends', surface: 'modal'
            });
            await rejectFriendRequest(id, userToken);
            fetchFriends?.();
            handleSentRequests();
            handleReceivedRequests();
        } catch (err) {
            console.log(err.message || "Error rejecting request");
        }
    };

    const handleCancel = async (id) => {
        try {
            logEvent('friend_request_cancel', {
                screen: 'friends', surface: 'modal'
            });
            await cancelFriendRequest(id, userToken);
            fetchFriends?.();
            handleSentRequests();
            handleReceivedRequests();
        } catch (err) {
            console.log(err.message || "Error cancelling request");
        }
    };

    // Data fetchers
    const handleSentRequests = async () => {
        try {
            const res = await fetchSentRequests(userToken);
            setSent(res || []);
        } catch { }
    };

    const handleReceivedRequests = async () => {
        try {
            const res = await fetchReceivedRequests(userToken);
            setReceived(res || []);
        } catch { }
    };

    useEffect(() => {
        loadUserData?.();
    }, []);

    useEffect(() => {
        handleSentRequests();
        handleReceivedRequests();
    }, []);

    if (!showModal) return null;

    return (
        <ModalWrapper
            show={!!showModal}
            onClose={() => setShowModal(false)}
            title="Add Friends"
            size="xl"
        >
            {/* BODY */}
            <div className="w-full flex flex-col gap-6">
                {/* Invite card */}
                <div className="rounded-xl border border-[#2a2a2a] bg-[#151515] p-3">
                    <p className="text-sm text-[#a0a0a0] mb-2">Invite a friend</p>

                    <div className="flex flex-col gap-2">
                        <input
                            className="flex-1 bg-[#1f1f1f] text-[#EBF1D5] border border-[#333] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4b8]"
                            value={friendLink}
                            readOnly
                            onFocus={(e) => e.target.select()}
                            aria-label="Invite link"
                        />
                        <div className="flex items-stretch gap-2">
                            <button
                                onClick={() => {
                                    logEvent('invite_friend_copy',
                                        { screen: 'friends', surface: 'modal' }
                                    );
                                    copy(message)
                                }
                                }
                                className={`px-3 py-2 rounded-lg border text-sm transition ${copied
                                    ? "border-teal-500 text-black bg-teal-500"
                                    : "border-[#55554f] text-[#EBF1D5] hover:bg-[#222]"
                                    }`}
                                aria-live="polite"
                            >
                                {copied ? "Copied" : "Copy"}
                            </button>
                            <button
                                onClick={handleShare}
                                className="px-3 py-2 rounded-lg border border-[#55554f] text-[#EBF1D5] text-sm hover:bg-[#222] inline-flex items-center gap-2"
                            >
                                <Share2 strokeWidth={2} size={16} />
                                Share
                            </button>
                        </div>
                    </div>

                    <p className="text-xs text-[#8f8f8f] mt-2">
                        Copy or share your invite link. Friends who open it can send you a request instantly.
                    </p>

                    {copied && (
                        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-teal-500/10 text-teal-300 border border-teal-600 px-3 py-1 text-xs">
                            ✓ Invite text copied
                        </div>
                    )}
                </div>

                {/* Add by email */}
                <div className="w-full flex flex-row gap-3 items-center">
                    <input
                        className="bg-[#1f1f1f] text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base min-h-[40px] pl-3 flex-1"
                        placeholder="Enter Email ID"
                        value={val}
                        onChange={(e) => setVal(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddFriend();
                        }}
                    />
                    <button
                        className="border-[#EBF1D5] text-[#EBF1D5] border h-[40px] px-3 rounded-md hover:bg-[#2a2a2a] disabled:opacity-50"
                        onClick={handleAddFriend}
                        disabled={!val?.trim()}
                    >
                        Add
                    </button>
                </div>

                {/* Received requests */}
                <div className="w-full gap-3">
                    {received.length > 0 && (
                        <div className="mt-1 border border-[#121212] rounded-xl ">
                            <div className="bg-[#121212] px-4 py-3 border-b border-[#121212] rounded-t-xl">
                                <h3 className="text-sm tracking-wide uppercase text-teal-500">FRIEND REQUESTS</h3>
                            </div>

                            <hr className="border-[#121212]" />
                            <div className=" px-4 pb-4 pt-1 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                                {received.map((req) => (
                                    <div key={req._id} className=" flex flex-col gap-2 pt-2">
                                        <div className="flex flex-row w-full h-[50px] justify-between items-center">
                                            <div className="flex flex-col h-full justify-around">
                                                <p className="text-[18px] text-[#EBF1D5] capitalize">
                                                    {req.sender.name}
                                                </p>
                                                <p className="text-[11px] text-[#888] lowercase">
                                                    {req.sender.email}
                                                </p>
                                            </div>
                                            <div className="flex flex-row w-min gap-2">
                                                <button
                                                    className="border-teal-500 text-teal-500 border h-[40px] px-2 rounded-md hover:bg-[#1b3522]"
                                                    onClick={() => handleAccept(req._id)}
                                                >
                                                    Accept
                                                </button>
                                                <button
                                                    className="border-[#EA4335] text-[#EA4335] border h-[40px] px-3 rounded-md hover:bg-[#3a1d1c]"
                                                    onClick={() => handleReject(req._id)}
                                                    title="Reject"
                                                    aria-label="Reject"
                                                >
                                                    X
                                                </button>
                                            </div>
                                        </div>
                                        <hr className="border-[#2a2a2a]" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Sent requests */}
                    {sent.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <p className="uppercase text-[#EBF1D5]">Sent Requests</p>
                            <div className="w-full flex flex-col">
                                <hr className="border-[#2a2a2a]" />
                                {sent.map((req) => (
                                    <div key={req._id} className="flex flex-col gap-2 pt-2">
                                        <div className="flex flex-row w-full h-[50px] justify-between items-center">
                                            <div className="flex flex-col h-full justify-around">
                                                <p className="text-[18px] text-[#EBF1D5] capitalize">
                                                    {req.receiver.name}
                                                </p>
                                                <p className="text-[11px] text-[#EBF1D5] lowercase">
                                                    {req.receiver.email}
                                                </p>
                                            </div>
                                            <div className="flex flex-row w-min">
                                                <button
                                                    className="border-[#EA4335] text-[#EA4335] border h-[40px] px-2 rounded-md hover:bg-[#3a1d1c]"
                                                    onClick={() => handleCancel(req._id)}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                        <hr className="border-[#2a2a2a]" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </ModalWrapper>
    );
}
