import React, { useEffect, useState, useContext, useRef } from "react";
import MainLayout from '../layouts/MainLayout';
import Modal from '../components/GroupsModal';
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Cookies from "js-cookie";
import { useLocation } from "react-router-dom";
import { Users, Wallet, Plus, List, User, Loader } from "lucide-react";
import { getAllGroups, getGroupExpenses } from "../services/GroupService";
import PullToRefresh from "pulltorefreshjs";

const Groups = () => {

    const navigate = useNavigate();
    const location = useLocation();
    const { userToken } = useAuth() || {}
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const hasJoinedRef = useRef(false);
        const round = (val) => Math.round(val * 100) / 100;

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

            const data = await getAllGroups(userToken)
            if (data.length > 0) {
                setGroups(data);
            }
            const enhancedGroups = await Promise.all(data.map(async (group) => {
                try {
                    const result = await getGroupExpenses(group._id, userToken)
                    const groupExpenses = result.expenses;
                    const userId = result.id;

                    let totalOwe = 0;

                    groupExpenses.forEach(exp => {
                        exp.splits.forEach(split => {
                            if (split.friendId._id === userId) {
                                totalOwe += round(split.oweAmount) || 0;
                                totalOwe -= round(split.payAmount) || 0;
                            }
                        });
                    });

                    return {
                        ...group,
                        totalOwe: round(totalOwe) != 0 ? round(totalOwe) : null
                    };
                } catch (e) {
                    console.error("Error fetching group expenses:", e);
                    return group;
                }
            }));
            setGroups(enhancedGroups);



        } catch (error) {
            console.error("Groups Page - Error loading groups:", error);
        } finally {
            setLoading(false);
        }
    };
    const handleJoinGroup = async (joinCode) => {
        try {
            const data = await joinGroup(joinCode, userToken)
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
    const scrollRef = useRef(null);
    const [refreshing, setRefreshing] = useState(false);

    const doRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([fetchGroups()]);
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
    return (
        <MainLayout>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <h1 className="text-3xl font-bold capitalize">All Groups</h1>
                    <button
                        className={`flex flex-col items-center justify-center z-10 bg-teal-500 text-black w-8 h-8 rounded-full shadow-md text-2xl`}
                        onClick={() => setShowModal(true)}
                    >
                        <Plus strokeWidth={3} size={20} />
                    </button>
                </div>


                <div
                    ref={scrollRef}
                    className="flex flex-col flex-1 w-full overflow-y-auto pt-2 no-scrollbar scroll-touch"
                >
                    {loading ? (
                        <div className="flex flex-col justify-center items-center flex-1 py-5">
                            <Loader />
                        </div>
                    ) : groups?.length === 0 ? (
                         <div className="flex flex-col flex-1 justify-center">
                        <div className="bg-[#1f1f1f] text-center text-[#EBF1D5] border border-[#333] p-4 rounded-lg mt-4">
                            <p className="text-lg font-semibold mb-2">No groups yet!</p>
                            <p className="text-sm text-[#bbb] mb-4">To split expenses, create a group.</p>
                            <div className="flex justify-center gap-4">
                                <button
                                    onClick={() => setShowModal(true)}
                                    className="bg-[#EBF1D5] text-black px-4 py-2 rounded hover:bg-[#d0d5a9] transition"
                                >
                                    Create Group
                                </button>
                            </div>
                        </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-3 gap-x-4">
                            {groups?.map((group) => (
                                <div
                                    key={group._id}
                                    onClick={() => navigate(`/groups/${group._id}`)}
                                    className="flex flex-col gap-2 h-[45px]"
                                >
                                    <div className="flex flex-1 flex-row justify-between items-center align-middle">
                                        <h2 className="text-xl font-semibold capitalize">{group.name}</h2>
                                        {group?.totalOwe && group?.totalOwe != 0 && <div className="flex flex-col">
                                            <p className={`${group?.totalOwe > 0 ? 'text-red-500' : 'text-teal-500'} text-[11px] text-right`}>{group.totalOwe > 0 ? 'you owe' : 'you are owed'}</p>
                                            <p className={`${group?.totalOwe > 0 ? 'text-red-500' : 'text-teal-500'} text-[14px] -mt-[4px] text-right`}>
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
            </div>
            <Modal setShowModal={setShowModal} showModal={showModal} fetchGroups={fetchGroups} />

        </MainLayout>
    );
};

export default Groups;
