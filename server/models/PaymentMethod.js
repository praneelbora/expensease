// models/PaymentMethod.js
const mongoose = require("mongoose");

const BalanceSchema = new mongoose.Schema({
    // store IN MINOR UNITS (integers) to avoid float errors
    available: { type: Number, default: 0 }, // spendable
    pending: { type: Number, default: 0 }, // on hold/mandate etc.
}, { _id: false });

const PaymentMethodSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },

    // ux & routing
    label: { type: String, required: true },             // "Primary UPI", "HDFC Bank", "Cash"
    type: { type: String, enum: ["upi", "bank", "card", "cash", "wallet", "other"], required: true },
    defaultCurrency: { type: String },       // primary display currency
    supportedCurrencies: { type: [String], default: [] },    // [] = any; else whitelist
    balances: {
        type: Map,
        of: BalanceSchema,
        default: {}
    },

    // capabilities (drive UI + validation)
    capabilities: { type: [String], default: ["send", "receive"] }, // "autopay" if UPI mandate etc.
    isDefaultSend: { type: Boolean, default: false },
    isDefaultReceive: { type: Boolean, default: false },

    // provider/tokenization (never store raw card data!)
    provider: { type: String, enum: ["manual", "stripe", "razorpay", "payu"], default: "manual" },
    providerRef: { type: String }, // e.g., saved instrument ID / customer token

    // identifiers (masked)
    upi: { handle: { type: String } },                     // e.g., "name@okhdfcbank"
    bank: { ifsc: String, accountLast4: String, nameOnAccount: String },
    card: { brand: String, last4: String, expMonth: Number, expYear: Number }, // tokenized only

    // state
    status: { type: String, enum: ["unverified", "pending", "verified"], default: "unverified" },
    iconKey: { type: String, default: 'string' },
    notes: { type: String },
    visibleForOthers: { type: Boolean, default: true },
    // meta
    usageCount: { type: Number, default: 0 },
}, { timestamps: true });

PaymentMethodSchema.index({ userId: 1, type: 1 });

module.exports = mongoose.model("PaymentMethod", PaymentMethodSchema);
