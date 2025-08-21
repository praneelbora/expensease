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
const mongoose = require("mongoose");
const PaymentMethod = require("../../models/PaymentMethod"); // Adjust path as needed

async function logBalance(pmId, currency, label) {
    const pm = await PaymentMethod.findById(pmId).lean();
    if (!pm) {
        console.log(`[${label}] PaymentMethod ${pmId} not found`);
        return;
    }
    const balances = pm.balances || {};
    const currBalance = balances[currency] || null;
    console.log(`[${label}] PaymentMethod ${pmId} balances:`, currBalance);
}

router.post('/', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const {
            lenderId,
            borrowerId,
            lenderPaymentMethod,
            borrowerPaymentMethod,
            principal,
            notes,
            description,
            currency
        } = req.body;

        // Validate required fields
        if (!lenderId || !borrowerId || !principal || !lenderPaymentMethod || !borrowerPaymentMethod || !currency) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        console.log('Creating loan with:', {
            lenderId,
            borrowerId,
            lenderPaymentMethod,
            borrowerPaymentMethod,
            principal,
            currency,
        });

        // Debug: log balances BEFORE update
        await logBalance(borrowerPaymentMethod, currency, 'Before Borrower Update');
        await logBalance(lenderPaymentMethod, currency, 'Before Lender Update');

        // Create and save the new loan document within the session
        const newLoan = new Loan({
            lenderId: lenderId === 'me' ? req.user.id : lenderId,
            borrowerId: borrowerId === 'me' ? req.user.id : borrowerId,
            lenderPaymentMethod,
            borrowerPaymentMethod,
            principal,
            notes,
            description,
            currency
        });

        await newLoan.save({ session });

        // Fix any PaymentMethods with null balances field by setting to empty object
        await PaymentMethod.updateMany(
            { balances: null },
            { $set: { balances: {} } }
        );

        // Ensure the currency balance object exists for borrower and lender (do not overwrite existing)
        await PaymentMethod.updateOne(
            { _id: borrowerPaymentMethod, userId: borrowerId === 'me' ? req.user.id : borrowerId },
            { $setOnInsert: { [`balances.${currency}`]: { available: 0, pending: 0 } } },
            { session, upsert: false }
        );

        await PaymentMethod.updateOne(
            { _id: lenderPaymentMethod, userId: lenderId === 'me' ? req.user.id : lenderId },
            { $setOnInsert: { [`balances.${currency}`]: { available: 0, pending: 0 } } },
            { session, upsert: false }
        );

        // Debit borrower's payment method balance
        await PaymentMethod.updateOne(
            { _id: borrowerPaymentMethod, userId: borrowerId === 'me' ? req.user.id : borrowerId },
            { $inc: { [`balances.${currency}.available`]: parseFloat(principal) } },
            { session }
        );

        // Credit lender's payment method balance
        await PaymentMethod.updateOne(
            { _id: lenderPaymentMethod, userId: lenderId === 'me' ? req.user.id : lenderId },
            { $inc: { [`balances.${currency}.available`]: -parseFloat(principal) } },
            { session }
        );

        // Debug: log balances AFTER update
        await logBalance(borrowerPaymentMethod, currency, 'After Borrower Update');
        await logBalance(lenderPaymentMethod, currency, 'After Lender Update');

        // Commit the transaction and end session
        await session.commitTransaction();
        session.endSession();

        res.status(201).json(newLoan);

    } catch (error) {
        await session.abortTransaction();
        session.endSession();

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
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { amount, note, paymentMethodId, recieverMethodId, currency } = req.body;
        console.log(req.body);
        
        if (!amount) return res.status(400).json({ error: 'Repayment amount required.' });
        if (!currency) return res.status(400).json({ error: 'Currency is required for repayment.' });

        const loan = await Loan.findById(req.params.id);
        if (!loan) return res.status(404).json({ error: 'Loan not found.' });

        if (![loan.lenderId.toString(), loan.borrowerId.toString()].includes(req.user.id)) {
            return res.status(403).json({ error: 'Not authorized to update this loan.' });
        }

        // Push the repayment
        loan.repayments.push({
            amount,
            note: note || '',
            paymentMethodId: paymentMethodId || null,
            recieverMethodId: recieverMethodId || null,
            at: new Date(),
        });

        // Update payer's balance: decrement available by repayment amount
        if (paymentMethodId) {
            await PaymentMethod.updateOne(
                { _id: paymentMethodId, userId: req.user.id },
                { $inc: { [`balances.${currency}.available`]: -Math.abs(amount) } },
                { session }
            );
        }

        // Update receiver's balance: increment available by repayment amount
        if (recieverMethodId) {
            // Receiver might be lender or borrower, so find correct userId
            const receiverUserId =
                loan.lenderId.toString() === req.user.id ? loan.borrowerId : loan.lenderId;

            await PaymentMethod.updateOne(
                { _id: recieverMethodId, userId: receiverUserId },
                { $inc: { [`balances.${currency}.available`]: Math.abs(amount) } },
                { session }
            );
        }

        await loan.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.json(loan);

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
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
