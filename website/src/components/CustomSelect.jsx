// components/CustomSelect.jsx
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function CustomSelect({
    value,
    onChange,
    options = [],
    placeholder = "Select...",
    className = "",
    disabled = false,
    maxMenuHeight = 240,
    // NEW: optional renderer for the closed trigger label
    renderTriggerLabel, // (selectedOption) => ReactNode
}) {
    const btnRef = useRef(null);
    const menuRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
    const [highlight, setHighlight] = useState(-1);

    const selected = options.find(o => o.value === value);
    const label = selected?.label ?? "";

    const triggerContent =
        typeof renderTriggerLabel === "function"
            ? renderTriggerLabel(selected)
            : label;

    const updatePosition = () => {
        const el = btnRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setCoords({
            top: r.bottom + window.scrollY + 4,
            left: r.left + window.scrollX,
            width: r.width,
        });
    };

    useLayoutEffect(() => {
        if (open) updatePosition();
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handle = () => updatePosition();
        window.addEventListener("resize", handle);
        window.addEventListener("scroll", handle, true);
        return () => {
            window.removeEventListener("resize", handle);
            window.removeEventListener("scroll", handle, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onDocClick = (e) => {
            if (btnRef.current?.contains(e.target)) return;
            if (menuRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, [open]);

    const onTriggerKeyDown = (e) => {
        if (disabled) return;
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
            setHighlight(Math.max(0, options.findIndex(o => o.value === value)));
        }
    };

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (!open) return;
            if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                return;
            }
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(options.length - 1, (h === -1 ? 0 : h + 1)));
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(0, (h === -1 ? 0 : h - 1)));
            }
            if (e.key === "Enter") {
                e.preventDefault();
                if (options[highlight]) {
                    onChange(options[highlight].value);
                    setOpen(false);
                }
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, options, highlight, onChange]);

    const menu = open ? (
        <div
            ref={menuRef}
            style={{
                position: "absolute",
                top: coords.top,
                left: coords.left,
                width: coords.width,
                zIndex: 9999,
            }}
            className="rounded-lg border border-[#333] bg-[#1f1f1f] shadow-xl overflow-hidden"
        >
            <div style={{ maxHeight: maxMenuHeight }} className="overflow-auto">
                {options.map((opt, i) => {
                    const active = opt.value === value;
                    const hl = i === highlight;
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            onMouseEnter={() => setHighlight(i)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                onChange(opt.value);
                                setOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm 
                ${hl ? "bg-[#2a2a2a]" : ""} 
                ${active ? "text-teal-300" : "text-[#EBF1D5]"}`}
                        >
                            {opt.label}
                        </button>
                    );
                })}
                {options.length === 0 && (
                    <div className="px-3 py-2 text-sm text-[#8f8f8f]">No options</div>
                )}
            </div>
        </div>
    ) : null;

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setOpen((s) => !s)}
                onKeyDown={onTriggerKeyDown}
                className={`w-full text-[#EBF1D5] text-[18px] text-left border-b-2 border-[#55554f] p-2 text-base min-h-[40px] pl-3 flex-1 focus:border-[#4b8] ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"} ${className}`}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                {triggerContent || <span className="text-[#8f8f8f]">{placeholder}</span>}
            </button>

            {open ? createPortal(menu, document.body) : null}
        </>
    );
}
