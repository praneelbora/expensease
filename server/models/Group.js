const mongoose = require('mongoose');

const contributionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, default: 0 }, // positive = given, negative = withdrawn
    date: { type: Date, default: Date.now }
});

const groupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    code: { type: String, unique: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    settings: {
        enforcePrivacy: { type: Boolean, default: false }
    },
    fundBalance: { type: Number, default: 0 }, // total money in group account
    contributions: [contributionSchema], // who gave money and when
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

groupSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Group', groupSchema);
