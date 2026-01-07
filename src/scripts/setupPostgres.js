const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// Override config if specific env vars are set for setup
const connectionString = process.env.POSTGRES_CONNECTION_STRING || process.env.CRATE_CONNECTION_STRING;

if (!connectionString) {
    console.error('ERROR: POSTGRES_CONNECTION_STRING or CRATE_CONNECTION_STRING environment variable is required.');
    process.exit(1);
}

console.log(`Connecting to Postgres: ${connectionString}`);

const pool = new Pool({
    connectionString: connectionString,
});

const tables = [
    'searches', // campaigns
    'search_runs',
    'users',
    'analytics',
    // Platform post tables
    'instagram_posts',
    'tiktok_posts',
    'twitter_posts',
    'reddit_posts',
    'facebook_posts',
    'youtube_posts',
    'linkedin_posts'
];

async function setupPostgres() {
    let client;
    try {
        client = await pool.connect();

        console.log('Connected to Postgres.');

        for (const table of tables) {
            console.log(`Creating table: ${table}...`);

            // Standard Schema: 
            // id (TEXT PRIMARY KEY) - matches Couchbase document ID
            // doc (JSONB) - stores the full document content
            // We can add GIN index on 'doc' for faster JSON querying

            const createTableQuery = `
                CREATE TABLE IF NOT EXISTS ${table} (
                    id TEXT PRIMARY KEY,
                    doc JSONB NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `;

            await client.query(createTableQuery);

            // Add GIN index for JSON B querying
            const indexQuery = `
                CREATE INDEX IF NOT EXISTS idx_${table}_doc ON ${table} USING GIN (doc);
            `;
            await client.query(indexQuery);
        }

        console.log('Tables created successfully.');

        // Setup Admin User
        console.log('Seeding admin user...');
        const adminId = '7cf1fa74-f7b9-42fc-a054-774f9ee55c4a';

        const adminUsername = process.env.ADMIN_USERNAME;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminUsername || !adminPassword) {
            console.error('ERROR: ADMIN_USERNAME and ADMIN_PASSWORD environment variables are required.');
            process.exit(1);
        }

        const adminUser = {
            id: adminId,
            type: 'user',
            username: adminUsername,
            created_at: new Date().toISOString()
        };

        const bcrypt = require('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(adminPassword, salt);
        adminUser.password_hash = hash;

        const upsertUser = `
            INSERT INTO users (id, doc)
            VALUES ($1, $2)
            ON CONFLICT (id) DO UPDATE SET doc = $2
        `;

        await client.query(upsertUser, [adminId, adminUser]);
        console.log(`Admin user seeded (${adminUsername}).`);

        /* 
         * PGVECTOR SETUP (Optional)
         * If the extension exists, enable it.
         */
        try {
            await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
            console.log('pgvector extension enabled.');
        } catch (e) {
            console.log('pgvector extension could not be enabled (perhaps not installed). Skipping vector setup.');
        }

    } catch (err) {
        console.error('Setup failed:', err);
        process.exit(1);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

setupPostgres();
