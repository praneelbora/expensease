const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const auth = require('../../middleware/auth');
const DefaultCategories = require('../../assets/Categories').default;
const { sendLoginLinkEmail } = require('./email');

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
        const user = await User.findById(req.user.id); // assume middleware added `req.user`
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        if (!user.customCategories || user.customCategories.length === 0) {
            return res.json(DefaultCategories);
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

module.exports = router;
