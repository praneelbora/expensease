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
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);