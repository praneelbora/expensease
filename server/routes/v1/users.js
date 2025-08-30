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
const client = new OAuth2Client(process.env.VITE_GOOGLE_CLIENT_ID);

const JWT_SECRET = process.env.JWT_SECRET;
const PaymentMethod = require("../../models/PaymentMethod");
const PaymentMethodTxn = require("../../models/PaymentMethodTransaction");


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
  const { access_token } = req.body;
  if (!access_token) return res.status(400).json({ error: "Missing access token" });

  try {
    // Exchange code for tokens
    const response = await fetch(
      `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${access_token}`
    );
    const profile = await response.json();
    const { email, name, picture, sub: googleId } = profile;

    let user = await User.findOne({ email });
    let newUser = false;


    if (!user) {
      newUser = true;
      user = await User.create({ email, name, picture, googleId });
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

    // Issue JWT
    const authToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "100d" });

    res.status(200).json({
      responseBody: { "x-auth-token": authToken },
      user: { id: user._id, name: user.name, email: user.email, picture: user.picture },
      newUser,
    });
  } catch (err) {
    console.error("Google login failed:", err);
    res.status(401).json({ error: "Invalid or expired Google code" });
  }
});


router.patch('/profile', auth, async (req, res) => {
  try {
    const {
      name,
      profilePic,
      upiId: rawUpiId,
      vpa: rawVpa,
      defaultCurrency,
      preferredCurrencies,
    } = req.body || {};

    const update = {};

    // --- Basic fields ---
    if (typeof name === 'string') update.name = name.trim();
    if (typeof profilePic === 'string') update.profilePic = profilePic.trim();

    // --- UPI handling ---
    const resolvedUpi = [rawUpiId, rawVpa].find(
      (v) => typeof v === 'string' && v.trim().length
    );
    const upiRegex = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z0-9.\-]{2,}$/;

    if (resolvedUpi !== undefined) {
      const v = String(resolvedUpi).trim();
      if (!upiRegex.test(v)) {
        return res.status(400).json({ error: 'Invalid UPI ID format (e.g., name@bank).' });
      }
      update.upiId = v;
    }

    // --- Currency handling ---
    if (typeof defaultCurrency === 'string') {
      const cur = defaultCurrency.toUpperCase().trim();
      if (!/^[A-Z]{3}$/.test(cur)) {
        return res.status(400).json({ error: 'defaultCurrency must be a 3-letter ISO code (e.g., INR, USD).' });
      }
      update.defaultCurrency = cur;
    }

    if (Array.isArray(preferredCurrencies)) {
      const cleaned = [...new Set(preferredCurrencies.map(c => String(c).toUpperCase().trim()))]
        .filter(c => /^[A-Z]{3}$/.test(c));

      // if (!cleaned.length) {
      //   return res.status(400).json({ error: 'preferredCurrencies must contain valid ISO codes.' });
      // }
      update.preferredCurrencies = cleaned;
    }

    // --- Nothing to update? ---
    if (!Object.keys(update).length) {
      console.log('[PATCH /profile] nothing to update');
      return res.status(200).json({
        message: 'No changes',
        user: await User.findById(req.user.id).lean(),
      });
    }

    // --- Update ---
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
      { new: true, runValidators: true, context: 'query' }
    ).lean();

    if (!user) {
      console.warn('[PATCH /profile] user not found for id', req.user.id);
      return res.status(404).json({ error: 'User not found' });
    }

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
      },
    });
  } catch (err) {
    console.error('/profile PATCH error:', err);
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
  const { email } = req.body;
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


    const authToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "100d" });

    res.status(200).json({
      responseBody: { "x-auth-token": authToken },
      user: { id: user._id, name: user.name, email: user.email, picture: user.picture },
      newUser,
    });
  } catch (err) {
    console.error("Google login failed:", err);
    res.status(401).json({ error: "Invalid or expired Google code" });
  }
});
module.exports = router;
