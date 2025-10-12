// models/User.js
const mongoose = require('mongoose');

/* ===============================
 * Notification categories (unchanged)
 * =============================== */
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
const ENABLE_NOTIF_LOGS = (() => {
  if (typeof process.env.NOTIFICATION_LOGS !== 'undefined') {
    return String(process.env.NOTIFICATION_LOGS).toLowerCase() === 'true';
  }
  return process.env.NODE_ENV !== 'production';
})();

const notifyLog = {
  debug: (...args) => { if (ENABLE_NOTIF_LOGS) { try { console.debug('[notify-check]', ...args); } catch (e) { } } },
  info:  (...args) => { if (ENABLE_NOTIF_LOGS) { try { console.info('[notify-check]', ...args); } catch (e) { } } },
  warn:  (...args) => { if (ENABLE_NOTIF_LOGS) { try { console.warn('[notify-check]', ...args); } catch (e) { } } },
  error: (...args) => { try { console.error('[notify-check][ERROR]', ...args); } catch (e) { } }
};

/* ===============================
 * Metering (feature flags + quotas)
 * =============================== */

// One compact subdocument we can reuse for any metered feature.
// Uses “dailyLimit”/“monthlyLimit” fields to avoid migration churn; copy says “metering limit”.
const MeterSchema = new mongoose.Schema({
  dailyCount:   { type: Number, default: 0 },
  monthlyCount: { type: Number, default: 0 },
  lastUsedAt:   { type: Date,   default: null },
  dailyLimit:   { type: Number, default: 5 },     // daily metering limit
  monthlyLimit: { type: Number, default: 100 },   // monthly metering limit
}, { _id: false });

/* ===============================
 * User schema
 * =============================== */
const userSchema = new mongoose.Schema({
  // ---------- core user fields ----------
  name: { type: String },
  email: { type: String, unique: true, sparse: true, trim: true, default: undefined },
  appleEmail: { type: String, unique: true, sparse: true, trim: true, default: undefined },
  appleId: { type: String, unique: true, sparse: true, trim: true, default: undefined },
  phone: { type: String, unique: true, sparse: true, trim: true, default: undefined },
  secondaryPhone: { type: String, unique: true, sparse: true, trim: true, default: undefined },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  customCategories: [
    { name: String, emoji: String }
  ],
  picture: { type: String },
  avatarId: { type: String },
  googleId: { type: String },
  upiId: { type: String },
  paid: { type: Boolean, default: false },
  coins: { type: Number, default: 0 },

  emailHashes: [{ type: String, index: true }],  // e.g. ['<hex-sha256>']
  phoneHashes: [{ type: String, index: true }],

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
      enabled: { type: Boolean, default: true }, // master switch (default ON)
      categories: {
        type: Map,
        of: Boolean,
        default: defaultCategoryMap
      },
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
      enabled: { type: Boolean, default: true },
      categories: {
        type: Map,
        of: Boolean,
        default: defaultCategoryMap
      }
    }
  },

  // ---------- per-group overrides ----------
  groupNotificationOverrides: [{
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    push:  { enabled: { type: Boolean }, categories: { type: Map, of: Boolean }, mutedUntil: { type: Date, default: null } },
    email: { enabled: { type: Boolean }, categories: { type: Map, of: Boolean } },
    inapp: { enabled: { type: Boolean }, categories: { type: Map, of: Boolean } }
  }],

  // ---------- per-friend overrides ----------
  friendNotificationOverrides: [{
    friendId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    push:  { enabled: { type: Boolean }, categories: { type: Map, of: Boolean }, mutedUntil: { type: Date, default: null } },
    email: { enabled: { type: Boolean }, categories: { type: Map, of: Boolean } },
    inapp: { enabled: { type: Boolean }, categories: { type: Map, of: Boolean } }
  }],

  // ---------- voice usage (legacy counters kept if you still read them elsewhere) ----------
  dailyVoiceCount:   { type: Number, default: 0 },
  totalVoiceCount:   { type: Number, default: 0 },
  dailyVoiceLimit:   { type: Number, default: 3 },
  lastVoiceUsedAt:   { type: Date,   default: null },

  /* ---------- Feature Flags ----------
   * Toggle access to certain features per user.
   * Example: enable only whitelisted users for “Scan Receipt” and “Voice”.
   */
  features: {
    type: Object,
    default: { receipt_scan: false, voice: false }
  },

  /* ---------- Metering ----------
   * Per-feature metering with daily/monthly quotas.
   * Messages refer to “metering limits” to match your wording.
   */
  meters: {
    receipt_scan: { type: MeterSchema, default: () => ({ dailyLimit: 5,  monthlyLimit: 100 }) },
    voice:        { type: MeterSchema, default: () => ({ dailyLimit: 3,  monthlyLimit: 60  }) },
  },

}, { timestamps: true });

// indexes
userSchema.index({ phone: 1 }, { unique: true, sparse: true });

/* ===============================
 * Notification helper (unchanged logic)
 * =============================== */
/**
 * Decide if a user should receive a notification.
 * Options:
 *  - channel: 'push' | 'email' | 'inapp'  (default 'push')
 *  - category: one of notificationCategories values (string)
 *  - groupId: optional group id if notification belongs to group
 *  - fromFriendId: optional friend id (originator) to respect friend overrides
 *
 * Resolution order (priority):
 * 1) Channel master switch (if explicitly false -> no)
 * 2) Per-friend override (if fromFriendId provided)
 * 3) Per-group override (if groupId provided)
 * 4) Channel category toggle (global)
 * 5) Channel mutedUntil (global)
 * 6) default allow
 */
userSchema.statics.shouldReceiveNotification = function (
  userDoc,
  { channel = 'push', category = null, groupId = null, fromFriendId = null } = {}
) {
  if (!userDoc) return false;
  const ch  = channel || 'push';
  const cat = category || null;

  const chanPrefs = userDoc.notificationPreferences && userDoc.notificationPreferences[ch];
  notifyLog.debug('check', { channel: ch, category: cat, chanPrefsExists: !!chanPrefs });

  // 1) channel master switch
  if (chanPrefs && chanPrefs.enabled === false) {
    notifyLog.debug('denied: channel master switch is false');
    return false;
  }

  const isMutedUntil = (d) => {
    if (!d) return false;
    const t = new Date(d);
    if (Number.isNaN(t.getTime())) return false;
    return t > new Date();
  };

  const readCategoryValue = (categories, key) => {
    if (!categories) return undefined;
    if (typeof categories.get === 'function') return categories.get(key); // Mongoose Map
    if (Object.prototype.hasOwnProperty.call(categories, key)) return categories[key];
    return undefined;
  };

  const evalOverrideChannel = (ovChan) => {
    if (!ovChan) return undefined;
    if (ovChan.enabled === false) { notifyLog.debug('override denies via enabled:false'); return false; }
    if (ovChan.mutedUntil && isMutedUntil(ovChan.mutedUntil)) { notifyLog.debug('override denies via mutedUntil'); return false; }
    if (cat) {
      const v = readCategoryValue(ovChan.categories, cat);
      if (v === false) { notifyLog.debug('override denies via category=false'); return false; }
      if (v === true)  { notifyLog.debug('override allows via category=true');  return true; }
    }
    return undefined;
  };

  // 2) per-friend override
  if (fromFriendId && Array.isArray(userDoc.friendNotificationOverrides)) {
    const ov = userDoc.friendNotificationOverrides.find(o => String(o.friendId) === String(fromFriendId));
    if (ov && ov[ch]) {
      const decision = evalOverrideChannel(ov[ch]);
      if (decision === false) return false;
      if (decision === true)  return true;
      notifyLog.debug('friend override present but no explicit decision');
    }
  }

  // 3) per-group override
  if (groupId && Array.isArray(userDoc.groupNotificationOverrides)) {
    const ov = userDoc.groupNotificationOverrides.find(o => String(o.groupId) === String(groupId));
    if (ov && ov[ch]) {
      const decision = evalOverrideChannel(ov[ch]);
      if (decision === false) return false;
      if (decision === true)  return true;
      notifyLog.debug('group override present but no explicit decision');
    }
  }

  // 4) global category toggle
  if (cat && chanPrefs && chanPrefs.categories) {
    const v = readCategoryValue(chanPrefs.categories, cat);
    if (v === false) { notifyLog.debug('denied: global category false'); return false; }
    if (v === true)  { notifyLog.debug('allowed: global category true'); return true; }
    notifyLog.debug('global category has no explicit value');
  }

  // 5) global mutedUntil
  if (chanPrefs && isMutedUntil(chanPrefs.mutedUntil)) {
    notifyLog.debug('denied: global mutedUntil active');
    return false;
  }

  // 6) default allow
  notifyLog.debug('allowed: default');
  return true;
};

/* ===============================
 * Metering helpers
 * =============================== */
userSchema.methods._isSameDay = function (d1, d2) {
  return d1 && d2 && d1.toDateString() === d2.toDateString();
};
userSchema.methods._isSameMonth = function (d1, d2) {
  return d1 && d2 && d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
};

// Check without mutating
// Returns: { ok, reason, dailyCount, monthlyCount, dailyLimit, monthlyLimit }
userSchema.methods.canUseMeter = function (key) {
  if (!this.features?.[key]) return { ok: false, reason: 'feature_disabled' };
  const now = new Date();
  const m = this.meters?.[key];
  if (!m) return { ok: true };

  const last = m.lastUsedAt ? new Date(m.lastUsedAt) : null;
  const dailyCount   = last && this._isSameDay(last, now)     ? (m.dailyCount || 0)   : 0;
  const monthlyCount = last && this._isSameMonth(last, now)   ? (m.monthlyCount || 0) : 0;

  if (m.dailyLimit   != null && dailyCount   >= m.dailyLimit)   return { ok: false, reason: 'daily_metering_limit' };
  if (m.monthlyLimit != null && monthlyCount >= m.monthlyLimit) return { ok: false, reason: 'monthly_metering_limit' };

  return { ok: true, reason: null, dailyCount, monthlyCount, dailyLimit: m.dailyLimit, monthlyLimit: m.monthlyLimit };
};

// Optional: expose a friendly snapshot for headers/UI
userSchema.methods.meterSnapshot = function (key) {
  const m = this.meters?.[key] || {};
  return {
    dailyCount:   m.dailyCount   ?? 0,
    monthlyCount: m.monthlyCount ?? 0,
    lastUsedAt:   m.lastUsedAt   ?? null,
    dailyLimit:   m.dailyLimit   ?? null,
    monthlyLimit: m.monthlyLimit ?? null,
  };
};

// Atomically bump a meter (call inside a transaction/session when performing the action)
userSchema.statics.bumpMeter = async function ({ userId, key, session }) {
  const now = new Date();
  const doc = await this.findById(userId).select('features meters').session(session);
  if (!doc) throw Object.assign(new Error('User not found'), { status: 404 });
  if (!doc.features?.[key]) throw Object.assign(new Error('Feature disabled'), { status: 403, code: 'feature_disabled' });

  const m = doc.meters?.[key] || {};
  const last = m.lastUsedAt ? new Date(m.lastUsedAt) : null;
  const sameDay   = last && doc._isSameDay(last, now);
  const sameMonth = last && doc._isSameMonth(last, now);

  const next = {
    dailyCount:    (sameDay   ? (m.dailyCount   || 0) : 0) + 1,
    monthlyCount:  (sameMonth ? (m.monthlyCount || 0) : 0) + 1,
    lastUsedAt:    now,
    dailyLimit:    m.dailyLimit,
    monthlyLimit:  m.monthlyLimit
  };

  if (next.dailyLimit   != null && next.dailyCount   > next.dailyLimit)
    throw Object.assign(new Error('Daily metering limit reached'),   { status: 429, code: 'daily_metering_limit' });
  if (next.monthlyLimit != null && next.monthlyCount > next.monthlyLimit)
    throw Object.assign(new Error('Monthly metering limit reached'), { status: 429, code: 'monthly_metering_limit' });

  await this.updateOne(
    { _id: userId },
    { $set: { [`meters.${key}`]: next } },
    { session }
  );

  return next;
};

const User = mongoose.model('User', userSchema);
User.notificationCategories = notificationCategories;
module.exports = User;
