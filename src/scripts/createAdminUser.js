const bcrypt = require('bcryptjs');
const userRepository = require('../modules/repositories/userRepository');
const logger = require('../utils/logger');

async function createAdmin() {
    try {
        const username = 'root';
        const password = 'Sobaka!123';

        logger.info('Creating admin user...');

        // Check if exists
        const existing = await userRepository.findByUsername(username);
        if (existing) {
            logger.warn('User root already exists. Updating password...');
            // In a real app we might update, but for now let's just create a new one or error
            // Actually, let's update the password for convenience
            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(password, salt);

            existing.password_hash = password_hash;
            existing.updated_at = new Date().toISOString();

            const db = await userRepository.getDB();
            await db.upsert('users', existing.id, existing);
            logger.info('Admin user updated successfully');
            process.exit(0);
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        await userRepository.create({
            username,
            password_hash
        });

        logger.info('Admin user created successfully');
        process.exit(0);

    } catch (error) {
        logger.error('Failed to create admin', { error: error.message });
        process.exit(1);
    }
}

createAdmin();
