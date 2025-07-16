const mongoose = require('mongoose');

// Split Schema (for each friend involved in the split)
const splitSchema = new mongoose.Schema({
  friendId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // reference to User model
  owing: { type: Boolean, required: true }, // whether they owe money
  paying: { type: Boolean, required: true }, // whether they are paying money
  oweAmount: { type: Number, default: 0 }, // the amount owed by this friend
  owePercent: { type: Number, default: 0 }, // the percentage of the total amount
  payAmount: { type: Number, default: 0 }, // the amount this friend is paying
});

// Main Expense Schema
const expenseSchema = new mongoose.Schema(
  {
    description: { type: String, required: true }, // Description of the expense
    amount: { type: Number, required: true }, // Total amount of the expense
    splitMode: { type: String, enum: ['equal', 'value', 'percent'], required: true }, // Mode of splitting
    splits: [splitSchema], // Array of splits (details for each friend)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // User who created the expense
    date: { type: Date, default: Date.now }, // Timestamp of when the expense was created
  },
  { timestamps: true }
);

module.exports = mongoose.model('Expense', expenseSchema);
