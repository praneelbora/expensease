// routes/v2/paymentMethods.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const auth = require('../../middleware/auth');
const PaymentMethod = require('../../models/PaymentMethod');
const PaymentMethodTxn = require('../../models/PaymentMethodTransaction');

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────

const isISO4217 = (c) => typeof c === 'string' && /^[A-Z]{3}$/.test(c);

const ensureOwnership = async (userId, paymentMethodId) => {
    const doc = await PaymentMethod.findOne({ _id: paymentMethodId, userId });
    if (!doc) throw { status: 404, message: 'PaymentMethod not found' };
    return doc;
};

const ensureCurrencyAllowed = (paymentMethod, currency) => {
    if (!isISO4217(currency)) throw { status: 400, message: 'currency must be a 3-letter ISO code' };
    const wl = paymentMethod.supportedCurrencies || [];
    if (wl.length > 0 && !wl.includes(currency)) {
        throw { status: 400, message: `currency ${currency} not supported by this paymentMethod` };
    }
};

const setUniqueDefault = async (userId, field, paymentMethodId, session = null) => {
    // field ∈ { isDefaultSend, isDefaultReceive }
    await PaymentMethod.updateMany(
        { userId, _id: { $ne: paymentMethodId }, [field]: true },
        { $set: { [field]: false } },
        { session }
    );
};

// Build $set from whitelist
const pickUpdatable = (src, fields) =>
    Object.fromEntries(Object.entries(src || {}).filter(([k]) => fields.includes(k)));

// ───────────────────────────────────────────────────────────────────────────────
// Create paymentMethod
// ───────────────────────────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const {
            label,
            type,
            capabilities = ['send', 'receive'],
            isDefaultSend = false,
            isDefaultReceive = false,
            provider = 'manual',
            providerRef,
            upi,
            bank,
            card,
            status = 'unverified',
            currency,   // "INR" | "USD" | ...
            balance,    // number OR { available, pending },
            iconKey = 'auto',
            notes
        } = req.body || {};

        if (!label) throw { status: 400, message: 'label is required' };
        if (!['upi', 'bank', 'card', 'cash', 'wallet', 'other'].includes(type)) {
            throw { status: 400, message: 'invalid type' };
        }

        // balance normalizer
        const norm = (val) => {
            if (val == null) return { available: 0, pending: 0 };
            if (typeof val === 'number') return { available: Number(val), pending: 0 };
            if (typeof val === 'string') {
                const n = parseFloat(val);
                return { available: Number.isFinite(n) ? n : 0, pending: 0 };
            }
            return {
                available: Number(val.available ?? 0),
                pending: Number(val.pending ?? 0),
            };
        };

        // only set balances if BOTH are present & valid
        const hasCurrency = typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency.trim());
        const hasBalance =
            balance !== undefined &&
            balance !== null &&
            !(typeof balance === 'object' && !Array.isArray(balance) && Object.keys(balance).length === 0);

        const payload = {
            userId: req.user.id,
            label,
            type,
            capabilities,
            isDefaultSend,
            isDefaultReceive,
            provider,
            providerRef,
            upi,
            bank,
            card,
            status,
            iconKey,
            notes
        };

        if (hasCurrency && hasBalance) {
            const code = currency.trim().toUpperCase();
            payload.balances = { [code]: norm(balance) };
        }

        const [doc] = await PaymentMethod.create([payload], { session });

        if (isDefaultSend) await setUniqueDefault(req.user.id, 'isDefaultSend', doc._id, session);
        if (isDefaultReceive) await setUniqueDefault(req.user.id, 'isDefaultReceive', doc._id, session);

        await session.commitTransaction();
        res.status(201).json(doc);
    } catch (err) {
        await session.abortTransaction();
        res.status(err.status || 500).json({ error: err.message || 'Failed to create paymentMethod' });
    } finally {
        session.endSession();
    }
});



// ───────────────────────────────────────────────────────────────────────────────
// List paymentMethods (optionally filter by type/status)
// ───────────────────────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
    try {
        const { type, status } = req.query;
        const q = { userId: req.user.id };
        if (type) q.type = type;
        if (status) q.status = status;
        const paymentMethods = await PaymentMethod.find(q).sort({ createdAt: -1 });
        res.json(paymentMethods);
    } catch (err) {
        res.status(500).json({ error: 'Failed to list paymentMethods' });
    }
});

// ───────────────────────────────────────────────────────────────────────────────
// Get a single paymentMethod
// ───────────────────────────────────────────────────────────────────────────────
router.get('/:paymentMethodId', auth, async (req, res) => {
    try {
        const paymentMethod = await ensureOwnership(req.user.id, req.params.paymentMethodId);
        res.json(paymentMethod);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to fetch paymentMethod' });
    }
});

// ───────────────────────────────────────────────────────────────────────────────
// Update paymentMethod (label, defaults, caps, supportedCurrencies, providerRefs, status)
// ───────────────────────────────────────────────────────────────────────────────
router.patch('/:paymentMethodId', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const paymentMethod = await ensureOwnership(req.user.id, req.params.paymentMethodId);

        const allowed = [
            'label',
            'defaultCurrency',
            'supportedCurrencies',
            'capabilities',
            'isDefaultSend',
            'isDefaultReceive',
            'provider',
            'providerRef',
            'status',
            // nested identifiers
            'upi',
            'bank',
            'card',
            'iconKey',
            'notes'
        ];

        // Basic validations
        if (req.body.defaultCurrency && !isISO4217(req.body.defaultCurrency)) {
            throw { status: 400, message: 'defaultCurrency must be ISO-4217' };
        }
        if (req.body.supportedCurrencies) {
            if (!Array.isArray(req.body.supportedCurrencies)) {
                throw { status: 400, message: 'supportedCurrencies must be an array' };
            }
            for (const c of req.body.supportedCurrencies) {
                if (!isISO4217(c)) throw { status: 400, message: `invalid currency in supportedCurrencies: ${c}` };
            }
        }

        const update = pickUpdatable(req.body, allowed);

        const updated = await PaymentMethod.findOneAndUpdate(
            { _id: paymentMethod._id, userId: req.user.id },
            { $set: update },
            { new: true, session }
        );

        if (update.isDefaultSend === true) {
            await setUniqueDefault(req.user.id, 'isDefaultSend', updated._id, session);
        }
        if (update.isDefaultReceive === true) {
            await setUniqueDefault(req.user.id, 'isDefaultReceive', updated._id, session);
        }

        await session.commitTransaction();
        res.json(updated);
    } catch (err) {
        await session.abortTransaction();
        res.status(err.status || 500).json({ error: err.message || 'Failed to update paymentMethod' });
    } finally {
        session.endSession();
    }
});

// ───────────────────────────────────────────────────────────────────────────────
// Delete paymentMethod
// ───────────────────────────────────────────────────────────────────────────────
router.delete('/:paymentMethodId', auth, async (req, res) => {
    try {
        await ensureOwnership(req.user.id, req.params.paymentMethodId);
        await PaymentMethod.deleteOne({ _id: req.params.paymentMethodId, userId: req.user.id });
        res.json({ success: true });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to delete paymentMethod' });
    }
});

// ───────────────────────────────────────────────────────────────────────────────
// Get balances (raw map)
// ───────────────────────────────────────────────────────────────────────────────
router.get('/:paymentMethodId/balances', auth, async (req, res) => {
    try {
        const paymentMethod = await ensureOwnership(req.user.id, req.params.paymentMethodId);
        res.json(paymentMethod.balances || {});
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to fetch balances' });
    }
});

// ───────────────────────────────────────────────────────────────────────────────
// Credit: +amount to available|pending
// body: { currency, amount, bucket = "available" }
// ───────────────────────────────────────────────────────────────────────────────
router.post('/:paymentMethodId/balances/credit', auth, async (req, res) => {
    try {
        const { currency, amount, bucket = 'available' } = req.body || {};
        const amt = amount;
        if (!['available', 'pending'].includes(bucket)) throw { status: 400, message: 'bucket must be available|pending' };

        const paymentMethod = await ensureOwnership(req.user.id, req.params.paymentMethodId);
        ensureCurrencyAllowed(paymentMethod, currency);

        const incPath = {};
        incPath[`balances.${currency}.${bucket}`] = amt;

        const updated = await PaymentMethod.findOneAndUpdate(
            { _id: paymentMethod._id, userId: req.user.id },
            { $inc: incPath },
            { new: true }
        );

        res.json({ success: true, balances: updated.balances });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Credit failed' });
    }
});

// ───────────────────────────────────────────────────────────────────────────────
// Debit: -amount from available|pending (default: available)
// body: { currency, amount, bucket = "available" }
// ───────────────────────────────────────────────────────────────────────────────
router.post('/:paymentMethodId/balances/debit', auth, async (req, res) => {
    try {
        const { currency, amount, bucket = 'available' } = req.body || {};
        const amt = amount
        if (!['available', 'pending'].includes(bucket)) throw { status: 400, message: 'bucket must be available|pending' };

        const paymentMethod = await ensureOwnership(req.user.id, req.params.paymentMethodId);
        ensureCurrencyAllowed(paymentMethod, currency);

        const filter = { _id: paymentMethod._id, userId: req.user.id };
        filter[`balances.${currency}.${bucket}`] = { $gte: amt };

        const inc = {};
        inc[`balances.${currency}.${bucket}`] = -amt;

        const updated = await PaymentMethod.findOneAndUpdate(filter, { $inc: inc }, { new: true });
        if (!updated) throw { status: 400, message: `insufficient ${bucket} balance in ${currency}` };

        res.json({ success: true, balances: updated.balances });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Debit failed' });
    }
});

// ───────────────────────────────────────────────────────────────────────────────
// Hold: move from available -> pending
// body: { currency, amount }
// ───────────────────────────────────────────────────────────────────────────────
router.post('/:paymentMethodId/balances/hold', auth, async (req, res) => {
    try {
        const { currency, amount } = req.body || {};
        const amt = amount

        const paymentMethod = await ensureOwnership(req.user.id, req.params.paymentMethodId);
        ensureCurrencyAllowed(paymentMethod, currency);

        const filter = { _id: paymentMethod._id, userId: req.user.id };
        filter[`balances.${currency}.available`] = { $gte: amt };

        const update = {
            $inc: {
                [`balances.${currency}.available`]: -amt,
                [`balances.${currency}.pending`]: amt,
            },
        };

        const updated = await PaymentMethod.findOneAndUpdate(filter, update, { new: true });
        if (!updated) throw { status: 400, message: `insufficient available balance in ${currency}` };

        res.json({ success: true, balances: updated.balances });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Hold failed' });
    }
});

// ───────────────────────────────────────────────────────────────────────────────
// Release: move from pending -> available
// body: { currency, amount }
// ───────────────────────────────────────────────────────────────────────────────
router.post('/:paymentMethodId/balances/release', auth, async (req, res) => {
    try {
        const { currency, amount } = req.body || {};
        const amt = amount

        const paymentMethod = await ensureOwnership(req.user.id, req.params.paymentMethodId);
        ensureCurrencyAllowed(paymentMethod, currency);

        const filter = { _id: paymentMethod._id, userId: req.user.id };
        filter[`balances.${currency}.pending`] = { $gte: amt };

        const update = {
            $inc: {
                [`balances.${currency}.pending`]: -amt,
                [`balances.${currency}.available`]: amt,
            },
        };

        const updated = await PaymentMethod.findOneAndUpdate(filter, update, { new: true });
        if (!updated) throw { status: 400, message: `insufficient pending balance in ${currency}` };

        res.json({ success: true, balances: updated.balances });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Release failed' });
    }
});

// ───────────────────────────────────────────────────────────────────────────────
// Transfer between two paymentMethods (same user by default)
// body: { fromPaymentMethodId, toPaymentMethodId, currency, amount, fromBucket="available", toBucket="available" }
// ───────────────────────────────────────────────────────────────────────────────
router.post('/transfer', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const {
            fromPaymentMethodId,
            toPaymentMethodId,
            currency,
            amount,
            fromBucket = 'available',
            toBucket = 'available',
        } = req.body || {};

        if (!fromPaymentMethodId || !toPaymentMethodId) throw { status: 400, message: 'fromPaymentMethodId and toPaymentMethodId are required' };
        if (fromPaymentMethodId === toPaymentMethodId) throw { status: 400, message: 'from and to cannot be the same' };
        if (!['available', 'pending'].includes(fromBucket) || !['available', 'pending'].includes(toBucket)) {
            throw { status: 400, message: 'fromBucket/toBucket must be available|pending' };
        }

        const amt = amount
        if (!isISO4217(currency)) throw { status: 400, message: 'currency must be ISO-4217' };

        const [fromAcc, toAcc] = await Promise.all([
            PaymentMethod.findOne({ _id: fromPaymentMethodId, userId: req.user.id }).session(session),
            PaymentMethod.findOne({ _id: toPaymentMethodId, userId: req.user.id }).session(session),
        ]);
        if (!fromAcc) throw { status: 404, message: 'Source paymentMethod not found' };
        if (!toAcc) throw { status: 404, message: 'Destination paymentMethod not found' };

        ensureCurrencyAllowed(fromAcc, currency);
        ensureCurrencyAllowed(toAcc, currency);

        const fromFilter = {
            _id: fromAcc._id,
            userId: req.user.id,
        };
        fromFilter[`balances.${currency}.${fromBucket}`] = { $gte: amt };

        const toInc = {};
        toInc[`balances.${currency}.${toBucket}`] = amt;

        const fromInc = {};
        fromInc[`balances.${currency}.${fromBucket}`] = -amt;

        const fromUpdateRes = await PaymentMethod.updateOne(fromFilter, { $inc: fromInc }, { session });
        if (fromUpdateRes.modifiedCount !== 1) {
            throw { status: 400, message: `insufficient ${fromBucket} balance in ${currency}` };
        }

        await PaymentMethod.updateOne(
            { _id: toAcc._id, userId: req.user.id },
            { $inc: toInc },
            { session }
        );

        await session.commitTransaction();

        const [fromAfter, toAfter] = await Promise.all([
            PaymentMethod.findById(fromAcc._id),
            PaymentMethod.findById(toAcc._id),
        ]);

        res.json({
            success: true,
            from: { _id: fromAfter._id, balances: fromAfter.balances },
            to: { _id: toAfter._id, balances: toAfter.balances },
        });
    } catch (err) {
        await session.abortTransaction();
        res.status(err.status || 500).json({ error: err.message || 'Transfer failed' });
    } finally {
        session.endSession();
    }
});

// ───────────────────────────────────────────────────────────────────────────────
// Bump usageCount (e.g., after a payment using this paymentMethod)
// body: { by = 1 }
// ───────────────────────────────────────────────────────────────────────────────
router.post('/:paymentMethodId/usage', auth, async (req, res) => {
    try {
        const by = req.body?.by
        const paymentMethod = await ensureOwnership(req.user.id, req.params.paymentMethodId);
        const updated = await PaymentMethod.findOneAndUpdate(
            { _id: paymentMethod._id, userId: req.user.id },
            { $inc: { usageCount: by } },
            { new: true }
        );
        res.json({ success: true, usageCount: updated.usageCount });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to update usage' });
    }
});

// Add under "Helpers" section
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const maskVPA = (v) => {
    if (!v || typeof v !== 'string') return null;
    const parts = v.split('@');
    if (parts.length !== 2) return null;
    const name = parts[0], bank = parts[1];
    const keep = Math.min(2, name.length);
    const masked = name.slice(0, keep) + '*'.repeat(Math.max(name.length - keep, 0));
    return `${masked}@${bank}`;
};

const sanitizePaymentMethodPublic = (acc) => {
    const base = {
        paymentMethodId: acc._id,
        label: acc.label,
        type: acc.type,
        defaultCurrency: acc.defaultCurrency,
        capabilities: Array.isArray(acc.capabilities)
            ? acc.capabilities.filter((c) => c === 'send' || c === 'receive')
            : [],
        status: acc.status,
        isDefaultSend: acc.isDefaultSend,
        isDefaultReceive: acc.isDefaultReceive
        // no balances, no providerRef, no bank/card details
    };

    // Type-specific, masked hints (OPTIONAL & safe to show)
    if (acc.type === 'upi') {
        const vpa =
            acc?.upi?.vpa ??
            acc?.upi?.id ??
            acc?.upi?.address ??
            null;
        base.addressType = 'upi';
        base.hasAddress = !!vpa;
        base.addressHint = vpa ? maskVPA(vpa) : null;
    }

    return base;
};

// ───────────────────────────────────────────────────────────────────────────────
// Public: fetch friend paymentMethods (non-sensitive)
// POST /v2/paymentMethods/public/friends
// body: { friendIds: string[] }  OR  query: ?friendId=...&friendId=...
// Returns: { results: { [friendId]: SanitizedPaymentMethod[] } }
// Only paymentMethods with 'receive' capability are included.
// ───────────────────────────────────────────────────────────────────────────────
router.post('/public/friends', auth, async (req, res) => {
    try {
        let ids = [];
        if (Array.isArray(req.body?.friendIds)) {
            ids = req.body.friendIds;
        } else if (typeof req.body?.friendIds === 'string') {
            ids = req.body.friendIds.split(',');
        } else if (req.query?.friendId) {
            ids = Array.isArray(req.query.friendId) ? req.query.friendId : String(req.query.friendId).split(',');
        }

        ids = [...new Set(ids.map((s) => String(s).trim()).filter(Boolean))]; // unique, trimmed
        ids = ids.map((id) => {
            if (id == 'me') return req.user.id
            else return id
        })
        const validIds = ids.filter(isValidObjectId);
        if (validIds.length === 0) {
            return res.json([]);
        }

        // Only fetch paymentMethods that can RECEIVE (no sensitive projection here; we sanitize below)
        const paymentMethods = await PaymentMethod.find({
            userId: { $in: validIds },
        }).sort({ createdAt: -1 });

        // Group by friendId
        const grouped = Object.fromEntries(validIds.map((id) => [id, []]));
        for (const acc of paymentMethods) {
            const key = String(acc.userId);
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(sanitizePaymentMethodPublic(acc));
        }
        res.json(grouped);
    } catch (err) {
        console.error('public/friends error:', err);
        res.status(500).json({ error: 'Failed to fetch friend paymentMethod details' });
    }
});

// ───────────────────────────────────────────────────────────────────────────────
// List transactions (filterable + cursor pagination)
// GET /v1/payment-methods/txns?paymentMethodId=&currency=&kind=&limit=50&before=ISO
// ───────────────────────────────────────────────────────────────────────────────
router.get('/transactions/get', auth, async (req, res) => {
    try {
        const {
            paymentMethodId,
            currency,           // ISO-4217
            kind,               // debit | credit | hold | release | capture | transfer_in | transfer_out | adjustment | topup | withdrawal
            limit = 50,
            before,             // ISO date (createdAt cursor)
        } = req.query;

        const q = { userId: req.user.id };
        if (paymentMethodId) q.paymentMethodId = paymentMethodId;
        if (currency) q.currency = String(currency).toUpperCase();
        if (kind) q.kind = kind;
        if (before) q.createdAt = { $lt: new Date(before) };

        const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

        const items = await PaymentMethodTxn.find(q)
            .sort({ createdAt: -1, _id: -1 })
            .limit(lim)
            .lean();

        const nextCursor = items.length
            ? new Date(items[items.length - 1].createdAt).toISOString()
            : null;

        res.json({ items, nextCursor });
    } catch (err) {
        console.error('list txns error:', err);
        res.status(500).json({ error: 'Failed to list transactions' });
    }
});

module.exports = router;

