import React, { useEffect, useState, useContext, useRef } from "react";
import MainLayout from '../layouts/MainLayout';
import Modal from '../components/GroupsModal';
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Cookies from "js-cookie";
import { useLocation } from "react-router-dom";
import { Users, Wallet, Plus, List, User, Loader } from "lucide-react";
import { getAllGroups, getGroupExpenses, joinGroup } from "../services/GroupService";
import PullToRefresh from "pulltorefreshjs";
import { logEvent } from "../utils/analytics";
import { getSymbol } from "../utils/currencies";

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

    const currencyDigits = (code, locale = "en-IN") => {
        try {
            const fmt = new Intl.NumberFormat(locale, { style: "currency", currency: code });
            return fmt.resolvedOptions().maximumFractionDigits ?? 2;
        } catch {
            return 2;
        }
    };
    const roundCurrency = (amount, code, locale = "en-IN") => {
        const d = currencyDigits(code, locale);
        const f = 10 ** d;
        return Math.round((Number(amount) + Number.EPSILON) * f) / f;
    };

    // ---- fetchGroups with per-currency totals ----
    const fetchGroups = async () => {
        try {
            const data = await getAllGroups(userToken) || [];
            if (data.length > 0) setGroups(data);

            const enhancedGroups = await Promise.all(
                data.map(async (group) => {
                    try {
                        const res = await getGroupExpenses(group._id, userToken);
                        const expenses = res?.expenses || [];
                        const userId = res?.id;

                        // Build { [code]: amount } where amount > 0 means "you owe", < 0 means "you are owed"
                        const totalsByCode = {};
                        for (const exp of expenses) {
                            const code = exp?.currency || "INR";
                            for (const split of (exp?.splits || [])) {
                                if (split?.friendId?._id !== userId) continue;
                                const owe = Number(split?.oweAmount) || 0;
                                const pay = Number(split?.payAmount) || 0;
                                totalsByCode[code] = (totalsByCode[code] || 0) + owe - pay;
                            }
                        }

                        // Round & drop near-zero noise per currency
                        const list = Object.entries(totalsByCode)
                            .map(([code, amt]) => {
                                const rounded = roundCurrency(amt, code);
                                const minUnit = 1 / (10 ** currencyDigits(code));
                                return Math.abs(rounded) >= minUnit ? { code, amount: rounded } : null;
                            })
                            .filter(Boolean)
                            // sort by absolute magnitude desc (largest first)
                            .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

                        return {
                            ...group,
                            totalOweList: list, // [{ code, amount }]
                        };
                    } catch (e) {
                        console.error("Error fetching group expenses:", e);
                        return { ...group, totalOweList: [] };
                    }
                })
            );

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
            logEvent('group_join', {
                screen: 'groups', source: 'link'
            });
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
                        onClick={() => {
                            logEvent('open_modal_group_new', {
                                screen: 'groups', source: 'plus'
                            })
                            setShowModal(true)
                        }}
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
                        <div className="flex flex-1 flex-col justify-center">
                            <div className="flex flex-col items-center justify-center p-4 rounded-lg  text-center space-y-3 bg-[#1f1f1f]">
                                <h2 className="text-2xl font-semibold">No groups Yet</h2>
                                <p className="text-sm text-[#888] max-w-sm">
                                    To split expenses, create a group.
                                </p>
                                <button
                                    onClick={() => {
                                        logEvent('open_modal_group_new', {
                                            screen: 'groups',
                                            source: 'cta'
                                        })
                                        setShowModal(true)
                                    }}
                                    className="bg-teal-500 text-black px-4 py-2 rounded hover:bg-teal-400 transition"
                                >
                                    Create Group
                                </button>
                            </div></div>

                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-3 gap-x-4">
                            {groups?.map((group) => (
                                <div
                                    key={group._id}
                                    onClick={() => navigate(`/groups/${group._id}`)}
                                    className="flex flex-col gap-2 "
                                >
                                    <div className="flex flex-1 flex-row justify-between items-center">
                                        <h2 className="text-xl font-semibold capitalize truncate">{group.name}</h2>

                                        {group?.totalOweList?.length > 0 && (
                                            <div className="flex flex-col items-end">
                                                {group.totalOweList.map(({ code, amount }) => {
                                                    const sym = getSymbol("en-IN", code);
                                                    const owed = amount < 0; // negative => you are owed
                                                    return (
                                                        <div key={code} className="leading-tight">
                                                            <p className={`${owed ? "text-teal-500" : "text-red-500"} text-[11px] text-right`}>
                                                                {owed ? "you are owed" : "you owe"}
                                                            </p>
                                                            <p className={`${owed ? "text-teal-500" : "text-red-500"} text-[14px] -mt-[2px] text-right`}>
                                                                {sym} {Math.abs(amount).toFixed(2)}
                                                            </p>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
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
