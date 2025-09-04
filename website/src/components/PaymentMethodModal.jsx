// components/PaymentMethodModal.jsx
import { useEffect, useMemo, useState } from "react";
import ModalWrapper from "./ModalWrapper";
import CustomSelect from "./CustomSelect";
import { getAllCurrencyCodes, toCurrencyOptions, getSymbol } from "../utils/currencies";
import CurrencyModal from "./CurrencyModal";
import { PM_ICON_CHOICES } from './pmIcons';

const TYPE_OPTIONS = [
    { value: "upi", label: "UPI" },
    { value: "bank", label: "Bank" },
    { value: "card", label: "Card" },
    { value: "cash", label: "Cash" },
    { value: "wallet", label: "Wallet" },
    { value: "other", label: "Other" },
];

const DEFAULT_FORM = {
    label: "",
    type: "upi",
    capabilities: ["send", "receive"], // default; some types adjust below
    provider: "manual",
    balance: "",
    upi: { handle: "" },
    bank: { ifsc: "", accountLast4: "", nameOnAccount: "" },
    card: { brand: "", last4: "", expMonth: "", expYear: "" },
    iconKey: 'auto',
    // visibleForOthers: true
    // optional flags (only if your backend accepts them on create/update)
    // isDefaultSend: false,
    // isDefaultReceive: false,
};

function currencyDigits(code, locale = "en-IN") {
    try {
        const fmt = new Intl.NumberFormat(locale, { style: "currency", currency: code });
        return fmt.resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
        return 2;
    }
}

export default function PaymentMethodModal({
    show,
    onClose,
    onSave,
    editing,
    defaultCurrency,
    preferredCurrencies,
    onDelete,
    index
}) {

    const isEdit = !!editing;

    const [form, setForm] = useState(DEFAULT_FORM);
    const [saving, setSaving] = useState(false);
    const [currency, setCurrency] = useState("");
    const [showCurrencyModal, setShowCurrencyModal] = useState(false);
    const [error, setError] = useState("");

    // currency options for CustomSelect
    const currencyOptions = useMemo(() => {
        const codes = getAllCurrencyCodes();
        return toCurrencyOptions(codes, "en-IN"); // gives { value,label,symbol,name,trigger }
    }, []);

    // when opened/reset
    useEffect(() => {
        if (!show) return;
        setError("");
        // hydrate form for editing, else defaults
        if (isEdit) {
            setForm({
                ...DEFAULT_FORM,
                ...editing,
                upi: { ...DEFAULT_FORM.upi, ...(editing?.upi || {}) },
                bank: { ...DEFAULT_FORM.bank, ...(editing?.bank || {}) },
                card: { ...DEFAULT_FORM.card, ...(editing?.card || {}) },
                capabilities: editing?.capabilities?.length ? editing.capabilities : DEFAULT_FORM.capabilities,
                iconKey: isEdit ? (editing.iconKey || 'auto') : 'auto',
                notes: editing?.notes || ''
            });
        } else {
            setForm(DEFAULT_FORM);
        }
    }, [show, isEdit, editing]);


    const sym = getSymbol(form.currency || "INR");

    const onChange = (path, val) => {
        setForm(prev => {
            const next = { ...prev };
            const segs = path.split(".");
            let ref = next;
            for (let i = 0; i < segs.length - 1; i++) {
                ref[segs[i]] = { ...(ref[segs[i]] || {}) };
                ref = ref[segs[i]];
            }
            ref[segs[segs.length - 1]] = val;
            return next;
        });
    };

    const validate = () => {
        if (!form.label.trim()) return "Label is required";
        if (!form.type) return "Type is required";
        if (form?.balance?.length > 0 && currency.length == 0) return "Currency is required.";

        return "";
    };

    const buildPayload = () => {
        const payload = {
            label: form.label.trim(),
            type: form.type,
            balance: form.balance,
            capabilities: form.capabilities || [],
            provider: form.provider || "manual",
            currency: currency,
            iconKey: form.iconKey || 'auto',
            notes: form.notes
        };
        payload.isDefaultSend = !!form.isDefaultSend;
        payload.isDefaultReceive = !!form.isDefaultReceive;
        payload.visibleForOthers = form.visibleForOthers !== false; // default true
        return payload;
    };

    const submit = async () => {
        const err = validate();
        if (err) {
            setError(err);
            return;
        }
        setSaving(true);
        try {
            const payload = buildPayload();
            await onSave(payload, editing?._id || null);
            onClose?.();
        } catch (e) {
            setError(e?.message || "Failed to save Payment Account");
        } finally {
            setSaving(false);
        }
    };

    const currencyTrigger = (selected) => {
        if (!selected) return null;
        const d = currencyDigits(selected.value);
        return (
            <div className="flex items-center gap-2">
                <span className="opacity-90">{selected.symbol}</span>
                <span className="text-sm opacity-75">{selected.value}</span>
            </div>
        );
    };

    return (
        <ModalWrapper
            show={show}
            onClose={onClose}
            title={isEdit ? "Edit Payment Account" : "Add Payment Account"}
            footer={<div className="w-full flex items-center justify-end gap-2 pt-2">
                {editing && typeof index == 'number' && index != 0 && <div className="flex flex-1 justify-start">
                    <button
                        type="button"
                        onClick={() => {
                            onDelete?.(editing?._id)
                        }}
                        className="px-3 py-1.5 rounded-md border border-red-500 text-red-500"
                    >
                        Delete
                    </button>
                </div>}
                <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1.5 rounded-md border border-[#2a2a2a] hover:bg-[#222]"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={submit}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-md bg-teal-600 text-black font-semibold disabled:opacity-60"
                >
                    {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Payment Account"}
                </button>
            </div>}>
            <div className="flex flex-col gap-y-2 overflow-y-scroll no-scollbar">
                {error && (
                    <div className="text-sm text-red-400 bg-red-900/20 border border-red-700 rounded px-3 py-2">
                        {error}
                    </div>
                )}

                <div className="flex flex-row gap-3">
                    <div className="flex flex-col flex-3/4">
                        <div className="flex flex-row justify-between">

                            <label className="text-xs text-[#9aa19a]">Label</label>
                            <span className="text-xs text-[#9aa19a]">{form.label.length}/15</span>
                        </div>
                        <input
                            value={form.label}
                            onChange={(e) => onChange("label", e.target.value)}
                            placeholder="UPI / HDFC Bank / Cash"
                            className="w-full text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base h-[45px] pl-3 flex-1 text-left"
                            maxLength={15}
                        />

                    </div>
                    <div className="flex flex-col flex-1/4">
                        <label className="text-xs text-[#9aa19a]">Type</label>
                        <CustomSelect
                            value={form.type}
                            onChange={(v) => onChange("type", v)}
                            options={TYPE_OPTIONS}
                            placeholder="Select type…"
                        />
                    </div>



                </div>
                <div className="flex flex-row justify-between text-xs text-[#888] mt-1">
                    <span><b>Label</b> and <b>Type</b> will be visible to friends while splitting</span>

                </div>
                {!editing && <div className="flex flex-row gap-3">
                    <div className="flex-1">
                        <label className="text-xs text-[#9aa19a]">Balance</label>
                        <input
                            value={form.balance}
                            onChange={(e) => onChange("balance", e.target.value)}
                            placeholder="Current Balance"
                            className="w-full text-[#EBF1D5] text-[18px] border-b-2 border-[#55554f] p-2 text-base h-[45px] pl-3 flex-1 text-left"
                        />
                    </div>
                    {parseFloat(form.balance) > 0 && <div className="flex-1">
                        <label className="block text-sm text-[#9aa08e] mb-1">Currency</label>
                        <button
                            onClick={() => setShowCurrencyModal(true)}
                            className={`w-full ${currency ? 'text-[#EBF1D5]' : 'text-[rgba(130,130,130,1)]'} text-[18px] border-b-2 border-[#55554f] 
                                           p-2 text-base h-[45px] pl-3 flex-1 text-left`}
                        >
                            {currency || "Currency"}
                        </button>
                        <CurrencyModal
                            show={showCurrencyModal}
                            onClose={() => setShowCurrencyModal(false)}
                            value={currency}
                            options={currencyOptions}
                            onSelect={setCurrency}
                            defaultCurrency={defaultCurrency}
                            preferredCurrencies={preferredCurrencies}
                        />
                    </div>}
                </div>}
                <div>
                    <label className="text-xs text-[#9aa19a]">Icon</label>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-2">
                        {PM_ICON_CHOICES.map(({ key, label, Icon }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => onChange('iconKey', key)}
                                className={`flex flex-col items-center gap-1 p-2 rounded-lg border ${form.iconKey === key ? 'border-teal-500 bg-teal-500/10' : 'border-[#2a2a2a] hover:border-[#3a3a3a]'}`}
                                aria-pressed={form.iconKey === key}
                            >
                                <Icon size={20} />
                                <span className="text-[10px] opacity-80">{label}</span>
                            </button>
                        ))}
                    </div>
                    <p className="text-[11px] text-[#888] mt-1">
                        Tip: choose <b>Auto</b> to use a default based on the method type.
                    </p>
                </div>
                <textarea
                    className="w-full text-[#EBF1D5] text-[16px] border border-[#55554f] rounded-md p-3 min-h-[90px]"
                    placeholder="Notes (optional)"
                    value={form.notes}
                    onChange={(e) => onChange('notes', e.target.value)}
                />
                {/* Optional defaults (uncomment if supported by backend) */}
                {/* Defaults */}
                <div className="flex flex-col gap-3 mt-1">
                    <label className="flex items-center gap-3 text-sm">
                        
                        <input
                            type="checkbox"

                            checked={!!form.isDefaultSend}
                            onChange={(e) => {
                                const checked = e.target.checked;
                                onChange("isDefaultSend", checked);
                                if (checked) onChange("visibleForOthers", true); // any default => visible
                            }}
                            disabled={form.visibleForOthers === false}
                            title="Use this as default when you pay"
                        />
                        <span>Default for Expenses</span>
                    </label>

                    <label className="flex items-center gap-3 text-sm">
                        
                        <input
                            type="checkbox"

                            checked={!!form.isDefaultReceive}
                            onChange={(e) => {
                                const checked = e.target.checked;
                                onChange("isDefaultReceive", checked);
                                if (checked) onChange("visibleForOthers", true); // any default => visible
                            }}
                            disabled={form.visibleForOthers === false}
                            title="Use this as default when you receive"
                        />
                        <span>Default for Receiving Money</span>
                    </label>

                    {form.visibleForOthers === false && (
                        <span className="text-[11px] text-[#9aa19a] -mt-1">
                            Hidden methods can’t be set as defaults.
                        </span>
                    )}
                </div>

                {/* Visibility */}
                <div className="mt-1 rounded-lg border border-[#2a2a2a] p-3">
                    <div className="flex items-start justify-between">
                        <div className="flex flex-col">
                            <div className="flex flex-row gap-3 items-center mb-1">
                                
                                <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={!!form.visibleForOthers}
                            onChange={(e) => {
                                const checked = e.target.checked;
                                onChange("visibleForOthers", checked);
                                if (!checked) {
                                    // hiding clears both defaults
                                    onChange("isDefaultSend", false);
                                    onChange("isDefaultReceive", false);
                                }
                            }}
                            title="Show this method to friends while splitting/settling"
                        />
                        <span className="text-sm">Visible to others</span>
                                </div>
                            <span className="text-[11px] text-[#888]">
                                When off, friends won’t see this method in splits. You can still use it yourself.
                            </span>
                            {form.visibleForOthers && (
                                <span className="mt-1 text-[11px] text-[#9aa19a]">
                                    Tip: Friends can only see the <b>label</b> and <b>type</b>.
                                </span>
                            )}
                        </div>

                        
                    </div>
                </div>



                {/* Actions */}

            </div>
        </ModalWrapper>
    );
}
