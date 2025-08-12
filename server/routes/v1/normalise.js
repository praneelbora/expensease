'use strict';

/** Safe number coercion with default. */
const toNumber = (v, def = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
};
const round2 = (n) => Math.round(toNumber(n) * 100) / 100;

/**
 * Normalise splits array to schema shape.
 * - resolves 'me' -> userId
 * - coerces booleans and numbers
 * - drops empty/noise rows
 */
function normaliseSplits(splits, userId) {
    if (!Array.isArray(splits)) return undefined;

    return splits
        .map((s) => ({
            payerType: s?.payerType === 'group' ? 'group' : 'user',
            friendId: s?.friendId === 'me' ? userId : s?.friendId,
            paying: !!s?.paying,
            owing: !!s?.owing,
            payAmount: toNumber(s?.payAmount, 0),
            oweAmount: toNumber(s?.oweAmount, 0),
            owePercent: toNumber(s?.owePercent, 0),
        }))
        .filter(
            (s) =>
                s.paying ||
                s.owing ||
                s.payAmount > 0 ||
                s.oweAmount > 0 ||
                s.owePercent > 0
        );
}

/**
 * Normalise funding array to schema shape.
 * - coerces amount
 * - routes ids by sourceType
 * - drops zero/invalid rows
 */
function normaliseFunding(funding) {
    if (!Array.isArray(funding)) return undefined;

    return funding
        .map((f) => {
            const sourceType = f?.sourceType === 'group' ? 'group' : 'user';
            return {
                sourceType,
                groupId: sourceType === 'group' ? f?.groupId : undefined,
                userId: sourceType === 'user' ? f?.userId : undefined,
                amount: toNumber(f?.amount, 0),
            };
        })
        .filter((f) => f.amount > 0);
}

/** Sum funding amounts (rounded to 2dp for comparisons). */
function sumFunding(list = []) {
    return list.reduce((a, b) => a + toNumber(b.amount, 0), 0);
}

/**
 * Validate funding total equals the expense amount (2dp).
 * Returns { ok, total, amount, message }
 */
function validateFundingAgainstAmount(fundingList, amount) {
    const total = sumFunding(fundingList);
    const ok = round2(total) === round2(amount);
    return {
        ok,
        total: round2(total),
        amount: round2(amount),
        message: ok ? null : 'Funding total must equal expense amount',
    };
}

module.exports = {
    // British spellings
    normaliseSplits,
    normaliseFunding,
    // Helpers
    sumFunding,
    validateFundingAgainstAmount,
    // American aliases (use whichever you prefer)
    normaliseSplits,
    normaliseFunding,
};
