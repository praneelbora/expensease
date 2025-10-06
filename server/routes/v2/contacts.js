// routes/v1/contacts.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../../middleware/auth');
const ContactUpload = require('../../models/ContactUpload'); // path adjust if needed
const User = require('../../models/User');

const MAX_CONTACTS_PER_REQUEST = 1000; // client already caps; server enforces
const MAX_CONTACTS_PER_USER = 50000; // optional global cap per user (adjust if you want)

// helper to safely build ObjectId (returns value if already ObjectId or null on invalid)
const toObjectIdSafe = (v) => {
    if (!v) return null;
    if (mongoose.isValidObjectId(v)) {
        // if it's already an ObjectId instance, return it; if string, create new ObjectId
        try {
            if (typeof v === 'object' && v._bsontype === 'ObjectID') return v;
            return new mongoose.Types.ObjectId(String(v));
        } catch (e) {
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
 *
 * Behavior:
 * - Validate & dedupe incoming hashes
 * - Enforce per-request cap
 * - Bulk upsert into ContactUpload (owner + contactHash unique)
 * - Lookup matches in User collection by phoneHashes/emailHashes
 * - Return summary: uploaded count, matches: [{ contactHash, matchedUsers: [{_id, name, email, phone, avatar}] }]
 */


// Helper: sanitize incoming contacts payload
function sanitizeContactsArray(raw) {
    // Accept:
    // - array of strings: ['hash1','hash2'] -> treat as contactHash (unknown type)
    // - array of objects: [{ contactHash, type }]
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const item of raw) {
        if (!item) continue;
        if (typeof item === 'string') {
            const s = String(item).trim();
            if (s) out.push({ contactHash: s, type: null });
            continue;
        }
        // object forms
        const ch = item.contactHash || item.hash || item?.contact_hash || null;
        const type = (item.type || item?.t || null);
        if (ch && typeof ch === 'string') {
            out.push({ contactHash: String(ch).trim(), type: type ? String(type).trim() : null });
        }
    }
    return out;
}

// POST /api/v1/contacts/upload
router.post('/upload', auth, async (req, res) => {
    try {
        const ownerId = req.user && req.user.id;
        if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

        // parse & sanitize
        const rawContacts = req.body && req.body.contacts;
        const contacts = sanitizeContactsArray(rawContacts);

        if (!contacts || contacts.length === 0) {
            return res.status(400).json({ error: 'No valid contacts in request' });
        }

        // dedupe by contactHash preserving type when available
        const uniq = new Map();
        for (const c of contacts) {
            const ch = String(c.contactHash).trim();
            if (!ch) continue;
            if (!uniq.has(ch)) {
                uniq.set(ch, { contactHash: ch, type: c.type || null });
            } else {
                // if existing slot has no type but new one has, set it
                const existing = uniq.get(ch);
                if (!existing.type && c.type) existing.type = c.type;
            }
        }
        const deduped = Array.from(uniq.values());

        // enforce per-request limit
        if (deduped.length > MAX_CONTACTS_PER_REQUEST) {
            return res.status(413).json({ error: `Too many contacts in a single request. Max ${MAX_CONTACTS_PER_REQUEST}` });
        }

        const ownerObjId = toObjectIdSafe(ownerId);
        if (!ownerObjId) return res.status(401).json({ error: 'Unauthorized' });

        // enforce per-user total cap (count existing + new)
        const existingCount = await ContactUpload.countDocuments({ userId: ownerObjId }).catch(() => 0);
        if (existingCount + deduped.length > MAX_CONTACTS_PER_USER) {
            return res.status(413).json({ error: 'Contact upload would exceed allowed storage for this account' });
        }

        // Bulk upsert: write contact rows (userId + contactHash) with type (if provided)
        const bulkOps = deduped.map((c) => ({
            updateOne: {
                filter: { userId: ownerObjId, contactHash: c.contactHash },
                update: {
                    $set: { type: c.type || 'unknown', updatedAt: new Date() },
                    $setOnInsert: { createdAt: new Date(), matchedUserId: null, matchTimestamp: null },
                },
                upsert: true,
            },
        }));

        if (bulkOps.length > 0) {
            await ContactUpload.bulkWrite(bulkOps);
        }

        // Build list of incoming hashes for matching
        const hashes = deduped.map((d) => d.contactHash);

        // Lookup users with any of these hashes in phoneHashes or emailHashes
        const users = await User.find({
            $or: [{ phoneHashes: { $in: hashes } }, { emailHashes: { $in: hashes } }],
        })
            .select('_id name email phone profilePic phoneHashes emailHashes')
            .lean();

        // Prepare match maps
        const matchesMap = new Map(); // contactHash -> [match entries...]
        const aggregatedUserMap = new Map(); // userId -> aggregated details

        if (Array.isArray(users) && users.length) {
            // For efficiency, build sets on user doc
            for (const u of users) {
                const phoneHashes = Array.isArray(u.phoneHashes) ? u.phoneHashes : [];
                const emailHashes = Array.isArray(u.emailHashes) ? u.emailHashes : [];

                for (const incomingHash of hashes) {
                    const matchedBy = [];
                    if (phoneHashes.includes(incomingHash)) matchedBy.push('phone');
                    if (emailHashes.includes(incomingHash)) matchedBy.push('email');
                    if (matchedBy.length === 0) continue;

                    const arr = matchesMap.get(incomingHash) || [];
                    arr.push({
                        _id: u._id,
                        name: u.name || null,
                        email: u.email || null,
                        phone: u.phone || null,
                        avatar: u.profilePic || null,
                        matchedBy,
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
                            matchedBy: new Set(matchedBy),
                            matchedHashes: new Set([incomingHash]),
                        });
                    } else {
                        const ag = aggregatedUserMap.get(userKey);
                        matchedBy.forEach((t) => ag.matchedBy.add(t));
                        ag.matchedHashes.add(incomingHash);
                    }
                }
            }
        }

        // Update matchedUserId for matched contact rows (store first match only) - optional but useful
        const matchBulk = [];
        for (const [hash, matchedUsers] of matchesMap.entries()) {
            if (!matchedUsers || matchedUsers.length === 0) continue;
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
                await ContactUpload.bulkWrite(matchBulk);
            } catch (e) {
                console.warn('contacts: failed to write matchedUserId updates', e);
            }
        }

        // Build response objects
        const matches = deduped.map((d) => {
            const matchedUsers = matchesMap.get(d.contactHash) || [];
            return {
                contactHash: d.contactHash,
                type: d.type || null,
                matchedUsers, // array (may be empty)
            };
        });

        const aggregatedMatchedUsers = Array.from(aggregatedUserMap.values()).map((ag) => ({
            _id: ag._id,
            name: ag.name,
            email: ag.email,
            phone: ag.phone,
            avatar: ag.avatar,
            matchedBy: Array.from(ag.matchedBy),
            matchedHashes: Array.from(ag.matchedHashes),
        }));

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

module.exports = router;


/**
 * GET /v1/contacts
 * Returns list (paginated) of uploaded contact hashes for the authenticated user.
 * Query: ?limit=50&skip=0
 */
router.get('/', auth, async (req, res) => {
    try {
        const ownerId = req.user && req.user.id;
        if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

        const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit || '100', 10)));
        const skip = Math.max(0, parseInt(req.query.skip || '0', 10));

        const docs = await ContactUpload.find({ userId: ownerId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

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
    try {
        const ownerId = req.user && req.user.id;
        if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

        await ContactUpload.deleteMany({ userId: ownerId });
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
    try {
        const ownerId = req.user && req.user.id;
        if (!ownerId) return res.status(401).json({ error: 'Unauthorized' });

        const contactHash = (req.params.contactHash || '').toString().trim();
        if (!contactHash) return res.status(400).json({ error: 'Missing contactHash' });

        const removed = await ContactUpload.deleteOne({ userId: ownerId, contactHash });
        if (removed.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
        return res.status(204).send();
    } catch (err) {
        console.error('contacts/delete error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// requires at top of file (add if not already present)
const crypto = require('crypto');
const { parsePhoneNumberFromString } = require('libphonenumber-js');

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
