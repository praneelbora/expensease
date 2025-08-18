import React from 'react';
import { useAuth } from "../context/AuthContext";
import { getSymbol } from "../utils/currencies";
const ExpenseItem = ({
    expense,
    onClick,
    userId
}) => {
    const { userToken, categories } = useAuth() || {}

    const isSettle = expense.typeOf === 'settle';
    const isSplit = expense.mode === 'split';
    const getEmojiForCategory = (categoryName) => {
        if (categoryName == 'settle') return '🤝'
        const match = categories.find(c => c.name === categoryName);
        return match ? match.emoji : '';

    };
    const date = new Date(expense.date);
    const month = date.toLocaleString('default', { month: 'short' });
    const day = date.getDate().toString().padStart(2, '0');
    const getPayerInfo = (splits) => {
        const payers = splits.filter(s => s.paying && s.payAmount > 0);
        if (payers.length === 1) {
            return `${payers[0].friendId.name} paid`;
        } else if (payers.length > 1) {
            return `${payers.length} people paid`;
        } else {
            return `No one paid`;
        }
    };
    const getSettleDirectionText = (splits) => {
        const payer = splits.find(s => s.paying && s.payAmount > 0);
        const receiver = splits.find(s => s.owing && s.oweAmount > 0);

        if (!payer || !receiver) return "Invalid settlement";

        const payerName = payer.friendId._id === userId ? "You" : payer.friendId.name;
        const receiverName = receiver.friendId._id === userId ? "you" : receiver.friendId.name;

        return `${payerName} paid ${receiverName}`;
    };
    const getOweInfo = (splits) => {
        const userSplit = splits.find(s => s.friendId && s.friendId._id === userId);

        if (!userSplit) return null;

        const { oweAmount = 0, payAmount = 0 } = userSplit;
        const net = payAmount - oweAmount;

        if (net > 0) {
            return { text: 'you lent', amount: ` ${getSymbol('en-IN', expense.currency)} ${net.toFixed(2)}` };
        } else if (net < 0) {
            return { text: 'you borrowed', amount: ` ${getSymbol('en-IN', expense.currency)} ${Math.abs(net).toFixed(2)}` };
        } else {
            return null;
        }
    };
    return (
        <div
            key={expense._id}
            onClick={() => onClick(expense)}
            className={`flex flex-row w-full items-center gap-2 min-h-[${isSettle ? 40 : 50}px]`}
        >
            {/* Date */}
            <div className="flex flex-col justify-center items-center">
                <p className="text-[13px] uppercase">{month}</p>
                <p className="text-[18px] -mt-[6px]">{day}</p>
            </div>

            {/* Vertical bar */}
            <div className="w-[2px] my-[2px] bg-[#EBF1D5] opacity-50 self-stretch"></div>

            {/* Optional emoji */}

            <div className="flex flex-col justify-center items-center">
                <p className="text-[18px] -mt-[6px]">
                    {getEmojiForCategory?.(expense.typeOf == 'expense' ? expense.category : 'settle')}
                </p>
            </div>

            {/* Main content */}
            <div className="flex grow flex-row justify-between items-center gap-4 min-w-0">
                {/* Left: Description and payer info */}
                <div className="flex flex-col justify-center min-w-0">
                    {!isSettle ? (
                        <>
                            <p className="text-[18px] capitalize truncate">{expense.description}</p>
                            <p className="text-[13px] text-[#81827C] capitalize -mt-[6px]">
                                {isSplit
                                    ? `${getPayerInfo(expense.splits)} ${getPayerInfo(expense.splits) !== 'You were not involved' ? `${getSymbol('en-IN', expense.currency)} ${expense.amount.toFixed(2)}` : ''}`
                                    : expense.category}
                            </p>
                        </>
                    ) : (
                        <p className="text-[13px] text-[#81827C] capitalize">
                            {getSettleDirectionText(expense.splits)} {getSymbol('en-IN', expense.currency)} {expense.amount.toFixed(2)}
                        </p>
                    )}
                </div>

                {/* Right: Owe info or amount */}
                <div className="flex flex-col justify-center items-end text-right shrink-0">
                    {!isSettle && isSplit ? (
                        <>
                            <p className="text-[12px] whitespace-nowrap">{getOweInfo(expense.splits)?.text}</p>
                            <p className="text-[18px] capitalize -mt-[6px] whitespace-nowrap">{getOweInfo(expense.splits)?.amount}</p>
                        </>
                    ) : (
                        <p className="text-[18px] capitalize -mt-[6px] whitespace-nowrap">
                            {getSymbol('en-IN', expense.currency)} {Math.abs(expense.amount).toFixed(2)}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ExpenseItem;
