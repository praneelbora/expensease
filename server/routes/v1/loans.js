// routes/api/loans.js
const express = require('express');
const router = express.Router();
const Loan = require('../../models/Loan');
const User = require('../../models/User');
const Group = require('../../models/Group');
const auth = require('../../middleware/auth');

/**
 * @route POST /api/loans
 * @desc Create a new loan (user-to-user OR group-to-user)
 */
router.post('/', auth, async (req, res) => {
    try {
        const { lenderId, borrowerId, principal, note } = req.body;

        if (!lenderId || !borrowerId || !principal) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        const newLoan = new Loan({
            lenderId: lenderId === 'me' ? req.user.id : lenderId,
            borrowerId: borrowerId === 'me' ? req.user.id : borrowerId,
            principal,
            note
        });

        await newLoan.save();
        res.status(201).json(newLoan);
    } catch (error) {
        console.error('Error creating loan:', error);
        res.status(500).json({ error: 'Server error creating loan.' });
    }
});

/**
 * @route GET /api/loans
 * @desc Get all loans for logged-in user (as lender or borrower)
 */
router.get('/', auth, async (req, res) => {
    try {
        const userId = req.user.id;

        const loans = await Loan.find({
            $or: [{ lenderId: userId }, { borrowerId: userId }]
        })
            .populate('lenderId', 'name email')
            .populate('borrowerId', 'name email')
            .sort({ createdAt: -1 });

        res.json(loans);
    } catch (error) {
        console.error('Error fetching loans:', error);
        res.status(500).json({ error: 'Server error fetching loans.' });
    }
});

/**
 * @route POST /api/loans/:id/repay
 * @desc Add a repayment to a loan
 */
router.post('/:id/repay', auth, async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount) return res.status(400).json({ error: 'Repayment amount required.' });

        const loan = await Loan.findById(req.params.id);
        if (!loan) return res.status(404).json({ error: 'Loan not found.' });

        // Only lender or borrower can add repayments
        if (![loan.lenderId.toString(), loan.borrowerId.toString()].includes(req.user.id)) {
            return res.status(403).json({ error: 'Not authorized to update this loan.' });
        }

        loan.repayments.push({ amount });
        await loan.save();

        res.json(loan);
    } catch (error) {
        console.error('Error adding repayment:', error);
        res.status(500).json({ error: 'Server error adding repayment.' });
    }
});

/**
 * @route PATCH /api/loans/:id/close
 * @desc Mark a loan as closed
 */
router.patch('/:id/close', auth, async (req, res) => {
    try {
        const loan = await Loan.findById(req.params.id);
        if (!loan) return res.status(404).json({ error: 'Loan not found.' });

        // Only lender can close the loan
        if (loan.lenderId.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Only lender can close this loan.' });
        }

        loan.status = 'closed';
        await loan.save();
        res.json({ message: 'Loan closed successfully', loan });
    } catch (error) {
        console.error('Error closing loan:', error);
        res.status(500).json({ error: 'Server error closing loan.' });
    }
});

/**
 * @route DELETE /api/loans/:id
 * @desc Delete a loan (only lender can delete)
 */
router.delete('/:id', auth, async (req, res) => {
    try {
        const loan = await Loan.findById(req.params.id);
        if (!loan) return res.status(404).json({ error: 'Loan not found.' });

        if (loan.lenderId.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Only lender can delete this loan.' });
        }

        await Loan.findByIdAndDelete(req.params.id);
        res.json({ message: 'Loan deleted successfully.' });
    } catch (error) {
        console.error('Error deleting loan:', error);
        res.status(500).json({ error: 'Server error deleting loan.' });
    }
});

module.exports = router;
