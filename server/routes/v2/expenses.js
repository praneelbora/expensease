// routes/settleAndFriend.js  (updated: name-based, step-by-step logs)
const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const Expense = require('../../models/Expense');
const User = require('../../models/User');
const Group = require('../../models/Group');
const Receipt = require('../../models/Receipt');
const PaymentMethod = require('../../models/PaymentMethod');
const PaymentMethodTxn = require('../../models/PaymentMethodTransaction');
const auth = require("../../middleware/auth");
const notif = require('../v1/notifs'); // <-- single-file notif helper (sendToUsers, pushNotifications, etc.)

// DEBUG flag
const DEBUG_SERVER = true;

// small helpers for nicer logging
const log = (...args) => { if (DEBUG_SERVER) console.log('[SETTLE-FRIEND]', ...args); };
const logGroup = (title, fn) => {
    if (!DEBUG_SERVER) return;
    try {
        if (console.groupCollapsed) console.groupCollapsed(`[SETTLE-FRIEND] ${title}`);
        else console.log(`[SETTLE-FRIEND] ${title}`);
        fn();
    } finally {
        if (console.groupEnd) console.groupEnd();
    }
};
const prettyId = (v) => (v === undefined || v === null ? '(nil)' : String(v));
const nameOrId = (objOrId) => {
    if (!objOrId) return '(unknown)';
    if (typeof objOrId === 'string' || typeof objOrId === 'number') return String(objOrId);
    // populated doc with name
    return objOrId?.name || objOrId?.email || String(objOrId._id || objOrId);
};

/**
 * calculateDebt: same logic as before — build per-member per-currency net
 */
const calculateDebt = (groupExpenses, members) => {
    const totalDebt = {}; // memberId -> { [currency]: netAmount }

    // init
    members.forEach(m => { totalDebt[String(m._id)] = {}; });

    groupExpenses.forEach(exp => {
        const code = exp.currency || "INR";
        (exp.splits || []).forEach(split => {
            const memberId = String(split.friendId?._id || split.friendId);
            const curMap = totalDebt[memberId] || (totalDebt[memberId] = {});
            if (curMap[code] == null) curMap[code] = 0;

            const payAmount = Number(split.payAmount || 0) || 0;
            const oweAmount = Number(split.oweAmount || 0) || 0;

            if (payAmount > 0) curMap[code] += payAmount; // paid → is owed
            if (oweAmount > 0) curMap[code] -= oweAmount; // owes → negative
        });
    });
    return totalDebt;
};
const normaliseSplits = (raw = [], meId) => {
    return (raw || []).map((s) => ({
        payerType: s.payerType || 'user',
        friendId: String(s.friendId) === 'me' ? meId : s.friendId,
        owing: !!s.owing,
        paying: !!s.paying,
        oweAmount: Number(s.oweAmount) || 0,
        owePercent: Number(s.owePercent) || 0,
        payAmount: Number(s.payAmount) || 0,
        // accept either name but persist as paidFromPaymentMethodId
        paidFromPaymentMethodId: s.paidFromPaymentMethodId || s.paymentMethodId || undefined,
    }));
};

// -------- validations ----------
const assertGroup = async (groupId) => {
    if (!groupId) return;
    const g = await Group.findById(groupId);
    if (!g) throw { status: 400, message: 'Invalid groupId' };
};

const pickCurrency = (v, fallback) => {
    if (typeof v !== 'string') return (fallback || 'INR');
    const up = v.toUpperCase().trim();
    return /^[A-Z]{3}$/.test(up) ? up : (fallback || 'INR');
};

// make sure PM exists, belongs to user, supports send/receive + currency
const loadAndValidatePM = async ({ pmId, userId, need = 'send', currency }) => {
    if (!pmId) return null;
    const pm = await PaymentMethod.findOne({ _id: pmId, userId });
    if (!pm) throw { status: 400, message: 'Invalid paymentMethod Id' };

    return pm;
};

// update balances (minor units) + create txn (simple, no model methods)
const applyPMDebit = async ({ pm, userId, currency, amountMajor, related, session }) => {
    const cur = String(currency || 'INR').toUpperCase();
    // read current available (minor)
    const prev = (pm.balances?.get?.(cur)?.available) ?? (pm.balances?.[cur]?.available) ?? 0;
    const deltaMinor = amountMajor;
    const next = prev - deltaMinor;

    // write back new balance + bump usage
    await PaymentMethod.updateOne(
        { _id: pm._id, userId },
        {
            // ensure subdoc exists when first writing this currency
            $set: {
                [`balances.${cur}.available`]: next,
                [`balances.${cur}.pending`]: prev,
            },
            $inc: { usageCount: 1 },
        },
        { session }
    );

    // journal the movement
    await PaymentMethodTxn.create([{
        paymentMethodId: pm._id,
        userId,
        currency: cur,
        amount: deltaMinor,    // negative = debit
        kind: 'debit',
        balanceAfter: next,
        related,               // { type: 'expense', id, note }
    }], { session });

    return next;
};

// optional: fallback pick default send if personal missing pmId
const pickDefaultSendPM = async (userId) => {
    const send = await PaymentMethod.findOne({ userId, isDefaultSend: true }).sort({ createdAt: -1 });
    if (send) return send;
    const recv = await PaymentMethod.findOne({ userId, isDefaultReceive: true }).sort({ createdAt: -1 });
    if (recv) return recv;
    return PaymentMethod.findOne({ userId }).sort({ isDefaultSend: -1, isDefaultReceive: -1, usageCount: -1, createdAt: -1 });
};

async function creditBackPM({ pmId, userId, currency, amount, session, related }) {
    const cur = String(currency).toUpperCase();
    const pmDoc = await PaymentMethod.findOne(
        { _id: pmId, userId },
        { balances: 1 }
    ).session(session);
    if (!pmDoc) return;

    const prevAvail =
        pmDoc?.balances?.get?.(cur)?.available ??
        pmDoc?.balances?.[cur]?.available ??
        0;
    const nextAvail = prevAvail + Number(amount);

    await PaymentMethod.updateOne(
        { _id: pmId, userId },
        {
            $set: { [`balances.${cur}.available`]: nextAvail },
            $inc: { usageCount: -1 },
        },
        { session }
    );

    await PaymentMethodTxn.create(
        [
            {
                paymentMethodId: pmId,
                userId,
                currency: cur,
                amount: Number(amount),
                kind: "credit",
                balanceAfter: nextAvail,
                related,
            },
        ],
        { session }
    );
}

/**
 * simplifyDebts: unchanged but will log results when used
 */
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

        const owe = []; // members who owe (amount positive = they owe)
        const owed = []; // members who are owed (amount positive = they are owed)

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

/**
 * computeDirectPairNetForGroup:
 * For groups that disabled simplification, compute direct per-group pairwise net between the two users.
 * Produces transactions in {from,to,amount,currency} format.
 *
 * Uses names from populated splits.friendId?.name if available.
 */
function computeDirectPairNetForGroup(groupExpenses = [], userId, friendId) {
    const totals = {}; // currency -> running friendNet (positive => friend is owed overall for that currency)

    logGroup(`computeDirectPairNetForGroup (user=${userId}, friend=${friendId})`, () => {
        log(`expenses: ${groupExpenses.length}`);
        for (const exp of groupExpenses || []) {
            const code = exp.currency || "INR";
            const splits = Array.isArray(exp.splits) ? exp.splits : [];

            // Build map of split details keyed by participant id
            const byId = {};
            for (const s of splits) {
                const sid = String(s.friendId?._id || s.friendId || '');
                byId[sid] = s;
            }

            const userSplit = byId[String(userId)];
            const friendSplit = byId[String(friendId)];

            // only consider expenses where both user & friend are present
            if (!userSplit || !friendSplit) {
                log(`skip expense ${prettyId(exp._id || exp.id)}: both participants not present`);
                continue;
            }

            // Evaluate who paid and who owed in this expense
            const youPay = !!userSplit.paying;
            const friendPay = !!friendSplit.paying;
            const youOwe = !!userSplit.owing;
            const friendOwe = !!friendSplit.owing;

            const oneIsPaying = youPay || friendPay;
            const otherIsOwing = (youPay && friendOwe) || (friendPay && youOwe);

            if (!oneIsPaying || !otherIsOwing) {
                // Not a direct bilateral (one pays and the other owes)
                log(`skip expense ${prettyId(exp._id || exp.id)}: not a direct bilateral (youPay=${youPay}, friendPay=${friendPay}, youOwe=${youOwe}, friendOwe=${friendOwe})`);
                continue;
            }

            // Compute friend-side delta for this expense:
            // friendDelta = (friend.owing ? friend.oweAmount : 0) - (friend.paying ? friend.payAmount : 0)
            const fAdd = friendSplit.owing ? Number(friendSplit.oweAmount || 0) : 0;
            const fSub = friendSplit.paying ? Number(friendSplit.payAmount || 0) : 0;
            const friendDelta = fAdd - fSub; // positive => friend is owed on this expense

            // Friendly names where available
            const expName = exp.description || exp.title || `expense:${prettyId(exp._id || exp.id)}`;
            const userName = nameOrId(userSplit.friendId || userSplit.friend || userId);
            const friendName = nameOrId(friendSplit.friendId || friendSplit.friend || friendId);

            log(`expense ${prettyId(exp._id || exp.id)} (${expName}) [${code}]`);
            log(`  participants: you=${userName} (paying=${youPay}, owing=${youOwe}), friend=${friendName} (paying=${friendPay}, owing=${friendOwe})`);
            log(`  friendDelta = add(${fAdd}) - sub(${fSub}) = ${friendDelta}`);

            totals[code] = (totals[code] || 0) + friendDelta;
            log(`  running totals[${code}] = ${totals[code]}`);
        }
    });

    // Convert totals -> transactions (from,to,amount)
    const tx = [];
    for (const [code, rawAmt] of Object.entries(totals)) {
        // rounding: use 2 decimals here; if you need currency-specific digits we can adjust
        const rounded = Math.round((Number(rawAmt) + Number.EPSILON) * 100) / 100;
        if (!rounded) continue;
        if (rounded > 0) {
            // friend is owed -> friend -> user (friend should receive)
            tx.push({
                from: String(friendId),
                to: String(userId),
                amount: rounded,
                currency: code,
            });
        } else if (rounded < 0) {
            // user owes friend
            tx.push({
                from: String(userId),
                to: String(friendId),
                amount: Math.abs(rounded),
                currency: code,
            });
        }
    }

    // print final tx with names if we can
    if (DEBUG_SERVER && tx.length) {
        logGroup('computeDirectPairNetForGroup -> final txs', () => {
            for (const t of tx) {
                log(`  ${t.from} -> ${t.to} : ${t.amount} ${t.currency}`);
            }
        });
    }

    return tx;
}

// Return array of userId strings deduped
const recipientsFromSplits = (splits = []) => {
    const s = new Set();
    (splits || []).forEach(p => {
        if (!p) return;
        const fid = String(p.friendId?._id || p.friendId);
        if (fid) s.add(fid);
    });
    return Array.from(s);
};

// If groupId present, fetch group members (returns array of ids)
const groupMemberIds = async (groupId) => {
    if (!groupId) return [];
    const g = await Group.findById(groupId).select('members').lean();
    if (!g || !Array.isArray(g.members)) return [];
    return g.members.map(m => String(m));
};

// remove actorId from recipients and dedupe
const filterOutActor = (recips = [], actorId) => {
    const s = new Set(recips || []);
    s.delete(String(actorId));
    return Array.from(s);
};
// Keep titles short and bodies concise. data should be stable for client routing.
const templates = {
    splitExpenseCreated: ({ actorName, amount, currency, expenseId, groupId }) => ({
        title: 'New split added',
        body: `${actorName} added a split — ${amount} ${currency}`,
        data: { type: 'expense_split_created', expenseId: String(expenseId), groupId: groupId ? String(groupId) : null, amount, currency, actorName }
    }),
    splitExpenseEdited: ({ actorName, expenseId, shortDesc, amount, currency, groupId }) => ({
        title: 'Split updated',
        body: `${actorName} updated: ${shortDesc || `${amount} ${currency}`}`,
        data: { type: 'expense_split_updated', expenseId: String(expenseId), groupId: groupId ? String(groupId) : null, amount, currency, actorName }
    }),
    splitExpenseDeleted: ({ actorName, expenseId, shortDesc, groupId }) => ({
        title: 'Split removed',
        body: `${actorName} removed a split${shortDesc ? ` — ${shortDesc}` : ''}`,
        data: { type: 'expense_split_deleted', expenseId: String(expenseId), groupId: groupId ? String(groupId) : null, actorName }
    }),
    groupExpenseCreated: ({ actorName, amount, currency, expenseId, groupId, groupName }) => ({
        title: `${groupName}: new expense`,
        body: `${actorName} added ${amount} ${currency}`,
        data: { type: 'group_expense_created', expenseId: String(expenseId), groupId: String(groupId), groupName, amount, currency, actorName }
    }),
    groupExpenseEdited: ({ actorName, expenseId, groupId, groupName, shortDesc }) => ({
        title: `${groupName}: expense updated`,
        body: `${actorName} updated an expense${shortDesc ? ` — ${shortDesc}` : ''}`,
        data: { type: 'group_expense_updated', expenseId: String(expenseId), groupId: String(groupId), groupName, actorName }
    }),
    groupExpenseDeleted: ({ actorName, expenseId, groupId, groupName, shortDesc }) => ({
        title: `${groupName}: expense removed`,
        body: `${actorName} deleted an expense${shortDesc ? ` — ${shortDesc}` : ''}`,
        data: { type: 'group_expense_deleted', expenseId: String(expenseId), groupId: String(groupId), groupName, actorName }
    }),
    settlementCreated: ({ fromName, toName, amount, currency, expenseId, groupId = null }) => ({
        title: 'Payment recorded',
        body: `${fromName} settled ${amount} ${currency} with ${toName}`,
        data: { type: 'settlement_created', expenseId: String(expenseId), groupId: groupId ? String(groupId) : null, amount, currency, fromName, toName }
    })
};


/* ---------------- ROUTES ---------------- */

router.get('/friend/:friendId', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const friendId = req.params.friendId;

        // Step 1: Non-group expenses (direct)
        const nonGroupExpenses = await Expense.find({
            'splits.friendId': { $all: [userId, friendId] },
            $or: [{ groupId: { $exists: false } }, { groupId: null }]
        })
            .populate('splits.friendId', '_id name email')
            .populate('createdBy', 'name email')
            .populate('splits.paidFromPaymentMethodId', '_id label')
            .populate('auditLog.updatedBy', 'name email')
            .populate('paidFromPaymentMethodId');

        // Step 2: Group expenses (populate group settings so we can check simplifyDebts)
        // const groupExpenses = await Expense.find({
        //     'splits.friendId': { $in: [userId, friendId] },
        //     groupId: { $exists: true, $ne: null }
        // })
        //     .populate('splits.friendId', '_id name email')
        //     .populate('createdBy', 'name email')
        //     .populate('splits.paidFromPaymentMethodId', '_id label')
        //     .populate('auditLog.updatedBy', 'name email')
        //     .populate('groupId', 'name settings')
        //     .populate('paidFromPaymentMethodId');

        // // Step 3: Group them
        // const groupedByGroup = groupExpenses.reduce((acc, exp) => {
        //     const gid = exp.groupId?._id?.toString();
        //     if (!gid) return acc;
        //     if (!acc[gid]) acc[gid] = { group: exp.groupId, members: [], expenses: [] };
        //     acc[gid].expenses.push(exp);
        //     // collect members (populated objects available)
        //     (exp.splits || []).forEach(s => {
        //         const id = String(s.friendId?._id || s.friendId);
        //         if (!acc[gid].members.find(m => String(m?._id) === id)) {
        //             acc[gid].members.push(s.friendId);
        //         }
        //     });
        //     return acc;
        // }, {});

        const simplifiedTransactions = [];

        // Step 4: For each group, compute either simplified or direct-pair
        // for (const gid in groupedByGroup) {
        //     const { group, members, expenses } = groupedByGroup[gid];
        //     const gName = group?.name || `(group ${gid})`;
        //     const simplifyFlag = !(group?.settings && group.settings.simplifyDebts === false);

        //     logGroup(`Group ${gName} (${gid}) — simplifyDebts=${simplifyFlag}`, () => {
        //         log(`members: ${members.map(m => nameOrId(m)).join(', ')}`);
        //         log(`expenses count: ${expenses.length}`);
        //     });

        //     let simplified = [];
        //     try {
        //         if (!simplifyFlag) {
        //             log(`Group ${gName} has simplifyDebts=false → using direct pair computation.`);
        //             simplified = computeDirectPairNetForGroup(expenses, userId, friendId);
        //         } else {
        //             log(`Group ${gName} will run simplifyDebts (full group simplification).`);
        //             const totalDebt = calculateDebt(expenses, members);
        //             if (DEBUG_SERVER) logGroup(`totalDebt (group ${gName})`, () => { log(JSON.stringify(totalDebt)); });
        //             simplified = simplifyDebts(totalDebt, members);
        //             if (DEBUG_SERVER) log(`simplified transactions (count=${simplified.length})`);
        //         }
        //     } catch (err) {
        //         console.error(`Error while simplifying group ${gName}:`, err);
        //         simplified = [];
        //     }

        //     // keep only tx between user & friend
        //     const directTx = simplified.filter(tx =>
        //         (String(tx.from) === String(userId) && String(tx.to) === String(friendId)) ||
        //         (String(tx.from) === String(friendId) && String(tx.to) === String(userId))
        //     );

        //     // attach group info and push
        //     if (directTx.length > 0) {
        //         for (const tx of directTx) {
        //             const txWithGroup = {
        //                 ...tx,
        //                 group: { _id: group._id, name: group.name || gName }
        //             };
        //             // log each tx with names (attempt to look up names from members list)
        //             if (DEBUG_SERVER) {
        //                 const fromName = members.find(m => String(m._id) === String(tx.from))?.name || tx.from;
        //                 const toName = members.find(m => String(m._id) === String(tx.to))?.name || tx.to;
        //                 log(`groupTx: ${fromName} (${tx.from}) -> ${toName} (${tx.to}) : ${tx.amount} ${tx.currency} [group=${gName}]`);
        //             }
        //             simplifiedTransactions.push(txWithGroup);
        //         }
        //     } else {
        //         if (DEBUG_SERVER) log(`no direct user<->friend transactions for group ${gName}`);
        //     }
        // }

        // Step 5: Respond
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
                'splits.friendId': { $all: [userId, friend?._id] },
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
                'splits.friendId': { $in: [userId, friend?._id] },
                groupId: { $exists: true, $ne: null },
            })
                .populate('splits.friendId', '_id name email')
                .populate('createdBy', 'name email')
                .populate('splits.paidFromPaymentMethodId', '_id label')
                .populate('auditLog.updatedBy', 'name email')
                .populate('groupId', 'name settings')
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
                const gName = group?.name || `(group ${gid})`;
                const simplifyFlag = !(group?.settings && group.settings.simplifyDebts === false);

                log(`processing friend=${nameOrId(friend)} group=${gName} simplify=${simplifyFlag}`);

                let simplified = [];
                try {
                    if (!simplifyFlag) {
                        simplified = computeDirectPairNetForGroup(expenses, userId, friend?._id);
                    } else {
                        const totalDebt = calculateDebt(expenses, members);
                        simplified = simplifyDebts(totalDebt, members);
                    }
                } catch (err) {
                    console.error(`Error simplifying debts for group ${gName}:`, err);
                    simplified = [];
                }

                // keep only this user <-> current friend
                const direct = simplified.filter(
                    (tx) =>
                        (String(tx.from) === String(userId) && String(tx.to) === String(friend?._id)) ||
                        (String(tx.from) === String(friend?._id) && String(tx.to) === String(userId))
                );

                direct.forEach((tx) => {
                    simplifiedTxs.push({ ...tx, group });
                    if (DEBUG_SERVER) {
                        log(`  -> friendTx: ${tx.from} -> ${tx.to} ${tx.amount} ${tx.currency} (group=${gName})`);
                    }
                });
            }

            result[friend?._id] = {
                expenses: nonGroupExpenses,
                simplifiedTransactions: simplifiedTxs,
            };

            if (DEBUG_SERVER) {
                log(`friend ${nameOrId(friend)} result: nonGroup=${nonGroupExpenses.length} simplifiedTx=${simplifiedTxs.length}`);
            }
        }
        return res.status(200).json(result);
    } catch (err) {
        console.error("Error in /friends/expenses:", err);
        res.status(500).json({ error: "Server error fetching friends expenses" });
    }
});

// POST /v2/expenses/settle
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

            // Notify (best-effort)
            (async () => {
                try {
                    const title = 'Payment recorded';
                    const msg = `A settlement of ${cur} ${amt} was recorded.`;
                    const data = { type: 'settlement', expenseId: String(settleExpense._id), groupId: gid || null, amount: amt, currency: cur };
                    const category = gid ? 'group_settlement' : 'friend_settlement';
                    const opts = { channel: 'push', fromFriendId: String(from), groupId: gid ? String(gid) : null };
                    await notif.sendToUsers([String(from), String(to)], title, msg, data, category, opts).catch(e => {
                        console.error('notif.sendToUsers failed (inside createSettleExpense):', e);
                    });
                } catch (e) {
                    console.error('createSettleExpense: notification error', e);
                }
            })();

            return settleExpense;
        };

        // Mark scope settled helper unchanged (keeps your behavior)
        const tryMarkScopeSettled = async ({ gid, cur, aId, bId }) => {
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

        const asMap = (maybeArrayOrMap, fallbackMap = {}) => {
            if (!maybeArrayOrMap) return fallbackMap;
            if (Array.isArray(maybeArrayOrMap)) {
                const m = {};
                for (const gid of maybeArrayOrMap) m[String(gid)] = null;
                return m;
            }
            return maybeArrayOrMap;
        };

        // Handlers per type (keeps your logic)
        const results = [];

        if (type === 'group') {
            if (!groupId) return res.status(400).json({ error: "groupId is required for type 'group'." });

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
            const mapFromBody = asMap(groupIds, {});
            const mapFromMeta = meta?.ids || meta?.groups || {};
            const groupMap = Object.keys(mapFromBody).length ? mapFromBody : mapFromMeta;

            if (!groupMap || !Object.keys(groupMap).length) {
                return res.status(400).json({ error: "No groupIds provided for 'all_groups'." });
            }

            for (const [gid, detail] of Object.entries(groupMap)) {
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
            const groupMap = (meta?.groups && Object.keys(meta.groups).length)
                ? meta.groups
                : asMap(groupIds, {});

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
            const items = Array.isArray(meta?.items) ? meta.items : [];

            if (items.length === 0) {
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
            return res.status(400).json({ error: `Unknown settle type '${type}'.` });
        }

    } catch (err) {
        console.error("Settle error:", err);
        res.status(500).json({ error: 'Failed to settle amount' });
    }
});

router.post('/', auth, async (req, res) => {
    const session = await mongoose.startSession();
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
            currency,
            paymentMethodId,                // top-level (personal) alias
            paidFromPaymentMethodId,        // top-level canonical name (personal)
            receivedToPaymentMethodId,      // optional receive-to (for loans/income)

            // Optional: receipt from the client — we'll ONLY read receipt.receiptId
            receipt,                        // { receiptId?: string, ...ignored }
        } = req.body;

        if (amount == null || Number.isNaN(Number(amount))) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        await assertGroup(groupId);

        const me = await User.findById(req.user.id).select('defaultCurrency preferredCurrencies name');
        if (!me) return res.status(401).json({ error: 'Unauthorized' });

        const usedCurrency = pickCurrency(currency, me.defaultCurrency || 'INR');
        const splitsN = normaliseSplits(splits, req.user.id);

        // Split validations (unchanged)
        if (mode === 'split') {
            const paySum = Number(
                splitsN.filter(s => s.paying).reduce((n, s) => n + (Number(s.payAmount) || 0), 0).toFixed(2)
            );
            const oweSum = Number(
                splitsN.filter(s => s.owing).reduce((n, s) => n + (Number(s.oweAmount) || 0), 0).toFixed(2)
            );
            const total = Number(Number(amount).toFixed(2));

            if (paySum !== total) {
                return res.status(400).json({ error: `Sum of payAmounts (${paySum}) must equal amount (${total}).` });
            }
            if (splitMode === 'value' && oweSum !== total) {
                return res.status(400).json({ error: `Sum of oweAmounts (${oweSum}) must equal amount (${total}) in 'value' mode.` });
            }
            if (splitMode === 'percent') {
                const pct = Number(
                    splitsN.filter(s => s.owing).reduce((n, s) => n + (Number(s.owePercent) || 0), 0).toFixed(4)
                );
                if (pct !== 100) {
                    return res.status(400).json({ error: `Sum of owePercent must be 100.` });
                }
            }
        }

        // Validate payer PMs in splits (unchanged)
        for (const s of splitsN) {
            if (s.paying && s.paidFromPaymentMethodId) {
                const pmOwnerId = s.friendId;
                const pm = await loadAndValidatePM({
                    pmId: s.paidFromPaymentMethodId,
                    userId: pmOwnerId,
                    need: 'send',
                    currency: usedCurrency
                });
                if (!pm) return res.status(400).json({ error: `Invalid payment account for payer ${pmOwnerId}` });
                s.paidFromPaymentMethodId = pm._id;
            }
        }

        // Prepare expense doc
        const expenseDoc = new Expense({
            createdBy: req.user.id,
            description,
            amount: Number(amount),
            category,
            mode,
            typeOf,
            splitMode: mode === 'split' ? splitMode : 'equal',
            date: date ? new Date(date) : undefined,
            splits: splitsN,
            currency: usedCurrency,
            ...(groupId && { groupId }),
        });

        // ---- ONLY SAVE receiptId IF PROVIDED (no creates/updates to Receipt) ----
        if (receipt && typeof receipt === 'object' && receipt.receiptId) {
            // Optional light check: looks like an ObjectId length
            // (Remove this if you don't want any checks)
            if (String(receipt.receiptId).length >= 12) {
                expenseDoc.receiptId = receipt.receiptId;
            }
        }
        // -----------------------------------------------------------------------

        // top-level PMs (personal) (unchanged)
        let topPayerPM = null;
        if (mode === 'personal') {
            const topPMId = paidFromPaymentMethodId || paymentMethodId;
            if (topPMId) {
                topPayerPM = await loadAndValidatePM({
                    pmId: topPMId,
                    userId: req.user.id,
                    need: 'send',
                    currency: usedCurrency
                });
                if (topPayerPM) expenseDoc.paidFromPaymentMethodId = topPayerPM._id;
            } else {
                const fallback = await pickDefaultSendPM(req.user.id);
                if (fallback) {
                    await loadAndValidatePM({ pmId: fallback._id, userId: req.user.id, need: 'send', currency: usedCurrency });
                    topPayerPM = fallback;
                    expenseDoc.paidFromPaymentMethodId = fallback._id;
                }
            }
        }

        if (receivedToPaymentMethodId) {
            const recvPM = await loadAndValidatePM({
                pmId: receivedToPaymentMethodId,
                userId: req.user.id,
                need: 'receive',
                currency: usedCurrency
            });
            if (recvPM) expenseDoc.receivedToPaymentMethodId = recvPM._id;
        }

        // Transaction (unchanged)
        await session.withTransaction(async () => {
            await expenseDoc.save({ session });

            if (mode === 'personal' && topPayerPM) {
                await applyPMDebit({
                    pm: topPayerPM,
                    userId: req.user.id,
                    currency: usedCurrency,
                    amountMajor: amount,
                    related: { type: 'expense', id: String(expenseDoc._id), note: 'personal expense' }
                });
            }

            if (mode === 'split') {
                for (const s of splitsN) {
                    if (s.paying && s.paidFromPaymentMethodId) {
                        await applyPMDebit({
                            pm: await PaymentMethod.findById(s.paidFromPaymentMethodId),
                            userId: s.friendId,
                            currency: usedCurrency,
                            amountMajor: s.payAmount,
                            related: { type: 'expense', id: String(expenseDoc._id), note: 'split expense (share paid)' }
                        });
                    }
                }
            }

            await User.updateOne(
                { _id: req.user.id },
                {
                    $inc: { [`preferredCurrencyUsage.${usedCurrency}`]: 1 },
                    $addToSet: { preferredCurrencies: usedCurrency },
                },
                { session }
            );
        });

        const populated = await Expense.findById(expenseDoc._id)
            .populate('createdBy', 'name email')
            .populate('splits.friendId', 'name email')
            .populate('auditLog.updatedBy', 'name email')
            .lean();

        // Notifications (unchanged)
        (async () => {
            try {
                const actor = me || await User.findById(req.user.id).select('name').lean();
                const actorName = actor?.name || 'Someone';

                let recips = recipientsFromSplits(populated.splits);

                if (populated.groupId) {
                    try {
                        const gm = await groupMemberIds(populated.groupId);
                        gm.forEach(id => recips.push(id));
                    } catch { }
                }

                recips = filterOutActor(recips, req.user.id);

                if (recips.length) {
                    let payload;
                    let category;
                    let opts = { channel: 'push', fromFriendId: String(req.user.id), groupId: populated.groupId ? String(populated.groupId) : null };

                    if (mode === 'split' && !populated.groupId) {
                        category = 'split_expense';
                        payload = templates.splitExpenseCreated({
                            actorName,
                            amount: populated.amount,
                            currency: populated.currency,
                            expenseId: populated._id,
                            groupId: null
                        });
                    } else if (populated.groupId) {
                        category = 'group_expense';
                        const groupDoc = await Group.findById(populated.groupId).select('name').lean();
                        payload = templates.groupExpenseCreated({
                            actorName,
                            amount: populated.amount,
                            currency: populated.currency,
                            expenseId: populated._id,
                            groupId: populated.groupId,
                            groupName: groupDoc?.name || 'Group'
                        });
                    } else {
                        category = 'personal_expense_summaries';
                        payload = {
                            title: 'New expense added',
                            body: `${actorName} added ${populated.amount} ${populated.currency}`,
                            data: { type: 'expense_created', expenseId: String(populated._id), groupId: null, amount: populated.amount, currency: populated.currency, actorName }
                        };
                    }

                    await notif.sendToUsers(recips, payload.title, payload.body, payload.data, category, opts);
                }
            } catch (e) {
                console.error('Expense notification failed:', e);
            }
        })();

        return res.status(201).json(populated);
    } catch (err) {
        console.error('Create expense error:', err);
        const status = err?.status || 500;
        return res.status(status).json({ error: err?.message || 'Failed to create expense' });
    } finally {
        session.endSession();
    }
});



module.exports = router;
