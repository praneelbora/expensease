// routes/v1/contacts.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../../middleware/auth');
const ContactUpload = require('../../models/ContactUpload'); // path adjust if needed
const User = require('../../models/User');

const crypto = require('crypto');
const { parsePhoneNumberFromString } = require('libphonenumber-js');

const MAX_CONTACTS_PER_REQUEST = 100000; // client already caps; server enforces
const MAX_CONTACTS_PER_USER = 50000; // optional global cap per user (adjust if you want)
// Logging control
const LOG_DEBUG = !!process.env.CONTACTS_LOG_DEBUG; // set to '1' or 'true' for verbose logging

// helper to safely build ObjectId (returns value if already ObjectId or null on invalid)
const toObjectIdSafe = (v) => {
    if (!v) return null;
    if (mongoose.isValidObjectId(v)) {
        try {
            if (typeof v === 'object' && v._bsontype === 'ObjectID') return v;
            return new mongoose.Types.ObjectId(String(v));
        } catch (e) {
            if (LOG_DEBUG) console.warn('toObjectIdSafe: invalid id conversion', v, e);
            return null;
        }
    }
    return null;
};

// helper: sanitize & validate incoming contact entries
function sanitizeContactsArray(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const it of raw) {
        if (!it || typeof it !== 'object') continue;
        const contactHash = (it.contactHash || it.hash || it.key || '').toString().trim();
        const type = (it.type || '').toString().trim().toLowerCase();
        if (!contactHash) continue;
        if (!['phone', 'email'].includes(type)) continue;
        out.push({ contactHash, type });
    }
    return out;
}

/**
 * POST /v1/contacts/upload
 * Body: { contacts: [{ contactHash: '<hex>', type: 'phone'|'email' }, ...] }
 * Auth: required
 */
router.post('/upload', auth, async (req, res) => {
    const start = Date.now();
    try {
        const ownerId = req.user && req.user.id;
        if (!ownerId) {
            console.warn('contacts/upload: unauthorized request');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const rawContacts = req.body && req.body.contacts;
        const contacts = sanitizeContactsArray(rawContacts);

        if (!contacts.length) {
            console.info(`contacts/upload: user=${ownerId} - no valid contacts in request`);
            return res.status(400).json({ error: 'No valid contacts in request' });
        }

        // dedupe by contactHash
        const uniq = new Map();
        for (const c of contacts) {
            if (!uniq.has(c.contactHash)) uniq.set(c.contactHash, c);
        }
        const deduped = Array.from(uniq.values());

        if (deduped.length > MAX_CONTACTS_PER_REQUEST) {
            console.warn(`contacts/upload: user=${ownerId} - too many contacts (${deduped.length})`);
            return res.status(413).json({ error: `Too many contacts in a single request. Max ${MAX_CONTACTS_PER_REQUEST}` });
        }

        const ownerObjId = toObjectIdSafe(ownerId);

        // Optional: enforce a global cap per user (count existing + new <= MAX_CONTACTS_PER_USER)
        let existingCount = 0;
        try {
            existingCount = await ContactUpload.countDocuments({ userId: ownerObjId }).catch(() => 0);
        } catch (e) {
            console.warn('contacts/upload: countDocuments failed, proceeding with 0', e);
            existingCount = 0;
        }
        if (existingCount + deduped.length > MAX_CONTACTS_PER_USER) {
            console.warn(`contacts/upload: user=${ownerId} - would exceed max contacts (have=${existingCount} adding=${deduped.length})`);
            return res.status(413).json({ error: 'Contact upload would exceed allowed storage for this account' });
        }

        // 1) bulk upsert into ContactUpload
        const bulkOps = deduped.map((c) => ({
            updateOne: {
                filter: { userId: ownerObjId, contactHash: c.contactHash },
                update: {
                    $set: {
                        type: c.type,
                        updatedAt: new Date(),
                    },
                    $setOnInsert: {
                        createdAt: new Date(),
                        matchedUserId: null,
                        matchTimestamp: null,
                    },
                },
                upsert: true,
            },
        }));

        if (bulkOps.length > 0) {
            if (LOG_DEBUG) console.info(`contacts/upload: user=${ownerId} - bulk upsert ops=${bulkOps.length}`);
            await ContactUpload.bulkWrite(bulkOps);
            if (LOG_DEBUG) console.info(`contacts/upload: user=${ownerId} - bulk upsert completed`);
        }

        // 2) Lookup matches in User collection
        const hashes = deduped.map((d) => d.contactHash);

        if (LOG_DEBUG) console.info(`contacts/upload: user=${ownerId} - searching users for ${hashes.length} hashes`);

        const users = await User.find({
            $or: [{ phoneHashes: { $in: hashes } }, { emailHashes: { $in: hashes } }],
        })
            .select('_id name email phone profilePic phoneHashes emailHashes')
            .lean();

        if (LOG_DEBUG) console.info(`contacts/upload: user=${ownerId} - found ${Array.isArray(users) ? users.length : 0} candidate users`);

        // 3) build mapping: contactHash -> [ { user, matchedBy: ['phone','email'] } ... ]
        const matchesMap = new Map(); // contactHash -> array of matches
        const aggregatedUserMap = new Map();

        if (Array.isArray(users) && users.length) {
            for (const u of users) {
                const phoneHashes = Array.isArray(u.phoneHashes) ? u.phoneHashes : [];
                const emailHashes = Array.isArray(u.emailHashes) ? u.emailHashes : [];

                for (const incomingHash of hashes) {
                    let matchedTypes = [];

                    if (phoneHashes.includes(incomingHash)) matchedTypes.push('phone');
                    if (emailHashes.includes(incomingHash)) matchedTypes.push('email');

                    if (matchedTypes.length === 0) continue;

                    const arr = matchesMap.get(incomingHash) || [];
                    arr.push({
                        _id: u._id,
                        name: u.name || null,
                        email: u.email || null,
                        phone: u.phone || null,
                        avatar: u.profilePic || null,
                        matchedBy: matchedTypes,
                        matchedHashes: [incomingHash],
                    });
                    matchesMap.set(incomingHash, arr);

                    const userKey = String(u._id);
                    if (!aggregatedUserMap.has(userKey)) {
                        aggregatedUserMap.set(userKey, {
                            _id: u._id,
                            name: u.name || null,
                            email: u.email || null,
                            phone: u.phone || null,
                            avatar: u.profilePic || null,
                            matchedBy: new Set(matchedTypes),
                            matchedHashes: new Set([incomingHash]),
                        });
                    } else {
                        const ag = aggregatedUserMap.get(userKey);
                        for (const t of matchedTypes) ag.matchedBy.add(t);
                        ag.matchedHashes.add(incomingHash);
                    }
                }
            }
        }

        // 4) Optionally update ContactUpload.matchedUserId for matched ones (store first match per hash)
        const matchBulk = [];
        for (const [hash, matchedUsers] of matchesMap.entries()) {
            if (!matchedUsers || !matchedUsers.length) continue;
            const firstMatchId = toObjectIdSafe(matchedUsers[0]._id);
            if (!firstMatchId) continue;
            matchBulk.push({
                updateOne: {
                    filter: { userId: ownerObjId, contactHash: hash },
                    update: { $set: { matchedUserId: firstMatchId, matchTimestamp: new Date(), updatedAt: new Date() } },
                },
            });
        }
        if (matchBulk.length) {
            try {
                if (LOG_DEBUG) console.info(`contacts/upload: user=${ownerId} - writing ${matchBulk.length} matchedUserId updates`);
                await ContactUpload.bulkWrite(matchBulk);
                if (LOG_DEBUG) console.info(`contacts/upload: user=${ownerId} - matchedUserId updates written`);
            } catch (e) {
                console.warn('contacts: failed to write matchedUserId updates', e);
            }
        } else {
            if (LOG_DEBUG) console.info(`contacts/upload: user=${ownerId} - no matches to update in ContactUpload`);
        }

        // 5) Prepare response matches array (per incoming contact)
        const matches = deduped.map((d) => {
            const matchedUsers = matchesMap.get(d.contactHash) || [];
            return {
                contactHash: d.contactHash,
                type: d.type,
                matchedUsers, // array; each entry includes matchedBy and matchedHashes
            };
        });

        // 6) Prepare aggregated matchedUsers array (combine multiple incoming hashes that hit same user)
        const aggregatedMatchedUsers = Array.from(aggregatedUserMap.values()).map((ag) => ({
            _id: ag._id,
            name: ag.name,
            email: ag.email,
            phone: ag.phone,
            avatar: ag.avatar,
            matchedBy: Array.from(ag.matchedBy), // ['phone','email']
            matchedHashes: Array.from(ag.matchedHashes), // which incoming hashes matched this user
        }));

        const durationMs = Date.now() - start;
        console.info(`contacts/upload: user=${ownerId} - uploaded ${deduped.length} unique contacts, matchedUsers=${aggregatedMatchedUsers.length}, duration=${durationMs}ms`);

        return res.json({
            uploaded: deduped.length,
            matches: matches.filter((m) => Array.isArray(m.matchedUsers) && m.matchedUsers.length > 0),
            matchedUsers: aggregatedMatchedUsers,
            summary: {
                totalReceived: contacts.length,
                totalUnique: deduped.length,
                matchedCount: aggregatedMatchedUsers.length,
            },
        });
    } catch (err) {
        console.error('contacts/upload error:', err);
        return res.status(500).json({ error: 'Server error', detail: String(err?.message || err) });
    }
});


/**
 * GET /v1/contacts
 * Returns list (paginated) of uploaded contact hashes for the authenticated user.
 * Query: ?limit=50&skip=0
 */
router.get('/', auth, async (req, res) => {
    const start = Date.now();
    try {
        const ownerId = req.user && req.user.id;
        if (!ownerId) {
            console.warn('contacts/list: unauthorized request');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const limit = Math.max(1, Math.min(10000, parseInt(req.query.limit || '100', 10)));
        const skip = Math.max(0, parseInt(req.query.skip || '0', 10));

        if (LOG_DEBUG) console.info(`contacts/list: user=${ownerId} - fetching skip=${skip} limit=${limit}`);

        const docs = await ContactUpload.find({ userId: ownerId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const durationMs = Date.now() - start;
        console.info(`contacts/list: user=${ownerId} - returned ${docs.length} items in ${durationMs}ms`);
        return res.json({ count: docs.length, items: docs });
    } catch (err) {
        console.error('contacts/list error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /v1/contacts
 * Delete all uploaded contacts of the authenticated user (for GDPR / user-initiated deletion)
 */
router.delete('/', auth, async (req, res) => {
    const start = Date.now();
    try {
        const ownerId = req.user && req.user.id;
        if (!ownerId) {
            console.warn('contacts/delete-all: unauthorized request');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const result = await ContactUpload.deleteMany({ userId: ownerId });
        const durationMs = Date.now() - start;
        console.info(`contacts/delete-all: user=${ownerId} - deletedCount=${result?.deletedCount ?? 0} duration=${durationMs}ms`);
        return res.status(204).send();
    } catch (err) {
        console.error('contacts/delete-all error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /v1/contacts/:contactHash
 * Delete a single uploaded contact for the user
 */
router.delete('/:contactHash', auth, async (req, res) => {
    const start = Date.now();
    try {
        const ownerId = req.user && req.user.id;
        if (!ownerId) {
            console.warn('contacts/delete: unauthorized request');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const contactHash = (req.params.contactHash || '').toString().trim();
        if (!contactHash) {
            console.info(`contacts/delete: user=${ownerId} - missing contactHash`);
            return res.status(400).json({ error: 'Missing contactHash' });
        }

        const removed = await ContactUpload.deleteOne({ userId: ownerId, contactHash });
        const durationMs = Date.now() - start;
        if (removed.deletedCount === 0) {
            console.info(`contacts/delete: user=${ownerId} - contactHash=${contactHash} not found (duration=${durationMs}ms)`);
            return res.status(404).json({ error: 'Not found' });
        }
        console.info(`contacts/delete: user=${ownerId} - deleted contactHash=${contactHash} (duration=${durationMs}ms)`);
        return res.status(204).send();
    } catch (err) {
        console.error('contacts/delete error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

/*
 * Below are helper methods / rehash routes (commented-out test routes kept as-is).
 * They already had console.info/console.warn usage in the original file; keep that if you re-enable them.
 * NOTE: If you enable heavy bulk operations in production, consider changing console.* to a structured logger.
 */


// server-side contact hashing route
// POST /v1/contacts/rehash-users?limit=200&skip=0&defaultCountry=IN
// router.post('/rehash-users', auth, async (req, res) => {
//   try {

//     const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit || req.body.limit || '200', 10)));
//     const skip = Math.max(0, parseInt(req.query.skip || req.body.skip || '0', 10));
//     const defaultCountry = (req.query.defaultCountry || req.body.defaultCountry || 'IN').toString();

//     // server salt (must match client SALT for same hashes)
//     const SALT = process.env.CONTACT_HASH_KEY || '';
//     if (!SALT) console.warn('CONTACT_HASH_KEY not set on server — hashes may not match client-side.');

//     // helper: normalize email
//     const normalizeEmailServer = (email) => {
//       if (!email || typeof email !== 'string') return null;
//       return email.trim().toLowerCase();
//     };

//     // helper: normalize phone -> E.164 if possible, else fallback to +digits
//     const normalizePhoneServer = (raw, defaultCtry = 'IN') => {
//       if (!raw || typeof raw !== 'string') return null;
//       try {
//         const pn = parsePhoneNumberFromString(raw, defaultCtry);
//         if (pn && typeof pn.isValid === 'function' ? pn.isValid() : true) {
//           if (pn && pn.number) return pn.number; // E.164
//         }
//       } catch (e) {
//         // ignore, fallback below
//       }
//       const digits = raw.replace(/\D+/g, '');
//       if (digits.length >= 8) return `+${digits}`;
//       return null;
//     };

//     const hashServer = (val) => {
//       if (!val) return null;
//       return crypto.createHash('sha256').update((process.env.CONTACT_HASH_KEY || '') + val).digest('hex');
//     };

//     // find users who have phone/email but missing or empty hashes
//     const query = {
//       $or: [
//         { phone: { $exists: true, $ne: null }, $or: [{ phoneHashes: { $exists: false } }, { phoneHashes: { $size: 0 } }] },
//         { email: { $exists: true, $ne: null }, $or: [{ emailHashes: { $exists: false } }, { emailHashes: { $size: 0 } }] },
//       ],
//     };

//     const candidates = await User.find(query)
//       .select('_id name email phone phoneHashes emailHashes createdAt')
//       .skip(skip)
//       .limit(limit)
//       .lean();

//     if (!Array.isArray(candidates) || candidates.length === 0) {
//       return res.json({ processed: 0, updated: 0, message: 'No candidate users found' });
//     }

//     const bulkOps = [];
//     const samples = [];
//     let processed = 0;
//     let plannedUpdates = 0;

//     for (const u of candidates) {
//       processed++;
//       const addToSet = {};
//       // PHONE
//       if (u.phone) {
//         const normalizedPhone = normalizePhoneServer(String(u.phone), defaultCountry);
//         if (normalizedPhone) {
//           const phash = hashServer(normalizedPhone);
//           // push sample
//           samples.push({ userId: String(u._id), phone: String(u.phone).slice(0, 40), normalizedPhone, phoneHash: phash });
//           const hasPhoneHashes = Array.isArray(u.phoneHashes) && u.phoneHashes.length > 0;
//           if (!hasPhoneHashes || (hasPhoneHashes && !u.phoneHashes.includes(phash))) {
//             addToSet.phoneHashes = phash;
//           }
//         } else {
//           samples.push({ userId: String(u._id), phone: String(u.phone).slice(0, 40), note: 'could not normalize phone' });
//         }
//       }

//       // EMAIL
//       if (u.email) {
//         const normalizedEmail = normalizeEmailServer(u.email);
//         if (normalizedEmail) {
//           const ehash = hashServer(normalizedEmail);
//           samples.push({ userId: String(u._id), email: normalizedEmail, emailHash: ehash });
//           const hasEmailHashes = Array.isArray(u.emailHashes) && u.emailHashes.length > 0;
//           if (!hasEmailHashes || (hasEmailHashes && !u.emailHashes.includes(ehash))) {
//             addToSet.emailHashes = ehash;
//           }
//         } else {
//           samples.push({ userId: String(u._id), email: u.email, note: 'could not normalize email' });
//         }
//       }

//       if (Object.keys(addToSet).length) {
//         plannedUpdates++;
//         bulkOps.push({
//           updateOne: {
//             filter: { _id: toObjectIdSafe(u._id) },
//             update: { $addToSet: addToSet },
//           },
//         });
//       }

//       // don't let samples grow without bound
//       if (samples.length > 200) samples.length = 200;
//     }

//     if (bulkOps.length) {
//       try {
//         const br = await User.bulkWrite(bulkOps);
//         console.info('rehash-users: bulkWrite result:', br && typeof br === 'object' ? {
//           matchedCount: br.matchedCount ?? br.nMatched,
//           modifiedCount: br.modifiedCount ?? br.nModified,
//           upsertedCount: Array.isArray(br.upserted) ? br.upserted.length : (br.upsertedCount || 0)
//         } : br);
//       } catch (e) {
//         console.error('rehash-users: bulkWrite failed', e);
//       }
//     }

//     console.info('rehash-users: processed', processed, 'candidates, planned updates for', plannedUpdates);
//     console.info('rehash-users: sample logs (first 20):', JSON.stringify(samples.slice(0, 20), null, 2));

//     return res.json({ processed, candidates: candidates.length, plannedUpdates, samples: samples.slice(0, 50) });
//   } catch (err) {
//     console.error('rehash-users: error', err);
//     return res.status(500).json({ error: 'Server error', detail: String(err?.message || err) });
//   }
// });

// POST /v1/contacts/rehash-users (test-only: compute & log, do NOT save)
// router.post('/rehash-users', auth, async (req, res) => {
//   try {

//     const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit || req.body.limit || '200', 10)));
//     const skip = Math.max(0, parseInt(req.query.skip || req.body.skip || '0', 10));
//     const defaultCountry = (req.query.defaultCountry || req.body.defaultCountry || 'IN').toString();

//     const SALT = process.env.CONTACT_HASH_KEY || '';
//     if (!SALT) console.warn('CONTACT_HASH_KEY not set on server — hashes may not match client-side.');

//     // helpers
//     const normalizeEmailServer = (email) => {
//       if (!email || typeof email !== 'string') return null;
//       return email.trim().toLowerCase();
//     };

//     const normalizePhoneServer = (raw, defaultCtry = 'IN') => {
//       if (!raw || typeof raw !== 'string') return null;
//       try {
//         const pn = parsePhoneNumberFromString(raw, defaultCtry);
//         if (pn && (typeof pn.isValid === 'function' ? pn.isValid() : true) && pn.number) {
//           return pn.number; // E.164
//         }
//       } catch (e) {
//         // ignore and fallback
//       }
//       const digits = raw.replace(/\D+/g, '');
//       if (digits.length >= 8) return `+${digits}`;
//       return null;
//     };

//     const hashServer = (val) => {
//       if (!val) return null;
//       return crypto.createHash('sha256').update(SALT + val).digest('hex');
//     };

//     // find candidate users: have phone/email but missing or empty hashes
//     const query = {
//       $or: [
//         { phone: { $exists: true, $ne: null }, $or: [{ phoneHashes: { $exists: false } }, { phoneHashes: { $size: 0 } }] },
//         { email: { $exists: true, $ne: null }, $or: [{ emailHashes: { $exists: false } }, { emailHashes: { $size: 0 } }] },
//       ],
//     };

//     const candidates = await User.find(query)
//       .select('_id name email phone phoneHashes emailHashes createdAt')
//       .skip(skip)
//       .limit(limit)
//       .lean();

//     if (!Array.isArray(candidates) || candidates.length === 0) {
//       return res.json({ processed: 0, message: 'No candidate users found' });
//     }

//     const samples = [];
//     let processed = 0;
//     let plannedUpdates = 0;

//     for (const u of candidates) {
//       processed++;
//       const willAdd = {};
//       // PHONE
//       if (u.phone) {
//         const normalizedPhone = normalizePhoneServer(String(u.phone), defaultCountry);
//         if (normalizedPhone) {
//           const phash = hashServer(normalizedPhone);
//           samples.push({
//             userId: String(u._id),
//             field: 'phone',
//             original: String(u.phone).slice(0, 60),
//             normalized: normalizedPhone,
//             hash: phash,
//           });
//           const hasPhoneHashes = Array.isArray(u.phoneHashes) && u.phoneHashes.length > 0;
//           if (!hasPhoneHashes || (hasPhoneHashes && !u.phoneHashes.includes(phash))) {
//             willAdd.phoneHash = phash;
//             plannedUpdates++;
//           }
//         } else {
//           samples.push({
//             userId: String(u._id),
//             field: 'phone',
//             original: String(u.phone).slice(0, 60),
//             note: 'could not normalize phone',
//           });
//         }
//       }

//       // EMAIL
//       if (u.email) {
//         const normalizedEmail = normalizeEmailServer(u.email);
//         if (normalizedEmail) {
//           const ehash = hashServer(normalizedEmail);
//           samples.push({
//             userId: String(u._id),
//             field: 'email',
//             original: String(u.email).slice(0, 120),
//             normalized: normalizedEmail,
//             hash: ehash,
//           });
//           const hasEmailHashes = Array.isArray(u.emailHashes) && u.emailHashes.length > 0;
//           if (!hasEmailHashes || (hasEmailHashes && !u.emailHashes.includes(ehash))) {
//             willAdd.emailHash = ehash;
//             plannedUpdates++;
//           }
//         } else {
//           samples.push({
//             userId: String(u._id),
//             field: 'email',
//             original: String(u.email).slice(0, 120),
//             note: 'could not normalize email',
//           });
//         }
//       }

//       // For testing only: log what *would* be added (but do NOT persist)
//       if (Object.keys(willAdd).length > 0) {
//         console.info(`[rehash-users] would-add for user ${u._id}:`, willAdd);
//       }
//       // keep sample array reasonable
//       if (samples.length > 500) samples.splice(500);
//     }

//     // DO NOT perform any DB writes in this test route
//     console.info('rehash-users (test): processed', processed, 'candidates, plannedUpdates (count of will-adds):', plannedUpdates);
//     console.info('rehash-users (test): sample logs (first 50):\n', JSON.stringify(samples.slice(0, 50), null, 2));

//     return res.json({
//       processed,
//       candidates: candidates.length,
//       plannedUpdates,
//       samples: samples.slice(0, 50),
//       note: 'This route is test-only and did NOT modify the database.',
//     });
//   } catch (err) {
//     console.error('rehash-users: error', err);
//     return res.status(500).json({ error: 'Server error', detail: String(err?.message || err) });
//   }
// });


module.exports = router;
