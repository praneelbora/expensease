import { useState } from 'react';
export default function SettleModal({ setShowModal, group, simplifiedTransactions, onSubmit, userId, friends }) {
    const [payerId, setPayerId] = useState('');
    const [receiverId, setReceiverId] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [settleMode, setSettleMode] = useState('suggested'); // 'suggested' or 'custom'
    const [confirmationVisible, setConfirmationVisible] = useState(false);
    const [selectedTxnIndex, setSelectedTxnIndex] = useState(null);

    const getConfirmationText = () => {
        const payerName = getMemberName(payerId);
        const receiverName = getMemberName(receiverId);

        if (!payerId || !receiverId || payerId === receiverId) return '';

        if (payerName === 'You') return `You paid ${receiverName}`;
        if (receiverName === 'You') return `${payerName} paid You`;
        return `${payerName} paid ${receiverName}`;
    };

    const handleToggle = (mode) => {
        setSettleMode(mode);
        setPayerId('')
        setReceiverId('')
        setAmount('')
        setDescription('')
        setSelectedTxnIndex(null)
    };
    const handlePrefill = (txn) => {
        setPayerId(txn.from);
        setReceiverId(txn.to);
        setAmount(txn.amount.toFixed(2));
        setDescription(`Settling debt between ${getMemberName(txn.from)} and ${getMemberName(txn.to)}`);
    };

    const getMemberName = (id) => {
        if(group){
            const member = group?.members.find(m => m._id === id);
            if (member._id == userId) return "You"
            return member?.name || 'Unknown';
        }
        else {
            const member = friends.find(f=> f.id===id)
            return member?.name || 'Unknown'
        }
    };

    const handleConfirm = () => {
        if (!payerId || !receiverId || !amount || payerId === receiverId) {
            alert('Please fill all fields correctly.');
            return;
        }
        setConfirmationVisible(true); // show confirm step first
    };
    const handleFinalSubmit = () => {
        
        onSubmit({
            payerId,
            receiverId,
            amount: parseFloat(amount),
            description
        });
        setShowModal(false);
    };


    return (
        <>
            <div className="justify-center items-center flex overflow-x-hidden overflow-y-auto fixed inset-0 z-[5000] outline-none focus:outline-none backdrop-blur-sm bg-[rgba(0,0,0,0.2)]" onClick={() => setShowModal(false)}>
                <div className="relative my-6 mx-auto w-[95dvw] lg:w-[80dvw] xl:w-[40dvw] h-auto px-3" onClick={(e) => e.stopPropagation()}>
                    <div className="rounded-[24px] shadow-lg relative flex flex-col w-full bg-[#212121]">

                        {/* Header */}
                        <div className="flex items-start justify-between px-5 py-3 border-b border-solid border-[rgba(255,255,255,0.1)]">
                            <h3 className="text-2xl font-semibold text-[#EBF1D5]">Record a Settlement</h3>
                            <button className="absolute top-[13px] right-[12px] p-1 ml-auto bg-transparent border-0 text-[#EBF1D5] float-right text-2xl leading-none font-semibold outline-none focus:outline-none" onClick={() => setShowModal(false)}>
                                <span className="bg-transparent text-[#EBF1D5] h-6 w-6 block outline-none focus:outline-none">×</span>
                            </button>
                        </div>
                        {confirmationVisible ? (
                            <div className='flex flex-col h-[200px] justify-center items-center'>
                                <p className="text-[18px] text-center text-[#EBF1D5] text-lg font-medium">
                                    {getConfirmationText()}
                                </p>
                                <p className="text-center text-teal-400 text-2xl">₹{parseFloat(amount).toFixed(2)}</p>

                            </div>) : (<>
                                <div className="flex items-center justify-center mt-4">
                                    <div className="flex border border-[#EBF1D5] rounded-full p-1 bg-[#1f1f1f]">
                                        <button
                                            onClick={() => handleToggle('suggested')}
                                            className={`px-6 py-1.5 rounded-full text-sm transition-all duration-200 font-medium ${settleMode === 'suggested'
                                                ? 'bg-[#EBF1D5] text-[#121212]'
                                                : 'text-[#EBF1D5] hover:bg-[#2a2a2a]'
                                                }`}
                                        >
                                            Suggested
                                        </button>
                                        <button
                                            onClick={() => handleToggle('custom')}
                                            className={`px-6 py-1.5 rounded-full text-sm transition-all duration-200 font-medium ${settleMode === 'custom'
                                                ? 'bg-[#EBF1D5] text-[#121212]'
                                                : 'text-[#EBF1D5] hover:bg-[#2a2a2a]'
                                                }`}
                                        >
                                            Custom
                                        </button>
                                    </div>
                                </div>

                                <div className="w-full flex flex-col p-5 gap-3 max-h-[70dvh] overflow-scroll text-[#EBF1D5]">
                                    {settleMode === 'suggested' && (
                                        <>
                                            <div className="flex flex-col gap-2 text-sm">
                                                {simplifiedTransactions?.map((txn, idx) => {
                                                    const from = getMemberName(txn.from);
                                                    const to = getMemberName(txn.to);
                                                    const amt = txn.amount.toFixed(2);
                                                    const isSelected = idx === selectedTxnIndex;

                                                    return (
                                                        <div
                                                            key={idx}
                                                            onClick={() => {
                                                                setSelectedTxnIndex(idx);
                                                                handlePrefill(txn);
                                                                setConfirmationVisible(false); // reset if previously shown
                                                            }}
                                                            className={`flex justify-between items-center px-3 py-2 rounded cursor-pointer border transition-all ${isSelected
                                                                ? 'bg-teal-900 border-teal-400 text-teal-200'
                                                                : 'bg-[#121212] border-[rgba(255,255,255,0.1)]'
                                                                }`}
                                                        >
                                                            <span>{`${from} owes ${to} ₹${amt}`}</span>
                                                        </div>
                                                    );
                                                })}

                                            </div>
                                        </>
                                    )}

                                    {settleMode === 'custom' && (
                                        <>
                                            {/* Paid By */}
                                            <div className="flex flex-col gap-2">
                                                <label>Paid By</label>
                                                <select value={payerId} onChange={(e) => setPayerId(e.target.value)} className="bg-[#121212] border border-[#EBF1D5] text-[#EBF1D5] px-3 py-2 rounded">
                                                    <option value="">Select payer</option>
                                                    {group?.members.map(m => (
                                                        <option key={m._id} value={m._id}>{m.name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Received By */}
                                            <div className="flex flex-col gap-2">
                                                <label>Received By</label>
                                                <select value={receiverId} onChange={(e) => setReceiverId(e.target.value)} className="bg-[#121212] border border-[#EBF1D5] text-[#EBF1D5] px-3 py-2 rounded">
                                                    <option value="">Select receiver</option>
                                                    {group?.members.map(m => (
                                                        <option key={m._id} value={m._id}>{m.name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Amount */}
                                            <div className="flex flex-col gap-2">
                                                <label>Amount</label>
                                                <input
                                                    type="number"
                                                    value={amount}
                                                    onChange={(e) => setAmount(e.target.value)}
                                                    placeholder="Enter amount"
                                                    className="bg-[#121212] border border-[#EBF1D5] text-[#EBF1D5] px-3 py-2 rounded"
                                                />
                                            </div>

                                            {/* Description */}
                                            <div className="flex flex-col gap-2">
                                                <label>Description (optional)</label>
                                                <input
                                                    type="text"
                                                    value={description}
                                                    onChange={(e) => setDescription(e.target.value)}
                                                    placeholder="Add a description"
                                                    className="bg-[#121212] border border-[#EBF1D5] text-[#EBF1D5] px-3 py-2 rounded"
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                            </>)}

                        {/* Footer */}
                        <div className="flex flex-col border-t border-[rgba(255,255,255,0.1)] p-5 gap-3">


                            {confirmationVisible ? <div className="flex items-center justify-end gap-3">

                                <button onClick={() => setConfirmationVisible(false)} className="text-[#EBF1D5] px-4 py-2">Back</button>
                                <button onClick={handleFinalSubmit} className="bg-teal-400 text-black px-4 py-2 rounded font-semibold">Confirm</button>
                            </div> : <div className="flex items-center justify-end gap-3">
                                <button onClick={() => setShowModal(false)} className="text-[#EBF1D5] px-4 py-2">Cancel</button>
                                {(settleMode === 'custom' || selectedTxnIndex !== null) && (
                                    <button onClick={handleConfirm} className="bg-teal-400 text-black px-4 py-2 rounded font-semibold">
                                        Confirm
                                    </button>
                                )}
                            </div>}

                        </div>

                    </div>
                </div>
            </div>
            <div className="opacity-25 fixed inset-0 z-40 bg-black"></div>
        </>
    );
}
