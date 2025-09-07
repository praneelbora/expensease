// routes/settleAndFriend.js  (replace / merge with your file)
const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const Expense = require('../../models/Expense');
const User = require('../../models/User');
const auth = require("../../middleware/auth");
const notif = require('../v1/notifs'); // <-- single-file notif helper (sendToUsers, pushNotifications, etc.)

const calculateDebt = (groupExpenses, members) => {
    const totalDebt = {}; // memberId -> { [currency]: netAmount }

    // init
    members.forEach(m => { totalDebt[m._id] = {}; });

    groupExpenses.forEach(exp => {
        const code = exp.currency || "INR";
        exp.splits.forEach(split => {
            const memberId = split.friendId._id;
            const curMap = totalDebt[memberId];
            if (curMap[code] == null) curMap[code] = 0;

            if (split.payAmount > 0) curMap[code] += split.payAmount; // paid → is owed
            if (split.oweAmount > 0) curMap[code] -= split.oweAmount; // owes → negative
        });
    });
    return totalDebt;
};
function simplifyDebts(totalDebt, members, locale = "en-IN") {
    const transactions = [];
    const currencies = new Set();

    // Collect all currencies across all members
    Object.values(totalDebt).forEach(map =>
        Object.keys(map || {}).forEach(c => currencies.add(c))
    );

    currencies.forEach(code => {
        // precision + thresholds
        let digits = 2;
        try {
            const fmt = new Intl.NumberFormat(locale, { style: "currency", currency: code });
            digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
        } catch { }
        const pow = 10 ** digits;
        const round = v => Math.round((Number(v) + Number.EPSILON) * pow) / pow;
        const minUnit = 1 / pow;

        const owe = [];
        const owed = [];

        // Split members into owe/owed
        for (const memberId in totalDebt) {
            const amt = round(totalDebt[memberId]?.[code] || 0);
            if (amt > 0) {
                owed.push({ memberId, amount: amt });
            } else if (amt < 0) {
                owe.push({ memberId, amount: Math.abs(amt) });
            }
        }

        let i = 0, j = 0;
        // safety guard to avoid infinite loops
        let guard = 0, guardMax = (owe.length + owed.length + 1) * 5000;

        while (i < owe.length && j < owed.length) {
            if (guard++ > guardMax) {
                console.warn("simplifyDebts: guard break", code);
                break;
            }

            const transfer = Math.min(owe[i].amount, owed[j].amount);
            if (transfer >= minUnit) {
                transactions.push({
                    from: owe[i].memberId,
                    to: owed[j].memberId,
                    amount: round(transfer),
                    currency: code,
                });
            }

            // subtract the transfer
            owe[i].amount = round(owe[i].amount - transfer);
            owed[j].amount = round(owed[j].amount - transfer);

            // clamp tiny residuals
            if (Math.abs(owe[i].amount) < minUnit) owe[i].amount = 0;
            if (Math.abs(owed[j].amount) < minUnit) owed[j].amount = 0;

            if (owe[i].amount === 0) i++;
            if (owed[j].amount === 0) j++;
        }
    });

    return transactions;
}


router.get('/friend/:friendId', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const friendId = req.params.friendId;

        // ✅ Step 1: Get non-group expenses (direct between user & friend)
        const nonGroupExpenses = await Expense.find({
            'splits.friendId': { $all: [userId, friendId] },
            $or: [{ groupId: { $exists: false } }, { groupId: null }]
        })
            .populate('splits.friendId', '_id name email')
            .populate('createdBy', 'name email')
            .populate('splits.paidFromPaymentMethodId', '_id label')
            .populate('auditLog.updatedBy', 'name email')
            .populate('paidFromPaymentMethodId');
        // ✅ Step 2: Get group expenses
        const groupExpenses = await Expense.find({
            'splits.friendId': { $in: [userId, friendId] },
            groupId: { $exists: true, $ne: null }
        })
            .populate('splits.friendId', '_id name email')
            .populate('createdBy', 'name email')
            .populate('splits.paidFromPaymentMethodId', '_id label')
            .populate('auditLog.updatedBy', 'name email')
            .populate('groupId', 'name')
            .populate('paidFromPaymentMethodId');

        // ✅ Step 3: Group groupExpenses by groupId
        const groupedByGroup = groupExpenses.reduce((acc, exp) => {
            const gid = exp.groupId?._id?.toString();
            if (!gid) return acc;
            if (!acc[gid]) acc[gid] = { group: exp.groupId, members: [], expenses: [] };
            acc[gid].expenses.push(exp);

            // collect members
            exp.splits.forEach(s => {
                if (!acc[gid].members.find(m => String(m._id) === String(s.friendId?._id))) {
                    acc[gid].members.push(s.friendId);
                }
            });

            return acc;
        }, {});

        const simplifiedTransactions = [];

        // ✅ Step 4: For each group, simplify debts & check user↔friend
        for (const gid in groupedByGroup) {
            const { group, members, expenses } = groupedByGroup[gid];

            const totalDebt = calculateDebt(expenses, members);
            const simplified = simplifyDebts(totalDebt, members);

            // only keep tx between user & friend
            const directTx = simplified.filter(tx =>
                (tx.from == userId && tx.to == friendId) ||
                (tx.from == friendId && tx.to == userId)
            );

            if (directTx.length > 0) {
                simplifiedTransactions.push(
                    ...directTx.map(tx => ({
                        ...tx,
                        group: { _id: group._id, name: group.name }
                    }))
                );
            }
        }

        // ✅ Step 5: Final response
        return res.status(200).json({
            expenses: nonGroupExpenses,
            simplifiedTransactions
        });

    } catch (error) {
        console.error("Error fetching friend expenses:", error);
        return res.status(500).json({ error: "Server error fetching expenses" });
    }
});


router.get('/friends', auth, async (req, res) => {
    try {
        const userId = req.user.id;


        // Load all friends for this user
        const user = await User.findById(userId).populate("friends");
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        const result = {};

        for (const friend of user.friends) {
            // Non-group expenses between user and this friend
            const nonGroupExpenses = await Expense.find({
                'splits.friendId': { $all: [userId, friend._id] },
                $or: [{ groupId: { $exists: false } }, { groupId: null }],
            })
                .populate('splits.friendId', '_id name email')
                .populate('createdBy', 'name email')
                .populate('splits.paidFromPaymentMethodId', '_id label')
                .populate('auditLog.updatedBy', 'name email')
                .populate('groupId', 'name')
                .lean();


            // Group expenses where either is a member
            const groupExpenses = await Expense.find({
                'splits.friendId': { $in: [userId, friend._id] },
                groupId: { $exists: true, $ne: null },
            })
                .populate('splits.friendId', '_id name email')
                .populate('createdBy', 'name email')
                .populate('splits.paidFromPaymentMethodId', '_id label')
                .populate('auditLog.updatedBy', 'name email')
                .populate('groupId', 'name')
                .lean();


            // Group by groupId
            const groupedByGroup = groupExpenses.reduce((acc, exp) => {
                const gid = exp.groupId?._id?.toString();
                if (!gid) return acc;
                if (!acc[gid]) acc[gid] = { group: exp.groupId, members: [], expenses: [] };
                acc[gid].expenses.push(exp);


                exp.splits.forEach((s) => {
                    const fid = String(s?.friendId?._id || s?.friendId);
                    if (fid && !acc[gid].members.find((m) => String(m._id) === fid)) {
                        acc[gid].members.push(s.friendId);
                    }
                });


                return acc;
            }, {});


            const simplifiedTxs = [];


            for (const gid in groupedByGroup) {
                const { group, members, expenses } = groupedByGroup[gid];
                const totalDebt = calculateDebt(expenses, members);
                const simplified = simplifyDebts(totalDebt, members);


                // keep only this user <-> current friend
                const direct = simplified.filter(
                    (tx) =>
                        (tx.from === String(userId) && tx.to === String(friend._id)) ||
                        (tx.from === String(friend._id) && tx.to === String(userId))
                );


                direct.forEach((tx) => {
                    simplifiedTxs.push({ ...tx, group });
                });
            }


            result[friend._id] = {
                expenses: nonGroupExpenses,
                simplifiedTransactions: simplifiedTxs,
            };
        }
        return res.status(200).json(result);
    } catch (err) {
        console.error("Error in /friends/expenses:", err);
        res.status(500).json({ error: "Server error fetching friends expenses" });
    }
});

// POST /v1/expenses/settle

router.post('/settle', auth, async (req, res) => {
    try {
        const {
            fromUserId,
            toUserId,
            amount,
            note,
            currency,
            type, // 'group' | 'all_groups' | 'all_personal' | 'net' | 'custom'
            groupId, // single gid (for type:'group')
            groupIds, // array of gids OR map { gid: {from,to,amount,currency,...} }
            meta = {} // may contain .groups (map) and .personal and .items (for custom)
        } = req.body;

        console.log(req.body);

        // Basic required fields
        if (!fromUserId || !toUserId) {
            return res.status(400).json({ error: "Missing required fields: fromUserId/toUserId." });
        }

        // amount/currency are required unless this is `custom` with meta.items (per-item amounts)
        const hasCustomItems = Array.isArray(meta?.items) && meta.items.length > 0;
        if (!hasCustomItems) {
            // for non-custom or custom-without-items, require top-level amount & currency
            if (typeof amount === 'undefined' || !currency) {
                return res.status(400).json({ error: "Missing required fields: amount/currency." });
            }
        }

        // Utilities
        const createSettleExpense = async ({ from, to, amt, cur, gid, desc }) => {
            const settleExpense = new Expense({
                createdBy: from,
                description: desc || `Settled ${cur} ${amt}`,
                amount: amt,
                typeOf: 'settle',
                splitMode: 'value',
                currency: cur,
                ...(gid ? { groupId: gid } : {}),
                splits: [
                    { friendId: to, owing: true, paying: false, oweAmount: amt },
                    { friendId: from, owing: false, paying: true, payAmount: amt }
                ]
            });
            await settleExpense.save();

            // Notify the two parties (best-effort). Wrap in try/catch so errors don't affect response.
            (async () => {
                try {
                    const title = 'Payment recorded';
                    const msg = `A settlement of ${cur} ${amt} was recorded.`;
                    const data = { type: 'settlement', expenseId: String(settleExpense._id), groupId: gid || null, amount: amt, currency: cur };
                    const category = gid ? 'group_settlement' : 'friend_settlement';
                    const opts = { channel: 'push', fromFriendId: String(from), groupId: gid ? String(gid) : null };
                    // send to both from & to
                    await notif.sendToUsers([String(from), String(to)], title, msg, data, category, opts).catch(e => {
                        console.error('notif.sendToUsers failed (inside createSettleExpense):', e);
                    });
                } catch (e) {
                    console.error('createSettleExpense: notification error', e);
                }
            })();

            return settleExpense;
        };

        // Keep your old “mark scope settled if zero” logic, but scoped
        // - For groups: only that groupId + currency
        // - For personal: groupId=null + currency + both users
        const tryMarkScopeSettled = async ({ gid, cur, aId, bId }) => {
            // fetch all related unsettled expenses in this scope
            let related = [];
            if (gid) {
                related = await Expense.find({
                    groupId: gid,
                    currency: cur,
                    $or: [{ settled: false }, { settled: { $exists: false } }],
                });
            } else {
                related = await Expense.find({
                    groupId: null,
                    currency: cur,
                    $or: [{ settled: false }, { settled: { $exists: false } }],
                    'splits.friendId': { $all: [aId, bId] },
                    $expr: { $eq: [{ $size: "$splits" }, 2] } // strictly 1-1 expenses
                });
            }

            // compute net in this scope; if all zero -> mark settled
            const net = {};
            for (const exp of related) {
                if (exp.typeOf === 'loan') continue;
                if (exp.currency !== cur) continue;
                for (const s of exp.splits) {
                    const owe = Number(s.oweAmount) || 0;
                    const pay = Number(s.payAmount) || 0;
                    const delta = (s.owing ? owe : 0) - (s.paying ? pay : 0);
                    const id = String(s.friendId);
                    net[id] = (net[id] || 0) + delta;
                }
            }
            const allZero = Object.values(net).every(v => Math.abs(v) < 0.01);
            if (allZero && related.length) {
                await Expense.updateMany(
                    { _id: { $in: related.map(e => e._id) } },
                    { $set: { settled: true, settledAt: new Date() } }
                );
            }
            return allZero;
        };

        // Normalizers
        const asMap = (maybeArrayOrMap, fallbackMap = {}) => {
            if (!maybeArrayOrMap) return fallbackMap;
            if (Array.isArray(maybeArrayOrMap)) {
                // convert array -> keyed map with NO amounts; caller should also send meta.groups for amounts
                const m = {};
                for (const gid of maybeArrayOrMap) m[String(gid)] = null;
                return m;
            }
            return maybeArrayOrMap; // already a map
        };

        // Handlers per type
        const results = [];

        if (type === 'group') {
            if (!groupId) return res.status(400).json({ error: "groupId is required for type 'group'." });

            // single group settle
            const doc = await createSettleExpense({
                from: fromUserId,
                to: toUserId,
                amt: Number(amount),
                cur: currency,
                gid: groupId,
                desc: note
            });
            results.push(doc);

            await tryMarkScopeSettled({ gid: groupId, cur: currency, aId: fromUserId, bId: toUserId });

            // summary notification (best-effort)
            (async () => {
                try {
                    const fromUser = await User.findById(fromUserId).select('name').lean();
                    const toUser = await User.findById(toUserId).select('name').lean();
                    const title = 'Settlement created';
                    const msg = `${fromUser?.name || 'Someone'} settled ${amount} ${currency} with ${toUser?.name || 'Someone'}.`;
                    const data = { type: 'settlement_summary', count: results.length, totalAmount: Number(amount), currency, items: results.map(r => String(r._id)) };
                    const category = 'group_settlement';
                    const opts = { channel: 'push', fromFriendId: String(fromUserId), groupId: String(groupId) };
                    await notif.sendToUsers([String(fromUserId), String(toUserId)], title, msg, data, category, opts).catch(e => console.error('summary notify failed', e));
                } catch (e) {
                    console.error('summary notification error (group):', e);
                }
            })();

            return res.status(201).json({ ok: true, type, count: 1, items: results });

        } else if (type === 'all_personal') {
            // one personal settle (groupId = null)
            const doc = await createSettleExpense({
                from: fromUserId,
                to: toUserId,
                amt: Number(amount),
                cur: currency,
                gid: null,
                desc: note
            });
            results.push(doc);

            await tryMarkScopeSettled({ gid: null, cur: currency, aId: fromUserId, bId: toUserId });

            // summary notification
            (async () => {
                try {
                    const fromUser = await User.findById(fromUserId).select('name').lean();
                    const toUser = await User.findById(toUserId).select('name').lean();
                    const title = 'Settlement created';
                    const msg = `${fromUser?.name || 'Someone'} settled ${amount} ${currency} with ${toUser?.name || 'Someone'}.`;
                    const data = { type: 'settlement_summary', count: results.length, totalAmount: Number(amount), currency, items: results.map(r => String(r._id)) };
                    const category = 'friend_settlement';
                    const opts = { channel: 'push', fromFriendId: String(fromUserId), groupId: null };
                    await notif.sendToUsers([String(fromUserId), String(toUserId)], title, msg, data, category, opts).catch(e => console.error('summary notify failed', e));
                } catch (e) {
                    console.error('summary notification error (personal):', e);
                }
            })();

            return res.status(201).json({ ok: true, type, count: 1, items: results });

        } else if (type === 'all_groups') {
            // settle each group individually
            // prefer amounts from: groupIds (map) OR meta.groups
            const mapFromBody = asMap(groupIds, {});
            const mapFromMeta = meta?.ids || meta?.groups || {};
            const groupMap = Object.keys(mapFromBody).length ? mapFromBody : mapFromMeta;

            if (!groupMap || !Object.keys(groupMap).length) {
                return res.status(400).json({ error: "No groupIds provided for 'all_groups'." });
            }

            for (const [gid, detail] of Object.entries(groupMap)) {
                // prefer per-group detailed amount/from/to in payload, else fallback to top-level from/to/amount
                const amt = Number(detail?.amount ?? amount);
                const cur = detail?.currency || currency;
                const from = String(detail?.from || fromUserId);
                const to = String(detail?.to || toUserId);
                if (!amt || amt <= 0) continue;

                const doc = await createSettleExpense({
                    from, to, amt, cur, gid, desc: note
                });
                results.push(doc);

                await tryMarkScopeSettled({ gid, cur, aId: fromUserId, bId: toUserId });
            }

            // summary notification for batch
            (async () => {
                try {
                    const total = results.reduce((s, r) => s + (Number(r.amount) || 0), 0);
                    const fromUser = await User.findById(fromUserId).select('name').lean();
                    const toUser = await User.findById(toUserId).select('name').lean();
                    const title = 'Settlements created';
                    const msg = `${fromUser?.name || 'Someone'} created ${results.length} settlements totalling ${total} ${currency}.`;
                    const data = { type: 'settlement_summary', count: results.length, totalAmount: total, currency, items: results.map(r => String(r._id)) };
                    const category = 'group_settlement';
                    const opts = { channel: 'push', fromFriendId: String(fromUserId), groupId: null };
                    await notif.sendToUsers([String(fromUserId), String(toUserId)], title, msg, data, category, opts).catch(e => console.error('summary notify failed', e));
                } catch (e) {
                    console.error('summary notification error (all_groups):', e);
                }
            })();

            return res.status(201).json({ ok: true, type, count: results.length, items: results });

        } else if (type === 'net') {
            // NET = settle each group individually + settle the personal residue
            const groupMap = (meta?.groups && Object.keys(meta.groups).length)
                ? meta.groups
                : asMap(groupIds, {});

            // 1) groups
            for (const [gid, detail] of Object.entries(groupMap)) {
                if (!detail) continue;
                const amt = Number(detail.amount || 0);
                const cur = detail.currency || currency;
                const from = String(detail.from || fromUserId);
                const to = String(detail.to || toUserId);
                if (!amt || amt <= 0) continue;

                const doc = await createSettleExpense({
                    from, to, amt, cur, gid, desc: note
                });
                results.push(doc);

                await tryMarkScopeSettled({ gid, cur, aId: fromUserId, bId: toUserId });
            }

            // 2) personal
            const personal = meta?.personal;
            if (personal && Number(personal.amount) > 0) {
                const doc = await createSettleExpense({
                    from: String(personal.from || fromUserId),
                    to: String(personal.to || toUserId),
                    amt: Number(personal.amount),
                    cur: personal.currency || currency,
                    gid: null,
                    desc: note
                });
                results.push(doc);

                await tryMarkScopeSettled({
                    gid: null,
                    cur: personal.currency || currency,
                    aId: fromUserId,
                    bId: toUserId
                });
            }

            // summary notification for net
            (async () => {
                try {
                    const total = results.reduce((s, r) => s + (Number(r.amount) || 0), 0);
                    const fromUser = await User.findById(fromUserId).select('name').lean();
                    const toUser = await User.findById(toUserId).select('name').lean();
                    const title = 'Settlements created';
                    const msg = `${fromUser?.name || 'Someone'} created ${results.length} settlements totalling ${total} ${currency}.`;
                    const data = { type: 'settlement_summary', count: results.length, totalAmount: total, currency, items: results.map(r => String(r._id)) };
                    const category = 'friend_settlement';
                    const opts = { channel: 'push', fromFriendId: String(fromUserId), groupId: null };
                    await notif.sendToUsers([String(fromUserId), String(toUserId)], title, msg, data, category, opts).catch(e => console.error('summary notify failed', e));
                } catch (e) {
                    console.error('summary notification error (net):', e);
                }
            })();

            return res.status(201).json({ ok: true, type, count: results.length, items: results });

        } else if (type === 'custom') {
            // custom: either a single settle (fallback to top-level fields) or multiple items in meta.items
            // meta.items => [{ from, to, amount, currency, groupId, description }, ...]
            const items = Array.isArray(meta?.items) ? meta.items : [];

            if (items.length === 0) {
                // fallback: treat like a single settle (groupId may be absent => personal)
                const doc = await createSettleExpense({
                    from: fromUserId,
                    to: toUserId,
                    amt: Number(amount),
                    cur: currency,
                    gid: meta?.groupId ?? null,
                    desc: note || meta?.description || ''
                });
                results.push(doc);

                await tryMarkScopeSettled({
                    gid: meta?.groupId ?? null,
                    cur: currency,
                    aId: fromUserId,
                    bId: toUserId
                });
            } else {
                for (const it of items) {
                    const from = String(it.from || fromUserId);
                    const to = String(it.to || toUserId);
                    const amt = Number(it.amount || 0);
                    const cur = it.currency || currency;
                    const gid = (typeof it.groupId !== 'undefined') ? it.groupId : null;
                    const desc = it.description || note || '';

                    if (!amt || amt <= 0) continue;

                    const doc = await createSettleExpense({
                        from,
                        to,
                        amt,
                        cur,
                        gid,
                        desc
                    });
                    results.push(doc);

                    await tryMarkScopeSettled({
                        gid: gid,
                        cur: cur,
                        aId: from,
                        bId: to
                    });
                }
            }

            // summary notification for custom
            (async () => {
                try {
                    const total = results.reduce((s, r) => s + (Number(r.amount) || 0), 0);
                    const fromUser = await User.findById(fromUserId).select('name').lean();
                    const toUser = await User.findById(toUserId).select('name').lean();
                    const title = 'Settlements created';
                    const msg = `${fromUser?.name || 'Someone'} created ${results.length} custom settlements totalling ${total} ${currency || (results[0] && results[0].currency) || ''}.`;
                    const data = { type: 'settlement_summary', count: results.length, totalAmount: total, currency, items: results.map(r => String(r._id)) };
                    const category = 'friend_settlement';
                    const opts = { channel: 'push', fromFriendId: String(fromUserId), groupId: null };
                    await notif.sendToUsers([String(fromUserId), String(toUserId)], title, msg, data, category, opts).catch(e => console.error('summary notify failed', e));
                } catch (e) {
                    console.error('summary notification error (custom):', e);
                }
            })();

            return res.status(201).json({ ok: true, type, count: results.length, items: results });

        } else {
            // Fallback / unrecognized
            return res.status(400).json({ error: `Unknown settle type '${type}'.` });
        }

    } catch (err) {
        console.error("Settle error:", err);
        res.status(500).json({ error: 'Failed to settle amount' });
    }
});


module.exports = router;
