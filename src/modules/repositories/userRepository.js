const { v4: uuidv4 } = require('uuid');
const dbFactory = require('../storage/dbFactory');
const logger = require('../../utils/logger');

class UserRepository {
    async getDB() {
        return await dbFactory.getDB();
    }

    async create(userData) {
        const db = await this.getDB();
        const id = uuidv4();
        const now = new Date().toISOString();

        const user = {
            id,
            type: 'user',
            username: userData.username,
            password_hash: userData.password_hash,
            email: userData.email || null,
            created_at: now,
            updated_at: now
        };

        await db.upsert('users', id, user);
        return user;
    }

    async findByUsername(username) {
        const db = await this.getDB();
        const query = `
            SELECT u.*
            FROM SMLE._default._default u
            WHERE u.type = 'user' AND u.username = $username
            LIMIT 1
        `;

        const result = await db.query(query, { parameters: { username } });
        return result[0]?.u || result[0] || null;
    }

    async findById(id) {
        const db = await this.getDB();
        return await db.get('users', id);
    }
}

module.exports = new UserRepository();
