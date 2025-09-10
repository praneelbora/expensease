// services/coins.js
const mongoose = require('mongoose');
const User = require('../models/User'); // adjust path

// constants
const COIN_PER_EXPENSE = 0.2;
const MAX_DAILY_EXPENSES = 3;
const MAX_DAILY_COINS = COIN_PER_EXPENSE * MAX_DAILY_EXPENSES;

/**
 * Award coins to user for creating an expense.
 * - awards COIN_PER_EXPENSE per expense up to MAX_DAILY_COINS per UTC day.
 * - returns the amount actually awarded (0 if cap hit).
 *
 * This function uses a transaction to avoid races. If you don't want transactions,
 * you can adapt to optimistic find+update but transaction is safer.
 */
async function awardCoinsForExpense(userId) {
  if (!mongoose.connection.readyState) {
    // fallback: don't award if DB not ready
    return 0;
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // get today key in UTC (YYYY-MM-DD)
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const todayKey = `${yyyy}-${mm}-${dd}`;

    // load user doc for update
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return 0;
    }

    // ensure fields exist
    // We'll store two helper fields on the user doc:
    //  - user.coins (Number) — total coins
    //  - user.coinsEarnedDate (String, 'YYYY-MM-DD') — last-day when we tracked earned
    //  - user.coinsEarnedToday (Number) — amount earned on the coinsEarnedDate
    const earnedDate = user.coinsEarnedDate || null;
    const earnedToday = typeof user.coinsEarnedToday === 'number' ? user.coinsEarnedToday : 0;

    let currentEarnedToday = earnedDate === todayKey ? earnedToday : 0;
    const remainingForToday = Math.max(0, MAX_DAILY_COINS - currentEarnedToday);

    if (remainingForToday <= 0) {
      // nothing to award
      await session.commitTransaction();
      session.endSession();
      return 0;
    }

    // amount to award now
    const toAward = Math.min(COIN_PER_EXPENSE, remainingForToday);

    // apply update: increment coins and update coinsEarnedToday / coinsEarnedDate
    const update = {
      $inc: { coins: toAward },
      $set: { coinsEarnedDate: todayKey, coinsEarnedToday: currentEarnedToday + toAward },
    };

    await User.findByIdAndUpdate(userId, update, { session, new: true, runValidators: true });

    await session.commitTransaction();
    session.endSession();
    return toAward;
  } catch (err) {
    try {
      await session.abortTransaction();
      session.endSession();
    } catch (_) {}
    // rethrow for caller to log
    throw err;
  }
}

module.exports = {
  awardCoinsForExpense,
  COIN_PER_EXPENSE,
  MAX_DAILY_EXPENSES,
  MAX_DAILY_COINS,
};
