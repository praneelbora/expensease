const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    customCategories: [
        {
            name: String,
            emoji: String,
        }
    ],
    picture: { type: String },
    googleId: { type: String },
    upiId: { type: String },
    defaultCurrency: {
        type: String,
        trim: true,
        uppercase: true,
        match: /^[A-Z]{3}$/, // ISO code
        default: 'INR',
    },
    preferredCurrencies: {
        type: [String],
        default: ['INR'],
        set: (arr) => [...new Set((arr || []).map(c => String(c).toUpperCase()))],
        validate: {
            validator: (arr) => (arr || []).every(c => /^[A-Z]{3}$/.test(c)),
            message: 'preferredCurrencies must be ISO 4217 codes (e.g., INR, USD).'
        }
    },

    // 🔽 NEW: usage counts per currency code
    preferredCurrencyUsage: {
        type: Map,
        of: Number,
        default: {},
    },

}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);