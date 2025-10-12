// routes/v1/rehashAllUsers.js
// Admin-only route that walks the entire users collection (cursor) and ensures each user's
// phoneHashes/emailHashes contain the server-side hash of their current phone/email.
// - No limit/skip params: this processes *all* users (cursor-based, memory efficient).
// - Writes are applied in batches (internal batchSize) to avoid huge single bulkWrite.
// - Requires req.user.role === 'admin' (adjust to your auth model if needed).
// - Uses CONTACT_HASH_KEY env var as SALT (must match client SALT).
//
// Usage: GET /v1/contacts/rehash-all-users
// Protect this route: run on a maintenance/admin endpoint only.

const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const router = express.Router();
const auth = require('../../middleware/auth');
const User = require('../../models/User');

// try to load libphonenumber-js; if not present we fall back to digits-only normalization
let parsePhoneNumberFromString = null;
try {
    // eslint-disable-next-line global-require
    parsePhoneNumberFromString = require('libphonenumber-js').parsePhoneNumberFromString;
} catch (e) {
    parsePhoneNumberFromString = null;
}

// safe ObjectId helper
const toObjectIdSafe = (v) => {
    if (!v) return null;
    if (mongoose.isValidObjectId(v)) {
        try {
            if (typeof v === 'object' && v._bsontype === 'ObjectID') return v;
            return new mongoose.Types.ObjectId(String(v));
        } catch (e) {
            return null;
        }
    }
    return null;
};

// Normalizers
const normalizeEmail = (email) => {
    if (!email || typeof email !== 'string') return null;
    return email.trim().toLowerCase();
};
const normalizePhone = (raw, defaultCtry = 'IN') => {
    if (!raw || typeof raw !== 'string') return null;
    if (parsePhoneNumberFromString) {
        try {
            const pn = parsePhoneNumberFromString(raw, defaultCtry);
            if (pn && typeof pn.isValid === 'function' ? pn.isValid() : true) {
                if (pn && pn.number) return pn.number; // E.164
            }
        } catch (e) {
            // fallback
        }
    }
    const digits = String(raw).replace(/\D+/g, '');
    if (digits.length >= 8) return `+${digits}`;
    return null;
};

// Hash using SALT
const SALT = process.env.CONTACT_HASH_KEY || '';
const hashVal = (val) => {
    if (!val) return null;
    return crypto.createHash('sha256').update(SALT + val).digest('hex');
};

// Internal batch size for bulkWrite (tunable)
const INTERNAL_BATCH_SIZE = parseInt(process.env.REHASH_INTERNAL_BATCH_SIZE || '500', 10);

// GET /v1/contacts/rehash-all-users
router.get('/rehash-all-users', async (req, res) => {
    try {

        if (!SALT) {
            console.warn('rehash-all-users: CONTACT_HASH_KEY not set — hashes may not match client-side.');
        }

        // Optionally accept defaultCountry (fallback for phone parsing)
        const defaultCountry = (req.query.defaultCountry || process.env.DEFAULT_COUNTRY || 'IN').toString();

        // Cursor over all users (only need minimal fields)
        const cursor = User.find({})
            .select('_id phone email phoneHashes emailHashes createdAt')
            .lean()
            .cursor();

        let processed = 0;
        let plannedUpdates = 0;
        let appliedUpdates = 0;
        const samples = []; // small sample of planned changes
        let batchOps = [];

        for await (const u of cursor) {
            processed++;
            const addToSet = {};

            // phone
            if (u.phone) {
                const normPhone = normalizePhone(String(u.phone), defaultCountry);
                if (normPhone) {
                    const phash = hashVal(normPhone);
                    const hasPhoneHashes = Array.isArray(u.phoneHashes) && u.phoneHashes.length > 0;
                    if (!hasPhoneHashes || (hasPhoneHashes && !u.phoneHashes.includes(phash))) {
                        addToSet.phoneHashes = phash;
                        plannedUpdates++;
                        samples.push({
                            userId: String(u._id),
                            field: 'phone',
                            original: String(u.phone).slice(0, 60),
                            normalized: normPhone,
                            hashPreview: phash.slice(0, 16) + '…',
                        });
                    }
                } else {
                    // optional sample showing inability to normalize
                    if (samples.length < 200) samples.push({
                        userId: String(u._id),
                        field: 'phone',
                        original: String(u.phone).slice(0, 60),
                        note: 'could not normalize phone',
                    });
                }
            }

            // email
            if (u.email) {
                const normEmail = normalizeEmail(u.email);
                if (normEmail) {
                    const ehash = hashVal(normEmail);
                    const hasEmailHashes = Array.isArray(u.emailHashes) && u.emailHashes.length > 0;
                    if (!hasEmailHashes || (hasEmailHashes && !u.emailHashes.includes(ehash))) {
                        addToSet.emailHashes = ehash;
                        plannedUpdates++;
                        samples.push({
                            userId: String(u._id),
                            field: 'email',
                            original: String(u.email).slice(0, 120),
                            normalized: normEmail,
                            hashPreview: ehash.slice(0, 16) + '…',
                        });
                    }
                } else {
                    if (samples.length < 200) samples.push({
                        userId: String(u._id),
                        field: 'email',
                        original: String(u.email).slice(0, 120),
                        note: 'could not normalize email',
                    });
                }
            }

            if (Object.keys(addToSet).length) {
                // Build bulk op
                batchOps.push({
                    updateOne: {
                        filter: { _id: toObjectIdSafe(u._id) },
                        update: { $addToSet: addToSet },
                    },
                });
            }

            // When batch full, run it
            if (batchOps.length >= INTERNAL_BATCH_SIZE) {
                const ops = batchOps.splice(0, batchOps.length);
                try {
                    const br = await User.bulkWrite(ops, { ordered: false });
                    const modified = br && (br.modifiedCount ?? br.nModified ?? 0) || 0;
                    appliedUpdates += modified;
                    console.info(`rehash-all-users: applied batch: matched=${br?.matchedCount ?? br?.nMatched} modified=${modified}`);
                } catch (e) {
                    console.error('rehash-all-users: bulkWrite error (continuing)', e);
                }
            }

            // keep samples bounded
            if (samples.length > 1000) samples.length = 1000;
        }

        // final flush
        if (batchOps.length) {
            try {
                const br = await User.bulkWrite(batchOps, { ordered: false });
                const modified = br && (br.modifiedCount ?? br.nModified ?? 0) || 0;
                appliedUpdates += modified;
                console.info(`rehash-all-users: final bulkWrite applied: matched=${br?.matchedCount ?? br?.nMatched} modified=${modified}`);
            } catch (e) {
                console.error('rehash-all-users: final bulkWrite error', e);
            }
        }

        console.info(`rehash-all-users: done processed=${processed} plannedUpdates=${plannedUpdates} appliedUpdates=${appliedUpdates}`);

        return res.json({
            processed,
            plannedUpdates,
            appliedUpdates,
            sampleCount: samples.length,
            samples: samples.slice(0, 200),
            note: 'Route processed all users. Ensure this endpoint is protected and run during maintenance windows if desired.'
        });
    } catch (err) {
        console.error('rehash-all-users: error', err);
        return res.status(500).json({ error: 'Server error', detail: String(err?.message || err) });
    }
});

module.exports = router;
