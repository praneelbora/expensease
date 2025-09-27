// models/ContactUpload.js
const mongoose = require('mongoose');

const ContactUploadSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // uploader
    contactHash: { type: String, required: true },   // hex string (sha256 or your chosen)
    type: { type: String, enum: ['phone', 'email'], required: true },
    // matchedUserIds: one contact hash may match multiple user accounts (rare but possible)
    matchedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    matchTimestamp: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Compound unique to prevent duplicate rows for the same owner+contactHash
ContactUploadSchema.index({ userId: 1, contactHash: 1 }, { unique: true });
// Global index to speed up matching queries
ContactUploadSchema.index({ contactHash: 1 });
// Help fast deletes / listing per owner
ContactUploadSchema.index({ userId: 1, createdAt: 1 });

module.exports = mongoose.model('ContactUpload', ContactUploadSchema);
