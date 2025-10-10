// models/Receipt.js
const mongoose = require("mongoose");

const ReceiptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // File / storage
    storage: { type: String, enum: ["s3"], default: "s3" },
    bucket: { type: String, required: true },
    s3Key: { type: String, required: true },            // e.g. receipts/{userId}/yyyy/mm/dd/{uuid}.jpg
    url: { type: String, default: null },               // optional: permanent or CDN URL
    originalName: { type: String },
    contentType: { type: String },
    size: { type: Number },

    // Optional derived file info
    etag: { type: String, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },

    // OCR / parsing job
    status: { type: String, enum: ["pending", "processing", "done", "failed"], default: "pending" },
    model: { type: String, default: null },
    rawText: { type: String, default: "" },             // your OCR text blob
    parsed: { type: mongoose.Schema.Types.Mixed, default: null }, // normalized object from AI
    error: { type: String, default: null },

    // Link-outs you might populate later
    expenseId: { type: mongoose.Schema.Types.ObjectId, ref: "Expense", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Receipt", ReceiptSchema);
