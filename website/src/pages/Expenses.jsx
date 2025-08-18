import { useEffect, useMemo, useRef, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import ExpenseModal from "../components/ExpenseModal";
import { useAuth } from "../context/AuthContext";
import { ChevronLeft, Loader, Plus } from "lucide-react";
import { getAllExpenses } from '../services/ExpenseService';
import ExpenseItem from "../components/ExpenseItem"; // Adjust import path
import PullToRefresh from "pulltorefreshjs";
import { logEvent } from "../utils/analytics";
import { useNavigate, useSearchParams } from "react-router-dom";

const Expenses = () => {
    const { userToken, categories } = useAuth() || {}
    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState([]);
    const [userId, setUserId] = useState();
    const [showModal, setShowModal] = useState(false);
    const navigate = useNavigate();
    const getSettleDirectionText = (splits) => {
        const payer = splits.find(s => s.paying && s.payAmount > 0);
        const receiver = splits.find(s => s.owing && s.oweAmount > 0);

        if (!payer || !receiver) return "Invalid settlement";

        const payerName = payer.friendId._id === userId ? "You" : payer.friendId.name;
        const receiverName = receiver.friendId._id === userId ? "you" : receiver.friendId.name;

        return `${payerName} paid ${receiverName}`;
    };
    const [searchParams, setSearchParams] = useSearchParams();
    const initialFilter = searchParams.get("filter") || "all";
    const initialCategory = searchParams.get("category") || "all";

    const [filter, setFilter] = useState(initialFilter);        // 'all','personal','settle','group','friend'
    const [category, setCategory] = useState(initialCategory);  // category name or 'all'

    // keep URL in sync when state changes
    useEffect(() => {
        const next = new URLSearchParams(searchParams);
        next.set("filter", filter);
        next.set("category", category);
        setSearchParams(next, { replace: true });
    }, [filter, category]);

    // respond to URL changes (e.g., user navigates back)
    useEffect(() => {
        const qf = searchParams.get("filter") || "all";
        const qc = searchParams.get("category") || "all";
        if (qf !== filter) setFilter(qf);
        if (qc !== category) setCategory(qc);
    }, [searchParams]);
    const FILTERS = [
        { key: "all", label: "All Expenses" },
        { key: "personal", label: "Personal Expenses" },
        { key: "settle", label: "Settlements" },
        { key: "group", label: "Group Expenses" },
        { key: "friend", label: "Friend Expenses" },
    ];

    const orderedFilters = useMemo(() => {
        const sel = FILTERS.find(f => f.key === filter) || FILTERS[0];
        const rest = FILTERS.filter(f => f.key !== sel.key);
        return [sel, ...rest];
    }, [filter]);

    const categoryOptions = useMemo(() => {
        const s = new Set();
        expenses?.forEach(e => {
            if (e?.typeOf !== "settle" && e?.category) s.add(e.category);
        });
        const arr = Array.from(s).sort();
        return ["all", ...arr];
    }, [expenses]);

    const orderedCategories = useMemo(() => {
        if (!categoryOptions.length) return ["all"];
        const sel = categoryOptions.includes(category) ? category : "all";
        return [sel, ...categoryOptions.filter(c => c !== sel)];
    }, [category, categoryOptions]);

    const getPayerInfo = (splits) => {
        const userSplit = splits.find(s => s.friendId && s.friendId._id === userId);
        if (!userSplit || (!userSplit.payAmount && !userSplit.oweAmount)) {
            return "You were not involved";
        }
        const payers = splits.filter(s => s.paying && s.payAmount > 0);
        if (payers.length === 1) {
            return `${payers[0].friendId._id == userId ? 'You' : payers[0].friendId.name} paid`;
        } else if (payers.length > 1) {
            return `${payers.length} people paid`;
        } else {
            return `No one paid`;
        }
    };

    const getOweInfo = (splits) => {
        const userSplit = splits.find(s => s.friendId && s.friendId._id === userId);

        if (!userSplit) return null;

        const { oweAmount = 0, payAmount = 0 } = userSplit;
        const net = payAmount - oweAmount;

        if (net > 0) {
            return { text: 'you lent', amount: ` ${net.toFixed(2)}` };
        } else if (net < 0) {
            return { text: 'you borrowed', amount: ` ${Math.abs(net).toFixed(2)}` };
        } else {
            return null;
        }
    };

    const fetchExpenses = async () => {
        try {
            const data = await getAllExpenses(userToken);
            setUserId(data.id);
            setExpenses(data.expenses)
            setLoading(false)
        } catch (error) {
            console.error("Error loading expenses:", error);
        }
    };

    useEffect(() => {
        fetchExpenses();
    }, []);
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
    return (
        <MainLayout>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <div className="flex flex-row gap-2">
                        <button onClick={() => navigate(`/dashboard`)}>
                            <ChevronLeft />
                        </button>
                        <h1 className="text-3xl font-bold capitalize">All Expenses</h1>
                    </div>

                    <button
                        className={`flex flex-col items-center justify-center z-10 bg-teal-500 text-black w-8 h-8 rounded-full shadow-md text-2xl`}
                        onClick={() => {
                            logEvent('navigate', {
                                screen: 'expenses', to: 'add_expense', source: 'plus'
                            });
                            navigate('/new-expense')
                        }}
                    >
                        <Plus strokeWidth={3} size={20} />
                    </button>
                </div>
                {/* Type filter */}
                <div className="flex gap-2 flex-row my-3 overflow-x-auto no-scrollbar">
                    {FILTERS.map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setFilter(filter === key ? "all" : key)}
                            className={`px-3 py-1 rounded-full text-sm transition whitespace-nowrap flex-shrink-0 ${filter === key
                                ? "bg-teal-400 text-black font-semibold"
                                : "bg-[#1f1f1f] text-[#EBF1D5] hover:bg-[#2a2a2a]"
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Category filter */}
                <div className="flex gap-2 flex-row mb-3 overflow-x-auto no-scrollbar">
                    {categoryOptions.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setCategory(category === cat ? "all" : cat)}
                            className={`px-3 py-1 rounded-full text-sm transition whitespace-nowrap flex-shrink-0 ${category === cat
                                ? "bg-teal-400 text-black font-semibold"
                                : "bg-[#1f1f1f] text-[#EBF1D5] hover:bg-[#2a2a2a]"
                                }`}

                            title={cat === "all" ? "All Categories" : cat}
                        >
                            {cat === "all" ? "All Categories" : cat}
                        </button>
                    ))}
                </div>

                <div
                    ref={scrollRef}
                    className="flex flex-col flex-1 w-full overflow-y-auto pt-2 no-scrollbar scroll-touch"
                >                    <ul className="h-full flex flex-col w-full gap-2">
                        {loading ? (
                            <div className="flex flex-col justify-center items-center flex-1 py-5">
                                <Loader />
                            </div>
                        ) : expenses?.length === 0 ? (
                            <div className="flex flex-col justify-center items-center flex-1 py-5">
                                <p>No expenses found.</p>
                            </div>
                        ) : expenses
                            ?.sort((a, b) => new Date(b.date) - new Date(a.date))
                            ?.filter((exp) => {
                                // type filter
                                const matchesType =
                                    filter === "all" ? true :
                                        filter === "settle" ? exp.typeOf === "settle" :
                                            filter === "personal" ? (!exp.groupId && exp.typeOf !== "settle" && (exp.splits?.length ?? 0) === 0) :
                                                filter === "group" ? (exp.groupId && exp.typeOf !== "settle") :
                                                    filter === "friend" ? (!exp.groupId && exp.typeOf !== "settle" && (exp.splits?.length ?? 0) > 0) :
                                                        true;

                                if (!matchesType) return false;

                                // category filter
                                if (category === "all") return true;
                                return (exp?.category || "").toString() === category;
                            })

                            .map((exp) => (
                                <ExpenseItem
                                    key={exp._id}
                                    expense={exp}
                                    onClick={setShowModal}
                                    getPayerInfo={getPayerInfo}
                                    getOweInfo={getOweInfo}
                                    getSettleDirectionText={getSettleDirectionText}
                                    userId={userId}
                                />
                            ))}
                    </ul>
                </div>
            </div>
            {showModal && (
                <ExpenseModal showModal={showModal} setShowModal={setShowModal} fetchExpenses={fetchExpenses} userToken={userToken} userId={userId} categories={categories} />
            )}
        </MainLayout>
    );
};

export default Expenses;
