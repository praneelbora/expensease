import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getGroupDetails, updateGroupName, leaveGroup, deleteGroup, removeMember, promoteMember, demoteMember } from "../services/GroupService";
import MainLayout from "../layouts/MainLayout";
import { ChevronLeft, Loader } from "lucide-react";
import { getFriends, sendFriendRequest } from "../services/FriendService";
import { getGroupExpenses, updateGroupPrivacySetting } from "../services/GroupService";
import ModalWrapper from "../components/ModalWrapper";
import { getSymbol } from "../utils/currencies"
import { fetchReceivedRequests, fetchSentRequests, acceptFriendRequest, rejectFriendRequest } from "../services/FriendService";

import { useMemo } from "react";
import { logEvent } from "../utils/analytics";
import SEO from "../components/SEO";

export default function GroupSettings() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, userToken } = useAuth();
    const [group, setGroup] = useState(null);
    const [newGroupName, setNewGroupName] = useState("");
    const [loading, setLoading] = useState(false);
    const [friends, setFriends] = useState([]);
    const [groupExpenses, setGroupExpenses] = useState([]);
    const [adminEnforcedPrivacy, setAdminEnforcedPrivacy] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null);
    // 'leave' | 'delete' | null
    const [busyAction, setBusyAction] = useState(false);
    const [receivedRequests, setReceivedRequests] = useState([]);
    const [sentRequests, setSentRequests] = useState([]);


    // ...
    const isOwner = useMemo(() => {
        const gId = group?.createdBy?._id ?? group?.createdBy;  // supports populated or raw id
        const uId = user?._id ?? user?.id;
        if (!gId || !uId) return false;
        return String(gId) === String(uId);
    }, [group?.createdBy, user?._id, user?.id]);

    const fetchFriends = async () => {
        try {
            const data = await getFriends(userToken)
            setFriends(data);
        } catch (err) {
            console.error("Error fetching friends:", err);
        }
    };
    const [totals, setTotals] = useState(null);
    const fetchGroupExpenses = async () => {
        try {
            const data = await getGroupExpenses(id, userToken)
            setGroupExpenses(data.expenses);
        } catch (error) {
            // console.error("Group Details Page - Error loading group expenses:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!group || !user?._id) return;

        // init totals as maps: { [currency]: amount }
        const totals = {
            expense: {},       // what you owe
            yourExpense: {},   // your share of group expenses
            balance: {},       // paid - owed
            groupExpense: {},  // total group expenses
        };

        groupExpenses?.forEach(exp => {
            const code = exp.currency || "INR";
            exp.splits.forEach(split => {
                if (exp.typeOf === "expense") {
                    totals.groupExpense[code] = (totals.groupExpense[code] || 0) + (split.oweAmount || 0);
                }
                if (split.friendId?._id === user._id) {
                    totals.expense[code] = (totals.expense[code] || 0) + (split.oweAmount || 0);
                    totals.balance[code] = (totals.balance[code] || 0) + ((split.payAmount || 0) - (split.oweAmount || 0));
                    if (exp.typeOf === "expense") {
                        totals.yourExpense[code] = (totals.yourExpense[code] || 0) + (split.oweAmount || 0);
                    }
                }
            });
        });

        setTotals(totals);
    }, [groupExpenses, group, user?._id]);

    useEffect(() => {
        fetchGroup();
        fetchGroupExpenses()
        fetchFriends();
        fetchReceived()
        fetchSent()
    }, [id]);
    const addFriend = async (email) => {
        try {
            const data = await sendFriendRequest(email, userToken)
            console.log(data.message || "Friend request sent!");
            fetchFriends();
            fetchSent()
        } catch (err) {
            console.error("Error adding friend:", err);
            console.log("Something went wrong.");
        }
    };
    const fetchReceived = async () => {
        try {
            const data = await fetchReceivedRequests(userToken);
            const map = new Map();
            data.forEach((req) => {
                map.set(req.sender._id, req._id); // store requestId
            });
            setReceivedRequests(map);
        } catch (err) {
            console.error("Error fetching received requests:", err);
        }
    };

    const fetchSent = async () => {
        try {
            const data = await fetchSentRequests(userToken);
            const map = new Map();
            data.forEach((req) => {
                map.set(req.receiver._id, req._id); // store requestId
            });
            setSentRequests(map);
        } catch (err) {
            console.error("Error fetching sent requests:", err);
        }
    };


    async function fetchGroup() {
        setLoading(true)
        const data = await getGroupDetails(id, userToken);
        setGroup(data);
        setNewGroupName(data.name);
        setAdminEnforcedPrivacy(data?.settings?.enforcePrivacy || false);
        setLoading(false)
    }

    async function handleGroupRename() {
        logEvent('group_rename')
        await updateGroupName(id, newGroupName, userToken);
        fetchGroup();
    }

    async function handleLeaveGroup() {
        if (confirm("Are you sure you want to leave the group?")) {
            await leaveGroup(id, userToken);
            navigate("/groups");
        }
    }

    async function handleDeleteGroup() {
        if (confirm("This will delete the group permanently. Proceed?")) {
            await deleteGroup(id, userToken);
            navigate("/groups");
        }
    }

    async function handleRemoveMember(memberId) {
        await removeMember(id, memberId, userToken);
        fetchGroup();
    }

    async function handlePromote(memberId) {
        await promoteMember(id, memberId, userToken);
        fetchGroup();
    }

    async function handleDemote(memberId) {
        await demoteMember(id, memberId, userToken);
        fetchGroup();
    }
    return (
        <MainLayout groupId={id}>
            <SEO
                title={`Group Settings | Expensease`}
                description={`Adjust settings for a specific group and manage expense preferences in Expensease.`}
                canonical={`https://www.expensease.in/groups/settings/:id`}
                schema={{
                    "@context": "https://schema.org",
                    "@type": "ProfilePage",
                    "name": "Group Settings | Expensease",
                    "description": `Adjust settings for a specific group and manage expense preferences in Expensease.`,
                    "url": `https://www.expensease.in/groups/settings/:id`
                }}
            />
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <div className="flex flex-row gap-2">
                        <button onClick={() => {
                            logEvent('navigate', {
                                fromScreen: 'group_settings', toScreen: 'group_detail', source: 'back'
                            })
                            navigate(`/groups/${id}`)
                        }}>
                            <ChevronLeft />
                        </button>
                        <h1 className="text-3xl font-bold capitalize">Group Settings</h1>
                    </div>
                </div>
                <div className="flex flex-col flex-1 w-full overflow-y-auto pt-3 no-scrollbar">
                    {loading ? (
                        <div className="flex flex-col justify-center items-center flex-1 py-5">
                            <Loader />
                        </div>
                    ) : !group ? (
                        <p>Group not found</p>
                    ) : (
                        <div className="flex flex-col gap-y-3 gap-x-4">

                            <div className="flex flex-col gap-2 ">
                                <label className="block text-[14px] uppercase text-teal-500">Group Name</label>
                                <input
                                    value={newGroupName}
                                    onChange={(e) => setNewGroupName(e.target.value)}
                                    className="p-2 border rounded w-full"
                                />
                                {newGroupName != group?.name && <button
                                    onClick={handleGroupRename}
                                    className="mt-2 px-4 py-2 bg-teal-500 text-white rounded"
                                >
                                    Save
                                </button>}
                            </div>
                            {/* Net Balance Summary Box */}
                            {totals && Object.keys(totals?.balance).length > 0 && (
                                <div className="bg-[#1E1E1E] p-4 rounded-xl shadow space-y-6 mt-4">
                                    <h2 className="text-xl font-semibold mb-2">Summary</h2>

                                    {Object.keys(totals?.balance || {}).map(code => {
                                        const bal = totals.balance[code] || 0;
                                        const yourExp = totals.yourExpense[code] || 0;
                                        const groupExp = totals.groupExpense[code] || 0;
                                        const sym = getSymbol(code);

                                        return (
                                            <div
                                                key={code}
                                                className="border-t border-[#2A2A2A] pt-4 space-y-4"
                                            >
                                                {/* Balance section */}
                                                <div>
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

                                                {/* Expenses section */}
                                                <div className="grid grid-cols-2 gap-4 text-sm text-gray-400">
                                                    <div className="flex flex-col bg-[#2A2A2A] p-3 rounded-lg">
                                                        <span className="text-xs text-gray-400">Your Expenses</span>
                                                        <span className="text-teal-500 text-lg font-semibold">
                                                            {sym} {yourExp.toFixed(2)}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col bg-[#2A2A2A] p-3 rounded-lg">
                                                        <span className="text-xs text-gray-400">Group Expenses</span>
                                                        <span className="text-teal-500 text-lg font-semibold">
                                                            {sym} {groupExp.toFixed(2)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}


                            <div>
                                <h3 className="font-medium mb-2 text-[14px] uppercase text-teal-500">Members</h3>
                                <ul className="space-y-3">
                                    {group?.members.map((member) => {
                                        const isMe = member?._id === user?._id;
                                        const isFriend = friends.some(friend => friend?._id === member?._id);

                                        return (
                                            <li key={member._id} className="flex items-center justify-between">
                                                <div>
                                                    {member.name} {isMe && "(You)"}
                                                    {/* {group?.admins?.includes(member._id) && <span className="ml-2 text-xs bg-gray-200 px-1 rounded">Admin</span>} */}
                                                </div>
                                                <div className="space-x-2">
                                                    {(!isMe && !isFriend) && (<>

                                                        {!sentRequests?.has(member._id) && !receivedRequests?.has(member._id) ? (
                                                            <button
                                                                onClick={() => {
                                                                    logEvent('friend_request_sent', {
                                                                        screen: 'group_settings',
                                                                    })
                                                                    addFriend(member.email)
                                                                }}
                                                                className="text-sm text-teal-500"
                                                            >
                                                                Add Friend
                                                            </button>
                                                        ) : sentRequests?.has(member._id) ? (
                                                            <button
                                                                disabled
                                                                className="text-sm text-gray-500 cursor-not-allowed"
                                                            >
                                                                Request Sent
                                                            </button>
                                                        ) : (
                                                            <div className="flex flex-row gap-3">
                                                                <button
                                                                    onClick={async () => {
                                                                        const requestId = receivedRequests.get(member._id);
                                                                        await acceptFriendRequest(requestId, userToken);
                                                                        logEvent('friend_request_accepted', {
                                                                            screen: 'group_settings',
                                                                        })
                                                                        fetchFriends();
                                                                        fetchReceived();
                                                                    }}
                                                                    className="text-sm text-teal-500 border-b-1 border-teal-500"
                                                                >
                                                                    Accept
                                                                </button>
                                                                <button
                                                                    onClick={async () => {
                                                                        const requestId = receivedRequests.get(member._id);
                                                                        await rejectFriendRequest(requestId, userToken);
                                                                        logEvent('friend_request_rejected', {
                                                                            screen: 'group_settings',
                                                                        })
                                                                        fetchReceived();
                                                                    }}
                                                                    className="text-sm text-red-500 border-b-1 border-red-500"
                                                                >
                                                                    Reject
                                                                </button>
                                                            </div>
                                                        )}

                                                    </>
                                                    )}
                                                    {group?.createdBy?._id === user?._id && (
                                                        <>
                                                            {/* {group.admins.includes(member._id) ? (
                                                                <button onClick={() => handleDemote(member._id)} className="text-sm text-orange-600">Demote</button>
                                                            ) : (
                                                                <button onClick={() => handlePromote(member._id)} className="text-sm text-teal-600">Promote</button>
                                                            )} */}
                                                            {/* <button onClick={() => handleRemoveMember(member._id)} className="text-sm text-red-600">Remove</button> */}
                                                        </>
                                                    )}
                                                </div>
                                            </li>
                                        );
                                    })}

                                </ul>
                            </div>
                            {/* Admin toggle: only visible to group creator */}
                            {isOwner ? (
                                <div className="bg-[#1A1A1A] border border-[#2C2C2C] rounded-lg p-4 mt-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={adminEnforcedPrivacy}
                                                onChange={async () => {
                                                    const newSetting = !adminEnforcedPrivacy;
                                                    setAdminEnforcedPrivacy(newSetting);
                                                    await updateGroupPrivacySetting(id, newSetting, userToken);
                                                    fetchGroupExpenses();
                                                }}
                                                className="w-5 h-5 accent-teal-500 cursor-pointer"
                                            />
                                            <span className="text-base font-medium text-teal-400">
                                                Enforce privacy mode
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-[#888] mt-2">
                                        When enabled, only expenses a member is involved in will be shown to them. They won't be able to view other transactions.
                                    </p>
                                </div>
                            ) : adminEnforcedPrivacy ?
                                (
                                    <div className="mt-6 bg-[#222] border-l-4 border-teal-500 p-4 rounded-md text-teal-300 text-sm">
                                        🔒 Privacy mode is enforced by the group admin. You will only see expenses that involve you.
                                    </div>
                                ) : <></>}


                        </div>)}
                    {/* Danger Zone */}
                    {isOwner && (<div className="mt-8 border border-[#2C2C2C] rounded-xl ">
                        <div className="bg-[#201f1f] px-4 py-3 border-b border-[#2C2C2C]">
                            <h3 className="text-sm tracking-wide uppercase text-red-400">Danger Zone</h3>
                        </div>

                        <hr className="border-[#2C2C2C]" />
                        <div className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                            <div>
                                <p className="text-base font-medium">Delete Group</p>
                                <p className="text-sm text-[#9aa08e]">
                                    Permanently removes the group and its expenses for all members. This action cannot be undone.
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    logEvent('group_delete')
                                    setConfirmAction('delete')
                                }}
                                className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm"
                                disabled={busyAction}
                            >
                                Delete Group
                            </button>
                        </div>

                    </div>)}


                </div>

                {/* <div className="border-t pt-4">
                    <button onClick={handleLeaveGroup} className="text-red-600">Leave Group</button>
                    {isOwner && (
                        <button onClick={handleDeleteGroup} className="ml-4 text-red-800 font-semibold">Delete Group</button>
                    )}
                </div> */}
            </div>
            {confirmAction && (
                <ModalWrapper
                    show
                    onClose={() => !busyAction && setConfirmAction(null)}
                    title={confirmAction === 'delete' ? 'Delete Group' : 'Leave Group'}
                    size="md"
                    footer={
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setConfirmAction(null)}
                                disabled={busyAction}
                                className="px-4 py-2 rounded-md border border-[#55554f] hover:bg-[#2a2a2a] text-sm"
                            >
                                Cancel
                            </button>
                            {confirmAction === 'leave' ? (
                                <button
                                    onClick={async () => {
                                        try {
                                            setBusyAction(true);
                                            await leaveGroup(id, userToken);
                                            navigate("/groups");
                                        } finally {
                                            setBusyAction(false);
                                        }
                                    }}
                                    disabled={busyAction}
                                    className="px-4 py-2 rounded-md border border-red-500 text-red-400 hover:bg-red-500/10 text-sm"
                                >
                                    {busyAction ? "Leaving..." : "Leave Group"}
                                </button>
                            ) : (
                                <button
                                    onClick={async () => {
                                        try {
                                            setBusyAction(true);
                                            await deleteGroup(id, userToken);
                                            navigate("/groups");
                                        } finally {
                                            setBusyAction(false);
                                        }
                                    }}
                                    disabled={busyAction}
                                    className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm"
                                >
                                    {busyAction ? "Deleting..." : "Delete Group"}
                                </button>
                            )}
                        </div>
                    }
                >
                    <div className="space-y-2">
                        {confirmAction === 'leave' ? (
                            <>
                                <p className="text-[#EBF1D5]">
                                    Are you sure you want to leave <span className="font-semibold">{group?.name}</span>?
                                </p>
                                <p className="text-sm text-[#9aa08e]">
                                    You’ll lose access to its expenses. This won’t delete the group for others.
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-[#EBF1D5]">
                                    This will permanently delete <span className="font-semibold">{group?.name}</span> for all members.
                                </p>
                                <p className="text-sm text-[#9aa08e]">
                                    This action cannot be undone.
                                </p>
                            </>
                        )}
                    </div>
                </ModalWrapper>
            )}

        </MainLayout>
    );
}
