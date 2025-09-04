import React from 'react';

export default function WhatsNewModal({ open, onClose, entries = [], loading }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div className="relative w-full sm:max-w-lg bg-[#1e1e1e] border border-[#2a2a2a] rounded-2xl p-4 sm:p-5 m-2">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-semibold">What’s New</h3>
                    <button onClick={onClose} className="text-sm text-[#a0a0a0] hover:text-[#EBF1D5]">Close</button>
                </div>

                {loading ? (
                    <div className="text-sm text-[#a0a0a0]">Loading…</div>
                ) : entries.length === 0 ? (
                    <div className="text-sm text-[#a0a0a0]">No updates yet.</div>
                ) : (
                    <ul className="space-y-3">
                        {entries.map(e => (
                            <li key={e.id} className="rounded-xl bg-[#151515] border border-[#2a2a2a] p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <h4 className="font-medium">{e.title}</h4>
                                    <span className="text-[11px] text-[#9aa19a]">{new Date(e.date).toLocaleDateString()}</span>
                                </div>
                                {e.tags?.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {e.tags.map(t => (
                                            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2a2a] text-[#e7f0d7]">{t}</span>
                                        ))}
                                    </div>
                                )}
                                <p className="text-sm text-[#cfdac0] mt-2">{e.body}</p>
                                {e.link && (
                                    <a href={e.link} className="inline-block mt-2 text-xs text-teal-400 underline underline-offset-2">
                                        Learn more
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
