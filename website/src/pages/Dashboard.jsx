import { useEffect, useState, useMemo, useRef } from "react";
import MainLayout from "../layouts/MainLayout";
import { getAllExpenses } from "../services/ExpenseService";
import { useAuth } from "../context/AuthContext";
import ExpenseItem from "../components/ExpenseItem";
import ExpenseModal from "../components/ExpenseModal";
import {
    PieChart, Pie, Cell, Tooltip,
    BarChart, Bar, XAxis, YAxis, ResponsiveContainer
} from "recharts";
import { useNavigate } from "react-router-dom";
import { Loader } from "lucide-react";


import PullToRefresh from "pulltorefreshjs";
import { logEvent } from "../utils/analytics";


const Dashboard = () => {
    // Inside your component:
    const navigate = useNavigate();
    const { userToken, categories } = useAuth() || {};
    const [expenses, setExpenses] = useState([]);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showExpenseModal, setShowExpenseModal] = useState(false);
        const didRedirect = useRef(false);

    useEffect(() => {
        if (didRedirect.current) return;
        if (!userToken) return; // treat as logged-in when token exists

        const group = localStorage.getItem("pendingGroupJoin");
        const friend = localStorage.getItem("pendingFriendAdd");

        if (group) {
            localStorage.removeItem("pendingGroupJoin");
            didRedirect.current = true;
            navigate(`/groups?join=${encodeURIComponent(group)}`, { replace: true });
        } else if (friend) {
            localStorage.removeItem("pendingFriendAdd");
            didRedirect.current = true;
            navigate(`/friends?add=${encodeURIComponent(friend)}`, { replace: true });
        }
    }, [userToken, navigate]);
    
    const fetchExpenses = async () => {
        try {
            const data = await getAllExpenses(userToken);
            setExpenses(data.expenses);
            setUserId(data.id);
            setLoading(false);
        } catch (error) {
            console.error("Failed to load expenses:", error);
        }
    };

    useEffect(() => {
        fetchExpenses();
    }, []);
    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const { name, value } = payload[0];
            return (
                <div className="bg-black text-[#EBF1D5] text-sm px-2 py-1 rounded shadow-md">
                    <strong>{name}</strong>: ₹{value.toFixed(2)}
                </div>
            );
        }
        return null;
    };
    const scrollRef = useRef(null);
    const [refreshing, setRefreshing] = useState(false);

    const doRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([fetchExpenses()]);
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

    const stats = useMemo(() => {
        const acc = {
            total: 0,
            personal: { amount: 0, count: 0 },
            group: { amount: 0, count: 0 },
            friend: { amount: 0, count: 0 },
            settle: { amount: 0, count: 0 },
        };

        for (const exp of expenses) {
            if (exp.typeOf === "expense") {
                const amt = Number(exp?.amount) || 0;
                const userSplit = exp.splits?.find(s => s.friendId?._id === userId);
                const share = Number(userSplit?.oweAmount);

                if (exp.groupId) {
                    if (userSplit?.owing && Number.isFinite(share)) {
                        acc.group.amount += share;
                        acc.total += share;
                    }
                    acc.group.count += 1;
                } else if (exp.splits?.length > 0) {
                    // friend-to-friend split (not in a group)
                    if (userSplit?.owing && Number.isFinite(share)) {
                        acc.friend.amount += share;
                        acc.total += share;
                    }
                    acc.friend.count += 1;
                } else {
                    // purely personal expense (no group, no splits)
                    acc.personal.amount += amt;
                    acc.total += amt;
                    acc.personal.count += 1;
                }
            } else if (exp.typeOf === "settle") {
                const sAmt = Number(exp?.amount) || 0; // keep sign as-is if you use +/- for direction
                acc.settle.amount += sAmt;
                acc.settle.count += 1;
            }
        }

        return acc;
    }, [expenses, userId]);


    const RADIAN = Math.PI / 180;
    const renderCustomizedLabel = ({ cx, cy, midAngle, outerRadius, percent, name }) => {
        const radius = outerRadius + 10;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);

        return (
            <text
                x={x}
                y={y}
                fill="#EBF1D5"
                textAnchor={x > cx ? "start" : "end"}
                dominantBaseline="central"
                fontSize="12"
            >
                {name} : {(percent * 100).toFixed(2)}%
            </text>
        );
    };


    const categoryChart = useMemo(() => {
        const catTotals = {};

        expenses.forEach(exp => {
            if (exp.typeOf !== "expense") return;

            const category = exp.category || "Uncategorized";

            // Case 1: Split expense (shared with others)
            const userSplit = exp.splits?.find(split => split.friendId?._id === userId);
            if (userSplit?.owing) {
                const owe = userSplit.oweAmount || 0;
                catTotals[category] = (catTotals[category] || 0) + owe;
            }

            // Case 2: Personal expense (no splits)
            if (!exp.groupId && (!exp.splits || exp.splits.length === 0)) {
                catTotals[category] = (catTotals[category] || 0) + exp.amount;
            }
        });

        return Object.entries(catTotals).map(([name, value]) => ({ name, value }));
    }, [expenses, userId]);


    const trendChart = useMemo(() => {
        const monthly = {};

        expenses.forEach(exp => {
            if (exp.typeOf !== "expense") return;

            const month = new Date(exp.createdAt).toLocaleString("default", { month: "short", year: "2-digit" });

            // Case 1: Split expense
            const userSplit = exp.splits?.find(split => split.friendId?._id === userId);
            if (userSplit?.owing) {
                const owe = userSplit.oweAmount || 0;
                monthly[month] = (monthly[month] || 0) + owe;
            }

            // Case 2: Personal expense
            if (!exp.groupId && (!exp.splits || exp.splits.length === 0)) {
                monthly[month] = (monthly[month] || 0) + exp.amount;
            }
        });

        return Object.entries(monthly).map(([name, value]) => ({ name, value }));
    }, [expenses, userId]);
    const generateColors = (count) => {
        const colors = [];
        for (let i = 0; i < count; i++) {
            const hue = Math.floor((360 / count) * i); // evenly spaced hue
            colors.push(`hsl(${hue}, 70%, 60%)`);
        }
        return colors;
    };

    // Example usage:
    const COLORS = useMemo(() => generateColors(categoryChart.length), [categoryChart.length]);


    const renderBarLabel = ({ x, y, width, value }) => {
        return (
            <text
                x={x + width / 2}
                y={y - 5}
                fill="#EBF1D5"
                textAnchor="middle"
                fontSize={12}
            >
                ₹{value}
            </text>
        );
    };


    return (
        <MainLayout>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <h1 className="text-3xl font-bold capitalize">Dashboard</h1>
                </div>
                <div
                    ref={scrollRef}
                    className="flex flex-col flex-1 w-full overflow-y-auto pt-2 no-scrollbar scroll-touch"
                >                    {loading ? (
                    <div className="flex flex-col justify-center items-center flex-1 py-5">
                        <Loader />
                    </div>
                ) : expenses.length === 0 ? (
                    <div className="flex flex-col flex-1 justify-center">
                        <div className="flex flex-col items-center justify-center p-4 rounded-lg  text-center space-y-3 bg-[#1f1f1f]">
                            <h2 className="text-2xl font-semibold">No Expenses Yet</h2>
                            <p className="text-sm text-[#888] max-w-sm">
                                You haven’t added any expenses yet. Start by adding your first one to see stats and insights.
                            </p>
                            <button
                                onClick={() => {
                                    logEvent('navigate', {
                                        screen: 'dashboard', to: 'add_expense', source: 'cta'
                                    })
                                    navigate("/new-expense")
                                }}
                                className="bg-teal-500 text-black px-4 py-2 rounded hover:bg-teal-400 transition"
                            >
                                Add Expense
                            </button>
                        </div>
                    </div>
                ) : (

                    <>
                        {/* Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                            {/* Total */}
                            <div
                                className="bg-[#1f1f1f] p-4 rounded-xl shadow-md w-full cursor-pointer"
                                onClick={() => navigate('/expenses')}
                            >
                                <p className="text-[15px] text-[#888]">Total Expenses</p>
                                <p className="text-xl font-bold break-words">
                                    ₹{stats.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </p>
                            </div>

                            {/* Personal */}
                            {stats.personal.amount > 0 && (
                                <div
                                    className="bg-[#1f1f1f] p-4 rounded-xl shadow-md w-full cursor-pointer"
                                    onClick={() => navigate('/expenses?filter=personal')}
                                >
                                    <p className="text-[15px] text-[#888]">Personal Expenses</p>
                                    <p className="text-xl break-words">
                                        ₹{stats.personal.amount.toLocaleString()}
                                    </p>
                                </div>
                            )}

                            {/* Group */}
                            {stats.group.amount > 0 && (
                                <div
                                    className="bg-[#1f1f1f] p-4 rounded-xl shadow-md w-full cursor-pointer"
                                    onClick={() => navigate('/expenses?filter=group')}
                                >
                                    <p className="text-[15px] text-[#888]">Group Expenses</p>
                                    <p className="text-xl break-words">
                                        ₹{stats.group.amount.toLocaleString()}
                                    </p>
                                </div>
                            )}

                            {/* Friend */}
                            {stats.friend.amount > 0 && (
                                <div
                                    className="bg-[#1f1f1f] p-4 rounded-xl shadow-md w-full cursor-pointer"
                                    onClick={() => navigate('/expenses?filter=friend')}
                                >
                                    <p className="text-[15px] text-[#888]">Friend Expenses</p>
                                    <p className="text-xl break-words">
                                        ₹{stats.friend.amount.toLocaleString()}
                                    </p>
                                </div>
                            )}

                            {/* Settlements */}
                            {stats.settle.amount > 0 && (
                                <div
                                    className="bg-[#1f1f1f] p-4 rounded-xl shadow-md w-full cursor-pointer"
                                    onClick={() => navigate('/expenses?filter=settle')}
                                >
                                    <p className="text-[15px] text-[#888]">Settlements</p>
                                    <p className="text-xl break-words">
                                        ₹{stats.settle.amount.toLocaleString()}
                                    </p>
                                </div>
                            )}
                        </div>



                        {/* Last 3 Expenses */}
                        {expenses.length > 0 && <div className="space-y-2">
                            <div className="flex flex-row items-center justify-between mt-4">
                                <h2 className="text-2xl font-semibold">Recent Expenses</h2>
                                <button
                                    onClick={() => navigate('/expenses')}
                                    className="text-sm text-teal-500 hover:underline"
                                >
                                    View All
                                </button>
                            </div>

                            <ul className="flex flex-col gap-2">
                                {expenses?.sort((a, b) => new Date(b.date) - new Date(a.date)).filter(f => f.typeOf == 'expense').slice(0, 3).map(exp => (
                                    <ExpenseItem
                                        key={exp._id}
                                        expense={exp}
                                        userId={userId}
                                        onClick={() => { setShowExpenseModal(exp) }}
                                    />
                                ))}
                            </ul>
                        </div>}

                        {/* Charts */}
                        {expenses.length > 0 && <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                            <div className="bg-[#1f1f1f] p-4 rounded-xl shadow-md overflow-hidden">
                                <h3 className="text-lg font-semibold mb-2">Category Distribution</h3>
                                <ResponsiveContainer width="100%" height={250}>
                                    <PieChart>
                                        <Pie
                                            data={categoryChart}
                                            dataKey="value"
                                            nameKey="name"
                                            outerRadius={90}
                                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                            labelLine={false}
                                        >
                                            {categoryChart.map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>

                                        <Tooltip content={<CustomTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="bg-[#1f1f1f] p-4 rounded-xl shadow-md">
                                <h3 className="text-lg font-semibold mb-2">Monthly Trends</h3>
                                <ResponsiveContainer width="100%" height={250}>
                                    <BarChart data={trendChart}>
                                        <XAxis dataKey="name" />
                                        <YAxis />
                                        <Tooltip />
                                        <Bar dataKey="value" fill="#00C49F" label={renderBarLabel} />
                                    </BarChart>
                                </ResponsiveContainer>

                            </div>
                        </div>}
                    </>
                )}
                </div>
            </div>
            {showExpenseModal && (
                <ExpenseModal showModal={showExpenseModal} setShowModal={setShowExpenseModal} fetchExpenses={fetchExpenses} userToken={userToken} userId={userId} categories={categories} />
            )}
        </MainLayout>
    );
};

export default Dashboard;
