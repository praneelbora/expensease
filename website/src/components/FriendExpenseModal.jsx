import { useEffect, useState } from "react";
import { settleFriendExpense } from "../services/ExpenseService";

export default function FriendExpenseModal({
    show,
    onClose,
    friend,
    expenses,
    userId,
    userToken,
    onSettle
}) {
    const [settleLoading, setSettleLoading] = useState(false);

    const handleSettleAll = async () => {
        try {
            setSettleLoading(true);
            await settleFriendExpense(friend._id, userToken);
            alert("Expenses settled successfully.");
            onSettle();
            onClose();
        } catch (err) {
            alert("Failed to settle expenses.");
        } finally {
            setSettleLoading(false);
        }
    };

    if (!show) return null;

    return (
        <div
            className="justify-center items-center flex overflow-x-hidden overflow-y-auto fixed inset-0 z-[5000] outline-none focus:outline-none backdrop-blur-sm bg-[rgba(0,0,0,0.2)]"
            onClick={onClose}
        >
            <div
                className="relative my-6 mx-auto w-[95dvw] lg:w-[80dvw] xl:w-[40dvw] h-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="rounded-[24px] shadow-lg relative flex flex-col w-full bg-[#212121] text-[#EBF1D5]">
                    <div className="flex items-start justify-between px-5 py-3 border-b border-[rgba(255,255,255,0.1)]">
                        <h3 className="text-2xl font-semibold">{friend.name}</h3>
                        <button
                            className="absolute top-[13px] right-[12px] p-1 text-2xl"
                            onClick={onClose}
                        >
                            ×
                        </button>
                    </div>

                    <div className="p-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
                        {expenses.length === 0 ? (
                            <p>No expenses</p>
                        ) : (
                            expenses.map((exp) => (
                                <div key={exp._id} className="border-b pb-2">
                                    <p className="text-lg font-semibold">{exp.title}</p>
                                    <p className="text-sm text-gray-400">₹ {exp.amount.toFixed(2)}</p>
                                    <div className="text-sm mt-1">
                                        {exp.splits.map((split, idx) => {
                                            const isFriend = split.friendId?._id === friend._id;
                                            const isPaying = split.paying;

                                            return (
                                                <p key={idx}>
                                                    {isFriend
                                                        ? isPaying
                                                            ? `${friend.name} paid ₹${split.payAmount}`
                                                            : `${friend.name} owes ₹${split.oweAmount}`
                                                        : isPaying
                                                            ? `You paid ₹${split.payAmount}`
                                                            : `You owe ₹${split.oweAmount}`
                                                    }
                                                </p>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))
                        )}

                        {expenses.length > 0 && (
                            <button
                                className="bg-teal-300 text-black rounded-md px-4 py-2 mt-2"
                                onClick={handleSettleAll}
                                disabled={settleLoading}
                            >
                                {settleLoading ? "Settling..." : "Settle All"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
