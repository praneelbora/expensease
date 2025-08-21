const mongoose = require('mongoose');

// Split Schema (for each friend involved in the split)
const splitSchema = new mongoose.Schema({
    payerType: { type: String, enum: ['user', 'group'], default: 'user' },
    friendId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null if payerType = 'group'
    owing: { type: Boolean, required: true },
    paying: { type: Boolean, required: true },
    oweAmount: { type: Number, default: 0 },
    owePercent: { type: Number, default: 0 },
    payAmount: { type: Number, default: 0 },
    paidFromPaymentMethodId: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentMethod" },
});


// Main Expense Schema
const expenseSchema = new mongoose.Schema(
    {
        description: { type: String, required: true }, // Description of the expense
        amount: { type: Number, required: true }, // Total amount of the expense
        // Expense schema (add)
        currency: {
            type: String,
            uppercase: true,
            trim: true,
            match: /^[A-Z]{3}$/,
            default: 'INR'
        },

        mode: { type: String, enum: ['split', 'personal'], required: true, default: 'personal' }, // Description of the expense
        splitMode: { type: String, enum: ['equal', 'value', 'percent'], required: function () { return this.mode === 'split'; }, default: 'equal' }, // Mode of splitting
        splits: [splitSchema], // Array of splits (details for each friend)
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // User who created the expense
        groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' }, // User who created the expense
        date: { type: Date, default: Date.now }, // Timestamp of when the expense was created,
        typeOf: { type: String, enum: ['expense', 'settle', 'income', 'loan'], default: 'expense' },
        category: { type: String }, // New field to store expense category
        paidFromPaymentMethodId: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentMethod" },
        receivedToPaymentMethodId: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentMethod" },  // friend's "get paid to"
    },
    { timestamps: true }
);

// Add this before model export
const auditEntrySchema = new mongoose.Schema({
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
    before: { type: Object, required: true }, // snapshot (lean)
    after: { type: Object, required: true }, // snapshot (lean)
    note: { type: String }                  // optional free-text
}, { _id: false });

expenseSchema.add({
    auditLog: [auditEntrySchema],               // <— history of edits
});

module.exports = mongoose.model('Expense', expenseSchema);
