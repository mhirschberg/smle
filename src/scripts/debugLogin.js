const bcrypt = require('bcryptjs');
const userRepository = require('../modules/repositories/userRepository');
const logger = require('../utils/logger');

async function debugLogin() {
    try {
        const username = 'root';
        const password = 'Sobaka!123';

        console.log(`Debug: Attempting to find user '${username}'...`);
        const user = await userRepository.findByUsername(username);

        if (!user) {
            console.error('Debug: User NOT FOUND in database.');

            // Debug: List all docs in _default collection to see what's there
            const db = await userRepository.getDB();
            const result = await db.query('SELECT * FROM SMLE._default._default LIMIT 5');
            console.log('Debug: Sample docs in default collection:', JSON.stringify(result, null, 2));

            process.exit(1);
        }

        console.log('Debug: User found:', {
            id: user.id,
            username: user.username,
            password_hash: user.password_hash ? 'Present' : 'Missing'
        });

        console.log('Debug: Verifying password...');
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (isMatch) {
            console.log('Debug: Password MATCHES! Login Logic is correct.');
        } else {
            console.error('Debug: Password DOES NOT MATCH.');
            // Test hash generation to see if salt rounds or something differs (unlikely with compare)
            const newHash = await bcrypt.hash(password, 10);
            console.log('Debug: New hash for comparison:', newHash);
        }

        process.exit(0);

    } catch (error) {
        console.error('Debug: Error occurred:', error);
        process.exit(1);
    }
}

debugLogin();
