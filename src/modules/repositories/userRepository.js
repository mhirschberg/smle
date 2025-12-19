const { v4: uuidv4 } = require('uuid');
const dbFactory = require('../storage/dbFactory');
const logger = require('../../utils/logger');
const config = require('../../config');

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

        // Standard upsert works for both (Couchbase upsert, Crate upsert via adapter)
        await db.upsert('users', id, user);
        return user;
    }

    async findByUsername(username) {
        const db = await this.getDB();
        const dbType = require('../../config').db.type.toLowerCase();
        let query;
        let params;

        // Dialect switching
        if (dbType === 'postgres' || dbType === 'cratedb') {
            const table = dbType === 'postgres' ? 'users' : 'doc.users';
            // Use JSONB operator for Postgres / Object mapping for Crate
            if (dbType === 'postgres') {
                query = `SELECT doc FROM ${table} WHERE doc->>'username' = $1 LIMIT 1`;
            } else {
                query = `SELECT doc FROM ${table} WHERE doc['username'] = $1 LIMIT 1`;
            }
            params = [username];
        } else {
            // N1QL for Couchbase
            query = `
                SELECT u.*
                FROM SMLE._default.users u
                WHERE u.type = 'user' AND u.username = $username
                LIMIT 1
            `;
            params = { username };
        }

        const result = await db.query(query, { parameters: params });

        if (dbType === 'postgres' || dbType === 'cratedb') {
            return result[0]?.doc || null;
        } else {
            return result[0]?.u || result[0] || null;
        }
    }

    async findById(id) {
        const db = await this.getDB();
        return await db.get('users', id);
    }
}

module.exports = new UserRepository();
