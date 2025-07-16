const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../../middleware/auth');

// Register
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        console.log(password);

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.log('users/register error: ', error);
        res.status(400).json({ error: error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    console.log(email, password);
    try {
        const user = await User.findOne({ email });
        if (!user) {
            console.log('User not found');
            return res.status(404).json({ error: 'User not found' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log('Invalid credentials');
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        console.log(isMatch);
        
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
         const responseBody = {
            "x-auth-token": token, // Include the token
        };
        return res.status(200).send({ responseBody, user: { id: user._id, name: user.name, email: user.email } });

        // const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        // const responseBody = {
        //     "x-auth-token": token, // Include the token
        // };
        // res.status(200).send({ new: user.isNew, responseBody });


    } catch (error) {
        console.log((error));

        return res.status(500).json({ error: error.message });
    }
});

router.get('/', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        return res.status(200).json(user);
    } catch (error) {
        console.log((error));
        return res.status(500).json({ error: error.message });
    }
});

router.get('/ping', async (req, res) => {
    try {
        console.log('ping');
        res.status(200).send('🚀 Server is running!');
    } catch (error) {
        console.log('ping/ error: ', error);

        res.status(500).json({ error: error.message });
    }
});


module.exports = router;
