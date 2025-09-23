const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    minimumVersion: { type: String },
    minimumIOSVersion: { type: String },
    minimumAndroidVersion: { type: String },
    newIOSVersion: { type: String },
    newAndroidVersion: { type: String },
    androidVersionReview: { type: String },
    iosVersionReview: { type: String },
    pushTokens: {
      ios: { type: [String], default: [] },
      android: { type: [String], default: [] },
    },
}, { timestamps: true });
module.exports = mongoose.model('Admin', adminSchema, 'admin');
