const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const Expense = require('../../models/Expense');
const User = require('../../models/User');
const auth = require("../../middleware/auth");
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

// routes/expenses.js
// router.post('/settle', auth, async (req, res) => {
//   try {
//     const {
//       fromUserId,
//       toUserId,
//       amount,
//       note,
//       groupId,         // legacy single-group support
//       groupIds,        // array for multi-group
//       currency,
//       type             // 'all_personal' | 'all_groups' | 'group' | 'net' | 'custom?'
//     } = req.body;

//     if (!fromUserId || !toUserId || !amount || !currency) {
//         console.log('missing required fields');

//       return res.status(400).json({ error: "Missing required fields." });
//     }

//     // Helpers
//     const eps = 0.01;
//     const asStr = v => String(v);
//     const UID = asStr(fromUserId);
//     const VID = asStr(toUserId);

//     const baseUnsettled = {
//       currency,
//       $or: [{ settled: false }, { settled: { $exists: false } }]
//     };

//     // Pair-only personal filter (exactly 2 splits, both users, no group)
//     const personalFilter = {
//       ...baseUnsettled,
//       groupId: null,
//       'splits.friendId': { $all: [fromUserId, toUserId] },
//       $expr: { $eq: [{ $size: "$splits" }, 2] }
//     };

//     // Compute net map for any set of expenses
//     const computeNetMap = (expenses) => {
//       const net = {}; // friendId -> number
//       for (const exp of expenses) {
//         if (exp.typeOf === 'loan') continue;
//         if (exp.currency !== currency) continue;
//         for (const s of exp.splits) {
//           const owe = Number(s.oweAmount) || 0;
//           const pay = Number(s.payAmount) || 0;
//           const delta = (s.owing ? owe : 0) - (s.paying ? pay : 0);
//           net[asStr(s.friendId)] = (net[asStr(s.friendId)] || 0) + delta;
//         }
//       }
//       return net;
//     };

//     // For a scope, how much "from -> to" should flow to make the pair zero *inside that scope*
//     const requiredForPair = (net) => {
//       const fromNet = Number(net[UID] || 0);   // positive => others owe fromUser
//       const toNet   = Number(net[VID] || 0);   // positive => others owe toUser
//       const needFrom = Math.max(0, -fromNet);  // how much fromUser owes in this scope
//       const needTo   = Math.max(0, toNet);     // how much toUser is owed in this scope
//       return Math.min(needFrom, needTo);       // how much should flow from -> to to zero the pair
//     };

//     // Create a settle expense (optionally tied to a group)
//     const createSettle = async ({ amount, groupId: gId }) => {
//       const settleExpense = new Expense({
//         createdBy: fromUserId,
//         description: note || `Settled ${currency} ${amount}`,
//         amount,
//         typeOf: 'settle',
//         splitMode: 'value',
//         currency,
//         ...(gId ? { groupId: gId } : {}),
//         splits: [
//           { friendId: toUserId,   owing: true,  paying: false, oweAmount: amount },
//           { friendId: fromUserId, owing: false, paying: true,  payAmount: amount }
//         ]
//       });
//       console.log('saving:',settleExpense);

//     //   await settleExpense.save();
//       return settleExpense;
//     };

//     // After we post a settle, re-check the scope and mark settled if the pair is ~0 in that scope.
//     const settleScopeIfZero = async (scopeQuery) => {
//       const docs = await Expense.find(scopeQuery);
//       const net = computeNetMap(docs);
//       const pairZero = Math.abs(net[UID] || 0) < eps && Math.abs(net[VID] || 0) < eps;
//       if (pairZero && docs.length > 0) {
//         await Expense.updateMany(
//           { _id: { $in: docs.map(d => d._id) } },
//           { $set: { settled: true, settledAt: new Date() } }
//         );
//       }
//       return { pairZero, matchedCount: docs.length };
//     };

//     // Build work-list by type
//     const normalizedGroupIds = Array.isArray(groupIds) ? [...new Set(groupIds.map(asStr))] : [];

//     // 1) PERSONAL: compute outstanding for personal scope
//     const personalDocs = await Expense.find(personalFilter);
//     const personalNet = computeNetMap(personalDocs);
//     const personalNeed = requiredForPair(personalNet); // how much from -> to needed in personal

//     // 2) GROUPS: for each groupId, compute outstanding inside that group
//     const groupsCalc = [];
//     const whichGroups =
//       type === 'group'    ? (groupId ? [asStr(groupId)] : [])
//     : type === 'all_groups' ? normalizedGroupIds
//     : type === 'net'        ? normalizedGroupIds
//                             : (groupId ? [asStr(groupId)] : []); // legacy fallback if provided

//     for (const gid of whichGroups) {
//       const groupDocs = await Expense.find({ ...baseUnsettled, groupId: gid });
//       console.log(groupDocs);

//       const net = computeNetMap(groupDocs);
//       console.log(net);

//       const need = requiredForPair(net);
//       groupsCalc.push({ groupId: gid, need, docs: groupDocs });
//     }

//     // Decide how to apply the submitted amount
//     let remaining = Number(amount) || 0;
//     const created = [];

//     const applyPersonal = async (cap) => {
//       const take = Math.min(Math.max(cap, 0), Math.max(personalNeed, 0), remaining);
//       if (take > 0) {
//         const se = await createSettle({ amount: take, groupId: null });
//         created.push(se);
//         remaining -= take;
//         await settleScopeIfZero(personalFilter);
//       }
//       return take;
//     };

//     const applyGroup = async (gid, cap) => {
//       const take = Math.min(Math.max(cap, 0), remaining);
//       if (take > 0) {
//         const se = await createSettle({ amount: take, groupId: gid });
//         created.push(se);
//         remaining -= take;
//         await settleScopeIfZero({ ...baseUnsettled, groupId: gid });
//       }
//       return take;
//     };

//     // Execution per type
//     if (type === 'all_personal') {
//       await applyPersonal(remaining);
//     } else if (type === 'group') {
//       if (!groupId) {
//         console.log('groupId required for type=group');

//         return res.status(400).json({ error: "groupId required for type=group" });
//       }
//       console.log(groupsCalc);



//       await applyGroup(asStr(groupId), gNeed);
//     } else if (type === 'all_groups') {
//       // Greedy across groups (largest need first)
//       groupsCalc.sort((a, b) => b.need - a.need);
//       for (const g of groupsCalc) {
//         if (remaining <= 0) break;
//         await applyGroup(g.groupId, g.need);
//       }
//     } else if (type === 'net') {
//       // First personal, then groups (individually)
//       await applyPersonal(remaining);
//       if (remaining > 0) {
//         groupsCalc.sort((a, b) => b.need - a.need);
//         for (const g of groupsCalc) {
//           if (remaining <= 0) break;
//           await applyGroup(g.groupId, g.need);
//         }
//       }
//     } else {
//       // default / custom / legacy:
//       // - if groupId present: treat as single-group settlement
//       // - else: treat as personal-only
//       if (groupId) {
//         await applyGroup(asStr(groupId), remaining);
//       } else {
//         await applyPersonal(remaining);
//       }
//     }

//     // Final: recompute “pair is zero” across the specific scopes we touched and respond
//     const scopesTouched = [];
//     if (created.length === 0) {
//       // Nothing applied (e.g., zero outstanding). Still return success with no created.
//       return res.status(201).json({
//         createdCount: 0,
//         remaining,
//         type: type || (groupId ? 'group' : 'all_personal'),
//         message: "No applicable outstanding to settle for this scope."
//       });
//     }

//     // (Optional) Expose a summary
//     res.status(201).json({
//       createdCount: created.length,
//       created: created.map(d => ({ _id: d._id, groupId: d.groupId || null, amount: d.amount })),
//       remaining,   // if user sent more than needed, leftover > 0
//       type: type || (groupId ? 'group' : 'all_personal')
//     });

//   } catch (err) {
//     console.error("Settle error:", err);
//     res.status(500).json({ error: 'Failed to settle amount' });
//   }
// });
// POST /v1/expenses/settle
router.post('/settle', auth, async (req, res) => {
    try {
        const {
            fromUserId,
            toUserId,
            amount,
            note,
            currency,
            type,       // 'group' | 'all_groups' | 'all_personal' | 'net'
            groupId,    // single gid (for type:'group')
            groupIds,   // array of gids OR map { gid: {from,to,amount,currency,...} }
            meta = {}   // may contain .groups (map) and .personal
        } = req.body;

        if (!fromUserId || !toUserId || !amount || !currency || !type) {
            return res.status(400).json({ error: "Missing required fields." });
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
            console.log(settleExpense);

            await settleExpense.save();
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
                    net[s.friendId] = (net[s.friendId] || 0) + delta;
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

            return res.status(201).json({ ok: true, type, count: results.length, items: results });

        } else if (type === 'net') {
            // NET = settle each group individually + settle the personal residue
            // groups can arrive in meta.groups OR groupIds (map)
            const groupMap = (meta?.groups && Object.keys(meta.groups).length)
                ? meta.groups
                : asMap(groupIds, {});

            // 1) groups
            for (const [gid, detail] of Object.entries(groupMap)) {
                if (!detail) continue; // if only id was passed without detail, skip (or look it up if you wish)
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

            return res.status(201).json({ ok: true, type, count: results.length, items: results });
        }

        // Fallback / unrecognized
        return res.status(400).json({ error: `Unknown settle type '${type}'.` });
    } catch (err) {
        console.error("Settle error:", err);
        res.status(500).json({ error: 'Failed to settle amount' });
    }
});

module.exports = router;