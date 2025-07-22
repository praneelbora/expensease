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

    res.status(201).json(newExpense);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

router.get('/group/:id', auth, async (req, res) => {
  try {
    const groupId = req.params.id;

    const group = await Group.findById(groupId).populate('members', 'name email');

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const expenses = await Expense.find({ groupId })
      .populate('createdBy', 'name email')
      .populate('splits.friendId', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({ group, expenses, id: req.user.id });
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

router.post('/settle', auth, async (req, res) => {
  try {
    const { fromUserId, toUserId, amount, note, groupId } = req.body;

    if (!fromUserId || !toUserId || !amount) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const settleExpense = new Expense({
      createdBy: fromUserId,
      groupId,
      description: note || `Settled ₹${amount}`,
      amount,
      typeOf: 'settle',
      splitMode: 'value',
      ...(groupId && { groupId }),
      splits: [
        {
          friendId: toUserId,
          owing: true,
          paying: false,
          oweAmount: amount
        },{
          friendId: fromUserId,
          owing: false,
          paying: true,
          payAmount: amount
        }
      ]
    });

    await settleExpense.save();

    res.status(201).json(settleExpense);
  } catch (err) {
    console.error("Settle error:", err);
    res.status(500).json({ error: 'Failed to settle amount' });
  }
});

router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const deleted = await Expense.findByIdAndDelete(id);

        if (!deleted) {
            return res.status(404).json({ message: "Expense not found." });
        }

        return res.status(200).json({ message: "Expense deleted successfully." });
    } catch (error) {
        console.error("Delete error:", error);
        return res.status(500).json({ message: "Server error while deleting expense." });
    }
});

router.post('/settle/friend/:friendId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = req.params.friendId;

    // Step 1: Fetch all expenses involving current user and the friend
    const expenses = await Expense.find({
      $or: [
        { createdBy: userId, 'splits.friendId': friendId },
        { createdBy: friendId, 'splits.friendId': userId }
      ]
    });

    // Step 2: Calculate net balance
    let balance = 0;

    for (const exp of expenses) {
      for (const split of exp.splits) {
        console.log(exp.splits);
        
        if (split.friendId.toString() === userId && split.oweAmount) {
          balance -= split.oweAmount;
        }
        if (split.friendId.toString() === userId && split.payAmount) {
          balance += split.payAmount;
        }
        if (split.friendId.toString() === friendId && split.oweAmount) {
          balance += split.oweAmount;
        }
        if (split.friendId.toString() === friendId && split.payAmount) {
          balance -= split.payAmount;
        }
      }
    }
    console.log(balance);
    
    if (balance === 0) {
      return res.status(400).json({ error: "No dues to settle." });
    }

    const fromUserId = balance > 0 ? friendId : userId;
    const toUserId = balance > 0 ? userId : friendId;
    const settleAmount = Math.abs(balance);

    const settleExpense = new Expense({
      createdBy: fromUserId,
      description: `Settled ₹${settleAmount}`,
      amount: settleAmount,
      typeOf: 'settle',
      splitMode: 'value',
      splits: [
        {
          friendId: toUserId,
          owing: true,
          paying: false,
          oweAmount: settleAmount
        },
        {
          friendId: fromUserId,
          owing: false,
          paying: true,
          payAmount: settleAmount
        }
      ]
    });

    await settleExpense.save();

    return res.status(201).json({ message: "Friend expenses settled", expense: settleExpense });
  } catch (error) {
    console.error("Settle friend expense error:", error);
    return res.status(500).json({ error: "Server error settling friend expenses." });
  }
});


router.get('/friend/:friendId', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = req.params.friendId;

    // ✅ Step 1: Fetch all expenses where both you and the friend are in the splits
    const expenses = await Expense.find({
      'splits.friendId': { $all: [userId, friendId] },
      groupId: { $exists: false }, // ⛔️ Optional: only NON-group expenses
    }).populate('splits.friendId', '_id name'); // Populate friend info if needed
    return res.status(200).json(expenses);
  } catch (error) {
    console.error("Error fetching friend expenses:", error);
    return res.status(500).json({ error: "Server error fetching expenses" });
  }
});


module.exports = router;
