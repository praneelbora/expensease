// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User')

module.exports = async function (req, res, next) {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        const userExists = await User.findById(req.user.id);
        if (!userExists) {
            return res.status(401).json({ message: 'User not found. Please log in again.' });
        }
        next();
    } catch (error) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};

