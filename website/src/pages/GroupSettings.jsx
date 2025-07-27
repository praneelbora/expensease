import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getGroupDetails, updateGroupName, leaveGroup, deleteGroup, removeMember, promoteMember, demoteMember } from "../services/GroupService";
import MainLayout from "../layouts/MainLayout";
import { ChevronLeft, Loader } from "lucide-react";
import { getFriends, sendFriendRequest } from "../services/FriendService";
import { getGroupExpenses, updateGroupPrivacySetting } from "../services/GroupService";

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
        if (!group, !user._id) return;

        let totalExpense = 0;
        let totalPaid = 0;
        let yourExpense = 0;
        let groupExpense = 0
        groupExpenses?.forEach(exp => {
            exp.splits.forEach(split => {
                if (exp.typeOf == 'expense') groupExpense += split.oweAmount;
                if (split.friendId?._id === user._id) {
                    totalPaid += split.payAmount || 0;
                    totalExpense += split.oweAmount || 0;
                    if (exp.typeOf == 'expense')
                        yourExpense += split.oweAmount
                }
            });
        });

        setTotals({
            expense: totalExpense,
            yourExpense: yourExpense,
            balance: totalPaid - totalExpense,
            groupExpense: groupExpense
        });
    }, [groupExpenses]);

    useEffect(() => {
        fetchGroup();
        fetchGroupExpenses()
        fetchFriends();
    }, [id]);
    const addFriend = async (email) => {
        try {
            const data = await sendFriendRequest(email, userToken)
            alert(data.message || "Friend request sent!");
            fetchFriends();
        } catch (err) {
            console.error("Error adding friend:", err);
            alert("Something went wrong.");
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

    const isOwner = group?.createdBy?._id === user?._id;

    return (
        <MainLayout groupId={id}>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <div className="flex flex-row gap-2">
                        <button onClick={() => navigate(`/groups/${id}`)}>
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
                            <div className="bg-[#1E1E1E] p-4 rounded-xl shadow space-y-4 mt-4">
                                <div>
                                    <h2 className="text-xl font-semibold mb-2">Summary</h2>
                                    <p className={`text-lg ${totals?.balance < 0 ? 'text-red-500' : 'text-teal-500'}`}>
                                        {totals?.balance < 0 ? 'You owe' : 'You are owed'}
                                    </p>
                                    <p className="text-2xl font-bold">
                                        ₹ {Math.abs(totals?.balance).toFixed(2)}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-sm text-gray-400">
                                    <div className="flex flex-col bg-[#2A2A2A] p-3 rounded-lg">
                                        <span className="text-xs text-gray-400"> Your Expenses</span>
                                        <span className="text-teal-500 text-lg font-semibold">
                                            ₹ {totals?.yourExpense?.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex flex-col bg-[#2A2A2A] p-3 rounded-lg">
                                        <span className="text-xs text-gray-400">Group Expenses</span>
                                        <span className="text-teal-500 text-lg font-semibold">
                                            ₹ {(totals?.groupExpense).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>

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
                                                    {(!isMe && !isFriend) && (
                                                        <button
                                                            onClick={() => addFriend(member.email)}
                                                            className="text-sm text-teal-500"
                                                        >
                                                            Add Friend
                                                        </button>
                                                    )}
                                                    {isOwner && (
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
                                    <p className="text-sm text-gray-400 mt-2">
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
                </div>

                {/* <div className="border-t pt-4">
                    <button onClick={handleLeaveGroup} className="text-red-600">Leave Group</button>
                    {isOwner && (
                        <button onClick={handleDeleteGroup} className="ml-4 text-red-800 font-semibold">Delete Group</button>
                    )}
                </div> */}
            </div>
        </MainLayout>
    );
}
