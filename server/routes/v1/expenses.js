const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const Group = require('../../models/Group');
const Expense = require('../../models/Expense');

const auth = require("../../middleware/auth");
const {
    normaliseSplits,
    normaliseFunding,
    validateFundingAgainstAmount,
} = require('./normalise');

router.post('/', auth, async (req, res) => {
    try {
        const {
            description,
            amount,
            category,
            mode,
            typeOf,
            splitMode,
            splits,
            groupId,
            date,
            funding,   // NEW
        } = req.body;

        if (amount == null || Number.isNaN(Number(amount))) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        if (groupId) {
            const group = await Group.findById(groupId);
            if (!group) return res.status(400).json({ error: 'Invalid groupId' });
        }

        const splitsN = normaliseSplits(req.body.splits, req.user.id) || [];
        const fundingN = normaliseFunding(req.body.funding) || [];

        if (fundingN.length) {
            const v = validateFundingAgainstAmount(fundingN, req.body.amount);
            if (!v.ok) return res.status(400).json({ error: v.message, total: v.total, amount: v.amount });
            for (const f of fundingN) {
                if (f.sourceType === 'group' && !f.groupId)
                    return res.status(400).json({ error: 'groupId required when sourceType is group' });
                if (f.sourceType === 'user' && !f.userId)
                    return res.status(400).json({ error: 'userId required when sourceType is user' });
            }
        }

        const newExpense = new Expense({
            createdBy: req.user.id,
            description,
            amount: Number(amount),
            category,
            mode,
            typeOf,
            splitMode,
            date: date ? new Date(date) : undefined,
            splits: splitsN,
            funding: fundingN,
            ...(groupId && { groupId }),
        });

        await newExpense.save();
        const populated = await Expense.findById(newExpense._id)
            .populate('createdBy', 'name email')
            .populate('splits.friendId', 'name email')
            .populate('funding.userId', 'name email')
            .populate('funding.groupId', 'name')
            .populate('auditLog.updatedBy', 'name email')

        res.status(201).json(populated);
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
            .populate('auditLog.updatedBy', 'name email')
            .sort({ createdAt: -1 })

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
            .populate('splits.friendId', 'name email')
            .populate('auditLog.updatedBy', 'name email');

        res.json({ expenses, id: req.user.id });
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
                }, {
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
        }).populate('splits.friendId', '_id name').populate('auditLog.updatedBy', 'name email')
        return res.status(200).json(expenses);
    } catch (error) {
        console.error("Error fetching friend expenses:", error);
        return res.status(500).json({ error: "Server error fetching expenses" });
    }
});


router.put('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const expense = await Expense.findById(id).populate('auditLog.updatedBy', 'name email');
        if (!expense) return res.status(404).json({ error: 'Expense not found' });

        // Optional permission
        // if (expense.createdBy.toString() !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

        const {
            description,
            amount,
            category,
            mode,       // 'personal' | 'split'
            typeOf,     // 'expense' | 'settle' | 'income' | 'loan'
            splitMode,  // 'equal' | 'value' | 'percent'
            splits,
            funding,    // NEW
            groupId,
            date,
            note,       // optional audit note
        } = req.body;

        if (amount != null && Number.isNaN(Number(amount))) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        if (groupId) {
            const group = await Group.findById(groupId);
            if (!group) return res.status(400).json({ error: 'Invalid groupId' });
        }

        const splitsN = normaliseSplits(req.body.splits, req.user.id);   // may be undefined (not sent)
        const fundingN = normaliseFunding(req.body.funding);              // may be undefined

        const amountNum = req.body.amount != null ? Number(req.body.amount) : expense.amount;
        if (fundingN) {
            const v = validateFundingAgainstAmount(fundingN, amountNum);
            if (!v.ok) return res.status(400).json({ error: v.message, total: v.total, amount: v.amount });
            for (const f of fundingN) {
                if (f.sourceType === 'group' && !f.groupId)
                    return res.status(400).json({ error: 'groupId required when sourceType is group' });
                if (f.sourceType === 'user' && !f.userId)
                    return res.status(400).json({ error: 'userId required when sourceType is user' });
            }
        }

        // Settlement rule (exactly 1 payer & 1 receiver)
        if (typeOf === 'settle' && splitsN) {
            const payers = splitsN.filter(s => s.paying && (s.payAmount || 0) > 0);
            const receivers = splitsN.filter(s => s.owing && (s.oweAmount || 0) > 0);
            if (payers.length !== 1 || receivers.length !== 1) {
                return res.status(400).json({ error: 'Settlement must have exactly one payer and one receiver' });
            }
        }

        // --- Audit BEFORE snapshot (lean, depopulated) ---
        const before = expense.toObject({ depopulate: true });

        // Apply provided fields
        if (description != null) expense.description = description;
        if (amount != null) expense.amount = Number(amount);
        if (category != null) expense.category = category;
        if (mode != null) expense.mode = mode;
        if (typeOf != null) expense.typeOf = typeOf;
        if (splitMode != null) expense.splitMode = splitMode;
        if (splitsN) expense.splits = splitsN;
        if (fundingN) expense.funding = fundingN;
        if (groupId != null) expense.groupId = groupId || undefined;
        if (date != null) expense.date = new Date(date);

        // --- Audit AFTER snapshot (reflects in-memory changes) ---
        const after = expense.toObject({ depopulate: true });

        // Push audit entry then save ONCE (atomic per doc)
        expense.auditLog = (expense.auditLog || []).slice(-99); // keep last 99
        expense.auditLog.push({
            updatedBy: req.user.id,
            before,
            after,
            note: typeof note === 'string' ? note : undefined,
        });

        await expense.save();

        const updated = await Expense.findById(expense._id)
            .populate('createdBy', 'name email')
            .populate('splits.friendId', 'name email')
            .populate('funding.userId', 'name email')
            .populate('funding.groupId', 'name')
            .populate('auditLog.updatedBy', 'name email')

        res.json(updated);
    } catch (err) {
        console.error('Update expense failed:', err);
        res.status(500).json({ error: 'Failed to update expense' });
    }
});


module.exports = router;

