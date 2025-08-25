import { useEffect, useMemo, useRef, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import ExpenseModal from "../components/ExpenseModal";
import { useAuth } from "../context/AuthContext";
import { ChevronLeft, Loader, Plus, Search, SlidersHorizontal } from "lucide-react";
import { getAllExpenses } from '../services/ExpenseService';
import ExpenseItem from "../components/ExpenseItem"; // Adjust import path
import PullToRefresh from "pulltorefreshjs";
import { logEvent } from "../utils/analytics";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAllCurrencyCodes, getSymbol, toCurrencyOptions } from "../utils/currencies"
import FilterModal from "../components/FilterModal"
const Expenses = () => {
    const { user, userToken, defaultCurrency, preferredCurrencies, categories, paymentMethods } = useAuth() || {};
    const [loading, setLoading] = useState(true);
    const [expenses, setExpenses] = useState([]);
    const [userId, setUserId] = useState();
    const [showSearch, setShowSearch] = useState(false);
    const [query, setQuery] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [showFilterModal, setShowFilterModal] = useState(false);
    const navigate = useNavigate();
    const currencyOptions = toCurrencyOptions(getAllCurrencyCodes());
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
    const [appliedFilter, setAppliedFilter] = useState({
        category: initialFilter ? initialFilter : 'all',
        type: initialCategory ? initialCategory : 'all',
        currency: '',
        sort: 'newest'
    });
    const [filter, setFilter] = useState(initialFilter);        // 'all','personal','settle','group','friend'
    const [category, setCategory] = useState(initialCategory);  // category name or 'all'

    // keep URL in sync when state changes
    useEffect(() => {
        const next = new URLSearchParams(searchParams);
        next.set("type", appliedFilter.type);
        next.set("category", appliedFilter.category);
        next.set("sort", appliedFilter.sort);
        setSearchParams(next, { replace: true });
    }, [appliedFilter]);

    // respond to URL changes (e.g., user navigates back)
    useEffect(() => {
        const qt = searchParams.get("type") || "all";
        const qc = searchParams.get("category") || "all";
        const qs = searchParams.get("sort") || "newest";
        if (qt !== appliedFilter.type) setAppliedFilter(f => ({ ...f, type: qf }));
        if (qc !== appliedFilter.category) setAppliedFilter(f => ({ ...f, category: qc }));
        if (qs !== appliedFilter.sort) setAppliedFilter(f => ({ ...f, sort: qs }));
    }, [searchParams]);
    const FILTERS = [
        { key: "all", label: "All Expenses" },
        { key: "personal", label: "Personal Expenses" },
        { key: "settle", label: "Settlements" },
        { key: "group", label: "Group Expenses" },
        { key: "friend", label: "Friend Expenses" },
    ];

    const filters = useMemo(() => {
        const s = new Set();

        expenses?.forEach(e => {
            let key = null;

            if (e?.typeOf === "settle") {
                key = "settle";
            } else if (e?.typeOf === "expense") {
                if (e.mode === "personal") {
                    // personal expenses without group
                    key = e.groupId ? "group" : "friend";
                } else if (e.mode === "split") {
                    // split mode always means group expense
                    key = "group";
                }
            }

            if (key) s.add(key);
        });

        const arr = Array.from(s).sort();

        const mapped = arr.map(type => ({
            key: type,
            label:
                type === "settle" ? "Settlements" :
                    type === "personal" ? "Personal Expenses" :
                        type === "group" ? "Group Expenses" :
                            type === "friend" ? "Friend Expenses" :
                                type.charAt(0).toUpperCase() + type.slice(1)
        }));

        return [{ key: "all", label: "All Expenses" }, ...mapped];
    }, [expenses]);


    const orderedFilters = useMemo(() => {
        const sel = FILTERS.find(f => f.key === filter) || FILTERS[0];
        const rest = FILTERS.filter(f => f.key !== sel.key);
        return [sel, ...rest];
    }, [filter]);
    const filteredExpenses = useMemo(() => {
        const filterExpenses = (
            expenses,
            { type = "all", category = "all", currency = "", sort = "newest" },
            query
        ) => {
            let filtered = [...expenses];

            // 1️⃣ Type filter
            if (type !== "all") {
                filtered = filtered.filter(exp => {
                    switch (type) {
                        case "settle":
                            return exp.typeOf === "settle";
                        case "personal":
                            return !exp.groupId && exp.typeOf !== "settle" && (exp.splits?.length ?? 0) === 0;
                        case "group":
                            return exp.groupId && exp.typeOf !== "settle";
                        case "friend":
                            return !exp.groupId && exp.typeOf !== "settle" && (exp.splits?.length ?? 0) > 0;
                        default:
                            return true;
                    }
                });
            }

            // 2️⃣ Category filter
            if (category !== "all") {
                filtered = filtered.filter(exp => (exp?.category || "") === category);
            }

            // 3️⃣ Currency filter
            if (currency) {
                filtered = filtered.filter(exp => exp.currency === currency);
            }

            // 4️⃣ Search / Query filter
            if (query && query.trim() !== "") {
                const q = query.trim().toLowerCase();

                filtered = filtered.filter(exp => {
                    const inDesc = (exp.description || "").toLowerCase().includes(q);

                    const inNames = (exp.splits || []).some(
                        s => s.friendId && s.friendId.name.toLowerCase().includes(q)
                    );

                    const inAmount = exp.amount?.toString().toLowerCase().includes(q);

                    const inCurrency = (exp.currency || "").toLowerCase().includes(q);                    
                    const inGroup = (exp.groupId?.name || "").toLowerCase().includes(q);

                    // normalize date
                    const dateStr = exp.date
                        ? new Date(exp.date).toLocaleDateString("en-GB", {
                            year: "numeric",
                            month: "short",
                            day: "2-digit",
                        }).toLowerCase()
                        : "";

                    const inDate = dateStr.includes(q);

                    // special case: month only search (e.g. "aug", "2025-08")
                    const monthStr = exp.date
                        ? new Date(exp.date).toLocaleDateString("en-GB", {
                            year: "numeric",
                            month: "short",
                        }).toLowerCase()
                        : "";

                    const inMonth = monthStr.includes(q);

                    return (
                        inDesc ||
                        inNames ||
                        inAmount ||
                        inCurrency ||
                        inGroup ||
                        inDate ||
                        inMonth
                    );
                });
            }


            // 5️⃣ Sort
            if (sort === "newest") {
                filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
            } else if (sort === "oldest") {
                filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
            }

            return filtered;
        };

        // ✅ Call it with current props/state
        return filterExpenses(expenses, appliedFilter, query);
    }, [expenses, filter, category, appliedFilter, query]);


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

                    {/* <button
                        onClick={() => {
                            setShowSearch(!showSearch);
                        }}
                    >
                        <Search strokeWidth={3} size={20} />
                    </button> */}
                </div>
                {/* Type filter */}
                {/* {expenses.length>0 && filters.length>2 && <div className="flex gap-2 flex-row my-3 overflow-x-auto no-scrollbar">
                    {filters.map(({ key, label }) => (
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
                </div>} */}

                {/* Category filter */}
                {/* {expenses.length>0 && categoryOptions.length>2 && <div className={`flex gap-2 flex-row ${!(expenses.length>0 && filters.length>2) && 'mt-3'} mb-3 overflow-x-auto no-scrollbar`}>
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
                </div>} */}
                {expenses.length > 0 && <div className="w-full flex flex-ro gap-2 items-center mt-2 mb-2">

                    <input
                        className={`flex-1 bg-[#121212] text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base min-h-[40px] pl-3`}
                        placeholder="Search Descriptions / Names / Amounts / Currencies"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <button onClick={() => setShowFilterModal(true)} className={`p-2 rounded-md bg-[#212121] ${(appliedFilter.category !== "all" || appliedFilter.type !== "all" || appliedFilter.sort !== "newest") ? 'text-teal-600 ring-1 ring-inset ring-teal-500' : ' text-[#EBF1D5]'}`}>

                        <SlidersHorizontal />
                    </button>
                </div>}

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
                        ) : filteredExpenses?.length === 0 ? (
                            <div className="flex flex-col justify-center items-center flex-1 py-5 text-[#888]">
                                <p>No results found. Please <button
                                    className="text-teal-500 underline"
                                    onClick={() => {
                                        setAppliedFilter({
                                            category: 'all',
                                            type: 'all',
                                            currency: '',
                                            sort: 'newest'
                                        });
                                    }}
                                >
                                    Clear Filters
                                </button></p>
                            </div>
                        ) : <>
                            {filteredExpenses?.map((exp) => (
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
                            {(appliedFilter.type != 'all' || appliedFilter.category != 'all') && (
                                <p className="text-sm text-[#888] text-center mt-3" >End of Results. Please <button
                                    className="text-teal-500 underline"
                                    onClick={() => {
                                        setAppliedFilter({
                                            category: 'all',
                                            type: 'all',
                                            currency: '',
                                            sort: 'newest'
                                        });
                                    }}
                                >
                                    Clear Filters
                                </button> to view more</p>
                            )}
                        </>
                        }
                    </ul>
                </div>
            </div>
            {showModal && (
                <ExpenseModal
                    showModal={showModal}
                    setShowModal={setShowModal}
                    fetchExpenses={fetchExpenses}
                    userToken={userToken}
                    userId={userId}
                    categories={categories}
                    currencyOptions={currencyOptions}
                    defaultCurrency={defaultCurrency}
                    preferredCurrencies={preferredCurrencies}
                    paymentMethods={paymentMethods}
                />
            )}
            {showFilterModal && (
                <FilterModal
                    show={showFilterModal}
                    onClose={() => setShowFilterModal(false)}
                    onApply={(f) => setAppliedFilter(f)}
                    selectedFilters={appliedFilter}
                    filters={FILTERS}
                    categories={categoryOptions}
                    defaultCurrency=""
                />
            )}
        </MainLayout>
    );
};

export default Expenses;
