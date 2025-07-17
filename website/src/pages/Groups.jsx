import React, { useEffect, useState, useContext, useRef } from "react";
import MainLayout from '../layouts/MainLayout';
import Modal from '../components/GroupsModal';
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Cookies from "js-cookie";
import { useLocation } from "react-router-dom";
import {
    Users,
    Wallet,
    Plus,
    List,
    User,
} from "lucide-react";
const Groups = () => {

    const navigate = useNavigate();
    const location = useLocation();
    const { userToken } = useAuth()
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const hasJoinedRef = useRef(false);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const joinCode = params.get("join");

        if (joinCode && !hasJoinedRef.current) {
            hasJoinedRef.current = true; // ensure it runs only once
            handleJoinGroup(joinCode);
        }
    }, [location]);

    const fetchGroups = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/groups/`, {
                headers: {
                    "Content-Type": "application/json",
                    'x-auth-token': Cookies.get('userToken')
                },
            });

            if (!response.ok) {
                throw new Error("Failed to fetch groups");
            }
            else {
                const data = await response.json();
                if (data.length > 0) {
                    console.log(data);
                    setGroups(data);
                }
                const enhancedGroups = await Promise.all(data.map(async (group) => {
                    try {
                        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/expenses/group/${group._id}`, {
                            headers: {
                                "Content-Type": "application/json",
                                "x-auth-token": Cookies.get('userToken')
                            },
                        });

                        const result = await res.json();
                        const groupExpenses = result.expenses;
                        const userId = result.id;

                        let totalOwe = 0;

                        groupExpenses.forEach(exp => {
                            exp.splits.forEach(split => {
                                if (split.friendId._id === userId) {
                                    totalOwe += split.oweAmount || 0;
                                    totalOwe -= split.payAmount || 0;
                                }
                            });
                        });

                        return {
                            ...group,
                            totalOwe: totalOwe != 0 ? totalOwe : null
                        };
                    } catch (e) {
                        console.error("Error fetching group expenses:", e);
                        return group;
                    }
                }));
                console.log(enhancedGroups);

                setGroups(enhancedGroups);

            }

        } catch (error) {
            console.error("Groups Page - Error loading groups:", error);
        } finally {
            setLoading(false);
        }
    };
    const handleJoinGroup = async (joinCode) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/groups/join`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-auth-token": userToken,
                },
                body: JSON.stringify({ code: joinCode }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Failed to join group");
            }
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete("join");
            window.history.replaceState({}, "", newUrl);
            fetchGroups();
        } catch (error) {
            console.error("Join group error:", error.message);
        }
    };
    useEffect(() => {
        if (!userToken) return;
        fetchGroups();
    }, [userToken]);

    return (
        <MainLayout>
            <div className="max-h-screen bg-[#121212] text-[#EBF1D5]">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                            <h1 className="text-3xl font-bold capitalize">All Groups</h1>
                    <button
                        className={`flex flex-col items-center justify-center z-10 bg-lime-200 text-black w-8 h-8 rounded-full shadow-md text-2xl`}
                        onClick={() => setShowModal(true)}
                    >
                        <Plus strokeWidth={3} size={20} />
                    </button>
                </div>
                {loading ? (
                    <p>Loading groups...</p>
                ) : groups?.length === 0 ? (
                    <p>No groups found.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-3 gap-x-4 mt-4">
                        {groups?.map((group) => (
                            <div
                                key={group._id}
                                onClick={() => navigate(`/groups/${group._id}`)}
                                className="flex flex-col gap-1 cursor-pointer hover:bg-[#1f1f1f] ounded-md transition h-[45px] justify-between"
                            >
                                <div className="flex flex-1 flex-row justify-between items-center align-middle">
                                    <h2 className="text-xl font-semibold capitalize">{group.name}</h2>
                                    {group?.totalOwe && group?.totalOwe != 0 && <div className="flex flex-col">
                                        <p className={`${group?.totalOwe > 0 ? 'text-red-500' : 'text-green-500'} text-[12px] text-right`}>{group.totalOwe > 0 ? 'you owe' : 'you are owed'}</p>
                                        <p className={`${group?.totalOwe > 0 ? 'text-red-500' : 'text-green-500'} text-[16px] -mt-[4px] text-right`}>
                                            ₹ {Math.abs(group.totalOwe.toFixed(2))}
                                        </p>

                                    </div>
                                    }
                                </div>
                                <hr />
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <Modal setShowModal={setShowModal} showModal={showModal} fetchGroups={fetchGroups} />

        </MainLayout>
    );
};

export default Groups;
