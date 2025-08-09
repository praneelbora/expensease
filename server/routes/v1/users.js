const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const auth = require('../../middleware/auth');
const DefaultCategories = require('../../assets/Categories').default;
const { sendLoginLinkEmail } = require('./email');
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET;

router.post('/login', async (req, res) => {
    const { email, name } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        let user = await User.findOne({ email });

        if (!user && name) {
            // ✅ Create user if not found and name is provided
            user = await User.create({ email, name });
        }

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const token = jwt.sign({ id: user._id, type: 'login' }, JWT_SECRET, { expiresIn: '10m' });

        await sendLoginLinkEmail(user.email, token, user.name);

        res.json({ message: 'Login link sent to email!' });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Something went wrong' });
    }
});

// ✅ Verify Login Link
router.get('/login', async (req, res) => {
    const { token } = req.query;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.type !== 'login') throw new Error('Invalid token type');

        const user = await User.findById(decoded.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const authToken = jwt.sign({ id: user._id }, JWT_SECRET);

        res.json({
            responseBody: { "x-auth-token": authToken },
            user: { id: user._id, name: user.name, email: user.email },
        });
    } catch (err) {
        console.error('login verify link error:', err);
        res.status(400).json({ error: 'Invalid or expired login link' });
    }
});

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
    const { credential } = req.body;

    if (!credential) {
        return res.status(400).json({ error: "Missing Google ID token" });
    }

    try {
        // 1. Verify Google Token
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const { email, name, picture, sub: googleId } = payload;
        console.log(payload);

        // 2. Find or Create User
        let user = await User.findOne({ email });
        if (!user) {
            user = await User.create({ email, name, picture, googleId });
        }

        // 3. Issue your JWT
        const authToken = jwt.sign({ id: user._id }, JWT_SECRET, {
            expiresIn: "7d",
        });

        // 4. Respond with token and user info
        res.status(200).json({
            responseBody: { "x-auth-token": authToken },
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                picture: user.picture,
            },
        });
    } catch (err) {
        console.error("Google login failed:", err);
        res.status(401).json({ error: "Invalid or expired Google token" });
    }
});

router.patch('/profile', auth, async (req, res) => {
  try {
    const {
      name,
      profilePic,
      upiId: rawUpiId,
      vpa: rawVpa,
    } = req.body || {};

    const update = {};

    // Basic fields
    if (typeof name === 'string') update.name = name.trim();
    if (typeof profilePic === 'string') update.profilePic = profilePic.trim();

    // Resolve primary UPI from multiple possible keys
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


    if (!Object.keys(update).length) {
      console.log('[PATCH /profile] nothing to update');
      return res.status(200).json({ message: 'No changes', user: await User.findById(req.user.id).lean() });
    }

    // Use $set + runValidators for safety. Remove .lean() to ensure getters/virtuals if needed.
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
        upiids: user.upiids || [],
        customCategories: user.customCategories || [],
      },
    });
  } catch (err) {
    console.error('/profile PATCH error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});


module.exports = router;
