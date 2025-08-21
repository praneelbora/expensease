import React, { useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import ModalWrapper from "./ModalWrapper";
import { useWhatsNewUnread } from "../utils/useWhatsNew";

export default function WhatsNew({ variant = "fab" }) {
    const { entries, loading, unreadCount, markAllRead } = useWhatsNewUnread();
    const [open, setOpen] = useState(false);

    const sorted = useMemo(
        () => [...entries].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
        [entries]
    );

    const openModal = () => {
        setOpen(true);
        markAllRead(); // mark as read when opening
    };

    return (
        <>
            {variant === "fab" && (
                <button
                    type="button"
                    onClick={openModal}
                    className="fixed z-50 rounded-full shadow-md bg-teal-500 text-black
                     hover:bg-teal-400 transition flex items-center justify-center"
                    style={{
                        right: 16,
                        bottom: 96, // sits above mobile navbar; looks fine on desktop too
                        width: 48,
                        height: 48,
                    }}
                    title="What’s new"
                >
                    <div className="relative">
                        <Megaphone size={22} />
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-black" />
                        )}
                    </div>
                </button>
            )}

            <ModalWrapper
                show={open}
                onClose={() => setOpen(false)}
                title="What’s new"
                footer={
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="px-3 py-1.5 rounded-md border border-[#2a2a2a] hover:bg-[#222]"
                        >
                            Close
                        </button>
                    </div>
                }
            >
                {loading ? (
                    <div className="text-sm text-[#B8C4A0]">Loading…</div>
                ) : sorted.length === 0 ? (
                    <div className="text-sm text-[#888]">No updates yet.</div>
                ) : (
                    <ul className="space-y-3">
                        {sorted.map((e) => (
                            <li key={e.id} className="rounded-xl border border-[#2a2a2a] bg-[#141414] p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-base font-semibold">{e.title}</h3>
                                        <p className="text-xs text-[#9aa19a] mt-0.5">
                                            {new Date(e.date).toLocaleDateString()}
                                        </p>
                                    </div>
                                    {Array.isArray(e.tags) && e.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 shrink-0">
                                            {e.tags.map((t) => (
                                                <span
                                                    key={t}
                                                    className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2a2a] text-[#e7f0d7]"
                                                >
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <p className="text-sm text-[#cfdac0] mt-2">{e.body}</p>
                                {e.link && (
                                    <a
                                        href={e.link}
                                        className="inline-flex items-center gap-1 text-xs text-teal-300 hover:text-teal-200 underline underline-offset-2 mt-2"
                                    >
                                        Learn more →
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </ModalWrapper>
        </>
    );
}
