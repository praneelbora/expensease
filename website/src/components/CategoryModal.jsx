// components/CategoryModal.jsx
import { useEffect, useMemo, useState } from "react";
import ModalWrapper from "./ModalWrapper";
import CategoryIcon from "./CategoryIcon";

export default function CategoryModal({
    show,
    onClose,
    options = [],
    value,
    onSelect,
    categoryRedirect,
}) {
    const [query, setQuery] = useState("");

    useEffect(() => {
        if (show) setQuery("");
    }, [show]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter((opt) =>
            `${opt.label} ${opt.value} ${(opt.keywords || []).join(" ")}`.toLowerCase().includes(q)
        );
    }, [options, query]);

    const handleEnter = (e) => {
        if (e.key === "Enter" && filtered.length) {
            onSelect(filtered[0].value);
            onClose?.();
        }
    };

    if (!show) return null;

    return (
        <ModalWrapper
            show={show}
            onClose={onClose}
            title="Select Category"
            footer={
                categoryRedirect && (
                    <div className="w-full text-center text-sm text-[#a0a0a0]">
                        Want to Add / Rearrange?{" "}
                        <button
                            className="text-teal-400 underline"
                            onClick={categoryRedirect}
                        >
                            Customise Categories
                        </button>
                    </div>
                )
            }
        >
            <div className="space-y-3">
                <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleEnter}
                    placeholder="Search categories…"
                    className="w-full bg-[#1f1f1f] text-[#EBF1D5] border border-[#2a2a2a] rounded-md p-2 outline-none focus:border-teal-600"
                />

                <div className="max-h-[65dvh] overflow-y-auto space-y-2 pr-1">
                    {filtered.length === 0 && (
                        <p className="text-sm text-[#81827C] px-1">No matches</p>
                    )}
                    {filtered.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => {
                                onSelect(opt.value);
                                onClose?.();
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded border transition ${value === opt.value
                                    ? "bg-teal-500 text-black border-teal-500"
                                    : "border-[#333] text-[#EBF1D5] hover:border-teal-600"
                                }`}
                        >
                            <CategoryIcon category={opt.value} size={18} />
                            <span>{opt.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </ModalWrapper>
    );
}
