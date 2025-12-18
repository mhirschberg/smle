const jwt = require('jsonwebtoken');
const config = require('../../config');
const logger = require('../../utils/logger');

// Use a secure secret in production. For dev, fallback is provided but warn.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-prod';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            logger.warn('Token verification failed', { error: err.message });
            return res.status(403).json({ error: 'Invalid or expired token' });
        }

        req.user = user;
        next();
    });
};

module.exports = { authenticateToken, JWT_SECRET };
