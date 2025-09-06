import React from "react";

/**
 * Basic low-level skeleton wrapper.
 * Usage: <Skeleton className="w-32 h-4 rounded" />
 */
export const Skeleton = ({ className = "" }) => {
    return <div className={`bg-white/5 rounded ${className} animate-pulse`} />;
};

/**
 * Common skeleton building blocks
 */


export const SkeletonCircle = ({ size = 10, className = "" }) => (
    <Skeleton className={`rounded-full w-${size} h-${size} ${className}`} />
);

/**
 * Card-like skeleton used for summary tiles or list cards.
 */
export const SkeletonLine = ({ width = "w-full", height = "h-4", className = "" }) => (
    <div className={`bg-white/5 rounded ${width} ${height} ${className} max-w-full`} />
);

/* Responsive card skeleton — uses min-w-0 and flex-1 to avoid overflow */
export const SkeletonCard = ({ className = "" }) => (
    <div className={`bg-[#1f1f1f] p-4 rounded-xl ${className}`}>
        <div className="flex items-center justify-between min-w-0">
            {/* left column: allow it to shrink and take remaining space */}
            <div className="space-y-2 flex-1 min-w-0">
                {/* responsive widths: small screens use smaller widths, larger screens expand */}
                <SkeletonLine height="h-4" width="w-32 sm:w-40 md:w-48" className="max-w-full" />
                <SkeletonLine height="h-6" width="w-40 sm:w-56 md:w-64" className="max-w-full" />
            </div>


        </div>

        <div className="mt-3 flex gap-2 flex-wrap">
            {/* allow the primary small-line to grow/shrink inside available space */}
            <div className="flex-1 min-w-0">
                <SkeletonLine width="w-full" height="h-6" />
            </div>

            {/* a small fixed pill that stays fixed-size but won't overflow the row */}
            <div className="w-24 flex-shrink-0">
                <SkeletonLine width="w-full" height="h-6" />
            </div>
        </div>
    </div>
);

/**
 * Skeleton for the payment accounts carousel item
 */
export const SkeletonPaymentCard = () => (
    <div className="bg-[#1f1f1f] p-4 rounded-xl min-w-[calc(50%-8px)] snap-start">
        <SkeletonLine width="w-28" height="h-6" />
        <div className="mt-2">
            <SkeletonLine width="w-20" height="h-4" />
            <div className="mt-2 flex gap-2">
                <SkeletonLine width="w-12" height="h-6" />
                <SkeletonLine width="w-12" height="h-6" />
            </div>
        </div>
    </div>
);

/**
 * Skeleton list item for recent expenses
 */
export const SkeletonExpenseItem = () => (
    <li className="bg-[#1f1f1f] p-3 rounded-lg flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-white/5 animate-pulse" />
            <div className="min-w-0">
                <SkeletonLine width="w-40" height="h-4" />
                <SkeletonLine width="w-28" height="h-3" className="mt-2" />
            </div>
        </div>
        <div className="text-right">
            <SkeletonLine width="w-20" height="h-5" />
            <SkeletonLine width="w-12" height="h-3" className="mt-2" />
        </div>
    </li>
);

/**
 * Skeleton placeholder for charts (wide boxes)
 */
export const SkeletonChart = ({ className = "" }) => (
    <div className={`bg-[#1f1f1f] rounded-xl p-4 ${className}`}>
        <div className="w-full h-36 rounded bg-white/3 animate-pulse" />
        <div className="mt-3 flex gap-2">
            <SkeletonLine width="w-20" height="h-4" />
            <SkeletonLine width="w-14" height="h-4" />
        </div>
    </div>
);

export default Skeleton;
