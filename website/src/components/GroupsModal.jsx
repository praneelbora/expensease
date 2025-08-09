// components/GroupsModal.jsx
import { useEffect, useMemo, useState } from "react";
import ModalWrapper from "./ModalWrapper";
import { useAuth } from "../context/AuthContext";
import { joinGroup, createGroup } from "../services/GroupService";
import { getFriends } from "../services/FriendService";

// tiny copy helper
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

export default function GroupsModal({ setShowModal, showModal, fetchGroups }) {
    const { userToken } = useAuth() || {};
    const [mode, setMode] = useState("create"); // 'create' | 'join'

    // create state
    const [groupName, setGroupName] = useState("");
    const [friends, setFriends] = useState([]);
    const [query, setQuery] = useState("");
    const [selectedFriends, setSelectedFriends] = useState([
        { _id: "me", name: "Me", selected: true },
    ]);
    const [deleteConfirmMap, setDeleteConfirmMap] = useState({});

    // join state
    const [joinCode, setJoinCode] = useState("");
    const [errorMessage, setErrorMessage] = useState("");

    // success state
    const [groupCreatedCode, setGroupCreatedCode] = useState("");

    const { copied, copy } = useCopy();

    const onClose = () => {
        // reset transient states on close
        setErrorMessage("");
        setJoinCode("");
        setGroupCreatedCode("");
        setShowModal(false);
    };

    // load friends when modal opens
    useEffect(() => {
        if (!showModal) return;
        setMode("create");
        setJoinCode("");
        setErrorMessage("");
        setGroupCreatedCode("");
        (async () => {
            try {
                const list = await getFriends(userToken);
                if (Array.isArray(list)) {
                    // mark selected property
                    setFriends(list.map((f) => ({ ...f, selected: false })));
                }
            } catch (e) {
                // fail silent
            }
        })();
    }, [showModal, userToken]);

    // filter (exclude selected)
    const filteredFriends = useMemo(() => {
        const q = query.trim().toLowerCase();
        return friends.filter(
            (f) =>
                !f.selected &&
                (f.name?.toLowerCase().includes(q) || f.email?.toLowerCase().includes(q))
        );
    }, [friends, query]);

    const ensureMeFirst = (arr) => [
        { _id: "me", name: "Me", selected: true },
        ...arr.filter((f) => f._id !== "me"),
    ];

    const toggleFriendSelection = (friend) => {
        if (friend._id === "me") return;
        const next = friends.map((f) =>
            f._id === friend._id ? { ...f, selected: !f.selected } : f
        );
        setFriends(next);
        setSelectedFriends(
            ensureMeFirst([{ _id: "me", name: "Me", selected: true }, ...next.filter((f) => f.selected)])
        );
    };

    const handleRemoveFriend = (friend) => {
        if (friend._id === "me") return;
        if (deleteConfirmMap[friend._id]) {
            const next = friends.map((f) =>
                f._id === friend._id ? { ...f, selected: false } : f
            );
            setFriends(next);
            setSelectedFriends(
                ensureMeFirst([{ _id: "me", name: "Me", selected: true }, ...next.filter((f) => f.selected)])
            );
            setDeleteConfirmMap((prev) => {
                const copy = { ...prev };
                delete copy[friend._id];
                return copy;
            });
        } else {
            setDeleteConfirmMap((prev) => ({ ...prev, [friend._id]: true }));
        }
    };

    const handleCreateGroup = async () => {
        try {
            const payloadMembers = selectedFriends
                .filter((f) => f._id !== "me")
                .map((f) => ({ _id: f._id, name: f.name }));
            const res = await createGroup(groupName, payloadMembers, userToken);
            // Assuming API returns { code: "ABCD", ... }
            const code = res?.code || "";
            setGroupCreatedCode(code);
            fetchGroups?.();
            setGroupName("");
            setSelectedFriends([{ _id: "me", name: "Me", selected: true }]);
            setDeleteConfirmMap({});
            setQuery("");
        } catch (error) {
            setErrorMessage(error?.message || "Failed to create group");
        }
    };

    const handleJoinGroup = async () => {
        setErrorMessage("");
        try {
            const code = joinCode.trim().toUpperCase();
            if (code.length !== 4) {
                throw new Error("Enter a valid 4-character code");
            }
            const data = await joinGroup(code, userToken);
            if (data?.success === false) {
                throw new Error(data?.message || "Failed to join group");
            }
            fetchGroups?.();
            setJoinCode("");
            setErrorMessage("");
            setGroupCreatedCode("");
            setShowModal(false);
        } catch (error) {
            setErrorMessage(error?.message || "Failed to join group");
        }
    };

    // footer actions
    const footer =
        groupCreatedCode ? null : (
            <button
                onClick={mode === "create" ? handleCreateGroup : handleJoinGroup}
                disabled={
                    mode === "create" ? groupName.trim().length === 0 : joinCode.trim().length !== 4
                }
                className={`w-full py-2 border rounded-[8px] text-[#000] transition ${(mode === "create" ? groupName.trim().length > 0 : joinCode.trim().length === 4)
                        ? "bg-teal-300 border-teal-300 cursor-pointer"
                        : "bg-gray-500 border-gray-500 cursor-not-allowed"
                    }`}
            >
                {mode === "create" ? "Create Group" : "Join Group"}
            </button>
        );

    if (!showModal) return null;

    return (
        <ModalWrapper
            show={!!showModal}
            onClose={onClose}
            title="Add a Group"
            size="xl"
            footer={footer}
        >
            <div className="flex flex-col gap-6">
                {/* Success block */}
                {groupCreatedCode ? (
                    <div className="flex flex-col items-center justify-center text-teal-500 rounded-lg text-center">
                        <p className="text-lg font-semibold">🎉 Group Created Successfully!</p>
                        <p className="text-sm mt-1">Share this code with friends to join:</p>

                        <div className="text-2xl font-bold bg-[#EBF1D5] text-[#121212] px-4 py-2 rounded-md mt-2 tracking-widest">
                            {groupCreatedCode}
                        </div>

                        <div className="mt-4 flex items-center gap-2">
                            <button
                                onClick={() =>
                                    copy(
                                        `Join my group on SplitFree using this code: ${groupCreatedCode}
Click this link to login & join now:
${import.meta.env.VITE_FRONTEND_URL}/groups/join/${groupCreatedCode}`
                                    )
                                }
                                className={`px-4 py-2 rounded-lg text-sm font-medium ${copied
                                        ? "bg-teal-500 text-[#121212]"
                                        : "bg-teal-400 hover:bg-teal-300 text-[#121212]"
                                    }`}
                            >
                                {copied ? "✓ Copied" : "Copy Invite"}
                            </button>
                            <button
                                onClick={() => {
                                    const shareData = {
                                        title: "Join my SplitFree group",
                                        text: `Use code ${groupCreatedCode} to join my group on SplitFree.`,
                                        url: `${import.meta.env.VITE_FRONTEND_URL}/groups/join/${groupCreatedCode}`,
                                    };
                                    if (navigator.share) {
                                        navigator.share(shareData).catch(() => {
                                            copy(`${shareData.text}\n${shareData.url}`);
                                        });
                                    } else {
                                        copy(`${shareData.text}\n${shareData.url}`);
                                    }
                                }}
                                className="px-4 py-2 rounded-lg text-sm font-medium border border-teal-500 hover:bg-[#2a2a2a]"
                            >
                                Share
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Mode toggle */}
                        <div className="flex items-center justify-center">
                            <div className="flex border border-[#EBF1D5] rounded-full p-1 bg-[#121212]">
                                <button
                                    onClick={() => {
                                        setMode("create");
                                        setErrorMessage("");
                                    }}
                                    className={`px-6 py-1.5 rounded-full text-sm transition-all duration-200 font-medium ${mode === "create"
                                            ? "bg-[#EBF1D5] text-[#121212]"
                                            : "text-[#EBF1D5] hover:bg-[#2a2a2a]"
                                        }`}
                                >
                                    Create Group
                                </button>
                                <button
                                    onClick={() => {
                                        setMode("join");
                                        setErrorMessage("");
                                    }}
                                    className={`px-6 py-1.5 rounded-full text-sm transition-all duration-200 font-medium ${mode === "join"
                                            ? "bg-[#EBF1D5] text-[#121212]"
                                            : "text-[#EBF1D5] hover:bg-[#2a2a2a]"
                                        }`}
                                >
                                    Join Group
                                </button>
                            </div>
                        </div>

                        {mode === "create" ? (
                            <div className="flex flex-col gap-3">
                                <input
                                    className="bg-[#121212] text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base min-h-[40px] pl-3"
                                    placeholder="New Group Name"
                                    value={groupName}
                                    onChange={(e) => setGroupName(e.target.value)}
                                />

                                <input
                                    className="bg-[#121212] text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base min-h-[40px] pl-3"
                                    placeholder="Search Friends"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                />

                                {/* selected chips */}
                                <div className="flex flex-wrap gap-2">
                                    {selectedFriends.map((friend) => (
                                        <div
                                            key={`sel-${friend._id}`}
                                            className={`flex items-center gap-1 h-[30px] ${friend._id !== "me" ? "ps-3" : "px-3"
                                                } overflow-hidden rounded-xl border border-[#81827C] bg-[#121212] text-sm text-[#EBF1D5]`}
                                        >
                                            <p className="capitalize">{friend.name}</p>
                                            {friend._id !== "me" && (
                                                <button
                                                    onClick={() => handleRemoveFriend(friend)}
                                                    className={`px-2 h-full pb-[2px] ${deleteConfirmMap[friend._id] ? "bg-red-500" : "bg-transparent"
                                                        }`}
                                                    title={deleteConfirmMap[friend._id] ? "Confirm remove" : "Remove"}
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* results */}
                                {filteredFriends.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 px-2 max-h-[40dvh] overflow-y-auto border border-[#333]">
                                        {filteredFriends.map((f) => (
                                            <button
                                                key={f._id}
                                                type="button"
                                                onClick={() => toggleFriendSelection(f)}
                                                className="text-left"
                                            >
                                                <div className="flex flex-row w-full justify-between items-center">
                                                    <div className="flex flex-col">
                                                        <h2 className="text-xl capitalize text-[#EBF1D5]">{f.name}</h2>
                                                        <p className="lowercase text-[#81827C]">{f.email}</p>
                                                    </div>
                                                </div>
                                                <hr className="border-[#2a2a2a] mt-2" />
                                            </button>
                                        ))}{filteredFriends.map((f) => (
                                            <button
                                                key={f._id}
                                                type="button"
                                                onClick={() => toggleFriendSelection(f)}
                                                className="text-left"
                                            >
                                                <div className="flex flex-row w-full justify-between items-center">
                                                    <div className="flex flex-col">
                                                        <h2 className="text-xl capitalize text-[#EBF1D5]">{f.name}</h2>
                                                        <p className="lowercase text-[#81827C]">{f.email}</p>
                                                    </div>
                                                </div>
                                                <hr className="border-[#2a2a2a] mt-2" />
                                            </button>
                                        ))}{filteredFriends.map((f) => (
                                            <button
                                                key={f._id}
                                                type="button"
                                                onClick={() => toggleFriendSelection(f)}
                                                className="text-left"
                                            >
                                                <div className="flex flex-row w-full justify-between items-center">
                                                    <div className="flex flex-col">
                                                        <h2 className="text-xl capitalize text-[#EBF1D5]">{f.name}</h2>
                                                        <p className="lowercase text-[#81827C]">{f.email}</p>
                                                    </div>
                                                </div>
                                                <hr className="border-[#2a2a2a] mt-2" />
                                            </button>
                                        ))}
                                    </div>
                                ) : query.length > 0 && selectedFriends.length === 1 ? (
                                    <p className="text-[#55554f]">No friends found. Try a different search.</p>
                                ) : null}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <input
                                    type="text"
                                    value={joinCode}
                                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                    placeholder="Enter 4-character Group Code"
                                    maxLength={4}
                                    className="bg-[#121212] text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base min-h-[40px] pl-3 uppercase tracking-widest"
                                />
                                {errorMessage && (
                                    <p className="text-red-400 text-sm font-medium text-center">{errorMessage}</p>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </ModalWrapper>
    );
}
