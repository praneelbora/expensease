// lib/notif.js
const { Expo } = require('expo-server-sdk');
const User = require('../../models/User'); // adjust path to models/User
const expo = new Expo({ useFcmV1: true });

// Control logging for notification flows:
// - If process.env.NOTIFICATION_LOGS is set to "true" or "false", that value is respected.
// - If NOTIFICATION_LOGS is unset, logging is enabled for non-production (NODE_ENV !== 'production') and disabled in production.
const ENABLE_NOTIF_LOGS = (() => {
    if (typeof process.env.NOTIFICATION_LOGS !== 'undefined') {
        return String(process.env.NOTIFICATION_LOGS).toLowerCase() === 'true';
    }
    return process.env.NODE_ENV !== 'production';
})();

const notifLog = {
    info: (...args) => { if (ENABLE_NOTIF_LOGS) console.info('[notif] ', ...args); },
    debug: (...args) => { if (ENABLE_NOTIF_LOGS) console.debug('[notif] ', ...args); },
    log: (...args) => { if (ENABLE_NOTIF_LOGS) console.log('[notif] ', ...args); },
    warn: (...args) => { if (ENABLE_NOTIF_LOGS) console.warn('[notif] ', ...args); },
    // errors always go through
    error: (...args) => { console.error('[notif][ERROR] ', ...args); },
};

function partitionExpoTokens(tokens = []) {
    const valid = [];
    const invalid = [];
    for (const t of tokens || []) {
        if (!t) continue;
        if (Expo.isExpoPushToken(t)) valid.push(t);
        else invalid.push(t);
    }
    return { validTokens: Array.from(new Set(valid)), invalidTokens: Array.from(new Set(invalid)) };
}

async function collectPushTokensForUsers(userIds = []) {
    if (!Array.isArray(userIds) || userIds.length === 0) return { tokens: [], tokenToUser: {} };

    const users = await User.find({ _id: { $in: userIds } })
        .select('pushTokens') // minimal
        .lean();

    const tokens = new Set();
    const tokenToUser = {};

    for (const u of users) {
        if (!u || !u.pushTokens) continue;
        for (const t of (u.pushTokens.ios || [])) {
            if (!t) continue;
            tokens.add(t);
            tokenToUser[t] = String(u._id);
        }
        for (const t of (u.pushTokens.android || [])) {
            if (!t) continue;
            tokens.add(t);
            tokenToUser[t] = String(u._id);
        }
    }

    const { validTokens } = partitionExpoTokens(Array.from(tokens));
    return { tokens: validTokens, tokenToUser };
}

async function pushNotifications(pushTokens = [], title = 'Jumbl', body = '', data = {}) {
    if (!Array.isArray(pushTokens) || pushTokens.length === 0) return { sentCount: 0, tickets: [], receipts: {} };

    const messages = [];
    for (const pushToken of pushTokens) {
        if (!Expo.isExpoPushToken(pushToken)) continue;
        messages.push({
            to: pushToken,
            sound: 'default',
            title: title || 'Jumbl',
            body: body || '',
            data: data || {},
        });
    }
    if (messages.length === 0) return { sentCount: 0, tickets: [], receipts: {} };

    const chunks = expo.chunkPushNotifications(messages);
    const allTickets = [];
    const tokenToTicket = {};

    try {
        for (const chunk of chunks) {
            const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            allTickets.push(...ticketChunk);
            // map ticket ids to tokens by matching order (best-effort)
            for (let i = 0; i < chunk.length; i++) {
                const msg = chunk[i];
                const ticket = ticketChunk[i];
                if (ticket && ticket.id) tokenToTicket[msg.to] = ticket.id;
            }
        }

        // receipts (best-effort)
        const receiptIds = Object.values(tokenToTicket).filter(Boolean);
        const receipts = {};
        if (receiptIds.length) {
            const receiptChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
            for (const c of receiptChunks) {
                const r = await expo.getPushNotificationReceiptsAsync(c);
                Object.assign(receipts, r);
            }
        }
        return { sentCount: allTickets.length, tickets: allTickets, receipts, tokenToTicket };
    } catch (err) {
        notifLog.error('Error sending push notifications:', err);
        throw err;
    }
}

/**
 * High-level sendToUsers with preference filtering
 * - userIds: Array of user ids to consider
 * - title/body/data: push content
 * - category: one of your notification categories strings (e.g., 'split_expense')
 * - opts: { channel: 'push'|'email'|'inapp', groupId, fromFriendId, cleanupInvalidTokens: boolean }
 */
async function sendToUsers(userIds = [], title = 'Jumbl', body = '', data = {}, category = null, opts = {}) {
    const channel = opts.channel || 'push';

    notifLog.info('[sendToUsers] start', {
        channel,
        userCount: Array.isArray(userIds) ? userIds.length : 0,
        title,
        category,
        cleanupInvalidTokens: opts.cleanupInvalidTokens !== false,
        extraOpts: Object.keys(opts).filter(k => !['channel', 'groupId', 'fromFriendId', 'cleanupInvalidTokens'].includes(k))
    });

    if (!Array.isArray(userIds) || userIds.length === 0) {
        notifLog.warn('[sendToUsers] no user IDs provided');
        return { sent: 0, reason: 'no_user_ids' };
    }

    try {
        // Fetch users with tokens + overrides + channel prefs in one query.
        const users = await User.find({ _id: { $in: userIds } })
            .select('pushTokens notificationPreferences friendNotificationOverrides groupNotificationOverrides')
            .lean();

        notifLog.info('[sendToUsers] users fetched', { requested: userIds.length, found: users.length });

        // Build list of tokens to actually notify after preference checks
        const tokensToSend = [];
        const tokenToUser = {};

        for (const u of users) {
            try {
                // DO NOT log raw token values. Small context only.
                notifLog.debug('pref-check', { userId: String(u._id), channel, category });

                const wants = User.shouldReceiveNotification(u, {
                    channel,
                    category,
                    groupId: opts.groupId,
                    fromFriendId: opts.fromFriendId
                });

                notifLog.debug('[sendToUsers] preference check', {
                    userId: String(u._id),
                    wants: !!wants
                });

                if (!wants) {
                    continue;
                }

                // collect tokens (do not log token values)
                const ios = u?.pushTokens?.ios || [];
                const android = u?.pushTokens?.android || [];

                for (const t of [...ios, ...android]) {
                    if (!t) continue;
                    if (!Expo.isExpoPushToken(t)) {
                        // invalid format token - log masked
                        notifLog.debug('[sendToUsers] skipping non-expo token', { userId: String(u._id) });
                        continue;
                    }
                    tokensToSend.push(t);
                    tokenToUser[t] = String(u._id);
                }
            } catch (innerErr) {
                notifLog.error('[sendToUsers] error evaluating preferences for user', String(u._id), innerErr);
                // continue to next user
            }
        }

        notifLog.info('[sendToUsers] tokens filtered', { tokensFound: tokensToSend.length });

        if (!tokensToSend.length) {
            notifLog.info('[sendToUsers] no tokens after filtering preferences');
            return { sent: 0, reason: 'no_tokens_after_filter' };
        }

        // Send — time the call
        const t0 = Date.now();
        const result = await pushNotifications(tokensToSend, title, body, data);
        const tookMs = Date.now() - t0;
        notifLog.info('[sendToUsers] pushNotifications result', {
            tookMs,
            sentCount: result.sentCount || 0,
            ticketsCount: Array.isArray(result.tickets) ? result.tickets.length : undefined,
            receiptsCount: result.receipts ? Object.keys(result.receipts).length : undefined
        });

        // Optionally cleanup invalid tokens (best-effort)
        if (opts.cleanupInvalidTokens !== false) {
            try {
                const tokensWithErrors = [];

                // ticket-level immediate errors
                if (Array.isArray(result.tickets)) {
                    for (let i = 0; i < result.tickets.length; i++) {
                        const t = result.tickets[i];
                        if (t && t.status === 'error') {
                            const maybeToken = tokensToSend[i];
                            if (maybeToken) tokensWithErrors.push(maybeToken);
                        }
                    }
                }

                // receipt-level errors (map receipts -> tokens)
                const ticketToToken = {};
                if (result.tokenToTicket) {
                    for (const [tok, rid] of Object.entries(result.tokenToTicket || {})) {
                        if (rid) ticketToToken[rid] = tok;
                    }
                }
                for (const [rid, receipt] of Object.entries(result.receipts || {})) {
                    if (receipt && receipt.status === 'error') {
                        const tok = ticketToToken[rid] || null;
                        if (tok) tokensWithErrors.push(tok);
                    }
                }

                const distinct = Array.from(new Set(tokensWithErrors));
                notifLog.info('[sendToUsers] tokensWithErrors', { count: distinct.length });

                if (distinct.length) {
                    // group by userId (do not log tokens themselves)
                    const byUser = distinct.reduce((acc, tok) => {
                        const uid = tokenToUser[tok];
                        if (!uid) return acc;
                        acc[uid] = acc[uid] || [];
                        acc[uid].push(tok);
                        return acc;
                    }, {});

                    // log user ids and number of tokens that will be removed per user
                    const cleanupSummary = Object.entries(byUser).map(([uid, toks]) => ({ userId: uid, tokensToRemove: toks.length }));
                    notifLog.info('[sendToUsers] cleaning up invalid tokens for users', cleanupSummary);

                    const ops = [];
                    for (const [uid, toks] of Object.entries(byUser)) {
                        // remove any matching tokens from both ios & android arrays using $pull
                        ops.push(User.updateOne(
                            { _id: uid },
                            { $pull: { 'pushTokens.ios': { $in: toks }, 'pushTokens.android': { $in: toks } } }
                        ));
                    }
                    if (ops.length) {
                        await Promise.all(ops);
                        notifLog.info('[sendToUsers] cleaned up invalid tokens from user documents', { usersUpdated: ops.length });
                    }
                }
            } catch (err) {
                notifLog.error('cleanup invalid tokens error:', err);
            }
        } else {
            notifLog.debug('[sendToUsers] cleanupInvalidTokens disabled by opts');
        }

        return { sent: result.sentCount || 0, attemptedTokens: tokensToSend.length };
    } catch (err) {
        notifLog.error('[sendToUsers] unexpected error:', err);
        return { sent: 0, reason: 'error', error: err.message || String(err) };
    }
}

module.exports = {
    sendToUsers,
    pushNotifications,
    collectPushTokensForUsers
};
