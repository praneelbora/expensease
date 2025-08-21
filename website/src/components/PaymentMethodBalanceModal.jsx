import React, { useEffect, useMemo, useState } from "react";
import ModalWrapper from "./ModalWrapper";
import CurrencyModal from "./CurrencyModal";
import { getSymbol } from "../utils/currencies";
import CustomSelect from "./CustomSelect";

export default function PaymentMethodBalanceModal({
  show,
  onClose,
  method,                    // payment account object
  defaultCurrency,           // from AuthContext
  preferredCurrencies = [],  // from AuthContext (optional)
  currencyOptions = [],      // [{value:'INR', label:'INR (₹)'}]
  onSubmit,                  // ({ action, currency, amountMajor, bucket }) => Promise<void>
}) {
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [currency, setCurrency] = useState(() =>
    (method?.defaultCurrency || defaultCurrency || "INR").toUpperCase()
  );
  const [amountMajor, setAmountMajor] = useState("");
  const [action, setAction] = useState("credit"); // credit | debit | hold | release
  const [bucket, setBucket] = useState("available"); // only used for credit/debit
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    setAction("credit")
    setAmountMajor("")
    setCurrency(() =>
      (method?.defaultCurrency || defaultCurrency || "INR").toUpperCase()
    )
  }, [show])
  const usableOptions = useMemo(() => {
    const codes = new Set(
      [
        method?.defaultCurrency,
        ...(method?.supportedCurrencies || []),
        ...Object.keys(method?.balances || {}),
        defaultCurrency,
        ...currencyOptions.map(o => o.value),
      ].filter(Boolean).map(c => String(c).toUpperCase())
    );
    return Array.from(codes).sort().map(code => ({
      value: code,
      label: `${code}${getSymbol(code) ? ` (${getSymbol(code)})` : ""}`,
    }));
  }, [method, defaultCurrency, currencyOptions]);

  const canPickBucket = action === "credit" || action === "debit";

  const submit = async () => {
    const amt = Number(amountMajor);
    if (!currency) return alert("Choose a currency");
    if (!amt || isNaN(amt) || amt <= 0) return alert("Enter a valid amount");
    try {
      setSubmitting(true);
      await onSubmit({ action, currency, amountMajor: amt, bucket });
      onClose?.();
    } finally {
      setSubmitting(false);
    }
  };

  if (!show || !method) return null;

  return (
    <>
      <ModalWrapper
        show={show}
        onClose={onClose}
        title={`Credit or Debit — ${method?.label ?? ""}`}
        footer={<button
          onClick={submit}
          disabled={submitting}
          className="px-3 py-1.5 rounded-md border border-[#121212] bg-teal-500 text-[#121212]"
        >
          {submitting ? "Updating…" : "Update Balance"}
        </button>}
      >
        <div className="space-y-4">
          {/* currency */}
          <div className="flex flex-col">
            <div className="text-sm text-[#b6b6b6]">Currency</div>
            <button
              type="button"
              onClick={() => setShowCurrencyPicker(true)}
              className="w-full text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base h-[45px] pl-3 flex-1 text-left"
            >
              {currency}
            </button>
          </div>

          {/* action */}
          <div className="flex flex-col">
            <div className="text-sm text-[#b6b6b6]">Credit / Debit</div>
            <CustomSelect
              value={action}
              onChange={(v) => setAction(v)}
              options={[
                { value: "credit", label: "Credit (Add Money)(↑)" },
                { value: "debit", label: "Debit (Remove Money)(↓)" },

              ]}
              placeholder="Credit or Debit"
            />
            {/* <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base h-[45px] pl-3 flex-1 text-left"
            >
              <option value="credit">Credit (↑)</option>
              <option value="debit">Debit (↓)</option>
            </select> */}
          </div>

          {/* amount */}
          <div className="flex flex-col">
            <div className="text-sm text-[#b6b6b6]">
              Amount ({getSymbol(currency) || currency})
            </div>
            <input
              inputMode="decimal"
              placeholder="0.00"
              className="w-full text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base h-[45px] pl-3 flex-1 text-left"
              value={amountMajor}
              onChange={(e) => setAmountMajor(e.target.value)}
            />
          </div>

          {/* submit */}

        </div>
      </ModalWrapper>

      {/* currency picker bottom sheet */}
      <CurrencyModal
        show={showCurrencyPicker}
        onClose={() => setShowCurrencyPicker(false)}
        options={usableOptions}
        value={currency}
        onSelect={(v) => setCurrency(v)}
        defaultCurrency={method?.defaultCurrency || defaultCurrency}
        preferredCurrencies={preferredCurrencies}
      />
    </>
  );
}
