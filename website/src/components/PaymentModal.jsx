import React, { useEffect, useMemo, useState } from "react";
import ModalWrapper from "./ModalWrapper";
import upiPng from "../assets/payments/upi.png";
import gpayPng from "../assets/payments/gpay.png";
import phonepePng from "../assets/payments/phonepe.png";
import paytmPng from "../assets/payments/paytm.png";
import { IndianRupee } from "lucide-react"; // or any rupee icon you prefer
import { logEvent } from "../utils/analytics";


export default function PaymentModal({
    show = false,
    onClose,
    amount = 0,                 // number | string (e.g., 125.50)
    receiverName,           // "Amit"
    receiverUpi,            // "amit@okicici"
    note = "Settlement",
    payerName = "You",      // used for pn fallback (optional)
    bank,                   // optional: { accountName, accountNumber, ifsc, bankName }
    apps,                   // optional override of payment app list
}) {

    const [copied, setCopied] = useState("");
    const [editableAmount, setEditableAmount] = useState(amount != 0 ? amount : 0);

    useEffect(() => {
        setEditableAmount(amount || 0);
    }, [amount, show]);
    const amt = useMemo(() => {
        const n = Number(editableAmount || 0);
        return Number.isFinite(n) && n > 0 ? n.toFixed(2) : "0.00";
    }, [editableAmount]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") onClose?.();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    useEffect(() => {
        if (!show) {
            setTab("apps");
            setCopied("");
        }
    }, [show]);



    const upiString = useMemo(() => {
        if (!receiverUpi) return "";
        const params = new URLSearchParams({
            pa: receiverUpi.trim(),
            pn: receiverName || "Friend",
            am: amt,
            cu: "INR",
            tn: note || "Settlement",
        });
        return `upi://pay?${params.toString()}`;
    }, [receiverUpi, receiverName, amt, note]);

    const defaultApps = useMemo(
        () => (apps && apps.length ? apps : [
            { label: "UPI", base: "upi://pay", icon: upiPng },
            { label: "GPay", base: "gpay://upi/pay", icon: gpayPng },
            { label: "PhonePe", base: "phonepe://pay", icon: phonepePng },
            { label: "Paytm", base: "paytmmp://pay", icon: paytmPng },
        ]),
        [apps]
    );

    const deepLink = (base) => {
        if (!receiverUpi) return "#";
        const params = new URLSearchParams({
            pa: receiverUpi.trim(),
            pn: receiverName || "Friend",
            am: amt,
            cu: "INR",
            tn: note || "Settlement",
        });
        return `${base}?${params.toString()}`;
    };

    const copy = async (text, which) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(which);
            setTimeout(() => setCopied(""), 1200);
        } catch { }
    };

    const whatsappHref = () => {
        const msg = `Hey ${receiverName || ""}, sending ₹${amt} ${note ? `for ${note}` : ""}. UPI: ${receiverUpi || "-"}\n${upiString ? `Pay link: ${upiString}` : ""}`;
        return `https://wa.me/?text=${encodeURIComponent(msg)}`;
    };

    return (
        <ModalWrapper
            show={show}
            onClose={onClose}
            title="Complete Payment"
            size="lg"
            footer={
                <div className="flex items-center justify-between w-full">
                    <a
                        href={whatsappHref()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 text-sm rounded border border-[#2a2a2a] hover:border-teal-600"
                    >
                        Share on WhatsApp
                    </a>
                    <div className="flex gap-2">

                        <button
                            onClick={onClose}
                            className="border border-teal-500 text-teal-500 px-4 py-2 rounded font-semibold"
                        >
                            Cancel
                        </button><button
                            onClick={() => {
                                logEvent('navigate', {
                                    fromScreen: 'payment_modal', toScreen: 'settle_modal', source: 'payment_modal'
                                })
                                onClose(editableAmount)
                            }}
                            className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded font-semibold"
                        >
                            Settle
                        </button>
                    </div>
                </div>
            }
        >
            {/* Header summary */}
            <div className="mb-3">
                <p className="text-sm text-gray-400">Pay to</p>
                <div className="flex justify-between items-center gap-2">
                    <h3 className="text-xl font-semibold">{receiverName || "Friend"}</h3>
                    {(!amount || Number(amount) <= 0) ? (
                        <div className="flex justify-center items-center">
                            <IndianRupee size={20} className="text-gray-300 mr-1" />
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editableAmount}
                                onChange={(e) => setEditableAmount(e.target.value)}
                                className="bg-transparent border-b border-gray-500 text-[20px] w-24 focus:outline-none focus:border-teal-500"
                                placeholder="0.00"
                            />
                        </div>
                    ) : (
                        <div className="flex items-center text-sm text-gray-300">
                            <IndianRupee size={14} className="mr-1" />
                            {amt}
                        </div>
                    )}
                </div>

                {receiverUpi && (
                    <div className="mt-1 flex items-center gap-2 text-sm">
                        <span className="text-gray-400">UPI</span>
                        <code className="bg-[#1e1e1e] px-2 py-0.5 rounded">{receiverUpi}</code>
                        <button
                            onClick={() => {
                                logEvent('upi_copied', {
                                    screen: 'payment_modal',
                                })
                                copy(receiverUpi, "upi")
                            }}
                            className="text-xs px-2 py-0.5 rounded border border-[#2a2a2a] hover:border-[#666]"
                        >
                            {copied === "upi" ? "Copied" : "Copy"}
                        </button>
                    </div>
                )}
                {note && <p className="text-xs text-gray-500 mt-1">Note: {note}</p>}
            </div>


            {/* Content */}
            <div className="mt-4">
                {/* {tab === "apps" && ( */}
                <div className="grid grid-cols-2 gap-2">
                    {defaultApps.map((opt) => (
                        <a
                            key={opt.label}
                            href={receiverUpi ? deepLink(opt.base) : "#"}
                            onClick={(e) => {
                                logEvent('upi_payment_button_pressed', {
                                    screen: 'payment_modal',
                                    method: opt.label
                                });

                                if (!receiverUpi) e.preventDefault();
                            }}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-3 bg-white text-black py-2 px-3 rounded-md hover:opacity-90 ${receiverUpi ? "" : "opacity-50 cursor-not-allowed"}`}
                        >
                            <img src={opt.icon} alt={opt.label} className="w-8 h-8 object-contain" />
                            <span className="font-semibold">Pay with {opt.label}</span>
                        </a>

                    ))}
                </div>
                {/* )} */}
                <p className="text-[11px] text-gray-500 mt-2">
                    Note: Once Payment is completed click on <span className="underline underline-offset-2">Settle</span>
                </p>
            </div>
        </ModalWrapper>
    );
}

