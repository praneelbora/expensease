// models/PaymentMethodTxn.js
const mongoose = require("mongoose");

// A single-side journal entry in MINOR UNITS
const PaymentMethodTxnSchema = new mongoose.Schema({
    paymentMethodId: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentMethod", index: true, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, required: true },

    currency: { type: String, required: true },        // ISO-4217
    amount: { type: Number, required: true },        // minor units; +credit, -debit
    kind: {
        type: String, enum: [
            "credit", "debit", "hold", "release", "capture",
            "transfer_in", "transfer_out", "adjustment", "topup", "withdrawal"
        ], required: true
    },

    // snapshot after apply (optional but handy for audits)
    balanceAfter: { type: Number, default: 0 },

    // relations
    related: {
        type: new mongoose.Schema({
            type: { type: String }, // "settlement" | "expense" | "loan" | ...
            id: { type: String },
            note: { type: String }
        }, { _id: false }),
        default: undefined
    },

}, { timestamps: true });

PaymentMethodTxnSchema.index({ paymentMethodId: 1, createdAt: -1 });

module.exports = mongoose.model("PaymentMethodTxn", PaymentMethodTxnSchema);
