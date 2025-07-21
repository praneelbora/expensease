import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getGroupDetails, updateGroupName, leaveGroup, deleteGroup, removeMember, promoteMember, demoteMember } from "../services/GroupService";
import MainLayout from "../layouts/MainLayout";
import { ChevronLeft,Loader } from "lucide-react";
import { getFriends, sendFriendRequest } from "../services/FriendService";

export default function GroupSettings() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, userToken } = useAuth() || {};
    const [group, setGroup] = useState(null);
    const [newGroupName, setNewGroupName] = useState("");
    const [loading, setLoading] = useState(false);
    const [friends, setFriends] = useState([]);
    const fetchFriends = async () => {
        try {
            const data = await getFriends(userToken)
            setFriends(data);
        } catch (err) {
            console.error("Error fetching friends:", err);
        }
    };

    useEffect(() => {
        fetchGroup();
        fetchFriends();
    }, [id]);
    const addFriend = async (email) => {
        try {
            const data = await sendFriendRequest(email,userToken)
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

    const isAdmin = group?.admins?.includes(user?._id);
    const isOwner = group?.createdBy === user?._id;

    return (
        <MainLayout groupId={id}>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <div className="flex flex-row gap-2">
                        <button onClick={() => navigate(`/groups`)}>
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
                        <label className="block text-[16px] uppercase text-teal-500">Group Name</label>
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

                    <div>
                        <h3 className="font-medium mb-2 text-[16px] uppercase text-teal-500">Members</h3>
                        <ul className="space-y-3">
                            {group?.members.map((member) => {
                                const isMe = member?._id === user?._id;
                                const isFriend = friends.some(friend => friend?._id === member?._id);

                                return (
                                    <li key={member._id} className="flex items-center justify-between">
                                        <div>
                                            {member.name} {isMe && "(You)"}
                                            {group?.admins?.includes(member._id) && <span className="ml-2 text-xs bg-gray-200 px-1 rounded">Admin</span>}
                                        </div>
                                        <div className="space-x-2">
                                            {(!isMe && !isFriend) && (
                                                <button
                                                    onClick={() => addFriend(member.email)}
                                                    className="text-sm text-blue-500"
                                                >
                                                    Add Friend
                                                </button>
                                            )}
                                            {isAdmin && !isMe && (
                                                <>
                                                    {group.admins.includes(member._id) ? (
                                                        <button onClick={() => handleDemote(member._id)} className="text-sm text-orange-600">Demote</button>
                                                    ) : (
                                                        <button onClick={() => handlePromote(member._id)} className="text-sm text-teal-600">Promote</button>
                                                    )}
                                                    <button onClick={() => handleRemoveMember(member._id)} className="text-sm text-red-600">Remove</button>
                                                </>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}

                        </ul>
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
        </MainLayout>
    );
}
