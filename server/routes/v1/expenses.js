const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const Group = require('../../models/Group');
const Expense = require('../../models/Expense');

const auth = require("../../middleware/auth");

router.post('/', auth, async (req, res) => {
  try {
    const { description, amount, splitMode, splits, groupId } = req.body;

    const updatedSplits = splits.map(f => ({
      ...f,
      friendId: f.friendId === 'me' ? req.user.id : f.friendId
    }));

    const newExpense = new Expense({
      createdBy: req.user.id,
      description,
      amount,
      splitMode,
      splits: updatedSplits,
      ...(groupId && { groupId })
    });

    await newExpense.save();

    // If groupId is provided, push expense to that group's expenses array
    if (groupId) {
      await Group.findByIdAndUpdate(
        groupId,
        { 
          $push: { expenses: newExpense._id },
          $set: { updatedAt: Date.now() }
        },
        { new: true }
      );
    }

    res.status(201).json(newExpense);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});
router.get('/group/:id', auth, async (req, res) => {
  try {
    const groupId = req.params.id;

    const group = await Group.findById(groupId)
      .populate({
        path: 'expenses',
        populate: [
          { path: 'createdBy' },
          { path: 'splits.friendId' }
        ]
      })
      .populate('members', 'name email');

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.status(200).json({group, id: req.user.id});
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch group expenses' });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const expenses = await Expense.find({
      $or: [
        { createdBy: userId },
        { 'splits.friendId': userId }
      ]
    })
    .sort({ createdAt: -1 })
    .populate('createdBy', 'name email')
    .populate('splits.friendId', 'name email'); // Populate user info in splits

    res.json({expenses,id: req.user.id});
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});
module.exports = router;
