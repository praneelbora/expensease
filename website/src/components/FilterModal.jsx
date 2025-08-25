import { useState, useMemo, useEffect } from "react";
import ModalWrapper from "./ModalWrapper";
import CustomSelect from "./CustomSelect";
import { getAllCurrencyCodes, toCurrencyOptions } from "../utils/currencies";

const SORT_OPTIONS = [
    { value: "newest", label: "Newest First" },
    { value: "oldest", label: "Oldest First" },
];

export default function FilterModal({
    show,
    onClose,
    onApply,
    filters = [],          // type filters [{key,label}]
    categories = [],       // category filters ["all","food","travel",...]
    selectedFilters = {}, // { type, category, currency, sort }
    defaultCurrency = "",
    appliedFilter = {},    // { type, category, currency, sort }
}) {

    const [selectedType, setSelectedType] = useState(appliedFilter.type || "all");
    const [selectedCategory, setSelectedCategory] = useState(appliedFilter.category || "all");
    const [selectedCurrency, setSelectedCurrency] = useState(appliedFilter.currency || "");
    const [sort, setSort] = useState(appliedFilter.sort || "newest");
    useEffect(() => {
        setSelectedType(selectedFilters.type || "all");
        setSelectedCategory(selectedFilters.category || "all");
        setSelectedCurrency(selectedFilters.currency || "");
        setSort(selectedFilters.sort || "newest");
    }, [selectedFilters, show]);
    // all currencies
    const currencyOptions = useMemo(() => {
        const codes = getAllCurrencyCodes();
        return toCurrencyOptions(codes, "en-IN");
    }, []);
    const handleClear = () => {
        setSelectedType("all");
        setSelectedCategory("all");
        setSelectedCurrency("");
        setSort("newest");

        // also tell parent that filters are cleared
        onApply({
            type: "all",
            category: "all",
            currency: "",
            sort: "newest",
        });
        onClose();
    };
    const applyFilters = () => {
        onApply({
            type: selectedType,
            category: selectedCategory,
            currency: selectedCurrency,
            sort,
        });
        onClose?.();
    };

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
                            className="px-3 py-1.5 rounded-md bg-teal-600 text-black font-semibold"
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
                                        ? "bg-teal-400 text-black font-semibold"
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
                            {categories.map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat === selectedCategory ? "all" : cat)}
                                    className={`px-3 py-1 rounded-full text-sm transition ${selectedCategory === cat
                                        ? "bg-teal-400 text-black font-semibold"
                                        : "bg-[#1f1f1f] text-[#EBF1D5] hover:bg-[#2a2a2a]"
                                        }`}
                                >
                                    {cat === "all" ? "All Categories" : cat}
                                </button>
                            ))}
                        </div>
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
            </div>
        </ModalWrapper>
    );
}
