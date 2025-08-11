import React, { useEffect } from "react";
import { X } from "lucide-react";
import { isMobile } from "react-device-detect";

/**
 * Reusable modal wrapper
 * @param {boolean} show - Whether modal is visible
 * @param {function} onClose - Close handler
 * @param {ReactNode} title - Modal title
 * @param {ReactNode} children - Body content
 * @param {ReactNode} footer - Footer content (optional)
 * @param {string} size - "sm" | "md" | "lg" | "xl" (default: md)
 */
export default function ModalWrapper({
    show,
    onClose,
    title,
    children,
    footer,
    size = "md",
}) {
    // Esc key close
    useEffect(() => {
        if (!show) return;
        const handleKey = (e) => {
            if (e.key === "Escape") onClose?.();
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [show, onClose]);

    if (!show) return null;

    const sizeClasses = {
        sm: "sm:max-w-sm",
        md: "sm:max-w-md",
        lg: "sm:max-w-lg",
        xl: "sm:max-w-xl",
    };
    const desktopSizeClasses = {
        sm: "max-w-sm",
        md: "max-w-lg",
        lg: "max-w-2xl",
        xl: "max-w-4xl",
        full: "max-w-[min(1200px,90vw)]",
    };

    if (isMobile) {
        return (
            <div
                className="fixed inset-0 z-[100] flex justify-center items-start overflow-y-auto"
                onClick={onClose}
            >
                <div
                    className={`absolute bottom-0 w-full ${sizeClasses[size]} bg-[#212121] text-[#EBF1D5] rounded-t-2xl sm:rounded-2xl border border-[#333] flex flex-col`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-[#333] capitalize">
                        {typeof title === "string" ? (
                            <h3 className="text-lg font-semibold">{title}</h3>
                        ) : (
                            title
                        )}
                        <button
                            className="p-2 rounded-md hover:bg-[#2a2a2a]"
                            onClick={onClose}
                            aria-label="Close"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-5">{children}</div>

                    {/* Footer */}
                    {footer && (
                        <div className="border-t border-[#333] p-4 flex justify-end gap-3">
                            {footer}
                        </div>
                    )}
                </div>
            </div>
        );
    }
    else {
        return (
            <div
                className="fixed inset-0 z-[100] flex items-center justify-center"
                onClick={onClose}
                role="dialog"
                aria-modal="true"
            >
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

                {/* Card */}
                <div
                    className={`relative w-full mx-4 ${desktopSizeClasses[size] || "max-w-2xl"} 
          bg-[#212121] text-[#EBF1D5] rounded-2xl border border-[#333] shadow-2xl flex flex-col`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-[#333] capitalize">
                        {typeof title === "string" ? (
                            <h3 className="text-lg font-semibold">{title}</h3>
                        ) : (
                            title
                        )}
                        <button
                            className="p-2 rounded-md hover:bg-[#2a2a2a]"
                            onClick={onClose}
                            aria-label="Close"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-5">{children}</div>

                    {/* Footer */}
                    {footer && (
                        <div className="border-t border-[#333] p-4 flex justify-end gap-3">
                            {footer}
                        </div>
                    )}
                </div>
            </div>
        );
    }
}
