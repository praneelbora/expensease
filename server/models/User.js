// models/User.js
const mongoose = require('mongoose');

const notificationCategories = {
    PERSONAL_EXPENSE_SUMMARIES: 'personal_expense_summaries',
    SPLIT_EXPENSE: 'split_expense',         // friend expenses (non-group)
    GROUP_EXPENSE: 'group_expense',
    FRIEND_SETTLEMENT: 'friend_settlement',
    GROUP_SETTLEMENT: 'group_settlement',
    FRIEND_REQUEST: 'friend_request',
    GROUPS: 'groups'                        // general group notifications (added/removed/privacy/etc)
};

// returns an object used as default Map value for categories
function defaultCategoryMap() {
    return {
        [notificationCategories.PERSONAL_EXPENSE_SUMMARIES]: true,
        [notificationCategories.SPLIT_EXPENSE]: true,
        [notificationCategories.GROUP_EXPENSE]: true,
        [notificationCategories.FRIEND_SETTLEMENT]: true,
        [notificationCategories.GROUP_SETTLEMENT]: true,
        [notificationCategories.FRIEND_REQUEST]: true,
        [notificationCategories.GROUPS]: true
    };
}

// --- logging control for notification checks ---
// Use same convention as your notif module:
// - If NOTIFICATION_LOGS is set to "true"/"false" it controls logging.
// - If unset, logging is enabled for NODE_ENV !== 'production'.
const ENABLE_NOTIF_LOGS = (() => {
    if (typeof process.env.NOTIFICATION_LOGS !== 'undefined') {
        return String(process.env.NOTIFICATION_LOGS).toLowerCase() === 'true';
    }
    return process.env.NODE_ENV !== 'production';
})();

const notifyLog = {
    debug: (...args) => { if (ENABLE_NOTIF_LOGS) { try { console.debug('[notify-check]', ...args); } catch (e) { } } },
    info: (...args) => { if (ENABLE_NOTIF_LOGS) { try { console.info('[notify-check]', ...args); } catch (e) { } } },
    warn: (...args) => { if (ENABLE_NOTIF_LOGS) { try { console.warn('[notify-check]', ...args); } catch (e) { } } },
    error: (...args) => { try { console.error('[notify-check][ERROR]', ...args); } catch (e) { } }
};
// ------------------------------------------------

const userSchema = new mongoose.Schema({
    // ---------- existing user fields ----------
    name: { type: String, required: true },
    email: { type: String, unique: true, sparse: true, trim: true },
    phone: { type: String, unique: true, sparse: true, trim: true },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    customCategories: [
        {
            name: String,
            emoji: String,
        }
    ],
    picture: { type: String },
    avatarId: { type: String },
    googleId: { type: String },
    upiId: { type: String },
    coins: { type: Number, default: 0 },
    defaultCurrency: {
        type: String,
        trim: true,
        uppercase: true,
        match: /^[A-Z]{3}$/, // ISO code
        default: 'INR',
    },
    preferredCurrencies: {
        type: [String],
        default: ['INR'],
        set: (arr) => [...new Set((arr || []).map(c => String(c).toUpperCase()))],
        validate: {
            validator: (arr) => (arr || []).every(c => /^[A-Z]{3}$/.test(c)),
            message: 'preferredCurrencies must be ISO 4217 codes (e.g., INR, USD).'
        }
    },
    preferredCurrencyUsage: {
        type: Map,
        of: Number,
        default: {},
    },
    pushTokens: {
        ios: { type: [String], default: [] },
        android: { type: [String], default: [] },
    },

    // ---------- notification preferences ----------
    // Channels: push | email | inapp
    notificationPreferences: {
        push: {
            enabled: { type: Boolean, default: true }, // master switch for push (default ON)
            // categories stored as a Map<string, boolean> (explicit category toggles)
            categories: {
                type: Map,
                of: Boolean,
                default: defaultCategoryMap
            },
            // temporary mute until (ISO date). If > now, suppress pushes for this channel.
            mutedUntil: { type: Date, default: null }
        },
        email: {
            enabled: { type: Boolean, default: false }, // default OFF for email
            categories: {
                type: Map,
                of: Boolean,
                default: defaultCategoryMap
            }
        },
        inapp: {
            enabled: { type: Boolean, default: true }, // in-app feed ON by default
            categories: {
                type: Map,
                of: Boolean,
                default: defaultCategoryMap
            }
        }
    },

    // ---------- per-group override entries ----------
    // User can mute or change category toggles for a specific group
    groupNotificationOverrides: [
        {
            groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
            push: {
                enabled: { type: Boolean },        // undefined => no override, true/false => explicit
                categories: { type: Map, of: Boolean },
                mutedUntil: { type: Date, default: null }
            },
            email: {
                enabled: { type: Boolean },
                categories: { type: Map, of: Boolean }
            },
            inapp: {
                enabled: { type: Boolean },
                categories: { type: Map, of: Boolean }
            }
        }
    ],

    // ---------- per-friend override entries ----------
    // User can mute or change category toggles for a specific friend
    friendNotificationOverrides: [
        {
            friendId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            push: {
                enabled: { type: Boolean },
                categories: { type: Map, of: Boolean },
                mutedUntil: { type: Date, default: null }
            },
            email: {
                enabled: { type: Boolean },
                categories: { type: Map, of: Boolean }
            },
            inapp: {
                enabled: { type: Boolean },
                categories: { type: Map, of: Boolean }
            }
        }
    ]

}, { timestamps: true });

// preserve phone unique sparse index
userSchema.index({ phone: 1 }, { unique: true, sparse: true });

/**
 * Helper: decide if a user should receive a notification.
 * Options:
 *  - channel: 'push' | 'email' | 'inapp'  (default 'push')
 *  - category: one of notificationCategories values (string)
 *  - groupId: optional group id if notification belongs to group
 *  - fromFriendId: optional friend id (originator) to respect friend overrides
 *
 * Resolution order (priority):
 * 1) Channel master switch (if explicitly false -> no)
 * 2) Per-friend override (if fromFriendId provided) — explicit allow/deny or mutedUntil
 * 3) Per-group override (if groupId provided) — explicit allow/deny or mutedUntil
 * 4) Channel category toggle (global)
 * 5) Channel mutedUntil (global)
 * 6) default allow
 */
userSchema.statics.shouldReceiveNotification = function (
    userDoc,
    { channel = 'push', category = null, groupId = null, fromFriendId = null } = {}
) {
    if (!userDoc) return false;
    const ch = channel || 'push';
    const cat = category || null;

    // channel prefs object (may be undefined)
    const chanPrefs = userDoc.notificationPreferences && userDoc.notificationPreferences[ch];
    notifyLog.debug('check', { channel: ch, category: cat, chanPrefsExists: !!chanPrefs });

    // 1) channel master switch
    if (chanPrefs && chanPrefs.enabled === false) {
        notifyLog.debug('denied: channel master switch is false');
        return false;
    }

    // helper to check mutedUntil is in future
    const isMutedUntil = (d) => {
        if (!d) return false;
        const t = new Date(d);
        if (Number.isNaN(t.getTime())) return false;
        return t > new Date();
    };

    // robust reader for category value: handles Map or plain object
    const readCategoryValue = (categories, key) => {
        if (!categories) return undefined;
        if (typeof categories.get === 'function') {
            // Mongoose Map or Map-like
            return categories.get(key);
        }
        // plain object (or plain JS map)
        if (Object.prototype.hasOwnProperty.call(categories, key)) {
            return categories[key];
        }
        return undefined;
    };

    // helper to evaluate a channel override (friend/group override)
    const evalOverrideChannel = (ovChan) => {
        if (!ovChan) return undefined;
        if (ovChan.enabled === false) {
            notifyLog.debug('override denies via enabled:false');
            return false;
        }
        if (ovChan.mutedUntil && isMutedUntil(ovChan.mutedUntil)) {
            notifyLog.debug('override denies via mutedUntil');
            return false;
        }
        if (cat) {
            const v = readCategoryValue(ovChan.categories, cat);
            if (v === false) {
                notifyLog.debug('override denies via category=false');
                return false;
            }
            if (v === true) {
                notifyLog.debug('override allows via category=true');
                return true;
            }
        }
        return undefined;
    };

    // 2) per-friend override (highest priority when fromFriendId provided)
    if (fromFriendId && Array.isArray(userDoc.friendNotificationOverrides)) {
        const ov = userDoc.friendNotificationOverrides.find(o => String(o.friendId) === String(fromFriendId));
        if (ov && ov[ch]) {
            const decision = evalOverrideChannel(ov[ch]);
            if (decision === false) return false;
            if (decision === true) return true;
            notifyLog.debug('friend override present but no explicit decision');
        }
    }

    // 3) per-group override (if groupId given)
    if (groupId && Array.isArray(userDoc.groupNotificationOverrides)) {
        const ov = userDoc.groupNotificationOverrides.find(o => String(o.groupId) === String(groupId));
        if (ov && ov[ch]) {
            const decision = evalOverrideChannel(ov[ch]);
            if (decision === false) return false;
            if (decision === true) return true;
            notifyLog.debug('group override present but no explicit decision');
        }
    }

    // 4) global category toggle (channel)
    if (cat && chanPrefs && chanPrefs.categories) {
        const v = readCategoryValue(chanPrefs.categories, cat);
        if (v === false) {
            notifyLog.debug('denied: global category false');
            return false;
        }
        if (v === true) {
            notifyLog.debug('allowed: global category true');
            return true;
        }
        notifyLog.debug('global category has no explicit value');
    }

    // 5) global mutedUntil for channel
    if (chanPrefs && isMutedUntil(chanPrefs.mutedUntil)) {
        notifyLog.debug('denied: global mutedUntil active');
        return false;
    }

    // 6) default allow
    notifyLog.debug('allowed: default');
    return true;
};


module.exports = mongoose.model('User', userSchema);
// also expose categories for consistent use across app
module.exports.notificationCategories = notificationCategories;
