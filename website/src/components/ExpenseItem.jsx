import React from 'react';
import expenseCategories from "../assets/categories"

const ExpenseItem = ({
    expense,
    onClick,
    getPayerInfo,
    getOweInfo,
    getSettleDirectionText
}) => {
    const isSettle = expense.typeOf === 'settle';
    const isSplit = expense.mode === 'split';
    const getEmojiForCategory = (categoryName) => {
        if(categoryName=='settle') return '🤝'
            const match = expenseCategories.find(c => c.name === categoryName);
            return match ? match.emoji : '';

        };
    const date = new Date(expense.createdAt);
    const month = date.toLocaleString('default', { month: 'short' });
    const day = date.getDate().toString().padStart(2, '0');

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
                        {getEmojiForCategory?.(expense.typeOf=='expense'?expense.category:'settle')}
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
                                    ? `${getPayerInfo(expense.splits)} ${getPayerInfo(expense.splits) !== 'You were not involved' ? `₹${expense.amount.toFixed(2)}` : ''}`
                                    : expense.category}
                            </p>
                        </>
                    ) : (
                        <p className="text-[13px] text-[#81827C] capitalize">
                            {getSettleDirectionText(expense.splits)} ₹{expense.amount.toFixed(2)}
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
                            ₹{Math.abs(expense.amount).toFixed(2)}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ExpenseItem;
