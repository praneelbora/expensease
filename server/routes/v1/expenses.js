// routes/expenses.js  (updated with notifications)
const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const Group = require('../../models/Group');
const Expense = require('../../models/Expense');
const { awardCoinsForExpense } = require('../../services/coins');
const auth = require("../../middleware/auth");

const PaymentMethod = require('../../models/PaymentMethod');
const PaymentMethodTxn = require('../../models/PaymentMethodTransaction');
const notif = require('./notifs'); // single-file notif helper (ensure path is correct)

// -------- currency helpers (minor units) ----------
const CURRENCY_DECIMALS = {
    BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
    CLP: 0, ISK: 0, JPY: 0, KRW: 0, VND: 0
};
// -------- split normalizer (privacy + shape) ----------
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

/* -------------------------
   Notification templates
   ------------------------- */
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
  settlementCreated: ({ fromName, toName, amount, currency, expenseId, groupId=null }) => ({
    title: 'Payment recorded',
    body: `${fromName} settled ${amount} ${currency} with ${toName}`,
    data: { type: 'settlement_created', expenseId: String(expenseId), groupId: groupId ? String(groupId) : null, amount, currency, fromName, toName }
  })
};

/* -------------------------
   Helpers to collect recipients
   ------------------------- */

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

/* -------------------------
   ROUTES (with notifications)
   ------------------------- */

// ------------- CREATE EXPENSE -------------
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
        } = req.body;

        if (amount == null || Number.isNaN(Number(amount))) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        await assertGroup(groupId);

        const me = await User.findById(req.user.id).select('defaultCurrency preferredCurrencies name');
        if (!me) return res.status(401).json({ error: 'Unauthorized' });

        const usedCurrency = pickCurrency(currency, me.defaultCurrency || 'INR');
        const splitsN = normaliseSplits(splits, req.user.id);
        // light consistency checks for split
        if (mode === 'split') {
            const paySum = Number(splitsN.filter(s => s.paying).reduce((n, s) => n + (Number(s.payAmount) || 0), 0).toFixed(2));
            const oweSum = Number(splitsN.filter(s => s.owing).reduce((n, s) => n + (Number(s.oweAmount) || 0), 0).toFixed(2));
            const total = Number(Number(amount).toFixed(2));

            if (paySum !== total) {
                return res.status(400).json({ error: `Sum of payAmounts (${paySum}) must equal amount (${total}).` });
            }
            if (splitMode === 'value' && oweSum !== total) {
                return res.status(400).json({ error: `Sum of oweAmounts (${oweSum}) must equal amount (${total}) in 'value' mode.` });
            }
            if (splitMode === 'percent') {
                const pct = Number(splitsN.filter(s => s.owing).reduce((n, s) => n + (Number(s.owePercent) || 0), 0).toFixed(4));
                if (pct !== 100) {
                    return res.status(400).json({ error: `Sum of owePercent must be 100.` });
                }
            }
        }

        for (const s of splitsN) {
            if (s.paying && s.paidFromPaymentMethodId) {
                // Validate the PM belongs to the payer (not just creator)
                const pmOwnerId = s.friendId;
                const pm = await loadAndValidatePM({
                    pmId: s.paidFromPaymentMethodId,
                    userId: pmOwnerId,           // <-- Validate for payer!
                    need: 'send',
                    currency: usedCurrency
                });
                if (!pm) return res.status(400).json({ error: `Invalid payment account for payer ${pmOwnerId}` });
                // Optionally overwrite/standardize the method in splitsN
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

        // top-level PMs (personal charge / receive-to)
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
                // optional backend fallback to default send (safe; remove if you don’t want it)
                const fallback = await pickDefaultSendPM(req.user.id);
                if (fallback) {
                    // currency support check for fallback
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

        // persist + side effects inside a transaction
        await session.withTransaction(async () => {
            await expenseDoc.save({ session });

            // Journal debits for creator’s own charges
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
                            pm: await PaymentMethod.findById(s.paidFromPaymentMethodId),   // Already validated above
                            userId: s.friendId,      // The payer’s user
                            currency: usedCurrency,
                            amountMajor: s.payAmount,
                            related: { type: 'expense', id: String(expenseDoc._id), note: 'split expense (share paid)' }
                        });
                    }
                }
            }


            // bump user currency prefs like you already do
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

        // Build recipients & template depending on mode / group presence
        (async () => {
          try {
            const actor = me || await User.findById(req.user.id).select('name').lean();
            const actorName = actor?.name || 'Someone';

            // recipients: splits participants
            let recips = recipientsFromSplits(populated.splits);

            // if groupId present, also include group members (avoid spam by deduping)
            if (populated.groupId) {
              try {
                const gm = await groupMemberIds(populated.groupId);
                gm.forEach(id => recips.push(id));
              } catch (e) {
                // ignore group fetch errors; still proceed with splits recipients
              }
            }

            recips = filterOutActor(recips, req.user.id);

            if (recips.length === 0) {
              // for personal mode you may want to notify the payer/receiver; default: do nothing
              // if you want to notify creator for personal mode, uncomment:
              // recips = [String(req.user.id)];
            }

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

router.get('/group/:id', auth, async (req, res) => {
    try {
        const groupId = req.params.id;
        if (!groupId)
            return res.status(404).json({ error: 'Group not found' });
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
            .populate('splits.paidFromPaymentMethodId', '_id label')
            .populate('auditLog.updatedBy', 'name email')
            .populate('groupId', 'name')
            .populate('paidFromPaymentMethodId');

        res.json({ expenses, id: req.user.id });
    } catch (error) {
        console.error('Error fetching expenses:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

router.post('/settle', auth, async (req, res) => {
    try {
        const { fromUserId, toUserId, amount, note, groupId, groupIds, currency, type } = req.body;

        if (!fromUserId || !toUserId || !amount) {
            return res.status(400).json({ error: "Missing required fields." });
        }

        // 1. Create the settlement expense
        const settleExpense = new Expense({
            createdBy: fromUserId,
            description: note || `Settled ${currency} ${amount}`,
            amount,
            typeOf: 'settle',
            splitMode: 'value',
            currency,
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

        let relatedExpenses = [];
        let net = {}
        if (groupId) {
            relatedExpenses = await Expense.find({
                groupId,
                currency,
                $or: [
                    { settled: false },
                    { settled: { $exists: false } }
                ]
            });
        } else {
            relatedExpenses = await Expense.find({
                groupId: null,
                currency,
                $or: [
                    { settled: false },
                    { settled: { $exists: false } }
                ],
                'splits.friendId': { $all: [fromUserId, toUserId] },  // must contain both
                $expr: { $eq: [{ $size: "$splits" }, 2] }             // exactly 2 splits
            });
        }
        for (const exp of relatedExpenses) {
            if (exp.typeOf === 'loan') continue; // skip loans
            if (exp.currency !== currency) continue;
            for (const split of exp.splits) {
                const owe = Number(split.oweAmount) || 0;
                const pay = Number(split.payAmount) || 0;
                const delta = (split.owing ? owe : 0) - (split.paying ? pay : 0);
                net[split.friendId] = (net[split.friendId] || 0) + delta;

            }
        }
        const allZero = Object.values(net).every(v => Math.abs(v) < 0.01);
        if (allZero) {
            await Expense.updateMany(
                { _id: { $in: relatedExpenses.map(e => e._id) } },
                { $set: { settled: true, settledAt: new Date() } }
            );
        }
        (async () => {
          try {
            const fromUser = await User.findById(fromUserId).select('name').lean();
            const toUser = await User.findById(toUserId).select('name').lean();
            const title = 'Payment recorded';
            const msg = `${fromUser?.name || 'Someone'} settled ${amount} ${currency} with ${toUser?.name || 'someone'}.`;
            const data = { type: 'settlement', expenseId: String(settleExpense._id), groupId: groupId || null, amount, currency };
            const category = groupId ? 'group_settlement' : 'friend_settlement';
            const opts = { channel: 'push', fromFriendId: String(fromUserId), groupId: groupId ? String(groupId) : null };

            await notif.sendToUsers([String(fromUserId), String(toUserId)], title, msg, data, category, opts);
          } catch (e) {
            console.error('Settle notification failed:', e);
          }
        })();
        res.status(201).json({ settleExpense, allSettled: allZero });
    } catch (err) {
        console.error("Settle error:", err);
        res.status(500).json({ error: 'Failed to settle amount' });
    }
});

router.delete("/:id", auth, async (req, res) => {
    const { id } = req.params;
    const session = await mongoose.startSession();

    try {
        const expense = await Expense.findById(id).lean();
        if (!expense) return res.status(404).json({ message: "Expense not found." });
        // if (String(expense.createdBy) !== String(req.user.id)) {
        //     return res.status(403).json({ message: "Not allowed." });
        // }

        await session.withTransaction(async () => {
            // 1) Reverse all journaled PM movements for this expense, if any
            const txns = await PaymentMethodTxn.find({
                "related.type": "expense",
                "related.id": String(id),
                userId: req.user.id,
            }).session(session);

            if (txns.length) {
                for (const t of txns) {
                    if (t.kind !== "debit" || !t.amount) continue; // only reverse debits
                    const cur = String(t.currency).toUpperCase();

                    // read current available
                    const pmDoc = await PaymentMethod.findOne(
                        { _id: t.paymentMethodId, userId: req.user.id },
                        { balances: 1 }
                    ).session(session);

                    if (!pmDoc) continue;
                    const prevAvail =
                        pmDoc?.balances?.get?.(cur)?.available ??
                        pmDoc?.balances?.[cur]?.available ??
                        0;
                    const nextAvail = prevAvail + Number(t.amount);

                    // write back balance
                    await PaymentMethod.updateOne(
                        { _id: t.paymentMethodId, userId: req.user.id },
                        {
                            $set: {
                                [`balances.${cur}.available`]: nextAvail,
                            },
                            $inc: { usageCount: -1 },
                        },
                        { session }
                    );

                    // journal reversal
                    await PaymentMethodTxn.create(
                        [
                            {
                                paymentMethodId: t.paymentMethodId,
                                userId: req.user.id,
                                currency: cur,
                                amount: Number(t.amount), // credit back same (your ledger uses +amount with kind flag)
                                kind: "credit",
                                balanceAfter: nextAvail,
                                related: {
                                    type: "expense-reversal",
                                    id: String(id),
                                    note: "expense deleted",
                                    reversalOf: String(t._id),
                                },
                            },
                        ],
                        { session }
                    );
                }
            } else {
                // 2) Fallback for legacy rows without txns:
                // Reverse based on expense fields you debited during creation.
                const cur = String(expense.currency || "INR").toUpperCase();

                // personal: full amount from top-level PM
                if (expense.mode === "personal" && expense.paidFromPaymentMethodId) {
                    await creditBackPM({
                        pmId: expense.paidFromPaymentMethodId,
                        userId: req.user.id,
                        currency: cur,
                        amount: Number(expense.amount), // same unit you used when debiting
                        session,
                        related: { type: "expense-reversal", id: String(id), note: "expense deleted (personal)" },
                    });
                }

                // split: only creator's payer share (if PM was set)
                if (expense.mode === "split" && Array.isArray(expense.splits)) {
                    const myPay = expense.splits.find(
                        (s) => s.paying && String(s.friendId) === String(req.user.id) && s.paidFromPaymentMethodId
                    );
                    if (myPay) {
                        await creditBackPM({
                            pmId: myPay.paidFromPaymentMethodId,
                            userId: req.user.id,
                            currency: cur,
                            amount: Number(myPay.payAmount),
                            session,
                            related: { type: "expense-reversal", id: String(id), note: "expense deleted (split share)" },
                        });
                    }
                }
            }

            // 3) Finally delete the expense
            await Expense.deleteOne({ _id: id }).session(session);

            // Notify affected users about deletion (best-effort)
            (async () => {
              try {
                const affected = new Set();
                if (expense.createdBy) affected.add(String(expense.createdBy));
                if (Array.isArray(expense.splits)) {
                  expense.splits.forEach(s => { if (s && s.friendId) affected.add(String(s.friendId)); });
                }
                // if group => also include group members (optional) -- here we include group members
                if (expense.groupId) {
                  try {
                    const gm = await groupMemberIds(expense.groupId);
                    gm.forEach(id => affected.add(id));
                  } catch (e) {}
                }

                // don't notify the actor who performed deletion
                affected.delete(String(req.user.id));

                if (affected.size) {
                  // fetch actor name
                  const actor = await User.findById(req.user.id).select('name').lean();
                  const actorName = actor?.name || 'Someone';
                  let payload;
                  let category;
                  if (expense.groupId) {
                    category = 'group_expense';
                    const groupDoc = await Group.findById(expense.groupId).select('name').lean();
                    payload = templates.groupExpenseDeleted({
                      actorName,
                      expenseId: expense._id,
                      groupId: expense.groupId,
                      groupName: groupDoc?.name || 'Group',
                      shortDesc: expense.description
                    });
                  } else if (expense.mode === 'split') {
                    category = 'split_expense';
                    payload = templates.splitExpenseDeleted({
                      actorName,
                      expenseId: expense._id,
                      shortDesc: expense.description
                    });
                  } else {
                    category = 'personal_expense_summaries';
                    payload = {
                      title: 'Expense deleted',
                      body: `${actorName} deleted an expense${expense.description ? ` — ${expense.description}` : ''}`,
                      data: { type: 'expense_deleted', expenseId: String(expense._id), groupId: expense.groupId ? String(expense.groupId) : null, actorName }
                    };
                  }

                  const opts = { channel: 'push', fromFriendId: String(req.user.id), groupId: expense.groupId ? String(expense.groupId) : null };
                  await notif.sendToUsers(Array.from(affected), payload.title, payload.body, payload.data, category, opts);
                }
              } catch (e) {
                console.error('Delete notification failed:', e);
              }
            })();
        });
        
        return res.status(200).json({ message: "Expense deleted & PM balances reversed." });
    } catch (error) {
        console.error("Delete error:", error);
        return res.status(500).json({ message: "Server error while deleting expense." });
    } finally {
        session.endSession();
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
            groupId,
            currency,
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

        const splitsN = normaliseSplits(splits, req.user.id);   // may be undefined (not sent)

        const usedCurrency = currency
        const amountNum = req.body.amount != null ? Number(req.body.amount) : expense.amount;
        if (Array.isArray(splitsN)) {
            for (const s of splitsN) {
                if (s.paying && s.paidFromPaymentMethodId) {
                    // Validate the PM belongs to the payer (not just creator)
                    const pmOwnerId = s.friendId;
                    const pm = await loadAndValidatePM({
                        pmId: s.paidFromPaymentMethodId,
                        userId: pmOwnerId,           // <-- Validate for payer!
                        need: 'send',
                        currency: usedCurrency
                    });
                    if (!pm) return res.status(400).json({ error: `Invalid payment account for payer ${pmOwnerId}` });
                    // Optionally overwrite/standardize the method in splitsN
                    s.paidFromPaymentMethodId = pm._id;
                }
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
        if (currency) expense.currency = currency;

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
            .populate('auditLog.updatedBy', 'name email')
            .lean();

        // Notify affected users (best-effort)
        (async () => {
          try {
            // find actor display name
            const actor = await User.findById(req.user.id).select('name').lean();
            const actorName = actor?.name || 'Someone';

            const recipsSet = new Set();

            if (updated.createdBy) recipsSet.add(String(updated.createdBy._id || updated.createdBy));
            if (Array.isArray(updated.splits)) {
              updated.splits.forEach(s => {
                if (s && s.friendId) recipsSet.add(String(s.friendId._id || s.friendId));
              });
            }
            // if group -> add group members optionally
            if (updated.groupId) {
              try {
                const gm = await groupMemberIds(updated.groupId);
                gm.forEach(id => recipsSet.add(id));
              } catch (e) {}
            }

            // don't notify actor
            recipsSet.delete(String(req.user.id));
            const recips = Array.from(recipsSet);

            if (recips.length) {
              let payload;
              let category;
              if (updated.groupId) {
                category = 'group_expense';
                const groupDoc = await Group.findById(updated.groupId).select('name').lean();
                payload = templates.groupExpenseEdited({
                  actorName,
                  expenseId: updated._id,
                  groupId: updated.groupId,
                  groupName: groupDoc?.name || 'Group',
                  shortDesc: updated.description
                });
              } else if (updated.mode === 'split') {
                category = 'split_expense';
                payload = templates.splitExpenseEdited({
                  actorName,
                  expenseId: updated._id,
                  shortDesc: updated.description,
                  amount: updated.amount,
                  currency: updated.currency
                });
              } else {
                category = 'personal_expense_summaries';
                payload = {
                  title: 'Expense updated',
                  body: `${actorName} updated an expense${updated.description ? ` — ${updated.description}` : ''}`,
                  data: { type: 'expense_updated', expenseId: String(updated._id), groupId: updated.groupId ? String(updated.groupId) : null, actorName }
                };
              }

              const opts = { channel: 'push', fromFriendId: String(req.user.id), groupId: updated.groupId ? String(updated.groupId) : null };
              await notif.sendToUsers(recips, payload.title, payload.body, payload.data, category, opts);
            }
          } catch (e) {
            console.error('Update notification failed:', e);
          }
        })();

        res.json(updated);
    } catch (err) {
        console.error('Update expense failed:', err);
        res.status(500).json({ error: 'Failed to update expense' });
    }
});


module.exports = router;
