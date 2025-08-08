import { useEffect, useState, useMemo, useRef } from "react";
import MainLayout from "../layouts/MainLayout";
import { getAllExpenses } from "../services/ExpenseService";
import { useAuth } from "../context/AuthContext";
import ExpenseItem from "../components/ExpenseItem";
import {
    PieChart, Pie, Cell, Tooltip,
    BarChart, Bar, XAxis, YAxis, ResponsiveContainer
} from "recharts";
import { useNavigate } from "react-router-dom";
import { Loader } from "lucide-react";


import PullToRefresh from "pulltorefreshjs";


const Dashboard = () => {
    // Inside your component:
    const navigate = useNavigate();
    const { userToken } = useAuth() || {};
    const [expenses, setExpenses] = useState([]);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const getPayerInfo = (splits) => {
        const payers = splits.filter(s => s.paying && s.payAmount > 0);
        if (payers.length === 1) {
            return `${payers[0].friendId.name} paid`;
        } else if (payers.length > 1) {
            return `${payers.length} people paid`;
        } else {
            return `No one paid`;
        }
    };
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
        let total = 0, personal = 0, group = 0, settle = 0, friend = 0;

        expenses.forEach((exp, i) => {
            if (exp.typeOf === "expense") {
                const userSplit = exp.splits?.find(split => split.friendId?._id === userId);
                if (userSplit?.owing && typeof userSplit.oweAmount === "number") {
                    total += userSplit.oweAmount;
                }

                // Count type
                if (exp.groupId) group++;
                else if (!exp.groupId && exp.splits?.length > 0) friend++;
                else {
                    personal++;
                    total += exp?.amount
                }
            } else if (exp.typeOf === "settle") {
                settle++;
            }
        });

        return { total, personal, group, friend, settle };
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
                        <div className="flex flex-col items-center justify-center p-4 rounded-lg  text-center space-y-4 bg-[#1f1f1f]">
                            <h2 className="text-2xl font-semibold">No Expenses Yet</h2>
                            <p className="text-sm text-gray-400 max-w-sm">
                                You haven’t added any expenses yet. Start by adding your first one to see stats and insights.
                            </p>
                            <button
                                onClick={() => navigate("/new-expense")}
                                className="bg-teal-500 text-white px-6 py-2 rounded-lg hover:bg-teal-600 transition"
                            >
                                Add Expense
                            </button>
                        </div>
                        </div>
                    ) : (

                        <>
                            {/* Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                                <div className="bg-[#1f1f1f] p-4 rounded-xl shadow-md">
                                    <p className="text-sm">Total Expenses</p>
                                    <p className="text-xl font-bold">₹{stats.total.toFixed(2)}</p>
                                </div>
                                {stats.personal > 0 && <div className="bg-[#1f1f1f] p-4 rounded-xl shadow-md">
                                    <p className="text-sm">Personal Expenses</p>
                                    <p className="text-xl">{stats.personal}</p>
                                </div>}
                                {stats.group > 0 && <div className="bg-[#1f1f1f] p-4 rounded-xl shadow-md">
                                    <p className="text-sm">Group Expenses</p>
                                    <p className="text-xl">{stats.group}</p>
                                </div>}
                                {stats.friend > 0 && <div className="bg-[#1f1f1f] p-4 rounded-xl shadow-md">
                                    <p className="text-sm">Friend Expenses</p>
                                    <p className="text-xl">{stats.friend}</p>
                                </div>}
                                {stats.settle > 0 && <div className="bg-[#1f1f1f] p-4 rounded-xl shadow-md">
                                    <p className="text-sm">Settlements</p>
                                    <p className="text-xl">{stats.settle}</p>
                                </div>}
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
                                            onClick={() => { }}
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
        </MainLayout>
    );
};

export default Dashboard;
