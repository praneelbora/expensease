import React from 'react';
import { useAuth } from "../context/AuthContext";
import { getSymbol } from "../utils/currencies";
import { getCategoryOptions, getCategoryLabel } from "../utils/categoryOptions";
import CategoryIcon from './CategoryIcon';

const ExpenseItem = ({
    expense,
    onClick,
    userId
}) => {
    const { userToken, categories } = useAuth() || {}
    const isSettle = expense.typeOf === 'settle';
    const isSplit = expense.mode === 'split';
    const date = new Date(expense.date);
    const month = date.toLocaleString('default', { month: 'short' });
    const day = date.getDate().toString().padStart(2, '0');
    const getPayerInfo = (splits) => {
        const payers = splits.filter(s => s.paying && s.payAmount > 0);
        const userSplit = splits.find(s => s.friendId && s.friendId._id === userId);
        if (!userSplit) return 'not involved';
        if (payers.length === 1) {
            return `${payers[0].friendId?._id==userId? 'You':payers[0].friendId.name} paid`;
        } else if (payers.length > 1) {
            return `${payers.length} people paid`;
        } else {
            return `No one paid`;
        }
    };
    const didIPay = (splits) => {
        const userSplit = splits.find(s => s.friendId && s.friendId._id === userId);
        
        if (!userSplit || !userSplit?.paidFromPaymentMethodId || !userSplit?.paidFromPaymentMethodId?.label || Math.abs(userSplit.payAmount) == 0) return '';
        return `· ${userSplit?.paidFromPaymentMethodId?.label}`
        // console.log(userSplit);
        // // if(expense.typeOf=='split')
        // console.log(userSplit);
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
            return { text: 'you lent', amount: ` ${getSymbol(expense.currency)} ${net.toFixed(2)}` };
        } else if (net < 0) {
            return { text: 'you borrowed', amount: ` ${getSymbol(expense.currency)} ${Math.abs(net).toFixed(2)}` };
        } else {
            return { text: 'no balance' };
        }
    };
    return (
        <div
            key={expense._id}
            onClick={() => onClick(expense)}
            className={`flex flex-row w-full items-center gap-2 min-h-[${isSettle ? 40 : 50}px]`}
        >
            {/* Date */}
            <div className="flex flex-col justify-center items-center text-[#81827C]">
                <p className="text-[11px] uppercase">{month}</p>
                <p className="text-[18px] -mt-[6px]">{day}</p>
            </div>

            {/* Vertical bar */}
            <div className="w-[2px] my-[2px] bg-[#EBF1D5] opacity-50 self-stretch"></div>

            <CategoryIcon category={isSettle ? 'handshake' : expense.category} size={18} />

            {/* Main content */}
            <div className="flex grow flex-row justify-between items-center gap-1 min-w-0">
                {/* Left: Description and payer info */}
                <div className="flex flex-col justify-center min-w-0">
                    {!isSettle ? (
                        <>
                            <p className="text-[18px] capitalize truncate">{expense.description}</p>
                            <p className="text-[13px] text-[#81827C] -mt-[6px] truncate">
                                {isSplit
                                    ? `${getPayerInfo(expense.splits)} ${getPayerInfo(expense.splits) !== 'not involved' ? `${getSymbol(expense.currency)} ${expense.amount.toFixed(2)} ${didIPay(expense.splits)}` : ''}`
                                    : `${getCategoryLabel(expense.category)} ${expense?.paidFromPaymentMethodId?.label?`· ${expense?.paidFromPaymentMethodId?.label}`:''}`}
                            </p>
                        </>
                    ) : (
                        <p className="text-[13px] text-[#81827C]">
                            {getSettleDirectionText(expense.splits)} {getSymbol(expense.currency)} {expense.amount.toFixed(2)}
                        </p>
                    )}
                </div>

                {/* Right: Owe info or amount */}
                {!isSettle && <div className="flex flex-col justify-center items-end text-right shrink-0">
                    {!isSettle && isSplit ? (
                        <>
                            <p className={`text-[12px] whitespace-nowrap ${getOweInfo(expense.splits)?.text == 'no balance' && 'text-[#888]'}`}>{getOweInfo(expense.splits)?.text}</p>
                            <p className="text-[18px] capitalize -mt-[6px] whitespace-nowrap">{getOweInfo(expense.splits)?.amount}</p>
                        </>
                    ) : (
                        <p className="text-[18px] capitalize -mt-[6px] whitespace-nowrap">
                            {getSymbol(expense.currency)} {Math.abs(expense.amount).toFixed(2)}
                        </p>
                    )}
                </div>}
            </div>
        </div>
    );
};

export default ExpenseItem;
