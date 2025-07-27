import { deleteExpense } from "../services/ExpenseService";

export default function ExpenseModal({ showModal, setShowModal, fetchExpenses, userToken }) {
    const { description, amount, createdAt, createdBy, splits, groupId } = showModal;
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

const handleDelete = async () => {
    const confirmDelete = window.confirm("Are you sure you want to delete this expense?");
    if (!confirmDelete || !showModal._id) return;

    try {
        await deleteExpense(showModal._id, userToken); // pass the expense ID and token
        alert("Expense deleted successfully!");
        fetchExpenses(); 
        setShowModal(false); // close modal
    } catch (err) {
        alert(err.message || "Something went wrong while deleting.");
    }
};

    const formatDate = (date) => {
        const d = new Date(date);
        return `${d.getDate()} ${d.toLocaleString('default', { month: 'long' })}, ${d.getFullYear()}`;
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
                    {/* Modal content */}
                    <div className="rounded-[24px] shadow-lg relative flex flex-col w-full bg-[#212121]">
                        {/* Header */}
                        <div className="flex items-start justify-between px-5 py-3 border-b border-solid border-[rgba(255,255,255,0.1)]">
                            <h3 className="text-2xl font-semibold text-[#EBF1D5]">Expense Details</h3>
                            <button
                                className="absolute top-[13px] right-[12px] p-1 ml-auto bg-transparent border-0 text-[#EBF1D5] float-right text-2xl leading-none font-semibold outline-none focus:outline-none"
                                onClick={() => setShowModal(false)}
                            >
                                <span className="bg-transparent text-[#EBF1D5] h-6 w-6 block outline-none focus:outline-none">×</span>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="w-full flex flex-col p-3 gap-3 max-h-[70dvh] overflow-scroll">
                            <div className="w-full flex flex-row justify-between">
                                <div className="w-full flex flex-col">
                                    <div className="w-full flex flex-row justify-between">
                                        <p className="text-[#EBF1D5] text-[24px]">₹{amount.toFixed(2)}</p>
                                        <p className="text-[#EBF1D5] text-[14px]">{formatDate(createdAt)}</p>
                                    </div>
                                    <p className="text-[#EBF1D5] text-[18px] capitalize">{description}</p>
                                </div>
                            </div>
                            <hr />
                            <p className="text-[#EBF1D5] text-lg">{getPayerInfo(splits)} ₹{amount.toFixed(2)}</p>


                            {/* Splits */}
                            <div className="ms-4">
                                <div className="text-[#EBF1D5] flex flex-col gap-1">
                                    {splits.map((split, index) => (split.payAmount > 0 || split.oweAmount > 0) && (
                                        <div key={index} className="flex">
                                            <p>{split.friendId.name} {split.payAmount > 0 ? `paid  ₹${split.payAmount.toFixed(2)} ${split.oweAmount > 0 ? 'and' : ''}` : ''} owes  ₹{split.oweAmount.toFixed(2)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <hr />
                            <div className="flex flex-col">
                                <p className="text-[#EBF1D5] capitalize text-[13px]">Created By: {createdBy.name} </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end p-5 border-t border-solid border-[rgba(255,255,255,0.1)] rounded-b">
                            <button
                                onClick={handleDelete}
                                className="text-red-500 border border-red-500 px-4 py-2 rounded-md hover:bg-red-500 hover:text-white transition"
                            >
                                Delete Expense
                            </button>
                            <button
                                onClick={() => setShowModal(false)}
                                className="ml-2 text-[#EBF1D5] border border-[#EBF1D5] px-4 py-2 rounded-md hover:bg-[#3a3a3a] transition"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="opacity-25 fixed inset-0 z-40 bg-black"></div>
        </>
    );
}
