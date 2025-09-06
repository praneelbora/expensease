import { useState, useMemo, useEffect } from "react";
import ModalWrapper from "./ModalWrapper";
import CustomSelect from "./CustomSelect";
import { getAllCurrencyCodes, toCurrencyOptions } from "../utils/currencies";
import CategoryIcon from "./CategoryIcon";
import { getCategoryOptions, getCategoryLabel } from "../utils/categoryOptions";

const SORT_OPTIONS = [
    { value: "newest", label: "Newest First" },
    { value: "oldest", label: "Oldest First" },
];

export default function FilterModal({
    show,
    onClose,
    onApply,
    filters = [],          // type filters [{key,label}]
    categoriesProp = [],       // category filters ["all","food","travel",...]
    paymentMethodsProp = [],
    selectedFilters = {}, // { type, category, currency, sort }
    defaultCurrency = "",
    appliedFilter = {},    // { type, category, currency, sort }
}) {
    const categories = [
        ...(Array.isArray(categoriesProp)
            ? categoriesProp.map(c => ({ value: c, label: getCategoryLabel(c) }))
            : [])
    ];
    const [selectedType, setSelectedType] = useState(appliedFilter.type || "all");
    const [selectedCategory, setSelectedCategory] = useState(appliedFilter.category || "all");
    const [selectedCurrency, setSelectedCurrency] = useState(appliedFilter.currency || "");
    const [sort, setSort] = useState(appliedFilter.sort || "newest");
    const [paymentMethod, setPaymentMethod] = useState(appliedFilter.paymentMethod || "");
    const [owedByMe, setOwedByMe] = useState("any");
    const [paidByMe, setPaidByMe] = useState("any");
    useEffect(() => {
        setSelectedType(selectedFilters.type || "all");
        setSelectedCategory(selectedFilters.category || "all");
        setSelectedCurrency(selectedFilters.currency || "");
        setSort(selectedFilters.sort || "newest");
        setPaymentMethod(selectedFilters.paymentMethod || '')
        setOwedByMe(selectedFilters.owedByMe || 'any')
        setPaidByMe(selectedFilters.paidByMe || 'any')
    }, [selectedFilters, show]);
    const currencyOptions = useMemo(() => {
        const codes = getAllCurrencyCodes();
        return toCurrencyOptions(codes, "en-IN");
    }, []);
    const handleClear = () => {
        setSelectedType("all");
        setSelectedCategory("all");
        setSelectedCurrency("");
        setSort("newest");
        setPaymentMethod("");
        setPaidByMe("any");
        setOwedByMe("any");

        onApply({
            type: "all",
            category: "all",
            currency: "",
            sort: "newest",
            paymentMethod: "",
            paidByMe: "any",
            owedByMe: "any",
        });
        onClose();
    };
    const applyFilters = () => {
        if (!isDirty) return; // guard
        onApply(current);
        onClose?.();
    };
    const normalizeFilters = (f) => ({
        type: f.type ?? "all",
        category: f.category ?? "all",
        currency: f.currency ?? "",
        sort: f.sort ?? "newest",
        paymentMethod: f.paymentMethod ?? "",
        paidByMe: f.paidByMe ?? "any",
        owedByMe: f.owedByMe ?? "any",
    });
    const baseline = useMemo(() => normalizeFilters(selectedFilters), [show, selectedFilters]);
    const current = useMemo(
        () =>
            normalizeFilters({
                type: selectedType,
                category: selectedCategory,
                currency: selectedCurrency,
                sort,
                paymentMethod,
                paidByMe,
                owedByMe,
            }),
        [selectedType, selectedCategory, selectedCurrency, sort, paymentMethod, paidByMe, owedByMe]
    );
    const isDirty = useMemo(
        () => JSON.stringify(baseline) !== JSON.stringify(current),
        [baseline, current]
    );
    const isAtDefaults = useMemo(
        () =>
            JSON.stringify(current) ===
            JSON.stringify(
                normalizeFilters({
                    type: "all",
                    category: "all",
                    currency: "",
                    sort: "newest",
                    paymentMethod: "",
                    paidByMe: "any",
                    owedByMe: "any",
                })
            ),
        [current]
    );
    const triClass = (active) =>
        `px-3 py-1 rounded-full text-sm transition ${active ? "bg-teal-400 text-black" : "bg-[#1f1f1f] text-[#EBF1D5] hover:bg-[#2a2a2a]"
        }`;
    return (
        <ModalWrapper
            show={show}
            onClose={onClose}
            title="Filter & Sort"
            size="lg"
            footer={
                <div className="flex justify-between gap-2 w-full">
                    <button
                        onClick={handleClear}
                        className="px-3 py-1.5 rounded-md border border-[#2a2a2a] hover:bg-[#222]"
                    >
                        Clear All
                    </button>
                    <div className="flex justify-end gap-2 ">
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 rounded-md border border-[#2a2a2a] hover:bg-[#222]"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={applyFilters}
                            disabled={!isDirty}
                            className={`px-3 py-1.5 rounded-md bg-teal-600 text-black ${!isDirty ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                            Apply
                        </button>
                    </div>
                </div>
            }
        >
            {/* Body */}
            <div className="flex flex-col gap-4">

                {/* Type filter */}
                {filters.length > 0 && (
                    <div>
                        <label className="text-xs text-[#9aa19a] mb-1 block">Type</label>
                        <div className="flex flex-wrap gap-2">
                            {filters.map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() => setSelectedType(key === selectedType ? "all" : key)}
                                    className={`px-3 py-1 rounded-full text-sm transition ${selectedType === key
                                        ? "bg-teal-400 text-black"
                                        : "bg-[#1f1f1f] text-[#EBF1D5] hover:bg-[#2a2a2a]"
                                        }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Category filter */}
                {categories.length > 0 && (
                    <div>
                        <label className="text-xs text-[#9aa19a] mb-1 block">Category</label>
                        <div className="flex flex-wrap gap-2">
                            {categories.map((cat, i) => (
                                <button
                                    key={cat.value + i}
                                    onClick={() =>
                                        setSelectedCategory(cat.value === selectedCategory ? "all" : cat.value)
                                    }
                                    className={`flex gap-2 px-3 py-1 rounded-full text-sm transition ${selectedCategory === cat.value
                                        ? "bg-teal-400 text-black"
                                        : "bg-[#1f1f1f] text-[#EBF1D5] hover:bg-[#2a2a2a]"
                                        }`}
                                >
                                    {cat.value !== "all" && <CategoryIcon category={cat.value} className={selectedCategory === cat.value ? "text-black" : ""} />}
                                    {cat.value === "all" ? "All Categories" : cat.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {paymentMethodsProp && paymentMethodsProp.length > 0 && (<div>
                    <label className="text-xs text-[#9aa19a] mb-1 block">Payment Method</label>
                    <CustomSelect
                        value={paymentMethod || ""}
                        onChange={(e) => {

                            setPaymentMethod(e)
                        }}
                        options={[{ value: '', label: 'View All' }, ...paymentMethodsProp.map(p => {
                            return { value: p._id, label: p.label };
                        })]}
                    />

                </div>

                )}


                {/* Currency filter */}
                {/* <div>
                    <label className="text-xs text-[#9aa19a] mb-1 block">Currency</label>
                    <CustomSelect
                        value={selectedCurrency}
                        onChange={(v) => setSelectedCurrency(v)}
                        options={[{ value: "", label: "All Currencies" }, ...currencyOptions]}
                    />
                </div> */}

                {/* Sorting */}
                <div>
                    <label className="text-xs text-[#9aa19a] mb-1 block">Sort by Date</label>
                    <CustomSelect
                        value={sort}
                        onChange={(v) => setSort(v)}
                        options={SORT_OPTIONS}
                    />
                </div>
                <div className="flex flex-wrap justify-between">
                    {/* NEW: Paid by me */}
                    <div>
                        <label className="text-xs text-[#9aa19a] mb-1 block">Paid by Me</label>
                        <div className="flex items-center gap-2 py-1">

                            <button onClick={() => setPaidByMe("any")} className={triClass(paidByMe === "any")}>
                                Any
                            </button>
                            <button onClick={() => setPaidByMe("yes")} className={triClass(paidByMe === "yes")}>
                                Yes
                            </button>
                            <button onClick={() => setPaidByMe("no")} className={triClass(paidByMe === "no")}>
                                No
                            </button>
                        </div>
                    </div>

                    {/* NEW: Owed by me */}
                    {/* <div>
                        <label className="text-xs text-[#9aa19a] mb-1 block">Owed by Me</label>
                        <div className="flex items-center gap-2 py-1">
                            <button onClick={() => setOwedByMe("any")} className={triClass(owedByMe === "any")}>
                                Any
                            </button>
                            <button onClick={() => setOwedByMe("yes")} className={triClass(owedByMe === "yes")}>
                                Yes
                            </button>
                            <button onClick={() => setOwedByMe("no")} className={triClass(owedByMe === "no")}>
                                No
                            </button>

                        </div>
                    </div> */}
                </div>

            </div>
        </ModalWrapper>
    );
}
