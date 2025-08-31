const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: {
        type: String,
        unique: true,      // must be unique if provided
        sparse: true,      // allows multiple docs without phone at all
        trim: true,
    },
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
    preferredCurrencyUsage: {
        type: Map,
        of: Number,
        default: {},
    },
    pushTokens: {
      ios: { type: [String], default: [] },
      android: { type: [String], default: [] },
    },

}, { timestamps: true });
userSchema.index({ phone: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('User', userSchema);
