import { useState } from "react";

export default function LoanRepayModal({
  setShowModal,
  loan,
  userId,
  onSubmitRepayment,
  onCloseLoan,
}) {
    console.log(loan);
    
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [confirmationVisible, setConfirmationVisible] = useState(false);

  const youAreLender = loan.lenderId?._id === userId;
  const youAreBorrower = loan.borrowerId?._id === userId;

  const friend =
    youAreBorrower ? loan.lenderId : loan.borrowerId;
  const friendName = friend?.name || "Unknown";

  const formatINR = (n) => `₹${Number(n || 0).toFixed(2)}`;
  const titleCase = (s = "") =>
    s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

  const outstanding =
    loan.principal +
    (loan.interest || 0) -
    (loan.repayments?.reduce((sum, r) => sum + r.amount, 0) || 0);

  const headerSummary = youAreBorrower
    ? `You borrowed ${formatINR(loan.principal)} from ${titleCase(friendName)}`
    : `You lent ${formatINR(loan.principal)} to ${titleCase(friendName)}`;

  const handleConfirm = () => {
    if (!amount || Number(amount) <= 0 || Number(amount) > outstanding) return;
    setConfirmationVisible(true);
  };

  const handleFinalSubmit = () => {
    onSubmitRepayment({
      loanId: loan._id,
      amount: parseFloat(amount),
      note,
    });
    setShowModal(false);
  };

  const handleMarkFullyRepaid = () => {
    if (onCloseLoan) {
      onCloseLoan(loan._id);
    }
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
              <h3 className="text-2xl font-semibold text-[#EBF1D5]">
                {outstanding <= 0 ? "Loan Settled" : "Repay / Settle Loan"}
              </h3>
              <button
                className="absolute top-[13px] right-[12px] p-1 ml-auto bg-transparent border-0 text-[#EBF1D5] float-right text-2xl leading-none font-semibold outline-none focus:outline-none"
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>

            {outstanding <= 0 ? (
              // Fully repaid screen
              <div className="p-6 flex flex-col gap-4 text-[#EBF1D5]">
                <p className="text-lg">{headerSummary}</p>
                <p>
                  Outstanding: {formatINR(0)} • Status:{" "}
                  <span className="text-teal-400">closed</span>
                </p>
                <p className="mt-4">This loan is already fully repaid.</p>
                <div className="flex justify-end gap-3 mt-4">
                  <button
                    onClick={() => setShowModal(false)}
                    className="text-[#EBF1D5] px-4 py-2"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleMarkFullyRepaid}
                    className="bg-teal-400 text-black px-4 py-2 rounded font-semibold"
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : confirmationVisible ? (
              // Confirmation view
              <div className="flex flex-col h-[200px] justify-center items-center">
                <p className="text-[#EBF1D5] text-lg font-medium text-center">
                  {youAreBorrower
                    ? `You will pay ${titleCase(friendName)}`
                    : `${titleCase(friendName)} will pay you`}{" "}
                  {formatINR(amount)}
                </p>
                {note && (
                  <p className="text-sm text-gray-400 mt-2">{note}</p>
                )}
                <div className="flex items-center justify-end gap-3 mt-6">
                  <button
                    onClick={() => setConfirmationVisible(false)}
                    className="text-[#EBF1D5] px-4 py-2"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleFinalSubmit}
                    className="bg-teal-400 text-black px-4 py-2 rounded font-semibold"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            ) : (
              // Form view
              <div className="p-5 flex flex-col gap-3 text-[#EBF1D5]">
                <p className="text-lg">{headerSummary}</p>
                <p>
                  Outstanding: {formatINR(outstanding)} • Status:{" "}
                  <span className="text-yellow-400">open</span>
                </p>

                {/* Amount */}
                <div className="flex flex-col gap-2 mt-3">
                  <label>Repayment Amount</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="bg-[#121212] border border-[#EBF1D5] text-[#EBF1D5] px-3 py-2 rounded"
                  />
                </div>

                {/* Note */}
                <div className="flex flex-col gap-2">
                  <label>Note (optional)</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note"
                    className="bg-[#121212] border border-[#EBF1D5] text-[#EBF1D5] px-3 py-2 rounded"
                  />
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 mt-5">
                  <button
                    onClick={() => setShowModal(false)}
                    className="text-[#EBF1D5] px-4 py-2"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={
                      !amount ||
                      Number(amount) <= 0 ||
                      Number(amount) > outstanding
                    }
                    className={`px-4 py-2 rounded font-semibold ${
                      !amount ||
                      Number(amount) <= 0 ||
                      Number(amount) > outstanding
                        ? "bg-[#333] text-[#777] cursor-not-allowed"
                        : "bg-teal-400 text-black"
                    }`}
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="opacity-25 fixed inset-0 z-40 bg-black"></div>
    </>
  );
}
