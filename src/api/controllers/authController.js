const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userRepository = require('../../modules/repositories/userRepository');
const { JWT_SECRET } = require('../middleware/auth');
const logger = require('../../utils/logger');

class AuthController {
    async register(req, res) {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password are required' });
            }

            const existingUser = await userRepository.findByUsername(username);
            if (existingUser) {
                return res.status(400).json({ error: 'Username already exists' });
            }

            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(password, salt);

            const user = await userRepository.create({
                username,
                password_hash
            });

            // Don't return the hash
            const { password_hash: hash, ...userSafe } = user;

            logger.info('User registered', { username });
            res.status(201).json({ message: 'User created successfully', user: userSafe });

        } catch (error) {
            logger.error('Registration failed', { error: error.message });
            res.status(500).json({ error: 'Registration failed' });
        }
    }

    async login(req, res) {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password are required' });
            }

            const user = await userRepository.findByUsername(username);
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = jwt.sign(
                { id: user.id, username: user.username },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            logger.info('User logged in', { username });
            res.json({ token, user: { id: user.id, username: user.username } });

        } catch (error) {
            logger.error('Login failed', { error: error.message });
            res.status(500).json({ error: 'Login failed' });
        }
    }

    async getMe(req, res) {
        try {
            // req.user is set by middleware
            const user = await userRepository.findById(req.user.id);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            const { password_hash, ...userSafe } = user;
            res.json({ user: userSafe });
        } catch (error) {
            logger.error('Get me failed', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch user data' });
        }
    }
}

module.exports = new AuthController();
