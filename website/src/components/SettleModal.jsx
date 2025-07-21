import { useState } from 'react';

export default function SettleModal({ setShowModal, group, onSubmit }) {
    const [payerId, setPayerId] = useState('');
    const [receiverId, setReceiverId] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');

    const handleConfirm = () => {
        if (!payerId || !receiverId || !amount || payerId === receiverId) {
            alert('Please fill all fields correctly.');
            return;
        }
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
            <div
                className="justify-center items-center flex overflow-x-hidden overflow-y-auto fixed inset-0 z-[5000] outline-none focus:outline-none backdrop-blur-sm bg-[rgba(0,0,0,0.2)]"
                onClick={() => setShowModal(false)}
            >
                <div
                    className="relative my-6 mx-auto w-[95dvw] lg:w-[80dvw] xl:w-[40dvw] h-auto px-3"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="rounded-[24px] shadow-lg relative flex flex-col w-full bg-[#212121]">
                        {/* Header */}
                        <div className="flex items-start justify-between px-5 py-3 border-b border-solid border-[rgba(255,255,255,0.1)]">
                            <h3 className="text-2xl font-semibold text-[#EBF1D5]">Record a Settlement</h3>
                            <button
                                className="absolute top-[13px] right-[12px] p-1 ml-auto bg-transparent border-0 text-[#EBF1D5] float-right text-2xl leading-none font-semibold outline-none focus:outline-none"
                                onClick={() => setShowModal(false)}
                            >
                                <span className="bg-transparent text-[#EBF1D5] h-6 w-6 block outline-none focus:outline-none">×</span>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="w-full flex flex-col p-5 gap-3 max-h-[70dvh] overflow-scroll text-[#EBF1D5]">
                            <div className="flex flex-col gap-2">
                                <label>Paid By</label>
                                <select
                                    value={payerId}
                                    onChange={(e) => setPayerId(e.target.value)}
                                    className="bg-[#121212] border border-[#EBF1D5] text-[#EBF1D5] px-3 py-2 rounded"
                                >
                                    <option value="">Select payer</option>
                                    {group?.members.map(m => (
                                        <option key={m._id} value={m._id}>{m.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label>Received By</label>
                                <select
                                    value={receiverId}
                                    onChange={(e) => setReceiverId(e.target.value)}
                                    className="bg-[#121212] border border-[#EBF1D5] text-[#EBF1D5] px-3 py-2 rounded"
                                >
                                    <option value="">Select receiver</option>
                                    {group?.members.map(m => (
                                        <option key={m._id} value={m._id}>{m.name}</option>
                                    ))}
                                </select>
                            </div>

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
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end p-5 border-t border-solid border-[rgba(255,255,255,0.1)] gap-3">
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-[#EBF1D5] px-4 py-2"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirm}
                                className="bg-teal-400 text-black px-4 py-2 rounded font-semibold"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="opacity-25 fixed inset-0 z-40 bg-black"></div>
        </>
    );
}
