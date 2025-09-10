const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../../models/User');
const Group = require('../../models/Group');
const Expense = require('../../models/Expense');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../../middleware/auth');
const DefaultCategories = require('../../assets/Categories').default;
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client();
const https = require("https");
const JWT_SECRET = process.env.JWT_SECRET;
const PaymentMethod = require("../../models/PaymentMethod");
const PaymentMethodTxn = require("../../models/PaymentMethodTransaction");
const Admin = require('../../models/Admin');

const { savePushTokenPublic, savePushTokenAuthed, savePushToken } = require("./controller.js");


// // 👤 Authenticated User Info
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
    res.json(user);
  } catch (error) {
    console.error('/ GET user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// // 🔁 Ping
router.get('/ping', (req, res) => {
  console.log('ping');
  res.send('🚀 Server is running!');
});

// GET Categories
router.get('/categories', auth, async (req, res) => {
  try {
    let user = await User.findById(req.user.id); // assume middleware added `req.user`
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (!user.customCategories || user.customCategories.length === 0) {
      user.customCategories = DefaultCategories
      await user.save();
      return res.json(user.customCategories);
    }

    res.json(user.customCategories);
  } catch (err) {
    console.error('Error getting categories:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST Categories
router.post('/categories', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const { categories } = req.body;

    if (!Array.isArray(categories)) {
      return res.status(400).json({ error: 'Invalid categories' });
    }

    user.customCategories = categories;
    await user.save();
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving categories:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


router.post("/google-login", async (req, res) => {
  console.log("Google login body:", req.body);
  const { id_token, access_token, pushToken, platform } = req.body;

  if (!id_token && !access_token) {
    return res.status(400).json({ error: "Missing id_token or access_token" });
  }

  try {
    let profile;

    if (id_token) {
      // Mobile flow (id_token)
      const ticket = await client.verifyIdToken({
        idToken: id_token,
        audience: [
          process.env.GOOGLE_WEB_CLIENT_ID,
          process.env.GOOGLE_ANDROID_CLIENT_ID,
          process.env.GOOGLE_IOS_CLIENT_ID,
        ],
      });

      const payload = ticket.getPayload();
      console.log("Google payload:", payload);

      profile = {
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        googleId: payload.sub,
      };
    } else if (access_token) {
      // Web flow (access_token)
      const response = await fetch(
        `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${access_token}`
      );
      const data = await response.json();
      profile = {
        email: data.email,
        name: data.name,
        picture: data.picture,
        googleId: data.sub,
      };
    }

    // --- Create or fetch user ---
    let user = await User.findOne({ email: profile.email });
    let newUser = false;

    if (!user) {
      newUser = true;
      user = await User.create(profile);

      await PaymentMethod.create({
        userId: user._id,
        label: "Cash",
        type: "cash",
        balances: { INR: { available: 0, pending: 0 } },
        capabilities: ["send", "receive"],
        isDefaultSend: true,
        isDefaultReceive: true,
        provider: "manual",
        status: "verified",
      });
    }

    // Save push token if provided
    if (pushToken) {
      await savePushToken({ userId: user._id, token: pushToken, platform });
    }

    // --- Issue JWT ---
    const authToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "100d" });

    res.status(200).json({
      responseBody: { "x-auth-token": authToken },
      user: { id: user._id, name: user.name, email: user.email, picture: user.picture },
      newUser,
    });
  } catch (err) {
    console.error("Google login failed:", err);
    res.status(401).json({ error: "Invalid or expired Google token" });
  }
});


router.patch('/profile', auth, async (req, res) => {
  const start = Date.now();
  const routeTag = '[PATCH /v1/users/profile]';
  try {
    const {
      name,
      profilePic,
      upiId: rawUpiId,
      vpa: rawVpa,
      defaultCurrency,
      preferredCurrencies,
      // new fields
      notificationPreferences,
      groupNotificationOverrides,
      friendNotificationOverrides,
      pushTokens, // optional: allow client to send token arrays (ios/android)
      avatarId,
    } = req.body || {};

    console.log(new Date().toISOString(), 'INFO', routeTag, 'incoming body:', req.body);

    const update = {};
    // ---------- Basic fields ----------
    console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'validating basic fields');
    if (typeof name === 'string') {
      update.name = name.trim();
      console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update name');
    }
    if (typeof profilePic === 'string') {
      update.profilePic = profilePic.trim();
      console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update profilePic');
    }

    // ---------- UPI ----------
    const resolvedUpi = [rawUpiId, rawVpa].find(
      (v) => typeof v === 'string' && v.trim().length
    );
    const upiRegex = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z0-9.\-]{2,}$/;
    if (resolvedUpi !== undefined) {
      const v = String(resolvedUpi).trim();
      console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'validating upiId:', v);
      if (!upiRegex.test(v)) {
        console.warn(new Date().toISOString(), 'WARN', routeTag, 'validation failed: invalid upiId', v);
        return res.status(400).json({ error: 'Invalid UPI ID format (e.g., name@bank).' });
      }
      update.upiId = v;
      console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update upiId');
    }

    // ---------- Currency ----------
    if (typeof defaultCurrency === 'string') {
      const cur = defaultCurrency.toUpperCase().trim();
      console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'validating defaultCurrency:', cur);
      if (!/^[A-Z]{3}$/.test(cur)) {
        console.warn(new Date().toISOString(), 'WARN', routeTag, 'validation failed: defaultCurrency invalid', defaultCurrency);
        return res.status(400).json({ error: 'defaultCurrency must be a 3-letter ISO code (e.g., INR, USD).' });
      }
      update.defaultCurrency = cur;
      console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update defaultCurrency:', cur);
    }

    if (Array.isArray(preferredCurrencies)) {
      console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'validating preferredCurrencies array length=', preferredCurrencies.length);
      const cleaned = [...new Set(preferredCurrencies.map(c => String(c).toUpperCase().trim()))]
        .filter(c => /^[A-Z]{3}$/.test(c));
      update.preferredCurrencies = cleaned;
      console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update preferredCurrencies:', cleaned);
    }
    // ---------- AvatarId (predefined avatars) ----------
    if (typeof avatarId !== 'undefined') {
      if (avatarId === null || avatarId === '') {
        // allow clearing avatar
        update.avatarId = null;
        console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will clear avatarId');
      } else if (typeof avatarId === 'string') {
        const a = avatarId.trim();
        console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'validating avatarId:', a);


        update.avatarId = a;
        console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update avatarId:', a);
      } else {
        console.warn(new Date().toISOString(), 'WARN', routeTag, 'validation failed: avatarId wrong type', typeof avatarId);
        return res.status(400).json({ error: 'avatarId must be a string or null' });
      }
    }


    // ---------- pushTokens (optional) ----------
    // Accept shape: { ios: [token], android: [token] } or arrays
    if (pushTokens) {
      console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'processing pushTokens payload');
      const tokensUpdate = {};
      if (Array.isArray(pushTokens)) {
        // treat as android/ios unknown: push into android for now
        tokensUpdate['pushTokens.android'] = pushTokens.map(t => String(t)).filter(Boolean);
        console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'received pushTokens array -> mapped to android count=', tokensUpdate['pushTokens.android'].length);
      } else if (typeof pushTokens === 'object') {
        if (Array.isArray(pushTokens.ios)) {
          tokensUpdate['pushTokens.ios'] = pushTokens.ios.map(t => String(t)).filter(Boolean);
          console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'received pushTokens.ios count=', tokensUpdate['pushTokens.ios'].length);
        }
        if (Array.isArray(pushTokens.android)) {
          tokensUpdate['pushTokens.android'] = pushTokens.android.map(t => String(t)).filter(Boolean);
          console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'received pushTokens.android count=', tokensUpdate['pushTokens.android'].length);
        }
      }
      // merge into update with $set
      if (Object.keys(tokensUpdate).length) {
        Object.assign(update, tokensUpdate);
      }
    }

    // ---------- Notification preferences ----------
    // Expected shape:
    // notificationPreferences: {
    //   push: { enabled: true/false, categories: { key: true/false }, mutedUntil: ISOString|null },
    //   email: { enabled, categories: {...} },
    //   inapp: { enabled, categories: {...} }
    // }
    if (notificationPreferences && typeof notificationPreferences === 'object') {
      console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'validating notificationPreferences');
      const allowedChannels = ['push', 'email', 'inapp'];
      const npNext = {};

      for (const ch of allowedChannels) {
        const chObj = notificationPreferences[ch];
        if (!chObj) continue;

        const chNext = {};

        if (typeof chObj.enabled === 'boolean') {
          chNext.enabled = chObj.enabled;
          console.debug(new Date().toISOString(), 'DEBUG', routeTag, `notificationPreferences.${ch}.enabled =`, chNext.enabled);
        }

        // categories: accept plain object or map-like
        if (chObj.categories && typeof chObj.categories === 'object') {
          const cats = {};
          // if it's a Mongoose map-like (sent from client rarely), accept entries
          if (typeof chObj.categories.entries === 'function') {
            for (const [k, v] of chObj.categories.entries()) {
              cats[String(k)] = !!v;
            }
          } else {
            for (const [k, v] of Object.entries(chObj.categories)) {
              cats[String(k)] = !!v;
            }
          }
          chNext.categories = cats;
          console.debug(new Date().toISOString(), 'DEBUG', routeTag, `notificationPreferences.${ch}.categories keys=`, Object.keys(cats));
        }

        // mutedUntil: accept ISO strings or null
        if (ch === 'push' && chObj.mutedUntil !== undefined) {
          if (chObj.mutedUntil === null || chObj.mutedUntil === '') {
            chNext.mutedUntil = null;
            console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'notificationPreferences.push.mutedUntil = null');
          } else {
            const d = new Date(chObj.mutedUntil);
            if (Number.isNaN(d.getTime())) {
              console.warn(new Date().toISOString(), 'WARN', routeTag, 'validation failed: push.mutedUntil invalid', chObj.mutedUntil);
              return res.status(400).json({ error: 'push.mutedUntil must be a valid ISO date or null' });
            }
            chNext.mutedUntil = d;
            console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'notificationPreferences.push.mutedUntil parsed ->', d.toISOString());
          }
        }

        npNext[ch] = chNext;
      }

      // Only set if we have at least one channel
      if (Object.keys(npNext).length) {
        update.notificationPreferences = npNext;
        console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update notificationPreferences keys=', Object.keys(npNext));
      }
    }

    // ---------- Group overrides ----------
    // Expected shape: [{ groupId, push: {enabled,categories,mutedUntil}, email:{}, inapp:{} }, ...]
    if (Array.isArray(groupNotificationOverrides)) {
      console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'validating groupNotificationOverrides count=', groupNotificationOverrides.length);
      const arr = [];
      for (const item of groupNotificationOverrides) {
        if (!item || !item.groupId) {
          console.warn(new Date().toISOString(), 'WARN', routeTag, 'skipping invalid groupNotificationOverrides item', item);
          continue;
        }
        const el = { groupId: item.groupId };

        // validate each channel if provided
        ['push', 'email', 'inapp'].forEach(ch => {
          if (!item[ch]) return;
          const chObj = item[ch];
          const chNext = {};
          if (typeof chObj.enabled === 'boolean') chNext.enabled = chObj.enabled;
          if (chObj.categories && typeof chObj.categories === 'object') {
            const cats = {};
            if (typeof chObj.categories.entries === 'function') {
              for (const [k, v] of chObj.categories.entries()) cats[String(k)] = !!v;
            } else {
              for (const [k, v] of Object.entries(chObj.categories)) cats[String(k)] = !!v;
            }
            chNext.categories = cats;
          }
          if (ch === 'push' && chObj.mutedUntil !== undefined) {
            if (chObj.mutedUntil === null || chObj.mutedUntil === '') chNext.mutedUntil = null;
            else {
              const d = new Date(chObj.mutedUntil);
              if (Number.isNaN(d.getTime())) {
                console.warn(new Date().toISOString(), 'WARN', routeTag, 'validation failed: groupNotificationOverrides[*].push.mutedUntil invalid', chObj.mutedUntil);
                return res.status(400).json({ error: 'groupNotificationOverrides[*].push.mutedUntil must be ISO date or null' });
              }
              chNext.mutedUntil = d;
            }
          }
          el[ch] = chNext;
        });

        arr.push(el);
      }
      if (arr.length) {
        update.groupNotificationOverrides = arr;
        console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update groupNotificationOverrides count=', arr.length);
      }
    }

    // ---------- Friend overrides ----------
    // Expected shape: [{ friendId, push: {enabled,categories,mutedUntil}, ... }, ...]
    if (Array.isArray(friendNotificationOverrides)) {
      console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'validating friendNotificationOverrides count=', friendNotificationOverrides.length);
      const arr = [];
      for (const item of friendNotificationOverrides) {
        if (!item || !item.friendId) {
          console.warn(new Date().toISOString(), 'WARN', routeTag, 'skipping invalid friendNotificationOverrides item', item);
          continue;
        }
        const el = { friendId: item.friendId };

        ['push', 'email', 'inapp'].forEach(ch => {
          if (!item[ch]) return;
          const chObj = item[ch];
          const chNext = {};
          if (typeof chObj.enabled === 'boolean') chNext.enabled = chObj.enabled;
          if (chObj.categories && typeof chObj.categories === 'object') {
            const cats = {};
            if (typeof chObj.categories.entries === 'function') {
              for (const [k, v] of chObj.categories.entries()) cats[String(k)] = !!v;
            } else {
              for (const [k, v] of Object.entries(chObj.categories)) cats[String(k)] = !!v;
            }
            chNext.categories = cats;
          }
          if (ch === 'push' && chObj.mutedUntil !== undefined) {
            if (chObj.mutedUntil === null || chObj.mutedUntil === '') chNext.mutedUntil = null;
            else {
              const d = new Date(chObj.mutedUntil);
              if (Number.isNaN(d.getTime())) {
                console.warn(new Date().toISOString(), 'WARN', routeTag, 'validation failed: friendNotificationOverrides[*].push.mutedUntil invalid', chObj.mutedUntil);
                return res.status(400).json({ error: 'friendNotificationOverrides[*].push.mutedUntil must be ISO date or null' });
              }
              chNext.mutedUntil = d;
            }
          }
          el[ch] = chNext;
        });

        arr.push(el);
      }
      if (arr.length) {
        update.friendNotificationOverrides = arr;
        console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'will update friendNotificationOverrides count=', arr.length);
      }
    }

    // ---------- Nothing to update ----------
    if (!Object.keys(update).length) {
      console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'prepared update is empty -> no changes');
      const existing = await User.findById(req.user.id).lean();
      console.log(new Date().toISOString(), 'INFO', routeTag, 'no-op response returned', { userId: req.user.id, durationMs: Date.now() - start });
      return res.status(200).json({ message: 'No changes', user: existing });
    }

    // ---------- Apply update ----------
    // Use $set for regular fields. For nested / date fields we already prepared values.
    const setObj = {};
    for (const [k, v] of Object.entries(update)) {
      setObj[k] = v;
    }
    console.debug(new Date().toISOString(), 'DEBUG', routeTag, 'prepared $set object keys=', Object.keys(setObj));

    let user;
    try {
      user = await User.findByIdAndUpdate(
        req.user.id,
        { $set: setObj },
        { new: true, runValidators: true, context: 'query' }
      ).lean();
    } catch (dbErr) {
      console.error(new Date().toISOString(), 'ERROR', routeTag, 'DB update failed:', dbErr);
      console.log(new Date().toISOString(), 'INFO', routeTag, 'response', { status: 500, message: 'Failed to update profile', durationMs: Date.now() - start });
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    if (!user) {
      console.warn(new Date().toISOString(), 'WARN', routeTag, 'user not found for id', req.user.id);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(new Date().toISOString(), 'INFO', routeTag, 'db update result: userId=' + user._id + ', updatedFields=' + Object.keys(update).join(','));
    console.log(new Date().toISOString(), 'INFO', routeTag, 'response', { status: 200, durationMs: Date.now() - start });

    // Build response (avoid exposing sensitive arrays like raw push token internals if you prefer)
    return res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePic: user.profilePic,
        upiId: user.upiId || null,
        defaultCurrency: user.defaultCurrency || 'INR',
        preferredCurrencies: user.preferredCurrencies || ['INR'],
        customCategories: user.customCategories || [],
        notificationPreferences: user.notificationPreferences || {},
        groupNotificationOverrides: user.groupNotificationOverrides || [],
        friendNotificationOverrides: user.friendNotificationOverrides || [],
        // Note: pushTokens included for convenience; remove if you wish not to send them back.
        pushTokens: user.pushTokens || { ios: [], android: [] },
      }
    });
  } catch (err) {
    console.error(new Date().toISOString(), 'ERROR', '[PATCH /v1/users/profile] unexpected error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});



router.delete('/me', auth, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const userId = req.user.id;

    await session.withTransaction(async () => {
      // 1) Collect this user's payment account IDs
      const pmIds = await PaymentMethod
        .find({ userId }, { _id: 1 })
        .session(session)
        .lean()
        .then(rows => rows.map(r => r._id));

      // 2) Delete PM transactions (journal)
      if (pmIds.length) {
        await PaymentMethodTxn.deleteMany(
          { userId, paymentMethodId: { $in: pmIds } },
          { session }
        );
      }

      // 3) Delete payment accounts
      await PaymentMethod.deleteMany({ userId }, { session });

      // 4) Delete expenses created by the user
      await Expense.deleteMany({ createdBy: userId }, { session });

      // 5) Remove the user from any splits in other peoples' expenses
      await Expense.updateMany(
        { 'splits.friendId': userId },
        { $pull: { splits: { friendId: userId } } },
        { session }
      );

      // 6) Remove the user from groups
      await Group.updateMany(
        { 'members._id': userId },
        { $pull: { members: { _id: userId } } },
        { session }
      );
      // (Optional) delete empty groups afterwards
      await Group.deleteMany({ members: { $size: 0 } }, { session });

      // 7) Delete friend requests involving this user (if model exists)
      if (FriendRequest) {
        await FriendRequest.deleteMany(
          {
            $or: [
              { from: userId },
              { to: userId },
              // common alt field names:
              { requester: userId },
              { recipient: userId }
            ]
          },
          { session }
        );
      }

      // 8) Finally, delete the user
      await User.deleteOne({ _id: userId }, { session });
    });

    res.status(204).send(); // no content
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  } finally {
    session.endSession();
  }
});

const getFriendSuggestions = async (userId, topN = 5) => {
  const now = new Date();

  // fetch user's friends first
  const user = await User.findById(userId).select("friends");
  const friendIds = user.friends.map(f => new mongoose.Types.ObjectId(f));

  const results = await Expense.aggregate([
    {
      $match: {
        $or: [
          { createdBy: new mongoose.Types.ObjectId(userId) },
          { "splits.friendId": new mongoose.Types.ObjectId(userId) }
        ]
      }
    },
    { $unwind: "$splits" },
    {
      $match: { "splits.friendId": { $in: friendIds, $ne: new mongoose.Types.ObjectId(userId) } }
    },
    {
      $group: {
        _id: "$splits.friendId",
        frequency: { $sum: 1 },
        lastSeen: { $max: "$date" }
      }
    },
    {
      $addFields: {
        recencyWeight: {
          $divide: [
            1,
            {
              $add: [
                {
                  $divide: [
                    { $subtract: [now, "$lastSeen"] },
                    1000 * 60 * 60 * 24
                  ]
                },
                1
              ]
            }
          ]
        }
      }
    },
    {
      $addFields: {
        score: {
          $add: [
            { $multiply: [0.6, "$frequency"] },
            { $multiply: [0.4, "$recencyWeight"] }
          ]
        }
      }
    },
    { $sort: { score: -1 } },
    { $limit: topN },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "friend"
      }
    },
    { $unwind: "$friend" },
    {
      $project: {
        _id: 0,
        friendId: "$friend._id",
        name: "$friend.name",
        email: "$friend.email",
        score: 1
      }
    }
  ]);

  return results;
};

const getGroupSuggestions = async (userId, topN = 5) => {
  const results = await Expense.aggregate([
    {
      $match: {
        $or: [
          { createdBy: new mongoose.Types.ObjectId(userId) },
          { groupId: { $exists: true, $ne: null } }
        ]
      }
    },
    {
      $group: {
        _id: "$groupId",
        frequency: { $sum: 1 },
        lastSeen: { $max: "$date" }
      }
    },
    { $sort: { frequency: -1, lastSeen: -1 } },
    { $limit: topN },
    {
      $lookup: {
        from: "groups",
        localField: "_id",
        foreignField: "_id",
        as: "group"
      }
    },
    { $unwind: "$group" },
    {
      $project: {
        groupId: "$group._id",
        name: "$group.name",
        frequency: 1,
        lastSeen: 1
      }
    }
  ]);

  return results;
};

// NEW route
router.get("/suggestions", auth, async (req, res) => {
  try {
    const [friends, groups] = await Promise.all([
      getFriendSuggestions(req.user.id),
      getGroupSuggestions(req.user.id)
    ]);

    res.json({ friends, groups });
  } catch (error) {
    console.error("suggestions/ error: ", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/login", async (req, res) => {
  const { email, pushToken, platform } = req.body;
  console.log(req.body);

  if (!email) return res.status(400).json({ error: "Missing email id" });

  try {
    if (email !== "praneelbora@gmail.com" && email !== "praneelbora9@gmail.com" && email !== "developerpraneel@gmail.com" && email !== 'testlogin@expensease.in')
      if (!email) return res.status(400).json({ error: "Not a developer ACcount" });
    let user = await User.findOne({ email });
    let newUser = false;
    if (!user) {
      newUser = true;
      user = await User.create({ email, name: "TEST USER" });
      await PaymentMethod.create({
        userId: user._id,
        label: "Cash",
        type: "cash",
        supportedCurrencies: [], // any currency
        balances: {
          INR: { available: 0, pending: 0 }
        },
        capabilities: ["send", "receive"],
        isDefaultSend: true,       // optional: treat cash as default send
        isDefaultReceive: true,    // optional: treat cash as default receive
        provider: "manual",
        status: "verified"         // cash doesn’t need verification
      });
    }

    if (pushToken) {
      await savePushToken({ userId: user._id, token: pushToken, platform });
    }
    const authToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "100d" });

    res.status(200).json({
      responseBody: { "x-auth-token": authToken },
      user: { id: user._id, name: user.name, email: user.email, picture: user.picture },
      newUser,
    });
  } catch (err) {
    console.error(" login failed:", err);
    res.status(401).json({ error: "Invalid or expired Google code" });
  }
});

router.get("/version", async (req, res) => {
  try {
    let adminDoc = await Admin.findOne().lean();

    if (!adminDoc) {
      // 👇 create default version document if none exists
      const defaultDoc = await Admin.create({
        minimumVersion: "1.0.0",
        minimumIOSVersion: "1.0.0",
        minimumAndroidVersion: "1.0.0",
      });
      adminDoc = defaultDoc.toObject();
    }

    res.json({
      minimumIOSVersion: adminDoc.minimumIOSVersion,
      minimumAndroidVersion: adminDoc.minimumAndroidVersion,
    });
  } catch (e) {
    console.error("Error fetching version:", e);
    res.status(500).json({ error: "Could not fetch version info" });
  }
});

// Non-auth route: just save token to Admin
router.post("/push-token/public", savePushTokenPublic);

// Authenticated route: save to User and Admin
router.post("/push-token", auth, savePushTokenAuthed);

// temp route to test phone-only user creation
router.post("/test-phone-login", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Missing phone" });

  try {
    let user = await User.findOne({ phone });
    let newUser = false;

    if (!user) {
      newUser = true;
      user = await User.create({ phone, name: "TEST PHONE USER" });

    }
    console.log();

    res.status(200).json({

      user: { id: user._id, name: user.name, phone: user.phone },
      newUser,
    });
  } catch (err) {
    console.error("Phone login failed:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Send OTP
router.post("/sendSMS", async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });

    console.log("📲 Sending SMS to:", phoneNumber);

    // --- TEST BYPASS ---
    if (["7447425397", ""].includes(phoneNumber)) {
      return res.status(200).json({ type: "success", bypass: true });
    }

    const options = {
      method: "POST",
      hostname: "control.msg91.com",
      port: null,
      path: `/api/v5/otp?template_id=${process.env.MSG_TEMPLATE_ID}&mobile=${phoneNumber}&authkey=${process.env.MSG_AUTHKEY}`,
      headers: { "Content-Type": "application/json" },
    };

    const request = https.request(options, (response) => {
      let data = [];
      response.on("data", (chunk) => data.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(data).toString();
        try {
          const parsed = JSON.parse(body);
          console.log("MSG91 send response:", parsed);
          return res.status(200).json(parsed);
        } catch (e) {
          return res.status(500).json({ error: "Failed to parse SMS gateway response" });
        }
      });
    });

    request.on("error", (err) => {
      console.error("Error sending SMS:", err);
      res.status(500).json({ error: "SMS sending failed" });
    });

    request.end();
  } catch (error) {
    console.error("Error in /sendSMS:", error);
    res.status(500).json({ error: "Unexpected error" });
  }
});

// Verify OTP
router.post("/verifyOTP", async (req, res) => {
  try {
    const { phoneNumber, code, pushToken, platform } = req.body;
    if (!phoneNumber || !code) return res.status(400).json({ error: "Phone and OTP required" });

    console.log("🔐 Verifying OTP for:", phoneNumber);

    // --- TEST BYPASS ---
    if (["9876543210", "9999999999"].includes(phoneNumber)) {
      let user = await User.findOne({ phone: phoneNumber });
      if (!user) {
        user = await User.create({ phone: phoneNumber, name: "Phone User" });
        await PaymentMethod.create({
          userId: user._id,
          label: "Cash",
          type: "cash",
          balances: { INR: { available: 0, pending: 0 } },
          capabilities: ["send", "receive"],
          isDefaultSend: true,
          isDefaultReceive: true,
          provider: "manual",
          status: "verified",
        });
      }
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "100d" });
      return res.status(200).json({
        new: false,
        responseBody: { "x-auth-token": token },
        id: user._id,
      });
    }

    // --- Verify via MSG91 ---
    const options = {
      method: "GET",
      hostname: "control.msg91.com",
      port: null,
      path: `/api/v5/otp/verify?otp=${code}&mobile=${phoneNumber}`,
      headers: { authkey: process.env.MSG_AUTHKEY },
    };

    const request = https.request(options, (response) => {
      let data = [];
      response.on("data", (chunk) => data.push(chunk));
      response.on("end", async () => {
        const body = Buffer.concat(data).toString();
        const json = JSON.parse(body);
        console.log("MSG91 verify response:", json);

        if (json.type !== "success") {
          return res.status(400).json({ error: "OTP verification failed" });
        }
        if (pushToken) {
          await savePushToken({ userId: user._id, token: pushToken, platform });
        }

        // --- Find or create user ---
        let user = await User.findOne({ phone: phoneNumber });
        let newUser = false;
        if (!user) {
          newUser = true;
          user = await User.create({ phone: phoneNumber, name: "Phone User" });
          await PaymentMethod.create({
            userId: user._id,
            label: "Cash",
            type: "cash",
            balances: { INR: { available: 0, pending: 0 } },
            capabilities: ["send", "receive"],
            isDefaultSend: true,
            isDefaultReceive: true,
            provider: "manual",
            status: "verified",
          });
        }

        // --- Handle push tokens ---
        if (pushToken) {
          const pullQuery = {};
          pullQuery[`pushTokens.${platform}`] = pushToken;
          await User.findByIdAndUpdate(user._id, { $pull: pullQuery });

          const pushQuery = {};
          pushQuery[`pushTokens.${platform}`] = pushToken;
          await User.findByIdAndUpdate(user._id, { $push: pushQuery });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "100d" });
        res.status(200).json({
          new: newUser,
          responseBody: { "x-auth-token": token },
          id: user._id,
        });
      });
    });

    request.on("error", (err) => {
      console.error("Error verifying OTP:", err);
      res.status(500).json({ error: "OTP verification failed" });
    });

    request.end();
  } catch (error) {
    console.error("Error in /verifyOTP:", error);
    res.status(500).json({ error: "Unexpected error" });
  }
});

router.post("/logging", async (req, res) => {
  try {
    console.log("📥 Logging endpoint hit:");
    // console.log("Headers:", req.headers);
    console.log("Body:", req.body);

    // respond so frontend doesn’t hang
    res.json({ success: true, received: req.body });
  } catch (err) {
    console.error("❌ Logging route error:", err);
    res.status(500).json({ error: "Logging failed" });
  }
});


module.exports = router;
